/*
# GracefulExpress

Working with the `Graceful` class, provides full graceful shutdown for an
`express`-based server:

1. Each request is wrapped a domain to ensure that even if an exception is thrown in a
callback, the client receives a response. If found, your `Graceful` instance is notified
of the error, and starts the shutdown process.
2. It keeps track of all active requests so we know when it is safe to shut down.
3. On shutdown, it calls `server.close()` to stop accepting new connections, destroys
all inactive sockets (idle keepalive connections), and sets 'Connection: close' on all
in-process requests.
5. A backstop for all requests that leak through when the server is in shutdown mode:
calling your Express error handler with an `Error` with `statusCode = 503`

*/
'use strict';

var domain = require('domain');
var util = require('./util');
var http = require('http');

var Graceful = require('./graceful');

/*
The `constructor` has some optional parameters:

+ `graceful` - required to enable full server shutdown scenarios. Can be set either on
construction or later with `listen()` or `setGraceful()`. Default is `Graceful.instance`,
so if you've created an instance in this process already, it will be found automatically.
+ `server` - the http server, though unlikely to be available on construction of this
class. More likely you'll use `listen()` or `setServer()` later - see below.
+ `inProcessTest` - if set to true, will prevent domains from being set up for every
request, enabling in-process testing of your endpoints, as is often done with `supertest`.
Defaults to true if we can detect that this is a `mocha` run.

*/
function GracefulExpress(options) {
  options = options || {};

  this.server = null;
  this.graceful = null;

  var startFile = process.mainModule.filename;
  this._setOption('inProcessTest', options, /mocha$/.test(startFile));

  this.reaperPollInterval = options.reaperPollInterval || 500;
  util.verifyType('number', this, 'reaperPollInterval');

  this.shuttingDown = false;
  this._serverClosed = false;

  this._responses = [];
  this._sockets = [];
  this._activeSockets = [];

  //both here for symmetry; unlikely that both of these are available on construction
  this.setGraceful(options.graceful || Graceful.instance);
  this.setServer(options.server);

  this.middleware = this.middleware.bind(this);
}

module.exports = GracefulExpress;

// Public Methods
// ========

// `listen` is a helper method to create an http server, wire it up properly, and start
// it listening on your desired interface. Returns the created server.
GracefulExpress.prototype.listen = function listen(app) {
  if (!app) {
    throw new Error('Need to provide express app as first parameter');
  }

  var args = Array.prototype.slice.call(arguments, 1);

  var server = http.createServer(app);
  this.setServer(server);

  server.listen.apply(server, args);

  return server;
};

// `middleware` should be added as a global middleware, before any handler that might stop
// the processing chain. It wires up a domain to capture any errors produced by the rest
// of that request's handlers.
GracefulExpress.prototype.middleware = function middleware(req, res, next) {
  var _this = this;

  if (this.inProcessTest) {
    return next();
  }

  this.addActiveSocket(req.socket);
  this._addResponse(res);

  //bind to all three to be completely sure; handler only called once
  var finish = util.once(function() {
    _this.removeActiveSocket(req.socket);
    _this._removeResponse(res);
  });
  res.on('finish', finish);
  res.on('close', finish);
  res.on('end', finish);

  if (this.shuttingDown) {
    this._preventKeepAlive(res);

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

// `setGraceful` can be used to provide a `Graceful` instance after construction.
GracefulExpress.prototype.setGraceful = function setGraceful(graceful) {
  if (graceful) {
    this.graceful = graceful;
    util.verifyGraceful(this.graceful);

    this.graceful.on('shutdown', this._onShutdown.bind(this));
    this.graceful.addCheck(this._isReadyForShutdown.bind(this));
  }
};

// `setServer` can be used to set `this.server` if you'd like to create it yourself.
GracefulExpress.prototype.setServer = function setServer(server) {
  if (server) {
    this.server = server;
    util.verifyServer(this.server);

    this.server.on('close', this._onClose.bind(this));
    this.server.on('connection', this._onConnection.bind(this));
  }
};

// Public: Advanced
// ========
// If you're doing some very custom things in your app, or just using `socket.io`, you
// may have need to tell `GracefulExpress` that a given socket is not actually inactive,
// and therefore shouldn't be destroyed immediately on shutdown. See
// `test/scenarios/socket.io.js` for a complete example.

// `addActiveSocket` adds provided socket to `this._activeSockets`, with no
// duplicate-checking.s
GracefulExpress.prototype.addActiveSocket = function addActiveSocket(socket) {
  if (!socket || typeof socket !== 'object') {
    throw new Error('socket must be an object');
  }

  this._activeSockets.push(socket);
};

// `removeActiveSocket` removes the first instance of provided socket from
// `this._activeSockets`.
GracefulExpress.prototype.removeActiveSocket = function removeActiveSocket(socket) {
  if (!socket || typeof socket !== 'object') {
    throw new Error('socket must be an object');
  }

  for (var i = 0, max = this._activeSockets.length; i < max; i += 1) {
    var element = this._activeSockets[i];

    if (element === socket) {
      this._activeSockets = this._activeSockets.slice(0, i)
        .concat(this._activeSockets.slice(i + 1));

      return;
    }
  }
};


// Event handlers
// ========

/*
`_onError` is the method called when a request domain catches an error. It

  1. closes the http keepalive connection
  2. starts a graceful shutdown if we have a `Graceful` instance
  3. and passes the error to the registered express error handler
*/
GracefulExpress.prototype._onError = function _onError(err, req, res, next) {
  this._preventKeepAlive(res);

  //Don't want the entire domain object to pollute the log entry for this error
  delete err.domain;
  delete err.domainEmitter;

  if (this.graceful) {
    this.graceful.shutdown(err, req);
  }

  next(err);
};

// `_onClose` runs when the http server's 'close' event fires. Stops the socket reaper
// interval and records receipt.
GracefulExpress.prototype._onClose = function _onClose() {
  if (this.interval) {
    clearInterval(this.interval);
    this.interval = null;
  }

  this._serverClosed = true;
};

// `_onConnection` runs when the http server's 'connection' event fires. It's how we can
// be sure that we're capturing all sockets connected to the server.
GracefulExpress.prototype._onConnection = function _onClose(socket) {
  this._addSocket(socket);
};

// `_onShutdown` runs when `Graceful's 'shutdown' event fires. It first http server to
// stop accepting new connections. Unfortunately, this isn't enough, as it will continue
// to service existing requests and already-existing keepalive connections.
// `_closeConnAfterResponses` tells all current requests to close the connection after
// that request is complete. `_closeInactiveSockets` shuts down all idle keepalive
// connections.
GracefulExpress.prototype._onShutdown = function _onShutdown() {
  this.shuttingDown = true;

  if (this.server) {
    try {
      this.server.close();
    }
    catch (e) {}
  }

  this._closeConnAfterResponses();
  this._closeInactiveSockets();
  this._startSocketReaper();
};

// `_isReadyForShutdown` lets `Graceful` know when we're ready for `process.exit()`
GracefulExpress.prototype._isReadyForShutdown = function _isReadyForShutdown() {
  if (this.inProcessTest) {
    return true;
  }

  //if we never got the server, we never registered for the server 'close' event
  if (!this.server) {
    return this._responses.length === 0;
  }

  return this._serverClosed;
};

// Helper methods
// ========

// `_preventKeepAlive` tells any connection to close at the end of the current request.
// Unfortunately not enough because some keepalive connections will not make any requests
// as we're shutting down.
GracefulExpress.prototype._preventKeepAlive = function _preventKeepAlive(res) {
  res.shouldKeepAlive = false;
};

// `_setOption` makes dealing with undefined boolean options a bit easier.
GracefulExpress.prototype._setOption = function _setOption(name, options, defaultVal) {
  this[name] = options[name];
  if (typeof this[name] === 'undefined') {
    this[name] = defaultVal;
  }
};

// Response tracking
// ========

// `_closeConnAfterResponses` calls `_preventKeepAlive` on every active request
GracefulExpress.prototype._closeConnAfterResponses = function _closeConnAfterResponses() {
  for (var i = 0, max = this._responses.length; i < max; i += 1) {
    var res = this._responses[i];
    this._preventKeepAlive(res);
  }
};

// `_addResponse` adds `res` to the list of in-progress responses
GracefulExpress.prototype._addResponse = function _addResponse(res) {
  this._responses.push(res);
};

// `_removeResponse` removes `res` from the list of in-progress responses
GracefulExpress.prototype._removeResponse = function _removeResponse(res) {
  for (var i = 0, max = this._responses.length; i < max; i += 1) {
    var element = this._responses[i];
    if (element === res) {
      this._responses = this._responses.slice(0, i).concat(this._responses.slice(i + 1));
      return;
    }
  }
};

// Socket tracking
// =======
// The rest of socket tracking, aside from the two public methods to add and remove
// active sockets.

// `_startSocketReaper` starts an interval to call `_closeInactiveSockets()` repeatedly,
// attempting to catch anything that slipped through the cracks.
GracefulExpress.prototype._startSocketReaper = function _startSocketReaper() {
  var _this = this;

  this.interval = setInterval(function() {
    _this._closeInactiveSockets();
  }, this.reaperPollInterval);
  this.interval.unref();
};

// `_closeInactiveSockets` destroys all inactive sockets
GracefulExpress.prototype._closeInactiveSockets = function _closeInactiveSockets() {
  var inactive = this._getInactiveSockets();

  for (var i = 0, max = inactive.length; i < max; i += 1) {
    var socket = inactive[i];
    socket.destroySoon();
  }
};


// `_getInactiveSockets` builds a list of inactive sockets by looping through all
// `this._sockets`, ensuring that they are not present in `this._activeSockets`
GracefulExpress.prototype._getInactiveSockets = function _getInactiveSockets() {
  var inactive = [];

  for (var i = 0, iMax = this._sockets.length; i < iMax; i += 1) {
    var socket = this._sockets[i];
    var add = true;

    for (var j = 0, jMax = this._activeSockets.length; j < jMax; j += 1) {
      var active = this._activeSockets[j];

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

// `_addSocket` adds provided socket to `this._sockets` if it isn't already in the list
GracefulExpress.prototype._addSocket = function _addSocket(socket) {
  var _this = this;

  for (var i = 0, max = this._sockets.length; i < max; i += 1) {
    var element = this._sockets[i];

    if (element === socket) {
      return;
    }
  }

  this._sockets.push(socket);

  socket.on('close', function() {
    _this._removeSocket(socket);
  });
};

// `_removeSocket` removes provided socket from `this._sockets`
GracefulExpress.prototype._removeSocket = function _removeSocket(socket) {
  for (var i = 0, max = this._sockets.length; i < max; i += 1) {
    var element = this._sockets[i];
    if (element === socket) {
      this._sockets = this._sockets.slice(0, i).concat(this._sockets.slice(i + 1));
      return;
    }
  }
};
