/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

import syncNet from "net";
import Promise from 'bluebird';
import assert from "assert";
import Context from "../misc/Context";
import * as Config from "../misc/Config";
import Transaction from "./Transaction";
import SideAgent from "../side/Agent";

let asyncNet = Promise.promisifyAll(syncNet);

let Proxies = 0;

export default class Agent extends SideAgent {
    constructor() {
        assert.strictEqual(arguments.length, 0);

        super(new Context("proxy", ++Proxies));

        this.server = null; // TCP server to be created in start()

        this._transaction = new Transaction(this);
    }

    start() {
        return Promise.try(() => {
            // start a TCP server
            this.server = asyncNet.createServer();

            this.server.on('connection', userSocket => {
                // TODO: Mimic server/Agent::start() for multi-transaction support
                this._runTransaction(this._transaction, userSocket);
            });

            const proxyAddress = Config.proxyAuthority();
            const listeningOptions = {
                host: proxyAddress.host,
                port: proxyAddress.port,
            };
            return this.server.listenAsync(listeningOptions).tap(() => {
                    this.context.log("started listening on %O", this.server.address());
                });
        });
    }

    async _becomeIdle() {
        await this.stop();
    }

    async stop() {
        if (this.server && this.server.address()) {
            const savedAddress = this.server.address();
            await this.server.closeAsync();
            this.context.log("stopped listening on %O", savedAddress);
        }
    }
}
