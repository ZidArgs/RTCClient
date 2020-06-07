import MessageBuffer from "./MessageBuffer.js";

const RTC = new WeakMap();
const DATA_CHANNELS = new WeakMap();
const REMOTE = new WeakMap();
const SIG_CH = new WeakMap();
const MESSAGE_BUFFER = new WeakMap();

const EMPTY_FN = function() {};
const EVENT_FN = new WeakMap();

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
        let dataChannels = new Map();
        DATA_CHANNELS.set(this, dataChannels);
        EVENT_FN.set(this, {
            connected: EMPTY_FN,
            closed: EMPTY_FN,
            failed: EMPTY_FN,
            stream: EMPTY_FN
        });
        SIG_CH.set(this, sigCh);
        // create RTC interface
        let rtc = new RTCPeerConnection(config);
        RTC.set(this, rtc);
        rtc.ontrack = function(event) {
            this.throwEvent("stream", {
                stream: event.streams[0]
            });
        };
        rtc.onicecandidate = function(event) {
            sigCh.sendICE(remote, event.candidate);
        };
        rtc.oniceconnectionstatechange = function(event) {
            if (LOGGER != null) {
                LOGGER.info(`STATE - ${remote}: ${rtc.iceConnectionState}`);
            }
            console.info(`STATE - ${remote}: ${rtc.iceConnectionState}`);
            switch(rtc.iceConnectionState) {
                case "failed":
                    if (LOGGER != null) {
                        LOGGER.error(`ERROR: connection to peer "${remote}" unexpectedly terrminated`);
                    }
                    console.error(`ERROR: connection to peer "${remote}" unexpectedly terrminated`);
                    rtc.close();
                    this.printStatus();
                    this.throwEvent("failed");
                    break;
                case "connected":
                    this.printStatus();
                    this.throwEvent("connected");
                    break;
                case "disconnected":
                    rtc.close();
                case "closed":
                    dataChannels.forEach(dch => {
                        dch.close();
                    });
                    dataChannels.clear();
                    this.printStatus();
                    this.throwEvent("closed");
                    break;
            }
        }.bind(this);
        sigCh.onice = function(sender, candidate) {
            if (sender == remote) {
                if (candidate != null) {
                    let ice = new RTCIceCandidate(candidate);
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
        }.bind(this);
        sigCh.onanswer = function(sender, answer) {
            if (LOGGER != null) {
                LOGGER.info(`SDP [answer] - ${sender}: recieved`);
            }
            console.info(`SDP [answer] - ${sender}:`, answer);
            if (sender == remote)  {
                rtc.setRemoteDescription(answer);
            }
        };
        sigCh.onoffer = function(sender, offer) {
            if (LOGGER != null) {
                LOGGER.info(`SDP [offer] - ${sender}: recieved`);
            }
            console.info(`SDP [offer] - ${sender}:`, offer);
            if (sender == remote)  {
                rtc.setRemoteDescription(offer).then(function() {
                    rtc.createAnswer().then(function(answer) {
                        rtc.setLocalDescription(answer).then(function() {
                            sigCh.sendSDP(remote, answer);
                        });
                    });
                });
            }
        }.bind(this);
    }

    /*#*/printStatus() {
        let rtc = RTC.get(this);
        let remote = REMOTE.get(this);
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

    /*#*/throwEvent(type, data = {}) {
        let eventFn = EVENT_FN.get(this);
        let event = new Event(type);
        for (let id in data) {
            event[id] = data[id];
        }
        event.localID = this.localID;
        event.remoteID = this.remoteID;
        eventFn[type](event);
        this.dispatchEvent(event);
    }

    get localID() {
        let sigCh = SIG_CH.get(this);
        return sigCh.UUID;
    }

    get remoteID() {
        return REMOTE.get(this);
    }

    getStats() {
        let rtc = RTC.get(this);
        return rtc.getStats();
    }

    negotiate() {
        let rtc = RTC.get(this);
        if (rtc.iceConnectionState != "new") {
            throw new Error("RTC connecting or already connected");
        } else {
            let sigCh = SIG_CH.get(this);
            let remote = REMOTE.get(this);
            rtc.createOffer().then(function(offer) {
                rtc.setLocalDescription(offer).then(function() {
                    sigCh.sendSDP(remote, offer);
                });
            });
        }
    }

    close() {
        let rtc = RTC.get(this);
        if (rtc.iceConnectionState == "new"
        ||  rtc.iceConnectionState == "connected"
        ||  rtc.iceConnectionState == "completed"
        ||  rtc.iceConnectionState == "failed") {
            let rtc = RTC.get(this);
            rtc.close();
        } else {
            throw new Error("RTC not connected");
        }
    }

    openChannel(name, id, callback) {
        return new Promise((resolve, reject) => {
            let messageBuffer = MESSAGE_BUFFER.get(this);
            messageBuffer.set(name, new MessageBuffer());
            let rtc = RTC.get(this);
            let dataChannels = DATA_CHANNELS.get(this);
            var dch = rtc.createDataChannel(name, {negotiated: true, id: id});
            dch.onopen = function(event) {
                dataChannels.set(name, dch);
                messageBuffer.get(name).forEach(msg => dch.send(msg));
                messageBuffer.remove(name);
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
            let rtc = RTC.get(this);
            stream.getTracks().forEach(function(track) {
                rtc.addTrack(track, stream);
            });
        } else {
            throw new TypeError("MediaStream expected");
        }
    }

    send(name, msg) {
        let messageBuffer = MESSAGE_BUFFER.get(this);
        let dataChannels = DATA_CHANNELS.get(this);
        if (dataChannels.has(name)) {
            msg = JSON.stringify(msg);
            let dch = dataChannels.get(name);
            if (dch.readyState == "open") {
                dch.send(msg);
            } else if (messageBuffer.has(name)) {
                messageBuffer.get(name).add(msg);
            }
        }
    }

    set onconnected(value) {
        let eventFn = EVENT_FN.get(this);
        if (typeof value == "function") {
            eventFn.connected = value;
        } else {
            eventFn.connected = EMPTY_FN;
        }
    }

    set onclosed(value) {
        if (typeof value == "function") {
            eventFn.closed = value;
        } else {
            eventFn.closed = EMPTY_FN;
        }
    }

    set onfailed(value) {
        if (typeof value == "function") {
            eventFn.failed = value;
        } else {
            eventFn.failed = EMPTY_FN;
        }
    }

    set onstream(value) {
        if (typeof value == "function") {
            eventFn.stream = value;
        } else {
            eventFn.stream = EMPTY_FN;
        }
    }

}