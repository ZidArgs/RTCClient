
import EventTargetManager from "@emcjs/core/util/event/EventTargetManager.js";
import WebSocketClient from "../client/WebSocketClient.js";

export default class RTCSignalingService extends EventTarget {

    #wsUrl;

    #client;

    #websocketEventManager = new EventTargetManager();

    constructor(baseUrl) {
        super();
        this.#wsUrl = new URL("signaling", baseUrl);
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
        this.#websocketEventManager.disconnect();
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
