/**
 * Production edge for agrivia.ai:
 *   /api/*           chat + farm + guides JSON BFF (same contract as the apps)
 *   /guides/<slug>   SSR article HTML from GET /api/guides/:slug
 *   /sitemap.xml     published URLs from the guides API
 *   www              301 → https://agrivia.ai (no http hop)
 *
 * Zone SSL stays Flexible for S3. Do not orange-cloud api.agrivia.ai.
 */

const ALLOWED_CHAT = new Set(["/chat", "/chat/rate", "/welcome_greeting"]);
const ALLOWED_FARM_EXACT = new Set([
    "/auth/config",
    "/auth/google",
    "/auth/me",
    "/auth/logout",
    "/register",
    "/users",
    "/generic_assets",
    "/cattle",
    "/crops",
]);
const MAX_QUERY_LENGTH = 2000;
const PER_IP_WINDOW_MS = 2000;
const GLOBAL_WINDOW_MS = 1000;
const GLOBAL_MAX = 2;
const UNAVAILABLE = { error: "The advisor is unavailable right now. Try again shortly." };
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESERVED_GUIDE_PAGES = new Set(["index", "write", "article"]);
const ASSET_VER = "20260910-guides16";
const GUIDE_CACHE_TTL = 60;
const ADSENSE = "ca-pub-5524710580723425";

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

const ALLOWED_CATEGORIES = new Set([
    "General",
    "Crops",
    "Cattle",
    "Garden",
    "Poultry & Eggs",
    "Birds & Bees",
    "Fish & Shrimp",
]);

function normalizeCategory(value) {
    if (typeof value !== "string") {
        return "General";
    }
    const trimmed = value.trim();
    for (const known of ALLOWED_CATEGORIES) {
        if (known.toLowerCase() === trimmed.toLowerCase()) {
            return known;
        }
    }
    return "General";
}

function isGuidesPath(path) {
    return path === "/guides"
        || path === "/guides/search"
        || path === "/guides/mine"
        || path === "/guides/draft"
        || /^\/guides\/[a-z0-9-]+$/i.test(path)
        || /^\/guides\/[a-z0-9-]+\/(vote|comments)$/i.test(path);
}

function isGuidesRequest(method, path) {
    if (!isGuidesPath(path)) {
        return false;
    }
    return method === "GET" || method === "HEAD" || method === "POST" || method === "PATCH";
}

function isFarmPath(path) {
    if (ALLOWED_FARM_EXACT.has(path)) {
        return true;
    }
    return (
        /^\/users\/[0-9a-f-]+\/profile$/i.test(path)
        || /^\/users\/[0-9a-f-]+\/pending-details$/i.test(path)
        || /^\/users\/[0-9a-f-]+\/asset-profile-answer$/i.test(path)
        || /^\/generic_assets\/[0-9a-f-]+\//i.test(path)
        || /^\/cattle\/[0-9a-f-]+$/i.test(path)
        || /^\/crops\/[0-9a-f-]+$/i.test(path)
    );
}

function originBase(env) {
    const fromEnv = env && typeof env.ORIGIN_API_BASE === "string" ? env.ORIGIN_API_BASE.trim() : "";
    return (fromEnv || "https://api.agrivia.ai/api").replace(/\/$/, "");
}

function siteOrigin(env) {
    const fromEnv = env && typeof env.SITE_ORIGIN === "string" ? env.SITE_ORIGIN.trim() : "";
    return (fromEnv || "http://agrivia.ai.s3-website-us-west-2.amazonaws.com").replace(/\/$/, "");
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

async function proxyFarm(request, env, path) {
    const incoming = new URL(request.url);
    const headers = { Accept: "application/json" };
    const authorization = request.headers.get("Authorization");
    if (authorization) {
        headers.Authorization = authorization;
    }
    const init = {
        method: request.method,
        headers: headers,
    };
    if (request.method !== "GET" && request.method !== "HEAD") {
        headers["Content-Type"] = request.headers.get("Content-Type") || "application/json";
        init.body = await request.text();
    }
    return passOrigin(await fetchOrigin(env, `${path}${incoming.search}`, init));
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
            category: normalizeCategory(payload.category),
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
        category: normalizeCategory(incoming.searchParams.get("category")),
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

async function handleApi(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/api/, "") || "/";

    if (request.method === "OPTIONS") {
        return new Response(null, { status: 204 });
    }

    const isChat = ALLOWED_CHAT.has(path);
    const farm = isFarmPath(path);
    const guides = isGuidesRequest(request.method, path);
    if (!isChat && !farm && !guides) {
        return json(404, { error: "Not found." });
    }

    if (isChat) {
        const limited = await enforceLimits(request);
        if (limited) {
            return limited;
        }
    }

    if (path === "/chat" && request.method === "POST") {
        return await proxyChat(request, env);
    }
    if (path === "/chat/rate" && request.method === "POST") {
        return await proxyRate(request, env);
    }
    if (path === "/welcome_greeting" && request.method === "GET") {
        return await proxyWelcome(request, env);
    }
    if (farm || guides) {
        const response = await proxyFarm(request, env, path);
        if (guides && shouldPurgeGuideCache(request.method, path) && response.ok) {
            await purgeGuideCaches(path, response.clone());
        }
        return response;
    }
    return json(405, { error: "Method not allowed." });
}

function shouldPurgeGuideCache(method, path) {
    if (method === "POST" && (path === "/guides" || path === "/guides/draft")) {
        return true;
    }
    return method === "PATCH" && /^\/guides\/[a-z0-9-]+$/i.test(path);
}

async function purgeGuideCaches(path, response) {
    const cache = caches.default;
    await cache.delete(new Request("https://ssr.agrivia.ai/sitemap.xml"));
    let slug = "";
    try {
        const data = await response.json();
        slug = (data && data.guide && data.guide.slug) || "";
    } catch (err) {
        slug = "";
    }
    if (!slug) {
        const match = path.match(/^\/guides\/([a-z0-9-]+)$/i);
        slug = match ? match[1] : "";
    }
    if (slug && SLUG_RE.test(slug)) {
        await cache.delete(new Request(`https://ssr.agrivia.ai/guides/${slug.toLowerCase()}`));
    }
}

function redirect301(location) {
    return new Response(null, {
        status: 301,
        headers: {
            Location: location,
            "Cache-Control": "public, max-age=3600",
        },
    });
}

function html(status, body, extraHeaders) {
    return new Response(body, {
        status,
        headers: {
            "Content-Type": "text/html; charset=utf-8",
            ...extraHeaders,
        },
    });
}

function esc(value) {
    return String(value || "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
    }[char]));
}

function stripScripts(raw) {
    return String(raw || "").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
}

function youtubeId(url) {
    const match = String(url || "").match(/(?:youtu\.be\/|v=|embed\/)([A-Za-z0-9_-]{11})/);
    return match ? match[1] : "";
}

function vimeoId(url) {
    const match = String(url || "").match(/vimeo\.com\/(?:video\/)?(\d+)/i);
    return match ? match[1] : "";
}

function kickerText(guide) {
    if (guide.format === "video") {
        return guide.outcome === "experience" ? "Video · Experience" : "Video · Success";
    }
    return "Document";
}

function mediaMarkup(guide) {
    const videos = (guide.media || []).filter((item) => item.kind === "video" && item.url);
    if (!videos.length) {
        return '<div class="guide-video" id="guideMediaMount" hidden></div>';
    }
    const parts = videos.map((item) => {
        const title = esc(item.title || "Guide video");
        const yt = youtubeId(item.url);
        if (yt) {
            return `<iframe class="guide-video-frame" title="${title}" allowfullscreen src="https://www.youtube-nocookie.com/embed/${esc(yt)}"></iframe>`;
        }
        const vim = vimeoId(item.url);
        if (vim) {
            return `<iframe class="guide-video-frame" title="${title}" allowfullscreen src="https://player.vimeo.com/video/${esc(vim)}"></iframe>`;
        }
        return `<p><a class="btn btn-outline" href="${esc(item.url)}" rel="noopener noreferrer" target="_blank">${title}</a></p>`;
    });
    return `<div class="guide-video" id="guideMediaMount">${parts.join("")}</div>`;
}

function relatedMarkup(guide) {
    const related = guide.related || [];
    if (!related.length) {
        return '<aside class="guide-related" id="guideRelated" hidden></aside>';
    }
    const links = related
        .filter((item) => item.slug)
        .map((item) => `<a href="/guides/${esc(item.slug)}">${esc(item.title || item.slug)}</a>`)
        .join("");
    return `<aside class="guide-related" id="guideRelated"><h2>Related</h2>${links}</aside>`;
}

function notFoundPage() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Page not found | Agrivia</title>
    <meta name="robots" content="noindex">
    <link rel="canonical" href="https://agrivia.ai/404.html">
    <link rel="stylesheet" href="/css/style.css?v=${ASSET_VER}">
</head>
<body class="paper-theme">
    <header class="site-header">
        <div class="header-container">
            <a href="/" class="logo-link"><span class="logo-mark" aria-hidden="true"></span><span class="logo-text">Agrivia<span class="logo-badge">.ai</span></span></a>
        </div>
    </header>
    <main class="section-padding">
        <div class="container home-column">
            <h1>That page is not here</h1>
            <p>The address does not match a published page on agrivia.ai.</p>
            <p>
                <a class="btn btn-primary" href="/">Home</a>
                <a class="btn btn-outline" href="/guides/">Guides</a>
            </p>
        </div>
    </main>
</body>
</html>`;
}

function guidePage(guide) {
    const slug = guide.slug;
    const title = guide.title || slug;
    const summary = guide.summary || "";
    const url = `https://agrivia.ai/guides/${slug}`;
    const body = stripScripts(guide.body_html || "").trim()
        || (guide.format === "video"
            ? `<p>${esc(summary)}</p>`
            : "<p>This guide has no article text yet.</p>");
    const authorLine = guide.source === "user"
        ? `<p class="guide-author" id="guideAuthor">${esc(guide.author_name ? `Written by ${guide.author_name}` : "Written by a reader")}</p>`
        : '<p class="guide-author" id="guideAuthor" hidden></p>';
    const topics = (guide.topics || [])
        .map((topic) => `<span class="guide-topic-chip">${esc(topic)}</span>`)
        .join("");
    const jsonLd = {
        "@context": "https://schema.org",
        "@type": guide.format === "video" ? "VideoObject" : "Article",
        headline: title,
        name: title,
        description: summary,
        url,
        author: guide.source === "user"
            ? { "@type": "Person", name: guide.author_name || "Reader" }
            : { "@type": "Organization", name: "Agrivia", url: "https://agrivia.ai/" },
        publisher: { "@type": "Organization", name: "Agrivia", url: "https://agrivia.ai/" },
        mainEntityOfPage: url,
    };
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${esc(title)} | Agrivia</title>
    <meta name="description" content="${esc(summary)}">
    <link rel="canonical" href="${esc(url)}">
    <meta property="og:type" content="${guide.format === "video" ? "video.other" : "article"}">
    <meta property="og:url" content="${esc(url)}">
    <meta property="og:title" content="${esc(title)}">
    <meta property="og:description" content="${esc(summary)}">
    <link rel="icon" href="/favicon.ico" sizes="48x48">
    <link rel="stylesheet" href="/css/style.css?v=${ASSET_VER}">
    <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE}" crossorigin="anonymous"></script>
    <script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>
</head>
<body class="paper-theme">
    <header class="site-header">
        <div class="header-container">
            <a href="/" class="logo-link"><span class="logo-mark" aria-hidden="true"></span><span class="logo-text">Agrivia<span class="logo-badge">.ai</span></span></a>
            <nav class="main-nav" id="mainNav" aria-label="Primary">
                <a href="/guides/" class="nav-item active">Guides</a>
                <a href="/#ai-advisor" class="nav-item">Advisor</a>
                <a href="/#farm" class="nav-item">Farm</a>
            </nav>
            <div class="header-actions">
                <div class="auth-slot" id="authSlot">
                    <div id="authGuest"><div id="googleSignInBtn" class="google-signin-mount"></div></div>
                    <div id="authSignedIn" hidden>
                        <span class="auth-email" id="authEmailLabel"></span>
                        <button type="button" class="btn btn-outline btn-sm" id="authSignOut">Sign out</button>
                    </div>
                </div>
            </div>
        </div>
    </header>
    <main class="section-padding">
        <article class="guide-article paper-card" id="guideArticle">
            <p class="farm-status" id="guideStatus" hidden></p>
            <div class="guide-header">
                <p class="guide-kicker" id="guideKicker">${esc(kickerText(guide))}</p>
                <h1 id="guideTitle">${esc(title)}</h1>
                <p id="guideSummary">${esc(summary)}</p>
                ${authorLine}
                <div class="guide-topics" id="guideTopics">${topics}</div>
                <p class="guide-disclosure">Guidance only, not a vet diagnosis or a lab soil test. Confirm treatment with local extension or a vet.</p>
            </div>
            ${mediaMarkup(guide)}
            <div id="guideBody">${body}</div>
            <div class="guide-engage" id="guideEngage" hidden></div>
            <section class="guide-comments" id="guideComments" hidden></section>
            ${relatedMarkup(guide)}
            <div class="guide-next">
                <a class="btn btn-primary" id="guideAsk" href="/?ask=${esc(encodeURIComponent(title))}#ai-advisor">Ask the advisor</a>
                <a class="btn btn-outline" href="/guides/">All guides</a>
            </div>
        </article>
    </main>
    <footer class="site-footer">
        <div class="container footer-bottom">
            <p>&copy; 2026 Agrivia. <a href="/privacy.html">Privacy</a> · <a href="/terms.html">Terms</a> · <a href="/affiliate-disclosure.html">Disclosure</a> · <a href="/about.html">About</a> · <a href="/contact.html">Contact</a></p>
        </div>
    </footer>
    <script src="/js/config.js?v=${ASSET_VER}"></script>
    <script src="/js/auth.js?v=${ASSET_VER}"></script>
    <script src="/js/guides-api.js?v=${ASSET_VER}"></script>
    <script src="/js/guides-ui.js?v=${ASSET_VER}"></script>
    <script src="/js/main.js?v=${ASSET_VER}"></script>
</body>
</html>`;
}

async function cachedHtml(cacheKey, build, ttlSec) {
    const cache = caches.default;
    const key = new Request(cacheKey);
    const hit = await cache.match(key);
    if (hit) {
        return hit;
    }
    const response = await build();
    if (!response.ok) {
        return response;
    }
    const copy = new Response(response.body, response);
    copy.headers.set("Cache-Control", `public, max-age=${ttlSec}, s-maxage=${ttlSec}`);
    await cache.put(key, copy.clone());
    return copy;
}

async function ssrGuide(env, slug) {
    const originRes = await fetchOrigin(env, `/guides/${encodeURIComponent(slug)}`, {
        method: "GET",
        headers: { Accept: "application/json" },
    });
    if (originRes.status === 404) {
        return html(404, notFoundPage(), { "Cache-Control": "public, max-age=30", "X-Robots-Tag": "noindex" });
    }
    if (!originRes.ok) {
        return html(502, notFoundPage(), { "Cache-Control": "no-store" });
    }
    const data = await originRes.json();
    const guide = data && data.guide;
    if (!guide || guide.status && guide.status !== "published") {
        return html(404, notFoundPage(), { "Cache-Control": "public, max-age=30", "X-Robots-Tag": "noindex" });
    }
    return html(200, guidePage(guide), {
        "Cache-Control": `public, max-age=${GUIDE_CACHE_TTL}, s-maxage=${GUIDE_CACHE_TTL}`,
    });
}

async function handleGuidesHtml(request, env, url) {
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (path === "/guides" || path === "/guides/index.html") {
        return passSite(request, env, "/guides/index.html" + url.search);
    }
    if (path === "/guides/write.html" || path === "/guides/write") {
        return passSite(request, env, "/guides/write.html" + url.search);
    }
    if (path === "/guides/article.html" || path === "/guides/article") {
        const slug = (url.searchParams.get("slug") || "").trim().toLowerCase();
        if (slug && SLUG_RE.test(slug) && !RESERVED_GUIDE_PAGES.has(slug)) {
            return redirect301(`https://agrivia.ai/guides/${slug}`);
        }
        return redirect301("https://agrivia.ai/guides/");
    }
    const htmlMatch = path.match(/^\/guides\/([a-z0-9-]+)\.html$/i);
    if (htmlMatch) {
        const slug = htmlMatch[1].toLowerCase();
        if (RESERVED_GUIDE_PAGES.has(slug)) {
            return passSite(request, env, path + url.search);
        }
        if (SLUG_RE.test(slug)) {
            return redirect301(`https://agrivia.ai/guides/${slug}`);
        }
        return html(404, notFoundPage(), { "Cache-Control": "public, max-age=30", "X-Robots-Tag": "noindex" });
    }
    const slugMatch = path.match(/^\/guides\/([a-z0-9-]+)$/i);
    if (!slugMatch) {
        return html(404, notFoundPage(), { "Cache-Control": "public, max-age=30", "X-Robots-Tag": "noindex" });
    }
    const slug = slugMatch[1].toLowerCase();
    if (RESERVED_GUIDE_PAGES.has(slug) || !SLUG_RE.test(slug)) {
        return html(404, notFoundPage(), { "Cache-Control": "public, max-age=30", "X-Robots-Tag": "noindex" });
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
        return json(405, { error: "Method not allowed." });
    }
    return cachedHtml(
        `https://ssr.agrivia.ai/guides/${slug}`,
        () => ssrGuide(env, slug),
        GUIDE_CACHE_TTL
    );
}

function sitemapXml(urls) {
    const today = new Date().toISOString().slice(0, 10);
    const body = urls.map((item) => `  <url>
    <loc>${esc(item.loc)}</loc>
    <lastmod>${item.lastmod || today}</lastmod>
    <changefreq>${item.changefreq}</changefreq>
    <priority>${item.priority}</priority>
  </url>`).join("\n");
    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
}

async function handleSitemap(env) {
    const staticUrls = [
        { loc: "https://agrivia.ai/", changefreq: "weekly", priority: "1.0" },
        { loc: "https://agrivia.ai/about.html", changefreq: "monthly", priority: "0.7" },
        { loc: "https://agrivia.ai/contact.html", changefreq: "monthly", priority: "0.7" },
        { loc: "https://agrivia.ai/privacy.html", changefreq: "monthly", priority: "0.6" },
        { loc: "https://agrivia.ai/terms.html", changefreq: "monthly", priority: "0.6" },
        { loc: "https://agrivia.ai/affiliate-disclosure.html", changefreq: "monthly", priority: "0.6" },
        { loc: "https://agrivia.ai/guides/", changefreq: "weekly", priority: "0.9" },
        { loc: "https://agrivia.ai/guides/write.html", changefreq: "monthly", priority: "0.5" },
    ];
    const guides = [];
    let offset = 0;
    for (let page = 0; page < 20; page += 1) {
        const originRes = await fetchOrigin(env, `/guides?tab=all&limit=50&offset=${offset}`, {
            method: "GET",
            headers: { Accept: "application/json" },
        });
        if (!originRes.ok) {
            break;
        }
        const data = await originRes.json();
        const rows = data.guides || [];
        rows.forEach((row) => {
            if (row && row.slug && SLUG_RE.test(row.slug)) {
                guides.push({
                    loc: `https://agrivia.ai/guides/${row.slug}`,
                    changefreq: "weekly",
                    priority: "0.8",
                });
            }
        });
        if (rows.length < 50) {
            break;
        }
        offset += 50;
    }
    return new Response(sitemapXml(staticUrls.concat(guides)), {
        status: 200,
        headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": `public, max-age=${GUIDE_CACHE_TTL}, s-maxage=${GUIDE_CACHE_TTL}`,
        },
    });
}

async function passSite(request, env, rewritePath) {
    const incoming = new URL(request.url);
    const path = rewritePath || (incoming.pathname + incoming.search);
    const target = new URL(path.startsWith("/") ? path : `/${path}`, `${siteOrigin(env)}/`);
    const originRes = await fetch(target.toString(), {
        method: request.method === "HEAD" ? "GET" : request.method,
        redirect: "manual",
    });
    if (originRes.status === 404 || originRes.status === 403) {
        return html(404, notFoundPage(), { "Cache-Control": "public, max-age=60", "X-Robots-Tag": "noindex" });
    }
    const headers = new Headers(originRes.headers);
    headers.delete("x-amz-id-2");
    headers.delete("x-amz-request-id");
    let body = originRes.body;
    if (request.method === "HEAD") {
        body = null;
    }
    return new Response(body, {
        status: originRes.status,
        headers,
    });
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        if (url.hostname === "www.agrivia.ai") {
            return redirect301(`https://agrivia.ai${url.pathname}${url.search}`);
        }

        try {
            if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
                return await handleApi(request, env);
            }
            if (url.pathname === "/sitemap.xml") {
                return await cachedHtml(
                    "https://ssr.agrivia.ai/sitemap.xml",
                    () => handleSitemap(env),
                    GUIDE_CACHE_TTL
                );
            }
            if (url.pathname === "/guides" || url.pathname.startsWith("/guides/")) {
                return await handleGuidesHtml(request, env, url);
            }
            if (url.pathname === "/404.html") {
                return html(404, notFoundPage(), { "Cache-Control": "public, max-age=3600", "X-Robots-Tag": "noindex" });
            }
            return await passSite(request, env);
        } catch (err) {
            if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
                return json(502, UNAVAILABLE);
            }
            return html(502, notFoundPage(), { "Cache-Control": "no-store" });
        }
    },
};
