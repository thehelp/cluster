
'use strict';

var path = require('path');
var core = require('thehelp-core');
core.env.merge(path.join(__dirname, '../../env.json'));

process.env.NODE_ENV = 'development';

var cluster = require('../../src/server');

cluster.setupLogs();
cluster.Graceful.start();

var e2e = require('./end_to_end_server');

var supertest = require('supertest');
var request = supertest(e2e.app);

request
  .get('/')
  .expect(200, function(err, res) {
    if (err) {
      throw err;
    }

    request
      .get('/error')
      .expect(500, function(err, res) {
        if (err) {
          throw err;
        }
      });
  });
