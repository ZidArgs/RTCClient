import EventTargetManager from "./EventTargetManager.js";
import MessageBuffer from "./MessageBuffer.js";

// WebSocket

const PING_OUT = 30000;

export default class WebSocketClient extends EventTarget {

    #wsUrl;

    #socket;

    #socketId;

    #timeout;

    #messageBuffer = new MessageBuffer();

    #websocketEventManager = new EventTargetManager();

    constructor(url) {
        super();
        this.#wsUrl = new URL(url);
        this.#wsUrl.protocol = this.#wsUrl.protocol.replace("http", "ws");
        /* --- */
        this.#websocketEventManager.set("open", () => {
            this.#messageBuffer.each((msg) => {
                this.send(msg);
            });
            clearTimeout(this.#timeout);
            this.#timeout = setTimeout(() => {
                this.#socket.close();
            }, PING_OUT);
        });
        this.#websocketEventManager.set("close", () => {
            this.#socket = null;
            this.#socketId = null;
            clearTimeout(this.#timeout);
            this.#timeout = null;
        });
        this.#websocketEventManager.set("message", (event) => {
            const msg = JSON.parse(event.data);
            switch (msg.type) {
                case "ping":
                    clearTimeout(this.#timeout);
                    this.#timeout = setTimeout(() => {
                        this.#socket.close();
                    }, PING_OUT);
                    msg.type = "pong";
                    this.#socket.send(JSON.stringify(msg));
                    break;
                case "data":
                    {
                        const ev = new Event("message");
                        ev.data = msg.data;
                        this.dispatchEvent(ev);
                    }
                    break;
            }
        });
    }

    get id() {
        return this.#socketId;
    }

    isOpen() {
        return !!this.#socket && this.#socket.readyState == WebSocket.OPEN;
    }

    async open() {
        if (this.#socket == null) {
            await new Promise((resolve, reject) => {
                try {
                    this.#socket = new WebSocket(this.#wsUrl);
                    this.#websocketEventManager.switchTarget(this.#socket);
                    const registerFn = (event) => {
                        const msg = JSON.parse(event.data);
                        if (msg.type === "uuid") {
                            this.#socketId = msg.data;
                            this.#socket.removeEventListener("message", registerFn);
                            resolve();
                        }
                    };
                    this.#socket.addEventListener("message", registerFn);
                } catch (e) {
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

}
