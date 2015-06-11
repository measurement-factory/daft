/* Manages HTTP request-line. */

import Uri from "../anyp/Uri";
import * as Config from "../misc/Config";

export default class RequestLine {

    constructor() {
        this.method = null;
        this.methodDelimiter = null;
        this.uri = new Uri();
        this.uriDelimiter = null;
        this._rest = null;
        this.terminator = null;
    }

    clone() {
        let dupe = new RequestLine();
        dupe.method = this.method;
        dupe.methodDelimiter = this.methodDelimiter;
        dupe.uri = this.uri.clone();
        dupe.uriDelimiter = this.uriDelimiter;
        dupe._rest = this._rest;
        dupe.terminator = this.terminator;
        return dupe;
    }

    toString() {
        return this.raw();
    }

    finalize() {
        // XXX: Do not overwrite already set properties
        this.method = "GET";
        this.methodDelimiter = " ";

        const url = `http://${Config.OriginAddress.host}:${Config.OriginAddress.port}/`;
        this.uri = Uri.Parse(url); // XXX: call uri.finalize() instead

        this.uriDelimiter = " ";
        this._rest = "HTTP/1.1";
        this.terminator = "\r\n";
    }

    raw() {
        let image = "";
        if (this.method !== null)
            image += this.method;
        if (this.methodDelimiter !== null)
            image += this.methodDelimiter;
        image += this.uri.raw();
        if (this.uriDelimiter !== null)
            image += this.uriDelimiter;
        if (this._rest !== null)
            image += this._rest;
        if (this.terminator !== null)
            image += this.terminator;
        return image;
    }

    noteReceived(rawBytes) {
        this._parse(rawBytes);
    }

    _parse(raw) {
        let reqRe = /^(\S+)(\s+)([\s\S]*\S)(\s+)(\S+)(\r*\n)$/;
        let match = reqRe.exec(raw);
        if (!match)
            throw new Error("Unable to parse request-line: " + raw);
        this.method = match[1];
        this.methodDelimiter = match[2];
        this.uri = Uri.Parse(match[3]);
        this.uriDelimiter = match[4];
        this._rest = match[5];
        this.terminator = match[6];
    }
}
