/* Incrementally parses HTTP request messages, including headers and body */

import Request from "./Request";
import MessageParser from "./MessageParser";

export default class RequestParser extends MessageParser {

    constructor(transaction) {
        super(transaction);
        this._messageType = Request;
    }

    determineDefaultBody() {
        // do nothing: requests do not have bodies by default
        console.log("no request body");
    }
}
