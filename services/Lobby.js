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
        let client = new WebSocketClient(ws_url);
        client.onmessage = async function(event) {
            let answer = await onMessage(event.data.body);
            client.send({
                requestID: event.data.requestID,
                body: answer
            });
        };
        CLIENT.set(this, client);
    }

    async register(name, pass = "", desc = "") {
        if (MASTER_NAME.has(this)) {
            return {
                success: false,
                error: "you already registered an instance"
            };
        }
        let url = SERVICE_URL.get(this);
        let client = CLIENT.get(this);
        await client.open();
        MASTER_NAME.set(this, name);
        try {
            let res = await Rest.put(url, {
                pass: pass,
                key: MASTER_KEY.get(this),
                name: name,
                desc: desc,
                id: client.id,
            });
            return res;
        } catch(e) {
            MASTER_NAME.delete(this);
            return {
                success: false,
                error: e
            };
        }
    }
    
    async unregister() {
        let url = SERVICE_URL.get(this);
        let client = CLIENT.get(this);
        try {
            let res = await Rest.delete(`${url}/${MASTER_NAME.get(this)}`, {
                key: MASTER_KEY.get(this)
            });
            if (!!res.success) {
                MASTER_NAME.delete(this);
            }
            return res;
        } catch(e) {
            return {
                success: false,
                error: e
            };
        }
    }
    
    async getInstances() {
        let url = SERVICE_URL.get(this);
        try {
            let res = await Rest.get(url);
            return {
                success: true,
                data: res
            };
        } catch(e) {
            return {
                success: false,
                error: e
            };
        }
    }
    
    async getPeer(id, name, pass = "") {
        let url = SERVICE_URL.get(this);
        try {
            let res = await Rest.get(`${url}/${name}`, {
                id: id,
                pass: pass
            });
            return res;
        } catch(e) {
            return {
                success: false,
                error: e
            };
        }
    }

}