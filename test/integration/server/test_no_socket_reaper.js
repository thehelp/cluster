
'use strict';

var path = require('path');
var http = require('http');

var core = require('thehelp-core');
var supertest = require('supertest');
var expect = require('thehelp-test').expect;
var util = require('./util');
var serverUtil = require('../../../src/server/util');

var logShim = require('thehelp-log-shim');
var logger = logShim('no-close-sockets:test');


describe('socket reaper not started', function() {
  var agent, child, pool;

  before(function(done) {
    pool = new http.Agent({
      keepAlive: true
    });

    agent = supertest.agent('http://localhost:3000');

    child = util.startProcess(
      path.join(__dirname, '../../scenarios/no_socket_reaper.js'));

    setTimeout(done, 1000);
  });

  it('socket not closed, so keepalive gets 503', function(done) {
    this.timeout(10000);

    done = serverUtil.once(done);

    // this doesn't get connection:close because it wrote the headers before the error
    agent
      .get('/writeHeadAndDelay')
      .agent(pool)
      .expect('X-Worker', '1')
      .expect('Connection', 'keep-alive')
      .expect(200, function(err) {
        if (err) {
          err.message += ' - /delay request';
          logger.error(core.breadcrumbs.toString(err));
          return done(err);
        }

        setTimeout(function() {
          agent
            .get('/')
            .agent(pool)
            .expect('X-Worker', '1')
            .expect('Connection', 'close')
            .expect('Please try again later; this server is shutting down')
            .expect(503, function(err) {
              if (err) {
                err.message += ' - / keepalive request to worker 3';
                logger.error(core.breadcrumbs.toString(err));
                return done(err);
              }

              done();
            });
        });
      });

    agent
      .get('/error')
      .expect('Connection', 'close')
      .expect('X-Worker', '1')
      .expect(500, function(err) {
        if (err) {
          err.message += ' - /error request';
          logger.error(core.breadcrumbs.toString(err));
          return done(err);
        }
      });
  });

  it('server does not accept a new connection after crash', function(done) {
    this.timeout(5000);

    agent
      .get('/')
      .expect(200, function(err) {
        expect(err).to.have.property('code', 'ECONNREFUSED');
        setTimeout(done, 3000);
      });
  });

  it('second worker starts up, starts keepalive connection', function(done) {
    this.timeout(10000);

    agent
      .get('/')
      .agent(pool)
      .expect('X-Worker', '2')
      .expect('Connection', 'keep-alive')
      .expect(200, done);
  });

  it('socket not closed, keepalive keeps server from going down', function(done) {
    this.timeout(10000);

    // we don't make a request on the keepalive connection via .agent(pool), so that
    //   keepalive connection is just hanging around...

    var orig = done;
    done = function() {
      child.on('close', function() {
        expect(child.result).to.match(/Killing process now/);

        orig();
      });

      child.kill();
    };

    agent
      .get('/writeHeadAndDelay')
      .agent(pool)
      .expect('X-Worker', '2')
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
      .expect('X-Worker', '2')
      .expect(500, function(err) {
        if (err) {
          err.message += ' - /error request';
          logger.error(core.breadcrumbs.toString(err));
        }
      });
  });

});

