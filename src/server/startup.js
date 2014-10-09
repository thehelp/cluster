// # Startup
// A class to encompass both dual master/worker cluster launch and installation of a
// top-level domain for the process.

// [strict mode](http://mzl.la/1fRhnam)
'use strict';

var cluster = require('cluster');
var domain = require('domain');
var path = require('path');

var core = require('thehelp-core');
var Graceful = require('./graceful');

/*
The `constructor` requires only one parameter `worker`, a callback which
starts a worker process. Optional parameters:

+ `logsDir` -  your logs directory, defaulting to './logs/' (can also be specified by the
THEHELP_LOGS_DIR environment variable)
+ `masterOptions` - options to be passed to the `Master` class on construction in the
default master start callback
+ `master` - a callback to start the cluster's master process
+ `errorHandler` - an alternate handler for a top-level error. Prevents `messenger` from
being called, and prevents any kind of automatic graceful shutdown.
+ `messenger` -  a `function(err, options, cb)`, defaulting to
`thehelp-last-ditch`. Passed any top-level exceptions encountered.

*/
function Startup(options) {
  /*jshint maxcomplexity: 10 */

  options = options || {};

  this.worker = options.worker;
  if (!this.worker) {
    throw new Error('Need to provide a worker callback!');
  }

  this.logsDir = options.logsDir || process.env.THEHELP_LOGS_DIR || './logs/';

  this.masterOptions = options.masterOptions;
  this.master = options.master || this._defaultMasterStart.bind(this);

  this.errorHandler = options.errorHandler;
  //errorHandler supercedes messenger
  if (!this.errorHandler) {
    this.messenger = options.messenger || require('thehelp-last-ditch');
  }

  this.domain = domain.create();
  this.domain.on('error', this._onError.bind(this));

  this.cluster = options.cluster || cluster;
}

module.exports = Startup;

// Public methods
// ========

// `start` checks whether the current process is the master, then calls the appropriate
// `master` or `worker` in the contxt of a top-level domain.
Startup.prototype.start = function start() {
  if (this.cluster.isMaster) {
    this.domain.run(this.master);
  }
  else {
    this.domain.run(this.worker);
  }
};

// `setupLogs` sets up `winston` with colorful, formatted console logging as well as a
// file appropriate to the process type. Files are of the form
// 'worker-2014-04-28T03-04:03.232Z-32706.log' in the `this.logsDir` directory.
Startup.prototype.setupLogs = function setupLogs() {
  core.logs.setupFile(this.getLogFilename());
  core.logs.setupConsole();
};

// `getLogFilename` might still be useful if you're not using `winston` for your logging.
Startup.prototype.getLogFilename = function getLogFilename() {
  var type = this.cluster.isMaster ? 'master' : 'worker';
  return path.join(
    this.logsDir,
    type + '-' + this._timestampForPath() + '-' + process.pid + '.log'
  );
};

// Helper methods
// ========

/*
`onError` is called when the top-level domain is sent an error. Whenever this happens
it's definitely something serious, send it via the `messenger()` callback then start the
process of graceful shutdown.

If [`Graceful.instance`](./graceful.html) is found, its `shutdown()` method will be
called, preventing the `messenger()` handler from being called.

Lastly `errorHandler` can be specified for custom error-handling logic, superceding all
other behavior in this method.
*/
Startup.prototype._onError = function _onError(err) {
  //Don't want the entire domain object to pollute the log entry for this error
  delete err.domain;

  if (this.errorHandler) {
    return this.errorHandler(err);
  }

  if (Graceful.instance) {
    return Graceful.instance.shutdown(err);
  }

  this.messenger(err, null, function() {
    process.kill(process.pid, 'SIGTERM');
  });
};

// `_timestampForPath` makes `toISOString()` timestamps safe for filenames.
Startup.prototype._timestampForPath = function _timestampForPath() {
  var result = core.logs.timestamp();
  result = result.replace(':', '-');
  return result;
};

// `_defaultMasterStart` what starts up the master process if you provide your own
// `master` startup function on startup.
Startup.prototype._defaultMasterStart = function _defaultMasterStart() {
  var Master = require('./master');

  var options = this.masterOptions || {};
  options.graceful = options.graceful || new Graceful();

  var master = new Master(options);
  master.start();
};
