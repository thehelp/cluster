
'use strict';

var fs = require('fs');
var path = require('path');
var fork = require('child_process').fork;

var rmrf = require('rimraf');


exports.logsDir = path.join(__dirname, '../../../logs');

// Delete a directory recursively and recreate it
exports.emptyDir = function emptyLogDir(dir, cb) {
  rmrf(dir, function(err) {
    if (err) {
      throw err;
    }

    fs.mkdir(dir, cb);
  });
};

// Start a forked node.js process, both capturing stdout/stderr and piping
// them to this process's stdout/stderr.
exports.startProcess = function(module) {
  var child = fork(module, {
    silent: true,
    stdio: 'pipe'
  });

  if (child.stdout) {
    child.stdoutResult = '';
    child.stdout.on('data', function(data) {
      process.stdout.write(data.toString());
      child.stdoutResult += data;
    });
  }
  if (child.stderr) {
    child.stderrResult = '';
    child.stderr.on('data', function(data) {
      process.stderr.write(data.toString());
      child.stderrResult += data;
    });
  }

  return child;
};
