import { Must } from "../../misc/gadgets";

export const FrameTypeData = 0x0;
export const FrameTypeHeaders = 0x1;
export const FrameTypePriority = 0x2;
export const FrameTypeResetStream = 0x3;
export const FrameTypeSettings = 0x4;
export const FrameTypePushPromise = 0x5;
export const FrameTypePing = 0x6;
export const FrameTypeGoAway = 0x7;
export const FrameTypeWindowUpdate = 0x8;
export const FrameTypeContinuation = 0x9;

export default class HttpTwoFrame {
    constructor({ type, streamIdentifier, flags = 0, payload = "" }) {
        Must(type !== undefined && type !== null, type);
        Must(streamIdentifier !== undefined && streamIdentifier !== null, streamIdentifier);

        this.type = type;
        this.streamIdentifier = streamIdentifier;
        this.flags = flags;
        this.payload = payload;
    }

    isSet(mask) {
        return this.flags & mask !== 0;
    }

    setPayload(payload) {
        this.payload = payload;
    }
}
