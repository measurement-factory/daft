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
        return this;
    }

    finalize() {
        this.startLine.finalize();
        this.header.finalize();
        if (this.headerDelimiter === null)
            this.headerDelimiter = "\r\n";
        this.syncContentLength();
        // do not finalize this.body; it may be dynamic
    }

    rawPrefix() {
        return this.startLine.raw() +
            this.header.raw() +
            this.headerDelimiter;
    }

    addBody(body) {
        Must(!this.body); // not a reset; we do not remove old Content-Length
        this.body = body;
        this.syncContentLength();
    }

    syncContentLength() {
        if (this.body !== null && this.body.length() !== null && !this.header.has("Content-Length"))
            this.header.add("Content-Length", this.body.length());
    }
}
