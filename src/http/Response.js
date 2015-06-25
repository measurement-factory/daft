/* Manages an HTTP response message, including headers and body */

import Message from "./Message";
import StatusLine from "./StatusLine";

export default class Response extends Message {

    constructor(...args) {
        super(new StatusLine(), ...args);
    }
}
