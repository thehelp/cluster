/*
# GracefulExpress

Working with the `Graceful` class, provides full graceful shutdown for an
`express`-based server:

1. Each request is wrapped a domain to ensure that even if an exception is thrown in a
callback the client receives a response. If found, your `Graceful` instance is notified of
the error, and starts the shutdown process.
2. It keeps track of all active requests so we know when it is safe to shut down.
3. On shutdown, it calls `server.close()` to stop accepting new connections, and destroys
all inactive sockets (idle keepalive connections).
4. Patches `res.end` and `res.writeHead` to ensures that a server in shutdown mode
includes a 'Connection: close' header in all subsequent responses, even response which
were in-process when the error happened.
5. A backstop for all requests that leak through when the server is in shutdown mode:
calling your Express error handler with an `Error` with `statusCode = 503`

*/
'use strict';

var domain = require('domain');
var util = require('./util');

var Graceful = require('./graceful');

/*
The `constructor` has some optional parameters:

+ `graceful` - if set either on construction or later with `setGraceful()`, `shutdown()`
will be called with any unhandled error encountered. Default is `Graceful.instance`, so if
you've created an instance in this process already, it will be found automatically.
+ `server` - the http server, though unlikely to be available on construction of this
class. More likely you'll use `setServer()` later.
+ `development` - if set to true, will prevent domains from being set up for every
request, enabling in-process testing of your endpoints, as is often done with `supertest`.
Defaults to `process.env.NODE_ENV === 'development'`
+ `closeSockets` - default true. If true, `GracefulExpress` will keep track of all sockets
behind requests passing through its `middleware()` function, marking them as inactive when
the request ends. Those sockets will be closed when the server shuts down. This feature is
designed to close down idle keepalive connections.
+ `rejectDuringShutdown` - default true. If true, when the server is shutting down, any
request that leaks through results in an `Error` with `statusCode = 503` be passed to
your Express error handler.
+ `patchMethods` - default true. If true, `middleware()` patches `res.end`,
`res.writeHead` to ensure that any request in-process as an error happens gets a
`Connection: close` header.

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

  this.patchResMethods = options.patchResMethods;
  if (typeof this.patchResMethods === 'undefined') {
    this.patchResMethods = true;
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

  this._patchResMethods(res);

  if (this.closed) {
    this._closeConnection(res);
  }
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

// `_closeAllSockets` destroys all inactive sockets
GracefulExpress.prototype._closeAllSockets = function _closeAllSockets() {
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

// `_getInactiveSockets` builds a list of inactive sockets by looping through all
// `this.sockets`, ensuring that they are not present in `this.activeSockets`
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

// `_addActiveSocket` adds provided socket to `this.activeSockets`, with no
// duplicate-checking
GracefulExpress.prototype._addActiveSocket = function _addActiveSocket(socket) {
  if (!this.closeSockets) {
    return;
  }

  this.activeSockets.push(socket);
};

// `_removeActiveSocket` removes provided socket from `this.activeSockets`
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

// `_addSocket` adds provided socket to `this.sockets` if it isn't already in the list
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

// `_removeSocket` removes provided socket from `this.sockets`
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

// `_patchMethods` updates `res.end` and `res.writeHead` to include a 'Connection: close'
// header if the server is shutting down. Important for ensuring that any request
// in-process during an error has its connection shut down.
GracefulExpress.prototype._patchResMethods = function _patchResMethods(res) {
  var _this = this;

  if (!this.patchResMethods) {
    return;
  }

  var end = res.end;
  res.end = function gracefulEnd() {
    if (!res.headersSent && _this.closed) {
      _this._closeConnection(res);
    }
    end.apply(res, arguments);
  };

  var writeHead = res.writeHead;
  res.writeHead = function gracefulWriteHead(statusCode, reasonPhrase, headers) {
    headers = headers || reasonPhrase || {};

    if (_this.closed) {
      headers.Connection = 'Connection: close';
    }

    if (reasonPhrase) {
      writeHead.call(res, statusCode, reasonPhrase, headers);
    }
    else {
      writeHead.call(res, statusCode, headers);
    }
  };
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

// `_stopServer` tells the http server to stop accepting new connections. Unfortunately,
// this isn't enough, as it will continue to service new requests made on already-existing
// keepalive connections. Hence all the socket and 'Connection: close'-related code above.
GracefulExpress.prototype._stopServer = function _stopServer() {
  this.closed = true;

  if (this.server) {
    try {
      this.server.close();
    }
    catch (e) {}
  }
};

// `_onStart` increments the in-progress request count.
GracefulExpress.prototype._onStart = function _onStart() {
  this.activeRequests += 1;
};

// `_onFinish` decrements the in-progress request count.
GracefulExpress.prototype._onFinish = function _onFinish() {
  this.activeRequests -= 1;
};
