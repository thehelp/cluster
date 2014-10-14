
'use strict';

var fs = require('fs');
var path = require('path');

var supertest = require('supertest');
var expect = require('thehelp-test').expect;
var util = require('./util');
var Pool = require('agentkeepalive');
var serverUtil = require('../../../src/server/util');

describe('end-to-end', function() {
  var agent, child, logFiles, pool;

  before(function(done) {
    // https://github.com/node-modules/agentkeepalive#new-agentoptions
    pool = new Pool({
      keepAliveMsecs: 10000
    });

    agent = supertest.agent('http://localhost:3000');

    util.emptyDir(util.logsDir, function(err) {
      if (err) {
        throw err;
      }

      child = util.startProcess(
        path.join(__dirname, '../../scenarios/end_to_end_cluster.js'));

      setTimeout(done, 1000);
    });
  });

  after(function(done) {
    this.timeout(10000);

    child.on('close', function() {
      done();
    });

    child.kill();
  });

  it('creates two log files on startup', function(done) {
    fs.readdir(util.logsDir, function(err, files) {
      if (err) {
        throw err;
      }

      expect(files).to.have.length(2);

      files = files.sort();
      expect(files).to.have.deep.property('0').that.match(/master/);
      expect(files).to.have.deep.property('1').that.match(/worker/);

      logFiles = files;

      done();
    });
  });

  it('root returns', function(done) {
    agent
      .get('/')
      .agent(pool)
      .expect('X-Worker', '1')
      .expect('Connection', 'keep-alive')
      .expect(200, done);
  });

  it('on async error, gets response with \'close connection\' header', function(done) {
    agent
      .get('/error')
      .agent(pool)
      .expect('Connection', 'close')
      .expect('Content-Type', /text\/plain/)
      .expect('X-Worker', '1')
      .expect(/^error\!/)
      .expect(500, done);
  });

  it('starts up another node', function(done) {
    this.timeout(5000);

    agent
      .get('/')
      .agent(pool)
      .expect('X-Worker', '2')
      .expect('Connection', 'keep-alive')
      .expect(200, done);
  });

  it('three log files now in directory', function(done) {
    fs.readdir(util.logsDir, function(err, files) {
      if (err) {
        throw err;
      }

      expect(files).to.have.length(3);

      files = files.sort();
      expect(files).to.have.deep.property('0', logFiles[0]);
      expect(files).to.have.deep.property('1', logFiles[1]);
      expect(files).to.have.deep.property('2').that.match(/worker/);

      logFiles = files;

      done();
    });
  });

  it('async error only takes down process after long task is complete', function(done) {
    this.timeout(5000);

    done = serverUtil.once(done);
    var delayComplete = false;

    var second = new Pool({
      keepAliveMsecs: 10000
    });

    // long-running task still gets connection:close, even though error comes after
    agent
      .get('/longDelay')
      .agent(second)
      .expect('X-Worker', '2')
      .expect('Connection', 'close') // relies on patchResMethods = true
      .expect(200, function(err) {
        if (err) {
          err.message += ' - /longDelay request';
          console.log(err);
          return done(err);
        }
      });

    // long-running task still gets connection:close, even though error comes after
    agent
      .get('/delay')
      .agent(second)
      .expect('X-Worker', '2')
      .expect('Connection', 'close') // relies on patchResMethods = true
      .expect(200, function(err) {
        if (err) {
          err.message += ' - /delay request';
          console.log(err);
          return done(err);
        }

        delayComplete = true;

        // we use the same pool as
        setImmediate(function() {
          agent
            .get('/')
            .agent(second)
            .expect('X-Worker', '3')
            .expect('Connection', 'keep-alive')
            .expect(200, function(err) {
              if (err) {
                err.message += ' - / request, on second pool';
                console.log(err);
                return done(err);
              }
            });
        });
      });

    agent
      .get('/error')
      .expect('Connection', 'close')
      .expect('X-Worker', '2')
      .expect(500, function(err) {
        if (err) {
          err.message += ' - /error request';
          console.log(err);
          return done(err);
        }

        expect(delayComplete).to.equal(false);

        // this request sneaks in on an idle keepalive connection
        agent
          .get('/')
          .agent(pool)

          // this result can change based on options passed to GracefulExpress:
          // (two other tests cover these situations, this is just for easy reference)

          // closeSockets = false / rejectDuringShutdown = false
          // risky! requests leak through, might be cut off in the middle at process.exit
          // .expect('X-Worker', '2')
          // .expect('Connection', 'close')
          // .expect('success')
          // .expect(200, function(err) {

          // closeSockets = false / rejectDuringShutdown = true
          // not too pretty! requests leak through, but are rejected with a 503
          // .expect('X-Worker', '2')
          // .expect('Connection', 'close')
          // .expect('Please try again later; this server is shutting down')
          // .expect(503, function(err) {

          // [default] closeSockets = true
          // track sockets and close them manually when the server shuts down
          .expect('X-Worker', '3')
          .expect('Connection', 'keep-alive')
          .expect(200, function(err) {
            if (err) {
              err.message += ' - / keepalive request to worker 3';
              console.log(err);
              return done(err);
            }

            // this will only be true if closeSockets = true
            expect(delayComplete).to.equal(true);
          });

        // this is a new client, should definitely hit the new worker
        agent
          .get('/')
          .expect('X-Worker', '3')
          .expect(200, function(err) {
            if (err) {
              err.message += ' - / new request on worker 3';
              console.log(err);
              return done(err);
            }

            expect(delayComplete).to.equal(true);

            done();
          });
      });
  });

  it('four total log files', function(done) {
    fs.readdir(util.logsDir, function(err, files) {
      if (err) {
        throw err;
      }

      expect(files).to.have.length(4);

      files = files.sort();
      expect(files).to.have.deep.property('0', logFiles[0]);
      expect(files).to.have.deep.property('1', logFiles[1]);
      expect(files).to.have.deep.property('2', logFiles[2]);
      expect(files).to.have.deep.property('3').that.match(/worker/);

      done();
    });
  });

  it('sets connection:close even if endpoint uses res.writeHead', function(done) {
    this.timeout(5000);

    done = serverUtil.once(done);

    agent
      .get('/delayWriteHead')
      .expect('X-Worker', '3')
      .expect('Connection', 'close') // relies on patchResMethods = true
      .expect(200, function(err) {
        if (err) {
          err.message += ' - /delay request';
          console.log(err);
          return done(err);
        }

        done();
      });

    agent
      .get('/error')
      .expect('Connection', 'close')
      .expect('X-Worker', '3')
      .expect(500, function(err) {
        if (err) {
          err.message += ' - /error request';
          console.log(err);
          return done(err);
        }
      });
  });

  it('sets connection:close even if endpoint uses res.write', function(done) {
    this.timeout(5000);

    done = serverUtil.once(done);

    agent
      .get('/delayWrite')
      .expect('X-Worker', '4')
      .expect('Connection', 'close') // relies on patchResMethods = true
      .expect(200, function(err) {
        if (err) {
          err.message += ' - /delay request';
          console.log(err);
          return done(err);
        }

        done();
      });

    agent
      .get('/error')
      .expect('Connection', 'close')
      .expect('X-Worker', '4')
      .expect(500, function(err) {
        if (err) {
          err.message += ' - /error request';
          console.log(err);
          return done(err);
        }
      });
  });

});
