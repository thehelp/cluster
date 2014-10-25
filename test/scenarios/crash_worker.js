
'use strict';

var path = require('path');
var core = require('thehelp-core');
core.env.merge(path.join(__dirname, '../../env.json'));

var fs = require('fs');

var cluster = require('../../src/server');

cluster.setupLogs();
cluster.Graceful.start();

var logShim = require('thehelp-log-shim');
var logger = logShim('crash-worker');

cluster({
  masterOptions: {
    numberWorkers: 2
  },
  worker: function() {
    logger.warn('starting worker...');

    setTimeout(function() {
      fs.readFile('randomness', function(err, file) {
        logger.info(file.stat);
      });
    }, 2000);
  }
});
