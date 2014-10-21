
'use strict';

var path = require('path');
var core = require('thehelp-core');
core.env.merge(path.join(__dirname, '../../env.json'));

var cluster = require('../../src/server');

cluster.setupLogs();
cluster.Graceful.start();

var e2e = require('./end_to_end_server');
e2e.gracefulExpress.inProcessTest = true;

var supertest = require('supertest');
var request = supertest(e2e.app);

request
  .get('/')
  .expect(200, function(err) {
    if (err) {
      throw err;
    }

    request
      .get('/error')
      .expect(500, function(err) {
        if (err) {
          throw err;
        }
      });
  });
