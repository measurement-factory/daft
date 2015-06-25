/* Base class for HTTP request or response message, including headers and body */

import Header from "./Header";
import { Must } from "../misc/Gadgets";

export default class Message {

    constructor(startLine, ...args) {
        Must(startLine);
        Must(!args.length);

        this.startLine = startLine;

        this.header = new Header();
        this.headerDelimiter = null;

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

    finalize() {
        this.startLine.finalize();
        this.header.finalize();
        if (this.headerDelimiter === null)
            this.headerDelimiter = "\r\n";
        // do not finalize this.message.body; it may be dynamic
    }

    rawPrefix() {
        return this.startLine.raw() +
            this.header.raw() +
            this.headerDelimiter;
    }
}
