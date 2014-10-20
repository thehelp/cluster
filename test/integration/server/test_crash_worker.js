
'use strict';

var path = require('path');

var expect = require('thehelp-test').expect;
var supertest = require('supertest');
var util = require('./util');

describe('top-level crash in worker', function() {
  var agent, child;

  before(function(done) {
    agent = supertest.agent('http://localhost:3000');

    child = util.startProcess(path.join(__dirname, '../../scenarios/crash_worker.js'));
    setTimeout(done, 1000);
  });

  it('logs out top-level exception, calls last-ditch, graceful shutdown', function(done) {
    this.timeout(10000);

    child.on('close', function() {
      expect(child).to.have.property('result');

      expect(child.result).to.match(/LastDitch: crash/);
      expect(child.result).to.match(/Worker #1 top-level domain error/);
      expect(child.result).to.match(/Worker #2 top-level domain error/);

      expect(child.result).to.match(/died after less than spin timeout/);
      expect(child.result).to.match(/No workers currently running!/);

      expect(child.result).to.match(/All workers gone./);

      done();
    });

    setTimeout(function() {
      child.kill();
    }, 2000);
  });
});

