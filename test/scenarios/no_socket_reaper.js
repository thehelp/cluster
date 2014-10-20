
'use strict';

var path = require('path');
var core = require('thehelp-core');
core.env.merge(path.join(__dirname, '../../env.json'));

var cluster = require('../../src/server');

cluster.setupLogs();
cluster.Graceful.start();

cluster({
  masterOptions: {
    spinTimeout: 100
  },
  worker: function() {
    var e2e = require('./end_to_end_server');
    e2e.gracefulExpress._startSocketReaper = function() {};
    e2e.start();
  }
});
