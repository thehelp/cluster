
'use strict';

process.env = require('../env.json');

var cluster = require('../src/server/index');

cluster({
  master: function() {
    var master = new cluster.Master({
      spinTimeout: 100,
      graceful: new cluster.Graceful()
    });
    master.start();

    // setTimeout(function() {
    //   throw new Error('top-level master crash!');
    // }, 1000);
  },
  worker: function() {
    require('./start_server');

    // setTimeout(function() {
    //   throw new Error('top-level worker crash!');
    // }, 5100);
  }
});
