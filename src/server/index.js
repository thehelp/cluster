// index
// ========
// Pulls in everything needed for use via npm.

'use strict';

var Master = require('./master');
var Graceful = require('./graceful');
var Startup = require('./startup');
var GracefulExpress = require('./graceful_express');

// The root object returned via `require()` is this function
var start = function createStartupAndStart(options) {
  var startup = new Startup(options);
  startup.setupLogs();
  startup.start();
};

// The four main classes are available as keys on that main function.
start.Startup = Startup;
start.Master = Master;
start.Graceful = Graceful;
start.GracefulExpress = GracefulExpress;

module.exports = start;
