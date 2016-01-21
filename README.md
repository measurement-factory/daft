There are currently three tools in the Daft toolbox:
an HTTP Proxy, an HTTP Client, and an HTTP Server.

Daft tools use ECMAScript 2016 and bluebird Promises (bluebirdjs.com).


## Usage modes

There are several ways to use an HTTP agent from the Daft toolbox:

1. Run the agent as a stand-alone program driven by configuration files (so
   called "test plots"). The plots customize agent behavior, usually by
   subclassing Transaction classes used by the agent. Without any test plots,
   the HTTP agent behaves as a "general purpose" client, proxy, or server. For
   example, the following command starts Daft Proxy without any customizations:

        src/proxy/index.js

2. Write HTTP test scripts using HTTP agents as configurable objects. For
   example, the following script uses Daft HTTP client and server agents to test
   whether an HTTP caching proxy obeys a certain RFC 7234 MUST:

        tests/test-proxy-must-update-headers-after-304.js

3. Write Mocha-driven tests using HTTP agents as configurable objects. For
   example, here are Daft Proxy self-tests executed by "make test".

        mocha --require tests/mocha-config tests/test.js


## Daft Proxy

Daft Proxy is an HTTP proxy that does what the configuration files (so called
"test plots") tell it to do. Each test plot is a piece of JavaScript code that
overwrites default proxy methods or types. A test plot may modify messages while
they are forwarded or even prevent their forwarding (e.g., to simulate caching
or mimic a broken proxy). This behavior is handy for testing software that has
to work with HTTP proxies.

Here is an example of using Daft Proxy as a stand-alone program driven by a test
plot (test mode #1):

    babel src/proxy/plot1.js > src/proxy/plot1.js5 && \
        ./src/proxy/index.js src/proxy/plot1.js5

By default, the proxy forwards each message "as is", except for adding the
required Via header field.

Daft Proxy listens on `::` address, port `3128`. To customize these details,
modify `Config.ProxyListeningAddress`.


## Daft Client

Daft Client is an HTTP client agent.

Here is an example of using Daft Client as a stand-alone program driven by a
test plot (test mode #1):

    babel src/client/plot-raw.js > src/client/plot-raw.js5 && \
        ./src/client/index.js src/client/plot-raw.js5

Daft Client sends an HTTP request to either `localhost:80` or `localhost:8080`,
depending on whether it is started as root. To customize these details for all
requests, modify `Config.OriginAuthority`.


## Daft Server

Daft Server is an HTTP server agent, serving default
(`Config.DefaultMessageBodyContent`) or configurable content.

The server listens on either `localhost:80` or `localhost:8080`, depending on
whether it is started as root. To customize these details, modify
`Config.OriginAuthority` or look for `Gadgets.ListeningAddress()`.
