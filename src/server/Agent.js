/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

import syncNet from "net";
import Promise from 'bluebird';
import assert from "assert";
import * as Gadgets from "../misc/Gadgets";
import * as AddressPool from "../misc/AddressPool";
import Transaction from "./Transaction";
import SideAgent from "../side/Agent";

let asyncNet = Promise.promisifyAll(syncNet);

export default class Agent extends SideAgent {
    constructor() {
        assert.strictEqual(arguments.length, 0);

        super();
        this._transaction = new Transaction();

        this.server = null; // TCP server to be created in start()

        // where to listen for requests (may contain wildcards like '::')
        this._requestedListeningAddress = null; // caller-managed, if any
        this._reservedListeningAddress = null; // doled from the pool for our use
        this._actualListeningAddress = null; // used (and fully resolved)
    }

    address() {
        if (this._requestedListeningAddress)
            return this._requestedListeningAddress;
        if (!this._reservedListeningAddress)
            this._reserveListeningAddress();
        return this._reservedListeningAddress;
    }

    get response() {
        return this._transaction.response;
    }

    start() {
        return Promise.try(() => {
            // start a TCP server
            this.server = asyncNet.createServer();

            this.server.on('connection', userSocket => {
                this._startTransaction(userSocket);
            });

            const addr = Gadgets.FinalizeListeningAddress(this.address());
            return this.server.listenAsync(addr.port, addr.host).
                bind(this).
                tap(this._startedListening);
        });
    }

    _stop() {
        if (this.server && this.server.address()) {
            return this.server.closeAsync().
                bind(this).
                finally(this._stoppedListening).
                finally(super._stop);
        }
        this._releaseListeningAddress();
        return super._stop();
    }

    serve(resource) {
        if (!this._requestedListeningAddress && resource.uri.address)
            this.listenAt(resource.uri.address);
        this.response.from(resource);
    }

    listenAt(address) {
        Gadgets.Must(address);
        this._requestedListeningAddress = address;
        console.log("Server plans to use listening address %j", this._requestedListeningAddress);
    }

    _reserveListeningAddress() {
        Gadgets.Must(!this._requestedListeningAddress);
        Gadgets.Must(!this._reservedListeningAddress);
        this._reservedListeningAddress =
            AddressPool.ReserveListeningAddress();
        console.log("Server locks listening address %j", this._reservedListeningAddress);
    }

    _releaseListeningAddress() {
        if (this._reservedListeningAddress) {
            console.log("Server unlocks listening address %j", this._reservedListeningAddress);
            AddressPool.ReleaseListeningAddress(this._reservedListeningAddress);
            this._reservedListeningAddress = null;
        }
    }

    _startedListening() {
        Gadgets.Must(!this._actualListeningAddress);
        this._actualListeningAddress = this.server.address();
        console.log("Server is listening on %j", this._actualListeningAddress);
    }

    _stoppedListening() {
        Gadgets.Must(this._actualListeningAddress);
        console.log("Server stopped listening on %j", this._actualListeningAddress);
        this._actualListeningAddress = null;
        this._releaseListeningAddress();
    }
}
