import MessageBuffer from "./MessageBuffer.js";

// WebSocket

const SERVICE_URL = new WeakMap();
const SOCKET = new WeakMap();
const MESSAGE_BUFFER = new WeakMap();
const SOCKET_ID = new WeakMap();
const TIMEOUT = new WeakMap();
const PING_OUT = 30000;

const EMPTY_FN = function() {};
const ON_MESSAGE = new WeakMap();

function openSocket(that, url, onMessage) {
    return new Promise(function(resolve, reject) {
        try {
            const socket = new WebSocket(url);
            socket.addEventListener('open', function(event) {
                const buffer = MESSAGE_BUFFER.get(this);
                buffer.each(msg => this.send(msg));
                SOCKET.set(this, socket);
                clearTimeout(TIMEOUT.get(this));
                TIMEOUT.set(this, setTimeout(()=>socket.close(), PING_OUT));
            }.bind(that));
            socket.addEventListener('close', function(event) {
                SOCKET.delete(this);
                SOCKET_ID.delete(this);
                clearTimeout(TIMEOUT.get(this));
                TIMEOUT.delete(this);
            }.bind(that));
            socket.addEventListener('message', function(event) {
                const socket = SOCKET.get(this);
                const msg = JSON.parse(event.data);
                switch (msg.type) {
                    case "ping":
                        clearTimeout(TIMEOUT.get(this));
                        TIMEOUT.set(this, setTimeout(()=>socket.close(), PING_OUT));
                        msg.type = "pong";
                        socket.send(JSON.stringify(msg));
                        break;
                    case "uuid":
                        SOCKET_ID.set(this, msg.data);
                        resolve();
                        break;
                    case "data":
                        {
                            const ev = new Event("message");
                            ev.data = msg.data;
                            onMessage(ev);
                            this.dispatchEvent(ev);
                        }
                        break;
                }
            }.bind(that));
        } catch(e) {
            reject(e);
        }
    });
}

export default class WebSocketClient extends EventTarget {

    constructor(url) {
        super();
        const ws_url = new URL(url);
        ws_url.protocol = ws_url.protocol.replace("http", "ws");
        SERVICE_URL.set(this, ws_url);
        MESSAGE_BUFFER.set(this, new MessageBuffer());
        ON_MESSAGE.set(this, EMPTY_FN);
    }

    get id() {
        return SOCKET_ID.get(this);
    }

    isOpen() {
        const socket = SOCKET.get(this);
        return !!socket && socket.readyState == WebSocket.OPEN;
    }

    async open() {
        if (!SOCKET.has(this)) {
            const url = SERVICE_URL.get(this);
            await openSocket(this, url, ON_MESSAGE.get(this));
        }
    }

    close() {
        return new Promise((resolve, reject) => {
            const socket = SOCKET.get(this);
            if (!!socket && socket.readyState == WebSocket.OPEN) {
                try {
                    socket.addEventListener('close', (event) => {
                        resolve();
                    });
                    socket.close();
                } catch(e) {
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
        const socket = SOCKET.get(this);
        if (!!socket && socket.readyState == WebSocket.OPEN) {
            socket.send(msg);
        } else {
            const buffer = MESSAGE_BUFFER.get(this);
            buffer.add(msg);
        }
    }

    set onmessage(callback) {
        if (typeof callback == "function") {
            ON_MESSAGE.set(this, callback);
        } else {
            ON_MESSAGE.set(this, EMPTY_FN);
        }
    }

    get onmessage() {
        return ON_MESSAGE.get(this);
    }

}
