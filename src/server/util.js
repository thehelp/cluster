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

// `tryRequire` allows us to load non-dependency optional node modules
exports.tryRequire = function tryRequire(module) {
  try {
    return require(module);
  }
  catch (e) {}
};

// `loadBunyan` loads a logger from the `bunyan` node module if it is installed
exports.loadBunyan = function loadBunyan(name) {
  var bunyan = exports.tryRequire('bunyan');
  if (!bunyan) {
    return;
  }

  var logger = bunyan.createLogger({name: name});
  logger.verbose = logger.debug;
  return logger;
};

// `loadDebug` loads a logger from the `debug` node module if it is installed
exports.loadDebug = function loadDebug(name) {
  var debug = exports.tryRequire('debug');
  if (!debug) {
    return;
  }
  var logger = debug(name);

  return {
    varbose: logger,
    info: logger,
    warn: logger,
    error: logger
  };
};

// `loadWinston` loads a logger from the `winston` node module if it is installed
exports.loadWinston = function loadWinston() {
  return exports.tryRequire('winston');
};

// `getDefaultLogger` tries to load `winston` first, then `bunyan`, then `debug`
exports.loadLogger = function defaultLoad(name) {
  var logger = exports.loadWinston();
  if (logger) {
    return logger;
  }
  logger = exports.loadBunyan(name);
  if (logger) {
    return logger;
  }
  return exports.loadDebug(name);
};

exports.noopLogger = {
  verbose: function() {},
  info: function() {},
  warn: function() {},
  error: function() {}
};

exports.logger = null;

/*
`logShim` is an indirection layer:

1. If you've provided a `logger` object, it will return that.
2. Next, if `loadLogger()`, returns something, it will return that.
3. If neither of these returns anything it will return `noopLogger`, which does nothing.
*/
exports.logShim = function logShim(name) {
  if (exports.logger) {
    return exports.logger;
  }

  var loaded = exports.loadLogger(name);

  return loaded || exports.noopLogger;
};
