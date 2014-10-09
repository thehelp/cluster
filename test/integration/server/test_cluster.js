
'use strict';

var fs = require('fs');
var path = require('path');

var supertest = require('supertest');
var expect = require('thehelp-test').expect;
var util = require('./util');

describe('thehelp-cluster', function() {
  var agent, child;

  before(function(done) {
    agent = supertest.agent('http://localhost:3000');

    util.emptyDir(util.logsDir, function(err) {
      if (err) {
        throw err;
      }

      child = util.startProcess(path.join(__dirname, '../../../test/start_cluster.js'));
      setTimeout(done, 1000);
    });
  });

  after(function(done) {
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

      done();
    });
  });

  it('root returns', function(done) {
    agent
      .get('/')
      .expect('X-Worker', '1')
      .expect(200, done);
  });

  it('on async error, gets response with \'close connection\' header', function(done) {
    agent
      .get('/error')
      .expect('Connection', 'Connection: close')
      .expect('Content-Type', /text\/plain/)
      .expect('X-Worker', '1')
      .expect(/^error\!/)
      .expect(500, done);
  });

  it('starts up another node', function(done) {
    this.timeout(5000);

    agent
      .get('/')
      .expect('X-Worker', '2')
      .expect(200, done);
  });

  it('three log files now in directory', function(done) {
    fs.readdir(util.logsDir, function(err, files) {
      if (err) {
        throw err;
      }

      expect(files).to.have.length(3);

      done();
    });
  });

  it('async error only takes down process after long task is complete', function(done) {
    this.timeout(5000);

    var delayComplete = false;

    agent
      .get('/delay')
      .expect('X-Worker', '2')
      .expect(200, function(err) {
        if (err) {
          throw err;
        }

        delayComplete = true;
      });

    agent
      .get('/error')
      .expect('Connection', 'Connection: close')
      .expect('X-Worker', '2')
      .expect(500, function(err) {
        if (err) {
          throw err;
        }

        expect(delayComplete).to.equal(false);

        // this request should hang until the next process comes up
        agent
          .get('/')
          .expect('X-Worker', '3')
          .expect(200, function(err) {
            if (err) {
              throw err;
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

      done();
    });
  });

});

