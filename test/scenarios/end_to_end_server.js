
'use strict';

var path = require('path');
var core = require('thehelp-core');
core.env.merge(path.join(__dirname, '../../env.json'));
core.logs.setupConsole();

var fs = require('fs');
var http = require('http');
var cluster = require('cluster');

var winston = require('winston');
var express = require('express');
var morgan = require('morgan');

var thCluster = require('../../src/server/index');
var gracefulExpress = new thCluster.GracefulExpress();

var app = express();

app.use(morgan('combined'));
app.use(gracefulExpress.middleware);

var worker = cluster.isMaster ? 'n/a' : cluster.worker.id;
app.use(function(req, res, next) {
  res.header('X-Worker', worker);
  next();
});

app.get('/', function(req, res) {
  res.send('success');
});

app.get('/delay', function(req, res) {
  res.writeHead(200, {'Content-Type': 'text/plain'});
  setTimeout(function() {
    res.end('OK\n');
  }, 2000);
});

app.get('/error', function() {
  fs.readFile('something', function(err, result) {
    winston.info(result.toString());
  });
});

app.get('/errorSync', function() {
  //just to get jshint to shut up:
  /*global x */
  x.blah();
});

app.get('/hang', function() {
  //nuthin!
});

app.use(function(req, res) {
  res.status(404);
  res.send('could not find that!');
});

app.use(function(err, req, res, next) {
  /*jshint unused: false */
  res.type('txt');
  res.status(500);
  res.send('error! ' + err.stack);
});

var server = http.createServer(app);
gracefulExpress.setServer(server);
server.listen(3000);
winston.warn('Worker listening on port 3000');
