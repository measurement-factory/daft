import Client from "../client/Agent";
import Server from "../server/Agent";
import Proxy from "../proxy/Agent";
import Message from "../http/Message";
import Body from "../http/Body";
import * as Http from "../http/Gadgets";
import * as Config from "../Config";
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
	if (sent.body)
		assert.equal(sent.body.length(), received.body.length());
	else
		assert.equal(null, received.body);
}

describe('Daft Proxy', function() {

	let proxy = null;
	let server = null;
	let client = null;

	let serverTransaction = null;
	let clientTransaction = null;

	let caseDone = null; // the done callback of the current test case

	// TODO: call done when server and proxy actually start
	beforeEach(function() {
		assert(!caseDone);

		assert(!proxy && !server && !client);
		proxy = new Proxy();
		server = new Server();
		client = new Client();

		serverTransaction = null;
		clientTransaction = null;

		server.start();
		proxy.start();
	});

	// TODO: call done when server and proxy actually stop
	afterEach(function() {
		if (client) client.stop();
		if (proxy) proxy.stop();
		if (server) server.stop();

		proxy = null;
		server = null;
		client = null;

		caseDone = null;
	});

	// callback for when the server sends a response
	function onServerResponse(transaction) {
		serverTransaction = transaction;
		checkpoint();
	}

	// callback for when the client receives a response
	function onClientResponse(transaction) {
		clientTransaction = transaction;
		checkpoint();
	}

	// usually called at the very beginning of an async test case function
	function prepStart(done, createRequest = true, createResponse = true) {
		assert(!caseDone);
		assert(done);
		caseDone = done;

		if (createRequest)
			client.request = new Message();
		if (createResponse)
			server.response = new Message();
	}

	// makes sure both client and server transactions have finished
	function checkpoint() {
		if (!serverTransaction) {
			console.log("waiting for origin transaction to finish");
			return;
		}

		if (!clientTransaction) {
			console.log("waiting for user transaction to finish");
			return;
		}

		checkForwarded(clientTransaction.request, serverTransaction.request, "request");
		checkForwarded(serverTransaction.response, clientTransaction.response, "response");

		caseDone();
	}

	// usually called at the very end of an async test case function
	function doStart() {
		if (!client.request.callback)
			client.request.callback = onClientResponse;
		if (!server.response.callback)
			server.response.callback = onServerResponse;

		client.start();
		// now wait for onServerResponse and onClientResponse calls
	}

	it('should forward GET', function(done) {
		prepStart(done);
		doStart();
	});

	it('should forward POST', function(done) {
		prepStart(done);

		client.request.body = new Body(Config.DefaultMessageBodyContent);
		client.request.header.add("Content-Length", Config.DefaultMessageBodyContent.length);
		client.request.callback = onClientResponse;

		doStart();
	});
});
