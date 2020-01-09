function getQuery(data) {
    if (typeof data == "undefined" || data === "") {
        return "";
    }
    if (typeof data == "object") {
        if (Array.isArray(data)) {
            if (data.length == 0) {
                return "";
            }
            return `?${data.join("&")}`;
        }
        let entries = Object.entries(data);
        if (entries.length == 0) {
            return "";
        }
        return `?${entries.map(e=>e.join("=")).join("&")}`;
    }
    return `?${data}`;
}

class Rest {

    async get(url, query) {
        let r = await fetch(`${url}${getQuery(query)}`, {
            method: 'GET',
            cache: 'no-cache',
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache'
            }
        });
        if (r.status < 200 || r.status >= 300) {
            throw new Error(`error loading file "${url}" - status: ${r.status}`);
        }
        return r;
    }

    async post(url, query, data) {
        let r = await fetch(`${url}${getQuery(query)}`, {
            method: 'POST',
            cache: 'no-cache',
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache'
            },
            body: JSON.stringify(data)
        });
        if (r.status < 200 || r.status >= 300) {
            throw new Error(`error loading file "${url}" - status: ${r.status}`);
        }
        return r;
    }

}

export default new Rest();