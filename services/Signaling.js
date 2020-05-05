import WebSocketClient from "../utils/WebSocketClient.js";

const SERVICE_URL = new WeakMap();

const EMPTY_FN = function() {};
const CLIENT = new WeakMap();
const ON_ICE = new WeakMap();
const ON_OFFER = new WeakMap();
const ON_ANSWER = new WeakMap();

async function onMessageRecieved(msg) {
    switch(msg.type) {
        case "sdp":
            if (msg.body.type == "offer") {
                ON_OFFER.get(this)(msg.sender, msg.body);
            } else if (msg.body.type == "answer") {
                ON_ANSWER.get(this)(msg.sender, msg.body);
            }
        break;
        case "ice":
            ON_ICE.get(this)(msg.sender, msg.body);
        break;
    }
}

export default class Signaling {

    constructor(url) {
        let service_url = new URL("/signaling", url);
        SERVICE_URL.set(this, service_url);
        service_url.protocol = service_url.protocol.replace("http", "ws");
        let client = new WebSocketClient(service_url, onMessageRecieved.bind(this));
        CLIENT.set(this, client);
        ON_ICE.set(this, EMPTY_FN);
        ON_OFFER.set(this, EMPTY_FN);
        ON_ANSWER.set(this, EMPTY_FN);
    }

    get UUID() {
        let client = CLIENT.get(this);
        return client.UUID;
    }

    async open() {
        let client = CLIENT.get(this);
        await client.open();
    }

    close() {
        let client = CLIENT.get(this);
        client.close();
    }

    sendICE(reciever, data) {
        let client = CLIENT.get(this);
        client.send({
            type: 'ice',
            reciever: reciever,
            body: data
        });
    }

    sendSDP(reciever, data) {
        let client = CLIENT.get(this);
        client.send({
            type: 'sdp',
            reciever: reciever,
            body: data
        });
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