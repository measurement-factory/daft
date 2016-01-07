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
        this.client_ = null;
        this.server_ = null;
        this.checker_ = null;

        this.startAgentsPromise_ = null;
        this.stopAgentsPromise_ = null;
        this.runPromise_ = null;
    }

    client() {
        if (!this.client_) {
            assert(!this.runPromise_); // do not create agents after run()
            this.client_ = new Client();
            this.client_.request = new Request();
        }
        return this.client_;
    }

    server() {
        if (!this.server_) {
            assert(!this.runPromise_); // do not create agents after run()
            this.server_ = new Server();
            this.server_.response = new Response();
            this.server_.response.body = new Body(Config.DefaultMessageBodyContent);
            this.server_.response.header.add("Content-Length", Config.DefaultMessageBodyContent.length);
        }
        return this.server_;
    }

    proxy() {
        if (!this.proxy_) {
            assert(!this.runPromise_); // do not create agents after run()
            this.proxy_ = new Proxy();
        }
        return this.proxy_;
    }

    run() {
        return Promise.try(() => {
            if (this.runPromise_)
                return this.runPromise_;

            // Relying on .finally() to wait for the asynchronous cleanup!
            // And checking expectations only if that cleanup was successful.
            this.runPromise_ =
                this.beginPromise_().
                    tap(this.startAgents).
                    then(this.promiseTransactions_).
                    finally(this.stopAgents).
                    tap(this.doCheck_).
                    finally(this.end_);

            return this.runPromise_;
        });
    }

    beginPromise_() {
        return Promise.try(() => {
            console.log("Starting test case:", this.gist);
            return Promise.resolve(this).bind(this);
        });
    }

    end_() {
        console.log("Ending test case:", this.gist);
    }

    promiseTransactions_() {
        return Promise.try(() => {
            let transactions = [];
            if (this.server_) {
                console.log("will wait for origin transaction");
                transactions.push(this.server_.transactionPromise);
            }
            if (this.proxy_) {
                console.log("will wait for proxy transaction");
                transactions.push(this.proxy_.transactionPromise);
            }
            if (this.client_) {
                console.log("will wait for user transaction");
                transactions.push(this.client_.transactionPromise);
            }
            return Promise.all(transactions);
        });
    }

    check(checker) {
        assert(!this.checker_);
        // simplification: all automatic checks must be set before run()
        // so that we do not need to guess whether we have to perform the
        // new checks now or attach them to this.runPromise_. The simple
        // approach may also help with TestCase reuse.
        assert(!this.runPromise_);
        this.checker_ = checker;
    }

    doCheck_() {
        if (this.checker_)
            this.checker_(this);
    }

    expectStatusCode(expected) {
        assert(this.client_);
        assert(this.client_.transaction());
        assert(this.client_.transaction().response);
        let received = parseInt(this.client_.transaction().response.startLine.statusCode, 10);
        assert.equal(received, expected, "expected response status code");
    }

    startAgents() {
        if (this.startAgentsPromise_)
            return this.startAgentsPromise_;

        let agents = this.agents_();
        this.startAgentsPromise_ = Promise.mapSeries(agents, agent => agent.start());
        return this.startAgentsPromise_;
    }

    stopAgents() {
        if (this.stopAgentsPromise_)
            return this.stopAgentsPromise_;

        let agents = this.agents_().reverse();
        this.stopAgentsPromise_ = Promise.map(agents, agent => agent.stop());
        return this.stopAgentsPromise_;
    }

    // returns all active agents in their start order (i.e., servers first)
    agents_() {
        let agents = [];
        if (this.server_)
            agents.push(this.server_);
        if (this.proxy_)
            agents.push(this.proxy_);
        if (this.client_)
            agents.push(this.client_);
        return agents;
    }
}
