import ProxyCase from "./ProxyCase";
import Body from "../src/http/Body";
import * as Http from "../src/http/Gadgets";
import * as Config from "../src/misc/Config";
import assert from "assert";

// throw if the received message differs from the sent one too much
function checkForwarded(sent, received, kind) {
    assert(sent && received);

    assert(sent.header && received.header);
    for (let key in sent.header.fields()) {
        if (!Http.IsEndToEnd(key, sent))
            continue;
        assert(received.header.has(key), `forwarded ${kind} has ${key}`);
        assert.equal(sent.header.values(key), received.header.values(key));
    }

    assert.equal(!sent.body, !received.body);
    if (sent.body) {
        assert.equal(sent.body.length(), received.body.length());
        assert.equal(sent.body.whole(), received.body.whole());
    } else {
        assert.equal(null, received.body);
    }
}

describe('Daft Proxy', function () {

    let testCase = null;

    beforeEach(function () {
        testCase = new ProxyCase(this.currentTest.title);

        /* force creation of all agents, even those we do not customize later */
        testCase.client();
        testCase.server();
        testCase.proxy();

        testCase.check(() => {
            checkForwarded(testCase.client().transaction().request, testCase.server().transaction().request, "request");
            checkForwarded(testCase.server().transaction().response, testCase.client().transaction().response, "response");
        });
    });

    it('should forward GET', async function() {
        await testCase.run();
    });

    it('should forward POST', async function() {
        testCase.client().request.startLine.method = 'POST';
        testCase.client().request.addBody(new Body(Config.DefaultMessageBodyContent));
        await testCase.run();
    });

    it('should not misinterpret HTTP header bytes as utf8 sequences', async function() {
        testCase.client().request.startLine.method = Buffer("G\u2028T").toString("binary");
        await testCase.run();
    });
});
