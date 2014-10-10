
'use strict';

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

