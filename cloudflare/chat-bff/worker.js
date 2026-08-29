/**
 * Same-origin BFF for the website chat.
 * Browser → https://agrivia.ai/api/* → this worker → https://api.agrivia.ai/api/*
 *
 * Allowed paths match the app chat client only:
 *   POST /chat
 *   POST /chat/rate
 *   GET  /welcome_greeting
 *
 * Caps origin load at ~1–2 rps so website traffic does not starve the mobile app.
 */

const ALLOWED = new Set(["/chat", "/chat/rate", "/welcome_greeting"]);
const MAX_QUERY_LENGTH = 2000;
const PER_IP_WINDOW_MS = 2000;
const GLOBAL_WINDOW_MS = 1000;
const GLOBAL_MAX = 2;

function json(status, body) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
        },
    });
}

function isUuid(value) {
    return typeof value === "string"
        && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function clientIp(request) {
    return request.headers.get("CF-Connecting-IP") || "unknown";
}

async function isRateLimited(cache, request, key, windowMs, maxHits) {
    const cacheUrl = new URL(`https://rate-limit.agrivia.ai/${key}`);
    const cached = await cache.match(cacheUrl);
    let hits = 0;
    if (cached) {
        hits = Number(await cached.text()) || 0;
    }
    if (hits >= maxHits) {
        return true;
    }
    await cache.put(
        cacheUrl,
        new Response(String(hits + 1), {
            headers: { "Cache-Control": `max-age=${Math.ceil(windowMs / 1000)}` },
        })
    );
    return false;
}

async function enforceLimits(request) {
    const cache = caches.default;
    const ip = clientIp(request);
    if (await isRateLimited(cache, request, `ip/${ip}`, PER_IP_WINDOW_MS, 1)) {
        return json(429, { error: "Too many requests from this browser. Wait a few seconds." });
    }
    if (await isRateLimited(cache, request, "global", GLOBAL_WINDOW_MS, GLOBAL_MAX)) {
        return json(429, { error: "The advisor is at capacity. Try again in a moment." });
    }
    return null;
}

function originBase(env) {
    return (env.ORIGIN_API_BASE || "https://api.agrivia.ai/api").replace(/\/$/, "");
}

async function proxyChat(request, env) {
    let payload;
    try {
        payload = await request.json();
    } catch (err) {
        return json(400, { error: "Expected a JSON body." });
    }

    const query = typeof payload.query === "string" ? payload.query.trim() : "";
    if (!query) {
        return json(400, { error: "query is required." });
    }

    const deviceUuid = isUuid(payload.deviceUuid) ? payload.deviceUuid : crypto.randomUUID();
    const body = {
        deviceUuid: deviceUuid,
        category: "General",
        query: query.slice(0, MAX_QUERY_LENGTH),
        summarize: false,
    };

    return fetch(`${originBase(env)}/chat`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
        },
        body: JSON.stringify(body),
    });
}

async function proxyRate(request, env) {
    let payload;
    try {
        payload = await request.json();
    } catch (err) {
        return json(400, { error: "Expected a JSON body." });
    }

    if (!isUuid(payload.deviceUuid) || typeof payload.qaId !== "string" || !payload.qaId.trim()) {
        return json(400, { error: "deviceUuid and qaId are required." });
    }
    const rating = Number(payload.rating);
    if (![1, -1, 0].includes(rating)) {
        return json(400, { error: "rating must be 1, -1, or 0." });
    }

    return fetch(`${originBase(env)}/chat/rate`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
        },
        body: JSON.stringify({
            deviceUuid: payload.deviceUuid,
            qaId: payload.qaId.trim(),
            rating: rating,
        }),
    });
}

async function proxyWelcome(request, env) {
    const incoming = new URL(request.url);
    const deviceUuid = incoming.searchParams.get("device_uuid") || "";
    if (!isUuid(deviceUuid)) {
        return json(400, { error: "device_uuid must be a UUID." });
    }

    const outbound = new URL(`${originBase(env)}/welcome_greeting`);
    outbound.searchParams.set("device_uuid", deviceUuid);
    outbound.searchParams.set("category", "General");
    const hour = incoming.searchParams.get("local_hour");
    if (hour !== null && hour !== "") {
        outbound.searchParams.set("local_hour", hour);
    }

    return fetch(outbound.toString(), {
        method: "GET",
        headers: { Accept: "application/json" },
    });
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const path = url.pathname.replace(/^\/api/, "") || "/";

        if (request.method === "OPTIONS") {
            return new Response(null, { status: 204 });
        }

        if (!ALLOWED.has(path)) {
            return json(404, { error: "Not found." });
        }

        const limited = await enforceLimits(request);
        if (limited) {
            return limited;
        }

        try {
            if (path === "/chat" && request.method === "POST") {
                return await proxyChat(request, env);
            }
            if (path === "/chat/rate" && request.method === "POST") {
                return await proxyRate(request, env);
            }
            if (path === "/welcome_greeting" && request.method === "GET") {
                return await proxyWelcome(request, env);
            }
            return json(405, { error: "Method not allowed." });
        } catch (err) {
            return json(502, { error: "Could not reach the Agrivia API." });
        }
    },
};
