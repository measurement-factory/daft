/* Manages a single case testing a proxy  */

import Promise from "bluebird";
import Client from "../src/client/Agent";
import Server from "../src/server/Agent";
import Proxy from "../src/proxy/Agent";
import Request from "../src/http/Request";
import Response from "../src/http/Response";
import Body from "../src/http/Body";
import * as Config from "../src/misc/Config";
import assert from "assert";


export default class ProxyCase {

    constructor(gist) {
        this.gist = gist;
        this._client = null;
        this._server = null;
        this._checker = null;

        this._startAgentsPromise = null;
        this._stopAgentsPromise = null;
        this._runPromise = null;
    }

    client() {
        if (!this._client) {
            assert(!this._runPromise); // do not create agents after run()
            this._client = new Client();
            this._client.request = new Request();
        }
        return this._client;
    }

    server() {
        if (!this._server) {
            assert(!this._runPromise); // do not create agents after run()
            this._server = new Server();
            this._server.response = new Response();
            this._server.response.body = new Body(Config.DefaultMessageBodyContent);
            this._server.response.header.add("Content-Length", Config.DefaultMessageBodyContent.length);
        }
        return this._server;
    }

    proxy() {
        if (!this._proxy) {
            assert(!this._runPromise); // do not create agents after run()
            this._proxy = new Proxy();
        }
        return this._proxy;
    }

    run() {
        return Promise.try(() => {
            if (this._runPromise)
                return this._runPromise;

            // Relying on .finally() to wait for the asynchronous cleanup!
            // And checking expectations only if that cleanup was successful.
            this._runPromise =
                this._beginPromise().
                    tap(this.startAgents).
                    then(this._promiseTransactions).
                    finally(this.stopAgents).
                    tap(this._doCheck).
                    finally(this._end);

            return this._runPromise;
        });
    }

    _beginPromise() {
        return Promise.try(() => {
            console.log("Starting test case:", this.gist);
            return Promise.resolve(this).bind(this);
        });
    }

    _end() {
        console.log("Ending test case:", this.gist);
    }

    _promiseTransactions() {
        return Promise.try(() => {
            let transactions = [];
            if (this._server) {
                console.log("will wait for origin transaction");
                transactions.push(this._server.transactionPromise);
            }
            if (this._proxy) {
                console.log("will wait for proxy transaction");
                transactions.push(this._proxy.transactionPromise);
            }
            if (this._client) {
                console.log("will wait for user transaction");
                transactions.push(this._client.transactionPromise);
            }
            return Promise.all(transactions);
        });
    }

    check(checker) {
        assert(!this._checker);
        // simplification: all automatic checks must be set before run()
        // so that we do not need to guess whether we have to perform the
        // new checks now or attach them to this._runPromise. The simple
        // approach may also help with TestCase reuse.
        assert(!this._runPromise);
        this._checker = checker;
    }

    _doCheck() {
        if (this._checker)
            this._checker(this);
    }

    expectStatusCode(expected) {
        assert(this._client);
        assert(this._client.transaction());
        assert(this._client.transaction().response);
        let received = parseInt(this._client.transaction().response.startLine.statusCode, 10);
        assert.equal(received, expected, "expected response status code");
    }

    startAgents() {
        if (this._startAgentsPromise)
            return this._startAgentsPromise;

        let agents = this._agents();
        this._startAgentsPromise = Promise.mapSeries(agents, agent => agent.start());
        return this._startAgentsPromise;
    }

    stopAgents() {
        if (this._stopAgentsPromise)
            return this._stopAgentsPromise;

        let agents = this._agents().reverse();
        this._stopAgentsPromise = Promise.map(agents, agent => agent.stop());
        return this._stopAgentsPromise;
    }

    // returns all active agents in their start order (i.e., servers first)
    _agents() {
        let agents = [];
        if (this._server)
            agents.push(this._server);
        if (this._proxy)
            agents.push(this._proxy);
        if (this._client)
            agents.push(this._client);
        return agents;
    }
}
