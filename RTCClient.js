import Lobby from "./services/Lobby.js";
import Signaling from "./services/Signaling.js";
import RTCPeer from "./utils/RTCPeer.js";

const SERVICE_URL = new WeakMap();
const LOBBY = new WeakMap();
const CONFIG = new WeakMap();
const RTC_INST = new WeakMap();
const CHANNELS = new WeakMap();
const MESSAGE_HANDLER = new WeakMap();

const EMPTY_FN = function() {};
const MASTER_KEY = new WeakMap();
const MASTER_NAME = new WeakMap();
const ON_CONNECT = new WeakMap();
const ON_DISCONNECT = new WeakMap();
const ON_FAILED = new WeakMap();

function getPort(value, def) {
    let port = parseInt(value);
    if (isNaN(port)) {
        return def;
    }
    return port;
}

class RTCClient {

    constructor(port, config = {}, channels = []) {
        let url = new URL(location);
        url.port = getPort(port, url.port);
        SERVICE_URL.set(this, url);
        MESSAGE_HANDLER.set(this, new Map());
        CONFIG.set(this, config);
        CHANNELS.set(this, channels);
        ON_CONNECT.set(this, EMPTY_FN);
        ON_DISCONNECT.set(this, EMPTY_FN);
        ON_FAILED.set(this, EMPTY_FN);
        RTC_INST.set(this, new Map());
        MASTER_KEY.set(this, btoa(crypto.getRandomValues(new Uint8Array(16)).join("")));
        // create lobby endpoint
        let lobby = new Lobby(url, async function(id) {
            console.info(`REQUESTED CONNECTION\nremote: ${id}`);
            let sig = new Signaling(url);
            await sig.open();
            this.createPeer(sig, id);
            return sig.id;
        }.bind(this));
        LOBBY.set(this, lobby);
    }

    /*#*/createPeer(sig, id) {
        let config = CONFIG.get(this);
        let channels = CHANNELS.get(this);
        let messageHandler = MESSAGE_HANDLER.get(this);
        console.info(`SIGNALING STARTED\nlocal:  ${sig.id}`);
        let rtc = new RTCPeer(sig, id, config);
        for (let chId in channels) {
            let channel_name = channels[chId];
            rtc.openChannel(channel_name, chId + 1, function(channel, msg) {
                console.info(`${rtc.remoteID} [${channel}]:`, msg);
                if (messageHandler.has(channel)) {
                    messageHandler.get(channel)(rtc.remoteID, msg);
                }
            }.bind(this)).then(function() {
                console.info(`CHANNEL OPEN: ${channel_name} @ ${rtc.remoteID}`);
            });
        }
        RTC_INST.get(this).set(id, rtc);
        rtc.addEventListener("connected", function(event) {
            sig.close();
            console.info(`CONNECTED: ${event.remoteID}`);
            ON_CONNECT.get(this)(event.remoteID);
        }.bind(this));
        rtc.addEventListener("closed", function(event) {
            RTC_INST.get(this).delete(event.remoteID);
            console.info(`DISCONNECTED: ${event.remoteID}`);
            ON_DISCONNECT.get(this)(event.remoteID);
        }.bind(this));
        rtc.addEventListener("failed", function(event) {
            RTC_INST.get(this).delete(event.remoteID);
            ON_FAILED.get(this)(event.remoteID);
        }.bind(this));
        console.info(`RTC MODULE INITIALIZED\nlocal:  ${sig.id}\nremote: ${rtc.remoteID}`);
        return rtc;
    }

    async register(name, pass = "", desc = "") {
        let lobby = LOBBY.get(this);
        if (MASTER_NAME.has(this)) return;
        console.info(`REGISTER ROOM: ${name}`);
        return await lobby.register(name, pass, desc);
    }
    
    async unregister() {
        let lobby = LOBBY.get(this);
        console.info("UNREGISTER ROOM");
        return await lobby.unregister();
    }
    
    async getInstances() {
        console.info("REQUEST INSTANCE LIST");
        let lobby = LOBBY.get(this);
        return await lobby.getInstances();
    }
    
    async connect(name, pass = "") {
        let url = SERVICE_URL.get(this);
        let lobby = LOBBY.get(this);
        console.info(`GET HOST UUID: ${name}`);
        let sig = new Signaling(url);
        await sig.open();
        let res = await lobby.getPeer(sig.id, name, pass);
        if (res.success === true) {
            console.info(`CONNECT TO: ${res.id}`);
            this.createPeer(sig, res.id).negotiate();
        }
        return {success: res.success};
    }

    async cut(key) {
        console.info(`CUT: ${key}`);
        RTC_INST.get(this).get(key).close();
        RTC_INST.get(this).delete(key);
    }

    async disconnect() {
        console.info("DISCONNECT");
        RTC_INST.get(this).forEach(function(rtc) {
            rtc.close();
        });
        RTC_INST.get(this).clear();
    }

    send(channel, msg) {
        Array.from(RTC_INST.get(this).values()).forEach(function(rtc) {
            rtc.send(channel, msg)
        });
    }

    sendOne(channel, id, msg) {
        RTC_INST.get(this).get(id).send(channel, msg);
    }

    sendButOne(channel, id, msg) {
        Array.from(RTC_INST.get(this).values()).forEach(function(rtc) {
            if (rtc.remoteID == id) return;
            rtc.send(channel, msg);
        });
    }

    setMessageHandler(channel, callback) {
        let messageHandler = MESSAGE_HANDLER.get(this);
        if (typeof callback == "function") {
            messageHandler.set(channel, callback);
        } else {
            messageHandler.delete(channel);
        }
    }

    set onconnect(value) {
        if (typeof value == "function") {
            ON_CONNECT.set(this, value);
        } else {
            ON_CONNECT.set(this, EMPTY_FN);
        }
    }

    set ondisconnect(value) {
        if (typeof value == "function") {
            ON_DISCONNECT.set(this, value);
        } else {
            ON_DISCONNECT.set(this, EMPTY_FN);
        }
    }

    set onfailed(value) {
        if (typeof value == "function") {
            ON_FAILED.set(this, value);
        } else {
            ON_FAILED.set(this, EMPTY_FN);
        }
    }

}

export default RTCClient;