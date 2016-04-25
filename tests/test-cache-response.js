/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

/* Tests whether an HTTP proxy caches a response
 * Parameters: [drop-Content-Length] [body size] */

import ProxyCase from "./ProxyCase";
import * as FuzzyTime from "../src/misc/FuzzyTime";
import Body from "../src/http/Body";
import Resource from "../src/anyp/Resource";
import * as Config from "../src/misc/Config";
import * as Http from "../src/http/Gadgets";
import assert from "assert";

/* ugly command-line arguments processing */
const args = process.argv.slice(2);
const withContentLength = args.length === 2 ?
    args[0] !== "drop-Content-Length" : true;
if (args.length === 2)
    args.shift(); // skip withContentLength value
assert(args.length <= 1, "at most one response body size");
const responseSize = args.length === 1 ?
    Number.parseInt(args[0], 10) : (1*1024); // 1KB by default
assert(responseSize >= 0, "valid response size");

// do not log large body handling details by default
if (Config.LogBodies === undefined && responseSize > 1*1024*1024)
    Config.LogBodies = 0;

async function Test() {
    let resource = new Resource();
    resource.modifiedAt(FuzzyTime.DistantPast());
    resource.expireAt(FuzzyTime.DistantFuture());
    resource.body = new Body("x".repeat(responseSize));
    if (!withContentLength)
        resource.body.setLength(null); // unknown Content-Length
    resource.finalize();

    let missCase = new ProxyCase(`forward a ${responseSize}-byte response`);
    missCase.client().request.for(resource);
    missCase.server().serve(resource);
    missCase.check(() => {
        missCase.expectStatusCode(200);
        let virginResponse = missCase.server().transaction().response.body.whole();
        let adaptedResponse = missCase.client().transaction().response.body.whole();
        assert.equal(adaptedResponse, virginResponse, "preserved miss response body");
    });
    await missCase.run();

    let hitCase = new ProxyCase(`hit a ${responseSize}-byte response`);
    hitCase.client().request.for(resource);
    hitCase.check(() => {
        hitCase.expectStatusCode(200);
        //let virginResponse = missCase.server().transaction().response.body.whole();
        //let adaptedResponse = hitCase.client().transaction().response.body.whole();
        //assert.equal(adaptedResponse, virginResponse, "preserved hit response body");
        Http.AssertForwardedMessage(missCase.server().transaction().response, hitCase.client().transaction().response, "preserved hit response");
    });
    await hitCase.run();
}

Test();
