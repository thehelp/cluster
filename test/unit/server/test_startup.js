
'use strict';

var test = require('thehelp-test');
var expect = test.expect;
var sinon = test.sinon;

var Startup = require('../../../src/server/startup');
var Graceful = require('../../../src/server/graceful');

describe('Startup', function() {
  var startup;

  beforeEach(function() {
    startup = new Startup({
      worker: sinon.stub(),
      messenger: sinon.stub()
    });
  });

  describe('constructor', function() {
    /*jshint nonew: false */

    it('throws if worker callback not provided', function() {
      expect(function() {
        new Startup();
      }).to['throw']().that.match(/provide a worker/);
    });

    it('throws if worker is not a function', function() {
      expect(function() {
        new Startup({
          worker: 'six'
        });
      }).to['throw']().that.match(/worker must be a function/);
    });

    it('provided messenger is set', function() {
      var messenger = sinon.stub();
      startup = new Startup({
        worker: sinon.stub(),
        messenger: messenger
      });
      expect(startup).to.have.deep.property('messenger', messenger);
    });

    it('throws if messenger is not a function', function() {
      expect(function() {
        new Startup({
          worker: function() {},
          messenger: 'six'
        });
      }).to['throw']().that.match(/messenger must be a function/);
    });

    it('sets up last ditch if no messenger provided', function() {
      startup = new Startup({
        worker: sinon.stub()
      });
      expect(startup).to.have.deep.property('messenger', require('thehelp-last-ditch'));
    });

    it('messenger left at null if errorHandler is provided', function() {
      startup = new Startup({
        worker: function() {},
        errorHandler: function() {}
      });
      expect(startup).not.to.have.property('messenger');
    });

    it('throws if errorHandler is not a function', function() {
      expect(function() {
        new Startup({
          worker: function() {},
          errorHandler: 'six'
        });
      }).to['throw']().that.match(/errorHandler must be a function/);
    });

    it('throws if provided log is missing error level', function() {
      expect(function() {
        new Startup({
          worker: function() {},
          log: {
            verbose: function() {},
            info: function() {},
            warn: function() {}
          }
        });
      }).to['throw']().that.match(/log object must have error function/);
    });

    it('throws if master is not a function', function() {
      expect(function() {
        new Startup({
          worker: function() {},
          master: 'six'
        });
      }).to['throw']().that.match(/master must be a function/);
    });
  });

  describe('#_onError', function() {
    it('only calls errorHandler if provided', function() {
      Graceful.instance = null;

      startup.errorHandler = sinon.stub();
      startup._onError(new Error('test error'));

      expect(startup).to.have.deep.property('errorHandler.callCount', 1);
      expect(startup).to.have.deep.property('messenger.callCount', 0);
    });

    it('calls Graceful.instance.shutdown() if available', function() {
      Graceful.instance = {
        shutdown: sinon.stub()
      };

      startup._onError(new Error('test error'));

      expect(Graceful).to.have.deep.property('instance.shutdown.callCount', 1);
      expect(startup).to.have.deep.property('messenger.callCount', 0);
    });

    it('only calls messenger() and process.kill if nothing else available', function() {
      Graceful.instance = null;
      startup.messenger = sinon.stub().yields();
      startup._process = {
        kill: sinon.stub()
      };

      startup._onError(new Error('test error'));

      expect(startup).to.have.deep.property('messenger.callCount', 1);
      expect(startup).to.have.deep.property('_process.kill.callCount', 1);
    });

  });

});

