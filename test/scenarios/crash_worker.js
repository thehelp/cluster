
'use strict';

var path = require('path');
var core = require('thehelp-core');
core.env.merge(path.join(__dirname, '../../env.json'));

var fs = require('fs');

var cluster = require('../../src/server/index');

cluster.Graceful.start();

cluster({
  masterOptions: {
    numberWorkers: 2
  },
  worker: function() {
    console.log('starting worker...');

    fs.readFile('randomness', function(err, file) {
      console.log(file.stat);
    });
  }
});
