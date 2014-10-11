
'use strict';

var test = require('thehelp-test');
var expect = test.expect;
var sinon = test.sinon;

var Graceful = require('../../../src/server/graceful');

describe('Graceful', function() {
  var graceful;

  before(function() {
    // we create a lot of Graceful objects, all EventEmitters - this suppresses a warning
    process.setMaxListeners(0);
  });

  beforeEach(function() {
    graceful = new Graceful();
  });

  afterEach(function() {
    graceful.log = {
      warn: sinon.stub()
    };
  });

  describe('constructor', function() {
    it('sets right defaults', function() {
      expect(graceful).to.have.property('checks').that.has.length(1);
      expect(graceful).to.have.property('closed', false);

      expect(graceful).to.have.property('pollInterval', 250);
      expect(graceful).to.have.property('timeout', 5000);

      expect(graceful).to.have.property('sending', false);

      expect(Graceful).to.have.property('instance').that.deep.equal(graceful);
    });

    it('provided messenger is set', function() {
      var messenger = sinon.stub();
      graceful = new Graceful({
        messenger: messenger
      });
      expect(graceful).to.have.deep.property('messenger', messenger);
    });

    it('sets up last ditch if no messenger provided', function() {
      graceful = new Graceful();
      expect(graceful).to.have.deep.property('messenger', require('thehelp-last-ditch'));
    });
  });

  describe('#shutdown', function() {
    it('doesn\'t call _sendError or _exit when called more than once', function() {
      graceful._sendError = sinon.stub();
      graceful._exit = sinon.spy();
      graceful.once('shutdown', function() {
        graceful.shutdown();
      });

      graceful.shutdown();
      graceful.shutdown();

      expect(graceful).to.have.deep.property('_sendError.callCount', 1);
      expect(graceful).to.have.deep.property('_exit.callCount', 1);
    });
  });

  describe('#_sendError', function() {
    it('doesn\'t call messenger if err is falsey', function() {
      graceful.messenger = sinon.stub();

      graceful._sendError();

      expect(graceful).to.have.deep.property('messenger.callCount', 0);
      expect(graceful).to.have.property('sending', false);
    });

    it('sets sending to true before calling messenger', function() {
      graceful.messenger = sinon.stub();

      graceful._sendError({});

      expect(graceful).to.have.deep.property('messenger.callCount', 1);
      expect(graceful).to.have.property('sending', true);
    });

    it('sets sending to false before after messenger returns', function() {
      graceful.messenger = sinon.stub().yields();

      graceful._sendError({});

      expect(graceful).to.have.deep.property('messenger.callCount', 1);
      expect(graceful).to.have.property('sending', false);
    });
  });

  describe('#_check', function() {
    it('returns true if this.checks is null', function() {
      graceful.checks = null;
      expect(graceful._check()).to.equal(true);
    });

    it('returns true if this.checks is empty', function() {
      graceful.checks = [];
      expect(graceful._check()).to.equal(true);
    });

    it('returns true if one check returns true', function() {
      graceful.checks = [function() {
        return true;
      }];
      expect(graceful._check()).to.equal(true);
    });

    it('returns true if one check returns false', function() {
      graceful.checks = [function() {
        return false;
      }];
      expect(graceful._check()).to.equal(false);
    });
  });

  describe('#_exit', function() {
    it('calls _finalLog if check functions never return true', function(done) {
      graceful.pollInterval = 50;
      graceful.timeout = 175;
      graceful.closed = true;
      graceful.addCheck(function() {
        return false;
      });

      graceful._finalLog = sinon.stub();
      graceful._exit = sinon.spy(graceful._exit);

      graceful._exit();

      setTimeout(function() {
        expect(graceful).to.have.deep.property('_exit.callCount', 4);
        expect(graceful).to.have.deep.property('_finalLog.callCount', 1);

        done();
      }, 200);
    });

    it('calls _finalLog if check function returns', function() {
      graceful.closed = true;

      graceful._finalLog = sinon.stub();
      graceful._exit = sinon.spy(graceful._exit);

      graceful._exit();

      expect(graceful).to.have.deep.property('_exit.callCount', 1);
      expect(graceful).to.have.deep.property('_finalLog.callCount', 1);
    });
  });

  describe('#_finalLog', function() {
    it('calls _die when log calls callback', function(done) {
      graceful.log = {
        info: sinon.stub().yields()
      };
      graceful._die = done;

      graceful._finalLog('info', 'log string');
    });

    it('calls _die if log never calls callback', function(done) {
      graceful.log = {
        info: sinon.stub()
      };
      graceful._die = done;

      graceful._finalLog('info', 'log string');
    });
  });
});

