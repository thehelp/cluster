
'use strict';

var supertest = require('supertest');
var expect = require('thehelp-test').expect;

describe('thehelp-cluster', function() {
  var agent;

  before(function() {
    agent = supertest.agent('http://localhost:3000');
  });

  it('root returns', function(done) {
    agent
      .get('/')
      .expect('X-Worker', '1')
      .expect(200, done);
  });

  it('on async error, gets response with \'close connection\' header', function(done) {
    agent
      .get('/error')
      .expect('Connection', 'Connection: close')
      .expect('Content-Type', /text\/plain/)
      .expect('X-Worker', '1')
      .expect(/^error\!/)
      .expect(500, done);
  });

  it('starts up another node', function(done) {
    this.timeout(5000);

    agent
      .get('/')
      .expect('X-Worker', '2')
      .expect(200, done);
  });

  it('async error only takes down process after long task is complete', function(done) {
    this.timeout(5000);

    var delayComplete = false;

    agent
      .get('/delay')
      .expect('X-Worker', '2')
      .expect(200, function(err) {
        if (err) {
          throw err;
        }

        delayComplete = true;
      });

    agent
      .get('/error')
      .expect('Connection', 'Connection: close')
      .expect('X-Worker', '2')
      .expect(500, function(err) {
        if (err) {
          throw err;
        }

        expect(delayComplete).to.equal(false);

        // this request should hang until the next process comes up
        agent
          .get('/')
          .expect('X-Worker', '3')
          .expect(200, function(err) {
            if (err) {
              throw err;
            }

            expect(delayComplete).to.equal(true);

            done();
          });
      });
  });

});

