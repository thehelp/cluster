
'use strict';

var path = require('path');

var supertest = require('supertest');
var util = require('./util');
var Pool = require('agentkeepalive');
var serverUtil = require('../../../src/server/util');

describe('patchResMethods = false', function() {
  var agent, child;

  before(function(done) {
    agent = supertest.agent('http://localhost:3000');

    child = util.startProcess(
      path.join(__dirname, '../../scenarios/no_patch.js'));

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
      .expect('X-Worker', '1')
      .expect('Connection', 'keep-alive')
      .expect(200, done);
  });

  it('keepalive connection gets 200 on previous worker in shutdown mode', function(done) {
    this.timeout(5000);

    done = serverUtil.once(done);

    // long-running task does NOT get connection:close, since res.end was not patched
    agent
      .get('/delay')
      .expect('X-Worker', '1')
      .expect('Connection', 'close')
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
      .expect('Connection', 'Connection: close')
      .expect('X-Worker', '1')
      .expect(500, function(err) {
        if (err) {
          err.message += ' - /error request';
          console.log(err);
          return done(err);
        }
      });
  });

});

