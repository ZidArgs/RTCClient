const TIMEOUT = new WeakMap();
const READY_AWAIT = new WeakMap();
const PING_OUT = 30000;

export default class Lobby {

    constructor(url, onMessage) {
        let ws_url = new URL("/lobby", url);
        ws_url.protocol = ws_url.protocol.replace("http", "ws");
        let client = new WebSocket(ws_url);
        READY_AWAIT.set(this, []);
        client.addEventListener('open', function() {
            clearTimeout(TIMEOUT.get(this));
            TIMEOUT.set(this, setTimeout(()=>client.close(), PING_OUT));
        }.bind(this));
        client.addEventListener('close', function() {
            clearTimeout(TIMEOUT.get(this));
            TIMEOUT.delete(this);
        }.bind(this));
        client.addEventListener('message', async function(event) {
            let msg = JSON.parse(event.data);
            switch(msg.type) {
                case "ping":
                    clearTimeout(TIMEOUT.get(this));
                    TIMEOUT.set(this, setTimeout(()=>client.close(), PING_OUT));
                    client.send(JSON.stringify({
                        type:"pong",
                        time:msg.time
                    }));
                break;
                case "uuid":
                    console.info(`UUID: ${JSON.stringify(msg.uuid || msg.body)}`);
                    this.UUID = msg.uuid || msg.body;
                    READY_AWAIT.get(this).forEach(function(fn) {
                        fn(true);
                    });
                    READY_AWAIT.delete(this);
                break;
                default:
                    let answer = await onMessage(msg.uuid || msg.body);
                    client.send(JSON.stringify({
                        requestID: msg.requestID,
                        uuid: answer,
                        body: answer
                    }));
                break;
            }
        }.bind(this));
    }

    isReady() {
        return new Promise(function(resolve) {
            if (READY_AWAIT.has(this)) {
                READY_AWAIT.get(this).push(resolve);
            } else {
                resolve(true);
            }
        }.bind(this));
    }

}