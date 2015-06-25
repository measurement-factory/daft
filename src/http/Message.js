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

    // creates and returns an exact replica of this message
    clone() {
        let dupe = new this.constructor();
        dupe.reset(this);
        return dupe;
    }

    // makes us an exact replica of them
    reset(them) {
        this.startLine = them.startLine.clone();
        this.header = them.header.clone();
        this.headerDelimiter = them.headerDelimiter;
        this.body = them.body ? them.body.clone() : null;
        this.callback = them.callback;
        return this;
    }

    rawPrefix() {
        return this.startLine.raw() +
            this.header.raw() +
            this.headerDelimiter;
    }
}
