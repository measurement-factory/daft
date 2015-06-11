/* Manages an HTTP response message, including headers and body */

import Message from "./Message";
import Header from "./Header";
import StatusLine from "./StatusLine";

export default class Response extends Message {

    // it is OK to omit parameters
    constructor(statusLine, header, headerDelimiter) {
        super(header, headerDelimiter);
        this.startLine = new StatusLine();
        if (statusLine !== undefined)
            this.startLine.noteReceived(statusLine);
    }
}
