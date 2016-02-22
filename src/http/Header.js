/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

/* Manages HTTP message header. */

import Field from "./Field";
import { Must } from "../misc/Gadgets";


export default class Header {

    constructor() {
        this._raw = null; // as it was received or as it will be sent
        this.fields = []; // parsed or manually added Fields, in appearance/addition order
    }

    clone() {
        let dupe = new Header();
        dupe._raw = this._raw;
        for (let field of this.fields)
            dupe.fields.push(field.clone());
        return dupe;
    }

    finalize() {
        for (let field of this.fields)
            field.finalize();
    }

    raw() {
        if (this._raw !== null)
            return this._raw;

        let raw = "";
        for (let field of this.fields)
            raw += field.raw();
        return raw;
    }

    // returns null if the header does not have Content-Length field(s)
    // returns undefined if the Content-Length field(s) are malformed
    // returns the well-formed/supported Content-Length value otherwise
    contentLength() {
        let name = 'Content-Length';

        if (!this.has(name)) // not specified at all
            return null;

        let values = this.values(name);
        let value = values.pop();

        if (values.length > 1) { // multiple values
            // TODO: We should compare _parsed_ items.
            if (!value.every(function(item) { return item === value; }))
                return undefined; // multiple different values
        }

        if (!/^\d*$/.test(value)) // not an integer
            return undefined;

        if (/^0./.test(value)) // starts with 0 but not a "0"
            return undefined;

        let len = Number.parseInt(value, 10);
        if (!Number.isSafeInteger(len)) // too big
            return undefined;

        return len;
    }

    chunked() {
        let name = 'Transfer-Encoding';
        if (!this.has(name)) // not specified at all
            return null;

        let codings = this.values('Transfer-Encoding');
        return codings.indexOf("chunked") >= 0; // XXX: imprecise!
    }

    has(name) {
        let id = Field.Id(name);
        for (let field of this.fields) {
            if (field.id() === id)
                return field;
        }
        return null;
    }

    values(name) {
        let result = [];
        let id = Field.Id(name);
        for (let field of this.fields) {
            if (field.id() === id)
                result.push(field.value);
        }
        return result;
    }

    // throws if a single value was requested but 0 or 2+ were present
    value(name) {
        let values = this.values(name);
        Must(values.length === 1);
        return values[0];
    }

    add(...args) {
        let field = null;
        if (args.length === 1) { // add(field)
            Must(args[0] instanceof Field);
            field = args[0].clone();
        } else {
            Must(args.length === 2); // add(name, value)
            field = new Field(...args);
        }
        Must(field);
        this.fields.push(field);
        if (this._raw !== null) {
            this._raw += field.raw();
        } // else raw() will assemble
    }

    deleteAllNamed(name) {
        let id = Field.Id(name);
        this.fields.filter((field) => {
            return field.id() !== id; // true result keeps the field
        });
        this._raw = null;
        // raw() will assemble
    }

    parse(raw) {
        Must(!this.fields.length);
        Must(this._raw === null);
        Must(raw !== null && raw !== undefined);
        this._raw = raw;

        // replace obs-fold with a single space
        let rawH = this._raw;
        rawH.replace(/\r*\n\s+/, ' ');

        let rawFields = rawH.split('\n');
        Must(rawFields.length); // our caller requires CRLF at the headers end
        Must(!rawFields.pop().length); // the non-field after the last CRLF
        for (let rawField of rawFields) {
            let field = Field.Parse(rawField + "\n");
            Must(field);
            this.fields.push(Field.Parse(rawField + "\n"));
        }

        if (!this.fields.length)
            console.log(`Warning: Found no headers in ${rawH}`);
    }
}
