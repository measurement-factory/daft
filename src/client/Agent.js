import net from "net";
import * as Config from "../misc/Config";
import * as Global from "../misc/Global";
import Transaction from "./Transaction";

export default class Agent {
    constructor() {
        this.xCount = 0;
        this.request = null; // optional default for all transactions

        this.socket = null; // connection to be established in start()
        this.localAddress = null;
        this.remoteAddress = null;
    }

    start() {
        // open a TCP connection to the proxy
        this.socket = net.connect(Config.ProxyListeningAddress);

        this.socket.on('connect', () => {
            this.localAddress = this.socket.address();
            this.remoteAddress = this.socket.remoteAddress;
            console.log("Client at %j connected to %j",
                this.localAddress, this.remoteAddress);

            ++this.xCount;
            this.socket.setEncoding('binary');
            let xactType = Global.Types.getNumberedOrMatched(
                Transaction, this.xCount, this.socket);
            let xact = new xactType(this.socket, this.request);
            xact.start();
        });
    }

    stop(doneCallback) {
        if (this.socket) {
            this.socket.destroy(); // XXX: what if a transaction does it too?
            this.socket = null;
            console.log("Client at %j disconnected from %j",
                this.localAddress, this.remoteAddress);
        }
        // TODO: and kill all pending transactions?
        if (doneCallback)
            doneCallback();
    }
}
