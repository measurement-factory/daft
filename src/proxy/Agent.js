/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

import syncNet from "net";
import Promise from 'bluebird';
import assert from "assert";
import * as Config from "../misc/Config";
import Transaction from "./Transaction";
import SideAgent from "../side/Agent";

let asyncNet = Promise.promisifyAll(syncNet);

export default class Agent extends SideAgent {
    constructor() {
        assert.strictEqual(arguments.length, 0);

        super();
        this._transaction = new Transaction();

        this.server = null; // TCP server to be created in start()
    }

    start() {
        return Promise.try(() => {
            // start a TCP server
            this.server = asyncNet.createServer();

            this.server.on('connection', userSocket => {
                this._startTransaction(userSocket);
            });

            return this.server.listenAsync(Config.ProxyListeningAddress.port,
                Config.ProxyListeningAddress.host).tap(() => {
                    console.log("Proxy is listening on %O", this.server.address());
                });
        });
    }

    _stop() {
        if (this.server && this.server.address()) {
            let savedAddress = this.server.address();
            return this.server.closeAsync().tap(() => {
                console.log("Proxy stopped listening on %O", savedAddress);
            }).then(super._stop);
        }
        return super._stop();
    }
}
