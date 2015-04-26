/* Manages raw (dechunked) HTTP message body buffer/pipeline. */

export default class Body {

	constructor() {
		this._buf = ''; // the entire body (for now)
		this._length = null; // unknown until setLength()
		this._in = 0;
		this._out = 0;
	}

	clone() {
		let dupe = new Body;
		// shallow copy of POD attributes
		for (var key in this) {
			dupe[key] = this[key];
		}
		return dupe;
	}

	setLength(size) {
		this._length = size;
	}

	in(data) {
		this._buf += data;
		this._in += data.length;
	}

	//hasOut() {
	//	return this._length === null ||
	//		this._out < this._length;
	//}

	outedAll() {
		return this._length !== null && this._out >= this._length;
	}

	out() {
		if (this.outedAll())
			return "";

		let piece = this._buf.substring(this._out);
		this._out += piece.length;

		// cut extras, if any
		if (this._length !== null && this._out > this._length) {
			let extraLen = Math.max( // cannot undo what was outed
				this._out - this._length, piece.length)
			piece = piece.substring(0, piece.length - extraLen);
			this._out -= extraLen;
		}

		return piece;
	}
}
