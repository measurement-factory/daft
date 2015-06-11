/* Incrementally parses HTTP request messages, including headers and body */

import Request from "./Request";
import Body from "./Body";
import MessageParser from "./MessageParser";
import { Must } from "../Gadgets";

export default class RequestParser extends MessageParser {

    constructor(transaction) {
        super(transaction);
    }

    parseMessage(startLine, header, headerDelimiter) {
        this.message = new Request(startLine, header, headerDelimiter);
    }

    determineDefaultBody() {
        // do nothing: requests do not have bodies by default
        console.log("no request body");
    }
}
