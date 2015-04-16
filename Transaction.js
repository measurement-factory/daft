/* Transaction is a single (user agent request, origin response) tuple. */

import net from 'net';
import * as Config from './Config';
import * as Global from "./Global";
import RequestParser from "./RequestParser";

export default class Transaction {

	constructor(userSocket) {
		let myType = Object.getPrototypeOf(this).constructor.name;
		console.log(`starting ${myType} transaction`);

		this.userSocket = null;
		this.originSocket = null;

		this.requestParser = null;
		this.responseParser = null;

		this.virginRequest = null;
		this.adaptedRequest = null;

		this.startServingUser(userSocket);
		this.sendRequest();
	}

	destructor() {
		let myType = Object.getPrototypeOf(this).constructor.name;
		console.log(`ending ${myType} transaction`);
	}

	startServingUser(userSocket) {
		this.userSocket = userSocket;

		/ * setup event listeners for the user agent socket */

		userSocket.on('data', data => {
			this.onUserReceive(data);
		});

		userSocket.on('end', () => {
			console.log("user disconnected");
			this.userSocket = null;
			if (this.originSocket)
				this.originSocket.end();
			else
				this.destructor();
		});
	}

	startConnectingToOrigin() {
		this.originSocket = net.connect(Config.OriginAddress);

		/ * setup event listeners for the origin socket */

		this.originSocket.on('connection', () => {
			let addr = `${this.originSocket.remoteAddress}:${this.originSocket.remotePort}`;
			console.log(`connected to ${addr}`);
		});

		this.originSocket.on('data', data => {
			this.onOriginReceive(data);
		});

		this.originSocket.on('end', () => {
			console.log("origin disconnected");
			this.originSocket = null;
			if (this.userSocket)
				this.userSocket.end();
			else
				this.destructor();
		});
	}

	onUserReceive(virginData) {
		this.parseRequest(virginData);
		this.sendRequest();
	}

	parseRequest(virginData) {
		if (!this.requestParser)
			this.requestParser = new RequestParser(this);

		this.requestParser.parse(virginData);

		if (!this.virginRequest && this.requestParser.message)
			this.virginRequest = this.requestParser.message;
	}

	sendRequest() {
		// XXX: temporary hack until we have a real sender class
		if (this.sent)
			return;

		if (!this.adaptedRequest)
			this.adaptRequest();

		if (!this.adaptedRequest) {
			console.log("not ready to forward the request");
			return;
		}

		if (!this.originSocket)
			this.startConnectingToOrigin();

		// now or when finished connecting
		this.originSocket.write(this.adaptedRequest.header.toString());
		this.originSocket.write(this.adaptedRequest.delimiter.toString());
		this.originSocket.write(this.adaptedRequest.body.out());
		this.sent = true;
	}

	onOriginReceive(virginResponse) {
		let adaptedResponse = this.adaptResponse(virginResponse);
		this.userSocket.write(adaptedResponse);
	}

	adaptRequest() {
		if (!this.virginRequest)
			return;

		this.adaptedRequest = this.virginRequest; // XXX: must clone
		this.adaptedRequest.header +=
			"Via: DauntingProxy/1.0\r\n";
	}

	adaptResponse(virginResponse) {
		return virginResponse;
	}
}
