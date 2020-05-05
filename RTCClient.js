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
        RTC_INST.set(this, new Map);
        MASTER_KEY.set(this, btoa(crypto.getRandomValues(new Uint8Array(16)).join("")));
        // create lobby endpoint
        let lobby = new Lobby(url, async function(uuid) {
            console.info(`REQUESTED CONNECTION: ${uuid}`);
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
        console.info(`SIGNALING STARTED: ${sig.UUID}`);
        let rtc = new RTCPeer(sig, uuid, config);
        for (let id in channels) {
            let channel_name = channels[id];
            rtc.openChannel(channel_name, id + 1, function(channel, msg) {
                console.info(`${rtc.remote} [${channel}]: ${JSON.stringify(msg)}`);
                if (messageHandler.has(channel)) {
                    for (let callback of messageHandler.get(channel)) {
                        callback(msg);
                    }
                }
            }.bind(this)).then(function() {
                console.info(`CHANNEL OPEN: ${channel_name}`);
            });
        }
        RTC_INST.get(this).set(uuid, rtc);
        rtc.onconnected = function() {
            sig.close();
            ON_CONNECT.get(this)(rtc.remote);
            console.info(`CONNECTED: ${rtc.remote}`);
        }.bind(this);
        rtc.ondisconnected = function() {
            RTC_INST.get(this).delete(rtc.remote);
            ON_DISCONNECT.get(this)(rtc.remote);
            console.info(`DISCONNECTED: ${rtc.remote}`);
        }.bind(this);
        console.info(`RTC MODULE INITIALIZED: ${rtc.remote} - ${sig.UUID}`);
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
            let rtc = this.createPeer(sig, res.uuid);
            rtc.negotiate();
        }
        return {success: res.success};
    }

    async cut(key) {
        console.info(`CUT: ${key}`);
        RTC_INST.get(this).get(key).close();
    }

    async disconnect() {
        console.info("DISCONNECT");
        RTC_INST.get(this).forEach(function(rtc) {
            rtc.close();
        });
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
            if (rtc.remote == uuid) return;
            rtc.send(channel, msg);
        });
    }

    addMessageHandler(channel, callback) {
        let messageHandler = MESSAGE_HANDLER.get(this);
        if (!messageHandler.has(channel)) {
            let handlerSet = new Set;
            handlerSet.add(callback);
            messageHandler.set(channel, handlerSet);
        } else {
            messageHandler.get(channel).add(callback);
        }
    }

    removeMessageHandler(channel, callback) {
        let messageHandler = MESSAGE_HANDLER.get(this);
        if (messageHandler.has(channel)) {
            messageHandler.get(channel).delete(callback);
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

}

export default RTCClient;