There are currently three tools in the Daft toolbox:
an HTTP Proxy, an HTTP Client, and an HTTP Server. 

Daft tools use ECMAScript 2016 and bluebird Promises (bluebirdjs.com).

## Usage modes

There are several ways to use an HTTP agent from the Daft toolbox:

 1. As a stand-alone program driven by configuration files (so called "test
    plots"). The plots customize agent behavior, usually by subclassing
    Transaction classes used by the agent. For example:

        src/proxy/index.js

   Without any test plots, the HTTP agent behaves as a "general purpose" client, proxy, or server.

 1. Write HTTP proxy or origin server test scripts using HTTP agents as
    configurable objects. For example:

        test-proxy-must-update-headers-after-304.js

 1. Write Mocha-driven tests using HTTP agents as configurable objects. For
    example:

        mocha --require tests/mocha-config tests/test.js


## Daft Proxy

The proxy does what the configuration files (so called "test plots")
tell it to do. Each test plot is a piece of JavaScript code that
overwrites default proxy methods or types. A test plot may modify
messages while they are forwarded or even prevent their forwarding
(e.g., to simulate caching or mimic a broken proxy). This behavior
is handy for testing software that has to work with HTTP proxies.

Without a configuration file, the proxy forwards each message "as is",
except for adding the required Via header field.

Daft Proxy listens on IPv4 port 3128 and forwards all messages to
localhost:80. To customize, modify Config.js.

Usage:

    babel src/proxy/plot1.js > src/proxy/plot1.js5 && \
        ./src/proxy/index.js src/proxy/plot1.js5


## Daft Client

Like Daft Proxy, the client tool is driven by "test plots".
The client requires a test plot to run.

Usage:

    babel src/client/plot-raw.js > src/client/plot-raw.js5 && \
        ./src/client/index.js src/client/plot-raw.js5


## Daft Server

The server tool has not been documented yet. It is currently used
in built-in test cases that test Daft Proxy.
