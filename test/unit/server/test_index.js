
'use strict';

var test = require('thehelp-test');
var expect = test.expect;
var index = require('../../../src/server');

describe('thehelp-cluster', function() {

  it('returns a function as the top-level object', function() {
    expect(index).to.be.a('function');
  });

  it('exposes all the right sub-keys', function() {
    expect(Object.keys(index)).to.have.length(8);

    expect(index).to.have.property('Startup').that.is.a('function');
    expect(index).to.have.property('Master').that.is.a('function');
    expect(index).to.have.property('Graceful').that.is.a('function');
    expect(index).to.have.property('GracefulExpress').that.is.a('function');

    expect(index).to.have.property('logsDir').that.is.a('string');
    expect(index).to.have.property('setupLogs').that.is.a('function');
    expect(index).to.have.property('getLogFilename').that.is.a('function');
    expect(index).to.have.property('_timestampForPath').that.is.a('function');
  });

});

