/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

import * as Config from "../misc/Config";
import * as Gadgets from "../misc/Gadgets";
import * as Http from "../http/Gadgets";
import * as Range from "../http/Range";
import * as RangeParser from "../http/one/RangeParser";
import Context from "../misc/Context";
import SideAgent from "../side/Agent";
import StatusLine from "../http/StatusLine";
import Transaction from "./Transaction";

import net from "net";
import Promise from 'bluebird';
import assert from "assert";

let Clients = 0;

export default class Agent extends SideAgent {
    constructor() {
        assert.strictEqual(arguments.length, 0);

        super(new Context("client", ++Clients));

        this.socket = null; // connection to be established in _run()
        this.localAddress = null;
        this.remoteAddress = null;
        this.nextHopAddress = Config.proxyAuthority();

        this._transaction = new Transaction(this);
    }

    get request() {
        return this._transaction.request;
    }

    expectStatusCode(expectedCode) {
        assert(StatusLine.IsNumericCode(expectedCode));
        if (!this.transaction().response)
            throw new Error(`Expected ${expectedCode} response, but received no response at all`);
        assert.strictEqual(this.transaction().response.startLine.codeInteger(), expectedCode);
    }

    // asserts that the specified response was received
    expectResponse(response) {
        Http.AssertForwardedMessage(
            response,
            this.transaction().response,
            "response");
    }

    // send a Range request and check that a matching 206 response is received
    configureFor206(rangeSpecs, wholeResponseBody) {
        this.request.header.add("Range", rangeSpecs.toString());
        this.checks.add((client) => {
            client.expectStatusCode(206);
            const responseParts = RangeParser.ResponseParts(client.transaction().response);
            const expectedParts = Range.Parts.From(rangeSpecs, wholeResponseBody);
            assert(responseParts.equal(expectedParts));
        });
    }

    // a promise to either do "everything" (except stopping) or be stopped
    async run() {
        // Promise.race() documentation claims any() is better than race(),
        // but, unlike race(), any() gets stuck here when this._run() throws
        // because any() must then wait for this._stopped to fulfill.
        await Promise.race([ this._run(), this._stopped ]);
    }

    async _run() {
        this.socket = await this._connect();
        this.localAddress = { host: this.socket.localAddress, port: this.socket.localPort };
        this.remoteAddress = { host: this.socket.remoteAddress, port: this.socket.remotePort };
        this.context.log("connected %s to %s",
            Gadgets.PrettyAddress(this.localAddress),
            Gadgets.PrettyAddress(this.remoteAddress));

        await this._runTransaction(this._transaction, this.socket);
    }

    async _becomeIdle() {
        await this.stop();
    }

    async _stop() {
        assert(!this._keepConnections); // no pconn support yet
        if (this.socket) {
            this.socket.destroy(); // XXX: what if a transaction does it too?
            this.socket = null;
            this.context.log("disconnected %s from %s",
                Gadgets.PrettyAddress(this.localAddress),
                Gadgets.PrettyAddress(this.remoteAddress));
        }
    }

    // (a promise to) open a TCP connection to the next hop
    _connect() {
        let resolver;
        let rejecter;
        const connected = new Promise((resolve, reject) => {
            resolver = resolve;
            rejecter = reject;
        });

        const socket = new net.Socket();
        socket.once('error', e => {
            // TODO: Figure out how to annotate this error with this context.
            //this.context.log("socket connect error:", e);
            socket.destroy();
            rejecter(e);
        });
        socket.once('connect', () => {
            this.context.log("socket connected");
            resolver(socket);
        });

        // Do not be tempted to promisifyAll and use connectAsync() because
        // net.Socket.connect() does not have a promisifyAll-compatible API!
        socket.connect(this.nextHopAddress);
        return connected;
    }
}
