import FrameParser from "./FrameParser";
import BinaryTokenizer, { InsufficientInputError, WrongSkipError } from "./BinaryTokenizer";
import HttpTwoFrame, { FrameTypeGoAway } from "./Frame";
import BinaryPacker from "./BinaryPacker";
import {packFrame} from "./MessagePacker";
import HeaderParser from "./HeadersParser";
import Request from "../Request";
import { Must } from "../../misc/Gadgets";

export default class ConnectionParser {
    constructor(transaction) {
        this.transaction = transaction; // XXX

        this.message = new Request();
        this.prefixTok = new BinaryTokenizer();
        this.headerParser = new HeaderParser(this.message);
        this.frameParser = new FrameParser();
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

    parseTry(data) {
        if (this.prefixTok) {
            this.prefixTok.in(data);
            try {
                this.prefixTok.skipExact("PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n", "Connection Preface");
            } catch (error) {
                if (error instanceof WrongSkipError) {
                    let packer = new BinaryPacker();
                    packer.uint1p31(0, 1, "R", "Last Stream ID");
                    packer.uint32(1, "Error Code");
                    let payload = packer.raw();
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
            this.prefixTok.commit();
            data = this.prefixTok.leftovers();
            this.prefixTok = null;
        }

        // XXX: Missing MUSTs regarding CONTINUATION frames following
        // HEADER/PUSH_PROMISE frames.
        if (!this.prefixTok) {
            this.frameParser.parse(data, frame => {
                switch (frame.type) {
                    case 0x1:
                        this.headerParser.parseHeaderFrame(frame);
                        break;
                    case 0x4:
                        console.log("settings:", this.parseSettings(frame));
                        break;
                    case 0x9:
                        this.headerParser.parseContinuationFrame(frame);
                        break;
                    default:
                       console.log("WARNING: cannot handle frame type", frame.type);
                }
            });
        }
    }

    parseSettings(frame) {
        let settings = {};

        let tok = new BinaryTokenizer(frame.payload);

        Must(frame.streamIdentifier === 0, "PROTOCOL_ERROR"); // Section 6.5 of RFC 7540
        Must(frame.payload.length % 6 === 0, "FRAME_SIZE_ERROR"); // Section 6.5 of RFC 7540

        const isACK = frame.getFlag(0);
        if (isACK) {
            Must(frame.payload.length === 0, "FRAME_SIZE_ERROR"); // Section 6.5 of RFC 7540
        } else {
            while (!tok.atEnd()) {
                let identifier = tok.uint16("Setting Identifier");
                let value = tok.uint32("Setting Value");

                settings[identifier] = value;
            }
        }

        return settings;
    }
}
