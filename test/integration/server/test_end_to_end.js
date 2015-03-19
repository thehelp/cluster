
'use strict';

var path = require('path');
var http = require('http');

var core = require('thehelp-core');
var supertest = require('supertest');
var expect = require('thehelp-test').expect;
var util = require('./util');
var serverUtil = require('../../../src/server/util');

var logShim = require('thehelp-log-shim');
var logger = logShim('end-to-end:test');

var WORKER_STARTUP = 750; // milliseconds


describe('end-to-end', function() {
  var agent, child, pool;

  before(function(done) {
    pool = new http.Agent({
      keepAlive: true
    });

    agent = supertest.agent('http://localhost:3000');

    child = util.startProcess(
      path.join(__dirname, '../../scenarios/end_to_end_cluster.js'));

    setTimeout(done, 1000);
  });

  after(function(done) {
    this.timeout(10000);

    child.on('close', function() {
      expect(child.result).not.to.match(/Killing process now/);

      done();
    });

    child.kill();
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

  it('server does not accept a new connection after crash', function(done) {
    this.timeout(5000);

    agent
      .get('/')
      .expect(200, function(err) {
        expect(err).to.have.property('code', 'ECONNREFUSED');
        setTimeout(done, WORKER_STARTUP);
      });
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

  it('async error only takes down process after long task is complete', function(done) {
    this.timeout(5000);

    done = serverUtil.once(done);
    var delayComplete = false;

    var secondPool = new http.Agent({
      keepAlive: true
    });
    var thirdPool = new http.Agent({
      keepAlive: true
    });

    // long-running task still gets connection:close, even though error comes after
    // relies on GracefulExpress._closeConnAfterResponses
    agent
      .get('/longDelay')
      .agent(secondPool)
      .expect('X-Worker', '2')
      .expect('Connection', 'close') // relies on patchResMethods = true
      .expect(200, function(err) {
        if (err) {
          err.message += ' - /longDelay request';
          logger.error(core.breadcrumbs.toString(err));
          return done(err);
        }

        expect(delayComplete).to.equal(true);

        setTimeout(done, WORKER_STARTUP);
      });

    // long-running task still gets connection:close, even though error comes after
    // relies on GracefulExpress._closeConnAfterResponses
    agent
      .get('/delay')
      .agent(secondPool)
      .expect('X-Worker', '2')
      .expect('Connection', 'close') // relies on patchResMethods = true
      .expect(200, function(err) {
        if (err) {
          err.message += ' - /delay request';
          logger.error(core.breadcrumbs.toString(err));
          return done(err);
        }

        delayComplete = true;

        // we use the same pool as above
        setImmediate(function() {
          agent
            .get('/')
            .agent(secondPool)
            .expect('X-Worker', '3')
            .expect('Connection', 'keep-alive')
            .expect(200, function(err) {
              expect(err).to.have.property('code', 'ECONNREFUSED');
            });
        });
      });

    agent
      .get('/error')
      .agent(thirdPool)
      .expect('Connection', 'close')
      .expect('X-Worker', '2')
      .expect(500, function(err) {
        if (err) {
          err.message += ' - /error request';
          logger.error(core.breadcrumbs.toString(err));
        }

        // we don't want this request to sneak in on an idle keepalive connection
        // this relies on GracefulExpress._closeInactiveSockets
        agent
          .get('/')
          .agent(pool)
          .expect(200, function(err) {
            expect(err).to.have.property('code', 'ECONNREFUSED');
          });

        // this is a new socket, request should definitely fail
        agent
          .get('/')
          .expect(200, function(err) {
            expect(err).to.have.property('code', 'ECONNREFUSED');
          });
      });
  });

  it('sets connection:close even if endpoint uses res.writeHead', function(done) {
    this.timeout(5000);

    done = serverUtil.once(done);

    // relies on GracefulExpress._closeConnAfterResponses
    agent
      .get('/delayWriteHead')
      .expect('X-Worker', '3')
      .expect('Connection', 'close')
      .expect(200, function(err) {
        if (err) {
          err.message += ' - /delay request';
          logger.error(core.breadcrumbs.toString(err));
          return done(err);
        }

        setTimeout(done, WORKER_STARTUP);
      });

    agent
      .get('/error')
      .expect('Connection', 'close')
      .expect('X-Worker', '3')
      .expect(500, function(err) {
        if (err) {
          err.message += ' - /error request';
          logger.error(core.breadcrumbs.toString(err));
          return done(err);
        }
      });
  });

  it('sets connection:close even if endpoint uses res.write', function(done) {
    this.timeout(5000);

    done = serverUtil.once(done);

    // relies on GracefulExpress._closeConnAfterResponses
    agent
      .get('/delayWrite')
      .expect('X-Worker', '4')
      .expect('Connection', 'close')
      .expect(200, function(err) {
        if (err) {
          err.message += ' - /delay request';
          logger.error(core.breadcrumbs.toString(err));
          return done(err);
        }

        setTimeout(done, WORKER_STARTUP);
      });

    agent
      .get('/error')
      .expect('Connection', 'close')
      .expect('X-Worker', '4')
      .expect(500, function(err) {
        if (err) {
          err.message += ' - /error request';
          logger.error(core.breadcrumbs.toString(err));
          return done(err);
        }
      });
  });

  it('in-progress request gets keepalive, socket is reaped', function(done) {
    this.timeout(10000);

    done = serverUtil.once(done);

    // results in a keepalive because headers are written before the error happens
    // then we don't make another request on the socket, so it sticks around
    agent
      .get('/writeHeadAndDelay')
      .agent(pool)
      .expect('X-Worker', '5')
      .expect('Connection', 'keep-alive')
      .expect(200, function(err) {
        if (err) {
          err.message += ' - /delay request';
          logger.error(core.breadcrumbs.toString(err));
          return done(err);
        }

        done();
      });

    agent
      .get('/error')
      .expect('Connection', 'close')
      .expect('X-Worker', '5')
      .expect(500, function(err) {
        if (err) {
          err.message += ' - /error request';
          logger.error(core.breadcrumbs.toString(err));
          return done(err);
        }
      });
  });

});
