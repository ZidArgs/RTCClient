import Lobby from "./services/Lobby.js";
import Signaling from "./services/Signaling.js";
import Peer from "./utils/Peer.js";

const SERVICE_URL = new WeakMap();
const LOBBY = new WeakMap();
const SIGNALING = new WeakMap();
const CONFIG = new WeakMap();

const EMPTY_FN = function() {};
const MASTER_KEY = new WeakMap();
const MASTER_NAME = new WeakMap();
const RTC_INST = new WeakMap();
const ON_MESSAGE = new WeakMap();
const ON_CONNECT = new WeakMap();
const ON_DISCONNECT = new WeakMap();

function getPort(value, def) {
    let port = parseInt(value);
    if (isNaN(port)) {
        return def;
    }
    return port;
}

function createPeer(sig, uuid, config, instances, onMessage, onConnect, onDisconnect) {
    console.info(`SIGNALING STARTED: ${sig.UUID}`);
    let rtc = new Peer(sig, uuid, config);
    rtc.openChannel("data", 1, function(name, msg) {
        console.info(`${rtc.remote}: ${JSON.stringify(msg)}`);
        onMessage(rtc.remote, msg);
    });
    instances.set(uuid, rtc);
    rtc.onconnected = function() {
        sig.close();
        onConnect(rtc.remote);
        console.info(`CONNECTED: ${rtc.remote}`);
    };
    rtc.ondisconnected = function() {
        instances.delete(rtc.remote);
        onDisconnect(rtc.remote);
        console.info(`DISCONNECTED: ${rtc.remote}`);
    };
    console.info(`RTC MODULE INITIALIZED: ${rtc.remote} - ${sig.UUID}`);
    return rtc;
}

class RTCClient {

    constructor(port, config = {}) {
        let url = new URL(location);
        url.port = getPort(port, url.port);
        SERVICE_URL.set(this, url);
        CONFIG.set(this, config);
        ON_MESSAGE.set(this, EMPTY_FN);
        ON_CONNECT.set(this, EMPTY_FN);
        ON_DISCONNECT.set(this, EMPTY_FN);
        RTC_INST.set(this, new Map);
        MASTER_KEY.set(this, btoa(crypto.getRandomValues(new Uint8Array(16)).join("")));
        // create lobby endpoint
        let lobby = new Lobby(url, async function(uuid) {
            console.info(`REQUESTED CONNECTION: ${uuid}`);
            let sig = new Signaling(url);
            await sig.open();
            createPeer(sig, uuid, config, RTC_INST.get(this), ON_MESSAGE.get(this), ON_CONNECT.get(this), ON_DISCONNECT.get(this));
            return sig.UUID;
        }.bind(this));
        LOBBY.set(this, lobby);
    }

    async register(name, pass = "", desc = "") {
        let lobby = LOBBY.get(this);
        if (MASTER_NAME.has(this)) return;
        console.info(`REGISTER ROOM: ${name}`);
        return await lobby.register(name, pass, desc);
    }
    
    async unregister() {
        let url = SERVICE_URL.get(this);
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
        let config = CONFIG.get(this);
        let lobby = LOBBY.get(this);
        console.info(`GET HOST UUID: ${name}`);
        let sig = new Signaling(url);
        await sig.open();
        let res = await lobby.getPeer(sig.UUID, name, pass);
        if (res.success === true) {
            console.info(`CONNECT TO: ${res.uuid}`);
            let rtc = createPeer(sig, res.uuid, config, RTC_INST.get(this), ON_MESSAGE.get(this), ON_CONNECT.get(this), ON_DISCONNECT.get(this));
            rtc.open();
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

    send(msg) {
        Array.from(RTC_INST.get(this).values()).forEach(function(rtc) {
            rtc.send("data", msg)
        });
    }

    sendOne(key, msg) {
        RTC_INST.get(this).get(key).send("data", msg);
    }

    sendButOne(key, msg) {
        Array.from(RTC_INST.get(this).values()).forEach(function(rtc) {
            if (rtc.key == key) return;
            rtc.send("data", msg);
        });
    }

    set onmessage(value) {
        if (typeof value == "function") {
            ON_MESSAGE.set(this, value);
        } else {
            ON_MESSAGE.set(this, EMPTY_FN);
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