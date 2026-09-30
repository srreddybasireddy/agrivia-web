/**
 * Community feed. Same /api origin as farm and guides.
 * Guests may read. Sign-in is required to post, like, comment, or report.
 * Photos and videos are sent as multipart bytes (R2 on the worker), not data URLs.
 */
(function (global) {
    const config = global.AgriviaConfig;
    const MAX_CAPTION = 800;
    const MAX_PHOTO_BYTES = 12 * 1024 * 1024;
    const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
    const MAX_VIDEO_SECONDS = 60;
    const NEAR_MILES = 25;
    const PHOTO_EXT = ["jpg", "jpeg", "png", "webp", "heic", "heif", "gif"];
    const VIDEO_EXT = ["mp4", "mov", "m4v", "webm"];

    function apiUrl(path) {
        return `${config.apiBasePath}${path}`;
    }

    function authHeaders(extra) {
        const headers = { Accept: "application/json", ...(extra || {}) };
        const token = global.AgriviaAuth && global.AgriviaAuth.getSessionToken();
        if (token) {
            headers.Authorization = `Bearer ${token}`;
        }
        return headers;
    }

    async function parseJson(response) {
        const text = await response.text();
        if (!text) {
            return {};
        }
        try {
            return JSON.parse(text);
        } catch (err) {
            throw new Error("The community API returned an unexpected response.");
        }
    }

    async function request(path, options) {
        const response = await fetch(apiUrl(path), {
            ...(options || {}),
            headers: authHeaders(options && options.headers),
        });
        const data = await parseJson(response);
        if (!response.ok) {
            const detail = data.detail || data.error || data.message;
            throw new Error(typeof detail === "string" ? detail : "Community is unavailable.");
        }
        return data;
    }

    function queryString(params) {
        const search = new URLSearchParams();
        Object.keys(params || {}).forEach((key) => {
            const value = params[key];
            if (value === undefined || value === null || value === "") {
                return;
            }
            search.set(key, String(value));
        });
        const encoded = search.toString();
        return encoded ? `?${encoded}` : "";
    }

    function fileExtension(name) {
        const base = String(name || "").split(/[\\/]/).pop() || "";
        const dot = base.lastIndexOf(".");
        return dot >= 0 ? base.slice(dot + 1).toLowerCase() : "";
    }

    function megabytes(bytes) {
        const mb = bytes / (1024 * 1024);
        if (mb >= 10) {
            return String(Math.round(mb));
        }
        return mb.toFixed(1).replace(/\.0$/, "");
    }

    function maxBytesFor(type) {
        return type === "video" ? MAX_VIDEO_BYTES : MAX_PHOTO_BYTES;
    }

    function isPhotoFile(file) {
        const mime = String(file && file.type || "").toLowerCase();
        if (mime.startsWith("image/")) {
            return true;
        }
        return PHOTO_EXT.indexOf(fileExtension(file && file.name)) !== -1;
    }

    function isVideoFile(file) {
        const mime = String(file && file.type || "").toLowerCase();
        if (mime.startsWith("video/")) {
            return true;
        }
        return VIDEO_EXT.indexOf(fileExtension(file && file.name)) !== -1;
    }

    function videoDuration(file) {
        return new Promise((resolve) => {
            const url = URL.createObjectURL(file);
            const video = document.createElement("video");
            let settled = false;
            const finish = (seconds) => {
                if (settled) {
                    return;
                }
                settled = true;
                clearTimeout(timer);
                URL.revokeObjectURL(url);
                video.removeAttribute("src");
                video.load();
                resolve(seconds);
            };
            const timer = setTimeout(() => finish(0), 8000);
            video.preload = "metadata";
            video.onloadedmetadata = () => {
                const seconds = Number(video.duration);
                finish(Number.isFinite(seconds) ? seconds : 0);
            };
            video.onerror = () => finish(0);
            video.src = url;
        });
    }

    async function validateMedia(type, file) {
        if (type !== "photo" && type !== "video") {
            return { ok: true, message: "" };
        }
        if (!file) {
            throw new Error(type === "photo" ? "Add a photo." : "Add a video.");
        }
        const maxBytes = maxBytesFor(type);
        const kind = type === "video" ? "Videos" : "Photos";
        if (file.size > maxBytes) {
            throw new Error(
                `${file.name || "That file"} is ${megabytes(file.size)} MB. ${kind} can be ${megabytes(maxBytes)} MB.`
            );
        }
        if (type === "photo" && !isPhotoFile(file)) {
            throw new Error("Choose a photo file.");
        }
        if (type === "video") {
            if (!isVideoFile(file)) {
                throw new Error("Choose a video file.");
            }
            const seconds = await videoDuration(file);
            if (seconds > MAX_VIDEO_SECONDS) {
                throw new Error("Videos can be 60 seconds.");
            }
        }
        return {
            ok: true,
            message: `${file.name || "File"} is ${megabytes(file.size)} MB of ${megabytes(maxBytes)} MB.`,
        };
    }

    global.AgriviaCommunityApi = {
        MAX_CAPTION: MAX_CAPTION,
        MAX_PHOTO_BYTES: MAX_PHOTO_BYTES,
        MAX_VIDEO_BYTES: MAX_VIDEO_BYTES,
        MAX_MEDIA_BYTES: MAX_VIDEO_BYTES,
        MAX_VIDEO_SECONDS: MAX_VIDEO_SECONDS,
        NEAR_MILES: NEAR_MILES,
        validateMedia: validateMedia,
        mediaUrl: function (postId) {
            return apiUrl(`/community/media/${encodeURIComponent(postId)}`);
        },
        list: function (options) {
            const opts = options || {};
            return request(`/community/feed${queryString({
                rank: opts.rank || "near",
                lat: opts.lat,
                lng: opts.lng,
                zip: opts.zip,
            })}`);
        },
        create: async function (fields) {
            const type = fields.type || "text";
            const caption = (fields.caption || "").trim();
            if (!caption) {
                throw new Error("Write a short caption.");
            }
            if (caption.length > MAX_CAPTION) {
                throw new Error(`Captions can be ${MAX_CAPTION} characters.`);
            }
            if (type !== "text" && type !== "photo" && type !== "video") {
                throw new Error("Choose text, photo, or video.");
            }
            await validateMedia(type, fields.file);
            const form = new FormData();
            form.append("type", type);
            form.append("caption", caption);
            form.append("tags", JSON.stringify(Array.isArray(fields.tags) ? fields.tags : []));
            form.append("zipCode", fields.zipCode || "");
            if (fields.lat != null && fields.lat !== "") {
                form.append("lat", String(fields.lat));
            }
            if (fields.lng != null && fields.lng !== "") {
                form.append("lng", String(fields.lng));
            }
            if (fields.file) {
                form.append("media", fields.file, fields.file.name || "media");
            }
            return request("/community/posts", {
                method: "POST",
                body: form,
            });
        },
        like: function (postId, liked) {
            return request(`/community/posts/${encodeURIComponent(postId)}/like`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ liked: Boolean(liked) }),
            });
        },
        comment: function (postId, body) {
            return request(`/community/posts/${encodeURIComponent(postId)}/comments`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ body: body }),
            });
        },
        reportPost: function (postId, reason) {
            return request(`/community/posts/${encodeURIComponent(postId)}/report`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reason: reason || "inappropriate" }),
            });
        },
        reportComment: function (postId, commentId, reason) {
            return request(`/community/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}/report`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reason: reason || "inappropriate" }),
            });
        },
    };
})(window);
