
'use strict';

var fs = require('fs');
var path = require('path');
var fork = require('child_process').fork;

var rmrf = require('rimraf');


exports.logsDir = path.join(__dirname, '../../../logs');

exports.emptyDir = function emptyLogDir(dir, cb) {
  rmrf(dir, function(err) {
    if (err) {
      throw err;
    }

    fs.mkdir(dir, cb);
  });
};

exports.startProcess = function(module) {
  return fork(module);
};
