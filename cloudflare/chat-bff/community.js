/**
 * Community posts for agrivia.ai.
 * KV COMMUNITY: index, captions, likes, comments, reports.
 * R2 COMMUNITY_MEDIA: photo and video bytes at community/{postId}.
 * Media is capped at 8 GiB. When a new file would exceed that, the worker
 * deletes unliked or reported media first. If every remaining clip is liked
 * and unreported, it deletes the oldest media next.
 * Guests may read the feed. Sign-in is required to write.
 */

const INDEX_KEY = "community:index";
const MAX_POSTS = 400;
const MAX_CAPTION = 800;
const MAX_COMMENT = 400;
const MAX_PHOTO_BYTES = 12 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const MEDIA_BUDGET_BYTES = 8 * 1024 * 1024 * 1024;
const NEAR_MILES = 25;
const HIDE_AFTER_REPORTS = 3;
const PHOTO_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
    "image/gif",
]);
const VIDEO_TYPES = new Set([
    "video/mp4",
    "video/quicktime",
    "video/webm",
    "video/x-m4v",
]);
const PHOTO_EXT = new Set(["jpg", "jpeg", "png", "webp", "heic", "heif", "gif"]);
const VIDEO_EXT = new Set(["mp4", "mov", "m4v", "webm"]);

function json(status, body) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
        },
    });
}

function milesBetween(a, b) {
    if (!a || !b || typeof a.lat !== "number" || typeof b.lat !== "number") {
        return null;
    }
    const R = 3958.8;
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLon = ((b.lng - a.lng) * Math.PI) / 180;
    const lat1 = (a.lat * Math.PI) / 180;
    const lat2 = (b.lat * Math.PI) / 180;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function kvStore(env) {
    return env && env.COMMUNITY;
}

function mediaStore(env) {
    return env && env.COMMUNITY_MEDIA;
}

function mediaKey(id) {
    return `community/${id}`;
}

function fileExtension(name) {
    const base = String(name || "").split(/[\\/]/).pop() || "";
    const dot = base.lastIndexOf(".");
    return dot >= 0 ? base.slice(dot + 1).toLowerCase() : "";
}

function inferredType(file, postType) {
    const mime = String((file && file.type) || "").toLowerCase();
    if (postType === "photo") {
        if (PHOTO_TYPES.has(mime)) {
            return mime;
        }
        const ext = fileExtension(file && file.name);
        if (ext === "jpg" || ext === "jpeg") {
            return "image/jpeg";
        }
        if (PHOTO_EXT.has(ext)) {
            return `image/${ext}`;
        }
        return "";
    }
    if (VIDEO_TYPES.has(mime)) {
        return mime === "video/x-m4v" ? "video/mp4" : mime;
    }
    const ext = fileExtension(file && file.name);
    if (ext === "mp4" || ext === "m4v") {
        return "video/mp4";
    }
    if (ext === "mov") {
        return "video/quicktime";
    }
    if (ext === "webm") {
        return "video/webm";
    }
    return "";
}

function parseR2Range(header) {
    if (!header) {
        return null;
    }
    const match = /^bytes=(\d*)-(\d*)$/i.exec(String(header).trim());
    if (!match) {
        return null;
    }
    const startRaw = match[1];
    const endRaw = match[2];
    if (startRaw === "" && endRaw === "") {
        return null;
    }
    if (startRaw === "") {
        const suffix = Number(endRaw);
        return Number.isFinite(suffix) && suffix > 0 ? { suffix } : null;
    }
    const offset = Number(startRaw);
    if (!Number.isFinite(offset) || offset < 0) {
        return null;
    }
    if (endRaw === "") {
        return { offset };
    }
    const end = Number(endRaw);
    if (!Number.isFinite(end) || end < offset) {
        return null;
    }
    return { offset, length: end - offset + 1 };
}

function emailLocalPart(email) {
    const value = String(email || "").trim();
    const at = value.indexOf("@");
    if (at <= 0) {
        return "";
    }
    return value.slice(0, at).slice(0, 80);
}

function pickDisplayName(...candidates) {
    for (let i = 0; i < candidates.length; i += 1) {
        const raw = String(candidates[i] || "").trim();
        if (!raw || /^grower$/i.test(raw)) {
            continue;
        }
        if (raw.indexOf("@") !== -1) {
            const local = emailLocalPart(raw);
            if (local) {
                return local;
            }
            continue;
        }
        return raw.slice(0, 80);
    }
    return "";
}

async function currentUser(request, env, fetchOrigin) {
    const authorization = request.headers.get("Authorization");
    if (!authorization) {
        return null;
    }
    const originRes = await fetchOrigin(env, "/auth/me", {
        method: "GET",
        headers: {
            Accept: "application/json",
            Authorization: authorization,
        },
    });
    if (!originRes.ok) {
        return null;
    }
    const data = await originRes.json().catch(() => ({}));
    const farmUuid = data.deviceUuid || data.farmUuid || data.userId || "";
    if (!farmUuid) {
        return null;
    }
    let name = pickDisplayName(data.userName, data.name, data.givenName, data.displayName);
    if (!name) {
        const profileRes = await fetchOrigin(env, `/users/${farmUuid}/profile`, {
            method: "GET",
            headers: {
                Accept: "application/json",
                Authorization: authorization,
            },
        });
        if (profileRes.ok) {
            const profile = await profileRes.json().catch(() => ({}));
            name = pickDisplayName(profile.userName, profile.name, profile.email);
        }
    }
    if (!name) {
        name = pickDisplayName(data.email) || "Grower";
    }
    return {
        id: String(farmUuid),
        name: name,
        email: data.email || "",
    };
}

async function readIndex(kv) {
    const raw = await kv.get(INDEX_KEY);
    if (!raw) {
        return [];
    }
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
        return [];
    }
}

async function writeIndex(kv, ids) {
    await kv.put(INDEX_KEY, JSON.stringify(ids.slice(0, MAX_POSTS)));
}

async function readPost(kv, id) {
    const raw = await kv.get(`community:post:${id}`);
    if (!raw) {
        return null;
    }
    try {
        return JSON.parse(raw);
    } catch (err) {
        return null;
    }
}

async function writePost(kv, post) {
    await kv.put(`community:post:${post.id}`, JSON.stringify(post));
}

function mediaSize(post) {
    if (!post || !post.hasMedia) {
        return 0;
    }
    const stored = Number(post.mediaBytes);
    if (Number.isFinite(stored) && stored > 0) {
        return stored;
    }
    return MAX_VIDEO_BYTES;
}

function isUnpopular(post) {
    const likes = (post.likes || []).length;
    const reports = (post.reports || []).length;
    return likes === 0 || reports > 0;
}

function compareEviction(a, b) {
    const unpopularA = isUnpopular(a);
    const unpopularB = isUnpopular(b);
    if (unpopularA !== unpopularB) {
        return unpopularA ? -1 : 1;
    }
    if (unpopularA) {
        const likeA = (a.likes || []).length;
        const likeB = (b.likes || []).length;
        if (likeA !== likeB) {
            return likeA - likeB;
        }
        const reportsA = (a.reports || []).length;
        const reportsB = (b.reports || []).length;
        if (reportsA !== reportsB) {
            return reportsB - reportsA;
        }
    }
    return (Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0);
}

async function deleteStoredPost(kv, r2, post) {
    if (r2 && post.hasMedia) {
        await r2.delete(mediaKey(post.id));
    }
    await kv.delete(`community:post:${post.id}`);
    await kv.delete(`community:media:${post.id}`);
}

async function makeRoomForMedia(kv, r2, neededBytes) {
    const ids = await readIndex(kv);
    const posts = [];
    for (const id of ids) {
        const post = await readPost(kv, id);
        if (post) {
            posts.push(post);
        }
    }
    let used = posts.reduce((sum, post) => sum + mediaSize(post), 0);
    if (used + neededBytes <= MEDIA_BUDGET_BYTES) {
        return ids;
    }
    const keep = new Set(ids);
    const victims = posts.filter((post) => post.hasMedia).sort(compareEviction);
    for (const victim of victims) {
        if (used + neededBytes <= MEDIA_BUDGET_BYTES) {
            break;
        }
        await deleteStoredPost(kv, r2, victim);
        keep.delete(victim.id);
        used -= mediaSize(victim);
    }
    const nextIds = ids.filter((id) => keep.has(id));
    await writeIndex(kv, nextIds);
    return nextIds;
}

function publicPost(post, viewerId, origin, viewerPoint) {
    const comments = Array.isArray(post.comments) ? post.comments : [];
    const visibleComments = comments
        .filter((row) => (row.reports || []).length < HIDE_AFTER_REPORTS)
        .map((row) => ({
            id: row.id,
            authorName: row.authorName,
            mine: Boolean(viewerId && row.authorId === viewerId),
            body: row.body,
            createdAt: row.createdAt,
        }));
    const likes = Array.isArray(post.likes) ? post.likes : [];
    return {
        id: post.id,
        type: post.type,
        caption: post.caption,
        tags: post.tags || [],
        authorName: post.authorName,
        mine: Boolean(viewerId && post.authorId === viewerId),
        zipCode: post.zipCode || "",
        createdAt: post.createdAt,
        hasMedia: Boolean(post.hasMedia),
        likeCount: likes.length,
        liked: Boolean(viewerId && likes.indexOf(viewerId) !== -1),
        commentCount: visibleComments.length,
        comments: visibleComments,
        miles: milesBetween(viewerPoint, { lat: post.lat, lng: post.lng }),
        mediaUrl: post.hasMedia ? `${origin}/api/community/media/${post.id}` : "",
    };
}

function parsePoint(url) {
    const lat = Number(url.searchParams.get("lat"));
    const lng = Number(url.searchParams.get("lng"));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return null;
    }
    return { lat, lng };
}

function parseTags(raw) {
    if (Array.isArray(raw)) {
        return raw.map((tag) => String(tag).trim().toLowerCase()).filter(Boolean).slice(0, 6);
    }
    if (typeof raw !== "string" || !raw.trim()) {
        return [];
    }
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            return parsed.map((tag) => String(tag).trim().toLowerCase()).filter(Boolean).slice(0, 6);
        }
    } catch (err) {
        /* comma-separated */
    }
    return raw.split(",").map((tag) => tag.trim().toLowerCase()).filter(Boolean).slice(0, 6);
}

async function readCreateBody(request) {
    const contentType = request.headers.get("Content-Type") || "";
    if (contentType.includes("multipart/form-data")) {
        const form = await request.formData();
        const media = form.get("media");
        const blob = media && typeof media === "object" && Number(media.size) > 0 ? media : null;
        return {
            type: String(form.get("type") || "text"),
            caption: String(form.get("caption") || ""),
            tags: parseTags(form.get("tags")),
            zipCode: String(form.get("zipCode") || ""),
            lat: form.get("lat"),
            lng: form.get("lng"),
            media: blob,
        };
    }
    const body = await request.json().catch(() => null);
    if (!body) {
        return null;
    }
    return {
        type: body.type,
        caption: body.caption,
        tags: parseTags(body.tags),
        zipCode: body.zipCode,
        lat: body.lat,
        lng: body.lng,
        media: null,
    };
}

async function serveLegacyKvMedia(kv, id) {
    const raw = await kv.get(`community:media:${id}`);
    if (!raw || !raw.startsWith("data:")) {
        return null;
    }
    const comma = raw.indexOf(",");
    const meta = comma > 0 ? raw.slice(0, comma) : "";
    const payload = comma > 0 ? raw.slice(comma + 1) : raw;
    const mime = /data:([^;]+)/.exec(meta);
    const bytes = Uint8Array.from(atob(payload), (ch) => ch.charCodeAt(0));
    return new Response(bytes, {
        status: 200,
        headers: {
            "Content-Type": mime ? mime[1] : "application/octet-stream",
            "Cache-Control": "public, max-age=86400",
            "Accept-Ranges": "bytes",
        },
    });
}

function mediaResponse(object, method) {
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("Accept-Ranges", "bytes");
    headers.set("Cache-Control", "public, max-age=86400");
    const ranged = object.range && typeof object.range.offset === "number";
    if (ranged) {
        const start = object.range.offset;
        const length = object.range.length;
        headers.set("Content-Range", `bytes ${start}-${start + length - 1}/${object.size}`);
        headers.set("Content-Length", String(length));
    } else if (typeof object.size === "number") {
        headers.set("Content-Length", String(object.size));
    }
    const status = ranged ? 206 : 200;
    if (method === "HEAD") {
        return new Response(null, { status, headers });
    }
    return new Response(object.body, { status, headers });
}

export function isCommunityPath(path) {
    return path === "/community/feed"
        || path === "/community/posts"
        || /^\/community\/media\/[a-z0-9-]+$/i.test(path)
        || /^\/community\/posts\/[a-z0-9-]+\/like$/i.test(path)
        || /^\/community\/posts\/[a-z0-9-]+\/comments$/i.test(path)
        || /^\/community\/posts\/[a-z0-9-]+\/report$/i.test(path)
        || /^\/community\/posts\/[a-z0-9-]+\/comments\/[a-z0-9-]+\/report$/i.test(path);
}

export async function handleCommunity(request, env, fetchOrigin) {
    const kv = kvStore(env);
    if (!kv) {
        if (request.method === "GET" && request.url.includes("/community/feed")) {
            return json(200, { posts: [], locationNeeded: true });
        }
        return json(503, { error: "Community posting is not enabled on this worker yet." });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/api/, "") || "/";
    const origin = `${url.protocol}//${url.host}`;
    const r2 = mediaStore(env);

    if (path === "/community/feed" && request.method === "GET") {
        const viewer = await currentUser(request, env, fetchOrigin);
        const rank = url.searchParams.get("rank") || "near";
        const viewerPoint = parsePoint(url);
        const ids = await readIndex(kv);
        const loaded = [];
        for (const id of ids) {
            const post = await readPost(kv, id);
            if (!post) {
                continue;
            }
            if ((post.reports || []).length >= HIDE_AFTER_REPORTS) {
                continue;
            }
            if (
                viewer
                && post.authorId === viewer.id
                && viewer.name
                && !/^grower$/i.test(viewer.name)
                && (!post.authorName || /^grower$/i.test(String(post.authorName)))
            ) {
                post.authorName = viewer.name;
                await writePost(kv, post);
            }
            loaded.push(post);
        }
        let locationNeeded = false;
        let ordered = loaded.slice();
        if (rank === "top") {
            ordered.sort((a, b) => (b.likes || []).length - (a.likes || []).length || Date.parse(b.createdAt) - Date.parse(a.createdAt));
        } else if (rank === "for_you") {
            ordered.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
        } else if (viewerPoint) {
            ordered = ordered
                .map((post) => ({ post, miles: milesBetween(viewerPoint, { lat: post.lat, lng: post.lng }) }))
                .filter((row) => row.miles === null || row.miles <= NEAR_MILES)
                .sort((a, b) => {
                    if (a.miles === null && b.miles === null) {
                        return Date.parse(b.post.createdAt) - Date.parse(a.post.createdAt);
                    }
                    if (a.miles === null) {
                        return 1;
                    }
                    if (b.miles === null) {
                        return -1;
                    }
                    return a.miles - b.miles;
                })
                .map((row) => row.post);
        } else {
            locationNeeded = true;
            ordered.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
        }
        return json(200, {
            posts: ordered.slice(0, 24).map((post) => publicPost(post, viewer && viewer.id, origin, viewerPoint)),
            locationNeeded: locationNeeded,
        });
    }

    const mediaMatch = path.match(/^\/community\/media\/([a-z0-9-]+)$/i);
    if (mediaMatch && (request.method === "GET" || request.method === "HEAD")) {
        const id = mediaMatch[1];
        if (r2) {
            const range = parseR2Range(request.headers.get("Range"));
            const object = await r2.get(mediaKey(id), range ? { range } : undefined);
            if (object) {
                return mediaResponse(object, request.method);
            }
        }
        if (request.method === "GET") {
            const legacy = await serveLegacyKvMedia(kv, id);
            if (legacy) {
                return legacy;
            }
        }
        return json(404, { error: "Media not found." });
    }

    if (path === "/community/posts" && request.method === "POST") {
        const viewer = await currentUser(request, env, fetchOrigin);
        if (!viewer) {
            return json(401, { error: "Sign in to share a post." });
        }
        const body = await readCreateBody(request);
        if (!body) {
            return json(400, { error: "Expected a multipart or JSON body." });
        }
        const type = body.type === "photo" || body.type === "video" ? body.type : "text";
        const caption = typeof body.caption === "string" ? body.caption.trim() : "";
        if (!caption || caption.length > MAX_CAPTION) {
            return json(400, { error: `Write a caption up to ${MAX_CAPTION} characters.` });
        }
        if (type !== "text") {
            if (!r2) {
                return json(503, { error: "Community media storage is not enabled on this worker yet." });
            }
            const file = body.media;
            if (!file) {
                return json(400, { error: type === "photo" ? "Add a photo." : "Add a video." });
            }
            const maxBytes = type === "video" ? MAX_VIDEO_BYTES : MAX_PHOTO_BYTES;
            if (file.size > maxBytes) {
                const capMb = Math.round(maxBytes / (1024 * 1024));
                return json(400, { error: `${type === "video" ? "Videos" : "Photos"} can be ${capMb} MB.` });
            }
            const mediaType = inferredType(file, type);
            if (!mediaType) {
                return json(400, { error: type === "photo" ? "Choose a photo file." : "Choose a video file." });
            }
            const id = crypto.randomUUID();
            const ids = await makeRoomForMedia(kv, r2, file.size);
            await r2.put(mediaKey(id), file, {
                httpMetadata: {
                    contentType: mediaType,
                    cacheControl: "public, max-age=86400",
                },
            });
            const post = {
                id: id,
                type: type,
                caption: caption,
                tags: body.tags,
                authorId: viewer.id,
                authorName: viewer.name,
                zipCode: typeof body.zipCode === "string" ? body.zipCode.trim().slice(0, 16) : "",
                lat: Number(body.lat),
                lng: Number(body.lng),
                hasMedia: true,
                mediaType: mediaType,
                mediaBytes: file.size,
                likes: [],
                comments: [],
                reports: [],
                createdAt: new Date().toISOString(),
            };
            if (!Number.isFinite(post.lat) || !Number.isFinite(post.lng)) {
                post.lat = null;
                post.lng = null;
            }
            await writePost(kv, post);
            ids.unshift(id);
            await writeIndex(kv, ids);
            return json(201, { post: publicPost(post, viewer.id, origin, null) });
        }
        const id = crypto.randomUUID();
        const post = {
            id: id,
            type: "text",
            caption: caption,
            tags: body.tags,
            authorId: viewer.id,
            authorName: viewer.name,
            zipCode: typeof body.zipCode === "string" ? body.zipCode.trim().slice(0, 16) : "",
            lat: Number(body.lat),
            lng: Number(body.lng),
            hasMedia: false,
            likes: [],
            comments: [],
            reports: [],
            createdAt: new Date().toISOString(),
        };
        if (!Number.isFinite(post.lat) || !Number.isFinite(post.lng)) {
            post.lat = null;
            post.lng = null;
        }
        await writePost(kv, post);
        const ids = await readIndex(kv);
        ids.unshift(id);
        await writeIndex(kv, ids);
        return json(201, { post: publicPost(post, viewer.id, origin, null) });
    }

    const likePath = path.match(/^\/community\/posts\/([a-z0-9-]+)\/like$/i);
    if (likePath && request.method === "POST") {
        const viewer = await currentUser(request, env, fetchOrigin);
        if (!viewer) {
            return json(401, { error: "Sign in to like a post." });
        }
        const post = await readPost(kv, likePath[1]);
        if (!post) {
            return json(404, { error: "Post not found." });
        }
        const body = await request.json().catch(() => ({}));
        const likes = Array.isArray(post.likes) ? post.likes.slice() : [];
        const already = likes.indexOf(viewer.id);
        if (body.liked === false) {
            if (already !== -1) {
                likes.splice(already, 1);
            }
        } else if (already === -1) {
            likes.push(viewer.id);
        }
        post.likes = likes;
        await writePost(kv, post);
        return json(200, { liked: likes.indexOf(viewer.id) !== -1, likeCount: likes.length });
    }

    const commentMatch = path.match(/^\/community\/posts\/([a-z0-9-]+)\/comments$/i);
    if (commentMatch && request.method === "POST") {
        const viewer = await currentUser(request, env, fetchOrigin);
        if (!viewer) {
            return json(401, { error: "Sign in to comment." });
        }
        const post = await readPost(kv, commentMatch[1]);
        if (!post) {
            return json(404, { error: "Post not found." });
        }
        const body = await request.json().catch(() => ({}));
        const text = typeof body.body === "string" ? body.body.trim() : "";
        if (!text || text.length > MAX_COMMENT) {
            return json(400, { error: `Comments can be ${MAX_COMMENT} characters.` });
        }
        const comment = {
            id: crypto.randomUUID(),
            authorId: viewer.id,
            authorName: viewer.name,
            body: text,
            createdAt: new Date().toISOString(),
            reports: [],
        };
        post.comments = Array.isArray(post.comments) ? post.comments : [];
        post.comments.push(comment);
        await writePost(kv, post);
        return json(201, { comment: { id: comment.id, authorName: comment.authorName, body: comment.body, createdAt: comment.createdAt } });
    }

    const reportPost = path.match(/^\/community\/posts\/([a-z0-9-]+)\/report$/i);
    if (reportPost && request.method === "POST") {
        const viewer = await currentUser(request, env, fetchOrigin);
        if (!viewer) {
            return json(401, { error: "Sign in to report." });
        }
        const post = await readPost(kv, reportPost[1]);
        if (!post) {
            return json(404, { error: "Post not found." });
        }
        post.reports = Array.isArray(post.reports) ? post.reports : [];
        if (!post.reports.some((row) => row.reporterId === viewer.id)) {
            post.reports.push({ reporterId: viewer.id, createdAt: new Date().toISOString() });
            await writePost(kv, post);
        }
        return json(200, { ok: true });
    }

    const reportComment = path.match(/^\/community\/posts\/([a-z0-9-]+)\/comments\/([a-z0-9-]+)\/report$/i);
    if (reportComment && request.method === "POST") {
        const viewer = await currentUser(request, env, fetchOrigin);
        if (!viewer) {
            return json(401, { error: "Sign in to report." });
        }
        const post = await readPost(kv, reportComment[1]);
        if (!post) {
            return json(404, { error: "Post not found." });
        }
        const comment = (post.comments || []).find((row) => row.id === reportComment[2]);
        if (!comment) {
            return json(404, { error: "Comment not found." });
        }
        comment.reports = Array.isArray(comment.reports) ? comment.reports : [];
        if (!comment.reports.some((row) => row.reporterId === viewer.id)) {
            comment.reports.push({ reporterId: viewer.id, createdAt: new Date().toISOString() });
            await writePost(kv, post);
        }
        return json(200, { ok: true });
    }

    return json(405, { error: "Method not allowed." });
}
