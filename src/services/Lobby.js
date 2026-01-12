import EventTargetManager from "../utils/EventTargetManager.js";
import Rest from "../utils/Rest.js";
import WebSocketClient from "../utils/WebSocketClient.js";

export default class Lobby {

    #serviceUrl;

    #wsUrl;

    #client;

    #masterName;

    #masterKey = btoa(crypto.getRandomValues(new Uint8Array(16)).join(""));

    #onMessage;

    #websocketEventManager = new EventTargetManager();

    constructor(url, onMessage) {
        if (typeof onMessage !== "function") {
            throw new TypeError("onMessage needs to be a function");
        }
        this.#serviceUrl = new URL("/lobby", url);
        // create websocket
        this.#wsUrl = new URL(this.#serviceUrl);
        this.#wsUrl.protocol = this.#wsUrl.protocol.replace("http", "ws");
        this.#websocketEventManager.set("message", async (event) => {
            const answer = await this.#onMessage(event.data.body);
            this.#client.send({
                requestID: event.data.requestID,
                body: answer
            });
        });
    }

    async register(name, pass = "", desc = "", version = 0, data = {}) {
        if (typeof name !== "string" || name === "") {
            throw new TypeError("name needs to be a non empty string");
        }
        if (this.#masterName != null) {
            return {
                success: false,
                error: "you already registered an instance"
            };
        }
        await this.#client.open();
        this.#masterName = name;
        try {
            const res = await Rest.post(`${this.#serviceUrl}/register`, {
                name,
                pass,
                desc,
                version,
                data,
                key: this.#masterKey,
                id: this.#client.id
            });

            this.#client = new WebSocketClient(this.#wsUrl);
            this.#websocketEventManager.switchTarget(this.#client);

            return res;
        } catch (e) {
            this.#masterName = null;
            return {
                success: false,
                error: e
            };
        }
    }

    async unregister() {
        try {
            const res = await Rest.post(`${this.#serviceUrl}/remove`, {
                name: this.#masterName,
                key: this.#masterKey
            });
            if (res.success) {
                this.#masterName = null;
            }

            this.#client.close();
            this.#client = null;
            this.#websocketEventManager.switchTarget(null);

            return res;
        } catch (e) {
            return {
                success: false,
                error: e
            };
        }
    }

    async getInstances() {
        try {
            const res = await Rest.get(this.#serviceUrl);
            return {
                success: true,
                data: res
            };
        } catch (e) {
            return {
                success: false,
                error: e
            };
        }
    }

    async getPeer(id, name, pass = "", version = 0) {
        try {
            const res = await Rest.post(`${this.#serviceUrl}/get`, {
                name,
                id,
                pass,
                version
            });
            return res;
        } catch (e) {
            return {
                success: false,
                reason: "connection problem",
                error: e
            };
        }
    }

}
