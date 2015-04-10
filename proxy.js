#!/usr/bin/env babel-node

import net from 'net';

let ListeningAddress = 13128; // TODO: Make configurable
let OriginAddress = { // TODO: Make configurable
	host: 'localhost',
	port: 8080,
};

import TypeMap from "./TypeMap";
let Types = new TypeMap();

function requestAdapter(virginRequest) {
        return "=" + virginRequest + "=";
}

class Transaction {
	constructor(userSocket) {
		console.log(`new ${Object.getPrototypeOf(this).constructor.name} transaction`);

		this.userSocket = userSocket;
		this.originSocket = null;

		/ * setup event listeners for the user agent socket */

		userSocket.on('data', data => {
			this.onClientReceive(data);
		});
 
		userSocket.on('end', () => {
			if (this.originSocket)
				this.originSocket.end();
		});
	}

	startConnecting() {
		this.originSocket = net.connect(OriginAddress);
		let {userSocket, originSocket} = this;

		/ * setup event listeners for the origin socket */

		originSocket.on('connection', () => {
			console.log(`connected to ${originSocket.remoteAddress}:${originSocket.remotePort}`);
		});

		originSocket.on('data', data => {
			this.onServerReceive(data);
		});

		originSocket.on('end', () => {
			if (this.userSocket)
				this.originSocket.end();
		});
	}

	onClientReceive(virginRequest) {
		if (!this.originSocket)
			this.startConnecting();

		let adaptedRequest = this.adaptRequest(virginRequest);

		// now or when connected
		this.originSocket.write(adaptedRequest);
	}

	onServerReceive(message) {
		this.userSocket.write(message);
	}

	adaptRequest(virginRequest) {
		let adapter = Types.getMatching(requestAdapter, virginRequest);
		return adapter(virginRequest);
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
