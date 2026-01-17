export default class ConnectionError extends Error {

    constructor(...args) {
        super(...args);
        this.name = this.constructor.name;
    }

}
