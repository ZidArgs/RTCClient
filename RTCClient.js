import Lobby from "./services/Lobby.js";
import Signaling from "./services/Signaling.js";
import Client from "./utils/Client.js";
import Host from "./utils/Host.js";
import Rest from "./utils/Rest.js";

const URL = `${window.location.protocol}//${window.location.hostname}`;
const PORT = new WeakMap();

function getPort(value) {
    let port = parseInt(value);
    if (isNaN(port)) {
        return window.location.port;
    }
    return port;
}

const EMPTY_FN = function() {};
const MASTER_KEY = new WeakMap();
const MASTER_NAME = new WeakMap();
const RTC_INST = new WeakMap();
const ON_MESSAGE = new WeakMap();
const ON_CONNECT = new WeakMap();
const ON_DISCONNECT = new WeakMap();

class RTCClient {

    constructor(port) {
        PORT.set(this, getPort(port));
        ON_MESSAGE.set(this, EMPTY_FN);
        ON_CONNECT.set(this, EMPTY_FN);
        ON_DISCONNECT.set(this, EMPTY_FN);
        RTC_INST.set(this, new Map);
        MASTER_KEY.set(this, btoa(crypto.getRandomValues(new Uint8Array(16)).join("")));
    }

    async register(name, pass = "", desc = "") {
        console.info(`REGISTER ROOM: ${name}`);
        if (MASTER_NAME.has(this)) return;
        MASTER_NAME.set(this, name);
        let client = new Lobby(PORT.get(this), async function(uuid) {
            console.info(`REQUESTED CONNECTION: ${uuid}`);
            let sig = new Signaling(PORT.get(this));
            await sig.isReady();
            console.info(`SIGNALING STARTED: ${sig.UUID}`);
            let rtc = new Host(sig, uuid);
            rtc.onmessage = function(msg) {
                console.info(`${rtc.reciever}: ${JSON.stringify(msg)}`);
                ON_MESSAGE.get(this)(rtc.reciever, msg);
            }.bind(this);
            RTC_INST.get(this).set(uuid, rtc);
            rtc.onconnected = function() {
                sig.close();
                ON_CONNECT.get(this)(rtc.reciever);
                console.info(`CONNECTED: ${rtc.reciever}`);
            }.bind(this);
            rtc.ondisconnected = function() {
                RTC_INST.get(this).delete(rtc.reciever);
                ON_DISCONNECT.get(this)(rtc.reciever);
                console.info(`DISCONNECTED: ${rtc.reciever}`);
            }.bind(this);
            console.info(`RTC MODULE INITIALIZED: ${rtc.reciever} - ${sig.UUID}`);
            return sig.UUID;
        }.bind(this));
        await client.isReady();
        let res = await Rest.post(`${URL}:${PORT.get(this)}/lobby`, {
            action: "register",
            pass: MASTER_KEY.get(this)
        }, {
            pass: pass,
            name: name,
            desc: desc,
            uuid: client.UUID,
        });
        return await res.json();
    }
    
    async unregister() {
        console.info("UNREGISTER ROOM");
        let res = await Rest.get(`${URL}:${PORT.get(this)}/lobby`, {
            action: "unregister",
            name: MASTER_NAME.get(this),
            pass: MASTER_KEY.get(this)
        });
        res = await res.json();
        if (res.success === true) {
            MASTER_NAME.delete(this);
        }
        return res;
    }
    
    async connect(name, pass = "") {
        console.info(`GET HOST UUID: ${name}`);
        let sig = new Signaling(PORT.get(this));
        await sig.isReady();
        console.info(`SIGNALING STARTED: ${sig.UUID}`);
        let res = await Rest.post(`${URL}:${PORT.get(this)}/lobby`, {
            action: "resolve",
            name: name,
            pass: pass
        }, {
            uuid: sig.UUID
        });
        res = await res.json();
        if (res.success === true) {
            console.info(`CONNECT TO: ${res.uuid}`);
            let rtc = new Client(sig, res.uuid);
            rtc.onmessage = function(msg) {
                console.info(`${rtc.reciever}: ${JSON.stringify(msg)}`);
                ON_MESSAGE.get(this)(rtc.reciever, msg);
            }.bind(this);
            rtc.onconnected = function() {
                sig.close();
                ON_CONNECT.get(this)(rtc.reciever);
                console.info(`CONNECTED: ${rtc.reciever}`);
            }.bind(this);
            rtc.ondisconnected = function() {
                RTC_INST.get(this).delete(rtc.reciever);
                ON_DISCONNECT.get(this)(rtc.reciever);
                console.info(`DISCONNECTED: ${rtc.reciever}`);
            }.bind(this);
            RTC_INST.get(this).set(res.reciever, rtc);
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
    
    async getInstances() {
        console.info("REFRESH INSTANCES");
        let res = await Rest.get(`${URL}:${PORT.get(this)}/lobby`);
        return await res.json();
    }

    send(msg) {
        Array.from(RTC_INST.get(this).values()).forEach(function(rtc) {
            rtc.send(msg)
        });
    }

    sendOne(key, msg) {
        RTC_INST.get(this).get(key).send(msg);
    }

    sendButOne(key, msg) {
        Array.from(RTC_INST.get(this).values()).forEach(function(rtc) {
            if (rtc.key == key) return;
            rtc.send(msg);
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