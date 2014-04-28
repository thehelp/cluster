
'use strict';

process.env = require('../env.json');

var cluster = require('../src/server/index');

cluster({
  worker: function() {
    require('./start_server');
  }
});
