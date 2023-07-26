/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

/* Incrementally parses an HTTP message, including first-line, headers, and body */

import * as Config from "../../misc/Config";
import Body from "../Body";
import ChunkedDecoder from "./ChunkedDecoder";
import IdentityDecoder from "./IdentityDecoder";
import { Must, PrettyMime, PrettyBody } from "../../misc/Gadgets";
import { parseHeader } from "./HeaderParser"

import assert from "assert";

export default class MessageParser {

    constructor(transaction) {
        assert(transaction);
        this.transaction = transaction;

        this.message = null;

        /* kids must set these in their constructors */
        this._messageType = null;
        this._messageKind = null;

        this._raw = ""; // unparsed data

        this._bodyDecoder = null; // will be set if we expect a body

        this.logPrefix = null; // should be set by the user
    }

    parse(data) {
        this._raw += data;

        if (!this.message)
            this.parsePrefix();

        if (this.message) {
            if (this.message.body)
                this.parseBody();
            else
                this._log(`parsed the entire bodyless ${this._messageKind}`);
        }

        // TODO: complain about leftovers
    }

    parsePrefix() {
        let messageRe = /^(.*\r*\n)([\s\S]*?\n)(\r*\n)([\s\S]*)$/;
        let match = messageRe.exec(this._raw.toString());
        if (match === null) {
            this._log(`no end of ${this._messageKind} headers yet`);
            return;
        }

        this.message = new this._messageType();
        this.message.startLine = this.parseStartLine(match[1]);
        this.message.header = parseHeader(match[2]);
        this.message.headerDelimiter = match[3];
        this._raw = match[4]; // body [prefix] or an empty string

        const parsed = match[1] + match[2] + match[3];
        this._log(`parsed ${this._messageKind} header` + PrettyMime(this.logPrefix, parsed));

        this.determineBodyLength();
    }

    parseStartLine(/*raw*/) {
        Must(false, "pure virtual: kids must override");
    }

    // called for messages with neither Content-Length nor chunked encoding
    // must create and configure a body if one is needed
    determineDefaultBody() {
        Must(false); // pure virtual: kids must override
    }

    determineBodyLength() {
        Must(!this.message.body);
        Must(!this._bodyDecoder);
        // TODO: set true body length when possible
        // XXX: do not disclaim body presence when there is one
        if (this.message.header.chunked()) { // overwrites Content-Length
            this._bodyDecoder = new ChunkedDecoder();
            this.message.body = new Body();
            this._log("expecting chunked message body");
        } else {
            const len = this.message.header.contentLength();
            if (len === null) {
                this.determineDefaultBody();
            } else if (len === undefined) {
                this.message.body = new Body();
                this._log("Warning: Cannot determine message length");
            } else {
                this.message.body = new Body();
                this._log(`expecting ${len} message body bytes`);
            }
            if (this.message.body && !this._bodyDecoder)
                this._bodyDecoder = new IdentityDecoder(len === undefined ? null : len);
        }
    }

    parseBody() {
        Must(this.message.body);

        Must(this._bodyDecoder);
        const decodedBody = this._bodyDecoder.decode(this._raw);
        this.message.body.in(decodedBody);
        this._raw = ""; // the decoder may keep any unparsed leftovers

        if (this._bodyDecoder.decodedAll())
            this.message.body.innedAll = true;

        let reportedAll = false;

        // log body parsing progress
        const parsedLength = decodedBody.length;
        if (parsedLength && Config.logBodyProgress(this.message.body.innedSize())) {
            const parsedAllNow = this.message.body.innedAll &&
                decodedBody.length === this._bodyDecoder.outputSize();
            const parsedThing = parsedAllNow ?
                `the entire ${this._messageKind} body`:
                `a piece of the ${this._messageKind} body`;
            this._log(`parsed ${parsedThing}` + PrettyBody(this.logPrefix, decodedBody));
            reportedAll = parsedAllNow;
        }

        if (this.message.body.innedAll && !reportedAll)
            this._log(`parsed the entire ${this._messageKind} body`);
    }

    _log(/* console log entries */) {
        this.transaction.context.log(...arguments);
    }
}
