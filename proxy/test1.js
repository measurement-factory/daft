import * as Global from "../Global";
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
