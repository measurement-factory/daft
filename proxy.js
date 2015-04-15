#!/usr/bin/env babel-node

/*
 * A driver script for the do-as-you-are-told HTTP proxy.
 * Runs a proxy configured with a test case specified on the command line.
 */

import net from 'net';
import * as Config from './Config';
import * as Global from "./Global";
import Transaction from "./Transaction";

class Proxy {
	constructor() {
		this.xCount = 0;
	}

	start() {
		// start a TCP server
		let server = net.createServer();

		server.on('connection', userSocket => {
			++this.xCount;
			let xactType = Global.Types.getNumberedOrMatching(
				Transaction, this.xCount, "x");
			new xactType(userSocket);
		});

		server.listen(Config.ListeningAddress);
		console.log("Started server at", Config.ListeningAddress);
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
