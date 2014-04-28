
'use strict';

var supertest = require('supertest');
var cluster = require('../../../src/server/index');

describe('thehelp-cluster', function() {
  var agent, master;

  before(function(done) {
    cluster({
      master: function() {
        master = new cluster.Master({
          // to shorten test duration
          spinTimeout: 1
        });
        master.start();
      },
      worker: function() {
        require('../../start_server');
      }
    });

    var url = 'localhost:3000';
    agent = supertest.agent(url);

    setTimeout(done, 1000);
  });

  after(function() {
    master.stop();
  });

  it('root returns', function(done) {
    agent
      .get('/')
      .expect(200, done);
  });

  it('closes connection on error', function(done) {
    agent
      .get('/error')
      .expect('Connection', 'Connection: close')
      .expect(500, done);
  });

  it('starts up another node', function(done) {
    this.timeout(10000);

    agent
      .get('/')
      .expect(200, done);
  });

});

