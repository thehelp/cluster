
'use strict';

var path = require('path');
var core = require('thehelp-core');
core.env.merge(path.join(__dirname, '../../env.json'));

var fs = require('fs');

var cluster = require('../../src/server/index');

cluster({
  masterOptions: {
    numberWorkers: 2
  },
  worker: function() {
    var graceful = new cluster.Graceful();
    console.log(graceful.logPrefix);

    fs.readFile('randomness', function(err, file) {
      console.log(file.stat);
    });
  }
});
