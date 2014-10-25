
'use strict';

var test = require('thehelp-test');
var expect = test.expect;
var sinon = test.sinon;

var Master = require('../../../src/server/master');

describe('Master', function() {
  var master;

  before(function() {
    // Because Master registers as cluster.on('disconnect') on every construction
    process.setMaxListeners(0);
  });

  beforeEach(function() {
    master = new Master();
  });

  afterEach(function() {
    Master.instance = null;
  });

  describe('constructor', function() {
    /*jshint nonew: false */

    it('sets right defaults', function() {
      expect(master).to.have.property('_workers').that.deep.equal({});
      expect(master).to.have.property('shuttingDown', false);

      expect(master).to.have.property('spinTimeout', 10000);
      expect(master).to.have.property('delayStart', 60000);
      expect(master).to.have.property('pollInterval', 500);
      expect(master).to.have.property('killTimeout', 7000);

      expect(master).to.have.property('numberWorkers', 1);

      expect(master).to.have.property('_cluster').that.exist;

      expect(Master).to.have.property('instance').that.deep.equal(master);
    });

    it('logs if previous instance has been created', function() {
      var log = {
        verbose: sinon.stub(),
        info: sinon.stub(),
        warn: sinon.stub(),
        error: sinon.stub()
      };
      new Master({
        log: log
      });

      expect(log).to.have.deep.property('warn.callCount', 1);
    });

    it('throws if provided spinTimeout is not a number', function() {
      expect(function() {
        new Master({
          spinTimeout: 'four'
        });
      }).to['throw']().that.match(/spinTimeout must be a number/);
    });

    it('throws if provided delayStart is not a number', function() {
      expect(function() {
        new Master({
          delayStart: 'four'
        });
      }).to['throw']().that.match(/delayStart must be a number/);
    });

    it('throws if provided pollInterval is not a number', function() {
      expect(function() {
        new Master({
          pollInterval: 'four'
        });
      }).to['throw']().that.match(/pollInterval must be a number/);
    });

    it('throws if provided killTimeout is not a number', function() {
      expect(function() {
        new Master({
          killTimeout: 'four'
        });
      }).to['throw']().that.match(/killTimeout must be a number/);
    });

    it('throws if provided numberWorkers is not a number', function() {
      expect(function() {
        new Master({
          numberWorkers: 'five'
        });
      }).to['throw']().that.match(/numberWorkers must be a number/);
    });

    it('throws if provided log object is missing warn level', function() {
      expect(function() {
        new Master({
          log: {
            verbose: sinon.stub(),
            info: sinon.stub(),
            error: sinon.stub()
          }
        });
      }).to['throw']().that.match(/log object must have warn/);
    });
  });

  describe('#setGraceful', function() {
    it('throws if graceful doesn\'t have shutdown() method', function() {
      var obj = {
        on: sinon.stub()
      };
      expect(function() {
        master.setGraceful(obj);
      }).to['throw']().that.match(/graceful object must have shutdown method/);
    });

    it('throws if graceful doesn\'t have shutdown() method', function() {
      var obj = {
        shutdown: sinon.stub()
      };
      expect(function() {
        master.setGraceful(obj);
      }).to['throw']().that.match(/graceful object must have on method/);
    });
  });

  describe('#stop', function() {
    it('throws synchronously if no callback provided', function() {
      expect(function() {
        master.stop();
      }).to['throw']().that.match(/callback is required/);
    });

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

