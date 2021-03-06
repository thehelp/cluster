
'use strict';

var path = require('path');
var core = require('thehelp-core');
core.env.merge(path.join(__dirname, '../../env.json'));

var cluster = require('../../src/server');
cluster.setupLogs();

var logShim = require('thehelp-log-shim');
var logger = logShim('hanging-workers');

cluster({
  master: function() {
    cluster.Graceful.start();
    var master = new cluster.Master();
    master.start();
  },
  worker: function() {
    logger.warn('Starting worker...');

    var express = require('express');
    var app = express();

    app.get('/', function(req, res) {
      res.send('success');
    });

    app.listen(3000);

    process.on('SIGTERM', function() {
      logger.warn('Got SIGTERM, not doing anything about it...');
    });
  }
});
