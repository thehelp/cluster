'use strict';

var path = require('path');
var core = require('thehelp-core');
core.env.merge(path.join(__dirname, '../../env.json'));
core.logs.setupConsole();

var fs = require('fs');
var cluster = require('cluster');

var logShim = require('thehelp-log-shim');
var logger = logShim('end-to-end:server');
var express = require('express');
var morgan = require('morgan');

var thCluster = require('../../src/server');
var graceful = thCluster.Graceful.start();
var gracefulExpress = new thCluster.GracefulExpress();

var app = express();

app.use(morgan('combined', {
  stream: {
    write: function(text) {
      logger.info(text.replace(/\n$/, ''));
    }
  }
}));

var worker = cluster.isMaster ? 'n/a' : cluster.worker.id;
app.use(function(req, res, next) {
  res.header('X-Worker', worker);
  next();
});

app.use(gracefulExpress.middleware);

app.get('/', function(req, res) {
  res.send('success');
});

app.get('/socket', function(req, res) {
  res.type('text/html');
  res.send(
    '<script src="/socket.io/socket.io.js"></script>\n' +
    '<script>\n' +
    '  var socket = io("http://localhost", {\n' +
    '    transports: ["websocket"]\n' +
    '  });\n' +
    '  socket.on("news", function (data) {\n' +
    '    console.log(data);\n' +
    '    socket.emit("news", { count: data.count });\n' +
    '  });\n' +
    '  socket.on("shutdown", function () {\n' +
    '    console.log("shutting down");\n' +
    '  });\n' +
    '</script>'
  );
});

app.get('/delay', function(req, res) {
  setTimeout(function() {
    res.send('OK\n');
  }, 4000);
});

app.get('/error', function() {
  fs.readFile('something', function(err, result) {
    logger.info(result.toString());
  });
});

app.use(function(err, req, res, next) {
  /*jshint unused: false */
  logger.error(req.url + ': ' + core.breadcrumbs.toString(err));
  var message = err.text || ('error! ' + err.stack);

  res.type('txt');
  res.status(err.statusCode || 500);
  res.send(message);
});


var server = gracefulExpress.listen(app, 3000, function() {
  logger.warn('Worker listening on port 3000');
});

var io = require('socket.io')(server, {
  transports: ['websocket']
});

var inProcess = 0;
var shuttingDown = false;

graceful.addCheck(function() {
  return inProcess === 0;
});
graceful.on('shutdown', function() {
  shuttingDown = true;
});

var shutdownSocket = function shutdownSocket(socket) {
  socket.emit('shutdown');
  socket.disconnect();
};

var check = function check(socket) {
  if (shuttingDown) {
    shutdownSocket(socket);
    return true;
  }
};

var patch = function(socket) {
  var on = socket.on;

  socket.on = function(event, handler) {
    on.call(this, event, function(data) {
      if (check(socket)) {
        logger.warn('dropping incoming request');
        return;
      }

      inProcess += 1;
      gracefulExpress.addActiveSocket(socket.conn.request.socket);

      handler(data, function done() {
        inProcess -= 1;
        gracefulExpress.removeActiveSocket(socket.conn.request.socket);
        check(socket);
      });
    });
  };
};

io.on('connection', function(socket) {
  patch(socket);

  socket.emit('news', {
    hello: 'world',
    count: 1
  });

  socket.on('news', function(data, done) {
    logger.info('received data', data);
    setTimeout(function() {
      logger.info('done responding to data', data);
      data.count += 1;
      logger.info('sending data:', data);
      socket.emit('news', data);
      done();
    }, 4000);
  });
});
