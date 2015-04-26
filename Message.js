/* Manages an HTTP request or response message, including headers and body */

import Header from "./Header";
import Body from "./Body";

export default class Message {

	// it is OK to omit the delimiter or both parameters
	constructor(header, delimiter) {
		this.header = new Header();
		if (header !== undefined)
			this.header.noteReceived(header);

		this.delimiter = delimiter !== undefined ? delimiter : "\r\n";

		this.body = new Body();
	}

	clone() {
		let dupe = new Message();
		dupe.header = this.header.clone();
		dupe.delimiter = this.delimiter;
		dupe.body = this.body.clone();
		return dupe;
	}
}
