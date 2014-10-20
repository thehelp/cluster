
'use strict';

var path = require('path');

var expect = require('thehelp-test').expect;
var supertest = require('supertest');
var util = require('./util');

describe('top-level crash in master', function() {
  var agent, child;

  before(function(done) {
    agent = supertest.agent('http://localhost:3000');

    child = util.startProcess(path.join(__dirname, '../../scenarios/crash_master.js'));
    setTimeout(done, 1000);
  });

  it('logs out top-level exception, calls last-ditch, graceful shutdown', function(done) {
    this.timeout(10000);

    child.on('close', function() {
      expect(child).to.have.property('result');

      expect(child.result).to.match(/All workers gone./);

      expect(child.result).to.match(/Master top-level domain error/);
      expect(child.result).to.match(/LastDitch: crash/);

      done();
    });
  });
});

