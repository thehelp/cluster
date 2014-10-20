
'use strict';

var path = require('path');
var core = require('thehelp-core');
core.env.merge(path.join(__dirname, '../../env.json'));

var cluster = require('../../src/server');
cluster.setupLogs();

var ld = require('thehelp-last-ditch');
var lastDitch = new ld.LastDitch({
  targets: ['stderr']
});

cluster.Graceful.start({
  messenger: lastDitch.go
});

cluster({
  masterOptions: {
    spinTimeout: 100
  },
  worker: function() {
    var e2e = require('./end_to_end_server');
    e2e.start();
  }
});
