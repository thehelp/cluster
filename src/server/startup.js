// # Startup
// A class to encompass both dual master/worker cluster launch and installation of a
// top-level domain for the process.

'use strict';

var cluster = require('cluster');
var domain = require('domain');

var core = require('thehelp-core');
var logShim = require('thehelp-log-shim');

var Graceful = require('./graceful');
var util = require('./util');


/*
The `constructor` requires only one parameter `worker`, a callback which
starts a worker process. Optional parameters:

+ `masterOptions` - options to be passed to the `Master` class on construction in the
default master start callback
+ `master` - a callback to start the cluster's master process
+ `errorHandler` - an alternate handler for a top-level error. Prevents `messenger` from
being called, and prevents any kind of automatic graceful shutdown.
+ `messenger` -  a `function(err, options, cb)`, defaulting to
`thehelp-last-ditch`. Passed any top-level exceptions encountered.
+ `log` - a logger object: `info`, `warn` and `error` keys with the signature
`function(string)`. By default, whatever `thehelp-log-shim` gives us.

*/
function Startup(options) {
  /*jshint maxcomplexity: 11 */

  options = options || {};

  this.worker = options.worker;
  if (!this.worker) {
    throw new Error('Need to provide a worker callback!');
  }

  this.log = options.log || logShim('thehelp-cluster:startup');
  this._logPrefix = util.getLogPrefix();

  this.masterOptions = options.masterOptions;
  this.master = options.master || this._defaultMasterStart.bind(this);

  this.errorHandler = options.errorHandler;
  //errorHandler supercedes messenger
  if (!this.errorHandler) {
    this.messenger = options.messenger || require('thehelp-last-ditch');
  }

  this._domain = domain.create();
  this._domain.on('error', this._onError.bind(this));

  this._process = options._process || process;
  this._cluster = options._cluster || cluster;
}

module.exports = Startup;

// Public methods
// ========

// `start` checks whether the current process is the master, then calls the appropriate
// `master` or `worker` in the contxt of a top-level domain.
Startup.prototype.start = function start() {
  if (this._cluster.isMaster) {
    this._domain.run(this.master);
  }
  else {
    this._domain.run(this.worker);
  }
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
  var _this = this;

  //Don't want the entire domain object to pollute the log entry for this error
  delete err.domain;

  if (this.errorHandler) {
    return this.errorHandler(err);
  }

  this.log.error(this._logPrefix + ' top-level domain error, taking down process: ' +
    core.breadcrumbs.toString(err));

  if (Graceful.instance) {
    return Graceful.instance.shutdown(err);
  }

  this.messenger(err, null, function() {
    _this._process.kill(_this._process.pid, 'SIGTERM');
  });
};

// `_defaultMasterStart` what starts up the master process if you provide your own
// `master` startup function on startup.
Startup.prototype._defaultMasterStart = function _defaultMasterStart() {
  var Master = require('./master');
  var master = new Master(this.masterOptions);
  master.start();
};
