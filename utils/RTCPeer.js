const RTC = new WeakMap();
const DATA_CHANNELS = new WeakMap();
const REMOTE = new WeakMap();
const SIG_CH = new WeakMap();

const RTC_STATE = new WeakMap();

const EMPTY_FN = function() {};
const ON_CONNECTED = new WeakMap();
const ON_CLOSED = new WeakMap();
const ON_TERMINATED = new WeakMap();

// TODO better error messages (include expected/current state)
export default class RTCPeer {

    constructor(sigCh, remote, config = {}) {
        REMOTE.set(this, remote);
        DATA_CHANNELS.set(this, new Map());
        ON_CONNECTED.set(this, EMPTY_FN);
        ON_CLOSED.set(this, EMPTY_FN);
        ON_TERMINATED.set(this, EMPTY_FN);
        RTC_STATE.set(this, "new");
        SIG_CH.set(this, sigCh);
        // create RTC interface
        let rtc = new RTCPeerConnection(config);
        RTC.set(this, rtc);
        rtc.onconnectionstatechange = function (event) {
            console.info(`STATE: "${rtc.connectionState}"`);
            switch(rtc.connectionState) {
                case "connected":
                    RTC_STATE.set(this, "open");
                    ON_CONNECTED.get(this)(remote);
                    break;
                case "disconnected":
                case "failed":
                    RTC_STATE.set(this, "error");
                    console.error(`ERROR: connection to peer "${remote}" unexpectedly terrminated`);
                    ON_TERMINATED.get(this)(remote);
                    break;
                case "closed":
                    RTC_STATE.set(this, "closed");
                    ON_CLOSED.get(this)();
                    DATA_CHANNELS.get(this).forEach(dch => {
                        dch.close();
                    });
                    DATA_CHANNELS.get(this).clear();
                    break;
            }
        }.bind(this);
        rtc.onicecandidate = function(event) {
            sigCh.sendICE(remote, event.candidate);
        };
        sigCh.onice = function(sender, candidate) {
            if (sender == remote && !!candidate)  {
                rtc.addIceCandidate(candidate);
            }
        };
        sigCh.onanswer = function(sender, answer) {
            if (sender == remote)  {
                rtc.setRemoteDescription(answer);
            }
        };
        sigCh.onoffer = function(sender, offer) {
            if (sender == remote)  {
                RTC_STATE.set(this, "negotiating");
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
        if (RTC_STATE.get(this) != "new") {
            throw new Error("RTC already negotiating or open");
        } else {
            RTC_STATE.set(this, "negotiating");
            let rtc = RTC.get(this);
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
        if (RTC_STATE.get(this) == "open") {
            let rtc = RTC.get(this);
            rtc.close();
        } else {
            throw new Error("RTC not open");
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

    set onterminated(value) {
        if (typeof value == "function") {
            ON_TERMINATED.set(this, value);
        } else {
            ON_TERMINATED.set(this, EMPTY_FN);
        }
    }

}