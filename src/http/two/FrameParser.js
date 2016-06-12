import Frame from "./Frame";
import BinaryTokenizer from "./BinaryTokenizer";

export default class FrameParser {
    constructor() {
        this.tok = new BinaryTokenizer();
    }

    parse(data, callback) {
        this.tok.in(data);

        require("fs").writeFileSync("data", this.tok._data, "binary");

        while (!this.tok.atEnd()) {
            let frameHeader = this.parseFrameHeader();
            let framePayload = this.tok.area(frameHeader.length, `Payload of frame type ${frameHeader.type}`);

            this.tok.consumeParsed();

            callback(new Frame({ payload: framePayload, ...frameHeader }));
        }
    }

    parseFrameHeader() {
        let length = this.tok.uint24("Frame length");
        let type = this.tok.uint8("Frame type");
        let flags = this.tok.uint8("Frame flags");
        // There is a single-bit reserved field (head property of uint1p31
        // return value) which is ignored (RFC 7540 Section 6.5).
        let streamIdentifier = this.tok.uint1p31("R", "Stream identifier").tail;

        return { length, type, flags, streamIdentifier };
    }
}
