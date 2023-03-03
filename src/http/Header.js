/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

/* Manages HTTP message header. */

import Field from "./Field";
import { Must } from "../misc/Gadgets";
import * as Misc from "../misc/Gadgets";
import * as Http from "../http/Gadgets";
import * as Config from "../misc/Config";
import assert from "assert";


export default class Header {

    constructor() {
        this.fields = []; // parsed or manually added Fields, in appearance/addition order
        this._raw = null; // set to received bytes; reset to null on any change
        this.filters = []; // functions that decide which fields are removed by finalize()

        // prohibitNamed() allows a test case to delete fields added by
        // lower-level code. These fields allow a test case to add fields that
        // cannot be overwritten (or even seen!) by the low-level code.
        // Usually, the two mechanisms are used together in order to customize
        // a value of the field used by the lower-level code.
        this._extraFields = [];

        // minimum raw().length value of a finalized header
        this._minimumSize = 0;
    }

    clone() {
        let dupe = new Header();
        dupe._raw = this._raw;
        for (let field of this.fields)
            dupe.fields.push(field.clone());
        for (let field of this._extraFields)
            dupe._extraFields.push(field.clone());
        // we cannot clone a filter but can and should clone the array
        dupe.filters = this.filters.slice(0);
        return dupe;
    }

    finalize() {
        // remove each unwanted field
        this.fields = this.fields.filter(field => this._wantedField(field));
        // finalize each wanted field
        this.fields.forEach(field => field.finalize());
        // finalize each overwriting field
        this._extraFields.forEach(field => field.finalize());

        if (this._minimumSize > 0) {
            const bareLength = this.raw().length;
            if (this._minimumSize > bareLength) {
                this._stuff(this._minimumSize - bareLength);
                assert(this.raw().length >= this._minimumSize);
            }
        }
    }

    // ensures that the finalized header is at least n bytes long
    enforceMinimumSize(n) {
        assert(n >= 0);
        assert(!this._minimumSize); // for simplicity sake
        if (n > 0)
            console.log("will enforce minimum header size of", n, "bytes");
        this._minimumSize = n;
    }

    // adds a custom field that is at least length bytes long
    _stuff(length) {
        let stuffingField = this._argsToField(Http.DaftFieldName("Stuffing"), 'x');
        stuffingField.finalize();
        const stuffingMin = stuffingField.raw().length;
        if (length > stuffingMin)
            stuffingField.value += 'x'.repeat(length - stuffingMin);
        this.add(stuffingField);
    }

    // Is this field allowed by all the filters?
    _wantedField(field) {
        return this.filters.every(filter => filter(field));
    }

    prohibitNamed(name) {
        this.filters.push(field => field.name !== name);
    }

    // prohibit all fields with a Http.DaftFieldName() prefix
    prohibitDaftMarkings() {
        const daftMarking = Http.DaftFieldName("");
        this.filters.push(field => !field.name.startsWith(daftMarking));
    }

    // returns null if the header does not have Content-Length field(s)
    // returns undefined if the Content-Length field(s) are malformed
    // returns the well-formed/supported Content-Length value otherwise
    // supports overrides via a Daft-specific Content-Length field.
    contentLength() {
        const stdName = 'Content-Length';
        const overrideName = Http.DaftFieldName(stdName);
        if (this.has(overrideName)) {
            const result = this.contentLength_(overrideName);
            console.log(`Warning: Using ${overrideName}: ${result}`);
            return result;
        }
        if (this.has(stdName))
            return this.contentLength_(stdName);
        return null; // not specified at all
    }

    // contentLength() helper; does not know about overriding standard names
    contentLength_(name) {
        let values = this.values(name);
        let value = values.pop();

        if (values.length > 1) { // multiple values
            // TODO: We should compare _parsed_ items.
            if (!value.every(function (item) {
                return item === value;
            }))
                return undefined; // multiple different values
        }

        return Misc.ToUnsigned(value);
    }

    raw() {
        if (this._raw !== null)
            return this._raw;

        // TODO: Hide Header::fields and stop violating Header boundaries.
        return this.fields.map(f => f.raw()).join("") +
            this._extraFields.map(f => f.raw()).join("");
    }

    chunked() {
        let name = 'Transfer-Encoding';
        if (!this.has(name)) // not specified at all
            return null;

        let codings = this.values('Transfer-Encoding');
        return codings.indexOf("chunked") >= 0; // XXX: imprecise!
    }

    // returns the extracted multirange boundary string (or null)
    multiRangeBoundary() {
        const name = 'Content-Type';
        if (!this.has(name))
            return null;
        const value = this.value(name);
        if (!value.includes('multipart/byteranges'))
            return null;
        const token = value.split(';').map(el => el.trim()).find(el => el.startsWith('boundary'));
        if (!token)
            return null;
        const boundary = token.substring(token.indexOf('=')+1).trim();
        // remove extra quotes, added, e.g., by Squid
        return boundary.replace(/^"(.*)"$/, '$1');
    }

    addWarning(code, text = "warning text") {
        this.add("Warning", `${code} daft-host "${text}"`);
    }

    hasWarning(code) {
        const name = 'Warning';
        if (this.has(name)) {
            const values = this.values(name);
            for (let v of values) {
                const match = /^([0-9]+) /.exec(v);
                if (match) {
                    if (code === Number.parseInt(match[1], 10))
                        return true;
                }
            }
        }
        return false;
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
        let field = this._argsToField(...args);
        this.fields.push(field);
        this._raw = null;
    }

    addMany(...args) {
        args.map(v => this.add(v));
    }

    addByDefault(...args) {
        let field = this._argsToField(...args);
        if (!this.has(field.name))
            this.add(field);
    }

    // adds a field that will overwrite any regular same-name field, even if
    // that regular field is added later
    addOverwrite(...args) {
        const field = this._argsToField(...args);
        this.prohibitNamed(field.name);
        this._extraFields.push(field);
        this._raw = null;
    }

    deleteAllNamed(name) {
        let id = Field.Id(name);
        this.fields = this.fields.filter((field) => {
            return field.id() !== id; // true result keeps the field
        });
        this._raw = null;
    }

    // converts field-or-(name,value) method arguments to field
    _argsToField(...args) {
        let field = null;
        if (args.length === 1) { // foo(field)
            Must(args[0] instanceof Field);
            field = args[0].clone();
        } else {
            Must(args.length === 2); // foo(name, value)
            field = new Field(...args);
        }
        Must(field);
        return field;
    }
}
