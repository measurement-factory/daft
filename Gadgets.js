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
    // a bare ^ also matches the end of the string ending with \n!
    text = text.replace(/^./mg, "\t" + prefix + "$&");
    if (!text.endsWith("\n"))
        text += "\n";
    return "\n" + text;
}
