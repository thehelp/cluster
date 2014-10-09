
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

    it('provided messenger is set', function() {
      var messenger = sinon.stub();
      startup = new Startup({
        worker: sinon.stub(),
        messenger: messenger
      });
      expect(startup).to.have.deep.property('messenger', messenger);
    });

    it('sets up last ditch if no messenger provided', function() {
      startup = new Startup({
        worker: sinon.stub()
      });
      expect(startup).to.have.deep.property('messenger', require('thehelp-last-ditch'));
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

    it('only calls messenger if Graceful.instance unavailable', function() {
      Graceful.instance = {
        shutdown: sinon.stub()
      };

      startup._onError(new Error('test error'));

      expect(Graceful).to.have.deep.property('instance.shutdown.callCount', 1);
      expect(startup).to.have.deep.property('messenger.callCount', 0);
    });
  });

});

