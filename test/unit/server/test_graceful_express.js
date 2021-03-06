
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
      expect(graceful).to.have.property('graceful', null);
      expect(graceful).to.have.property('shuttingDown', false);

      expect(graceful).to.have.property('reaperPollInterval', 500);

      expect(graceful).to.have.property('_responses').that.deep.equal([]);
      expect(graceful).to.have.property('_sockets').that.deep.equal([]);
      expect(graceful).to.have.property('_activeSockets').that.deep.equal([]);

      expect(graceful).to.have.property('inProcessTest', true);
    });

    it('throws if provided reaperPollInterval is not a number', function() {
      /*jshint nonew: false */

      expect(function() {
        new GracefulExpress({
          reaperPollInterval: 'seven'
        });
      }).to['throw']().that.match(/reaperPollInterval must be a number/);
    });
  });

  describe('#listen', function() {
    it('throws if app is not provided', function() {
      expect(function() {
        graceful.listen();
      }).to['throw']().that.match(/to provide express app as first parameter/);
    });
  });

  describe('#setGraceful', function() {
    it('throws if graceful doesn\'t have shutdown() method', function() {
      var obj = {
        on: sinon.stub()
      };
      expect(function() {
        graceful.setGraceful(obj);
      }).to['throw']().that.match(/graceful object must have shutdown method/);
    });

    it('throws if graceful doesn\'t have shutdown() method', function() {
      var obj = {
        shutdown: sinon.stub()
      };
      expect(function() {
        graceful.setGraceful(obj);
      }).to['throw']().that.match(/graceful object must have on method/);
    });
  });

  describe('#setServer', function() {
    it('throws if server doesn\'t have on() method', function() {
      var obj = {};
      expect(function() {
        graceful.setServer(obj);
      }).to['throw']().that.match(/server object must have on method/);
    });
  });

  describe('#addActiveSocket', function() {
    it('throws if socket is null', function() {
      expect(function() {
        graceful.addActiveSocket(null);
      }).to['throw']().that.match(/socket must be an object/);
    });

    it('throws if socket is a number', function() {
      expect(function() {
        graceful.addActiveSocket(3);
      }).to['throw']().that.match(/socket must be an object/);
    });
  });

  describe('#removeActiveSocket', function() {
    it('throws if socket is not an object', function() {
      expect(function() {
        graceful.removeActiveSocket(null);
      }).to['throw']().that.match(/socket must be an object/);
    });

    it('#removeActiveSocket throws if socket is a number', function() {
      expect(function() {
        graceful.removeActiveSocket(5);
      }).to['throw']().that.match(/socket must be an object/);
    });
  });

  describe('#_onError', function() {
    it('closes keepalive connection and calls next', function() {
      var next = sinon.stub();
      graceful._preventKeepAlive = sinon.stub();

      graceful._onError({}, null, null, next);

      expect(graceful).to.have.deep.property('_preventKeepAlive.callCount', 1);
      expect(next).to.have.property('callCount', 1);
    });

    it('calls graceful.shutdown() if graceful set', function() {
      var next = sinon.stub();
      graceful._preventKeepAlive = sinon.stub();
      graceful.graceful = {
        shutdown: sinon.stub()
      };

      graceful._onError({}, null, null, next);

      expect(graceful).to.have.deep.property('_preventKeepAlive.callCount', 1);
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

      expect(graceful).to.have.property('_sockets').that.has.length(1);
      expect(socket).to.have.deep.property('on.callCount', 1);

      graceful._removeSocket(socket);

      expect(graceful).to.have.property('_sockets').that.has.length(0);
    });

    it('removes an added socket when it emits \'on\' event', function() {
      var socket = new EventEmitter();
      graceful._addSocket(socket);

      expect(graceful).to.have.property('_sockets').that.has.length(1);

      socket.emit('close');
      expect(graceful).to.have.property('_sockets').that.has.length(0);
    });
  });

  describe('adds and removes active sockets', function() {
    it('adds a new socket twice, and can remove it twice too', function() {
      var socket = {
        on: sinon.stub()
      };
      graceful.addActiveSocket(socket);
      graceful.addActiveSocket(socket);

      expect(graceful).to.have.property('_activeSockets').that.has.length(2);
      expect(socket).to.have.deep.property('on.callCount', 0);

      graceful.removeActiveSocket(socket);
      expect(graceful).to.have.property('_activeSockets').that.has.length(1);

      graceful.removeActiveSocket(socket);
      expect(graceful).to.have.property('_activeSockets').that.has.length(0);
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

      graceful.addActiveSocket(socket1);
      graceful.addActiveSocket(socket2);

      expect(graceful).to.have.property('_activeSockets').that.has.length(2);
      expect(graceful).to.have.property('_sockets').that.has.length(3);

      var inactive = graceful._getInactiveSockets();

      expect(inactive).to.have.length(1);
      expect(inactive).to.have.property('0', socket3);
    });
  });

});
