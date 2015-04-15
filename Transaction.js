/* Transaction is a single (user agent request, origin response) tuple. */

import net from 'net';
import * as Config from './Config';
import * as Global from "./Global";

export default class Transaction {

	constructor(userSocket) {
		let myType = Object.getPrototypeOf(this).constructor.name;
		console.log(`starting ${myType} transaction`);

		this.userSocket = null;
		this.originSocket = null;

		this.startServingUser(userSocket);
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

	onUserReceive(virginRequest) {
		if (!this.originSocket)
			this.startConnectingToOrigin();

		let adaptedRequest = this.adaptRequest(virginRequest);

		// now or when finished connecting
		this.originSocket.write(adaptedRequest);
	}

	onOriginReceive(virginResponse) {
		let adaptedResponse = this.adaptResponse(virginResponse);
		this.userSocket.write(adaptedResponse);
	}

	adaptRequest(virginRequest) {
		return ">" + virginRequest + ">";
	}

	adaptResponse(virginResponse) {
		return "<" + virginResponse + "<";
	}
}
