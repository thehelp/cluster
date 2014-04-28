// # DomainMiddleware
// Encapsulates the capture of unhandled errors encountered while attempting to service an
// incoming http request. Also tracks active requests to facilitate faster shutdown.

'use strict';

var domain = require('domain');
var winston = require('winston');
var _ = require('lodash');

// The `constructor` has just one optional parameter, `gracefulWorker`. If set either on
// construction or later with `setGracefulWorker()`, `shutdown()` will be called with any
// unhandled error encountered.
function DomainMiddleware(options) {
  _.bindAll(this);

  options = options || {};

  this.activeRequests = 0;
  this.setGracefulWorker(options.gracefulWorker);
}

module.exports = DomainMiddleware;

// `setGracefulWorker` is a way to provide the reference after construction.
DomainMiddleware.prototype.setGracefulWorker = function(gracefulWorker) {
  var _this = this;

  if (gracefulWorker) {
    this.gracefulWorker = gracefulWorker;

    this.gracefulWorker.addCheck(function() {
      return _this.activeRequests === 0;
    });
  }
};

// `middleware` should be added as a global middleware, before any handler that might stop
// the processing chain. It wires up a domain to capture any errors produced by the rest
// of that request's handlers.
DomainMiddleware.prototype.middleware = function(req, res, next) {
  var _this = this;
  var d = domain.create();

  this.onStart(req);

  d.add(req);
  d.add(res);

  //'finish' is sent when request contents have been sent to OS for sending on socket
  res.on('finish', function() {
    _this.onFinish(req);
  });
  //'close' is sent when server doesn't send a response to a request
  res.on('close', function() {
    _this.onClose(req);
  });

  d.on('error', function(err) {
    _this.onError(err, req, res, next);
  });

  d.run(next);
};

// `getActiveRequests` just returns the count of in-progress requests on the http server.
DomainMiddleware.prototype.getActiveRequests = function() {
  return this.activeRequests;
};

// Helper functions
// ========

/*
`onError` is the method called when a request domain catches an error. It

  1. logs the error with winston
  2. closes the http connection
  3. starts a graceful shutdown
  4. and passes the error to the registered express error handler

*/
DomainMiddleware.prototype.onError = function(err, req, res, next) {
  try {
    winston.error('Error handling ' + req.url + ': ' + err.stack);

    res.setHeader('Connection', 'Connection: close');

    if (this.gracefulWorker) {
      this.gracefulWorker.shutdown(err, req);
    }

    next(err);
  }
  catch(err) {
    winston.error('Error handling domain error for ' + req.url + ': ' + err.stack);
  }
};

// `onStart` increments the in-progress request count.
DomainMiddleware.prototype.onStart = function() {
  this.activeRequests = this.activeRequests + 1;
};

// `onFinish` decrements the in-progress request count.
DomainMiddleware.prototype.onFinish = function() {
  this.activeRequests = this.activeRequests - 1;
};

// `onClose` logs, because an incoming http request never got a response.
DomainMiddleware.prototype.onClose = function(req) {
  winston.error('Handler for ' + req.url + ' never returned a response!');
  this.onFinish();
};

