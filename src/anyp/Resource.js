/* Anything addressable by a fragmentless URI. */

import * as Gadgets from "../misc/Gadgets";
import * as FuzzyTime from "../misc/FuzzyTime";
import { Must } from "../misc/Gadgets";

export default class Resource {
    constructor(description) {
        this.description = description;
        this.uri = null;
        this.id = Gadgets.UniqueId("rid");
        this.lastModificationTime = null;
        this.nextModificationTime = null;
        this.body = null;
    }

    modifiedAt(when) {
        Must(when !== undefined);
        this.lastModificationTime = when; // may be null
        return this;
    }

    modifyNow() {
        return this.modifiedAt(FuzzyTime.Now());
    }

    expireAt(when) {
        Must(when !== undefined);
        this.nextModificationTime = when; // may be null
        return this;
    }

    expireAfter(delta) {
        return this.expireAt(Gadgets.DateSum(this.lastModificationTime, delta));
    }

    // return an IMS date suitable for triggering a 304 response
    notModifiedSince(delta = new Date(0)) {
        return Gadgets.DateSum(this.lastModificationTime, delta);
    }

    // return an IMS date suitable for triggering a 200 response
    modifiedSince(delta = new Date(24*60*60*1000) /* one day */) {
        return Gadgets.DateDiff(this.lastModificationTime, delta);
    }
}
