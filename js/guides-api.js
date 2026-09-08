/**
 * Public guide catalog. Same apiBasePath as chat (/api on agrivia.ai).
 */
(function (global) {
    const config = global.AgriviaConfig;

    function apiUrl(path) {
        return `${config.apiBasePath}${path}`;
    }

    async function parseJson(response) {
        const text = await response.text();
        if (!text) {
            return {};
        }
        try {
            return JSON.parse(text);
        } catch (err) {
            throw new Error("Unexpected response from the guides API.");
        }
    }

    async function request(path) {
        const response = await fetch(apiUrl(path), { headers: { Accept: "application/json" } });
        const data = await parseJson(response);
        if (!response.ok) {
            const detail = data.detail || data.error || data.message;
            throw new Error(typeof detail === "string" ? detail : "Guides could not be loaded.");
        }
        return data;
    }

    function queryString(params) {
        const search = new URLSearchParams();
        Object.keys(params).forEach((key) => {
            const value = params[key];
            if (value === undefined || value === null || value === "") {
                return;
            }
            search.set(key, String(value));
        });
        const encoded = search.toString();
        return encoded ? `?${encoded}` : "";
    }

    global.AgriviaGuidesApi = {
        list: function (options) {
            const opts = options || {};
            return request(`/guides${queryString({
                tab: opts.tab || "growing",
                q: opts.q || "",
                topic: opts.topic || "",
            })}`);
        },
        get: function (slug) {
            return request(`/guides/${encodeURIComponent(slug)}`);
        },
    };
})(window);
