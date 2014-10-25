// util
// ========
// Some basic cross-project utility functions

'use strict';

var cluster = require('cluster');

// `once` ensures that the provided function is only called once,
exports.once = function once(fn) {
  var called = false;
  return function() {
    if (!called) {
      called = true;
      fn.apply(this, Array.prototype.slice.call(arguments, 0));
    }
  };
};

// `getLogPrefix` helps differentiate between the various master/worker processes.
exports.getLogPrefix = function getLogPrefix() {
  if (cluster.worker) {
    var id = cluster.worker.id;
    return 'Worker #' + id;
  }
  else {
    return 'Master';
  }
};

exports.verifyType = function verifyType(type, object, field) {
  if (typeof object[field] !== type) {
    throw new Error('field ' + field + ' must be a ' + type);
  }
  if (type === 'number' && isNaN(object[field])) {
    throw new Error('field ' + field + ' is NaN; it must be a countable number')
  }
};

exports.logLevels = ['verbose', 'info', 'warn', 'error'];
exports.verifyLog = function verifyLog(object) {
  if (!object) {
    return;
  }

  exports.logLevels.forEach(function(level) {
    if (typeof object[level] !== 'function') {
      throw new Error('Provided log object must have ' + level + ' function');
    }
  });
};

exports.verifyGraceful = function verifyGraceful(object) {
  if (!object) {
    return;
  }

  if (typeof object.on !== 'function') {
    throw new Error('graceful object must have on method');
  }

  if (typeof object.shutdown !== 'function') {
    throw new Error('graceful object must have shutdown method');
  }
};

exports.verifyServer = function verifyServer(object) {
  if (!object) {
    return;
  }

  if (typeof object.on !== 'function') {
    throw new Error('server object must have on method');
  }
};
