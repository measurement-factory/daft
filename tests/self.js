/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

import ProxyCase from "./ProxyCase";
import Body from "../src/http/Body";
import * as Http from "../src/http/Gadgets";
import Test from "../src/misc/Test";
import assert from "assert";

export default class MyTest extends Test {

    async run() {

        {
            let testCase = this.makeCase('should forward GET');
            await testCase.run();
        }

        {
            let testCase = this.makeCase('should forward POST');
            testCase.client().request.startLine.method = 'POST';
            testCase.client().request.addBody(new Body());
            await testCase.run();
        }

        {
            let testCase = this.makeCase('should forward chunked response');
            testCase.server().response.forceChunked = true;
            await testCase.run();
        }

        {
            let testCase = this.makeCase('should forward chunked request');
            testCase.client().request.startLine.method = 'POST';
            testCase.client().request.addBody(new Body());
            testCase.client().request.forceChunked = true;
            await testCase.run();
        }

        {
            let testCase = this.makeCase('should not misinterpret HTTP header bytes as utf8 sequences');
            testCase.client().request.startLine.method = Buffer("G\u2028T").toString("binary");
            await testCase.run();
        }

        {
            let testCase = this.makeCase('should filter Date');
            testCase.server().response.header.prohibitNamed("Date");
            testCase.check(() => {
                assert(!testCase.proxy().transaction().virginResponse.header.has("Date"));
            });
            await testCase.run();
        }
    }

    makeCase(title) {
        let testCase = new ProxyCase(title);

        /* force creation of all agents, even those we do not customize later */
        testCase.client();
        testCase.server();
        testCase.proxy();

        testCase.check(() => {
            Http.AssertForwardedMessage(testCase.client().transaction().request, testCase.server().transaction().request, "request");
            Http.AssertForwardedMessage(testCase.server().transaction().response, testCase.client().transaction().response, "response");
        });

        return testCase;
    }

}
