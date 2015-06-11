import net from "net";
import * as Config from "../misc/Config";
import * as Global from "../misc/Global";
import Transaction from "./Transaction";

export default class Agent {
    constructor() {
        this.xCount = 0;
        this.response = null; // optional default for all transactions

        this.server = null; // TCP server to be created in start()
    }

    start() {
        // start a TCP server
        this.server = net.createServer();

        this.server.on('connection', userSocket => {
            ++this.xCount;
            let xactType = Global.Types.getNumberedOrMatched(
                Transaction, this.xCount, userSocket);
            let xact = new xactType(userSocket, this.response);
            xact.start();
        });

        this.server.listen(Config.OriginAddress.port, Config.OriginAddress.host,
            () => function() {
                console.log("Server listening on %j", this.server.address());
            });
    }

    stop() {
        // TODO: kill all pending transactions first?
        if (this.server)
            this.server.close();
    }
}
