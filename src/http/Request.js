/* Manages an HTTP request message, including headers and body */

import Message from "./Message";
import RequestLine from "./RequestLine";

export default class Request extends Message {

    constructor(...args) {
        super(new RequestLine(), ...args);
    }

    for(resource) {
        this.startLine.uri = resource.uri.clone();
        this.header.add("X-Daft-For-Resource-ID", resource.id);
    }

    conditions(ifs) {
        if ('ims' in ifs)
            this.header.add("If-Modified-Since", ifs.ims.toUTCString());
    }
}
