import Lobby from "./services/Lobby.js";
import Signaling from "./services/Signaling.js";
import RTCPeer from "./utils/RTCPeer.js";

const SERVICE_URL = new WeakMap();
const LOBBY = new WeakMap();
const CONFIG = new WeakMap();
const RTC_INST = new WeakMap();
const CHANNELS = new WeakMap();
const MESSAGE_HANDLER = new WeakMap();

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
        if (value == null
        || typeof value.log != "function"
        || typeof value.info != "function"
        || typeof value.warn != "function"
        || typeof value.error != "function") {
            LOGGER = null;
        } else {
            LOGGER = value;
        }
        RTCPeer.setLogger(LOGGER);
    }

    constructor(port, config = {}, channels = []) {
        super();
        const url = new URL(location);
        url.port = getPort(port, url.port);
        SERVICE_URL.set(this, url);
        MESSAGE_HANDLER.set(this, new Map());
        CONFIG.set(this, config);
        CHANNELS.set(this, channels);
        RTC_INST.set(this, new Map());
        // create lobby endpoint
        const lobby = new Lobby(url, async id => {
            if (LOGGER != null) {
                LOGGER.info(`REQUESTED CONNECTION\nremote: ${id}`);
            }
            console.info(`REQUESTED CONNECTION\nremote: ${id}`);
            const sig = new Signaling(url);
            await sig.open();
            this.#createPeer(sig, id);
            return sig.id;
        });
        LOBBY.set(this, lobby);
    }

    #createPeer(sig, id) {
        const config = CONFIG.get(this);
        const channels = CHANNELS.get(this);
        const messageHandler = MESSAGE_HANDLER.get(this);
        if (LOGGER != null) {
            LOGGER.info(`SIGNALING STARTED\nlocal:  ${sig.id}`);
        }
        console.info(`SIGNALING STARTED\nlocal:  ${sig.id}`);
        const rtc = new RTCPeer(sig, id, config);
        for (const chId in channels) {
            const channel_name = channels[chId];
            rtc.openChannel(channel_name, chId + 1, function(channel, msg) {
                if (LOGGER != null) {
                    LOGGER.info(`${rtc.remoteID} [${channel}]:`, msg);
                }
                console.info(`${rtc.remoteID} [${channel}]:`, msg);
                if (messageHandler.has(channel)) {
                    messageHandler.get(channel)(rtc.remoteID, msg);
                }
            }.bind(this)).then(function() {
                if (LOGGER != null) {
                    LOGGER.info(`CHANNEL OPEN: ${channel_name} @ ${rtc.remoteID}`);
                }
                console.info(`CHANNEL OPEN: ${channel_name} @ ${rtc.remoteID}`);
            });
        }
        RTC_INST.get(this).set(id, rtc);
        rtc.addEventListener("connected", function(event) {
            sig.close();
            if (LOGGER != null) {
                LOGGER.info(`CONNECTED: ${event.remoteID}`);
            }
            console.info(`CONNECTED: ${event.remoteID}`);
            /* event */
            const ev = new Event("connected");
            ev.remoteID = event.remoteID;
            this.dispatchEvent(ev);
        }.bind(this));
        rtc.addEventListener("closed", function(event) {
            RTC_INST.get(this).delete(event.remoteID);
            if (LOGGER != null) {
                LOGGER.info(`DISCONNECTED: ${event.remoteID}`);
            }
            console.info(`DISCONNECTED: ${event.remoteID}`);
            /* event */
            const ev = new Event("closed");
            ev.remoteID = event.remoteID;
            this.dispatchEvent(ev);
        }.bind(this));
        rtc.addEventListener("failed", function(event) {
            RTC_INST.get(this).delete(event.remoteID);
            /* event */
            const ev = new Event("failed");
            ev.remoteID = event.remoteID;
            this.dispatchEvent(ev);
        }.bind(this));
        rtc.addEventListener("log", function(event) {
            /* event */
            const ev = new Event("log");
            ev.type = event.type;
            ev.message = event.message;
            this.dispatchEvent(ev);
        }.bind(this));
        if (LOGGER != null) {
            LOGGER.info(`RTC MODULE INITIALIZED\nlocal:  ${sig.id}\nremote: ${rtc.remoteID}`);
        }
        console.info(`RTC MODULE INITIALIZED\nlocal:  ${sig.id}\nremote: ${rtc.remoteID}`);
        return rtc;
    }

    async register(name, pass = "", desc = "", version = 0, data = {}) {
        const lobby = LOBBY.get(this);
        if (LOGGER != null) {
            LOGGER.info(`REGISTER ROOM: ${name}`);
        }
        console.info(`REGISTER ROOM: ${name}`);
        return await lobby.register(name, pass, desc, version, data);
    }

    async unregister() {
        const lobby = LOBBY.get(this);
        if (LOGGER != null) {
            LOGGER.info("UNREGISTER ROOM");
        }
        console.info("UNREGISTER ROOM");
        return await lobby.unregister();
    }

    async getInstances() {
        if (LOGGER != null) {
            LOGGER.info("REQUEST INSTANCE LIST");
        }
        console.info("REQUEST INSTANCE LIST");
        const lobby = LOBBY.get(this);
        return await lobby.getInstances();
    }

    async connect(name, pass = "", version = 0) {
        const url = SERVICE_URL.get(this);
        const lobby = LOBBY.get(this);
        if (LOGGER != null) {
            LOGGER.info(`GET HOST UUID: ${name}`);
        }
        console.info(`GET HOST UUID: ${name}`);
        const sig = new Signaling(url);
        await sig.open();
        const res = await lobby.getPeer(sig.id, name, pass, version);
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
        RTC_INST.get(this).get(key).close();
        RTC_INST.get(this).delete(key);
    }

    async disconnect() {
        if (LOGGER != null) {
            LOGGER.info("DISCONNECT");
        }
        console.info("DISCONNECT");
        RTC_INST.get(this).forEach(function(rtc) {
            rtc.close();
        });
        RTC_INST.get(this).clear();
    }

    getStats(id) {
        const target = RTC_INST.get(this).get(id);
        if (target != null) {
            return target.getStats();
        } else {
            return Promise.reject("rtcpeer not found");
        }
    }

    send(channel, msg) {
        Array.from(RTC_INST.get(this).values()).forEach(function(rtc) {
            rtc.send(channel, msg)
        });
    }

    sendOne(channel, id, msg) {
        const target = RTC_INST.get(this).get(id);
        if (target != null) {
            target.send(channel, msg);
        }
    }

    sendButOne(channel, id, msg) {
        Array.from(RTC_INST.get(this).values()).forEach(function(rtc) {
            if (rtc.remoteID == id) {
                return;
            }
            rtc.send(channel, msg);
        });
    }

    setMessageHandler(channel, callback) {
        const messageHandler = MESSAGE_HANDLER.get(this);
        if (typeof callback == "function") {
            messageHandler.set(channel, callback);
        } else {
            messageHandler.delete(channel);
        }
    }

}

export default RTCClient;
