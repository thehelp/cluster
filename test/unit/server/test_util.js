
'use strict';

var test = require('thehelp-test');
var expect = test.expect;
var sinon = test.sinon;

var util = require('../../../src/server/util');

describe('util', function() {

  describe('#once', function() {
    it('only calls once and passes all arguments through', function() {
      var fn = sinon.spy(function(left, right) {
        expect(left).to.equal('yes');
        expect(right).to.equal('no');
      });

      var once = util.once(fn);
      once('yes', 'no');
      once('yes', 'no');
      once('yes', 'no');

      expect(fn).to.have.property('callCount', 1);
    });
  });

  describe('#verifyType', function() {
    it('checks for NaN if type is "number"', function() {
      expect(function() {
        var obj = {
          field: NaN
        };
        util.verifyType('number', obj, 'field');
      }).to['throw']().that.match(/must be a countable number/)
    });
  });

  describe('#verifyLog', function() {
    it('does not throw if object is null', function() {
      util.verifyLog();
    });
  });

  describe('#verifyGraceful', function() {
    it('does not throw if object is null', function() {
      util.verifyGraceful();
    });
  });

  describe('#verifyServer', function() {
    it('does not throw if object is null', function() {
      util.verifyServer();
    });
  });
});
