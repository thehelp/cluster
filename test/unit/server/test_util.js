
'use strict';

var test = require('thehelp-test');
var expect = test.expect;
var sinon = test.sinon;

var util = require('../../../src/server/util');

describe('util', function() {

  describe('#_once', function() {
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

});
