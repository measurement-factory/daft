/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

/* Manages a single case testing an HTTP client, server, and/or proxy. */

import Promise from "bluebird";
import Checker from "../test/Checker";
import Client from "../client/Agent";
import Server from "../server/Agent";
import * as Http from "../http/Gadgets";
import * as Lifetime from "../misc/Lifetime";
import * as Gadgets from "../misc/Gadgets";
import { Must } from "../misc/Gadgets";
import assert from "assert";


export default class HttpCase {

    constructor(gist) {
        this.gist = gist;
        this._clients = [];
        this._server = null;
        this._proxy = null;
        this._checks = new Checker();

        this._startAgentsPromise = null;
        this._runPromise = null;

        this._expectedRuntime = new Date(60*1000); // 1 minute

        this._startTime = null;
        this._finishTime = null;
    }

    // allow this test case to run longer than usual
    expectLongerRuntime(/* Date */ extra) {
        console.log(`will let the test case run ${Gadgets.PrettyTime(extra)} longer`);
        this._expectedRuntime = Gadgets.DateSum(this._expectedRuntime, extra);
    }

    // add (and return) a client, assuming there may be more than one
    // single-client test cases should use the client() method instead
    addClient() {
        assert(!this._runPromise); // do not create agents after run()
        let client = new Client();
        this._clients.push(client);
        return client;
    }

    // add the first (and possibly the only) client OR
    // get access to the previously set (and necessarily the only) client
    client() {
        if (!this._clients.length)
            return this.addClient();

        assert.strictEqual(this._clients.length, 1);
        return this._clients[0];
    }

    // add (and return) a client, assuming there may be more than one
    // single-client test cases should use the client() method instead
    makeClients(count, initializer) {
        while (--count >= 0) {
            let client = this.addClient();
            initializer(client);
        }
    }

    clients() {
        return this._clients;
    }

    server() {
        if (!this._server) {
            assert(!this._runPromise); // do not create agents after run()
            this._server = new Server();
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

    clientsSentEverything() {
        return Promise.all(this._clients.map(client => client.transaction().sentEverything()));
    }

    _begin() {
        Must(!this._startTime);
        this._startTime = new Date();
        console.log(Gadgets.PrettyDate(this._startTime), "Starting test case:", this.gist);
        Lifetime.Extend(this._expectedRuntime);
    }

    _end() {
        console.log("Ending test case:", this.gist);
    }

    _promiseTransactions() {
        return Promise.try(() => {
            let transactions = [];
            if (this._server) {
                console.log("will wait for the origin transactions to end");
                transactions.push(this._server.transactionsDone);
            }
            if (this._proxy) {
                console.log("will wait for the proxy transactions to end");
                transactions.push(this._proxy.transactionsDone);
            }
            if (this._clients.length > 0) {
                console.log(`will wait for ${this._clients.length} user agent transactions to end`);
                transactions.push(...this._clients.map(client => client.transactionsDone));
            }
            return Promise.all(transactions);
        });
    }

    _stopClock() {
        Must(!this._finishTime);
        this._finishTime = new Date();
        console.log(`test case took ${Gadgets.PrettyTime(this.runtime())}`);
    }

    check(futureCheck) {
        this._checks.add(futureCheck);
    }

    // will test whether each client got the server's response
    addMissCheck() {
        return this.addReceivedResponseCheck(this._server.transaction().response);
    }

    // will test whether each client got the given response
    addHitCheck(response) {
        return this.addReceivedResponseCheck(response);
    }

    // will test whether each client got the given response
    // for hits, use addHitCheck() for clarity sake
    addReceivedResponseCheck(response) {
        assert(this._clients.length); // "received" implies there was a client
        for (const client of this._clients) {
            client.checks.add(() => {
                Http.AssertForwardedMessage(
                    response,
                    client.transaction().response,
                    "response");
            });
        }
    }

    _doCheck() {
        if (this._server)
            this._server.checks.run(this._server);
        if (this._proxy)
            this._proxy.checks.run(this._proxy);
        for (const client of this._clients) {
            client.checks.run(client);
        }
        this._checks.run(this);
    }

    // TODO: Call expectStatusCode(200) by default.
    expectStatusCode(expected) {
        assert(this._clients.length);
        for (const client of this._clients) {
            client.expectStatusCode(expected);
        }
    }

    startAgents() {
        if (this._startAgentsPromise)
            return this._startAgentsPromise;

        for (const client of this._clients) {
            // the client (if any) probably wants to reach the server (if any)
            if (client && this._server && !client.request.startLine.uri.address)
                client.request.startLine.uri.address = this._server.address();

            // most proxy tests are done with unique URLs to prevent caching
            if (client && !client.request.startLine.uri.hasPath())
                client.request.startLine.uri.makeUnique();
        }

        let agents = this._agents();
        assert(agents.length); // a test case cannot work without any agents
        this._startAgentsPromise = Promise.mapSeries(agents, agent => agent.start());
        return this._startAgentsPromise;
    }

    async stopAgents() {
        let agents = this._agents().reverse();
        console.log("waiting for agents to stop: ", agents.length);
        await Promise.map(agents, agent => agent.stop());
    }

    // returns all active agents in their start order (i.e., servers first)
    _agents() {
        let agents = [];
        if (this._server)
            agents.push(this._server);
        if (this._proxy)
            agents.push(this._proxy);
        agents.push(...this._clients);
        return agents;
    }
}
