[![Build Status](https://travis-ci.org/thehelp/cluster.svg?branch=master)](https://travis-ci.org/thehelp/cluster)

# thehelp-cluster

Don't just let your server crash on an unhandled error, finish everything you were doing first. Multiple techniques used to ensure your clients don't get socket hang-ups. Cluster support and graceful shutdown on SIGTERM too! [More information about `thehelp`.](https://blog.scottnonnenberg.com/the-state-of-thehelp/)

## Node version support

### 0.10

Not currently testing against this platform, but it should still work.

### 0.11/0.12

 Not testing against this platform. But I do know that because this project uses [`node-statsd`](https://github.com/sivy/node-statsd) to send statistics to [`statsd`](https://github.com/etsy/statsd), [you'll get crashes in your `master` process](https://github.com/joyent/node/issues/9261).

### iojs (1.x/2.x/3.x)

Currently testing against the most recent version of all three of these in Travis. Go for it!

### 4.x/5.x/6.x

All green! It's kind of amazing that this project has required so few changes after a year and a half. I had to make [some test changes](https://github.com/thehelp/cluster/commit/9991818401f1d4f1867b54a107dcb3859240e20e) to work with [a iojs 1.x breaking change](https://github.com/nodejs/node/issues/1239), but that's it!

## Features

+ `GracefulExpress` class to:
  + Install [`domain`](http://nodejs.org/api/domain.html)-based capture of unhandled errors for every request, ensuring that the client always gets an error message
  + Shut down [`express`](http://expressjs.com/) servers gracefully: stop accepting new connections, close keepalive connections, and return 503 if any requests leak through
  + `inProcessTest` mode for [`supertest`](https://github.com/tj/supertest)-based in-process endpoint testing
  + Tested on `express` `3.x` and `4.x` and with `node` `0.10.30-36` and `iojs` `1.4.3`, `1.5.1` and `1.6.0` (note: [tests no longer run on node 0.10 or below](https://github.com/thehelp/cluster/commit/9991818401f1d4f1867b54a107dcb3859240e20e))
+ `Master` class to:
  + Start up user-provided set of worker processes via [`cluster`](http://nodejs.org/api/domain.html)
  + Detect if worker processes crash too fast, then start replacements up after a delay
  + Shut down process and workers gracefully, only killing worker processes if they take too long
+ `Graceful` class to:
  + Act as the process-level hub for shutdown notifications and shutdown readiness
  + Listen for `SIGTERM` signal, start graceful shutdown process
  + Report the shutdown-causing error via [`thehelp-last-ditch`](https://github.com/thehelp/last-ditch)
+ `Startup` class to:
  + Easily start up a cluster
  + On launch of processes, increment [`statsd`](https://github.com/etsy/statsd) counters for `process.env.THEHELP_APP_NAME + '.launches.' + (master/worker)` Why? To catch frequent restarts if OS is killing your process, for example due to low memory)
  + Install `domain` for top-level errors in master and worker processes
+ Logging options:
  + This library can participate in your logging system via [`thehelp-log-shim`](https://github.com/thehelp/log-shim)
  + If you're using [`winston`](https://github.com/flatiron/winston), `setupLogs()` will quickly set up per-process log files


## Setup

First, install the project as a dependency:

```bash
npm install thehelp-project --save-dev
```


## Usage: Single-process

Even a single process could benefit from graceful shutdown, and it's really easy to set that up:

```javascript
var cluster = require('thehelp-cluster');
cluster.Graceful.start();

process.on('uncaughtException', function(err) {
  // Graceful uses thehelp-last-ditch to capture error information, then shuts down
  cluster.Graceful.instance.shutdown(err);
});

var app = require('express')();

// GracefulExpress ensures all outstanding requests complete before shutdown
var gracefulExpress = new cluster.GracefulExpress();

// this wraps all incoming requests in a domain
app.use(gracefulExpress.middleware);

// this makes it easier to get the underlying node.js http server
gracefulExpress.listen(app, 3000, function() {
  console.log('Server listening on port 3000');
});
```

# Usage: Clustered

Okay, now say you want to use all of `thehelp-cluster`. Here's the full treatment - a cluster-based setup, with `GracefulExpress` installed on your server. First, create your `cluster.js` file:

```javascript
var cluster = require('thehelp-cluster');

cluster.setupLogs();

// creates a Graceful instance for the process - Master and GracefulExpress need it
cluster.Graceful.start();

cluster({
  worker: function() {
    var server = require('./server');
    server.start();
  }
});
```

Anything run outside of the `master`/`worker` callbacks you pass to cluster will be run in all of your processes. So a `Graceful` instance is created for each process, and logging is set up too. Since the `master` callback wasn't provided, a basic default creates a `Master` instance and calls `start()`.

Now, in the same directory, your `server.js` file:

```javascript
var express = require('express');
var app = express();

var cluster = require('thehelp-cluster');

// creates a new Graceful instance if it hasn't been created yet in this process
// so we can run this file without cluster with full graceful shutdown support
cluster.Graceful.start();

var gracefulExpress = new cluster.GracefulExpress();

// ...very little should go before gracefulExpress - probably just logging...

app.use(gracefulExpress.middleware);

// ...register your endpoints and other middleware...

app.get('/', function(req, res) {
  res.send('success!');
})

return {
  // we expose the app to allow for supertest-based in-process testing
  app: app,

  // gracefulExpress needs a references to the http server itself; listen() makes that easy
  start: function() {
    gracefulExpress.listen(app, 3000, function() {
      console.log('Worker listening on port 3000');
    });
  }
};
```

That's it! You've got a cluster of one worker process that will respond to `SIGTERM` and shut down gracefully. An unhandled error in middleware, or in an endpoint handler, or even in a callback will shut down your server gracefully after piping the error through the installed [express error handler](http://expressjs.com/guide/error-handling.html).

If you have `winston` installed, you'll get a separate log file for each process, like this:

```bash
logs/master-2014-10-11T01-04:54.602Z-80524.log
logs/master-2014-10-11T01-04:59.026Z-80528.log
logs/worker-2014-10-11T01-04:54.771Z-80525.log
logs/worker-2014-10-11T01-04:55.908Z-80526.log
logs/worker-2014-10-11T01-04:58.224Z-80527.log
logs/worker-2014-10-11T01-04:59.200Z-80529.log
```

But we can't forget tests! Here, `test/endpoints.js` specifies a [`mocha`](http://mochajs.github.io/mocha/) test and uses [`supertest`](https://github.com/tj/supertest) to load the `app` from `server.js` and call it in-process:

```javascript
var supertest = require('supertest');
var app = require('../server').app;

describe('endpoint test', function() {
  var request;

  before(function() {
    request = supertest(app);
  });

  it('/ should return success', function(done) {
    request
      .get('/')
      .expect('success')
      .expect(200, done);
  });
});
```

Now try throwing an error in an async callback to start testing out the error-catching capabilities of `GracefulExpress`!

_Note: `GracefulExpress` behaves differently when run under `mocha`. By default, its `inProcessTest` option is set to `true` if we can detect that `mocha` is the main module for the current process. Errors will bubble all the way to `mocha`'s top-level exception handler and be reported as standard test failures._

## Configuration

You may be wondering about the knobs you can turn in this simple use case. First, two environment variables:

```json
{
  "THEHELP_NUMBER_WORKERS": "1",
  "THEHELP_LOGS_DIR": "logs directory; defaults to ./logs/"
}
```


### Error reporting

Next, by default both `Graceful` (for exceptions delivered by a `shutdown()` call) and `Startup` (if a `Graceful` instance cannot be found) use [`thehelp-last-ditch`](https://github.com/thehelp/last-ditch) to save exceptions. Take a look at the documentation for that - you'll likely want to set the `THEHELP_CRASH_LOG` environment variable.

You can also provide your own customized `LastDitch` with SMS/email notifications turned on. Or, you can go further and provide a totally custom `messenger` callback of the form `function(err, options, cb)`.


### Logging

You'll also want to look at the documentation for [`thehelp-log-shim`](https://github.com/thehelp/log-shim), which is used for logging. Essentially, this library will look for logging libraries your project already has installed, and will use that. If you don't like this, you can turn it off!


## Going deeper

In more complex scenarios, say for example you're responding to incoming socket.io messages, you can register for shutdown notifications and delay shutdown like this:

```
var cluster = require('thehelp-cluster');

// this uses the Graceful instance already in place for this process
var graceful = cluster.Graceful.instance;

graceful.on('shutdown', function() {
  // start shutting down all active socket.io connections
});
graceful.addCheck(function() {
  // return true if ready to shut down
  // called frequently when Graceful wants to shut down
})
```

Take a look at how `Master` and `GracefulExpress` delegate to `Graceful` for more detail. `Graceful` has a number of configuration options as well, like how long to wait for not-yet-ready `addCheck()` functions before shutting down anyway.

_Note: For a complete `socket.io` example, check out `test/scenarios/socket.io.js`._


## Detailed Documentation

Detailed docs be found at this project's GitHub Pages, thanks to [`groc`](https://github.com/nevir/groc): <http://thehelp.github.io/cluster/src/server/index.html>


## A note on domains

[Node.js `domain`] (http://nodejs.org/api/domain.html), while powerful, is still at the 'Unstable' stability level, so this module will be kept in the `0.x.y` version range until that changes.

It should also be noted that not all libraries support domains. [`pg`](https://github.com/brianc/node-postgres) only started supporting domains in `3.x`. Do testing with your libraries of choice to ensure that they play nicely.


## A note on cluster

It turns out that node.js [`cluster`](http://nodejs.org/api/cluster.html) is at an even lower stability than domains: 'Experimental'. Again, we'll need to watch how that API progress and change this project as necessary. But first, let's talk about the pros and cons:

* Pros:
  * Seamless recovery from an errors, as long as at least one worker is always alive.
  * Helps better take advantage of one machine's multiple cores
* Cons:
  * In node `0.10` and earlier, load balancing across workers is handled by the OS, and is a little bit uneven. On linux and solaris, you probably shouldn't have more than two or three workers.
  * In node `0.12` and io.js the default load balancing approach changed to round-robin.
  * Unliked nginx, haproxy and other full-scale load-balancers, you don't have any customizability.


## Contributing changes

The tests in this project are quite extensive. In particular, take a look at the integration tests and all the files under `test/scenarios`. The tests create and kill a lot of processes, as you might expect for a library based around graceful shutdown. :0)

When you have some changes ready, please submit a pull request with:

* Justification - why is this change worthwhile? Link to issues, use code samples, etc.
* Documentation changes for your code updates. Be sure to check the groc-generated HTML with `grunt doc`
* A description of how you tested the change. Don't forget about the very-useful `npm link` command :0)

I may ask you to use a `git rebase` to ensure that your commits are not interleaved with commits already in the history. And of course, make sure `grunt` completes successfully (take a look at the requirements for [`thehelp-project`](https://github.com/thehelp/project)). :0)


## License

(The MIT License)

Copyright (c) 2014 Scott Nonnenberg &lt;scott@nonnenberg.com&gt;

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
