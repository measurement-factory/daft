#!/usr/bin/env babel-node


/*
 * A driver script for the do-as-you-are-told HTTP server.
 * Runs a server configured with a test case specified on the command line.
 */

import Client from "./Agent";

if (process.argv.length !== 3) {
    throw `usage: ${process.argv[1]} <test_case.js5>`;
}

let fname = process.argv[2];
console.log("Test case:", fname);

import fs from "fs";
fs.readFile(fname, function (err, data) {
    if (err)
        throw err;

    eval(data.toString()); // eslint-disable-line no-eval

    let client = new Client();
    client.start();
});
