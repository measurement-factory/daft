import Promise from 'bluebird';
import * as Global from "../misc/Global";

export default class Agent {
    constructor() {
        this.xCount = 0;

        this.transactionPromise = new Promise((resolve) => {
            this._transactionPromiseResolver = resolve;
        });
    }

    stop() {
        return Promise.try(() => {
            return this._stop();
        });
    }

    transaction() {
        return this.transactionPromise.value(); // throws if unresolved
    }

    _stop() {
        // TODO: and kill all pending transactions?
        return Promise.resolve(this);
    }

    _startTransaction(defaultTransactionClass, socket, ...other) {
        ++this.xCount;
        socket.setEncoding('binary');
        let xactType = Global.Types.getNumberedOrMatched(
            defaultTransactionClass, this.xCount, socket);
        let xact = new xactType(socket, ...other);
        xact.doneCallback = this._transactionPromiseResolver;
        xact.start();
    }
}
