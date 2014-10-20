
'use strict';

var path = require('path');
var core = require('thehelp-core');
core.env.merge(path.join(__dirname, '../../env.json'));

var fs = require('fs');

var cluster = require('../../src/server');

cluster.setupLogs();
cluster.Graceful.start();

var logShim = require('thehelp-log-shim');
var logger = logShim('crash-master');

cluster({
  master: function() {
    var master = new cluster.Master({
      numberWorkers: 2
    });
    master.start();

    setTimeout(function() {
      fs.readFile('randomness', function(err, file) {
        logger.info(file.stat);
      });
    }, 1000);
  },
  worker: function() {
    logger.warn('Starting worker...');
  }
});
