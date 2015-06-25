import Response from "./Response";
import Body from "./Body";
import MessageParser from "./MessageParser";
import { Must } from "../misc/Gadgets";

export default class ResponseParser extends MessageParser {

    constructor(transaction, request) {
        super(transaction);
        this._messageType = Response;

        Must(request !== undefined);
        this.request = request;
        this.expectBody = this.request.startLine.method !== "HEAD";
    }

    determineDefaultBody() {
        // responses have bodies by default
        this.message.body = new Body();
    }
}
