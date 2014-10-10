
'use strict';

var test = require('thehelp-test');
var expect = test.expect;
var sinon = test.sinon;

var Graceful = require('../../../src/server/graceful');

describe('Graceful', function() {
  var graceful;

  beforeEach(function() {
    graceful = new Graceful();
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

});

