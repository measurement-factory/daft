/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

import net from "net";
import Promise from 'bluebird';
import * as Config from "../misc/Config";
import Transaction from "./Transaction";
import SideAgent from "../side/Agent";

export default class Agent extends SideAgent {
    constructor() {
        super(arguments);
        this.request = null; // optional default for all transactions
        this.socket = null; // connection to be established in start()
        this.localAddress = null;
        this.remoteAddress = null;
    }

    start() {
        let savedReject = null;
        return new Promise((resolve, reject) => {
            this.socket = new net.Socket();
            this.socket.once('error', savedReject = reject);
            // open a TCP connection to the proxy
            this.socket.connect(Config.ProxyListeningAddress, resolve);
        }).tap(() => {
            this.socket.removeListener('error', savedReject);
            this.localAddress = this.socket.address();
            this.remoteAddress = this.socket.remoteAddress;
            console.log("Client at %j connected to %j",
                this.localAddress, this.remoteAddress);
        }).tap(() => {
            this._startTransaction(Transaction, this.socket, this.request);
        });
    }

    _stop() {
        if (this.socket) {
            this.socket.destroy(); // XXX: what if a transaction does it too?
            this.socket = null;
            console.log("Client at %j disconnected from %j",
                this.localAddress, this.remoteAddress);
        }
        return super._stop();
    }
}
