/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

/* Incrementally parses an HTTP message, including first-line, headers, and body */

import Field from "../Field";
import Header from "../Header";
import Body from "../Body";
import { Must, PrettyMime, PrettyBody } from "../../misc/Gadgets";
import * as Config from "../../misc/Config";

export default class MessageParser {

    constructor(transaction) {
        this.transaction = transaction;
        this.message = null;

        /* kids must set these in their constructors */
        this._messageType = null;
        this._messageKind = null;

        this._raw = ""; // unparsed data
        this.expectBody = true;

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
                console.log(`parsed the entire bodyless ${this._messageKind}`);
        }

        // TODO: complain about leftovers
    }

    parsePrefix() {
        let messageRe = /^(.*\r*\n)([\s\S]*?\n)(\r*\n)([\s\S]*)$/;
        let match = messageRe.exec(this._raw.toString());
        if (match === null) {
            console.log(`no end of ${this._messageKind} headers yet`);
            return;
        }

        this.message = new this._messageType();
        this.message.startLine = this.parseStartLine(match[1]);
        this.message.header = this.parseHeader(match[2]);
        this.message.headerDelimiter = match[3];
        this._raw = match[4]; // body [prefix] or an empty string

        const parsed = match[1] + match[2] + match[3];
        console.log(`parsed ${parsed.length} ${this._messageKind} header bytes:\n` +
                PrettyMime(this.logPrefix, parsed));

        this.determineBodyLength();
    }

    parseStartLine(/*raw*/) {
        Must(false, "pure virtual: kids must override");
    }

    parseField(raw) {
        let fieldRe = /^(.*?)([\t ]*:[\t ]*)(.*?)([\t \r]*\n)$/;
        const match = fieldRe.exec(raw);

        let field = new Field();

        if (match) {
            Must(match.length === 5);
            field.name = match[1]; // right-trimmed
            field.separator = match[2];
            field.value = match[3]; // trimmed
            field.terminator = match[4];
        } else {
            console.log(`Warning: Cannot parse ${raw.length}-byte header field: ${raw}`);
            field.name = raw;
            field.separator = "";
            field.value = "";
            field.terminator = "";
        }

        return field;
    }

    parseHeader(raw) {
        let header = new Header();

        Must(raw !== null && raw !== undefined);
        header._raw = raw;

        // replace obs-fold with a single space
        let rawH = raw.replace(/\r*\n\s+/, ' ');

        let rawFields = rawH.split('\n');
        Must(rawFields.length); // our caller requires CRLF at the headers end
        Must(!rawFields.pop().length); // the non-field after the last CRLF
        for (let rawField of rawFields) {
            let field = this.parseField(rawField + "\n");
            Must(field);
            header.fields.push(field);
        }

        if (!header.fields.length)
            console.log(`Warning: Found no headers in ${rawH}`);

        return header;
    }

    // called for messages with neither Content-Length nor chunked encoding
    // must create and configure a body if one is needed
    determineDefaultBody() {
        Must(false); // pure virtual: kids must override
    }

    determineBodyLength() {
        Must(!this.message.body);
        if (!this.expectBody)
            return;
        // TODO: set true body length when possible
        // XXX: do not disclaim body presence when there is one
        let len = this.message.header.contentLength();
        if (len === null)
            this.determineDefaultBody();
        else if (len === undefined) {
            this.message.body = new Body();
            console.log("Warning: Cannot determine message length");
        } else {
            this.message.body = new Body();
            this.message.body.setLength(len);
            console.log("expecting %d message body bytes", len);
        }
    }

    parseBody() {
        Must(this.message.body);

        // TODO: dechunk (and set final length) as needed
        this.message.body.in(this._raw);

        const parsedLength = this._raw.length;
        if (parsedLength) {
            const suffix = Config.LogBodies ?
                ":\n" + PrettyBody(this.logPrefix, this._raw):
                "";
            console.log(`parsed ${parsedLength} ${this._messageKind} body bytes so far${suffix}`);
        }
        if (this.message.body.innedAll())
            console.log(`parsed all ${this.message.body.innedSize()} expected ${this._messageKind} body bytes`);

        this._raw = "";
    }
}
