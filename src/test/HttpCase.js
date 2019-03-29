/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

/* Manages a single case testing an HTTP client, server, and/or proxy. */

import Promise from "bluebird";
import Client from "../client/Agent";
import Server from "../server/Agent";
import Proxy from "../proxy/Agent";
import Request from "../http/Request";
import Response from "../http/Response";
import * as Lifetime from "../misc/Lifetime";
import { Must } from "../misc/Gadgets";
import assert from "assert";


export default class HttpCase {

    constructor(gist) {
        this.gist = gist;
        this._client = null;
        this._server = null;
        this._proxy = null;
        this._checkers = [];

        this._startAgentsPromise = null;
        this._stopAgentsPromise = null;
        this._runPromise = null;

        this._startTime = null;
        this._finishTime = null;
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
        }
        return this._server;
    }

    // * to set the proxy, call with a proxy argument (once)
    // * to get the previously set proxy, call without an argument
    proxy(aProxy = undefined) {
        if (!this._proxy) {
            assert(!this._runPromise); // do not create agents after run()
            assert(arguments.length === 1); // do not ask before setting
            assert(aProxy);
            this._proxy = aProxy;
        } else {
            assert(arguments.length === 0); // do not set twice
        }
        return this._proxy;
    }

    run() {
        return Promise.try(() => {
            if (this._runPromise)
                return this._runPromise;

            // Relying on .finally() to wait for the asynchronous cleanup!
            // And checking expectations only if that cleanup was successful.
            this._runPromise = Promise.resolve(this).bind(this).
                tap(this._begin).
                tap(this.startAgents).
                then(this._promiseTransactions).
                tap(this._stopClock).
                finally(this.stopAgents).
                tap(this._doCheck).
                finally(this._end);

            return this._runPromise;
        });
    }

    startTime() {
        Must(this._startTime);
        return this._startTime;
    }

    finishTime() {
        Must(this._startTime);
        Must(this._finishTime);
        return this._finishTime;
    }

    runtime() {
        return new Date(this.finishTime().getTime() - this.startTime().getTime());
    }

    _begin() {
        Must(!this._startTime);
        this._startTime = new Date();
        console.log(this._startTime.toISOString(), "Starting test case:", this.gist);
        Lifetime.Extend();
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

    _stopClock() {
        Must(!this._finishTime);
        this._finishTime = new Date();
        console.log(`test case took ${this.runtime().getTime()}ms`);
    }

    check(checker) {
        // simplification: all automatic checks must be set before run()
        // so that we do not need to guess whether we have to perform the
        // new checks now or attach them to this._runPromise. The simple
        // approach may also help with TestCase reuse.
        assert(!this._runPromise);
        this._checkers.push(checker);
    }

    _doCheck() {
        this._checkers.forEach(check => check(this));
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

        // the client (if any) probably wants to reach the server (if any)
        if (this._client && this._server && !this._client.request.startLine.uri.address)
            this._client.request.startLine.uri.address = this._server.address();

        // most proxy tests are done with unique URLs to prevent caching
        if (this._client && !this._client.request.startLine.uri.hasPath())
            this._client.request.startLine.uri.makeUnique();

        let agents = this._agents();
        assert(agents.length); // a test case cannot work without any agents
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
