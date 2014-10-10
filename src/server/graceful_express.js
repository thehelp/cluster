/*
# GracefulExpress

Working with the `Graceful` class, provides full graceful shutdown for an
`express`-based server:

1. Each request is wrapped a domain to ensure that even if an exception is thrown in a
callback the client receives a response. If wired up, `Graceful` is notified of the error,
and starts the shutdown process.
2. It keeps track of all active requests so we know when it is safe to shut down. It helps
break through still-active keepalive connections keeping sockets open, preventing the
'close' event from being fired.

*/
'use strict';

var domain = require('domain');

/*
The `constructor` has some optional parameters:

+ `graceful` - if set either on construction or later with `setGraceful()`, `shutdown()`
will be called with any unhandled error encountered.
+ `development` - if set to true, will prevent domains from being set up for every
request, enabling in-process testing of your endpoints, as is often done with `supertest`.
+ `server` - the http server, though unlikely to be available on construction of this
class. More likely you'll use 'setServer()` later.
*/
function GracefulExpress(options) {
  options = options || {};

  this.server = null;
  this.closed = false;
  this.activeRequests = 0;

  this.development = options.development;
  if (typeof this.development === 'undefined') {
    this.development = (process.env.NODE_ENV === 'development');
  }

  //both here for symmetry; unlikely that both of these are avalable on construction
  this.setGraceful(options.graceful);
  this.setServer(options.server);

  this.middleware = this.middleware.bind(this);
}

module.exports = GracefulExpress;

// `setGraceful` is a way to provide the reference after construction.
GracefulExpress.prototype.setGraceful = function setGraceful(graceful) {
  var _this = this;

  if (graceful) {
    this.graceful = graceful;

    this.graceful.on('shutdown', function domainStopServer() {
      _this._stopServer();
    });

    this.graceful.addCheck(function domainActiveRequests() {
      return _this.development || _this.activeRequests === 0;
    });
  }
};

// `setServer` is the more common way to supply an http server to this class.
GracefulExpress.prototype.setServer = function setServer(server) {
  var _this = this;

  if (server) {
    this.server = server;

    this.server.on('close', function gracefulShutdown() {
      if (_this.graceful) {
        _this.graceful.shutdown();
      }
    });
  }
};

// `middleware` should be added as a global middleware, before any handler that might stop
// the processing chain. It wires up a domain to capture any errors produced by the rest
// of that request's handlers.
GracefulExpress.prototype.middleware = function middleware(req, res, next) {
  var _this = this;
  var d = domain.create();

  this._onStart(req);

  d.add(req);
  d.add(res);

  // bind to all three to be completely sure; handler only called once
  var finish = this._once(function() {
    _this._onFinish(req);
  });
  res.on('finish', finish);
  res.on('close', finish);
  res.on('end', finish);

  d.on('error', function(err) {
    _this._onError(err, req, res, next);
  });

  if (this.closed) {
    this._closeConnection(res);
  }

  if (this.development) {
    next();
  }
  else {
    d.run(next);
  }
};

// Helper functions
// ========

// `_stopServer` tells the http server to stop accepting new connections. Unfortunately,
// this isn't enough, as it will continue to service new requests made on already-existing
// keepalive connections.
GracefulExpress.prototype._stopServer = function _stopServer() {
  this.closed = true;

  if (this.server) {
    try {
      this.server.close();
    }
    catch (e) {}
  }
};

// `_closeConnection` tells any keepalive collection to close. Again, unfortunately not
// enough because some keepalive connections will not make any requests as we're shutting
// down.
GracefulExpress.prototype._closeConnection = function _closeConnection(res) {
  res.setHeader('Connection', 'Connection: close');
};

/*
`_onError` is the method called when a request domain catches an error. It

  1. closes the http keepalive connection
  2. starts a graceful shutdown if we have a `Graceful` instance
  3. and passes the error to the registered express error handler
*/
GracefulExpress.prototype._onError = function _onError(err, req, res, next) {
  this._closeConnection(res);

  //Don't want the entire domain object to pollute the log entry for this error
  delete err.domain;

  if (this.graceful) {
    this.graceful.shutdown(err, req);
  }

  next(err);
};

// `_onStart` increments the in-progress request count.
GracefulExpress.prototype._onStart = function _onStart() {
  this.activeRequests += 1;
};

// `_onFinish` decrements the in-progress request count.
GracefulExpress.prototype._onFinish = function _onFinish() {
  this.activeRequests -= 1;
};

// `_once` ensures that the provided function is only called once,
GracefulExpress.prototype._once = function _once(fn) {
  var called = false;
  return function() {
    if (!called) {
      called = true;
      fn.apply(this, Array.prototype.slice.call(arguments, 0));
    }
  };
};
