import syncNet from "net";
import Promise from 'bluebird';
import * as Config from "../misc/Config";
import Transaction from "./Transaction";
import SideAgent from "../side/Agent";

let asyncNet = Promise.promisifyAll(syncNet);

export default class Agent extends SideAgent {
    constructor() {
        super(arguments);
        this.server = null; // TCP server to be created in start()
    }

    start() {
        return Promise.try(() => {
            // start a TCP server
            this.server = asyncNet.createServer();

            this.server.on('connection', userSocket => {
                this.startTransaction_(Transaction, userSocket);
            });

            return this.server.listenAsync(Config.ProxyListeningAddress.port,
                Config.ProxyListeningAddress.host).tap(() => {
                    console.log("Proxy is listening on %j", this.server.address());
                });
        });
    }

    stop_() {
        if (this.server && this.server.address()) {
            let savedAddress = this.server.address();
            return this.server.closeAsync().tap(() => {
                console.log("Proxy stopped listening on %j", savedAddress);
            }).then(super.stop_);
        }
        return super.stop_();
    }
}
