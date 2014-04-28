// # GracefulWorker
// Encapsulates everything needed to shut down a worker process without interrupting
// anything important, even active requests on an http server.

// [strict mode](http://mzl.la/1fRhnam)
'use strict';

var cluster = require('cluster');
var _ = require('lodash');
var winston = require('winston');

var lastDitch = require('thehelp-last-ditch');

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
function GracefulWorker(options) {
  /*jshint maxcomplexity: 8 */

  options = options || {};

  this.checks = [];
  this.closed = false;

  this.pollInterval = options.pollInterval || 250;
  this.timeout = options.pollInterval || 5 * 1000;
  this.messenger = options.messenger || lastDitch;
  this.setServer(options.server);

  var _this = this;
  this.sending = false;
  this.addCheck(function() {
    return _this.sending === false;
  });

  this.cluster = options.cluster || cluster;
  if (this.cluster.worker) {
    this.cluster.worker.on('disconnect', function() {
      _this.shutdown();
    });
  }
  else {
    winston.warn('Not started in the context of a cluster. On errors, will shut down ' +
      'with no replacement.');
  }

  this.process = options.process || process;
  this.process.on('SIGTERM', function() {
    _this.shutdown();
  });
  this.process.on('exit', function(code) {
    winston.warn('Worker about to exit with code', code);
  });
}

module.exports = GracefulWorker;

// `setServer` is the more common way to supply an http server to this class.
GracefulWorker.prototype.setServer = function(server) {
  var _this = this;

  if (server) {
    this.server = server;

    this.server.on('close', function() {
      winston.info('No more active sockets! Starting shutdown process...');
      _this.exit();
    });
  }
};

// `shutdown` is the key method for interacting with this class. When something goes
// wrong, call this method with the error and any additional information (like the `url`
// being serviced). The http server will be stopped, the error will be saved/sent via
// `this.messenger` and we'll start the process of checking to see if we can take down the
// process via `this.exit()`.
GracefulWorker.prototype.shutdown = function(err, info) {
  if (!this.closed) {
    this.closed = true;
    this.error = err;

    winston.warn('Gracefully shutting down!');
    this.stopServer();
    this.sendError(err, info);
    this.exit();
  }
  else {
    winston.warn('Already in the process of shutting down');
  }
};

// `middleware` should be installed as a global middleware, before anything that might end
// a request, so that it can close keepalive connections when we're trying to shut down
// the server.
GracefulWorker.prototype.middleware = function(req, res, next) {
  if (this.closed) {
    res.setHeader('Connection', 'Connection: close');
  }

  next();
};

// `addCheck` allows you to provide a callback you can use to delay `process.exit()` until
// you are finished doing something.
GracefulWorker.prototype.addCheck = function(check) {
  this.checks.push(check);
};

// `hasShutdown` tells you if a shutdown is in-process.
GracefulWorker.prototype.hasShutdown = function() {
  return closed;
};

// Helper methods
// ========

// `sendError` uses `this.messenger` to save/send the error provided to `shutdown()`. It
// it sets `this.sending` to `true` so we won't take the process down before the call is
// complete.
GracefulWorker.prototype.sendError = function(err, info) {
  var _this = this;

  if (err) {
    this.sending = true;

    this.messenger(err, info, function() {
      _this.sending = false;
    });
  }
};

// `stopServer` tells the http server to stop accepting new connections. Unfortunately,
// this isn't enough, as it will continue to service new requests made on already-existing
// keepalive connections.
GracefulWorker.prototype.stopServer = function() {
  if (this.server) {
    try {
      this.server.close();
    }
    catch (err) {
      winston.info('Couldn\'t close server: ' + err.message);
    }
  }
};

// `check` returns true if all check methods returned true.
GracefulWorker.prototype.check = function() {
  if (!this.checks || !this.checks.length) {
    return true;
  }
  return _.all(this.checks, function(check) {
    return check();
  });
};

// `exit` exits if `check()` returns true. Otherwise it sets an interval to continue
// trying. It also sets a timer - if we never get a successful `check()` call, we
// take down the process anyway.
GracefulWorker.prototype.exit = function() {
  var _this = this;

  winston.info('Calling all provided pre-exit check functions...');

  if (this.closed && this.check()) {
    if (this.interval) {
      clearInterval(this.interval);
    }
    if (this.timeout) {
      clearTimeout(this.timeout);
    }
    _this.finalLog('Passed all checks! Shutting down!');
  }
  else if (!this.interval) {
    this.interval = setInterval(function() {
      _this.exit();
    }, this.pollInterval);

    this.timeout = setTimeout(function() {
      _this.timeout = null;
      _this.finalLog('Checks took too long. Killing process now!');
    }, this.timeout);
  }
};

/*
`finalLog` makes a final winston log, and takes down the process when winston tells us
that the log is complete.

Unfortunately, because sometimes winston gets a bit messed up after unhandled exceptions,
we also set a timer to make sure to take process down even if winston doesn't call the
callback.
*/
GracefulWorker.prototype.finalLog = function(message) {
  var _this = this;

  winston.info(message, function(err, level, msg, meta) {
    /*jshint unused: false */
    _this.die();
  });

  setTimeout(function() {
    _this.die();
  }, 1000);
};

// `die` calls `process.exit()` with the right error code based on `this.error` (set in
// `shutdown()`).
GracefulWorker.prototype.die = function() {
  var code = this.error ? this.error.code || 1 : 0;
  process.exit(code);
};
