import MessageBuffer from "../utils/MessageBuffer.js";

const SERVICE_URL = new WeakMap();
const SOCKET = new WeakMap();
const MESSAGE_BUFFER = new WeakMap();
const SOCKET_ID = new WeakMap();
const TIMEOUT = new WeakMap();
const PING_OUT = 30000;

const ON_MESSAGE = new WeakMap();

function openSocket(that, url, onMessage) {
    return new Promise(function(resolve, reject) {
        try {
            let socket = new WebSocket(url);
            socket.addEventListener('open', function(event) {
                let buffer = MESSAGE_BUFFER.get(this);
                buffer.each(msg => this.send(msg));
                SOCKET.set(this, socket);
                clearTimeout(TIMEOUT.get(this));
                TIMEOUT.set(this, setTimeout(()=>socket.close(), PING_OUT));
            }.bind(that));
            socket.addEventListener('close', function(event) {
                SOCKET.delete(this);
                clearTimeout(TIMEOUT.get(this));
                TIMEOUT.delete(this);
            }.bind(that));
            socket.addEventListener('message', function(event) {
                let socket = SOCKET.get(this);
                let msg = JSON.parse(event.data);
                switch(msg.type) {
                    case "ping":
                        clearTimeout(TIMEOUT.get(this));
                        TIMEOUT.set(this, setTimeout(()=>socket.close(), PING_OUT));
                        socket.send(JSON.stringify({
                            type:"pong",
                            time:msg.time
                        }));
                    break;
                    case "uuid":
                        SOCKET_ID.set(this, msg.body);
                        resolve();
                    break;
                    default:
                        onMessage(msg);
                    break;
                }
            }.bind(that));
        } catch(e) {
            reject(e);
        }
    });
}

export default class WebSocketClient {

    constructor(url, onMessage) {
        let ws_url = new URL(url);
        ws_url.protocol = ws_url.protocol.replace("http", "ws");
        SERVICE_URL.set(this, ws_url);
        MESSAGE_BUFFER.set(this, new MessageBuffer());
        ON_MESSAGE.set(this, onMessage);
    }

    get UUID() {
        return SOCKET_ID.get(this);
    }

    isOpen() {
        return SOCKET.has(this);
    }

    async open() {
        if (!SOCKET.has(this)) {
            let url = SERVICE_URL.get(this);
            await openSocket(this, url, ON_MESSAGE.get(this));
        }
    }

    close() {
        let socket = SOCKET.get(this);
        socket.close();
    }

    send(data) {
        if (typeof data == "undefined") {
            throw new Error("can not send undefined data");
        }
        let msg = JSON.stringify(data);
        if (SOCKET.has(this)) {
            let socket = SOCKET.get(this);
            socket.send(msg);
        } else {
            let buffer = MESSAGE_BUFFER.get(this);
            buffer.add(msg);
        }
    }

}


