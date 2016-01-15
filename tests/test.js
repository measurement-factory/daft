import ProxyCase from "./ProxyCase";
import Body from "../src/http/Body";
import * as Http from "../src/http/Gadgets";
import * as Config from "../src/misc/Config";


describe('Daft Proxy', function () {

    let testCase = null;

    beforeEach(function () {
        testCase = new ProxyCase(this.currentTest.title);

        /* force creation of all agents, even those we do not customize later */
        testCase.client();
        testCase.server();
        testCase.proxy();

        testCase.check(() => {
            Http.AssertForwardedMessage(testCase.client().transaction().request, testCase.server().transaction().request, "request");
            Http.AssertForwardedMessage(testCase.server().transaction().response, testCase.client().transaction().response, "response");
        });
    });

    it('should forward GET', async function () {
        await testCase.run();
    });

    it('should forward POST', async function () {
        testCase.client().request.startLine.method = 'POST';
        testCase.client().request.addBody(new Body(Config.DefaultMessageBodyContent));
        await testCase.run();
    });

    it('should not misinterpret HTTP header bytes as utf8 sequences', async function () {
        testCase.client().request.startLine.method = Buffer("G\u2028T").toString("binary");
        await testCase.run();
    });
});
