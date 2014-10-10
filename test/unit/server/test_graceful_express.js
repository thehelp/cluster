
'use strict';

var test = require('thehelp-test');
var expect = test.expect;
var sinon = test.sinon;

var GracefulExpress = require('../../../src/server/graceful_express');

describe('GracefulExpress', function() {
  var graceful;

  beforeEach(function() {
    graceful = new GracefulExpress();
  });

  describe('constructor', function() {
    it('sets right defaults', function() {
      expect(graceful).to.have.property('server', null);
      expect(graceful).to.have.property('closed', false);
      expect(graceful).to.have.property('activeRequests', 0);
      expect(graceful).to.have.property('development', false);

      expect(graceful).not.to.have.property('graceful');
    });
  });

  describe('#_onError', function() {
    it('closes keepalive connection and calls next', function() {
      var next = sinon.stub();
      graceful._closeConnection = sinon.stub();

      graceful._onError({}, null, null, next);

      expect(graceful).to.have.deep.property('_closeConnection.callCount', 1);
      expect(next).to.have.property('callCount', 1);
    });

    it('calls graceful.shutdown() if graceful set', function() {
      var next = sinon.stub();
      graceful._closeConnection = sinon.stub();
      graceful.graceful = {
        shutdown: sinon.stub()
      };

      graceful._onError({}, null, null, next);

      expect(graceful).to.have.deep.property('_closeConnection.callCount', 1);
      expect(graceful).to.have.deep.property('graceful.shutdown.callCount', 1);
      expect(next).to.have.property('callCount', 1);
    });
  });

  describe('#_once', function() {
    it('only calls once and passes all arguments through', function() {
      var fn = sinon.spy(function(left, right) {
        expect(left).to.equal('yes');
        expect(right).to.equal('no');
      });

      var once = graceful._once(fn);
      once('yes', 'no');
      once('yes', 'no');
      once('yes', 'no');

      expect(fn).to.have.property('callCount', 1);
    });
  });

});

