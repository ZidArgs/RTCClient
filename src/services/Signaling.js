import WebSocketClient from "../utils/WebSocketClient.js";

const SERVICE_URL = new WeakMap();
const CLIENT = new WeakMap();

export default class Signaling extends EventTarget {

    constructor(url) {
        super();
        const service_url = new URL("/signaling", url);
        SERVICE_URL.set(this, service_url);
        service_url.protocol = service_url.protocol.replace("http", "ws");
        const client = new WebSocketClient(service_url);
        client.addEventListener("message", async event => {
            const msg = event.data;
            switch (msg.type) {
                case "sdp":
                    if (msg.body.type == "offer") {
                        const ev = new Event("offer");
                        ev.sender = msg.sender;
                        ev.body = msg.body;
                        this.dispatchEvent(ev);
                    } else if (msg.body.type == "answer") {
                        const ev = new Event("answer");
                        ev.sender = msg.sender;
                        ev.body = msg.body;
                        this.dispatchEvent(ev);
                    }
                    break;
                case "ice":
                    {
                        const ev = new Event("ice");
                        ev.sender = msg.sender;
                        ev.body = msg.body;
                        this.dispatchEvent(ev);
                    }
                    break;
            }
        });
        CLIENT.set(this, client);
    }

    get id() {
        const client = CLIENT.get(this);
        return client.id;
    }

    async open() {
        const client = CLIENT.get(this);
        await client.open();
    }

    close() {
        const client = CLIENT.get(this);
        client.close();
    }

    sendICE(reciever, data) {
        const client = CLIENT.get(this);
        client.send({
            type: "ice",
            reciever: reciever,
            body: data
        });
    }

    sendSDP(reciever, data) {
        const client = CLIENT.get(this);
        client.send({
            type: "sdp",
            reciever: reciever,
            body: data
        });
    }

}
