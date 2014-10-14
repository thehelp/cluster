
'use strict';

var test = require('thehelp-test');
var expect = test.expect;
var sinon = test.sinon;

var EventEmitter = require('events').EventEmitter;

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
      expect(graceful).to.have.property('requests').that.deep.equal([]);
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

    it('removes an added socket when it emits \'on\' event', function() {
      var socket = new EventEmitter();
      graceful._addSocket(socket);

      expect(graceful).to.have.property('sockets').that.has.length(1);

      socket.emit('close');
      expect(graceful).to.have.property('sockets').that.has.length(0);
    });
  });

  describe('adds and removes active sockets', function() {
    it('adds a new socket twice, and can remove it twice too', function() {
      var socket = {
        on: sinon.stub()
      };
      graceful._addActiveSocket(socket);
      graceful._addActiveSocket(socket);

      expect(graceful).to.have.property('activeSockets').that.has.length(2);
      expect(socket).to.have.deep.property('on.callCount', 0);

      graceful._removeActiveSocket(socket);
      expect(graceful).to.have.property('activeSockets').that.has.length(1);

      graceful._removeActiveSocket(socket);
      expect(graceful).to.have.property('activeSockets').that.has.length(0);
    });
  });

  describe('#_getInactiveSockets', function() {
    it('returns sockets not in the activeSockets list', function() {
      var socket1 = {
        on: sinon.stub()
      };
      var socket2 = {
        on: sinon.stub()
      };
      var socket3 = {
        on: sinon.stub()
      };

      graceful._addSocket(socket1);
      graceful._addSocket(socket2);
      graceful._addSocket(socket3);

      graceful._addActiveSocket(socket1);
      graceful._addActiveSocket(socket2);

      expect(graceful).to.have.property('activeSockets').that.has.length(2);
      expect(graceful).to.have.property('sockets').that.has.length(3);

      var inactive = graceful._getInactiveSockets();

      expect(inactive).to.have.length(1);
      expect(inactive).to.have.property('0', socket3);
    });
  });

});
