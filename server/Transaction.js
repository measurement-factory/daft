import RequestParser from "../http/RequestParser";
import Message from "../http/Message";
import Body from "../http/Body";
import * as Config from "../Config";
import { Must, PrettyMime } from "../Gadgets";

// Transaction is a single (user agent request, origin response) tuple.
export default class Transaction {

	constructor(userSocket, response) {
		let myType = Object.getPrototypeOf(this).constructor.name;
		console.log(`starting ${myType} transaction`);

		this.socket = userSocket;

		this.requestParser = null;
		this.request = null;
		this.response = response ? response.clone() : null;

		this.doneReceiving = false; // incoming message
		this.doneSending = false; // outgoing message
	}

	start() {
		/* setup event listeners */

		this.socket.on('data', data => {
			this.onReceive(data);
		});

		this.socket.on('end', () => {
			console.log("user disconnected");
			// assume all 'data' events always arrive before 'end'
			this.doneReceiving = true;
			this.checkpoint();
		});

		this.sendResponse();
	}

	finish() {
		let myType = Object.getPrototypeOf(this).constructor.name;
		console.log(`ending ${myType} transaction`);

		if (this.socket) {
			this.socket.destroy();
			this.socket = null;
		}

		if (this.response && this.response.callback)
			this.response.callback(this);
	}

	checkpoint() {
		if (this.doneReceiving && this.doneSending && // HTTP level
			(!this.socket || !this.socket.bufferSize)) // socket level
			this.finish();
	}

	onReceive(virginData) {
		this.parseRequest(virginData);
		this.sendResponse();
	}

	parseRequest(virginData) {
		if (!this.requestParser)
			this.requestParser = new RequestParser(this);

		this.requestParser.parse(virginData);

		if (!this.request && this.requestParser.message) {
			this.request = this.requestParser.message;
			let parsed = this.request.rawPrefix();
			console.log(`parsed ${parsed.length} request header bytes:\n` +
				PrettyMime(">s ", parsed));
		}

		if (this.request && this.request.body) {
			if (this.request.body.innedAll()) {
				console.log(`parsed all ${this.request.body.innedSize()} request body bytes`);
				this.doneReceiving = true;
				this.checkpoint();
			} else {
				console.log(`parsed first ${this.request.body.innedSize()} request body bytes so far`);
			}
		} else {
				console.log("parsed the entire bodyless request");
				this.doneReceiving = true;
				this.checkpoint();
		}
	}

	sendResponse() {
		if (this.doneSending)
			return;

		let hadResponse = this._finalizedResponse;
		if (!hadResponse)
			this.makeResponse();

		if (!this._finalizedResponse) {
			console.log("not ready to respond");
			Must(!this.doneSending);
			return;
		}

		Must(this.response);

		if (!hadResponse) {
			// send response headers once we got them
			let out = this.response.rawPrefix();
			this.socket.write(out);
			console.log(`sending ${out.length} response header bytes:\n` +
				PrettyMime("<s ", out));

			if (!this.response.body) {
				console.log("sent a bodyless response");
				this.doneSending = true;
				this.checkpoint();
				return;
			}
		}

		Must(this.response.body);
		let chunk = this.response.body.out();
		if (chunk.length) {
			this.socket.write(chunk);
			console.log(`sending ${chunk.length} response body bytes`);
		}
		if (this.response.body.outedAll()) {
			console.log("sent the entire response body");
			this.doneSending = true;
			this.checkpoint();
			return;
		}
		console.log("may send more response body later");
	}

	makeResponse() {
		if (!this.response)
			this.response = this.generateDefaultResponse();

		if (!this._finalizedResponse)
			this.finalizeResponse();

		if (this.response.body && !this.response.body.innedAll())
			this.fillResponseBody();
	}

	generateDefaultResponse() {
		let response = new Message();
		// XXX: Do not overwrite already set properties
		if (Config.DefaultMessageBodyContent !== null) {
			response.body = new Body(Config.DefaultMessageBodyContent);
			if (response.body.length() !== null)
				response.header.add("Content-Length", response.body.length());
		}
		return response; // not finalized
	}

	finalizeResponse() {
		if (!this.request)
			return; // no response without request by default

		Must(this.response);
		// XXX: Do not overwrite already set properties
		// XXX: support status-line and call .finalize() here
		this.response.requestLine._rest = "HTTP/1.1 200 OK\r\n";
		this.response.header.add("Server", "DaftServer/1.0");
		this.response.header.add("Connection", "close");

		this._finalizedResponse = true;
	}

	fillResponseBody() {
		// generateDefaultResponse() fills the entire body
		Must(false);
	}

}
