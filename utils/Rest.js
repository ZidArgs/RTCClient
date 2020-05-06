async function sendRequest(url, query, config) {
    url = new URL(url);
    if (typeof query != "undefined") {
        if (typeof query == "object") {
            if (Array.isArray(query)) {
                for (let i of query) {
                    url.searchParams.append(i, "");
                }
            } else {
                for (let i in query) {
                    url.searchParams.append(i, query[i]);
                }
            }
        } else if (query != "") {
            url.searchParams.append(query, "");
        }
    }
    config.cache = 'no-cache';
    config.headers = config.headers ?? {};
    config.headers['Content-Type'] = 'application/json; charset=utf-8';
    config.headers['Cache-Control'] = 'no-cache';
    let response = await fetch(url, config);
    if (response.status < 200 || response.status >= 300) {
        throw new Error(`error on ${config.method} for url "${url}" - status: ${response.status} - ${response.statusText}`);
    }
    let data = null;
    if (response.headers.get('content-type').indexOf('application/json') >= 0) {
        try {
            data = await response.json();
        } catch (e) { }
    } else {
        try {
            data = await response.text();
        } catch (e) { }
    }
    return data;
}

class Rest {

    async get(url, query) {
        return await sendRequest(url, query, {
            method: 'GET',
        });
    }

    async post(url, data = {}, query) {
        if (typeof data == "object" && !Array.isArray(data)) {
            return await sendRequest(url, query, {
                method: 'POST',
                body: JSON.stringify(data)
            });
        } else {
            throw new TypeError("data must be a JSON object");
        }
    }

    async put(url, data = {}, query) {
        if (typeof data == "object" && !Array.isArray(data)) {
            return await sendRequest(url, query, {
                method: 'PUT',
                body: JSON.stringify(data)
            });
        } else {
            throw new TypeError("data must be a JSON object");
        }
    }

    async delete(url, query) {
        return await sendRequest(url, query, {
            method: 'DELETE',
        });
    }

}

export default new Rest();