
'use strict';

var test = require('thehelp-test');
var index = require('../../../src/server/index');

describe('thehelp-cluster', function() {

  it('works!', function() {
    /*jshint -W030 */
    test.core.expect(index).to.exist;
  });

});

