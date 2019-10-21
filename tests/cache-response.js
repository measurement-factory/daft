/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

/* Tests whether an HTTP proxy caches a response
 * Parameters: [drop-Content-Length] [body size] */

import assert from "assert";
import HttpTestCase from "../src/test/HttpCase";
import Body from "../src/http/Body";
import Resource from "../src/anyp/Resource";
import * as Config from "../src/misc/Config";
import * as Http from "../src/http/Gadgets";
import * as AddressPool from "../src/misc/AddressPool";
import Test from "../src/test/Test";
import { DutConfig, ProxyOverlord } from "../src/overlord/Proxy";

// custom CLI options
Config.Recognize([
    {
        option: "response-ends-at-eof",
        type: "Boolean",
        default: "false",
        description: "send unchunked response without Content-Length",
    },
    {
        option: "body-size",
        type: "Number",
        default: "1024",
        description: "response body size (bytes)",
    },
]);

export default class MyTest extends Test {

    constructor(...args) {
        // XXX: We should not be writing constructors to configure a DUT.
        // TODO: Add virtual Test::configureDut() or a similar method.
        const cfg = new DutConfig();
        cfg.memoryCaching(false); // TODO: Make Configurable.
        cfg.diskCaching(true); // TODO: Make Configurable.
        super(new ProxyOverlord(cfg), ...args); // no DUT for now
    }

    async run(/*testRun*/) {

        assert(Config.BodySize >= 0, "positive body-size"); // TODO: Add Size option type

        // do not log large body handling details by default
        if (Config.LogBodies === undefined && Config.BodySize > 1*1024*1024)
            Config.LogBodies = 0;

        let resource = new Resource();
        resource.makeCachable();
        resource.uri.address = AddressPool.ReserveListeningAddress();
        resource.body = new Body("x".repeat(Config.BodySize));
        resource.finalize();

        let missCase = new HttpTestCase(`forward a ${Config.BodySize}-byte response`);
        missCase.server().serve(resource);
        missCase.server().response.forceEof = Config.ResponseEndsAtEof;
        missCase.client().request.for(resource);
        missCase.client().checks.add((client) => {
            client.expectStatusCode(200);
            let virginResponse = missCase.server().transaction().response.body.whole();
            let adaptedResponse = client.transaction().response.body.whole();
            assert.equal(adaptedResponse, virginResponse, "preserved miss response body");
        });
        await missCase.run();

        let hitCase = new HttpTestCase(`hit a ${Config.BodySize}-byte response`);
        hitCase.client().request.for(resource);
        hitCase.check(() => {
            hitCase.client().expectStatusCode(200);
            //let virginResponse = missCase.server().transaction().response.body.whole();
            //let adaptedResponse = hitCase.client().transaction().response.body.whole();
            //assert.equal(adaptedResponse, virginResponse, "preserved hit response body");
            Http.AssertForwardedMessage(missCase.server().transaction().response, hitCase.client().transaction().response, "preserved hit response");
        });
        await hitCase.run();

        AddressPool.ReleaseListeningAddress(resource.uri.address);
    }

}
