// # Graceful
// Encapsulates everything needed to shut down a worker process without interrupting
// anything important, even active requests on an http server.

// [strict mode](http://mzl.la/1fRhnam)
'use strict';

var cluster = require('cluster');
var EventEmitter = require('events').EventEmitter;
var util = require('util');

var winston = require('winston');

/*
The `constructor` has no required parameters. Optional parameters:

+ `pollInterval` - how often to attempt to take down process by first checking all
registered 'ready to stop process' check functions
+ `timeout` - how long to wait for the 'ready to stop process' checks before taking the
process down forcefully
+ `messenger` - a `function(err, options, cb)` that gets the information supplied to the
`shutdown()` method. Defaults to `thehelp-last-ditch`.
+ `server` - the http server to be shut down. Usually not provided on construction because
`this.middleware` should be installed as a global express handler, and the http server
will not have been created it. Use `setServer()` instead.

*/
function Graceful(options) {
  /*jshint maxcomplexity: 8 */

  options = options || {};

  this.closed = false;

  this.pollInterval = options.pollInterval || 250;
  this.timeout = options.pollInterval || 5 * 1000;
  this.messenger = options.messenger || require('thehelp-last-ditch');

  this.checks = [];
  this.sending = false;

  var _this = this;
  this.addCheck(function areWeSending() {
    return _this.sending === false;
  });

  this.process = options.process || process;
  this.cluster = options.cluster || cluster;
  this.log = options.log || winston;

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

Note: to be notified when this method is called, register for the 'shutdown' event:

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

    this.log.warn('Gracefully shutting down!');
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

  this.log.info('Calling all provided pre-exit check functions...');

  if (this.closed && this._check()) {
    if (this.interval) {
      clearInterval(this.interval);
    }
    if (this.timeout) {
      clearTimeout(this.timeout);
    }
    _this._finalLog('Passed all checks! Shutting down!');
  }
  else if (!this.interval) {
    this.interval = setInterval(function() {
      _this._exit();
    }, this.pollInterval);

    this.timeout = setTimeout(function() {
      _this.timeout = null;
      _this._finalLog('Checks took too long. Killing process now!');
    }, this.timeout);
  }
};

/*
`_finalLog` makes a final winston log, and takes down the process when winston tells us
that the log is complete.

Unfortunately, because sometimes winston gets a bit messed up after unhandled exceptions,
we also set a timer to make sure to take process down even if winston doesn't call the
callback.
*/
Graceful.prototype._finalLog = function _finalLog(message) {
  var _this = this;

  this.log.info(message, function(err, level, msg, meta) {
    /*jshint unused: false */
    _this._die();
  });

  setTimeout(function() {
    _this._die();
  }, 1000);
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

  if (cluster.worker) {
    var id = cluster.worker.id;

    cluster.worker.on('disconnect', function gracefulShutdown() {
      _this.shutdown();
    });

    process.on('exit', function(code) {
      _this.log.warn('Worker #' + id +  ' about to exit with code', code);
    });
  }
  else {
    process.on('exit', function(code) {
      _this.log.warn('About to exit with code:', code);
    });
  }
};
