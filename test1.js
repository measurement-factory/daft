class MyTransaction extends Transaction {
	adaptRequest(virginRequest) {
		return super.adaptRequest("<" + virginRequest + ">");
	}
}

class MyTransaction2 extends Transaction {
	adaptRequest(virginRequest) {
		return super.adaptRequest("2" + virginRequest + "2");
	}
}

Transaction = MyTransaction;

NewTypes.setNumbered(Transaction, 2, MyTransaction2);

NewTypes.set("RequestAdapter?", MyAdapterX, function (request) {
	return request.header.has("If-Modified-Since");
});
