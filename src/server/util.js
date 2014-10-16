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
