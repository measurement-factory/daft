import net from "net";
import * as Config from "../misc/Config";
import * as Global from "../misc/Global";
import Transaction from "./Transaction";
import { Must } from "../misc/Gadgets";

export default class Agent {
    constructor() {
        this.xCount = 0;
        this.response = null; // optional default for all transactions

        this.server = null; // TCP server to be created in start()
    }

    start(listensCallback) {

        // start a TCP server
        this.server = net.createServer();

        this.server.on('connection', userSocket => {
            ++this.xCount;
            userSocket.setEncoding('binary');
            let xactType = Global.Types.getNumberedOrMatched(
                Transaction, this.xCount, userSocket);
            let xact = new xactType(userSocket, this.response);
            xact.start();
        });

        this.server.listen(Config.OriginListeningAddress.port,
            Config.OriginListeningAddress.host, (error) => {
            Must(!error);
            console.log("Server listening on %j", this.server.address());
            if (listensCallback)
                listensCallback();
        });
    }

    stop(closedCallback) {
        // TODO: kill all pending transactions first?
        if (this.server && this.server.address()) {
            let savedAddress = this.server.address();
            this.server.close((error) => {
                Must(!error);
                console.log("Server stopped listening on %j", savedAddress);
                if (closedCallback)
                    closedCallback();
            });
        } else {
            if (closedCallback)
                closedCallback();
        }
    }
}
