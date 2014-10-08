// # Startup
// A class to encompass both dual master/worker cluster launch and installation of a
// top-level domain for the process.

// [strict mode](http://mzl.la/1fRhnam)
'use strict';

var cluster = require('cluster');
var domain = require('domain');
var path = require('path');

var _ = require('lodash');
var winston = require('winston');

var core = require('thehelp-core');
var Graceful = require('./graceful');

/*
The `constructor` requires only one parameter `worker`, a callback which
starts a worker process. Optional parameters:

+ `master` - a callback to start the cluster's master process
+ `messenger` -  a `function(err, options, cb)`, defaulting to
`thehelp-last-ditch`. Passed any top-level exceptions encountered.
+ `errorHandler` - an alternate handler for a top-level error. Prevents `messenger` from
being called, and prevents any kind of automatic graceful shutdown.

*/
function Startup(options) {
  /*jshint maxcomplexity: 9 */

  _.bindAll(this);

  options = options || {};

  this.logs = options.logs || process.env.LOGS || './logs/';

  this.master = options.master || function defaultMaster() {
    var Master = require('./master');
    var master = new Master({
      graceful: new Graceful()
    });
    master.start();
  };

  this.worker = options.worker;
  if (!this.worker) {
    throw new Error('Need to provide a worker callback!');
  }

  this.errorHandler = options.errorHandler;
  //errorHandler supercedes messenger
  if (!this.errorHandler) {
    this.messenger = options.messenger || require('thehelp-last-ditch');
  }

  this.domain = domain.create();
  this.domain.on('error', this.onError);

  this.cluster = options.cluster || cluster;
}

module.exports = Startup;

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

// Helper methods
// ========

// `timestampForPath` makes `toISOString()` timestamps safe for filenames.
Startup.prototype.timestampForPath = function timestampForPath() {
  var result = core.logs.timestamp();
  result = result.replace(':', '-');
  return result;
};

// `setupLogs` sets up colorful, formatted console logging as well as a file appropriate
// to the process type. Files are of the form 'worker-2014-04-28T03-04:03.232Z-32706.log'
// in the `logs` directory.
Startup.prototype.setupLogs = function setupLogs() {
  var type = this.cluster.isMaster ? 'master' : 'worker';
  core.logs.setupFile(path.join(
    this.logs,
    type + '-' + this.timestampForPath() + '-' + process.pid + '.log'
  ));
  core.logs.setupConsole();
};

/*
`onError` is called when the top-level domain is sent an error. Whenever this happens
it's definitely something serious, so we log the error via winston, then send it via the
`messenger` callback, and finally start the process of graceful shutdown.

First we try to shutdown an active [`Master`](./master.html) instance. Then we try for
a [`Graceful`](./graceful.html) instance. If we can find none of these, we
send a generic 'SIGTERM' signal to the current process.

`errorHandler` can be specified for custom error-handling logic, superceding all `onError`
behavior described above.
*/
Startup.prototype.onError = function onError(err) {
  if (this.errorHandler) {
    return this.errorHandler(err);
  }

  winston.error('Top-level error; shutting down: ' + err.stack);

  //Don't want the entire domain object to pollute the log entry for this error
  delete err.domain;

  if (Graceful.instance) {
    return Graceful.instance.shutdown(err);
  }

  this.messenger(err, null, function() {
    process.kill(process.pid, 'SIGTERM');
  });
};
