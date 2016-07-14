import Frame from "./Frame";
import BinaryTokenizer from "./BinaryTokenizer";

export default class FrameParser {
    constructor(inspector) {
        this.tok = new BinaryTokenizer();
        this.inspector = inspector;
    }

    parse(data) {
        this.tok.in(data);

        while (!this.tok.atEnd())
            this.inspector(this.parseFrame());
    }

    parseFrame() {
        const length = this.tok.uint24("Frame length");
        const type = this.tok.uint8("Frame type");
        const flags = this.tok.uint8("Frame flags");
        // There is a single-bit reserved field (head property of uint1p31
        // return value) which is ignored (RFC 7540 Section 6.5).
        const streamIdentifier = this.tok.uint1p31("R", "Stream identifier").tail;

        const payload = this.tok.area(length, `Payload of frame type ${type}`);

        this.tok.consumeParsed();
        return new Frame({ payload, length, type, flags, streamIdentifier });
    }
}
