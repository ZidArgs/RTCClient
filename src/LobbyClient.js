import RTCClient from "./RTCClient.js";
import Rest from "./utils/Rest.js";

class LobbyClient extends RTCClient {

    #logger = null;

    setLogger(value) {
        super.setLogger(value);
        if (
            value == null ||
            typeof value.log != "function" ||
            typeof value.info != "function" ||
            typeof value.warn != "function" ||
            typeof value.error != "function"
        ) {
            this.#logger = null;
        } else {
            this.#logger = value;
        }
    }

    async getInstances() {
        if (this.#logger != null) {
            this.#logger.info("REQUEST INSTANCE LIST");
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
        if (this.#logger != null) {
            this.#logger.info("UPDATE ROOM VISIBILITY");
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
