import HttpTwoFrame, { FrameTypeHeaders, FrameTypeData } from "./Frame";
import BinaryPacker from "./BinaryPacker";
import HeaderPacker from "./HeaderPacker";

export function requestPrefix(/*message*/) {
    return "";
}

export function packFrame(frame) {
    let packer = new BinaryPacker();
    packer.uint24(frame.payload.length, "length");
    packer.uint8(frame.type, "type");
    packer.uint8(frame.flags, "flags");
    packer.uint1p31(0, frame.streamIdentifier, "R", "Stream Identifier");
    packer.in(frame.payload, "Payload");
    return packer.raw();
}

export function responsePrefix(message) {
    message.body = null;

    let packer = new HeaderPacker();
    packer.indexedHeaderField(8);
    let payload = packer.raw();

    // let goAwayPacker = new BinaryPacker();
    // packer.uint1p31(0, 0, "R", "Last-Stream-ID");
    // packer.uint32(0, "Error code");
    // let goAwayPayload = goAwayPacker.raw();

    let frame = new HttpTwoFrame({ type: FrameTypeHeaders, streamIdentifier: 1, flags: 0x4, payload });
    let gaframe = new HttpTwoFrame({ type: FrameTypeData, streamIdentifier: 1, flags: 0x1, payload: "test data" });
    return packFrame(frame) + packFrame(gaframe);
}
