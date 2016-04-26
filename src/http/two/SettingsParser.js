// Nothing in this file is ever used

// Defaults are from HTTP2 RFC Section 6.5.2.
export const Defaults = {
    SETTINGS_HEADER_TABLE_SIZE: 4096, // octets
    SETTINGS_ENABLE_PUSH: 1, // Must be 0 or 1

    // XXX: no limit == undefined?
    // 0 is not special; just prevents the creation of new streams.
    // Servers SHOULD set a zero value only for a short time.
    SETTINGS_MAX_CONCURRENT_STREAMS: undefined,

    // Initial value: 65,535 octets
    // Values above 2^31 - 1 MUST connection error FLOW_CONTROL_ERROR.
    SETTINGS_INITIAL_WINDOW_SIZE: 2 ** 16 - 1, // 65,535 octets

    // Largest frame payload that the sender is willing to receive, in
    // octets.
    //
    // Default value: 2^14 octets.
    // Value MUST be in [2^14, 2^24-1] octets; otherwise send PROTOCOL_ERROR.
    SETTINGS_MAX_FRAME_SIZE: 2 ** 14,

    // XXX: no limit == undefined?
    // Informs receiver of the maximum size of a header list that the
    // sender is prepared to accept in octets. Based off of
    // uncompressed size of header fields, including length and value
    // plus an overhead of 32 octets for each header field.
    SETTINGS_MAX_HEADER_LIST_SIZE: undefined,
};

export const Names = {
    0x1: "SETTINGS_HEADER_TABLE_SIZE",
    0x2: "SETTINGS_ENABLE_PUSH",
    0x3: "SETTINGS_MAX_CONCURRENT_STREAMS",
    0x4: "SETTINGS_INITIAL_WINDOW_SIZE",
    0x5: "SETTINGS_MAX_FRAME_SIZE",
    0x6: "SETTINGS_MAX_HEADER_LIST_SIZE",
};
