Write test scripts using built-in HTTP agents as highly configurable objects.
For example, the following script uses Daft HTTP client and server agents to
test whether an HTTP caching proxy obeys a certain RFC 7234 MUST:

    src/cli/daft.js run tests/proxy-update-headers-after-304.js

There are currently three agents in the Daft toolbox: an HTTP Proxy, an HTTP
Client, and an HTTP Server.

Daft tools use ECMAScript 2017 and bluebird Promises (bluebirdjs.com).
