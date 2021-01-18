import MessageBuffer from "./MessageBuffer.js";

const RTC = new WeakMap();
const DATA_CHANNELS = new WeakMap();
const REMOTE = new WeakMap();
const SIG_CH = new WeakMap();
const MESSAGE_BUFFER = new WeakMap();

let LOGGER = null;

// TODO better error messages (include expected/current state)
export default class RTCPeer extends EventTarget {

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
    }

    constructor(sigCh, remote, config = {}) {
        super();
        MESSAGE_BUFFER.set(this, new Map());
        REMOTE.set(this, remote);
        const dataChannels = new Map();
        DATA_CHANNELS.set(this, dataChannels);
        SIG_CH.set(this, sigCh);
        // create RTC interface
        const rtc = new RTCPeerConnection(config);
        RTC.set(this, rtc);
        rtc.addEventListener("track", event => {
            const ev = new Event("stream");
            ev.localID = this.localID;
            ev.remoteID = this.remoteID;
            ev.stream = event.streams[0];
            this.dispatchEvent(ev);
        });
        rtc.addEventListener("icecandidate", event => {
            sigCh.sendICE(remote, event.candidate);
        });
        rtc.addEventListener("iceconnectionstatechange", event => {
            if (LOGGER != null) {
                LOGGER.info(`STATE - ${remote}: ${rtc.iceConnectionState}`);
            }
            console.info(`STATE - ${remote}: ${rtc.iceConnectionState}`);
            switch (rtc.iceConnectionState) {
                case "failed":
                    {
                        if (LOGGER != null) {
                            LOGGER.error(`ERROR: connection to peer "${remote}" unexpectedly terrminated`);
                        }
                        console.error(`ERROR: connection to peer "${remote}" unexpectedly terrminated`);
                        rtc.close();
                        this./*#*/__printStatus();
                        /* event */
                        const ev = new Event("failed");
                        ev.localID = this.localID;
                        ev.remoteID = this.remoteID;
                        this.dispatchEvent(ev);
                    }
                    break;
                case "connected":
                    {
                        this./*#*/__printStatus();
                        /* event */
                        const ev = new Event("connected");
                        ev.localID = this.localID;
                        ev.remoteID = this.remoteID;
                        this.dispatchEvent(ev);
                    }
                    break;
                case "disconnected":
                    {
                        rtc.close();
                        dataChannels.forEach(dch => {
                            dch.close();
                        });
                        dataChannels.clear();
                        this./*#*/__printStatus();
                        /* event */
                        const ev = new Event("closed");
                        ev.localID = this.localID;
                        ev.remoteID = this.remoteID;
                        this.dispatchEvent(ev);
                    }
                    break;
                case "closed":
                    {
                        dataChannels.forEach(dch => {
                            dch.close();
                        });
                        dataChannels.clear();
                        this./*#*/__printStatus();
                        /* event */
                        const ev = new Event("closed");
                        ev.localID = this.localID;
                        ev.remoteID = this.remoteID;
                        this.dispatchEvent(ev);
                    }
                    break;
            }
        });
        sigCh.addEventListener("ice", event => {
            const {sender, body} = event;
            if (sender == remote) {
                if (body != null) {
                    const ice = new RTCIceCandidate(body);
                    console.info(`ICE - ${sender}:`, ice);
                    if (LOGGER != null) {
                        LOGGER.info(`ICE - ${sender}:`, `${ice.foundation}: ${ice.type}/${ice.protocol}`);
                    }
                    rtc.addIceCandidate(ice);
                } else {
                    console.info(`ICE - ${sender}:`, null);
                    if (LOGGER != null) {
                        LOGGER.info(`ICE - ${sender}:`, null);
                    }
                }
            }
        });
        sigCh.addEventListener("answer", event => {
            const {sender, body} = event;
            if (LOGGER != null) {
                LOGGER.info(`SDP [answer] - ${sender}: recieved`);
            }
            console.info(`SDP [answer] - ${sender}:`, body);
            if (sender == remote)  {
                rtc.setRemoteDescription(body);
            }
        });
        sigCh.addEventListener("offer", event => {
            const {sender, body} = event;
            if (LOGGER != null) {
                LOGGER.info(`SDP [offer] - ${sender}: recieved`);
            }
            console.info(`SDP [offer] - ${sender}:`, body);
            if (sender == remote)  {
                rtc.setRemoteDescription(body).then(function() {
                    rtc.createAnswer().then(function(answer) {
                        rtc.setLocalDescription(answer).then(function() {
                            sigCh.sendSDP(remote, answer);
                        });
                    });
                });
            }
        });
    }

    /*#*/__printStatus() {
        const rtc = RTC.get(this);
        const remote = REMOTE.get(this);
        rtc.getStats().then(stats => {
            stats.forEach(report => {
                if (LOGGER != null) {
                    LOGGER.info(`RTC STATUS - ${remote}:`, {
                        type: report.type,
                        state: report.state,
                        label: report.label,
                        networkType: report.networkType,
                        protocol: report.protocol,
                        relayProtocol: report.relayProtocol,
                        candidateType: report.candidateType
                    });
                }
                console.info(`RTC STATUS - ${remote}:`, report);
            });
        });
    }

    get localID() {
        const sigCh = SIG_CH.get(this);
        return sigCh.UUID;
    }

    get remoteID() {
        return REMOTE.get(this);
    }

    getStats() {
        const rtc = RTC.get(this);
        return rtc.getStats();
    }

    negotiate() {
        const rtc = RTC.get(this);
        if (rtc.iceConnectionState != "new") {
            throw new Error("RTC connecting or already connected");
        } else {
            const sigCh = SIG_CH.get(this);
            const remote = REMOTE.get(this);
            rtc.createOffer().then(function(offer) {
                rtc.setLocalDescription(offer).then(function() {
                    sigCh.sendSDP(remote, offer);
                });
            });
        }
    }

    close() {
        const rtc = RTC.get(this);
        if (rtc.iceConnectionState == "new"
        ||  rtc.iceConnectionState == "connected"
        ||  rtc.iceConnectionState == "completed"
        ||  rtc.iceConnectionState == "failed") {
            const rtc = RTC.get(this);
            rtc.close();
        } else {
            throw new Error("RTC not connected");
        }
    }

    openChannel(name, id, callback) {
        return new Promise((resolve, reject) => {
            const messageBuffer = MESSAGE_BUFFER.get(this);
            messageBuffer.set(name, new MessageBuffer());
            const rtc = RTC.get(this);
            const dataChannels = DATA_CHANNELS.get(this);
            var dch = rtc.createDataChannel(name, {negotiated: true, id: id});
            dch.onopen = function(event) {
                dataChannels.set(name, dch);
                messageBuffer.get(name).each(msg => dch.send(msg));
                messageBuffer.delete(name);
                resolve();
            }.bind(this);
            dch.onclose = function(event) {
                dataChannels.delete(name);
            }.bind(this);
            dch.onmessage = function(event) {
                callback(name, JSON.parse(event.data));
            }.bind(this);
        });
    }

    addStream(stream) {
        if (stream instanceof MediaStream) {
            const rtc = RTC.get(this);
            stream.getTracks().forEach(function(track) {
                rtc.addTrack(track, stream);
            });
        } else {
            throw new TypeError("MediaStream expected");
        }
    }

    send(name, msg) {
        const messageBuffer = MESSAGE_BUFFER.get(this);
        const dataChannels = DATA_CHANNELS.get(this);
        if (dataChannels.has(name)) {
            msg = JSON.stringify(msg);
            const dch = dataChannels.get(name);
            if (dch.readyState == "open") {
                dch.send(msg);
            } else if (messageBuffer.has(name)) {
                messageBuffer.get(name).add(msg);
            }
        }
    }

}
