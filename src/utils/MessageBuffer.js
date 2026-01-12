export default class MessageBuffer {

    #messages = [];

    add(msg) {
        this.#messages.push(msg);
    }

    next() {
        if (this.#messages.length) {
            return this.#messages.shift();
        }
    }

    each(callback) {
        while (this.#messages.length) {
            callback(this.#messages.shift());
        }
    }

}
