/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

import * as Global from "../misc/Global";
import Transaction from "./Transaction";
import RequestParser from "../http/one/RequestParser";
import { Must } from "../misc/Gadgets";


// An example of how to create a custom request from a string.
// In most cases (including this example), it is actually better to initialize
// just the relevant request parts. However, it is often convenient to just
// cut-and-paste a real request from some log and be done with it.
class MyTransaction extends Transaction {
    constructor(userSocket, request) {
        Must(!request);

        let raw = `GET http://localhost/path|with|unwise|characters HTTP/1.1
Host: localhost

`;

        let parser = new RequestParser();
        parser.parse(raw);

        Must(parser.message);
        super(userSocket, parser.message);
    }
}

Global.Types.setBase(Transaction, MyTransaction);
