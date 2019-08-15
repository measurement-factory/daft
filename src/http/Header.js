/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

/* Manages HTTP message header. */

import Field from "./Field";
import { Must } from "../misc/Gadgets";


export default class Header {

    constructor() {
        this.fields = []; // parsed or manually added Fields, in appearance/addition order
        this._raw = null; // set to received bytes; reset to null on any change
        this.filters = []; // functions that decide which fields are removed by finalize()
    }

    clone() {
        let dupe = new Header();
        dupe._raw = this._raw;
        for (let field of this.fields)
            dupe.fields.push(field.clone());
        // we cannot clone a filter but can and should clone the array
        dupe.filters = this.filters.slice(0);
        return dupe;
    }

    finalize() {
        // remove each unwanted field
        this.fields = this.fields.filter(field => this._wantedField(field));
        // finalize each wanted field
        this.fields.forEach(field => field.finalize());
    }

    // Is this field allowed by all the filters?
    _wantedField(field) {
        return this.filters.every(filter => filter(field));
    }

    prohibitNamed(name) {
        this.filters.push(field => field.name !== name);
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
            if (!value.every(function (item) {
                return item === value;
            }))
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

    addByDefault(...args) {
        let field = this._argsToField(...args);
        if (!this.has(field.name))
            this.add(field);
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
