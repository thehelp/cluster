
'use strict';

var fs = require('fs');
var path = require('path');

var supertest = require('supertest');
var expect = require('thehelp-test').expect;
var util = require('./util');

var winston;

try {
  winston = require('winston');
}
catch (e) {}

describe('winston creates expected log files', function() {
  var agent, child, logFiles;

  before(function(done) {
    agent = supertest.agent('http://localhost:3000');

    util.emptyDir(util.logsDir, function(err) {
      if (err) {
        throw err;
      }

      child = util.startProcess(
        path.join(__dirname, '../../scenarios/end_to_end_cluster.js'));

      setTimeout(done, 1000);
    });
  });

  after(function(done) {
    this.timeout(10000);

    child.on('close', function() {
      done();
    });

    child.kill();
  });

  it('creates two log files on startup', function(done) {
    if (!winston) {
      return done();
    }

    fs.readdir(util.logsDir, function(err, files) {
      if (err) {
        throw err;
      }

      expect(files).to.have.length(2);

      files = files.sort();
      expect(files).to.have.deep.property('0').that.match(/master/);
      expect(files).to.have.deep.property('1').that.match(/worker/);

      logFiles = files;

      done();
    });
  });

  it('root returns', function(done) {
    agent
      .get('/')
      .expect('X-Worker', '1')
      .expect('Connection', 'close')
      .expect(200, done);
  });

  it('on async error, gets response with \'close connection\' header', function(done) {
    agent
      .get('/error')
      .expect('Connection', 'close')
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
      .expect('Connection', 'close')
      .expect(200, done);
  });

  it('three log files now in directory', function(done) {
    if (!winston) {
      return done();
    }

    fs.readdir(util.logsDir, function(err, files) {
      if (err) {
        throw err;
      }

      expect(files).to.have.length(3);

      files = files.sort();
      expect(files).to.have.deep.property('0', logFiles[0]);
      expect(files).to.have.deep.property('1', logFiles[1]);
      expect(files).to.have.deep.property('2').that.match(/worker/);

      logFiles = files;

      done();
    });
  });

});
