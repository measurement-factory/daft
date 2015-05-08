/* Manages HTTP request-line. */

import {Must} from "./Gadgets";
import Uri from "./Uri";

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

	raw() {
		return this.method + this.methodDelimiter +
			this.uri.raw() + this.uriDelimiter +
			this._rest +
			this.terminator;
	}

	noteReceived(rawBytes) {
		this._parse(rawBytes);
	}

	_parse(raw) {
		let reqRe = /^(\S+)(\s+)([\s\S]*\S)(\s+)(\S+)(\r*\n)$/;
		let match = reqRe.exec(raw);
		if(!match)
			throw new Error("Unable to parse request-line: " + raw);
		this.method = match[1];
		this.methodDelimiter = match[2];
		this.uri = Uri.Parse(match[3]);
		this.uriDelimiter = match[4];
		this._rest = match[5];
		this.terminator = match[6];
	}
}
