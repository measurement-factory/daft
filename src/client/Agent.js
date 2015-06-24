import net from "net";
import * as Config from "../misc/Config";
import * as Global from "../misc/Global";
import Transaction from "./Transaction";

export default class Agent {
    constructor() {
        this.xCount = 0;
        this.request = null; // optional default for all transactions

        this.socket = null; // connection to be established in start()
    }

    start() {
        // open a TCP connection to the proxy
        this.socket = net.connect(Config.ListeningAddress);

        this.socket.on('connect', () => {
            console.log("Client at %j connected to %j",
                this.socket.address(), this.socket.remoteAddress);

            ++this.xCount;
            this.socket.setEncoding('binary');
            let xactType = Global.Types.getNumberedOrMatched(
                Transaction, this.xCount, this.socket);
            let xact = new xactType(this.socket, this.request);
            xact.start();
        });
    }

    stop() {
        if (this.socket)
            this.socket.destroy(); // XXX: what if a transaction does it too?
        // TODO: and kill all pending transactions?
    }
}
