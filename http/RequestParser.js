/* Incrementally parses HTTP request messages, including headers and body */

import Message from "./Message";
import Body from "./Body";
import { Must, PrettyMime } from "../Gadgets";

export default class RequestParser {

	constructor(transaction) {
		this.transaction = transaction;
		this.message = null;

		this._raw = ""; // unparsed data
	}

	parse(data) {
		this._raw += data;

		if (this.message === null)
			this.parsePrefix();

		if (this.message.body !== null)
			this.parseBody();

		// TODO: complain about leftovers
	}

	parsePrefix() {
		let messageRe = /^([\s\S]*?\r*\n)([\s\S]*?\n)(\r*\n)([\s\S]*)$/;
		let match = messageRe.exec(this._raw.toString());
		if (match === null) {
			console.log("no end of headers yet");
			return;
		}

		this.message = new Message(match[1], match[2], match[3]);
		this._raw = match[4]; // body [prefix] or an empty string

		this.determineBodyLength();
	}

	determineBodyLength() {
		Must(!this.message.body);
		// TODO: set true body length when possible
		// XXX: do not disclaim body presence when there is one
		let len = this.message.header.contentLength();
		if (len === null) {
			 // do nothing: requests do not have bodies by default
			 console.log("assuming no message body");
		} else if (len !== undefined) {
			this.message.body = new Body;
			this.message.body.setLength(len);
			 console.log("expecting %d message body bytes", len);
		} else {
			this.message.body = new Body;
			console.log("Warning: Cannot determine message length");
		}
	}

	parseBody() {
		Must(this.message.body);
		// TODO: dechunk (and set final length) as needed
		this.message.body.in(this._raw);
		this._raw = "";
	}
}
