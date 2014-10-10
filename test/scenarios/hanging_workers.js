
'use strict';

var path = require('path');
var core = require('thehelp-core');
core.env.merge(path.join(__dirname, '../../env.json'));

var cluster = require('../../src/server/index');

cluster({
  worker: function() {
    var express = require('express');
    var app = express();

    app.get('/', function(req, res) {
      res.send('success');
    });

    app.listen(3000);

    process.on('SIGTERM', function() {
      console.log('Got SIGTERM, not doing anything about it...');
    });
  }
});
