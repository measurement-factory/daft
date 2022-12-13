/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

import syncNet from "net";
import Promise from 'bluebird';
import assert from "assert";
import Context from "../misc/Context";
import * as Gadgets from "../misc/Gadgets";
import * as AddressPool from "../misc/AddressPool";
import Transaction from "./Transaction";
import SideAgent from "../side/Agent";

let asyncNet = Promise.promisifyAll(syncNet);

let Servers = 0;

export default class Agent extends SideAgent {
    constructor() {
        assert.strictEqual(arguments.length, 0);

        super(new Context("server", ++Servers));

        this._originalResponse = null; // for subsequent transactions to mimic

        this.server = null; // TCP server to be created in start()

        // where to listen for requests (may contain wildcards like '::')
        this._requestedListeningAddress = null; // caller-managed, if any
        this._reservedListeningAddress = null; // doled from the pool for our use
        this._actualListeningAddress = null; // used (and fully resolved)

        this._transaction = new Transaction(this);

        this._serverClosed = null; // a promise to close this.server

        // the first accepted or inherited connection
        this._firstConnectionSocket = null;
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
            if (this._savedSocket) {
                this._firstConnectionSocket = this._savedSocket;
                this._savedSocket = null;
                this._startServing();
            } else {
                this._startListening();
            }
        });
    }

    // start a TCP server
    _startListening() {
        this.server = asyncNet.createServer();

        this.server.on('connection', userSocket =>  {
            if (!this._firstConnectionSocket) {
                this._firstConnectionSocket = userSocket;
                this._startServing();
                // we only want to serve a single connection because
                // we support only a single server transaction (for now)
                this._serverClosed = this.server.closeAsync();
            } else { // get here only if closeAsync() has not yet made server stop listening
                console.log("server closes a subsequent connection");
                userSocket.destroy();
            }
        });

        const addr = Gadgets.FinalizeListeningAddress(this.address());
        return this.server.listenAsync(addr.port, addr.host).
            bind(this).
            tap(this._startedListening);
    }

    // Take care of the given accepted connection.
    // The connection may have been accepted by another Agent instance.
    _startServing() {
        let transaction = null;
        if (this._transaction.started()) {
            transaction = new Transaction(this);

            // reset() copies everything, so this cannot work well if
            // the original response has transaction-specific pieces
            assert(!this._originalResponse.finalized());
            transaction.response.reset(this._originalResponse);
        } else {
            transaction = this._transaction;

            // see the reset(this._originalResponse) comments above
            assert(!transaction.response.finalized());
            assert(!this._originalResponse);
            this._originalResponse = transaction.response.clone();
        }

        return this._runTransaction(transaction, this._firstConnectionSocket);
    }

    async _stop() {
        if (this.server && this.server.address()) {
            if (!this._serverClosed)
                this._serverClosed = this.server.closeAsync(); // no accepted connections yet
            if (this._keepConnections) {
                assert(this._savedSocket);
                console.log("not waiting for (persistent) server connections to close");
                this._serverClosed = null;
            } else {
                this.context.log("waiting for connections to close");
                this.context.log("currently open connections: ", await this.server.getConnectionsAsync());
                await this._serverClosed;
                this.context.log("done waiting for connections to close");
            }

            this._stoppedListening();
            return;
        }

        this._releaseListeningAddress();
    }

    serve(resource) {
        if (!this._requestedListeningAddress && resource.uri.address)
            this.listenAt(resource.uri.address);
        this.response.from(resource);
    }

    listenAt(address) {
        Gadgets.Must(address);
        this._requestedListeningAddress = address;
        console.log("Server plans to use listening address %O", this._requestedListeningAddress);
    }

    _reserveListeningAddress() {
        Gadgets.Must(!this._requestedListeningAddress);
        Gadgets.Must(!this._reservedListeningAddress);
        this._reservedListeningAddress =
            AddressPool.ReserveListeningAddress();
        console.log("Server locks listening address %O", this._reservedListeningAddress);
    }

    _releaseListeningAddress() {
        if (this._reservedListeningAddress) {
            console.log("Server unlocks listening address %O", this._reservedListeningAddress);
            AddressPool.ReleaseListeningAddress(this._reservedListeningAddress);
            this._reservedListeningAddress = null;
        }
    }

    _startedListening() {
        Gadgets.Must(!this._actualListeningAddress);
        this._actualListeningAddress = this.server.address();
        console.log("Server is listening on %O", this._actualListeningAddress);
    }

    _stoppedListening() {
        Gadgets.Must(this._actualListeningAddress);
        console.log("Server stopped listening on %O", this._actualListeningAddress);
        this._actualListeningAddress = null;
        this._releaseListeningAddress();
    }
}
