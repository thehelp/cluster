## 0.3.0 (2014-10-26)

* `DomainMiddleware` class renamed to `GracefulExpress`
* All public APIs throw on incorrect parameters
* `Graceful` is resilient to errors thrown by provided 'check' functions or registered 'shutdown' event handlers
* New mode in `GracefulExpress`: `inProcessTest`. If `true`, will not set up a domain for each request, allowing for easier in-process testing with `supertest`.
* `GracefulExpress`: tightens up graceful shutdown by:
  * Closing keepalive connections for all in-progress requests and idle sockets
  * Starting a socket reaper to continually look for and close idle sockets
  * Installing a backstop in case issues get through, return `Error` with `statusCode = 503`
* Logging: reduce verbosity, move to `thehelp-log-shim` to leave logging decisions to the process
* Upgrade to `1.x` series of `thehelp-last-ditch`, which doesn't send SMS by default any longer
* Substantial test coverage added
* Remove peer dependencies in favor of real dependencies
* Remove dependency on `lodash`

## 0.2.4 (2014-07-31)

* Update to the more bulletproofed 0.3.x-series of `thehelp-last-ditch`
* Update dev dependencies

## 0.2.3 (2014-07-16)

* `DomainMiddleware` no longer warns on 'unfinished' responses; seems that this event isn't fully reliable in the face of all server topologies. We bind to 'finish', 'close' and 'end' events on the `response` object, but the handler is wrapped with `_.once()`.

## 0.2.2 (2014-07-14)

* `Startup` now allows configuration of logs directory - via `options.logs` on construction or the LOGS environment variable. Defaults to './logs/'

## 0.2.1 (2014-05-27)

* Pare down what's in the npm package

## 0.2.0 (2014-05-25)

Breaking:

* `GracefulWorker` was renamed to `Graceful`, and now allows others to register for shutdown notification, doesn't call `server.close()` directly, and no longer acts as middleware.
* `Domain-Middleware` now needs a `server` reference, calls `server.close()`, registers for `Graceful` shutdown notification, then sends 'connection:close' for all subsequent requests itself
* `Master` no longer handles shutdown itself, instead delegating to `Graceful` - if creating manually, be sure to supply a `Graceful` instance
* `Startup` now only calls `messenger` if no `Graceful` instance can be found

Other updates:

* Update dev dependencies

## 0.1.1 (2014-05-01)

* `Master.stop()` now takes a callback
* `DomainMiddlware` now logs a warning instead of an error when it gets a `res.on('close')` event
* Dev dependency upgrade: supertest

## 0.1.0 (2014-04-28)

* Easy startup of cluster application with root `startup` method
* Fully functional `Master`, `Startup`, `GracefulWorker` and `DomainMiddleware` classes
* Graceful shutdown of both master and worker processes with proper exit codes, both for top-level and request-specific errors
