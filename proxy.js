let net = require('net');

let ListeningAddress = 13128; // TODO: Make configurable
let OriginAddress = { // TODO: Make configurable
	host: 'localhost',
	port: 8080,
};

class TypeMap {
    constructor() {
        this._map = new Map();
    }
    set(key, value) {
        if (this._map.has(key))
            throw new Error(`Cannot reset ${key} value`);
        this._map.set(key, value);
    }
    get(key, defaultValue) {
        return this._map.has(key) ? this._map.get(key) : defaultValue;
    }
}

let Types = new SetOnceMap();

class Transaction {
	constructor(clientSocket) {
		this.clientSocket = clientSocket;
		this.serverSocket = null;

		clientSocket.on('data', data => {
			this.onClientReceive(data);
		});
 
		clientSocket.on('end', () => {
			if (this.serverSocket)
				this.serverSocket.end();
		});
	}

	startConnecting() {
		let {clientSocket, serverSocket} = this;

		serverSocket = net.connect(OriginAddress);

		/ * setup event listeners for the server socket */

		serverSocket.on('connection', () => {
			console.log(`connected to ${serverSocket.remoteAddress}:${serverSocket.remotePort}`);
		});

		serverSocket.on('data', data => {
			this.onServerReceive(data);
		});

		serverSocket.on('end', () => {
			if (this.clientSocket)
				this.serverSocket.end();
		});
	}

	onClientReceive(virginRequest) {
		if (!this.serverSocket)
			this.startConnecting();

		let adaptedRequest = this.adaptRequest(virginRequest);

		// now or when connected
		this.serverSocket.write(adaptedRequest);
	}

	onServerReceive(message) {
		this.clientSocket.write(message);
	}

	adaptRequest(virginRequest) {
		var adatper = Types.getMatching(RequestAdapter, virginRequest);
		var xact = Types.getNumbered(Transaction, this.xactCount);
		
		return virginRequest;
	}
}

class Proxy {
	start() {

		this.xCount = 0;

		// start a TCP Server
		let server = net.createServer();

		server.on('connection', clientSocket => {

			++this.xCount;
			let xName = "Transaction" + this.xCount;
			console.log(`connect for ${xName}`);
			new (Types.get(xName, Transaction))(clientSocket);
			// xact->init(clientSocket);
			// Transactions.splice(Transactions.indexOf(xact), 1);
		});

		server.listen(ListeningAddress);

		console.log("Started server at", ListeningAddress);
	}
}

var fs = require('fs');
fs.readFile('./test1.js5', function (err, data) {
	if (err)
		throw err;

	eval(data.toString());

	let TheProxy = new Proxy();
	TheProxy.start();
});
