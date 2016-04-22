/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

import syncNet from "net";
import Promise from 'bluebird';
import * as Config from "../misc/Config";
import * as Gadgets from "../misc/Gadgets";
import Transaction from "./Transaction";
import SideAgent from "../side/Agent";

import HttpTwoFrame, {FrameTypeSettings} from "../http/two/Frame";
import {packFrame} from "../http/two/MessagePacker";

let asyncNet = Promise.promisifyAll(syncNet);

export default class Agent extends SideAgent {
    constructor() {
        super(arguments);
        this.prefaceResponse = new HttpTwoFrame({ type: FrameTypeSettings, streamIdentifier: 0 });
        this.response = null; // optional default for all transactions
        this.server = null; // TCP server to be created in start()
        // where to listen for requests (may contain wildcards like '::')
        this.listeningAddress = null;
    }

    start() {
        return Promise.try(() => {
            // start a TCP server
            this.server = asyncNet.createServer();

            this.server.on('connection', userSocket => {
                userSocket.write(packFrame(this.prefaceResponse), "binary");

                this._startTransaction(Transaction, userSocket, this.response);
            });

            if (!this.listeningAddress)
                this.listeningAddress = Config.OriginAuthority;
            let addr = Gadgets.ListeningAddress(this.listeningAddress);
            return this.server.listenAsync(addr.port, addr.host).tap(() => {
                console.log("Server is listening on %j", this.server.address());
            });
        });
    }

    _stop() {
        if (this.server && this.server.address()) {
            let savedAddress = this.server.address();
            return this.server.closeAsync().tap(() => {
                console.log("Server stopped listening on %j", savedAddress);
            }).then(super._stop);
        }
        return super._stop();
    }

    serve(resource) {
        if (!this.listeningAddress && resource.uri.address())
            this.listenAt(resource.uri.address());
        this.response.from(resource);
    }

    listenAt(address) {
        Gadgets.Must(address);
        this.listeningAddress = address;
    }
}
