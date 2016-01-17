/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

import * as Global from "../misc/Global";
import Transaction from "./Transaction";

class MyTransaction extends Transaction {
    adaptRequest(virginRequest) {
        return super.adaptRequest(".*" + virginRequest + "*.");
    }
}

class MyTransaction2 extends Transaction {
    adaptRequest(virginRequest) {
        return super.adaptRequest(".2" + virginRequest + "2.");
    }
}

Global.Types.setBase(Transaction, MyTransaction);
Global.Types.setNumbered(Transaction, MyTransaction2, 2);
