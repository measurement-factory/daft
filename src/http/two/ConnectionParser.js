import FrameParser from "./FrameParser";
import BinaryTokenizer, { InsufficientInputError } from "./BinaryTokenizer";
import HeaderParser from "./HeadersParser";
import Request from "../Request";
import { Must } from "../../misc/Gadgets";

import HttpTwoFrame, {FrameTypeSettings} from "./Frame";
import {packFrame} from "./MessagePacker";

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
            this.prefixTok.skipExact("PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n", "Connection Preface");
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
