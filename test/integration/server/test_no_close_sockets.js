
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


describe('keepalive sockets not closed', function() {
  var agent, child, pool;

  before(function(done) {
    this.timeout(5000);

    pool = new http.Agent({
      keepAlive: true
    });

    agent = supertest.agent('http://localhost:3000');

    child = util.startProcess(
      path.join(__dirname, '../../scenarios/no_close_sockets.js'));

    setTimeout(done, 2000);
  });

  it('root returns', function(done) {
    agent
      .get('/')
      .agent(pool)
      .expect('X-Worker', '1')
      .expect('Connection', 'keep-alive')
      .expect(200, done);
  });

  it('socket not closed, so keepalive gets 503', function(done) {
    this.timeout(5000);

    // long-running task still gets connection:close, even though error comes after
    agent
      .get('/delay')
      .expect('X-Worker', '1')
      .expect('Connection', 'close')
      .expect(200, function(err) {
        if (err) {
          err.message += ' - /delay request';
          logger.error(core.breadcrumbs.toString(err));
        }

        done();
      });

    agent
      .get('/error')
      .expect('Connection', 'close')
      .expect('X-Worker', '1')
      .expect(500, function(err) {
        if (err) {
          err.message += ' - /error request';
          logger.error(core.breadcrumbs.toString(err));
          return;
        }

        // this request sneaks in on a keepalive connection
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
            }
          });
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
    done = serverUtil.once(function() {
      child.on('close', function() {
        expect(child.result).to.match(/Killing process now/);

        orig();
      });

      child.kill();
    });

    // long-running task still gets connection:close, even though error comes after
    agent
      .get('/delay')
      .expect('X-Worker', '2')
      .expect('Connection', 'close')
      .expect(200, function(err) {
        if (err) {
          err.message += ' - /delay request';
          logger.error(core.breadcrumbs.toString(err));
          done(err);
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

