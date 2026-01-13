import WebSocketClient, {httpToWsUrl} from "../client/WebSocketClient.js";
import EventTargetManager from "../utils/event/EventTargetManager.js";
import Rest from "../utils/Rest.js";

export default class RTCConnectorService {

    #serviceUrl;

    #wsUrl;

    #client;

    #masterName;

    #masterKey = btoa(crypto.getRandomValues(new Uint8Array(16)).join(""));

    #websocketEventManager = new EventTargetManager();

    constructor(baseUrl, serviceEndpoint, onMessage) {
        if (typeof serviceEndpoint !== "string" || serviceEndpoint === "") {
            throw new TypeError("serviceEndpoint needs to be a non empty string");
        }
        if (typeof onMessage !== "function") {
            throw new TypeError("onMessage needs to be a function");
        }
        this.#serviceUrl = new URL(serviceEndpoint, baseUrl);
        // create websocket
        this.#wsUrl = httpToWsUrl(this.#serviceUrl);
        this.#websocketEventManager.set("message", async (event) => {
            const answer = await onMessage(event.data.body);
            this.#client.send({
                requestID: event.data.requestID,
                body: answer
            });
        });
    }

    get serviceUrl() {
        return new URL(this.#serviceUrl);
    }

    async register(name, pass, version, data = {}) {
        if (typeof name !== "string" || name === "") {
            throw new TypeError("name needs to be a non empty string");
        }
        if (pass == null) {
            pass = "";
        }
        if (typeof pass !== "string") {
            throw new TypeError("pass needs to be a string or null");
        }
        if ((typeof version !== "string" || version === "") && (typeof version !== "number" || isNaN(version))) {
            throw new TypeError("name needs to be a non empty string or a valid number");
        }
        if (this.#masterName != null) {
            return {
                success: false,
                error: "you already registered an instance"
            };
        }

        this.#client = new WebSocketClient(this.#wsUrl);
        this.#websocketEventManager.switchTarget(this.#client);

        await this.#client.open();
        this.#masterName = name;
        try {
            const res = await Rest.post(`${this.#serviceUrl}/register`, {
                name,
                pass,
                version,
                data,
                key: this.#masterKey,
                id: this.#client.id
            });

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
