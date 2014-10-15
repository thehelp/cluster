// # Master
// A simple class to manage a number of worker processes via node's core `cluster` module.
// Supports graceful shutdown via the `SIGTERM` signal, as well as detection child
// processes crashing too quickly after launch.

'use strict';

var cluster = require('cluster');

var Graceful = require('./graceful');
var util = require('./util');

/*
The `constructor` has no required parameters.   Optional parameters:

+ `spinTimeout` - how long a process needs to stay up after launch for a crash to be
considered 'normal.'
+ `delayStart` - if a process crashes too fast, how long to wait before starting another
+ `pollInterval` - when gracefully shutting down, how frequently to check for zero
remaining worker processes
+ `killTimeout` - how long to wait after sending 'SIGTERM` to follow up it with a 'SIGINT'
for a more decisive kill
+ `numberWorkers` - worker processes to start and maintain. defaults to `os.cpus().length`

*/
function Master(options) {
  /*jshint maxcomplexity: 12 */

  options = options || {};

  this.spinTimeout = options.spinTimeout || 5000;
  this.delayStart = options.delayStart || 60 * 1000;
  this.pollInterval = options.pollInterval || 500;
  this.killTimeout = options.killTimeout || 7000;
  this.numberWorkers = options.numberWorkers ||
    parseInt(process.env.THEHELP_NUMBER_WORKERS, 10) || 1;

  this.workers = {};
  this.closed = false;

  this.cluster = options.cluster || cluster;
  this.cluster.on('disconnect', this._restartWorker.bind(this));

  this.log = options.log || util.logShim('thehelp-cluster:master');
  this.setGraceful(options.graceful || Graceful.instance);

  if (Master.instance) {
    this.log.warn('More than one Master instance created in this process. ' +
      'You\'ll have more worker processes than you signed up for!');
  }
  Master.instance = this;
}

module.exports = Master;

// `start` gets all the requested worker processes started
Master.prototype.start = function start() {
  this.log.warn('Starting master');
  for (var i = 0; i < this.numberWorkers; i = i + 1) {
    this._startWorker();
  }
};

// `setGraceful` is a way to provide the reference after construction. We register with
// `Graceful` to shutdown when it starts the shutdown process, as well as to let it know
// when workers are still alive. With this in place, you won't need to call `shutdown()`
// or `stop()` yourself.
Master.prototype.setGraceful = function setGraceful(graceful) {
  var _this = this;

  if (graceful) {
    this.graceful = graceful;

    //default timeout for sending SIGINT is longer than timeout for Graceful force kill
    this.graceful.timeout = this.killTimeout + this.pollInterval * 2;

    this.graceful.on('shutdown', function stopWorkers() {
      _this.shutdown();
    });

    this.graceful.addCheck(function areWorkersActive() {
      return !_this.workersActive;
    });
  }
};

// `shutdown` uses `stop` to kill all workers, then sets `this.workersActive` back to
// false so `Graceful` knows that it's safe to take the process down.
Master.prototype.shutdown = function shutdown() {
  var _this = this;

  this.workersActive = true;
  this.stop(function() {
    _this.workersActive = false;
  });
};

// `stop` kills all worker processes, first using a 'SIGTERM' signal to allow for graceful
// shutdown. If the process isn't dead by `this.killTimeout` a 'SIGINT' signal is sent.
Master.prototype.stop = function stop(cb) {
  var _this = this;
  this.log.info('Stopping all workers with SIGTERM...');

  this.closed = true;
  this._sendToAll('SIGTERM');

  var timeout = setTimeout(function forceKill() {
    timeout = null;
    _this.log.warn('Shutdown delayed; sending SIGINT to all remaining workers...');
    _this._sendToAll('SIGINT');
  }, _this.killTimeout);

  var interval = setInterval(function checkAndReturn() {
    if (!Object.keys(_this.cluster.workers).length) {

      clearInterval(interval);
      if (timeout) {
        clearTimeout(timeout);
      }

      _this.log.info('All workers gone.');
      return cb();
    }
    else {
      _this.log.info('Still some workers alive...');
    }
  }, this.pollInterval);
};

// Helper functions
// ========

// `_startWorker` does a basic `cluster.fork()`, saving the result and the current time to
// `this.workers`.
Master.prototype._startWorker = function _startWorker() {
  var worker = this.cluster.fork();
  var pid = worker.process.pid;
  this.workers[pid] = {
    pid: pid,
    id: worker.id,
    start: new Date()
  };
};

// `_restartWorker` first eliminates the dead worker from `this.workers`, then either
// starts a new worker immediately, or after a delay of `this.delayStart` if the process
// wasn't alive for longer than `this.spinTimeout`.
Master.prototype._restartWorker = function _restartWorker(worker) {
  var _this = this;

  var pid = worker.process.pid;
  var data = this.workers[pid];
  delete this.workers[pid];

  if (!this.closed) {
    var now = new Date();
    var start = data ? data.start : now;
    var delta = now.getTime() - start.getTime();

    if (data && delta < this.spinTimeout) {
      this.log.error('Worker #' + worker.id + ' (pid: ' + pid +
        ') died after less than spin timeout of ' + this.spinTimeout + 'ms. Waiting ' +
        'for ' + this.delayStart + 'ms before starting replacement');

      setTimeout(function() {
        _this.log.warn('Starting delayed replacement for worker #' + worker.id);
        _this._startWorker();
      }, this.delayStart);
    }
    else {
      this.log.warn('Starting replacement for worker #' + worker.id);
      this._startWorker();
    }

    if (Object.keys(this.cluster.workers).length === 0) {
      this.log.error('No workers currently running!');
    }
  }
};

// `_sendToAll` sends the provided signal to each worker still listed in `this.workers`
Master.prototype._sendToAll = function _sendToAll(signal) {
  var keys = Object.keys(this.cluster.workers);

  for (var i = 0, max = keys.length; i < max; i += 1) {
    var key = keys[i];
    var worker = this.cluster.workers[key];
    var pid = worker.process.pid;

    if (this.workers[pid]) {
      process.kill(pid, signal);
    }
  }
};
