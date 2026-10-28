/**
 * Same request shapes as farmi-ios ChatRepositoryImpl and
 * farmi-android ChatRepositoryImpl. Base path already includes /api.
 */
(function (global) {
    const config = global.AgriviaConfig;

    function apiUrl(path) {
        return `${config.apiBasePath}${path}`;
    }

    function getOrCreateDeviceUuid() {
        try {
            const existing = localStorage.getItem(config.deviceUuidStorageKey);
            if (existing && isUuid(existing)) {
                return existing;
            }
        } catch (err) {
            // private mode — still send a session UUID
        }
        const created = global.crypto.randomUUID();
        try {
            localStorage.setItem(config.deviceUuidStorageKey, created);
        } catch (err) {
            // ignore
        }
        return created;
    }

    function isUuid(value) {
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
    }

    function readableString(value) {
        if (typeof value !== "string") {
            return null;
        }
        const trimmed = value.trim();
        if (!trimmed || trimmed.toLowerCase() === "null") {
            return null;
        }
        return trimmed;
    }

    function normalizeSuggestion(item) {
        if (typeof item === "string") {
            const text = readableString(item);
            return text ? { label: text, query: text } : null;
        }
        if (!item || typeof item !== "object") {
            return null;
        }
        const query = readableString(item.query_text)
            || readableString(item.query)
            || readableString(item.prompt)
            || readableString(item.label);
        const label = readableString(item.label)
            || readableString(item.title)
            || query;
        if (!query || !label) {
            return null;
        }
        return { label: label, query: query };
    }

    function uniqueSuggestions(items) {
        const seen = {};
        const out = [];
        (Array.isArray(items) ? items : []).forEach((item) => {
            const chip = normalizeSuggestion(item);
            if (!chip || seen[chip.query]) {
                return;
            }
            seen[chip.query] = true;
            out.push(chip);
        });
        return out;
    }

    async function parseJson(response) {
        const text = await response.text();
        if (!text) {
            return {};
        }
        try {
            return JSON.parse(text);
        } catch (err) {
            throw new Error("The advisor returned an unexpected response. Try again shortly.");
        }
    }

    async function fetchWithTimeout(url, options, timeoutMs) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            return await fetch(url, { ...options, signal: controller.signal });
        } finally {
            clearTimeout(timer);
        }
    }

    function statusError(status) {
        if (status === 429) {
            return new Error("The advisor is busy. Wait a few seconds and try again.");
        }
        if (status >= 500) {
            return new Error("The advisor is unavailable right now. Try again shortly.");
        }
        return new Error("The advisor could not answer that request.");
    }

    async function getAdvisoryResponse(deviceUuid, category, query, focus) {
        const body = {
            deviceUuid: deviceUuid,
            category: category,
            query: query,
            summarize: false,
        };
        const asset = focus || {};
        if (asset.assetId) {
            body.assetId = asset.assetId;
        }
        if (asset.assetTitle) {
            body.assetTitle = asset.assetTitle;
        }
        if (asset.assetContext) {
            body.assetContext = asset.assetContext;
        }
        const response = await fetchWithTimeout(
            apiUrl("/chat"),
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                },
                body: JSON.stringify(body),
            },
            config.chatTimeoutMs
        );

        if (!response.ok) {
            throw statusError(response.status);
        }

        const data = await parseJson(response);
        const nextFromRoot = readableString(data.nextQuestionPrompt);
        const nextFromNested = data.nextQuestion
            ? readableString(data.nextQuestion.prompt)
            : null;
        const suggestionChips = uniqueSuggestions(
            [].concat(
                data.suggestionChips || [],
                data.nextQuestion && data.nextQuestion.suggestionChips
                    ? data.nextQuestion.suggestionChips
                    : []
            )
        );

        return {
            answer: typeof data.answer === "string" ? data.answer : "",
            qaId: readableString(data.qaId),
            suggestionChips: suggestionChips,
            isProfileComplete: Boolean(data.isProfileComplete),
            nextQuestionPrompt: nextFromRoot || nextFromNested,
        };
    }

    function errorFromBody(data, fallback) {
        if (data && typeof data.detail === "string" && data.detail.trim()) {
            return new Error(data.detail.trim());
        }
        if (data && typeof data.error === "string" && data.error.trim()) {
            return new Error(data.error.trim());
        }
        return new Error(fallback);
    }

    async function getThreadMessages(deviceUuid, threadRef, options) {
        const params = new URLSearchParams({
            deviceUuid: deviceUuid,
            limit: String((options && options.limit) || 20),
        });
        if (options && options.before) {
            params.set("before", options.before);
        }
        const ref = threadRef || "general";
        const response = await fetchWithTimeout(
            `${apiUrl("/advisor/threads/" + encodeURIComponent(ref) + "/messages")}?${params.toString()}`,
            { method: "GET", headers: { Accept: "application/json" } },
            config.welcomeTimeoutMs
        );
        const data = await parseJson(response);
        if (!response.ok) {
            throw errorFromBody(data, "Could not load this conversation.");
        }
        return {
            messages: Array.isArray(data.messages) ? data.messages : [],
            hasMore: Boolean(data.has_more),
            nextCursor: readableString(data.next_cursor),
        };
    }

    async function postThreadMessage(deviceUuid, threadRef, content) {
        const ref = threadRef || "general";
        const response = await fetchWithTimeout(
            apiUrl("/advisor/threads/" + encodeURIComponent(ref) + "/messages"),
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                },
                body: JSON.stringify({
                    deviceUuid: deviceUuid,
                    content: content,
                }),
            },
            config.chatTimeoutMs
        );
        const data = await parseJson(response);
        if (!response.ok) {
            throw errorFromBody(data, "The advisor could not answer that request.");
        }
        const assistant = data.assistant_message || {};
        return {
            answer: typeof assistant.content === "string" ? assistant.content : "",
            routed: Boolean(data.routed),
            thread: data.thread || {},
        };
    }

    async function getWelcomeGreeting(deviceUuid, category, localHour) {
        const params = new URLSearchParams({
            device_uuid: deviceUuid,
            category: category,
        });
        if (Number.isInteger(localHour)) {
            params.set("local_hour", String(localHour));
        }

        const response = await fetchWithTimeout(
            `${apiUrl("/welcome_greeting")}?${params.toString()}`,
            {
                method: "GET",
                headers: { Accept: "application/json" },
            },
            config.welcomeTimeoutMs
        );

        if (!response.ok) {
            return { greeting: "", suggestions: [], askPrompts: [] };
        }

        const data = await parseJson(response);
        const nestedPrompt = data.nextQuestion
            ? readableString(data.nextQuestion.prompt)
            : null;
        const nestedChips = data.nextQuestion && data.nextQuestion.suggestionChips
            ? data.nextQuestion.suggestionChips
            : [];

        const askPrompts = [];
        const seenAsk = {};
        (Array.isArray(data.askPrompts) ? data.askPrompts : []).forEach((item) => {
            const text = readableString(item);
            if (!text || seenAsk[text]) {
                return;
            }
            seenAsk[text] = true;
            askPrompts.push(text);
        });

        return {
            greeting: readableString(data.greeting) || "",
            suggestions: uniqueSuggestions([].concat(data.suggestions || [], nestedChips)),
            askPrompts: askPrompts,
            nextQuestionPrompt: nestedPrompt,
        };
    }

    async function submitRating(deviceUuid, qaId, rating) {
        const response = await fetchWithTimeout(
            apiUrl("/chat/rate"),
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                },
                body: JSON.stringify({
                    deviceUuid: deviceUuid,
                    qaId: qaId,
                    rating: rating,
                }),
            },
            config.rateTimeoutMs
        );

        if (!response.ok) {
            throw statusError(response.status);
        }
    }

    global.AgriviaChatApi = {
        getOrCreateDeviceUuid: getOrCreateDeviceUuid,
        getAdvisoryResponse: getAdvisoryResponse,
        getWelcomeGreeting: getWelcomeGreeting,
        getThreadMessages: getThreadMessages,
        postThreadMessage: postThreadMessage,
        submitRating: submitRating,
    };
})(window);
