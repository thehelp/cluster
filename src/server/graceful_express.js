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
var util = require('./util');

var Graceful = require('./graceful');

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

  this.rejectDuringShutdown = options.rejectDuringShutdown;
  if (typeof this.rejectDuringShutdown === 'undefined') {
    this.rejectDuringShutdown = true;
  }

  this.sockets = [];
  this.activeSockets = [];
  this.closeSockets = options.closeSockets;
  if (typeof this.closeSockets === 'undefined') {
    this.closeSockets = true;
  }

  this.development = options.development;
  if (typeof this.development === 'undefined') {
    this.development = (process.env.NODE_ENV === 'development');
  }

  //both here for symmetry; unlikely that both of these are avalable on construction
  this.setGraceful(options.graceful || Graceful.instance);
  this.setServer(options.server);

  this.middleware = this.middleware.bind(this);
}

module.exports = GracefulExpress;

// Public Methods
// ========

// `setGraceful` is a way to provide the reference after construction.
GracefulExpress.prototype.setGraceful = function setGraceful(graceful) {
  var _this = this;

  if (graceful) {
    this.graceful = graceful;

    this.graceful.on('shutdown', function domainStopServer() {
      _this._stopServer();
      if (_this.closeSockets) {
        _this._closeAllSockets();
      }
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

  if (this.development) {
    next();
  }

  this._addSocket(req.socket);
  this._addActiveSocket(req.socket);
  this._onStart(req);

  // bind to all three to be completely sure; handler only called once
  var finish = util.once(function() {
    _this._removeActiveSocket(req.socket);
    _this._onFinish(req);
  });
  res.on('finish', finish);
  res.on('close', finish);
  res.on('end', finish);

  var end = res.end;
  res.end = function() {
    if (_this.closed) {
      _this._closeConnection(res);
    }
    end.apply(res, arguments);
  };

  if (this.closed && this.rejectDuringShutdown) {
    var err = new Error('Server is shutting down; rejecting request');
    err.statusCode = 503;
    err.text = 'Please try again later; this server is shutting down';
    return next(err);
  }

  var d = domain.create();
  d.add(req);
  d.add(res);
  d.on('error', function(err) {
    _this._onError(err, req, res, next);
  });

  d.run(next);
};

// Socket Management
// =======

GracefulExpress.prototype._closeAllSockets = function() {
  this.sockets = this.sockets || [];

  if (!this.closeSockets) {
    return;
  }

  var inactive = this._getInactiveSockets();

  for (var i = 0, max = inactive.length; i < max; i += 1) {
    var socket = inactive[i];
    socket.destroy();
  }
};

GracefulExpress.prototype._getInactiveSockets = function _getInactiveSockets() {
  if (!this.closeSockets) {
    return;
  }

  var inactive = [];

  for (var i = 0, iMax = this.sockets.length; i < iMax; i += 1) {
    var socket = this.sockets[i];
    var add = true;

    for (var j = 0, jMax = this.activeSockets.length; j < jMax; j += 1) {
      var active = this.activeSockets[j];

      if (socket === active) {
        add = false;
        break;
      }
    }

    if (add) {
      inactive.push(socket);
    }
  }

  return inactive;
};

GracefulExpress.prototype._addActiveSocket = function _addActiveSocket(socket) {
  if (!this.closeSockets) {
    return;
  }

  this.activeSockets.push(socket);
};

GracefulExpress.prototype._removeActiveSocket = function _removeActiveSocket(socket) {
  if (!this.closeSockets) {
    return;
  }

  for (var i = 0, max = this.activeSockets.length; i < max; i += 1) {
    var element = this.activeSockets[i];

    if (element === socket) {
      this.activeSockets = this.activeSockets.slice(0, i)
        .concat(this.activeSockets.slice(i + 1));

      return;
    }
  }
};

GracefulExpress.prototype._addSocket = function _addSocket(socket) {
  var _this = this;

  if (!this.closeSockets) {
    return;
  }

  for (var i = 0, max = this.sockets.length; i < max; i += 1) {
    var element = this.sockets[i];

    if (element === socket) {
      return;
    }
  }

  this.sockets.push(socket);

  socket.on('close', function() {
    _this._removeSocket(socket);
  });
};

GracefulExpress.prototype._removeSocket = function _removeSocket(socket) {
  if (!this.closeSockets) {
    return;
  }

  for (var i = 0, max = this.sockets.length; i < max; i += 1) {
    var element = this.sockets[i];
    if (element === socket) {
      this.sockets = this.sockets.slice(0, i).concat(this.sockets.slice(i + 1));
      return;
    }
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
