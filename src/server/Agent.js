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

        // individual transaction responses will be based on this resource (if
        // this resource is configured by calling via this.serve())
        this._resource = null;

        this.server = null; // TCP server to be created in start()

        // where to listen for requests (may contain wildcards like '::')
        this._requestedListeningAddress = null; // caller-managed, if any
        this._reservedListeningAddress = null; // doled from the pool for our use
        this._actualListeningAddress = null; // used (and fully resolved)

        this._transaction = null;
        this.resetTransaction();

        // Whether to expect and serve new connections without a limit. By
        // default, the server only expects and serves a single connection.
        this._keepListening = false;

        // customization function for transactions after the first one
        this._onSubsequentTransaction = null;

        // this.server.closeAsync()-returned promise (if that method was called)
        this._serverClosed = null;
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

    // resets this._keepListening
    keepListening(doIt) {
        assert(arguments.length === 1);
        assert(doIt !== undefined);
        doIt = Boolean(doIt);
        if (this._keepListening === doIt)
            return; // no changes

        this._keepListening = doIt;
        if (this._keepListening) {
            this.context.log("expecting multiple new connections");
            assert(!this._serverClosed);
        } else {
            if (this._serverClosed)
                this.context.log("still not expecting new connections");
            else
                this.context.log("will stop listening after the next connection");
        }
    }

    // Customize 2nd, 3rd, etc. transaction using the supplied function. The
    // function will be called with the transaction argument. Implies
    // keepListening(true).
    onSubsequentTransaction(fun) {
        assert(arguments.length === 1);
        assert(fun);
        assert(!this._onSubsequentTransaction); // for now
        this._onSubsequentTransaction = fun;

        this.keepListening(true); // may already be true
    }

    // Allow the next connection to trigger a new transaction (instead of the
    // immediate closure in this._startListening() if there was a previous
    // connection). See also: keepListening() and onSubsequentTransaction().
    resetTransaction() {
        const sawTransactions = Boolean(this._transaction);

        // If the transaction was not started, it is unknown to the log
        // reader. We do not warn about us forgetting such transactions.
        if (this._transaction && this._transaction.started())
            this.context.log("forgetting the previous transaction");
        this._transaction = new Transaction(this); // reset unconditionally

        if (this._resource)
            this._transaction.response.from(this._resource);

        if (sawTransactions && this._onSubsequentTransaction)
            this._onSubsequentTransaction(this._transaction);
    }

    start() {
        return Promise.try(() => {
            if (this._savedSocket) {
                const socket = this._savedSocket;
                this._savedSocket = null;
                this._startServing(socket);
            } else {
                this._startListening();
            }
        });
    }

    // start a TCP server
    _startListening() {
        this.server = asyncNet.createServer();

        this.server.on('connection', userSocket => {
            if (this._serverClosed) {
                // We get here when the client opens a new connection after
                // this.server.closeAsync() was called but before that server
                // stopped listening. A transaction may still be running here.
                this.context.log("server rejects late connection attempt");
                userSocket.destroy();
                return;
            }

            if (this._transaction.started() && !this._transaction.finished()) {
                // We get here when the client opens a new connection while
                // another transaction is still running. We expect more
                // (sequential!) connections only if this._keepListening.
                assert(this._keepListening);
                this.context.log("server rejects concurrent connection attempt");
                userSocket.destroy();
                return;
            }

            if (this._transaction.started() /* && this._transaction.finished() */) {
                // We get here when the client opens a new connection after
                // the previous transaction ended (and probably closed its
                // connection; TODO: check?). We expect more connections only
                // if this._keepListening.
                assert(this._keepListening);
                this.context.log("server allows sequential connection attempt");
                this.resetTransaction();
            }

            if (!this._keepListening)
                this._serverClosed = this.server.closeAsync();

            this._startServing(userSocket);
        });

        const addr = Gadgets.FinalizeListeningAddress(this.address());
        return this.server.listenAsync(addr.port, addr.host).
            bind(this).
            tap(this._startedListening);
    }

    // Take care of the given accepted connection.
    // The connection may have been accepted by another Agent instance.
    _startServing(userSocket) {
        assert(!this._transaction.started());
        return this._runTransaction(this._transaction, userSocket);
    }

    async _becomeIdle() {
        if (this._keepListening && !this._serverClosed) {
            this.context.log("awaiting more connections");
            return;
        }
        await this.stop();
    }

    async _stop() {
        if (this.server && this.server.address()) {
            if (!this._serverClosed) // we have not called this.server.closeAsync() yet
                this._serverClosed = this.server.closeAsync();

            const stillOpenConnections = await this.server.getConnectionsAsync();
            if (stillOpenConnections)
                this.context.log("still has open connections:", stillOpenConnections);
            if (this._keepConnections) {
                if (!this._savedSocket)
                    this.context.log("Warning: Have not preserved a connection for future reuse (yet?)");
                if (stillOpenConnections)
                    this.context.log("not waiting for (persistent) server connections to close");
            } else {
                this.context.log("waiting for connections to close");
                assert(this._serverClosed);
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
        // No cloning: We treat this resource as "live" -- it may change.
        this._resource = resource;
        // Any any resource changes will only affect the next transaction.
        this._transaction.response.from(this._resource);
    }

    listenAt(address) {
        Gadgets.Must(address);
        this._requestedListeningAddress = address;
        this.context.log("plans to use listening address %O", this._requestedListeningAddress);
    }

    _reserveListeningAddress() {
        Gadgets.Must(!this._requestedListeningAddress);
        Gadgets.Must(!this._reservedListeningAddress);
        this._reservedListeningAddress =
            AddressPool.ReserveListeningAddress();
        this.context.log("locks listening address %O", this._reservedListeningAddress);
    }

    _releaseListeningAddress() {
        if (this._reservedListeningAddress) {
            this.context.log("unlocks listening address %O", this._reservedListeningAddress);
            AddressPool.ReleaseListeningAddress(this._reservedListeningAddress);
            this._reservedListeningAddress = null;
        }
    }

    _startedListening() {
        Gadgets.Must(!this._actualListeningAddress);
        this._actualListeningAddress = this.server.address();
        this.context.log("started listening on %O", this._actualListeningAddress);
    }

    _stoppedListening() {
        Gadgets.Must(this._actualListeningAddress);
        this.context.log("stopped listening on %O", this._actualListeningAddress);
        this._actualListeningAddress = null;
        this._releaseListeningAddress();
    }
}
