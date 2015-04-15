import * as Global from "./Global";
import Transaction from "./Transaction";

class MyTransaction extends Transaction {
	adaptRequest(virginRequest) {
		return super.adaptRequest("<" + virginRequest + ">");
	}
}

class MyTransaction2 extends Transaction {
	adaptRequest(virginRequest) {
		return super.adaptRequest(".2" + virginRequest + "2.");
	}
}

function MyRequestAdapter(virginRequest) {
	return Transaction.RequestAdapter(".!" + virginRequest + "!.");
}

Global.Types.setNumbered(Transaction, MyTransaction2, 2);

Global.Types.setMatching(Transaction.RequestAdapter, MyRequestAdapter,
	function (xact, request) {
		return request.toString().indexOf("x") >= 0;
});
