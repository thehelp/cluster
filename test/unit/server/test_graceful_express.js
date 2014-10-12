
'use strict';

var test = require('thehelp-test');
var expect = test.expect;
var sinon = test.sinon;

var Graceful = require('../../../src/server/graceful');
var GracefulExpress = require('../../../src/server/graceful_express');

describe('GracefulExpress', function() {
  var graceful;

  beforeEach(function() {
    Graceful.instance = null;
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

  describe('adds and removes sockets', function() {
    it('adds a new socket just once, and can remove it', function() {
      var socket = {
        on: sinon.stub()
      };
      graceful._addSocket(socket);
      graceful._addSocket(socket);

      expect(graceful).to.have.property('sockets').that.has.length(1);
      expect(socket).to.have.deep.property('on.callCount', 1);

      graceful._removeSocket(socket);

      expect(graceful).to.have.property('sockets').that.has.length(0);
    });
  });

});

