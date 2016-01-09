/* Manages an HTTP request message, including headers and body */

import Message from "./Message";
import RequestLine from "./RequestLine";

export default class Request extends Message {

    constructor(...args) {
        super(new RequestLine(), ...args);
    }

    for(resource) {
        this.relatedResource(resource, "For");
        this.startLine.uri = resource.uri.clone();
    }

    with(resource) {
        this.relatedResource(resource, "With");
        if (resource.body)
            this.addBody(resource.body);
    }

    conditions(ifs) {
        if ('ims' in ifs)
            this.header.add("If-Modified-Since", ifs.ims.toUTCString());
    }
}
