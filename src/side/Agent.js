import Promise from 'bluebird';
import * as Global from "../misc/Global";

export default class Agent {
    constructor() {
        this.xCount = 0;

        this.transactionPromise = new Promise((resolve) => {
            this.transactionPromiseResolver_ = resolve;
        });
    }

    stop() {
        return Promise.try(() => {
            return this.stop_();
        });
    }

    transaction() {
        return this.transactionPromise.value(); // throws if unresolved
    }

    stop_() {
        // TODO: and kill all pending transactions?
        return Promise.resolve(this);
    }

    startTransaction_(defaultTransactionClass, socket, ...other) {
        ++this.xCount;
        socket.setEncoding('binary');
        let xactType = Global.Types.getNumberedOrMatched(
            defaultTransactionClass, this.xCount, socket);
        let xact = new xactType(socket, ...other);
        xact.doneCallback = this.transactionPromiseResolver_;
        xact.start();
    }
}
