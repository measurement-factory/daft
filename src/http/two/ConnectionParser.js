import FrameParser from "./FrameParser";
import BinaryTokenizer, { InsufficientInputError, WrongSkipError } from "./BinaryTokenizer";
import HttpTwoFrame, { FrameTypeGoAway } from "./Frame";
import BinaryPacker from "./BinaryPacker";
import {packFrame} from "./MessagePacker";
import HeaderParser from "./HeadersParser";
import Request from "../Request";
import Settings from "./Settings";
import { StaticTable } from "./HpackTable";

export default class ConnectionParser {
    constructor(transaction) {
        this.transaction = transaction; // XXX
        this.settings = new Settings();

        this.StaticTable = StaticTable; // poor man's static data member

        this.message = new Request();
        // HTTP2 doesn't communicate protocol version
        this.message.startLine.protocol = "HTTP/2.0";

        this.prefixTok = new BinaryTokenizer();
        this.headerParser = new HeaderParser(this.message, this.settings);
        this.frameParser = new FrameParser(this.inspectFrame.bind(this));
    }

    inspectFrame(frame) {
        switch (frame.type) {
            case 0x1:
                this.headerParser.parseHeaderFrame(frame);
                break;
            case 0x4:
                this.settings.parse(frame);
                break;
            case 0x9:
                this.headerParser.parseContinuationFrame(frame);
                break;
            default:
               console.log("WARNING: cannot handle frame type", frame.type);
        }
    }

    parse(data) {
        try {
            this.parseTry(data);
        } catch (error) {
            if (error instanceof InsufficientInputError) {
                return;
            } else {
                throw error;
            }
        }
    }

    parsePrefix(data) {
        try {
            this.prefixTok.in(data);
            this.prefixTok.skipExact("PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n", "Connection Preface");
        } catch (error) {
            if (error instanceof WrongSkipError) {
                let packer = new BinaryPacker();
                packer.uint1p31(0, 1, "R", "Last Stream ID");
                packer.uint32(1, "Error Code");
                packer.bytes(error.message, "Additional error data");
                const payload = packer.raw();
                this.transaction.socket.write(
                    packFrame(
                        new HttpTwoFrame({ type: FrameTypeGoAway, streamIdentifier: 0, payload })
                    ),
                    "binary");
                this.transaction.finish();
            } else {
                throw error;
            }
        }
        this.prefixTok.consumeParsed();
        const leftovers = this.prefixTok.leftovers();
        this.prefixTok = null;
        this.parseTry(leftovers);
    }

    parseFrames(data) {
        // XXX: Missing MUSTs regarding CONTINUATION frames following
        // HEADER/PUSH_PROMISE frames.
        this.frameParser.parse(data);
    }

    parseTry(data) {
        if (this.prefixTok) {
            this.parsePrefix(data);
        } else {
            this.parseFrames(data);
        }
    }
}
