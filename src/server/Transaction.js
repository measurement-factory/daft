/* Daft Toolkit                         http://www.measurement-factory.com/
 * Copyright (C) 2015,2016 The Measurement Factory.
 * Licensed under the Apache License, Version 2.0.                       */

import SideTransaction from "../side/Transaction";
import { forcesEof } from "../http/one/MessageWriter";
import RequestParser from "../http/one/RequestParser";
import Response from "../http/Response";
import { LocalAddress } from "../misc/Gadgets";
import assert from "assert";

// receives a request and sends the corresponding response
export default class Transaction extends SideTransaction {

    constructor() {
        super(...arguments);
        this.messageOut = new Response();

        this.ownerKind = "server";
        this.peerKind = "client";
        this.messageOutKind = "response"; // TODO: new MessageGenerator()?
        this.messageInKind = "request";

        this.messageParser = new RequestParser(this);
        this.messageParser.logPrefix = ">s ";

        this.logPrefixForSending = "<s ";
    }

    get request() {
        return this.messageIn;
    }

    get response() {
        return this.messageOut;
    }

    _noteDoneSending() {
        let forceEof = this.socket && forcesEof(this.messageIn, this.messageOut);
        if (forceEof && this._closeLast) {
            this.context.log("avoiding connection half-closure:", this._closeLast);
            forceEof = false;
        }
        if (forceEof) {
            this.context.log("will half-close the connection to mark the end of response");
            assert(!this._halfClosing);
            this._halfClosing = true;
            this.socket.endAsync().then(() => {
                this.context.enter("wrote everything");
                this.context.log("half-closed the connection to mark the end of response");
                this._halfClosing = false;
                assert(!this._writing());
                this.checkpoint();
                this.context.exit();
            });
            // we might still be writing here
        }

        super._noteDoneSending();
    }

    generateDefaultMessage() {
        return new Response();
    }

    finalizeMessage() {
        if (!this.request)
            return; // no response without request by default

        assert(this.response);

        this.response.generatorAddress(LocalAddress(this.socket));
        this.response.finalize(this.request);

        this._finalizedMessage = true; // TODO: Move to Message::finalize()?
    }
}
