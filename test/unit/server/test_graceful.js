
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
    Graceful.instance = null;
    graceful.log = {
      warn: sinon.stub()
    };
  });

  describe('constructor', function() {
    /*jshint nonew: false */

    it('sets right defaults', function() {
      expect(graceful).to.have.property('shuttingDown', false);
      expect(graceful).to.have.property('_checks').that.has.length(1);
      expect(graceful).to.have.property('_sending', false);

      expect(graceful).to.have.property('pollInterval', 250);
      expect(graceful).to.have.property('timeout', 5000);

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

    it('logs if previous instance has been created', function() {

      var log = {
        verbose: sinon.stub(),
        info: sinon.stub(),
        warn: sinon.stub(),
        error: sinon.stub()
      };
      new Graceful({
        log: log
      });

      expect(log).to.have.deep.property('warn.callCount', 1);
    });

    it('throws if provided pollInterval is not a number', function() {
      expect(function() {
        new Graceful({
          pollInterval: 'string'
        });
      }).to['throw']().that.match(/pollInterval must be a number/);
    });

    it('throws if provided timeout is not a number', function() {
      expect(function() {
        new Graceful({
          timeout: 'string'
        });
      }).to['throw']().that.match(/timeout must be a number/);
    });

    it('throws if provided messenger is not a function', function() {
      expect(function() {
        new Graceful({
          messenger: 4
        });
      }).to['throw']().that.match(/messenger must be a function/);
    });

    it('throws if provided log is missing error level', function() {
      expect(function() {
        new Graceful({
          log: {
            verbose: function() {},
            info: function() {},
            warn: function() {}
          }
        });
      }).to['throw']().that.match(/log object must have error function/);
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

  describe('#addCheck', function() {
    it('throws if you provide null', function() {
      expect(function() {
        graceful.addCheck();
      }).to['throw']().that.match(/provide a function/);
    });

    it('throws if you provide a non-function', function() {
      expect(function() {
        graceful.addCheck('non-function');
      }).to['throw']().that.match(/provide a function/);
    });

    it('adds element to checks if function', function() {
      expect(graceful._checks).to.have.length(1);
      graceful.addCheck(function() {
        return true;
      });
      expect(graceful._checks).to.have.length(2);
      expect(graceful._check()).to.equal(true);
      graceful.addCheck(function() {
        return false;
      });
      expect(graceful._checks).to.have.length(3);
      expect(graceful._check()).to.equal(false);
    });
  });

  describe('#_sendError', function() {
    it('doesn\'t call messenger if err is falsey', function() {
      graceful.messenger = sinon.stub();

      graceful._sendError();

      expect(graceful).to.have.deep.property('messenger.callCount', 0);
      expect(graceful).to.have.property('_sending', false);
    });

    it('sets sending to true before calling messenger', function() {
      graceful.messenger = sinon.stub();

      graceful._sendError({});

      expect(graceful).to.have.deep.property('messenger.callCount', 1);
      expect(graceful).to.have.property('_sending', true);
    });

    it('sets sending to false before after messenger returns', function() {
      graceful.messenger = sinon.stub().yields();

      graceful._sendError({});

      expect(graceful).to.have.deep.property('messenger.callCount', 1);
      expect(graceful).to.have.property('_sending', false);
    });
  });

  describe('#_check', function() {
    it('returns true if this._checks is null', function() {
      graceful._checks = null;
      expect(graceful._check()).to.equal(true);
    });

    it('returns true if this._checks is empty', function() {
      graceful._checks = [];
      expect(graceful._check()).to.equal(true);
    });

    it('returns true if one check returns true', function() {
      graceful._checks = [function() {
        return true;
      }];
      expect(graceful._check()).to.equal(true);
    });

    it('returns true if one check returns false', function() {
      graceful._checks = [function() {
        return false;
      }];
      expect(graceful._check()).to.equal(false);
    });
  });

  describe('#_exit', function() {
    it('calls _finalLog if check functions never return true', function(done) {
      graceful.pollInterval = 50;
      graceful.timeout = 175;
      graceful.shuttingDown = true;
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
      graceful.shuttingDown = true;

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

  describe('#_die', function() {
    it('calls process.exit() with code 0 if no error', function() {
      graceful._process = {
        exit: sinon.stub()
      };
      graceful._die();

      expect(graceful).to.have.deep.property('_process.exit.callCount', 1);

      var call = graceful._process.exit.getCall(0);
      expect(call).to.have.property('args').that.deep.equal([0]);
    });

    it('calls process.exit() with code 1 if error', function() {
      graceful._process = {
        exit: sinon.stub()
      };
      graceful.error = {};
      graceful._die();

      expect(graceful).to.have.deep.property('_process.exit.callCount', 1);

      var call = graceful._process.exit.getCall(0);
      expect(call).to.have.property('args').that.deep.equal([1]);
    });

    it('calls process.exit() with exitCode from error', function() {
      graceful._process = {
        exit: sinon.stub()
      };
      graceful.error = {
        exitCode: 4
      };
      graceful._die();

      expect(graceful).to.have.deep.property('_process.exit.callCount', 1);

      var call = graceful._process.exit.getCall(0);
      expect(call).to.have.property('args').that.deep.equal([4]);
    });
  });
});

