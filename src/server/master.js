// # Master
// A simple class to manage a number of worker processes via node's core `cluster` module.
// Supports graceful shutdown via the `SIGTERM` signal, as well as detection child
// processes crashing too quickly after launch.

// [strict mode](http://mzl.la/1fRhnam)
'use strict';

var cluster = require('cluster');
var os = require('os');

var winston = require('winston');
var _ = require('lodash');

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
  /*jshint maxcomplexity: 10 */

  _.bindAll(this);

  options = options || {};

  this.spinTimeout = options.spinTimeout || 5000;
  this.delayStart = options.delayStart || 60 * 1000;
  this.pollInterval = options.pollInterval || 500;
  this.killTimeout = options.killTimeout || 7000;
  this.numberWorkers = options.numberWorkers || parseInt(process.env.NUMBER_WORKERS) || 0;

  this.workers = {};
  this.shutdown = false;

  this.cluster = options.cluster || cluster;
  this.cluster.on('disconnect', this.restartWorker);

  this.process = options.process || process;
  this.process.on('SIGTERM', this.gracefulShutdown);

  this.process.on('exit', function(code) {
    winston.warn('Master about to exit with code:', code);
  });

  Master.instance = this;
}

module.exports = Master;

// `start` gets all the requested worker processes started
Master.prototype.start = function() {
  winston.warn('Starting master');
  var workers = this.numberWorkers || os.cpus().length;
  for (var i = 0; i < workers; i = i + 1) {
    this.startWorker();
  }
};

// `gracefulShutdown` uses `stop` to kill all workers, then shuts down this process as
// soon as no more workers are alive.
Master.prototype.gracefulShutdown = function(err) {
  winston.warn('Gracefully shutting down master!');

  this.stop();
  var crashErr = err;

  setInterval(function() {
    if (!Object.keys(cluster.workers).length) {
      winston.info('All workers gone. exiting process!', function(err, level, msg, meta) {
        /*jshint unused: false */
        var code = crashErr ? crashErr.code || 1 : 0;
        process.exit(code);
      });

    }
    else {
      winston.info('Still some workers alive...');
    }
  }, this.pollInterval);
};

// Helper functions
// ========

// `stop` kills all worker processes, first using a 'SIGTERM' signal to allow for graceful
// shutdown. If the process isn't dead by `this.killTimeout` a 'SIGINT' signal is sent.
Master.prototype.stop = function() {
  var _this = this;
  winston.warn('Stopping all workers');

  this.shutdown = true;

  _(cluster.workers).values().forEach(function(worker) {
    var pid = worker.process.pid;
    process.kill(pid, 'SIGTERM');

    setTimeout(function() {
      if (_this.workers[pid]) {
        process.kill(pid, 'SIGINT');
      }
    }, _this.killTimeout);
  });
};

// `startWorker` does a basic `cluster.fork()`, saving the result and the current time to
// `this.workers`.
Master.prototype.startWorker = function() {
  var worker = this.cluster.fork();
  var pid = worker.process.pid;
  this.workers[pid] = {
    pid: pid,
    id: worker.id,
    start: new Date()
  };
};

// `restartWorker` first eliminates the dead worker from `this.workers`, then either
// starst a new worker immediately, or after a delay of `this.delayStart` if the process
// wasn't alive for longer than `this.spinTimeout`.
Master.prototype.restartWorker = function(worker) {
  var _this = this;

  var pid = worker.process.pid;
  var data = this.workers[pid];
  delete this.workers[pid];

  if (!this.shutdown) {
    var now = new Date();
    var start = data ? data.start : now;
    var delta = now.getTime() - start.getTime();

    if (data && delta < this.spinTimeout) {
      winston.error('Worker ' + worker.id + ' (pid: ' + pid +
        ') died after less than spin timeout of ' + this.spinTimeout + 'ms. Waiting ' +
        'for ' + this.delayStart + 'ms before starting replacement');

      setTimeout(function() {
        winston.warn('Starting delayed replacement worker');
        _this.startWorker();
      }, this.delayStart);
    }
    else {
      winston.warn('Starting replacement worker!');
      this.startWorker();
    }

    if (Object.keys(cluster.workers).length === 0) {
      winston.error('No workers currently running!');
    }
  }
};


