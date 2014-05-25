
'use strict';

process.env = require('../env.json');

var fs = require('fs');
var http = require('http');

var winston = require('winston');
var express = require('express');
var cluster = require('../src/server/index');

var gracefulWorker = new cluster.GracefulWorker();
var domainMiddleware = new cluster.DomainMiddleware({
  gracefulWorker: gracefulWorker
});

var app = express();
app.use(domainMiddleware.middleware);
app.use(gracefulWorker.middleware);

app.get('/', function(req, res) {
  res.send('success');
});

app.get('/delay', function(req, res) {
  res.writeHead(200, {'Content-Type': 'text/plain'});
  setTimeout(function() {
    res.end('OK\n');
  }, 5000);
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
  res.send('could not find that!', 404);
});

app.use(function(err, req, res, next) {
  /*jshint unused: false */
  res.type('txt');
  res.send('error! ' + err.stack, 500);
});

var server = http.createServer(app);
gracefulWorker.setServer(server);
server.listen(3000);
winston.warn('Worker listening on port 3000');
