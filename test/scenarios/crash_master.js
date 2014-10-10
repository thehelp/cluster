
'use strict';

var path = require('path');
var core = require('thehelp-core');
core.env.merge(path.join(__dirname, '../../env.json'));

var fs = require('fs');

var cluster = require('../../src/server/index');

cluster({
  master: function() {
    var graceful = new cluster.Graceful();
    var master = new cluster.Master({
      graceful: graceful,
      numberWorkers: 2
    });
    master.start();

    setTimeout(function() {
      fs.readFile('randomness', function(err, file) {
        console.log(file.stat);
      });
    }, 1000);
  },
  worker: function() {
    var graceful = new cluster.Graceful();
    console.log(graceful.logPrefix);
  }
});
