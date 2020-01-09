import MessageBuffer from "../utils/MessageBuffer.js";

const EMPTY_FN = function() {};
const CLIENT = new WeakMap();
const TIMEOUT = new WeakMap();
const MESSAGE_BUFFER = new WeakMap();
const READY_AWAIT = new WeakMap();
const ON_ICE = new WeakMap();
const ON_OFFER = new WeakMap();
const ON_ANSWER = new WeakMap();
const PING_OUT = 3000;
const URL = `${window.location.protocol.replace("http", "ws")}//${window.location.hostname}`;

export default class Signaling {

    constructor(url) {
        let ws_url = new URL("/signaling", url);
        ws_url.protocol = ws_url.protocol.replace("http", "ws");
        let client = new WebSocket(ws_url);
        MESSAGE_BUFFER.set(this, new MessageBuffer());
        READY_AWAIT.set(this, []);
        ON_ICE.set(this, EMPTY_FN);
        ON_OFFER.set(this, EMPTY_FN);
        ON_ANSWER.set(this, EMPTY_FN);
        client.addEventListener('open', () => {
            CLIENT.set(this, client);
            clearTimeout(TIMEOUT.get(this));
            TIMEOUT.set(this, setTimeout(()=>client.close(), PING_OUT));
            MESSAGE_BUFFER.get(this).each(client.send);
        });
        client.addEventListener('close', () => {
            CLIENT.delete(this);
            clearTimeout(TIMEOUT.get(this));
            TIMEOUT.delete(this);
        });
        client.addEventListener('message', (event) => {
            let msg = JSON.parse(event.data);
            switch(msg.type) {
                case "ping":
                    clearTimeout(TIMEOUT.get(this));
                    TIMEOUT.set(this, setTimeout(()=>client.close(), PING_OUT));
                    client.send(JSON.stringify({type:"pong",time:msg.time}));
                break;
                case "uuid":
                    console.info(`UUID: ${JSON.stringify(msg.body)}`);
                    this.UUID = msg.body;
                    READY_AWAIT.get(this).forEach(function(fn) {
                        fn(true);
                    });
                    READY_AWAIT.delete(this);
                break;
                case "sdp":
                    console.info(`SDP: ${JSON.stringify(msg.body)}`);
                    if (msg.body.type == "offer") {
                        ON_OFFER.get(this)(msg.sender, msg.body);
                    } else if (msg.body.type == "answer") {
                        ON_ANSWER.get(this)(msg.sender, msg.body);
                    }
                break;
                case "ice":
                    console.info(`ICE: ${JSON.stringify(msg.body)}`);
                    ON_ICE.get(this)(msg.sender, msg.body);
                break;
            }
        });
    }

    close() {
        CLIENT.get(this).close();
    }

    sendICE(reciever, data) {
        let msg = JSON.stringify({
            type: 'ice',
            reciever: reciever,
            body: data
        });
        if (CLIENT.has(this)) {
            CLIENT.get(this).send(msg);
        } else {
            MESSAGE_BUFFER.get(this).add(msg);
        }
    }

    sendSDP(reciever, data) {
        let msg = JSON.stringify({
            type: 'sdp',
            reciever: reciever,
            body: data
        });
        if (CLIENT.has(this)) {
            CLIENT.get(this).send(msg);
        } else {
            MESSAGE_BUFFER.get(this).add(msg);
        }
    }

    isReady() {
        return new Promise(function(resolve) {
            if (READY_AWAIT.has(this)) {
                READY_AWAIT.get(this).push(resolve);
            } else {
                resolve(true);
            }
        }.bind(this));
    }

    set onice(value) {
        if (typeof value == "function") {
            ON_ICE.set(this, value);
        } else {
            ON_ICE.set(this, EMPTY_FN);
        }
    }

    set onoffer(value) {
        if (typeof value == "function") {
            ON_OFFER.set(this, value);
        } else {
            ON_OFFER.set(this, EMPTY_FN);
        }
    }

    set onanswer(value) {
        if (typeof value == "function") {
            ON_ANSWER.set(this, value);
        } else {
            ON_ANSWER.set(this, EMPTY_FN);
        }
    }

}