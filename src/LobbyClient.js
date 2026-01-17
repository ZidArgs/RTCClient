import RTCClient from "./RTCClient.js";
import Rest from "./utils/Rest.js";

let LOGGER = null;

class LobbyClient extends RTCClient {

    static setLogger(value) {
        super.setLogger();
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

    async getInstances() {
        if (LOGGER != null) {
            LOGGER.info("REQUEST INSTANCE LIST");
        }
        console.info("REQUEST INSTANCE LIST");
        try {
            const res = await Rest.get(this.connectorUrl);
            return {
                success: true,
                data: res
            };
        } catch (e) {
            return {
                success: false,
                error: e
            };
        }
    }

    async setRoomVisibility(value = true) {
        if (LOGGER != null) {
            LOGGER.info("UPDATE ROOM VISIBILITY");
        }
        console.info("UPDATE ROOM VISIBILITY");

        try {
            const res = await Rest.post(`${this.connectorUrl}/visibility`, {
                name: this.masterName,
                key: this.masterKey,
                value
            });
            return res;
        } catch (e) {
            return {
                success: false,
                reason: "connection problem",
                error: e
            };
        }
    }

}

export default LobbyClient;
