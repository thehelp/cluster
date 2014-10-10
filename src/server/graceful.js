// # Graceful
// Encapsulates everything needed to shut down a worker process without interrupting
// anything important, even active requests on an http server.

// [strict mode](http://mzl.la/1fRhnam)
'use strict';

var cluster = require('cluster');
var EventEmitter = require('events').EventEmitter;
var util = require('util');

var localUtil = require('./util');

/*
The `constructor` has no required parameters. Optional parameters:

+ `pollInterval` - how often to attempt to take down process by first checking all
registered 'ready to stop process' check functions
+ `timeout` - how long to wait for the 'ready to stop process' checks before taking the
process down forcefully
+ `messenger` - a `function(err, options, cb)` that gets the information supplied to the
`shutdown()` method. Defaults to `thehelp-last-ditch`.
+ `log` - an object that looks like `winston`, allowing you to use your own logging
system: `info`, `warn` and `error` keys with the signature `function(string)`.

_Note: it's recommended to create an instance of this class once per process, since it
listens for a number of process-level events, making itself the handler for them. See
`_setupListeners()` below._
*/
function Graceful(options) {
  /*jshint maxcomplexity: 8 */

  options = options || {};

  this.closed = false;

  this.pollInterval = options.pollInterval || 250;
  this.timeout = options.timeout || 5 * 1000;
  this.messenger = options.messenger || require('thehelp-last-ditch');

  this.checks = [];
  this.sending = false;

  var _this = this;
  this.addCheck(function areWeSending() {
    return _this.sending === false;
  });

  this.process = options.process || process;
  this.cluster = options.cluster || cluster;
  this.log = options.log || require('winston');

  this.logPrefix = localUtil.getLogPrefix();
  this._setupListeners();

  Graceful.instance = this;
}

util.inherits(Graceful, EventEmitter);

module.exports = Graceful;

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
  if (!this.closed) {
    this.closed = true;
    this.error = err;

    this.log.warn(this.logPrefix + ' gracefully shutting down!');
    this._sendError(err, info);
    this.emit('shutdown');
    this._exit();
  }
};

// `addCheck` allows you to provide a callback you can use to delay `process.exit()` until
// you are finished doing something.
Graceful.prototype.addCheck = function addCheck(check) {
  this.checks.push(check);
};

// Helper methods
// ========

// `_sendError` uses `this.messenger` to save/send the error provided to `shutdown()`. It
// it sets `this.sending` to `true` so we won't take the process down before the call is
// complete.
Graceful.prototype._sendError = function _sendError(err, info) {
  var _this = this;

  if (err) {
    this.sending = true;

    this.messenger(err, info, function() {
      _this.sending = false;
    });
  }
};

// `_check` returns true if all registered check methods returned true.
Graceful.prototype._check = function _check() {
  if (!this.checks || !this.checks.length) {
    return true;
  }

  for (var i = 0, max = this.checks.length; i < max; i += 1) {
    var check = this.checks[i];

    if (!check()) {
      return false;
    }
  }

  return true;
};

// `_exit` _exits if `check()` returns true. Otherwise it sets an interval to continue
// trying. It also sets a timer - if we never get a successful `check()` call, we
// take down the process anyway.
Graceful.prototype._exit = function _exit() {
  var _this = this;

  this.log.info(this.logPrefix + ' calling all provided pre-exit check functions...');

  if (this.closed && this._check()) {
    this._clearTimers();
    this._finalLog('info', this.logPrefix + ' passed all checks! Shutting down!');
  }
  else if (!this.interval) {
    this.interval = setInterval(function tryAgain() {
      _this._exit();
    }, this.pollInterval);

    this.timeout = setTimeout(function forceKill() {
      _this._clearTimers();
      _this._finalLog('warn', _this.logPrefix + ' checks took too long. ' +
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
`_finalLog` makes a final winston log, and takes down the process when winston tells us
that the log is complete.

Unfortunately, because sometimes winston gets a bit messed up after unhandled exceptions,
we also set a timer to make sure to take process down even if winston doesn't call the
callback.
*/
Graceful.prototype._finalLog = function _finalLog(type, message) {
  var _this = this;

  var die = localUtil.once(function() {
    _this._die();
  });

  this.log[type](message, function(err, level, msg, meta) {
    /*jshint unused: false */
    die();
  });

  setTimeout(die, 250);
};

// `_die` calls `process._exit()` with the right error code based on `this.error` (set in
// `shutdown()`).
Graceful.prototype._die = function _die() {
  var code = this.error ? this.error.code || 1 : 0;
  this.process.exit(code);
};

// `_setupListeners` sets up some event wireups. We start the shutdown process when the
// process gets a 'SIGTERM' signal, or when the master worker disconnects. And we log
// on process exit.
Graceful.prototype._setupListeners = function _setupListeners() {
  var _this = this;
  var cluster = this.cluster;
  var process = this.process;

  process.on('SIGTERM', function gracefulShutdown() {
    _this.shutdown();
  });

  process.on('exit', function(code) {
    _this.log.warn(_this.logPrefix + ' about to exit with code', code);
  });

  if (cluster.worker) {
    cluster.worker.on('disconnect', function gracefulShutdown() {
      _this.shutdown();
    });
  }
};
