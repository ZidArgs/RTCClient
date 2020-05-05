const RTC = new WeakMap();
const DATA_CHANNELS = new WeakMap();
const REMOTE = new WeakMap();
const SIG_CH = new WeakMap();

const EMPTY_FN = function() {};
const ON_CONNECTED = new WeakMap();
const ON_CLOSED = new WeakMap();
const ON_FAILED = new WeakMap();

// TODO better error messages (include expected/current state)
export default class RTCPeer {

    constructor(sigCh, remote, config = {}) {
        REMOTE.set(this, remote);
        DATA_CHANNELS.set(this, new Map());
        ON_CONNECTED.set(this, EMPTY_FN);
        ON_CLOSED.set(this, EMPTY_FN);
        ON_FAILED.set(this, EMPTY_FN);
        SIG_CH.set(this, sigCh);
        // create RTC interface
        let rtc = new RTCPeerConnection(config);
        RTC.set(this, rtc);
        rtc.onconnectionstatechange = function(event) {
            console.info(`STATE: "${rtc.connectionState}"`);
            switch(rtc.connectionState) {
                case "connected":
                    ON_CONNECTED.get(this)(remote);
                    break;
                case "failed":
                    console.error(`ERROR: connection to peer "${remote}" unexpectedly terrminated`);
                    rtc.close();
                    break;
                case "disconnected":
                    rtc.close();
                case "closed":
                    DATA_CHANNELS.get(this).forEach(dch => {
                        dch.close();
                    });
                    DATA_CHANNELS.get(this).clear();
                    ON_CLOSED.get(this)();
                    break;
            }
        }.bind(this);
        rtc.onicecandidate = function(event) {
            sigCh.sendICE(remote, event.candidate);
        };
        rtc.oniceconnectionstatechange = function(event) {
            switch(rtc.iceConnectionState) {
                case "failed":
                    ON_FAILED.get(this)();
                    break;
            }
        }.bind(this);
        sigCh.onice = function(sender, candidate) {
            console.info(`ICE - ${sender}:`, candidate);
            if (sender == remote)  {
                if (!!candidate) {
                    rtc.addIceCandidate(candidate);
                } else if(rtc.iceConnectionState == "new") {
                    ON_FAILED.get(this)();
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

    get localID() {
        let sigCh = SIG_CH.get(this);
        return sigCh.UUID;
    }

    get remoteID() {
        return REMOTE.get(this);
    }

    negotiate() {
        let rtc = RTC.get(this);
        if (rtc.connectionState != "new") {
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
        if (rtc.connectionState == "connected") {
            let rtc = RTC.get(this);
            rtc.close();
        } else {
            throw new Error("RTC not connected");
        }
    }

    openChannel(name, id, callback) {
        return new Promise((resolve, reject) => {
            var dch = RTC.get(this).createDataChannel(name, {negotiated: true, id: id});
            dch.onopen = function(event) {
                DATA_CHANNELS.get(this).set(name, dch);
                resolve();
            }.bind(this);
            dch.onclose = function(event) {
                DATA_CHANNELS.get(this).delete(name);
            }.bind(this);
            dch.onmessage = function(event) {
                callback(name, JSON.parse(event.data));
            }.bind(this);
        });
    }

    send(name, msg) {
        if (DATA_CHANNELS.get(this).has(name)) {
            DATA_CHANNELS.get(this).get(name).send(JSON.stringify(msg));
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

}