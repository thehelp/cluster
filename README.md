# thehelp-cluster

This project is designed to make your node applications more reliable, using two base node technologies: [`domain`](http://nodejs.org/api/domain.html) and [`cluster`](http://nodejs.org/api/cluster.html).

`domain` is used to ensure that the process doesn't immediately go down when an unhandled exception is thrown. The `DomainMiddleware` class captures the error, records it, and then starts the process of gracefully shutting down the process, ensuring that every in-progress request is completed.

`cluster` is used to manage multiple worker processes. The `Master` class creates the requested number of workers, restarting them as they crash, watching for worker processes crashing too quickly.

'SIGTERM' is the signal interpreted as a request for graceful shutdown.

## Setup

There's just one optional environment variable:

```
"NUMBER_WORKERS": "1" // overrides the default, os.cpus().length
```

By default, both `Startup` (for top-level exceptions) and `GracefulWorker` (for exceptions delivered by `DomainMiddleware`) use `thehelp-last-ditch` to save/send exceptions. Take a look at the documentation for that - it has a number of required environment variables.

Or you can use the classes a little more manually, and provide `messenger` callbacks of the form `function(err, options, cb)` on construction of both of these classes.

## Usage

Your worker processes should be set up like this to enable shutting down the server gracefully:

```
var cluster = require('thehelp-cluster');
var gracefulWorker = new cluster.GracefulWorker();
var domainMiddleware = new cluster.DomainMiddleware({
  gracefulWorker: gracefulWorker
});

var app = express();
// these two are installed before everything else
app.use(domainMiddleware.middleware);
app.use(gracefulWorker.middleware);

// add more middleware, endpoints

// create http server manually to make available to GracefulWorker
var http = require('http');
var server = http.createServer(app);
gracefulWorker.setServer(server);

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

A top-level domain will be created both for master and worker processes. If you don't provide a `master` callback, an instance of the `Master` class will be created for your master process to manage your worker processes.

## Development

Run unit and integration tests like this:

```
grunt test
```

You can manually play around with the test cluster by launching it manually

```
node test/start_cluster.js
```

In another terminal you can shut it down gracefully by sending it a 'SIGTERM' signal. But first you'll need to find the master process id (use `ps` on posix systems).

```
ps | grep node
kill PID
```

Tests, static analysis, documentation generation and more are all run by default:

```
grunt
```

## History

### 0.1.0

* Functioning `Master`, `Startup`, `GracefulWorker` and `DomainMiddleware` classes

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
