
'use strict';

var path = require('path');
var core = require('thehelp-core');
core.env.merge(path.join(__dirname, '../../env.json'));

var winston = require('winston');
var log = {
  info: function(text) {
    winston.info('PREFIX ' + text);
  },
  warn: function(text) {
    winston.warn('PREFIX ' + text);
  },
  error: function(text) {
    winston.error('PREFIX ' + text);
  }
};

var cluster = require('../../src/server/index');
var ld = require('thehelp-last-ditch');

var lastDitch = new ld.LastDitch({
  targets: ['stderr'],
  log: log
});

cluster.Graceful.start({
  messenger: lastDitch.go,
  log: log
});

cluster({
  log: log,
  masterOptions: {
    spinTimeout: 100,
    log: log
  },
  worker: function() {
    require('./end_to_end_server');
  }
});
