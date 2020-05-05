import Rest from "../utils/Rest.js";
import WebSocketClient from "../utils/WebSocketClient.js";

const SERVICE_URL = new WeakMap();
const CLIENT = new WeakMap();
const MASTER_KEY = new WeakMap();
const MASTER_NAME = new WeakMap();

export default class Lobby {

    constructor(url, onMessage) {
        let service_url = new URL("/lobby", url);
        SERVICE_URL.set(this, service_url);
        MASTER_KEY.set(this, btoa(crypto.getRandomValues(new Uint8Array(16)).join("")));
        // create websocket
        let ws_url = new URL(service_url);
        ws_url.protocol = ws_url.protocol.replace("http", "ws");
        let client = new WebSocketClient(ws_url, async function(data) {
            let answer = await onMessage(data.body);
            client.send({
                requestID: data.requestID,
                body: answer
            });
        });
        CLIENT.set(this, client);
    }

    async register(name, pass = "", desc = "") {
        if (MASTER_NAME.has(this)) return;
        let url = SERVICE_URL.get(this);
        let client = CLIENT.get(this);
        await client.open();
        MASTER_NAME.set(this, name);
        try {
            return await Rest.post(url, {
                action: "register",
                pass: MASTER_KEY.get(this)
            }, {
                pass: pass,
                name: name,
                desc: desc,
                uuid: client.UUID,
            });
        } catch(e) {
            MASTER_NAME.delete(this);
            return {success: false, error: e};
        }
    }
    
    async unregister() {
        let url = SERVICE_URL.get(this);
        let client = CLIENT.get(this);
        try {
            let res = await Rest.get(url, {
                action: "unregister",
                name: MASTER_NAME.get(this),
                pass: MASTER_KEY.get(this)
            });
            if (res.success === true) {
                MASTER_NAME.delete(this);
            }
            client.close();
            return res;
        } catch(e) {
            return {success: false, error: e};
        }
    }
    
    async getInstances() {
        let url = SERVICE_URL.get(this);
        try {
            return await Rest.get(url);
        } catch(e) {
            return {success: false, error: e};
        }
    }
    
    async getPeer(uuid, name, pass = "") {
        let url = SERVICE_URL.get(this);
        try {
            return await Rest.post(url, {
                action: "resolve",
                name: name,
                pass: pass
            }, {
                uuid: uuid
            });
        } catch(e) {
            return {success: false, error: e};
        }
    }

}