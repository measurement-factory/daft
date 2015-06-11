/* Manages an HTTP request message, including headers and body */

import Message from "./Message";
import Header from "./Header";
import RequestLine from "./RequestLine";

export default class Request extends Message {

    // it is OK to omit parameters
    constructor(requestLine, header, headerDelimiter) {
        super(header, headerDelimiter);
        this.startLine = new RequestLine();
        if (requestLine !== undefined)
            this.startLine.noteReceived(requestLine);
    }
}
