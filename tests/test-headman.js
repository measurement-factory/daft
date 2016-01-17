/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

/* Tests an HTTP proxy with a Headman eCAP adapter
 * configured to hide and reveal empty Content-Type headers. */

import ProxyCase from "./ProxyCase";
import Body from "../src/http/Body";
import * as Http from "../src/http/Gadgets";
import * as Config from "../src/misc/Config";

describe('Header-mangling proxy', function () {

    let testCase = null;

    beforeEach(function () {
        testCase = new ProxyCase(this.currentTest.title);

        /* force creation of all agents, even those we do not customize later */
        testCase.client();
        testCase.server();

        testCase.check(() => {
            Http.AssertForwardedMessage(testCase.client().transaction().request, testCase.server().transaction().request, "request");
            Http.AssertForwardedMessage(testCase.server().transaction().response, testCase.client().transaction().response, "response");
        });
    });

    it('should forward benign GET', async function () {
        await testCase.run();
    });

    it('should forward benign POST', async function () {
        testCase.client().request.startLine.method = 'POST';
        testCase.client().request.addBody(new Body(Config.DefaultMessageBodyContent));
        await testCase.run();
    });

    it('should handle empty Content-Type in response', async function () {
        testCase.server().response.header.add("Content-Type", "");
        await testCase.run();
    });

    it('should handle two empty Content-Type in response', async function () {
        testCase.server().response.header.add("Content-Type", "");
        testCase.server().response.header.add("Content-Type", " \t  ");
        await testCase.run();
    });

    it('should handle mixed empty Content-Type in response', async function () {
        testCase.server().response.header.add("Content-Type", "");
        testCase.server().response.header.add("Content-Type", "foo");
        testCase.server().response.header.add("Content-Type", " \t\r  ");
        testCase.server().response.header.add("Content-Type", "bar");
        await testCase.run();
    });

    it('should handle empty multi-line Content-Type in response', async function () {
        testCase.server().response.header.add("Content-Type", " \t\r\n \t\r");
        await testCase.run();
    });

    it('should handle strangely-cased empty Content-Type in response', async function () {
        testCase.server().response.header.add("conTENt-tYpe", "");
        await testCase.run();
    });
});
