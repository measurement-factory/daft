/* Manages an HTTP request or response message, including headers and body */

import Body from "./Body";

export default class Message {

	constructor(header, delimiter) {
		this.header = header;
		this.delimiter = delimiter;

		this.body = new Body();
	}
}
