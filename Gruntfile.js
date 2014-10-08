// # Gruntfile
// Automation for the project.

'use strict';

var GruntConfig = require('thehelp-project').GruntConfig;

// We simply create an instance of the `GruntConfig` class from
// `thehelp-project`, then call the register functions we need.
module.exports = function(grunt) {
  var config = new GruntConfig(grunt);

  config.standardSetup();
  config.standardDefault();

  grunt.loadNpmTasks('grunt-develop');
  grunt.config('develop.test-server', {
    file: 'test/start_cluster.js',
    wait: 2000
  });

  grunt.registerTask('integration', [
    'env',
    'develop:test-server',
    'mochacli:integration'
  ]);
};
