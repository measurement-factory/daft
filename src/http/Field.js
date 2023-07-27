/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

/* A name:value(s) pair. */

import { Must } from "../misc/Gadgets";


export default class Field {

    constructor(name, value) {
        if (name === undefined && value === undefined) {
            this.name = null;
            this.separator = null;
            this.value = null;
            this.terminator = null;
        } else {
            Must(name !== undefined);
            Must(value !== undefined);
            this.name = name;
            this.separator = ": ";
            this.value = value.toString(); // TODO: add Must(string|integer)
            this.terminator = "\r\n";
        }
    }

    clone() {
        let dupe = new Field(this.name, this.value);
        dupe.separator = this.separator;
        dupe.terminator = this.terminator;
        return dupe;
    }

    id(...args) {
        Must(!args.length);
        Must(this.name !== null);
        return this.name.toLowerCase();
    }

    finalize() {
        if (this.separator === null)
            this.separator = ": ";
        if (this.terminator === null)
            this.terminator = "\r\n";
    }

    raw() {
        return this.name + this.separator +
            this.value + this.terminator;
    }

    static Id(name) {
        return name.toLowerCase();
    }
}
