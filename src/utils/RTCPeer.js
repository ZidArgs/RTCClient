import EventTargetManager from "./event/EventTargetManager.js";
import MessageBuffer from "./MessageBuffer.js";

let LOGGER = null;

// TODO better error messages (include expected/current state)
export default class RTCPeer extends EventTarget {

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
    }

    #signalingChannel;

    #remote;

    #rtc;

    #dataChannels = new Map();

    #messageBuffer = new Map();

    #rtcEventManager = new EventTargetManager();

    #signalingEventManager = new EventTargetManager();

    constructor(signalingChannel, remote, config = {}) {
        super();
        this.#signalingChannel = signalingChannel;
        this.#signalingEventManager.switchTarget(signalingChannel);
        this.#remote = remote;
        // create RTC interface
        this.#rtc = new RTCPeerConnection(config);
        this.#rtcEventManager.switchTarget(this.#rtc);
        this.#rtcEventManager.set("track", (event) => {
            const ev = new Event("stream");
            ev.localID = this.localID;
            ev.remoteID = this.remoteID;
            ev.stream = event.streams[0];
            this.dispatchEvent(ev);
        });
        this.#rtcEventManager.set("icecandidate", (event) => {
            signalingChannel.sendICE(remote, event.candidate);
        });
        this.#rtcEventManager.set("icecandidateerror", (event) => {
            if (event.errorCode >= 300 && event.errorCode <= 699) {
                // https://www.webrtc-developers.com/oups-i-got-an-ice-error-701/
                // Here this a standardized ICE error
                // Do something...
            } else if (event.errorCode >= 700 && event.errorCode <= 799) {
                // Here, the application perhaps didn't reach the server ?
                // Do something else...
            }
        });
        this.#rtcEventManager.set("iceconnectionstatechange", () => {
            if (LOGGER != null) {
                LOGGER.info(`STATE - ${remote}: ${this.#rtc.iceConnectionState}`);
            }
            console.info(`STATE - ${remote}: ${this.#rtc.iceConnectionState}`);
            switch (this.#rtc.iceConnectionState) {
                case "failed":
                    {
                        if (LOGGER != null) {
                            LOGGER.error(`ERROR: connection to peer "${remote}" unexpectedly terrminated`);
                        }
                        console.error(`ERROR: connection to peer "${remote}" unexpectedly terrminated`);
                        this.#rtc.close();
                        this.#printStatus();
                        /* event */
                        const ev = new Event("failed");
                        ev.localID = this.localID;
                        ev.remoteID = this.remoteID;
                        this.dispatchEvent(ev);
                    }
                    break;
                case "connected":
                    {
                        this.#signalingEventManager.disconnect();
                        this.#printStatus();
                        /* event */
                        const ev = new Event("connected");
                        ev.localID = this.localID;
                        ev.remoteID = this.remoteID;
                        this.dispatchEvent(ev);
                    }
                    break;
                case "disconnected":
                    {
                        this.#rtc.close();
                        this.#cleanup();
                        this.#printStatus();
                        /* event */
                        const ev = new Event("closed");
                        ev.localID = this.localID;
                        ev.remoteID = this.remoteID;
                        this.dispatchEvent(ev);
                    }
                    break;
                case "closed":
                    {
                        this.#cleanup();
                        this.#printStatus();
                        /* event */
                        const ev = new Event("closed");
                        ev.localID = this.localID;
                        ev.remoteID = this.remoteID;
                        this.dispatchEvent(ev);
                    }
                    break;
            }
        });
        this.#signalingEventManager.set("ice", (event) => {
            const {
                sender, body
            } = event;
            if (sender === remote) {
                if (body != null) {
                    const ice = new RTCIceCandidate(body);
                    console.info(`ICE - ${sender}:`, ice);
                    if (LOGGER != null) {
                        LOGGER.info(`ICE - ${sender}:`, `${ice.foundation}: ${ice.type}/${ice.protocol}`);
                    }
                    this.#rtc.addIceCandidate(ice);
                } else {
                    console.info(`ICE - ${sender}:`, null);
                    if (LOGGER != null) {
                        LOGGER.info(`ICE - ${sender}:`, null);
                    }
                }
            }
        });
        this.#signalingEventManager.set("answer", (event) => {
            const {
                sender, body
            } = event;
            if (sender === remote) {
                if (LOGGER != null) {
                    LOGGER.info(`SDP [answer] - ${sender}: recieved`);
                }
                console.info(`SDP [answer] - ${sender}:`, body);
                if (sender == remote)  {
                    this.#rtc.setRemoteDescription(body);
                }
            }
        });
        this.#signalingEventManager.set("offer", (event) => {
            const {
                sender, body
            } = event;
            if (sender == remote)  {
                if (LOGGER != null) {
                    LOGGER.info(`SDP [offer] - ${sender}: recieved`);
                }
                console.info(`SDP [offer] - ${sender}:`, body);
                this.#rtc.setRemoteDescription(body).then(() => {
                    this.#rtc.createAnswer().then((answer) => {
                        this.#rtc.setLocalDescription(answer).then(() => {
                            signalingChannel.sendSDP(remote, answer);
                        });
                    });
                });
            }
        });
    }

    #printStatus() {
        this.#rtc.getStats().then((stats) => {
            stats.forEach((report) => {
                if (LOGGER != null) {
                    LOGGER.info(`RTC STATUS - ${this.#remote}:`, {
                        type: report.type,
                        state: report.state,
                        label: report.label,
                        networkType: report.networkType,
                        protocol: report.protocol,
                        relayProtocol: report.relayProtocol,
                        candidateType: report.candidateType
                    });
                }
                console.info(`RTC STATUS - ${this.#remote}:`, report);
            });
        });
    }

    get localID() {
        return this.#signalingChannel.UUID;
    }

    get remoteID() {
        return this.#remote;
    }

    getStats() {
        return this.#rtc.getStats();
    }

    negotiate() {
        if (this.#rtc.iceConnectionState != "new") {
            throw new Error("RTC connecting or already connected");
        } else {
            this.#rtc.createOffer().then((offer) => {
                this.#rtc.setLocalDescription(offer).then(() => {
                    this.#signalingChannel.sendSDP(this.#remote, offer);
                });
            });
        }
    }

    close() {
        if (
            this.#rtc.iceConnectionState == "new" ||
            this.#rtc.iceConnectionState == "connected" ||
            this.#rtc.iceConnectionState == "completed" ||
            this.#rtc.iceConnectionState == "failed"
        ) {
            this.#rtc.close();
        } else {
            throw new Error("RTC not connected");
        }
    }

    openChannel(name, id, callback) {
        return new Promise((resolve) => {
            this.#messageBuffer.set(name, new MessageBuffer());
            const dch = this.#rtc.createDataChannel(name, {
                negotiated: true,
                id: id
            });
            dch.onopen = () => {
                this.#dataChannels.set(name, dch);
                this.#messageBuffer.get(name).each((msg) => dch.send(msg));
                this.#messageBuffer.delete(name);
                resolve();
            };
            dch.onclose = () => {
                this.#dataChannels.delete(name);
            };
            dch.onmessage = (event) => {
                callback(name, JSON.parse(event.data));
            };
        });
    }

    addStream(stream) {
        if (stream instanceof MediaStream) {
            stream.getTracks().forEach((track) => {
                this.#rtc.addTrack(track, stream);
            });
        } else {
            throw new TypeError("MediaStream expected");
        }
    }

    send(name, msg) {
        if (this.#dataChannels.has(name)) {
            msg = JSON.stringify(msg);
            const dch = this.#dataChannels.get(name);
            if (dch.readyState == "open") {
                dch.send(msg);
                return true;
            } else if (this.#messageBuffer.has(name)) {
                this.#messageBuffer.get(name).add(msg);
                return true;
            }
        }
        return false;
    }

    #cleanup() {
        this.#dataChannels.forEach((dch) => {
            dch.close();
        });
        this.#dataChannels.clear();
        this.#rtcEventManager.disconnect();
        this.#signalingEventManager.disconnect();
    }

}
