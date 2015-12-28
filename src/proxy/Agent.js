import net from "net";
import * as Config from "../misc/Config";
import * as Global from "../misc/Global";
import Transaction from "./Transaction";

export default class Agent {
    constructor() {
        this.xCount = 0;

        this.server = null; // TCP server to be created in start()
    }

    start() {
        // start a TCP server
        this.server = net.createServer();

        this.server.on('connection', userSocket => {
            ++this.xCount;
            userSocket.setEncoding('binary');
            let xactType = Global.Types.getNumberedOrMatched(
                Transaction, this.xCount, userSocket);
            let xact = new xactType(userSocket);
            xact.start();

        });

        this.server.on("listening", () => {
            console.log("Proxy listening on %j", this.server.address());
        });

        this.server.listen(Config.ProxyListeningAddress.port, Config.ProxyListeningAddress.host);
    }

    stop() {
        // TODO: kill all pending transactions first?
        if (this.server)
            this.server.close();
    }
}
