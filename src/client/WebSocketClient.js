import ConnectionError from "../error/ConnectionError.js";
import EventTargetManager from "../utils/event/EventTargetManager.js";
import MessageBuffer from "../utils/MessageBuffer.js";

const EMPTY_FN = function() {};

export function httpToWsUrl(url) {
    const result = new URL(url);
    result.protocol = result.protocol.replace("http", "ws");
    return result;
}

export default class WebSocketClient extends EventTarget {

    #wsUrl;

    #socket;

    #socketId;

    #timeout;

    #maxtime = 30000;

    #onmessage = EMPTY_FN;

    #messageBuffer = new MessageBuffer();

    #websocketEventManager = new EventTargetManager();

    constructor(url) {
        super();
        this.#wsUrl = httpToWsUrl(url);
        /* --- */
        this.#websocketEventManager.set("open", () => {
            this.#onsocketopen();
        });
        this.#websocketEventManager.set(["close", "error"], () => {
            this.#onsocketclose();
        });
        this.#websocketEventManager.set("message", (event) => {
            const msg = JSON.parse(event.data);
            switch (msg.type) {
                case "ping":
                    this.#onsocketping(msg);
                    break;
                case "data":
                    this.#onsocketmessage(msg.data);
                    break;
            }
        });
    }

    #setNextTimeout() {
        clearTimeout(this.#timeout);
        if (this.#maxtime > 0) {
            this.#timeout = setTimeout(()=>{
                this.#socket.close();
            }, this.#maxtime);
        } else {
            this.#timeout = undefined;
        }
    }

    #onsocketopen(/* event */) {
        this.#messageBuffer.each((msg) => this.send(msg));
        this.#setNextTimeout();
    }

    #onsocketclose(/* event */) {
        this.#cleanup();
        this.dispatchEvent(new Event("closed"));
    }

    #onsocketping(msg) {
        this.#setNextTimeout();
        msg.type = "pong";
        this.#socket.send(JSON.stringify(msg));
    }

    #onsocketmessage(data) {
        this.#setNextTimeout();
        const event = new Event("message");
        event.data = data;
        this.#onmessage(event);
        this.dispatchEvent(event);
    }

    #cleanup() {
        clearTimeout(this.#timeout);
        this.#timeout = null;
        this.#socket = null;
        this.#socketId = null;
        this.#websocketEventManager.disconnect();
    }

    get id() {
        return this.#socketId;
    }

    set maxTime(value) {
        value = parseInt(value);
        if (!isNaN(value) && value >= 0) {
            this.#maxtime = value;
            this.#setNextTimeout();
        }
    }

    get maxTime() {
        return this.#maxtime;
    }

    isOpen() {
        return !!this.#socket && this.#socket.readyState == WebSocket.OPEN;
    }

    async open() {
        if (this.#socket == null) {
            await new Promise((resolve, reject) => {
                try {
                    this.#socket = new WebSocket(this.#wsUrl);
                    const eventManager = new EventTargetManager(this.#socket);
                    this.#websocketEventManager.switchTarget(this.#socket);
                    eventManager.set("error", () => {
                        const readyState = this.#socket.readyState;
                        eventManager.clear();
                        eventManager.disconnect();
                        this.#cleanup();
                        if (readyState  === WebSocket.CLOSED) {
                            reject(new ConnectionError("Error connecting WebSocket"));
                        } else {
                            reject(new ConnectionError("Unexpected error"));
                        }
                    });
                    eventManager.set("message", (event) => {
                        eventManager.clear();
                        eventManager.disconnect();
                        const msg = JSON.parse(event.data);
                        if (msg.type === "uuid") {
                            this.#socketId = msg.data;
                            resolve();
                        }
                    });
                } catch (e) {
                    this.#socket = null;
                    reject(e);
                }
            });
        }
    }

    close() {
        return new Promise((resolve, reject) => {
            if (!!this.#socket && this.#socket.readyState == WebSocket.OPEN) {
                try {
                    this.#socket.addEventListener("close", () => {
                        resolve();
                    }, {once: true});
                    this.#socket.close();
                    this.#onsocketclose();
                } catch (e) {
                    reject(e);
                }
            } else {
                resolve();
            }
        });
    }

    send(data) {
        if (typeof data == "undefined") {
            throw new Error("can not send undefined data");
        }
        const msg = JSON.stringify({
            type: "data",
            data: data
        });
        if (!!this.#socket && this.#socket.readyState == WebSocket.OPEN) {
            this.#socket.send(msg);
        } else {
            this.#messageBuffer.add(msg);
        }
    }

    set onmessage(callback) {
        if (typeof callback == "function") {
            this.#onmessage = callback;
        } else {
            this.#onmessage = EMPTY_FN;
        }
    }

    get onmessage() {
        return this.#onmessage;
    }

}
