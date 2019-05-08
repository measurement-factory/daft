/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

import net from "net";
import Promise from 'bluebird';
import assert from "assert";
import * as Config from "../misc/Config";
import * as Gadgets from "../misc/Gadgets";
import Transaction from "./Transaction";
import SideAgent from "../side/Agent";

export default class Agent extends SideAgent {
    constructor() {
        assert.strictEqual(arguments.length, 0);

        super();
        this._transaction = new Transaction();

        this.socket = null; // connection to be established in start()
        this.localAddress = null;
        this.remoteAddress = null;
        this.nextHopAddress = Config.ProxyListeningAddress;
    }

    get request() {
        return this._transaction.request;
    }

    expectStatusCode(expectedCode) {
        this.checks.add((client) => {
            assert(client);
            assert(client.transaction());
            assert(client.transaction().response);
            const receivedCode = parseInt(client.transaction().response.startLine.statusCode, 10);
            assert.strictEqual(receivedCode, expectedCode);
        });
    }

    start() {
        let savedReject = null;
        return new Promise((resolve, reject) => {
            this.socket = new net.Socket();
            this.socket.once('error', savedReject = reject);
            // open a TCP connection to the proxy
            this.socket.connect(this.nextHopAddress, resolve);
        }).tap(() => {
            this.socket.removeListener('error', savedReject);
            this.localAddress = { host: this.socket.localAddress, port: this.socket.localPort };
            this.remoteAddress = { host: this.socket.remoteAddress, port: this.socket.remotePort };
            console.log("Client at %s connected to %s",
                Gadgets.PrettyAddress(this.localAddress),
                Gadgets.PrettyAddress(this.remoteAddress));
        }).tap(() => {
            this._startTransaction(this.socket);
        });
    }

    _stop() {
        if (this.socket) {
            this.socket.destroy(); // XXX: what if a transaction does it too?
            this.socket = null;
            console.log("Client at %s disconnected from %s",
                Gadgets.PrettyAddress(this.localAddress),
                Gadgets.PrettyAddress(this.remoteAddress));
        }
        return super._stop();
    }
}
