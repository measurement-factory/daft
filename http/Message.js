/* Manages an HTTP request or response message, including headers and body */

import Header from "./Header";
import RequestLine from "./RequestLine";

export default class Message {

	// it is OK to omit parameters
	constructor(requestLine, header, headerDelimiter) {
		this.requestLine = new RequestLine();
		if(requestLine !== undefined)
			this.requestLine.noteReceived(requestLine);

		this.header = new Header();
		if (header !== undefined)
			this.header.noteReceived(header);

		this.headerDelimiter = headerDelimiter !== undefined ? headerDelimiter : "\r\n";

		this.body = null; // no body by default

		// called when the message transaction is finished
		this.callback = null;
	}

	clone() {
		let dupe = new Message();
		dupe.requestLine = this.requestLine.clone();
		dupe.header = this.header.clone();
		dupe.headerDelimiter = this.headerDelimiter;
		dupe.body = this.body ? this.body.clone() : null;
		dupe.callback = this.callback;
		return dupe;
	}

	rawPrefix() {
		return this.requestLine.raw() +
			this.header.raw() +
			this.headerDelimiter;
	}
}
