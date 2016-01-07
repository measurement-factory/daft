/* Manages an HTTP response message, including headers and body */

import Message from "./Message";
import StatusLine from "./StatusLine";

export default class Response extends Message {

    constructor(...args) {
        super(new StatusLine(), ...args);
    }

    from(resource) {
        if (resource.lastModificationTime)
            this.header.add("Last-Modified", resource.lastModificationTime.toUTCString());
        if (resource.nextModificationTime)
            this.header.add("Expires", resource.nextModificationTime.toUTCString());

        this.header.add("X-Daft-From-Resource-ID", resource.id);
    }
}
