/* Manages a single case testing a proxy  */

import Client from "../src/client/Agent";
import Server from "../src/server/Agent";
import Request from "../src/http/Request";
import Response from "../src/http/Response";
import Body from "../src/http/Body";
import * as Http from "../src/http/Gadgets";
import * as Config from "../src/misc/Config";
import assert from "assert";

class Side {
    constructor() {
        this.agent = null;
        this.transaction = null;
    }
}

export default class ProxyCase {

    constructor(needClient, needServer) {
        this.client = null;
        this.server = null;
        this.callWhenDone_ = null;
        this.checker = null;

        if (needClient) {
            this.client = new Side();
            this.client.agent = new Client();
            this.client.agent.request = new Request();
            this.client.agent.request.callback = (transaction) => {
                this.client.transaction = transaction;
                this.checkpoint_();
            }
        }

        if (needServer) {
            this.server = new Side();
            this.server.agent = new Server();
            this.server.agent.response = new Response();
            this.server.agent.response.body = new Body(Config.DefaultMessageBodyContent);
            this.server.agent.response.header.add("Content-Length", Config.DefaultMessageBodyContent.length);
            this.server.agent.response.callback = (transaction) => {
                this.server.transaction = transaction;
                this.checkpoint_();
            }
        }
    }

    startServer(done) {
        this.server.agent.start(done);
    }

    startClient(done) {
        this.client.agent.start(done);
    }

    run(done) {
        assert(done);
        this.callWhenDone_ = done;
        this.checkpoint_();
    }

    check(checker) {
        this.checker_ = checker;
    }

    stopAgents(serverDone) {
        // TODO: Should we always wait for the client to be done?
        let clientDone = this.server ? null : serverDone;
        if (this.client)
            this.client.agent.stop(clientDone);
        if (this.server)
            this.server.agent.stop(serverDone); // TODO: Should we wait for it to be done?
    }

    expectStatusCode(expected) {
        assert(this.client);
        assert(this.client.transaction);
        assert(this.client.transaction.response);
        let received = parseInt(this.client.transaction.response.startLine.statusCode, 10);
        assert.equal(received, expected, "expected response status code");
    }

    // makes sure both client and server transactions have finished
    checkpoint_() {
        if (this.server && !this.server.transaction) {
            console.log("waiting for origin transaction to finish");
            return;
        }

        if (this.client && !this.client.transaction) {
            console.log("waiting for user transaction to finish");
            return;
        }

        if (this.checker_)
            this.checker_(this);

        assert(this.callWhenDone_);
        this.stopAgents(this.callWhenDone_);
    }
}
