import RTCConnectorService from "./services/RTCConnectorService.js";
import RTCSignalingService from "./services/RTCSignalingService.js";
import EventTargetManager from "./utils/event/EventTargetManager.js";
import RTCPeer from "./utils/RTCPeer.js";
import {trimPathName} from "./utils/UriPath.js";

function getPort(value, def) {
    const port = parseInt(value);
    if (isNaN(port)) {
        return def;
    }
    return port;
}

class RTCClient extends EventTarget {

    #logger = null;

    #channelLogBlacklist = new Set();

    setLogger(value) {
        if (
            value == null ||
            typeof value.log != "function" ||
            typeof value.info != "function" ||
            typeof value.warn != "function" ||
            typeof value.error != "function"
        ) {
            this.#logger = null;
        } else {
            this.#logger = value;
        }
    }

    blacklistChannelLogging(channel, blacklist = true) {
        if (blacklist) {
            this.#channelLogBlacklist.add(channel);
        } else {
            this.#channelLogBlacklist.delete(channel);
        }
    }

    // Private instance fields replacing former WeakMap storage
    #serviceUrl = new URL("/", location);

    #connector;

    #config;

    #rtcInst = new Map();

    #channels;

    #messageHandler = new Map();

    constructor(port, basePath, serviceEndpoint, config = {}, channels = []) {
        if (typeof serviceEndpoint !== "string" || serviceEndpoint === "") {
            throw new TypeError("serviceEndpoint needs to be a non empty string");
        }
        super();
        const trimmedBasePath = trimPathName(basePath);
        if (trimmedBasePath !== "") {
            this.#serviceUrl = new URL(`/${trimmedBasePath}/`, location);
        }
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
        if (this.#logger != null) {
            this.#logger.info(`REQUESTED CONNECTION\nremote: ${remoteId}`);
        }
        console.info(`REQUESTED CONNECTION\nremote: ${remoteId}`);
        const sig = new RTCSignalingService(this.#serviceUrl);
        await sig.open();
        this.#createPeer(sig, remoteId);
        return sig.id;
    }

    #createPeer(sig, remoteId) {
        if (this.#logger != null) {
            this.#logger.info(`SIGNALING STARTED\nlocal:  ${sig.id}`);
        }
        console.info(`SIGNALING STARTED\nlocal:  ${sig.id}`);
        const rtc = new RTCPeer(sig, remoteId, this.#config);
        rtc.setLogger(this.#logger);
        const eventManager = new EventTargetManager(rtc);
        for (const chId in this.#channels) {
            const channelName = this.#channels[chId];
            rtc.openChannel(channelName, chId + 1, (channel, msg) => {
                if (!this.#channelLogBlacklist.has(channel)) {
                    if (this.#logger != null) {
                        this.#logger.info(`RECEIVE ${rtc.name} [${channel}]:`, msg);
                    }
                    console.info(`RECEIVE ${rtc.name} [${channel}]:`, msg);
                }
                if (this.#messageHandler.has(channel)) {
                    this.#messageHandler.get(channel)(rtc.remoteId, msg);
                }
                // event
                const ev = new Event(`message:${channel}`);
                ev.remoteId = rtc.remoteId;
                ev.data = msg;
                this.dispatchEvent(ev);
            }).then(() => {
                if (this.#logger != null) {
                    this.#logger.info(`CHANNEL OPEN: ${channelName} @ ${rtc.remoteId}`);
                }
                console.info(`CHANNEL OPEN: ${channelName} @ ${rtc.remoteId}`);
                /* event */
                const ev = new Event(`ready:${channelName}`);
                ev.remoteId = rtc.remoteId;
                this.dispatchEvent(ev);
            });
        }
        this.#rtcInst.set(remoteId, rtc);
        eventManager.set("connected", (event) => {
            sig.close();
            if (this.#logger != null) {
                this.#logger.info(`CONNECTED: ${event.remoteId}`);
            }
            console.info(`CONNECTED: ${event.remoteId}`);
            /* event */
            const ev = new Event("connected");
            ev.remoteId = event.remoteId;
            this.dispatchEvent(ev);
        });
        eventManager.set("closed", (event) => {
            this.#rtcInst.delete(event.remoteId);
            if (this.#logger != null) {
                this.#logger.info(`DISCONNECTED: ${event.remoteId}`);
            }
            console.info(`DISCONNECTED: ${event.remoteId}`);
            eventManager.clear();
            eventManager.disconnect();
            /* event */
            const ev = new Event("closed");
            ev.remoteId = event.remoteId;
            this.dispatchEvent(ev);
        });
        eventManager.set("failed", (event) => {
            this.#rtcInst.delete(event.remoteId);
            eventManager.clear();
            eventManager.disconnect();
            /* event */
            const ev = new Event("failed");
            ev.remoteId = event.remoteId;
            this.dispatchEvent(ev);
        });
        eventManager.set("log", (event) => {
            /* event */
            const ev = new Event("log");
            ev.type = event.type;
            ev.message = event.message;
            this.dispatchEvent(ev);
        });
        if (this.#logger != null) {
            this.#logger.info(`RTC MODULE INITIALIZED\nlocal:  ${sig.id}\nremote: ${rtc.remoteId}`);
        }
        console.info(`RTC MODULE INITIALIZED\nlocal:  ${sig.id}\nremote: ${rtc.remoteId}`);
        return rtc;
    }

    async register(name, pass = "", version = 0, data = {}) {
        if (this.#logger != null) {
            this.#logger.info(`REGISTER ROOM: ${name}`);
        }
        console.info(`REGISTER ROOM: ${name}`);
        return await this.#connector.register(name, pass, version, data);
    }

    async unregister() {
        if (this.#logger != null) {
            this.#logger.info("UNREGISTER ROOM");
        }
        console.info("UNREGISTER ROOM");
        return await this.#connector.unregister();
    }

    async connect(name, pass = "", version = 0) {
        if (this.#logger != null) {
            this.#logger.info(`GET HOST UUID: ${name}`);
        }
        console.info(`GET HOST UUID: ${name}`);
        try {
            const sig = new RTCSignalingService(this.#serviceUrl);
            await sig.open();
            const res = await this.#connector.getPeer(sig.id, name, pass, version);
            if (res.success === true) {
                if (this.#logger != null) {
                    this.#logger.info(`CONNECT TO: ${res.id}`);
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
        } catch (err) {
            return {
                success: false,
                error: err
            };
        }
    }

    async cutConnection(remoteId) {
        if (this.#logger != null) {
            this.#logger.info(`CUT CONNECTION: ${remoteId}`);
        }
        console.info(`CUT CONNECTION: ${remoteId}`);
        this.#rtcInst.get(remoteId).close();
        this.#rtcInst.delete(remoteId);
    }

    async disconnect() {
        if (this.#logger != null) {
            this.#logger.info("DISCONNECT");
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
        Array.from(this.#rtcInst.values()).forEach((rtcPeer) => {
            const didSend = rtcPeer.send(channel, msg);
            if (didSend && !this.#channelLogBlacklist.has(channel)) {
                if (this.#logger != null) {
                    this.#logger.info(`SEND ${rtcPeer.name} [${channel}]:`, msg);
                }
                console.info(`SEND ${rtcPeer.name} [${channel}]:`, msg);
            }
        });
    }

    sendOne(channel, remoteId, msg) {
        if (this.#rtcInst.has(remoteId)) {
            const rtcPeer = this.#rtcInst.get(remoteId);
            const didSend = rtcPeer.send(channel, msg);
            if (didSend && !this.#channelLogBlacklist.has(channel)) {
                if (this.#logger != null) {
                    this.#logger.info(`SEND ${rtcPeer.name} [${channel}]:`, msg);
                }
                console.info(`SEND ${rtcPeer.name} [${channel}]:`, msg);
            }
        }
    }

    sendButOne(channel, remoteId, msg) {
        Array.from(this.#rtcInst.values()).forEach((rtcPeer) => {
            if (rtcPeer.remoteId == remoteId) {
                return;
            }
            const didSend = rtcPeer.send(channel, msg);
            if (didSend && !this.#channelLogBlacklist.has(channel)) {
                if (this.#logger != null) {
                    this.#logger.info(`SEND ${rtcPeer.name} [${channel}]:`, msg);
                }
                console.info(`SEND ${rtcPeer.name} [${channel}]:`, msg);
            }
        });
    }

    renameInstance(remoteId, name) {
        if (this.#rtcInst.has(remoteId)) {
            const rtcPeer = this.#rtcInst.get(remoteId);
            rtcPeer.name = name;
        }
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
