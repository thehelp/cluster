// # DomainMiddleware
// Encapsulates the capture of unhandled errors encountered while attempting to service an
// incoming http request. Also tracks active requests to facilitate faster shutdown.

'use strict';

var domain = require('domain');
var winston = require('winston');
var _ = require('lodash');

// The `constructor` has just one optional parameter, `graceful`. If set either on
// construction or later with `setGraceful()`, `shutdown()` will be called with any
// unhandled error encountered.
function DomainMiddleware(options) {
  _.bindAll(this);

  options = options || {};

  this.server = null;
  this.closed = false;
  this.activeRequests = 0;

  this.setGraceful(options.graceful);
}

module.exports = DomainMiddleware;

// `setGraceful` is a way to provide the reference after construction.
DomainMiddleware.prototype.setGraceful = function setGraceful(graceful) {
  var _this = this;

  if (graceful) {
    this.graceful = graceful;

    this.graceful.on('shutdown', function domainStopServer() {
      _this.stopServer();
    });

    this.graceful.addCheck(function domainActiveRequests() {
      return _this.activeRequests === 0;
    });
  }
};

// `setServer` is the more common way to supply an http server to this class.
DomainMiddleware.prototype.setServer = function setServer(server) {
  var _this = this;

  if (server) {
    this.server = server;

    this.server.on('close', function domainGracefulShutdown() {
      if (_this.graceful) {
        _this.graceful.shutdown();
      }
    });
  }
};

// `stopServer` tells the http server to stop accepting new connections. Unfortunately,
// this isn't enough, as it will continue to service new requests made on already-existing
// keepalive connections.
DomainMiddleware.prototype.stopServer = function stopServer() {
  this.closed = true;

  if (this.server) {
    try {
      this.server.close();
    }
    catch (err) {
      winston.error('Couldn\'t close server: ' + err.message);
    }
  }
};

// `middleware` should be added as a global middleware, before any handler that might stop
// the processing chain. It wires up a domain to capture any errors produced by the rest
// of that request's handlers.
DomainMiddleware.prototype.middleware = function middleware(req, res, next) {
  var _this = this;
  var d = domain.create();

  this.onStart(req);

  d.add(req);
  d.add(res);

  // bind to all three to be completely sure; handler only called once
  var finish = _.once(function() {
    _this.onFinish(req);
  });
  res.on('finish', finish);
  res.on('close', finish);
  res.on('end', finish);

  d.on('error', function(err) {
    _this.onError(err, req, res, next);
  });

  if (this.closed) {
    this.closeConnection(res);
  }

  d.run(next);
};

// `getActiveRequests` just returns the count of in-progress requests on the http server.
DomainMiddleware.prototype.getActiveRequests = function getActiveRequests() {
  return this.activeRequests;
};

// Helper functions
// ========

// `closeConnection`
DomainMiddleware.prototype.closeConnection = function closeConnection(res) {
  res.setHeader('Connection', 'Connection: close');
};

/*
`onError` is the method called when a request domain catches an error. It

  1. logs the error with winston
  2. closes the http connection
  3. starts a graceful shutdown
  4. and passes the error to the registered express error handler

*/
DomainMiddleware.prototype.onError = function onError(err, req, res, next) {
  try {
    winston.error('Error handling ' + req.url + ': ' + err.stack);

    this.closeConnection(res);

    if (this.graceful) {
      this.graceful.shutdown(err, req);
    }

    next(err);
  }
  catch (err) {
    winston.error('Error handling domain error for ' + req.url + ': ' + err.stack);
  }
};

// `onStart` increments the in-progress request count.
DomainMiddleware.prototype.onStart = function onStart() {
  this.activeRequests = this.activeRequests + 1;
};

// `onFinish` decrements the in-progress request count.
DomainMiddleware.prototype.onFinish = function onFinish() {
  this.activeRequests = this.activeRequests - 1;
};
