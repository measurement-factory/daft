import Frame from "./Frame";
import BinaryTokenizer from "./BinaryTokenizer";

export default class FrameParser {
    constructor(inspector) {
        this.tok = new BinaryTokenizer();
        this.inspector = inspector;
    }

    parse(data) {
        this.tok.in(data);

        while (!this.tok.atEnd()) {
            const frameHeader = this.parseFrameHeader();
            const framePayload = this.tok.area(frameHeader.length, `Payload of frame type ${frameHeader.type}`);

            this.tok.consumeParsed();

            this.inspector(new Frame({ payload: framePayload, ...frameHeader }));
        }
    }

    parseFrameHeader() {
        const length = this.tok.uint24("Frame length");
        const type = this.tok.uint8("Frame type");
        const flags = this.tok.uint8("Frame flags");
        // There is a single-bit reserved field (head property of uint1p31
        // return value) which is ignored (RFC 7540 Section 6.5).
        const streamIdentifier = this.tok.uint1p31("R", "Stream identifier").tail;

        return { length, type, flags, streamIdentifier };
    }
}
