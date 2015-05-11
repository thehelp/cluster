
'use strict';

var path = require('path');

var expect = require('thehelp-test').expect;
var supertest = require('supertest');
var util = require('./util');

var logShim = require('thehelp-log-shim');
var logger = logShim('socket.io-test');

var ioClient = require('socket.io-client');

describe('socket.io, custom add/remove active socket', function() {
  var agent, child, client;
  var shutdown, news, disconnect;

  before(function(done) {
    this.timeout(5000);

    agent = supertest.agent('http://localhost:3000');

    child = util.startProcess(path.join(__dirname, '../../scenarios/socket.io.js'));

    setTimeout(done, 2000);
  });

  it('is running', function(done) {
    agent
      .get('/')
      .expect('success')
      .expect(200, done);
  });

  it('connects to websocket', function(done) {
    client = ioClient('http://localhost:3000', {
      transports: ['websocket']
    });

    client.on('news', function(data) {
      logger.info('news: ', data);
      client.emit('news', data);
      news = news || 0;
      news += 1;
    });

    client.on('shutdown', function() {
      logger.info('shutdown');
      shutdown = shutdown || 0;
      shutdown += 1;
    });

    client.on('disconnect', function() {
      logger.info('disconnect!');
      disconnect = disconnect || 0;
      disconnect += 1;
    });

    setTimeout(done, 1000);
  });

  it('error takes down the process', function(done) {
    this.timeout(10000);

    agent
      .get('/error')
      .expect(500, function(err) {
        if (err) {
          throw err;
        }
      });

    child.on('close', function() {
      expect(child).to.have.property('result');

      expect(child.result).not.to.match(/Killing process now/);
      expect(disconnect).to.equal(1, 'disconnect');

      // we only get shutdown and news if the socket is kept around during shutdown
      // comment out the add/removeActiveSocket calls in socket.io.js and these will fail
      expect(shutdown).to.equal(1, 'shutdown');
      expect(news).to.equal(2, 'news');

      // NOTE: either way, because of the check function registerd with graceful.addCheck
      // the server-side processing in response to the incoming 'news' event will run.
      // Comment out the addCheck call in socket.io.js and this will fail:
      expect(child.result).to.match(/done responding to data hello=world, count=1/);

      // both socket.disconnect() and the GracefulExpress socket reaper are responsible
      // for this not showing up in the logs. The socket is closed before another reply
      // from the client gets through.
      expect(child.result).not.to.match(/dropping incoming request/);

      done();
    });
  });
});

