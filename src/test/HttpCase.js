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
import Context from "../misc/Context";
import { Must } from "../misc/Gadgets";
import assert from "assert";

let HttpCases = 0;

export default class HttpCase {

    constructor(gist) {
        this.context = new Context("case", ++HttpCases);
        this.gist = gist;

        this._clients = [];
        this._server = null;
        this._proxy = null;
        this._checks = new Checker();

        this._stopAgentsPromise = null;

        this._expectedRuntime = new Date(60*1000); // 1 minute

        this._startTime = null;
        this._finishTime = null;
    }

    // allow this test case to run longer than usual
    expectLongerRuntime(/* Date */ extra) {
        this.context.log(`will let the test case run ${Gadgets.PrettyTime(extra)} longer`);
        this._expectedRuntime = Gadgets.DateSum(this._expectedRuntime, extra);
    }

    // add (and return) a client, assuming there may be more than one
    // single-client test cases should use the client() method instead
    addClient() {
        assert(!this._started()); // do not create agents after run()
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
            assert(!this._started()); // do not create agents after run()
            this._server = new Server();
        }
        return this._server;
    }

    // * to set the proxy, call with a proxy argument (once)
    // * to get the previously set proxy, call without an argument
    proxy(aProxy = undefined) {
        if (!this._proxy) {
            assert(!this._started()); // do not create agents after run()
            assert(arguments.length === 1); // do not ask before setting
            assert(aProxy);
            this._proxy = aProxy;
        } else {
            assert(arguments.length === 0); // do not set twice
        }
        return this._proxy;
    }

    async run() {
        assert(!this._started());

        const now = this.context.log('starting:', this.gist);
        try {
            this._startClock(now);
            await this._run();
        } finally {
            this.context.log('ending:', this.gist);
        }
    }

    async _run() {
        Lifetime.Extend(this._expectedRuntime);

        this._setDefaults();

        const agents = this._agents();
        assert(agents.length); // a test case cannot work without an agent
        this.context.log(`starting ${agents.length} concurrent agents`);

        try {
            if (this._server)
                await this._server.start();

            if (this._proxy)
                await this._proxy.start();

            await Promise.map(this._clients, client => client.run());
        } finally {
            this._stopClock();
            await this._stopAgents(); // some or all may already be stopped
        }

        // all agents are stopped here
        // check only after a successful run
        await this._doCheck();
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

    _started() {
        return this._startTime !== null;
    }

    _startClock(when) {
        assert(when);
        assert(!this._startTime);
        this._startTime = when;
    }

    _stopClock() {
        Must(!this._finishTime);
        this._finishTime = new Date();
        this.context.log(`took ${Gadgets.PrettyTime(this.runtime())}`);
    }

    check(futureCheck) {
        this._checks.add(futureCheck);
    }

    // will test whether each client got server's last response
    addMissCheck() {
        assert.strictEqual(arguments.length, 0);
        return this._addReceivedResponseCheck(() => this._server.transaction().response);
    }

    // will test whether each client got the given response
    addHitCheck(response) {
        assert(response);
        assert(!(response instanceof Function));
        return this._addReceivedResponseCheck(() => response);
    }

    // Will test whether each client got the response extracted by the given function.
    // For basic misses, use addMissCheck().
    // For basic hits, use addHitCheck().
    _addReceivedResponseCheck(responseGetter) {
        assert(responseGetter instanceof Function);
        assert(this._clients.length); // "received" implies there was a client
        for (const client of this._clients) {
            client.checks.add(() => {
                Http.AssertForwardedMessage(
                    responseGetter(this),
                    client.transaction().response,
                    "response");
            });
        }
    }

    async _doCheck() {
        if (this._server)
            await this._server.checks.run(this._server);
        if (this._proxy)
            await this._proxy.checks.run(this._proxy);
        for (const client of this._clients) {
            await client.checks.run(client);
        }
        await this._checks.run(this);
    }

    // TODO: Call expectStatusCode(200) by default.
    expectStatusCode(expected) {
        assert(this._clients.length);
        for (const client of this._clients) {
            client.expectStatusCode(expected);
        }
    }

    _setDefaults() {
        for (const client of this._clients) {
            // the client (if any) probably wants to reach the server (if any)
            if (client && this._server && !client.request.startLine.uri.address)
                client.request.startLine.uri.address = this._server.address();

            // most proxy tests are done with unique URLs to prevent caching
            if (client && !client.request.startLine.uri.hasPath())
                client.request.startLine.uri.makeUnique();
        }
    }

    _stopAgents() {
        if (this._stopAgentsPromise)
            return this._stopAgentsPromise;

        let agents = this._agents().reverse();
        this.context.log(`waiting for ${agents.length} agents to stop`);
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
        agents.push(...this._clients);
        return agents;
    }
}
