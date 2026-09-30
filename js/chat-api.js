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

    async function getAdvisoryResponse(deviceUuid, category, query) {
        const response = await fetchWithTimeout(
            apiUrl("/chat"),
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                },
                body: JSON.stringify({
                    deviceUuid: deviceUuid,
                    category: category,
                    query: query,
                    summarize: false,
                }),
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
        submitRating: submitRating,
    };
})(window);
