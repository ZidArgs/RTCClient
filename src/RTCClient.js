import Lobby from "./services/Lobby.js";
import Signaling from "./services/Signaling.js";
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

    #lobby;

    #config;

    #rtcInst = new Map();

    #channels;

    #messageHandler = new Map();

    constructor(port, config = {}, channels = []) {
        super();
        const url = new URL(location);
        url.port = getPort(port, url.port);
        this.#serviceUrl = url;
        this.#config = config;
        this.#channels = channels;
        // create lobby endpoint
        const lobby = new Lobby(url, async (id) => {
            if (LOGGER != null) {
                LOGGER.info(`REQUESTED CONNECTION\nremote: ${id}`);
            }
            console.info(`REQUESTED CONNECTION\nremote: ${id}`);
            const sig = new Signaling(url);
            await sig.open();
            this.#createPeer(sig, id);
            return sig.id;
        });
        this.#lobby = lobby;
    }

    #createPeer(sig, id) {
        if (LOGGER != null) {
            LOGGER.info(`SIGNALING STARTED\nlocal:  ${sig.id}`);
        }
        console.info(`SIGNALING STARTED\nlocal:  ${sig.id}`);
        const rtc = new RTCPeer(sig, id, this.#config);
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
            }).then(function() {
                if (LOGGER != null) {
                    LOGGER.info(`CHANNEL OPEN: ${channelName} @ ${rtc.remoteID}`);
                }
                console.info(`CHANNEL OPEN: ${channelName} @ ${rtc.remoteID}`);
            });
        }
        this.#rtcInst.set(id, rtc);
        rtc.addEventListener("connected", (event) => {
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
        rtc.addEventListener("closed", (event) => {
            this.#rtcInst.delete(event.remoteID);
            if (LOGGER != null) {
                LOGGER.info(`DISCONNECTED: ${event.remoteID}`);
            }
            console.info(`DISCONNECTED: ${event.remoteID}`);
            /* event */
            const ev = new Event("closed");
            ev.remoteID = event.remoteID;
            this.dispatchEvent(ev);
        });
        rtc.addEventListener("failed", (event) => {
            this.#rtcInst.delete(event.remoteID);
            /* event */
            const ev = new Event("failed");
            ev.remoteID = event.remoteID;
            this.dispatchEvent(ev);
        });
        rtc.addEventListener("log", (event) => {
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

    async register(name, pass = "", desc = "", version = 0, data = {}) {
        if (LOGGER != null) {
            LOGGER.info(`REGISTER ROOM: ${name}`);
        }
        console.info(`REGISTER ROOM: ${name}`);
        return await this.#lobby.register(name, pass, desc, version, data);
    }

    async unregister() {
        if (LOGGER != null) {
            LOGGER.info("UNREGISTER ROOM");
        }
        console.info("UNREGISTER ROOM");
        return await this.#lobby.unregister();
    }

    async getInstances() {
        if (LOGGER != null) {
            LOGGER.info("REQUEST INSTANCE LIST");
        }
        console.info("REQUEST INSTANCE LIST");
        return await this.#lobby.getInstances();
    }

    async connect(name, pass = "", version = 0) {
        if (LOGGER != null) {
            LOGGER.info(`GET HOST UUID: ${name}`);
        }
        console.info(`GET HOST UUID: ${name}`);
        const sig = new Signaling(this.#serviceUrl);
        await sig.open();
        const res = await this.#lobby.getPeer(sig.id, name, pass, version);
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

    async cut(key) {
        if (LOGGER != null) {
            LOGGER.info(`CUT: ${key}`);
        }
        console.info(`CUT: ${key}`);
        this.#rtcInst.get(key).close();
        this.#rtcInst.delete(key);
    }

    async disconnect() {
        if (LOGGER != null) {
            LOGGER.info("DISCONNECT");
        }
        console.info("DISCONNECT");
        this.#rtcInst.forEach(function(rtc) {
            rtc.close();
        });
        this.#rtcInst.clear();
    }

    getStats(id) {
        if (this.#rtcInst.has(id)) {
            return this.#rtcInst.get(id).getStats();
        }
        return Promise.reject("rtcpeer not found");
    }

    send(channel, msg) {
        Array.from(this.#rtcInst.values()).forEach(function(rtc) {
            rtc.send(channel, msg);
        });
    }

    sendOne(channel, id, msg) {
        if (this.#rtcInst.has(id)) {
            this.#rtcInst.get(id).send(channel, msg);
        }
    }

    sendButOne(channel, id, msg) {
        Array.from(this.#rtcInst.values()).forEach(function(rtc) {
            if (rtc.remoteID == id) {
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
