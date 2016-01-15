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
        return this.name + this.separator + this.value + this.terminator;
    }

    parse(raw) {
        let fieldRe = /^(.*?)([\t ]*:[\t ]*)(.*?)([\t \r]*\n)$/;
        const match = fieldRe.exec(raw);
        if (match) {
            Must(match.length === 5);
            this.name = match[1]; // right-trimmed
            this.separator = match[2];
            this.value = match[3]; // trimmed
            this.terminator = match[4];
        } else {
            console.log(`Warning: Cannot parse ${raw.length}-byte header field: ${raw}`);
            this.name = raw;
            this.separator = "";
            this.value = "";
            this.terminator = "";
        }
    }

    static Parse(raw) {
        let field = new Field();
        field.parse(raw);
        return field;
    }

    static Id(name) {
        return name.toLowerCase();
    }
}
