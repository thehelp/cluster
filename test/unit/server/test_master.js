
'use strict';

var test = require('thehelp-test');
var expect = test.expect;
var sinon = test.sinon;

var Master = require('../../../src/server/master');

describe('Master', function() {
  var master;

  beforeEach(function() {
    master = new Master();
  });

  afterEach(function() {
    Master.instance = null;
  });

  describe('constructor', function() {
    it('sets right defaults', function() {
      expect(master).to.have.property('spinTimeout', 5000);
      expect(master).to.have.property('delayStart', 60000);
      expect(master).to.have.property('pollInterval', 500);
      expect(master).to.have.property('killTimeout', 7000);

      expect(master).to.have.property('numberWorkers', 1);

      expect(master).to.have.property('workers').that.deep.equal({});
      expect(master).to.have.property('closed', false);

      expect(Master).to.have.property('instance').that.deep.equal(master);
    });

    it('logs if previous instance has been created', function() {
      /*jshint nonew: false */
      var log = {
        warn: sinon.stub()
      };
      new Master({
        log: log
      });

      expect(log).to.have.deep.property('warn.callCount', 1);
    });
  });

  describe('#stop', function() {
    it('calls callback after processes die from SIGTERM', function(done) {
      master.killTimeout = 25;
      master.pollInterval = 1;

      master._sendToAll = sinon.stub();

      master.stop(function() {
        expect(master).to.have.deep.property('_sendToAll.callCount', 1);

        done();
      });
    });

    it('calls callback after processes die from SIGINT', function(done) {
      master.killTimeout = 1;
      master.pollInterval = 25;

      master._sendToAll = sinon.stub();

      master.stop(function() {
        expect(master).to.have.deep.property('_sendToAll.callCount', 2);

        done();
      });
    });
  });

});

