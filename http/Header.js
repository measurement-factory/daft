/* Manages HTTP message header. */

import {Must} from "../Gadgets";


export default class Header {

    constructor() {
        this._raw = null; // as it was received or as it will be sent
        this._parsed = {}; // parsed or manually added values; TODO: rename and remove null checks
    }

    clone() {
        let dupe = new Header();
        dupe._raw = this._raw;
        if (this._parsed) {
            dupe._parsed = {};
            // shallow copy of all header fields
            for (var key in this._parsed) {
                dupe._parsed[key] = this._parsed[key];
            }
        }
        return dupe;
    }

    raw() {
        if (this._raw !== null)
            return this._raw;

        if (this._parsed === null)
            return null;

        let raw = "";
        for (var key in this._parsed) {
            raw += key + ": " + this._parsed[key] + "\r\n";
        }
        return raw;
    }

    // returns null if the header does not have Content-Length field(s)
    // returns undefined if the Content-Length field(s) are malformed
    // returns the well-formed/supported Content-Length value otherwise
    contentLength() {
        let name = 'Content-Length';
        if (!this.has(name)) // not specified at all
            return null;

        let value = this.values(name);
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
        Must(this._parsed);
        return name.toLowerCase() in this._parsed;
    }

    fields() {
        return this._parsed;
    }

    values(name) {
        if (!this.has(name))
            return null;
        return this._parsed[name.toLowerCase()];
    }

    add(name, value) {
        this._parsed[name.toLowerCase()] = value;
        if (this._raw !== null) {
            this._raw += name + ": " + value + "\r\n";
        } // else raw() will assemble
    }

    deleteNamed(name) {
        delete this._parsed[name.toLowerCase()];
        this._raw = null;
        // raw() will assemble
     }

    noteReceived(raw) {
        Must(this._raw === null);
        this._raw = raw;

        this._parse();
    }

    _parse() {
        Must(this._raw !== null);

        // replace obs-fold with a single space
        let rawH = this._raw;
        rawH.replace(/\r*\n\s+/, ' ');
        this._rawUnfolded = rawH;

        // isolate individual fields
        let parsedFields = 0;
        let fieldRe = /^[\t ]*(.*?)[\t ]*:[\t ]*(.*?)[\t \r]*$/mg;
        let match = null;
        while ((match = fieldRe.exec(rawH))) {
            Must(match.length === 3);
            this._addParsedField(match[1], match[2]);
            ++parsedFields;
        }

        if (!parsedFields) {
            console.log("Warning: Cannot parse raw headers!");
        }
    }

    _addParsedField(name, value) {
        // XXX: store same-name values in an array
        this._parsed[name.toLowerCase()] = value;
    }
}
