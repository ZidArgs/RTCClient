const RTC = new WeakMap();
const DATA_CHANNELS = new WeakMap();
const REMOTE = new WeakMap();
const SIG_CH = new WeakMap();

const EMPTY_FN = function() {};
const ON_CONNECTED = new WeakMap();
const ON_CLOSED = new WeakMap();
const ON_FAILED = new WeakMap();
const ON_STREAM = new WeakMap();

// TODO better error messages (include expected/current state)
export default class RTCPeer extends EventTarget {

    constructor(sigCh, remote, config = {}) {
        super();
        REMOTE.set(this, remote);
        let dataChannels = new Map();
        DATA_CHANNELS.set(this, dataChannels);
        ON_CONNECTED.set(this, EMPTY_FN);
        ON_CLOSED.set(this, EMPTY_FN);
        ON_FAILED.set(this, EMPTY_FN);
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
            console.info(`STATE - ${remote}: ${rtc.iceConnectionState}`);
            switch(rtc.iceConnectionState) {
                case "failed":
                    //ON_FAILED.get(this)();
                    console.error(`ERROR: connection to peer "${remote}" unexpectedly terrminated`);
                    rtc.close();
                    this.throwEvent("failed");
                    break;
                case "connected":
                    this.throwEvent("connected");
                    break;
                case "disconnected":
                    rtc.close();
                case "closed":
                    dataChannels.forEach(dch => {
                        dch.close();
                    });
                    dataChannels.clear();
                    this.throwEvent("closed");
                    break;
            }
        }.bind(this);
        sigCh.onice = function(sender, candidate) {
            console.info(`ICE - ${sender}:`, candidate);
            if (sender == remote)  {
                if (!!candidate) {
                    rtc.addIceCandidate(candidate);
                } else if(rtc.iceConnectionState == "new") {
                    //ON_FAILED.get(this)();
                    this.throwEvent("noice", {
                        state: rtc.iceConnectionState
                    });
                }
            }
        }.bind(this);
        sigCh.onanswer = function(sender, answer) {
            console.info(`SDP - ${sender}:`, answer);
            if (sender == remote)  {
                rtc.setRemoteDescription(answer);
            }
        };
        sigCh.onoffer = function(sender, offer) {
            console.info(`SDP - ${sender}:`, offer);
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

    /*#*/throwEvent(type, data = {}) {
        let event = new Event(type);
        for (let id in data) {
            event[id] = data[id];
        }
        event.localID = this.localID;
        event.remoteID = this.remoteID;
        this.dispatchEvent(event);
    }

    get localID() {
        let sigCh = SIG_CH.get(this);
        return sigCh.UUID;
    }

    get remoteID() {
        return REMOTE.get(this);
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
        if (rtc.iceConnectionState == "completed") {
            let rtc = RTC.get(this);
            rtc.close();
        } else {
            throw new Error("RTC not connected");
        }
    }

    openChannel(name, id, callback) {
        return new Promise((resolve, reject) => {
            let rtc = RTC.get(this);
            let dataChannels = DATA_CHANNELS.get(this);
            var dch = rtc.createDataChannel(name, {negotiated: true, id: id});
            dch.onopen = function(event) {
                dataChannels.set(name, dch);
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
        let dataChannels = DATA_CHANNELS.get(this);
        if (dataChannels.has(name)) {
            dataChannels.get(name).send(JSON.stringify(msg));
        }
    }

    set onconnected(value) {
        if (typeof value == "function") {
            ON_CONNECTED.set(this, value);
        } else {
            ON_CONNECTED.set(this, EMPTY_FN);
        }
    }

    set onclosed(value) {
        if (typeof value == "function") {
            ON_CLOSED.set(this, value);
        } else {
            ON_CLOSED.set(this, EMPTY_FN);
        }
    }

    set onfailed(value) {
        if (typeof value == "function") {
            ON_FAILED.set(this, value);
        } else {
            ON_FAILED.set(this, EMPTY_FN);
        }
    }

    set onstream(value) {
        if (typeof value == "function") {
            ON_STREAM.set(this, value);
        } else {
            ON_STREAM.delete(this);
        }
    }

}