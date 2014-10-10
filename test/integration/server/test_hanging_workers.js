
'use strict';

var path = require('path');

var expect = require('thehelp-test').expect;
var supertest = require('supertest');
var util = require('./util');

describe('hanging workers', function() {
  var agent, child;

  before(function(done) {
    agent = supertest.agent('http://localhost:3000');

    child = util.startProcess(path.join(__dirname, '../../scenarios/hanging_workers.js'));
    setTimeout(done, 1000);
  });

  it('is running', function(done) {
    agent
      .get('/')
      .expect('success')
      .expect(200, done);
  });

  it('updates Graceful timeout, sends SIGINT to unresponsive workers', function(done) {
    this.timeout(10000);

    child.on('close', function() {
      expect(child).to.have.property('stdoutResult');

      var stdout = child.stdoutResult;

      expect(stdout).to.match(/SIGINT/);
      expect(stdout).to.match(/Master passed all checks/);

      done();
    });

    child.kill();
  });
});

