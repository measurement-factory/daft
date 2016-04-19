/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

/* Tests whether an HTTP proxy forwards an HTTP/0.9 response */

import ProxyCase from "./ProxyCase";
import Response from "../src/http/Response";
import Body from "../src/http/Body";
import * as Config from "../src/misc/Config";
import { responsePrefix } from "../src/http/one/MessageWriter";
import assert from "assert";

if (Config.LogBodies === undefined)
    Config.LogBodies = 1;

// use a regular response as an HTTP/0.9 body suffix to ease transaction
// identification and make the test a bit harder for the proxy to pass
let response = new Response();
response.body = new Body();
response.finalize();
const zeroNineBody =
    "<html><h1>garbage:1</h1>\n" +
    "<h2>garbage:2</h2></html>\n" +
    responsePrefix(response) +
    response.body.whole();

let testCase = new ProxyCase('forward an HTTP/0.9 response');
testCase.client(); // defaults are fine
testCase.server().response.startLine.protocol = "HTTP/0.9";
testCase.server().response.body = new Body(zeroNineBody);
testCase.check(() => {
    testCase.expectStatusCode(200);
    let virginResponse = testCase.server().transaction().response.body.whole();
    let adaptedResponse = testCase.client().transaction().response.body.whole();
    assert.equal(adaptedResponse, virginResponse, "preserved HTTP/0.9 response");
});

testCase.run();
