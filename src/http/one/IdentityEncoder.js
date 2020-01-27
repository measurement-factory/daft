/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

/* Pass-through "null" or "identity" encoder. Does not modify incoming data. */

import Encoder from "./Encoder";

export default class IdentityEncoder extends Encoder {

    constructor() {
        super("identity");
    }

    _encode(data) {
        return data;
    }

    _reportCompletion() {
    }
}
