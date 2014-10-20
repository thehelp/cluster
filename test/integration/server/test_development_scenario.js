
'use strict';

var path = require('path');

var expect = require('thehelp-test').expect;
var util = require('./util');


describe('development scenarios: in-process testing', function() {
  var child, start, finish;

  before(function(done) {
    start = new Date();
    child = util.startProcess(
      path.join(__dirname, '../../scenarios/development_scenario.js'));

    child.on('close', function() {
      finish = new Date();

      done();
    });
  });

  it('does not shut down gracefully', function() {
    expect(child.result).to.contain('logger.info(result.toString());')

    expect(child.result).not.to.match(/gracefully shutting down/);
    expect(child.result).not.to.match(/pre-exit/);
  });

});
