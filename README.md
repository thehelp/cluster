# thehelp-cluster

This project is designed to make your node applications more reliable, using two base node technologies: [`domain`](http://nodejs.org/api/domain.html) and [`cluster`](http://nodejs.org/api/cluster.html).

`domain` is used to ensure that the process doesn't immediately go down when an unhandled exception is thrown. The `GracefulExpress` class captures the error, records it, and then starts the process of gracefully shutting down the process, ensuring that every in-progress request is completed.

`cluster` is used to manage multiple worker processes. The `Master` class creates the requested number of workers, restarting them as they crash, watching for worker processes crashing too quickly.

'SIGTERM' is the signal interpreted as a request for graceful shutdown.

## Setup

There are two optional environment variables:

```
"THEHELP_NUMBER_WORKERS": "1",
"THEHELP_LOGS_DIR": "logs directory; defaults to ./logs/"
```

_Note: It's a good idea to set the number of workers, because the default is `os.cpus().length`, and most VPS instances report far too many CPUs._

By default, both `Graceful` (for exceptions delivered by a `shutdown()` call) and `Startup` (if a `Graceful` instance cannot be found) use [`thehelp-last-ditch`](https://github.com/thehelp/last-ditch) to save exceptions. Take a look at the documentation for that - you'll likely want to set the `THEHELP_CRASH_LOG` environment variable, and you might consider turning on SMS/email notifcations.

## Usage

Your worker processes should be set up like this to enable shutting down the server gracefully:

```
var cluster = require('thehelp-cluster');
var graceful = new cluster.Graceful();
var gracefulExpress = new cluster.GracefulExpress({
  graceful: graceful
});

var app = express();

// this should be installed before any of your processing
app.use(gracefulExpress.middleware);

// ...add more middleware, endpoints...

// create http server manually to make available to GracefulExpress
var http = require('http');
var server = http.createServer(app);
gracefulExpress.setServer(server);

// start server
server.listen(PORT);
```

You start up the cluster like this:

```
var cluster = require('thehelp-cluster');

cluster({
  worker: function() {
    require('./start_server');
  }
});
```

A top-level domain will be created both for master and worker processes. If you don't provide a `master` callback, an instance of the `Master` class will be automatically created for your master process to manage your worker processes. A separate log file will be set up for each process.

## Advanced

In more complex scenarios, say for example you're responding to incoming socket.io messages, you can register for shutdown notifications and delay shutdown like this:

```
var graceful = new cluster.Graceful();
graceful.on('shutdown', function() {
  // start shutting down all active socket.io connections
});
graceful.addCheck(function() {
  // return true if ready to shut down
  // called frequently when Graceful wants to shut down
})
```

Take a look at how `Master` and `GracefulExpress` delegate to `Graceful` for more detail. `Graceful` has a number of configuration options as well, like how long to wait for not-yet-ready `addCheck()` functions before shutting down anyway.

The exposed four classes also provide a deeper level of customization. For example, instead of using the default configuration of `thehelp-last-ditch`, you can provide `messenger` callbacks of the form `function(err, options, cb)`. Or, instead of letting these classes log with `winston`, you can provide `log` objecst with `info`/`warn`/`error` functions to pipe output to your own logging system.

## Development

Run unit and integration tests like this:

```
grunt test
```

You can manually play around with the test cluster by launching it yourself:

```
node test/start_cluster.js
```

In another terminal you can shut it down gracefully by sending it a 'SIGTERM' signal. But first you'll need to find the master process id (use `ps` on posix systems).

```
ps | grep node
kill PID
```

Tests, static analysis, documentation generation and more are all run by default. Take a look at [`thehelp-project`](https://github.com/thehelp/project) documentation to get it running successfully:

```
grunt
```

## History

### 0.2.4 (2014-07-31)

* Update to the more bulletproofed 0.3.x-series of `thehelp-last-ditch`
* Update dev dependencies

### 0.2.3 (2014-07-16)

* `DomainMiddleware` no longer warns on 'unfinished' responses; seems that this event isn't fully reliable in the face of all server topologies. We bind to 'finish', 'close' and 'end' events on the `response` object, but the handler is wrapped with `_.once()`.

### 0.2.2 (2014-07-14)

* `Startup` now allows configuration of logs directory - via `options.logs` on construction or the LOGS environment variable. Defaults to './logs/'

### 0.2.1 (2014-05-27)

* Pare down what's in the npm package

### 0.2.0 (2014-05-25)

Breaking:

* `GracefulWorker` was renamed to `Graceful`, and now allows others to register for shutdown notification, doesn't call `server.close()` directly, and no longer acts as middleware.
* `Domain-Middleware` now needs a `server` reference, calls `server.close()`, registers for `Graceful` shutdown notification, then sends 'connection:close' for all subsequent requests itself
* `Master` no longer handles shutdown itself, instead delegating to `Graceful` - if creating manually, be sure to supply a `Graceful` instance
* `Startup` now only calls `messenger` if no `Graceful` instance can be found

Other updates:

* Update dev dependencies

### 0.1.1 (2014-05-01)

* `Master.stop()` now takes a callback
* `DomainMiddlware` now logs a warning instead of an error when it gets a `res.on('close')` event
* Dev dependency upgrade: supertest

### 0.1.0 (2014-04-28)

* Easy startup of cluster application with root `startup` method
* Fully functional `Master`, `Startup`, `GracefulWorker` and `DomainMiddleware` classes
* Graceful shutdown of both master and worker processes with proper exit codes, both for top-level and request-specific errors

## License

(The MIT License)

Copyright (c) 2013 Scott Nonnenberg &lt;scott@nonnenberg.com&gt;

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
