#!/usr/bin/env babel-node

import net from 'net';

let ListeningAddress = 13128; // TODO: Make configurable
let OriginAddress = { // TODO: Make configurable
	host: 'localhost',
	port: 8080,
};

import TypeMap from "./TypeMap";
let Types = new TypeMap();

function RequestAdapter(virginRequest) {
        return ">" + virginRequest + ">";
}

function ResponseAdapter(virginResponse) {
        return "<" + virginResponse + "<";
}

class Transaction {
	constructor(userSocket) {
		let myType = Object.getPrototypeOf(this).constructor.name;
		console.log(`starting ${myType} transaction`);

		this.userSocket = null;
		this.originSocket = null;

		startServingUser(userSocket);
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
		this.originSocket = net.connect(OriginAddress);

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
		let adapter = Types.getMatching(RequestAdapter, this, virginRequest);
		return adapter(virginRequest);
	}

	adaptResponse(virginResponse) {
		let adapter = Types.getMatching(ResponseAdapter, this, virginResponse);
		return adapter(virginResponse);
	}
}

class Proxy {
	constructor() {
		this.xCount = 0;
	}

	start() {
		// start a TCP server
		let server = net.createServer();

		server.on('connection', userSocket => {
			++this.xCount;
			new (Types.getNumberedOrMatching(Transaction, this.xCount, "x"))(userSocket);
		});

		server.listen(ListeningAddress);

		console.log("Started server at", ListeningAddress);
	}
}


if (process.argv.length != 3) {
	console.log(`usage: ${process.argv[1]} <test_case.js5>`);
	process.exit(-1);
}

let fname = process.argv[2];
console.log("Test case:", fname);

import fs from 'fs';
fs.readFile(fname, function (err, data) {
	if (err)
		throw err;

	eval(data.toString());

	let proxy = new Proxy();
	proxy.start();
});
