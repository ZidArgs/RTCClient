import EventTargetManager from "../utils/EventTargetManager.js";
import WebSocketClient from "../utils/WebSocketClient.js";

export default class Signaling extends EventTarget {

    #wsUrl;

    #client;

    #websocketEventManager = new EventTargetManager();

    constructor(url) {
        super();
        this.#wsUrl = new URL("/signaling", url);
        this.#wsUrl.protocol = this.#wsUrl.protocol.replace("http", "ws");
        this.#client = new WebSocketClient(this.#wsUrl);
        this.#websocketEventManager.switchTarget(this.#client);
        this.#websocketEventManager.set("message", async (event) => {
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
    }

    get id() {
        return this.#client.id;
    }

    async open() {
        await this.#client.open();
    }

    close() {
        this.#client.close();
        this.#websocketEventManager.switchTarget(null);
    }

    sendICE(receiver, data) {
        this.#client.send({
            type: "ice",
            receiver: receiver,
            body: data
        });
    }

    sendSDP(receiver, data) {
        this.#client.send({
            type: "sdp",
            receiver: receiver,
            body: data
        });
    }

}
