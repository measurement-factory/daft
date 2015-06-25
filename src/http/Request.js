/* Manages an HTTP request message, including headers and body */

import Message from "./Message";
import RequestLine from "./RequestLine";

export default class Request extends Message {

    constructor(...args) {
        super(new RequestLine(), ...args);
    }
}
