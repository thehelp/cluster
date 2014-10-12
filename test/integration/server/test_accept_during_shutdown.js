
'use strict';

var path = require('path');

var supertest = require('supertest');
var expect = require('thehelp-test').expect;
var util = require('./util');
var Pool = require('agentkeepalive');
var serverUtil = require('../../../src/server/util');

describe('rejectDuringShutdown = false', function() {
  var agent, child, pool;

  before(function(done) {
    // https://github.com/node-modules/agentkeepalive#new-agentoptions
    pool = new Pool({
      keepAliveMsecs: 10000
    });

    agent = supertest.agent('http://localhost:3000');

    child = util.startProcess(
      path.join(__dirname, '../../scenarios/accept_during_shutdown.js'));

    setTimeout(done, 1000);
  });

  after(function(done) {
    this.timeout(10000);

    child.on('close', function() {
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

  it('keepalive connection gets 200 on previous worker in shutdown mode', function(done) {
    this.timeout(5000);

    done = serverUtil.once(done);
    var delayComplete = false;

    // long-running task still gets connection:close, even though error comes after
    agent
      .get('/delay')
      .expect('X-Worker', '1')
      .expect('Connection', 'Connection: close')
      .expect(200, function(err) {
        if (err) {
          err.message += ' - /delay request';
          console.log(err);
          return done(err);
        }

        delayComplete = true;
      });

    agent
      .get('/error')
      .expect('Connection', 'Connection: close')
      .expect('X-Worker', '1')
      .expect(500, function(err) {
        if (err) {
          err.message += ' - /error request';
          console.log(err);
          return done(err);
        }

        expect(delayComplete).to.equal(false);

        // this request sneaks in on a keepalive connection
        agent
          .get('/')
          .agent(pool)
          .expect('X-Worker', '1')
          .expect('Connection', 'Connection: close')
          .expect('success')
          .expect(200, function(err) {
            if (err) {
              err.message += ' - / keepalive request to worker 3';
              console.log(err);
              return done(err);
            }

            done();
          });
      });
  });

});

