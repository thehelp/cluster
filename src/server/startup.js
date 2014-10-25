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

  this._logPrefix = util.getLogPrefix();

  this.worker = options.worker;
  if (!this.worker) {
    throw new Error('Need to provide a worker callback!');
  }
  util.verifyType('function', this, 'worker');

  this.log = options.log || logShim('thehelp-cluster:startup');
  util.verifyLog(this.log);

  this.masterOptions = options.masterOptions;
  this.master = options.master || this._defaultMasterStart.bind(this);
  util.verifyType('function', this, 'master');

  this.graceful = options.graceful || Graceful.instance;
  // graceful supercedes messenger
  if (!this.graceful) {
    this.messenger = options.messenger || require('thehelp-last-ditch');
    util.verifyType('function', this, 'messenger');
  }
  else {
    util.verifyGraceful(this.graceful);
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

If [`Graceful.instance`](./graceful.html) has been provided, its `shutdown()` method will
be called, preventing the `messenger()` handler from being called.
*/
Startup.prototype._onError = function _onError(err) {
  var _this = this;

  //Don't want the entire domain object to pollute the log entry for this error
  delete err.domain;
  delete err.domainEmitter;

  this.log.error(this._logPrefix + ' top-level domain error, taking down process: ' +
    core.breadcrumbs.toString(err));

  if (this.graceful) {
    return this.graceful.shutdown(err);
  }

  this.messenger(err, null, function() {
    _this._process.kill(_this._process.pid, 'SIGTERM');
  });
};

// `_defaultMasterStart` what starts up the master process if you don't provide your own
// `master` startup function.
Startup.prototype._defaultMasterStart = function _defaultMasterStart() {
  var Master = require('./master');
  var master = new Master(this.masterOptions);
  master.start();
};
