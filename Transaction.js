/* Transaction is a single (user agent request, origin response) tuple. */

import net from 'net';
import RequestParser from "./RequestParser";
import * as Config from './Config';
import * as Global from "./Global";
import { Must, PrettyMime } from "./Gadgets";

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
			if (!this.originSocket)
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
			if (!this.userSocket)
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

		if (!this.virginRequest && this.requestParser.message) {
			this.virginRequest = this.requestParser.message;
			let parsed = this.virginRequest.header.raw() +
				this.virginRequest.delimiter;
			console.log(`parsed ${parsed.length} request header bytes:\n` +
				PrettyMime("c> ", parsed));
		}
	}

	sendRequest() {
		this.adaptRequest();

		if (!this.adaptedRequest) {
			console.log("not ready to send the request");
			return;
		}

		if (!this.originSocket) {
			this.startConnectingToOrigin();

			// when finished connecting
			let out = this.adaptedRequest.header.raw() +
				this.adaptedRequest.delimiter.toString();
			this.originSocket.write(out);
			console.log(`sending ${out.length} request header bytes:\n` +
				PrettyMime(">s ", out));
		}

		// now or when finished connecting
		let out = this.adaptedRequest.body.out();
		this.originSocket.write(out);
		console.log(`sending ${out.length} request body bytes`);
	}

	adaptRequest() {
		if (!this.adaptedRequest) {
			if (this.virginRequest)
				this.startAdaptingRequest();
			else
				this.generateRequest();
		}

		if (this.adaptedRequest)
			this.adaptRequestBody();
	}

	generateRequest() {
		Must(!this.virginRequest);
		return; // no adapted request w/o virginRequest by default
	}

	cloneRequest() {
		this.adaptedRequest = this.virginRequest.clone();
		// this.virginRequest may contain a body, and we just cloned it
		// consume virgin body here so that adaptRequestBody() does not get a
		// second copy of it
		this.virginRequest.body.out();
	}

	// to customize adaptations, use adaptRequestHeader() if possible
	startAdaptingRequest() {
		this.cloneRequest();
		this.adaptRequestHeader();
	}

	adaptRequestHeader() {
		this.adaptedRequest.header.add("Via", "DaftProxy/1.0");
	}

	adaptRequestBody() {
		this.adaptedRequest.body.in(this.virginRequest.body.out());
	}

	onOriginReceive(virginResponse) {
		let adaptedResponse = this.adaptResponse(virginResponse);
		this.userSocket.write(adaptedResponse);
		console.log(`sending ${adaptedResponse.length} response bytes`);
	}

	adaptResponse(virginResponse) {
		return virginResponse;
	}
}
