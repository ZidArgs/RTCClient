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
        let lobby = new Lobby(url, async function(uuid) {
            console.info(`REQUESTED CONNECTION\nremote: ${uuid}`);
            let sig = new Signaling(url);
            await sig.open();
            this.createPeer(sig, uuid);
            return sig.UUID;
        }.bind(this));
        LOBBY.set(this, lobby);
    }

    /*#*/createPeer(sig, uuid) {
        let config = CONFIG.get(this);
        let channels = CHANNELS.get(this);
        let messageHandler = MESSAGE_HANDLER.get(this);
        console.info(`SIGNALING STARTED\nlocal:  ${sig.UUID}`);
        let rtc = new RTCPeer(sig, uuid, config);
        for (let id in channels) {
            let channel_name = channels[id];
            rtc.openChannel(channel_name, id + 1, function(channel, msg) {
                console.info(`${rtc.remoteID} [${channel}]:`, msg);
                if (messageHandler.has(channel)) {
                    messageHandler.get(channel)(rtc.remoteID, msg);
                }
            }.bind(this)).then(function() {
                console.info(`CHANNEL OPEN: ${channel_name} @ ${rtc.remoteID}`);
            });
        }
        RTC_INST.get(this).set(uuid, rtc);
        rtc.onconnected = function() {
            sig.close();
            console.info(`CONNECTED: ${rtc.remoteID}`);
            ON_CONNECT.get(this)(rtc.remoteID);
        }.bind(this);
        rtc.onclosed = function() {
            RTC_INST.get(this).delete(rtc.remoteID);
            console.info(`DISCONNECTED: ${rtc.remoteID}`);
            ON_DISCONNECT.get(this)(rtc.remoteID);
        }.bind(this);
        rtc.onfailed = function() {
            console.info(`ICE FAILED: ${rtc.remoteID}`);
            RTC_INST.get(this).delete(rtc.remoteID);
            ON_FAILED.get(this)(rtc.remoteID);
        }.bind(this);
        console.info(`RTC MODULE INITIALIZED\nlocal:  ${sig.UUID}\nremote: ${rtc.remoteID}`);
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
        let res = await lobby.getPeer(sig.UUID, name, pass);
        if (res.success === true) {
            console.info(`CONNECT TO: ${res.uuid}`);
            this.createPeer(sig, res.uuid).negotiate();
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

    sendOne(channel, uuid, msg) {
        RTC_INST.get(this).get(uuid).send(channel, msg);
    }

    sendButOne(channel, uuid, msg) {
        Array.from(RTC_INST.get(this).values()).forEach(function(rtc) {
            if (rtc.remoteID == uuid) return;
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