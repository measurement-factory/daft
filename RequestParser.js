/* Incrementally parses HTTP request messages, including headers and body */

import Message from "./Message";

export default class RequestParser {

	constructor(transaction) {
		this.transaction = transaction;
		this.message = null;

		this._raw = ""; // unparsed data
	}

	parse(data) {
		this._raw += data;

		if (this.message === null)
			this.parseHeader();

		if (this.message !== null)
			this.parseBody();
	}

	parseHeader() {
		let messageRe = /^([\s\S]*?\n)(\r*\n)([\s\S]*)$/;
		let match = messageRe.exec(this._raw.toString());
		if (match === null) {
			console.log("no end of headers yet");
			return;
		}

		this.message = new Message(match[1], match[2]);
		this._raw = match[3]; // body [prefix] or an empty string

		this.determineBodyLength();
	}

	determineBodyLength() {
		// TODO: set true body length when possible
		// XXX: do not disclaim body presence when there is one
		let len = this.message.header.contentLength();
		if (len === null) // requests do not have bodies by default
			this.message.body.setLength(0);
		else if (len !== undefined)
			this.message.body.setLength(len);
		else
			console.log("Warning: Cannot determine message length");
	}

	parseBody() {
		// TODO: dechunk (and set final length) as needed
		this.message.body.in(this._raw);
		this._raw = "";
	}
}
