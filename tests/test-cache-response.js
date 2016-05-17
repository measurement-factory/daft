/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

/* Tests whether an HTTP proxy caches a response
 * Parameters: [drop-Content-Length] [body size] */

import ProxyCase from "./ProxyCase";
import Body from "../src/http/Body";
import Resource from "../src/anyp/Resource";
import * as Gadgets from "../src/misc/Gadgets";
import * as Config from "../src/misc/Config";
import * as Http from "../src/http/Gadgets";
import StartTests from "../src/misc/TestRunner";
import assert from "assert";

// custom CLI options
Config.Recognize([
    {
        option: "drop",
        type: "[String]",
        concatRepeatedArrays: true,
        default: "[]",
        description: "name(s) of default response header fields to exclude"
    },
    {
        option: "body-size",
        type: "Number",
        default: "1024",
        description: "response body size (bytes)"
    }
]);

async function Test(testRun, callback) {
    assert(Config.BodySize >= 0, "positive body-size"); // TODO: Add Size option type

    // do not log large body handling details by default
    if (Config.LogBodies === undefined && Config.BodySize > 1*1024*1024)
        Config.LogBodies = 0;

    let resource = new Resource();
    resource.makeCachable();
    resource.body = new Body("x".repeat(Config.BodySize));
    if (Config.Drop.includes("Content-Length"))
        resource.body.setLength(null); // unknown Content-Length
    resource.uri.address = Gadgets.ReserveListeningAddress();
    resource.finalize();

    let missCase = new ProxyCase(`forward a ${Config.BodySize}-byte response`);
    missCase.client().request.for(resource);
    missCase.server().serve(resource);
    missCase.check(() => {
        missCase.expectStatusCode(200);
        let virginResponse = missCase.server().transaction().response.body.whole();
        let adaptedResponse = missCase.client().transaction().response.body.whole();
        assert.equal(adaptedResponse, virginResponse, "preserved miss response body");
    });
    await missCase.run();

    let hitCase = new ProxyCase(`hit a ${Config.BodySize}-byte response`);
    hitCase.client().request.for(resource);
    hitCase.check(() => {
        hitCase.expectStatusCode(200);
        //let virginResponse = missCase.server().transaction().response.body.whole();
        //let adaptedResponse = hitCase.client().transaction().response.body.whole();
        //assert.equal(adaptedResponse, virginResponse, "preserved hit response body");
        Http.AssertForwardedMessage(missCase.server().transaction().response, hitCase.client().transaction().response, "preserved hit response");
    });
    await hitCase.run();

    console.log("Test result: success");
    if (callback)
        callback();
}

StartTests(Test);
