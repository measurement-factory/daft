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

function myRequestAdapter(virginRequest) {
	return requestAdapter(".!" + virginRequest + "!.");
}

Types.setNumbered(Transaction, MyTransaction2, 2);

Types.setMatching(requestAdapter, myRequestAdapter, function (request) {
	return request.toString().indexOf("x") >= 0;
});
