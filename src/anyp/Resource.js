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
    notModifiedSince(confidence) {
        if (confidence === undefined)
            confidence = new Date();
        return Gadgets.DateSum(this.lastModificationTime, confidence);
    }

    // return an IMS date suitable for triggering a 200 response
    modifiedSince(confidence) {
        Must(confidence !== undefined);
        return Gadgets.DateDiff(this.lastModificationTime, confidence);
    }
}
