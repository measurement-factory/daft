import Response from "./Response";
import Body from "./Body";
import MessageParser from "./MessageParser";
import { Must } from "../misc/Gadgets";

export default class ResponseParser extends MessageParser {

    constructor(transaction, request) {
        super(transaction);
        Must(request !== undefined);
        this.request = request;
        this.expectBody = this.request.startLine.method !== "HEAD";
    }

    parseMessage(startLine, header, headerDelimiter) {
        this.message = new Response(startLine, header, headerDelimiter);
    }

    determineDefaultBody() {
        // responses have bodies by default
        this.message.body = new Body();
    }
}
