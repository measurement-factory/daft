/* Manages HTTP status-line. */

export default class StatusLine {

    constructor() {
        this.httpVersion = null;
        this.versionDelimiter = null;
        this.statusCode = null;
        this.statusDelimiter = null;
        this.reasonPhrase = null;
        this.terminator = null;
    }
    clone() {
        let dupe = new StatusLine();
        dupe.httpVersion = this.httpVersion;
        dupe.versionDelimiter = this.versionDelimiter;
        dupe.statusCode = this.statusCode;
        dupe.statusDelimiter = this.statusDelimiter;
        dupe.reasonPhrase = this.reasonPhrase;
        dupe.terminator = this.terminator;
        return dupe;
    }

    toString() {
        return this.raw();
    }

    finalize() {
        // XXX: Do not overwrite already set properties
        this.httpVersion = "HTTP/1.1";
        this.versionDelimiter = " ";
        this.statusCode = "200";
        this.statusDelimiter = " ";
        this.reasonPhrase = "OK";
        this.terminator = "\r\n";
    }

    raw() {
        let image = "";
        if (this.httpVersion !== null)
            image += this.httpVersion;
        if (this.versionDelimiter !== null)
            image += this.versionDelimiter;
        if (this.statusCode !== null)
            image += this.statusCode;
        if (this.statusDelimiter !== null)
            image += this.statusDelimiter;
        if (this.reasonPhrase !== null)
            image += this.reasonPhrase;
        if (this.terminator !== null)
            image += this.terminator;
        return image;
    }

    parse(raw) {
        let reqRe = /^(\S+)(\s+)(\d+)(\s+)(.*)(\r*\n)$/;
        let match = reqRe.exec(raw);
        if (!match)
            throw new Error("Unable to parse status-line: " + raw);
        this.httpVersion = match[1];
        this.versionDelimiter = match[2];
        this.statusCode = match[3];
        this.statusDelimiter = match[4];
        if (match[5] !== undefined)
            this.reasonPhrase = match[5];
        this.terminator = match[6];
    }
}
