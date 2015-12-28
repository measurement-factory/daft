/* Assorted small handy global functions. */

export function Must(condition) {
    if (!condition)
        throw new Error(`assertion failure: ${condition}`);
}

export function PrettyMime(prefix, data) {
    if (prefix === undefined)
        prefix = "";
    let text = data;
    text = text.replace(/\t/g, "\\t");
    text = text.replace(/\r/g, "\\r");
    text = text.replace(/\n/g, "\\n\n");
    // XXX: encode non-printable and confusing characters such as \u2028
    // a bare ^ also matches the end of the string ending with \n!
    text = text.replace(/^./mg, "\t" + prefix + "$&");
    if (!text.endsWith("\n"))
        text += "\n";
    return "\n" + text;
}

// to avoid dumping bytes on console as MIME headers, omit mimePrefix
// TODO: Add our own socket wrapper to store mimePrefix and ensure binary output?
export function SendBytes(socket, bytes, description, mimePrefix) {
    // bytes must be a "binary" string for the binary conversion in write() to work;
    // for example, the following writes just one byte: write("\u2028", 'binary')
    Must(Buffer(bytes, "binary").toString("binary") === bytes);
    // Even though bytes are in binary format, we must specify "binary" explicitly
    // to avoid *default* conversion to utf8 (that will not work for a binary string!).
    socket.write(bytes, 'binary');

    let toLog = `sending ${bytes.length} ${description} bytes`;
    if (mimePrefix !== undefined && mimePrefix !== null)
        toLog += ":\n" + PrettyMime(mimePrefix, bytes);
    console.log(toLog);
}

export function UniqueId(prefix) {
    return prefix + Math.floor(1.0 + 0xFFFFFFFF * Math.random()).toString(16);
}
