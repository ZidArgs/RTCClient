import RTCConnectorService from "./services/RTCConnectorService.js";
import RTCSignalingService from "./services/RTCSignalingService.js";
import EventTargetManager from "./utils/event/EventTargetManager.js";
import RTCPeer from "./utils/RTCPeer.js";

function getPort(value, def) {
    const port = parseInt(value);
    if (isNaN(port)) {
        return def;
    }
    return port;
}

let LOGGER = null;

class RTCClient extends EventTarget {

    static setLogger(value) {
        if (
            value == null ||
            typeof value.log != "function" ||
            typeof value.info != "function" ||
            typeof value.warn != "function" ||
            typeof value.error != "function"
        ) {
            LOGGER = null;
        } else {
            LOGGER = value;
        }
        RTCPeer.setLogger(LOGGER);
    }

    // Private instance fields replacing former WeakMap storage
    #serviceUrl;

    #connector;

    #config;

    #rtcInst = new Map();

    #channels;

    #messageHandler = new Map();

    constructor(port, serviceEndpoint, config = {}, channels = []) {
        if (typeof serviceEndpoint !== "string" || serviceEndpoint === "") {
            throw new TypeError("serviceEndpoint needs to be a non empty string");
        }
        super();
        this.#serviceUrl = new URL(location);
        this.#serviceUrl.port = getPort(port, this.#serviceUrl.port);
        this.#config = config;
        this.#channels = channels;
        // create connector
        this.#connector = new RTCConnectorService(this.#serviceUrl, serviceEndpoint, async (remoteId) => {
            return this.#onConnection(remoteId);
        });
        this.#connector.addEventListener("closed", () => {
            this.dispatchEvent(new Event("connector_closed"));
        });
    }

    get serviceUrl() {
        return new URL(this.#serviceUrl);
    }

    get connectorUrl() {
        return this.#connector.serviceUrl;
    }

    get masterName() {
        return this.#connector.masterName;
    }

    get masterKey() {
        return this.#connector.masterKey;
    }

    async #onConnection(remoteId) {
        if (LOGGER != null) {
            LOGGER.info(`REQUESTED CONNECTION\nremote: ${remoteId}`);
        }
        console.info(`REQUESTED CONNECTION\nremote: ${remoteId}`);
        const sig = new RTCSignalingService(this.#serviceUrl);
        await sig.open();
        this.#createPeer(sig, remoteId);
        return sig.id;
    }

    #createPeer(sig, remoteId) {
        if (LOGGER != null) {
            LOGGER.info(`SIGNALING STARTED\nlocal:  ${sig.id}`);
        }
        console.info(`SIGNALING STARTED\nlocal:  ${sig.id}`);
        const rtc = new RTCPeer(sig, remoteId, this.#config);
        const eventManager = new EventTargetManager(rtc);
        for (const chId in this.#channels) {
            const channelName = this.#channels[chId];
            rtc.openChannel(channelName, chId + 1, (channel, msg) => {
                if (LOGGER != null) {
                    LOGGER.info(`${rtc.remoteID} [${channel}]:`, msg);
                }
                console.info(`${rtc.remoteID} [${channel}]:`, msg);
                if (this.#messageHandler.has(channel)) {
                    this.#messageHandler.get(channel)(rtc.remoteID, msg);
                }
                // event
                const ev = new Event(`message:${channel}`);
                ev.remoteID = rtc.remoteID;
                ev.data = msg;
                this.dispatchEvent(ev);
            }).then(() => {
                if (LOGGER != null) {
                    LOGGER.info(`CHANNEL OPEN: ${channelName} @ ${rtc.remoteID}`);
                }
                console.info(`CHANNEL OPEN: ${channelName} @ ${rtc.remoteID}`);
                /* event */
                const ev = new Event(`ready:${channelName}`);
                ev.remoteID = rtc.remoteID;
                this.dispatchEvent(ev);
            });
        }
        this.#rtcInst.set(remoteId, rtc);
        eventManager.set("connected", (event) => {
            sig.close();
            if (LOGGER != null) {
                LOGGER.info(`CONNECTED: ${event.remoteID}`);
            }
            console.info(`CONNECTED: ${event.remoteID}`);
            /* event */
            const ev = new Event("connected");
            ev.remoteID = event.remoteID;
            this.dispatchEvent(ev);
        });
        eventManager.set("closed", (event) => {
            this.#rtcInst.delete(event.remoteID);
            if (LOGGER != null) {
                LOGGER.info(`DISCONNECTED: ${event.remoteID}`);
            }
            console.info(`DISCONNECTED: ${event.remoteID}`);
            eventManager.clear();
            eventManager.disconnect();
            /* event */
            const ev = new Event("closed");
            ev.remoteID = event.remoteID;
            this.dispatchEvent(ev);
        });
        eventManager.set("failed", (event) => {
            this.#rtcInst.delete(event.remoteID);
            eventManager.clear();
            eventManager.disconnect();
            /* event */
            const ev = new Event("failed");
            ev.remoteID = event.remoteID;
            this.dispatchEvent(ev);
        });
        eventManager.set("log", (event) => {
            /* event */
            const ev = new Event("log");
            ev.type = event.type;
            ev.message = event.message;
            this.dispatchEvent(ev);
        });
        if (LOGGER != null) {
            LOGGER.info(`RTC MODULE INITIALIZED\nlocal:  ${sig.id}\nremote: ${rtc.remoteID}`);
        }
        console.info(`RTC MODULE INITIALIZED\nlocal:  ${sig.id}\nremote: ${rtc.remoteID}`);
        return rtc;
    }

    async register(name, pass = "", version = 0, data = {}) {
        if (LOGGER != null) {
            LOGGER.info(`REGISTER ROOM: ${name}`);
        }
        console.info(`REGISTER ROOM: ${name}`);
        return await this.#connector.register(name, pass, version, data);
    }

    async unregister() {
        if (LOGGER != null) {
            LOGGER.info("UNREGISTER ROOM");
        }
        console.info("UNREGISTER ROOM");
        return await this.#connector.unregister();
    }

    async connect(name, pass = "", version = 0) {
        if (LOGGER != null) {
            LOGGER.info(`GET HOST UUID: ${name}`);
        }
        console.info(`GET HOST UUID: ${name}`);
        const sig = new RTCSignalingService(this.#serviceUrl);
        await sig.open();
        const res = await this.#connector.getPeer(sig.id, name, pass, version);
        if (res.success === true) {
            if (LOGGER != null) {
                LOGGER.info(`CONNECT TO: ${res.id}`);
            }
            console.info(`CONNECT TO: ${res.id}`);
            this.#createPeer(sig, res.id).negotiate();
            return {success: true};
        } else {
            return {
                success: false,
                error: res.error
            };
        }
    }

    async cutConnection(remoteId) {
        if (LOGGER != null) {
            LOGGER.info(`CUT CONNECTION: ${remoteId}`);
        }
        console.info(`CUT CONNECTION: ${remoteId}`);
        this.#rtcInst.get(remoteId).close();
        this.#rtcInst.delete(remoteId);
    }

    async disconnect() {
        if (LOGGER != null) {
            LOGGER.info("DISCONNECT");
        }
        console.info("DISCONNECT");
        this.#rtcInst.forEach((rtc) => {
            rtc.close();
        });
        this.#rtcInst.clear();
    }

    getStats(remoteId) {
        if (this.#rtcInst.has(remoteId)) {
            return this.#rtcInst.get(remoteId).getStats();
        }
        return Promise.reject("rtcpeer not found");
    }

    send(channel, msg) {
        Array.from(this.#rtcInst.values()).forEach((rtc) => {
            rtc.send(channel, msg);
        });
    }

    sendOne(channel, remoteId, msg) {
        if (this.#rtcInst.has(remoteId)) {
            this.#rtcInst.get(remoteId).send(channel, msg);
        }
    }

    sendButOne(channel, remoteId, msg) {
        Array.from(this.#rtcInst.values()).forEach((rtc) => {
            if (rtc.remoteID == remoteId) {
                return;
            }
            rtc.send(channel, msg);
        });
    }

    setMessageHandler(channel, callback) {
        if (typeof callback == "function") {
            this.#messageHandler.set(channel, callback);
        } else {
            this.#messageHandler.delete(channel);
        }
    }

}

export default RTCClient;
