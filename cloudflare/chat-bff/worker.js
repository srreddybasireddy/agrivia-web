/**
 * Production BFF for website chat.
 *
 * Browser  POST https://agrivia.ai/api/chat
 * Worker   POST https://api.agrivia.ai/api/chat   (same contract as iOS/Android)
 *
 * Zone SSL stays Flexible for the S3 site. Add a Cloudflare Configuration Rule:
 *   hostname equals api.agrivia.ai  →  SSL: Full (strict)
 * so this Worker talks HTTPS to nginx. Do not orange-cloud api (mobile app).
 */

const ALLOWED = new Set(["/chat", "/chat/rate", "/welcome_greeting"]);
const MAX_QUERY_LENGTH = 2000;
const PER_IP_WINDOW_MS = 2000;
const GLOBAL_WINDOW_MS = 1000;
const GLOBAL_MAX = 2;
const UNAVAILABLE = { error: "The advisor is unavailable right now. Try again shortly." };

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

async function isRateLimited(cache, key, windowMs, maxHits) {
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
    if (await isRateLimited(cache, `ip/${ip}`, PER_IP_WINDOW_MS, 1)) {
        return json(429, { error: "Too many requests from this browser. Wait a few seconds." });
    }
    if (await isRateLimited(cache, "global", GLOBAL_WINDOW_MS, GLOBAL_MAX)) {
        return json(429, { error: "The advisor is at capacity. Try again in a moment." });
    }
    return null;
}

function originBase(env) {
    const fromEnv = env && typeof env.ORIGIN_API_BASE === "string" ? env.ORIGIN_API_BASE.trim() : "";
    return (fromEnv || "https://api.agrivia.ai/api").replace(/\/$/, "");
}

function fetchOrigin(env, pathAndQuery, init) {
    return fetch(`${originBase(env)}${pathAndQuery}`, {
        ...init,
        redirect: "manual",
    });
}

function passOrigin(response) {
    if (response.status >= 300 && response.status < 400) {
        return json(502, UNAVAILABLE);
    }
    return response;
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
    const originRes = await fetchOrigin(env, "/chat", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
        },
        body: JSON.stringify({
            deviceUuid: deviceUuid,
            category: "General",
            query: query.slice(0, MAX_QUERY_LENGTH),
            summarize: false,
        }),
    });
    return passOrigin(originRes);
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

    const originRes = await fetchOrigin(env, "/chat/rate", {
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
    return passOrigin(originRes);
}

async function proxyWelcome(request, env) {
    const incoming = new URL(request.url);
    const deviceUuid = incoming.searchParams.get("device_uuid") || "";
    if (!isUuid(deviceUuid)) {
        return json(400, { error: "device_uuid must be a UUID." });
    }

    const params = new URLSearchParams({
        device_uuid: deviceUuid,
        category: "General",
    });
    const hour = incoming.searchParams.get("local_hour");
    if (hour !== null && hour !== "") {
        params.set("local_hour", hour);
    }

    const originRes = await fetchOrigin(env, `/welcome_greeting?${params.toString()}`, {
        method: "GET",
        headers: { Accept: "application/json" },
    });
    return passOrigin(originRes);
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
            return json(502, UNAVAILABLE);
        }
    },
};
