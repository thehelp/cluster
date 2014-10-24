// index
// ========
// Pulls in everything needed for use via npm.

'use strict';

var cluster = require('cluster');
var path = require('path');

var core = require('thehelp-core');

var Master = require('./master');
var Graceful = require('./graceful');
var Startup = require('./startup');
var GracefulExpress = require('./graceful_express');


// The root object returned via `require()` is this function
var start = module.exports = function createStartupAndStart(options) {
  var startup = new Startup(options);
  startup.start();
  return startup;
};

// The four main classes are available as keys on that main function.
start.Startup = Startup;
start.Master = Master;
start.Graceful = Graceful;
start.GracefulExpress = GracefulExpress;

// Winston logging support
// ========

// `logsDir` is your logs directory, defaulting to './logs/' (can also be specified by the
// THEHELP_LOGS_DIR environment variable or udpated directly)
start.logsDir = process.env.THEHELP_LOGS_DIR || './logs/';

// `setupLogs` sets up `winston` with colorful, formatted console logging as well as a
// file appropriate to the process type. Files are of the form
// 'worker-2014-04-28T03-04:03.232Z-32706.log' in the `this.logsDir` directory.
start.setupLogs = function setupLogs() {
  core.logs.setupFile(this.getLogFilename());
  core.logs.setupConsole();
};

// `getLogFilename` might still be useful if you're not using `winston` for your logging.
start.getLogFilename = function getLogFilename() {
  var type = cluster.isMaster ? 'master' : 'worker';
  return path.join(
    start.logsDir,
    type + '-' + start._timestampForPath() + '-' + process.pid + '.log'
  );
};

// `_timestampForPath` makes `toISOString()` timestamps safe for filenames.
start._timestampForPath = function _timestampForPath() {
  var date = new Date();
  var result = date.toJSON();
  result = result.replace(':', '-');
  return result;
};
