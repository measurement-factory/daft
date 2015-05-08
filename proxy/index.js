#!/usr/bin/env babel-node

/*
 * A driver script for the do-as-you-are-told HTTP proxy.
 * Runs a proxy configured with a test case specified on the command line.
 */

import Proxy from "./Agent";

if (process.argv.length != 3) {
	console.log(`usage: ${process.argv[1]} <test_case.js5>`);
	process.exit(-1);
}

let fname = process.argv[2];
console.log("Test case:", fname);

import fs from "fs";
fs.readFile(fname, function (err, data) {
	if (err)
		throw err;

	eval(data.toString());

	let proxy = new Proxy();
	proxy.start();
});
