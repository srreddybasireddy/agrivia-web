/**
 * Public catalog plus signed-in create/draft/publish.
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
            const trimmed = text.replace(/\s+/g, " ").trim();
            if (trimmed && trimmed.length < 160 && trimmed[0] !== "<") {
                throw new Error(trimmed);
            }
            throw new Error("The guides API returned an unexpected response.");
        }
    }

    function authHeaders(extra) {
        const headers = { Accept: "application/json", ...(extra || {}) };
        const token = global.AgriviaAuth && global.AgriviaAuth.getSessionToken();
        if (token) {
            headers.Authorization = `Bearer ${token}`;
        }
        return headers;
    }

    async function request(path, options) {
        const response = await fetch(apiUrl(path), {
            ...(options || {}),
            headers: authHeaders(options && options.headers),
        });
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

    function writeBody(fields) {
        return JSON.stringify({
            title: fields.title || "",
            summary: fields.summary || "",
            bodyHtml: fields.bodyHtml || "",
            primaryTab: fields.primaryTab || "growing",
            videoUrl: fields.videoUrl || "",
            videoTitle: fields.videoTitle || "",
            status: fields.status || "draft",
            query: fields.query || "",
            format: fields.format || "document",
            outcome: fields.outcome || "",
        });
    }

    global.AgriviaGuidesApi = {
        list: function (options) {
            const opts = options || {};
            return request(`/guides${queryString({
                tab: opts.tab || "documents",
                q: opts.q || "",
                topic: opts.topic || "",
                outcome: opts.outcome || "",
                limit: opts.limit || "",
                offset: opts.offset || "",
                sort: opts.sort || "",
            })}`);
        },
        get: function (slug) {
            return request(`/guides/${encodeURIComponent(slug)}`);
        },
        mine: function () {
            return request("/guides/mine");
        },
        create: function (fields) {
            return request("/guides", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: writeBody(fields),
            });
        },
        update: function (slug, fields) {
            return request(`/guides/${encodeURIComponent(slug)}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: writeBody(fields),
            });
        },
        draft: function (query, primaryTab, videoUrl) {
            return request("/guides/draft", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    query: query,
                    primaryTab: primaryTab || "growing",
                    videoUrl: videoUrl || "",
                }),
            });
        },
        vote: function (slug, vote) {
            return request(`/guides/${encodeURIComponent(slug)}/vote`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ vote: vote }),
            });
        },
        comments: function (slug) {
            return request(`/guides/${encodeURIComponent(slug)}/comments`);
        },
        addComment: function (slug, body) {
            return request(`/guides/${encodeURIComponent(slug)}/comments`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ body: body }),
            });
        },
    };
})(window);
