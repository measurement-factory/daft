/* Base class for HTTP request or response message, including headers and body */

import Header from "./Header";

export default class Message {

    // it is OK to omit parameters
    constructor(header, headerDelimiter) {
        this.startLine = null;
        this.header = new Header();
        if (header !== undefined)
            this.header.noteReceived(header);

        this.headerDelimiter = headerDelimiter !== undefined ? headerDelimiter : "\r\n";

        this.body = null; // no body by default

        // called when the message transaction is finished
        this.callback = null;
    }

    clone() {
        let dupe = new Message();
        dupe.startLine = this.startLine.clone();
        dupe.header = this.header.clone();
        dupe.headerDelimiter = this.headerDelimiter;
        dupe.body = this.body ? this.body.clone() : null;
        dupe.callback = this.callback;
        return dupe;
    }

    rawPrefix() {
        return this.startLine.raw() +
            this.header.raw() +
            this.headerDelimiter;
    }
}
