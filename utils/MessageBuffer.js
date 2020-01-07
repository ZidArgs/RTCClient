const MESSAGES = new WeakMap;

export default class MessageBuffer {

    constructor() {
        MESSAGES.set(this, []);
    }

    add(msg) {
        MESSAGES.get(this).push(msg);
    }

    next() {
        let arr = MESSAGES.get(this);
        if (!!arr.length) {
            return arr.shift();
        }
    }

    each(callback) {
        let arr = MESSAGES.get(this);
        while (!!arr.length) {
            callback(arr.shift());
        }
    }

}