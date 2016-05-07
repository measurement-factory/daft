/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

/* Manages an HTTP response message, including headers and body */

import Message from "./Message";
import StatusLine from "./StatusLine";

export default class Response extends Message {

    constructor(...args) {
        super(new StatusLine(), ...args);
    }

    from(resource) {
        this.relatedResource(resource, "From");

        if (resource.lastModificationTime)
            this.header.add("Last-Modified", resource.lastModificationTime.toUTCString());
        if (resource.nextModificationTime)
            this.header.add("Expires", resource.nextModificationTime.toUTCString());

        resource.mime.fields.forEach(field => this.header.add(field));

        if (resource.body)
            this.addBody(resource.body);
    }
}
