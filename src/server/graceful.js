/*
# Graceful

Encapsulates everything needed to shut down a worker process without interrupting
anything important, even active requests on an http server.

There are three major ways to interact with an instance of this class:

1. Kick off shutdown by calling `shutdown()` with or without the error object that
initiated the shutdown.
2. Register for notification on shutdown with `on('shutdown', fn)`. This is a good time
to close all open resources, do last bits of work.
3. Register a 'check' function with `addCheck(fn)` to delay shutdown if shutdown work
is still happening. Return true if we're okay to stop the process, false if work is still
going on. By default you only have five seconds before the process will be terminated even
if you're not ready.

*/
'use strict';

var cluster = require('cluster');
var EventEmitter = require('events').EventEmitter;
var util = require('util');

var core = require('thehelp-core');
var logShim = require('thehelp-log-shim');

var localUtil = require('./util');


/*
The `constructor` has no required parameters. Optional parameters:

+ `pollInterval` - how often to attempt to take down process by first checking all
registered 'ready to stop process' check functions
+ `timeout` - how long to wait for the 'ready to stop process' checks before taking the
process down forcefully
+ `messenger` - a `function(err, options, cb)` that gets the information supplied to the
`shutdown()` method. Defaults to `thehelp-last-ditch`.
+ `log` - a logger object: `info`, `warn` and `error` keys with the signature
`function(string)`. By default, whatever `thehelp-log-shim` gives us.

_Note: it's recommended to create an instance of this class just once per process, since
it listens for a number of process-level events. See `_setupListeners()` below._
*/
function Graceful(options) {
  /*jshint maxcomplexity: 9 */

  options = options || {};

  this.shuttingDown = false;

  this._checks = [];
  this._sending = false;

  this.pollInterval = options.pollInterval || 250;
  localUtil.verifyType('number', this, 'pollInterval');

  this.timeout = options.timeout || 5 * 1000;
  localUtil.verifyType('number', this, 'timeout');

  this.messenger = options.messenger || require('thehelp-last-ditch');
  localUtil.verifyType('function', this, 'messenger');

  this.log = options.log || logShim('thehelp-cluster:graceful');
  localUtil.verifyLog(this.log);

  var _this = this;
  this.addCheck(function areWeSending() {
    return _this._sending === false;
  });

  this._process = options._process || process;
  this._cluster = options._cluster || cluster;
  this._logPrefix = localUtil.getLogPrefix();
  this._setupListeners();

  if (Graceful.instance) {
    this.log.warn('More than one Graceful instance created in this process. ' +
      'There are now duplicate process-level wireups!');
  }
  Graceful.instance = this;
}

util.inherits(Graceful, EventEmitter);

module.exports = Graceful;

// Public methods
// ========

// A quick helper function, since other classes use `Graceful.instance` to find their
// reference to your created `Graceful` object; you don't have to keep the instance
// around. Only creates a new instance if no previous instance has been created in this
// process.
Graceful.start = function start(options) {
  if (Graceful.instance) {
    return Graceful.instance;
  }
  return new Graceful(options);
};

/*
`shutdown` is the key method for interacting with this class. When something goes
wrong, call this method with the error and any additional information (like the `url`
being serviced). The http server will be stopped, the error will be saved/sent via
`this.messenger` and we'll start the process of checking to see if we can take down the
process via `this._exit()`.

_Note: to be notified when this method is called, register for the 'shutdown' event
(`Graceful` is an `EventEmitter`):_

```
graceful.on('shutdown', function() {
  // do stuff to prepare for shutdown
})
```
*/
Graceful.prototype.shutdown = function shutdown(err, info) {
  if (!this.shuttingDown) {
    this.shuttingDown = true;
    this.error = err;

    this.log.warn(this._logPrefix + ' gracefully shutting down!');
    this._sendError(err, info);
    try {
      this.emit('shutdown');
    }
    catch (err) {
      this.log.error('Graceful: shutdown event handler threw: ' +
        core.breadcrumbs.toString(err));
    }
    this._exit();
  }
};

// `addCheck` allows you to provide a callback you can use to delay `process.exit()` until
// you are finished doing something. Return something truthy to signal your readiness for
// `process.exit()`.
Graceful.prototype.addCheck = function addCheck(check) {
  if (!check || typeof check !== 'function') {
    throw new Error('need to provide a function!');
  }
  this._checks.push(check);
};

// Helper methods
// ========

// `_sendError` uses `this.messenger` to save/send the error provided to `shutdown()`. It
// it sets `this._sending = true` so we won't take the process down before the call is
// complete.
Graceful.prototype._sendError = function _sendError(err, info) {
  var _this = this;

  if (err) {
    this._sending = true;

    this.messenger(err, info, function() {
      _this._sending = false;
    });
  }
};

// `_check` returns true if all registered check methods returned true.
Graceful.prototype._check = function _check() {
  if (!this._checks || !this._checks.length) {
    return true;
  }

  for (var i = 0, max = this._checks.length; i < max; i += 1) {
    var check = this._checks[i];

    try {
      if (!check()) {
        return false;
      }
    }
    catch (err) {
      this.log.error('Graceful: check function threw: ' + core.breadcrumbs.toString(err));
    }
  }

  return true;
};

// `_exit` _exits if `check()` returns true. Otherwise it sets an interval to continue
// trying. It also sets a timer - if we never get a successful `check()` call, we
// take down the process anyway.
Graceful.prototype._exit = function _exit() {
  var _this = this;

  this.log.info(this._logPrefix + ' calling all provided pre-exit check functions...');

  if (this._check()) {
    this._clearTimers();
    this._finalLog('info', this._logPrefix + ' passed all checks! Shutting down!');
  }
  else if (!this.interval) {
    this.interval = setInterval(function tryAgain() {
      _this._exit();
    }, this.pollInterval);

    this.timeout = setTimeout(function forceKill() {
      _this._clearTimers();
      _this._finalLog('warn', _this._logPrefix + ' checks took too long. ' +
        'Killing process now!');

    }, this.timeout);
  }
};

// `_clearTimers` properly gets rid of the timers created in `_exit()`
Graceful.prototype._clearTimers = function _clearTimers() {
  if (this.interval) {
    clearInterval(this.interval);
    this.interval = null;
  }
  if (this.timeout) {
    clearTimeout(this.timeout);
    this.timeout = null;
  }
};

/*
`_finalLog` makes a final log entry then waits until the next turn of the event loop to
call process exit, attempting to give the filesystem enough time to flush to disk.
*/
Graceful.prototype._finalLog = function _finalLog(type, message) {
  this.log[type](message);
  setTimeout(this._die.bind(this), 0);
};

// `_die` calls `process._exit()` with the right error code based on `this.error` (set in
// `shutdown()`).
Graceful.prototype._die = function _die() {
  var code = this.error ? this.error.exitCode || 1 : 0;
  this._process.exit(code);
};

// `_setupListeners` sets up some event wireups. We start the shutdown process when the
// process gets a 'SIGTERM' signal, or when the master worker disconnects. And we log
// on process exit.
Graceful.prototype._setupListeners = function _setupListeners() {
  var _this = this;
  var cluster = this._cluster;
  var process = this._process;

  process.on('SIGTERM', function gracefulShutdown() {
    _this.shutdown();
  });

  process.on('exit', function(code) {
    _this.log.warn(_this._logPrefix + ' about to exit with code ' + code);
  });

  if (cluster.worker) {
    cluster.worker.on('disconnect', function gracefulShutdown() {
      _this.shutdown();
    });
  }
};
