
'use strict';

var path = require('path');
var core = require('thehelp-core');
core.env.merge(path.join(__dirname, '../../env.json'));

var winston = require('winston');

var cluster = require('../../src/server/index');

cluster({
  master: function() {
    cluster.Graceful.start();
    var master = new cluster.Master();
    master.start();
  },
  worker: function() {
    var express = require('express');
    var app = express();

    app.get('/', function(req, res) {
      res.send('success');
    });

    app.listen(3000);

    process.on('SIGTERM', function() {
      winston.warn('Got SIGTERM, not doing anything about it...');
    });
  }
});
