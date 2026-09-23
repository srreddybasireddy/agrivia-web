/**
 * Homepage community strip: feed ranks, composer, likes, comments, reports.
 */
(function (global) {
    const api = global.AgriviaCommunityApi;
    const RANK_TITLES = {
        near: "Community near you",
        top: "Top community posts",
        for_you: "Community for you",
    };

    let rank = "near";
    let viewer = { lat: null, lng: null, zip: "", name: "", id: "" };
    let posts = [];

    function el(id) {
        return document.getElementById(id);
    }

    function signedIn() {
        return Boolean(global.AgriviaAuth && global.AgriviaAuth.isSignedIn());
    }

    function escapeHtml(value) {
        return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function timeAgo(iso) {
        const then = Date.parse(iso);
        if (!then) {
            return "";
        }
        const minutes = Math.max(0, Math.round((Date.now() - then) / 60000));
        if (minutes < 1) {
            return "now";
        }
        if (minutes < 60) {
            return `${minutes}m`;
        }
        const hours = Math.round(minutes / 60);
        if (hours < 24) {
            return `${hours}h`;
        }
        const days = Math.round(hours / 24);
        return `${days}d`;
    }

    function emailLocalPart(email) {
        const value = String(email || "").trim();
        const at = value.indexOf("@");
        if (at <= 0) {
            return "";
        }
        return value.slice(0, at);
    }

    function pickDisplayName() {
        const values = Array.prototype.slice.call(arguments);
        for (let i = 0; i < values.length; i += 1) {
            const raw = String(values[i] || "").trim();
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
            return raw;
        }
        return "";
    }

    function authorLabel(post) {
        const stored = String(post && post.authorName || "").trim();
        if (stored && !/^grower$/i.test(stored)) {
            return stored;
        }
        if (post && post.mine) {
            const mine = pickDisplayName(viewer.name);
            if (mine) {
                return mine;
            }
        }
        return stored || "Grower";
    }

    function milesLabel(post) {
        if (typeof post.miles === "number" && Number.isFinite(post.miles) && post.miles <= api.NEAR_MILES) {
            return `${Math.max(1, Math.round(post.miles))} mi away`;
        }
        return post.zipCode || "";
    }

    function captionText(text) {
        return String(text || "").trim();
    }

    function setStatus(message, isError) {
        const node = el("communityStatus");
        if (!node) {
            return;
        }
        node.hidden = !message;
        node.textContent = message || "";
        node.classList.toggle("is-error", Boolean(isError));
    }

    function requireSignIn(action) {
        if (signedIn()) {
            return true;
        }
        setStatus(`Sign in with Google to ${action}.`, true);
        const guest = el("googleSignInBtn");
        if (guest) {
            guest.scrollIntoView({ behavior: "smooth", block: "center" });
        }
        return false;
    }

    function renderEmpty(title, detail) {
        const grid = el("communityGrid");
        if (!grid) {
            return;
        }
        grid.replaceChildren();
        const empty = document.createElement("div");
        empty.className = "community-empty paper-card";
        empty.innerHTML = `<p><strong>${escapeHtml(title)}</strong></p><p>${escapeHtml(detail)}</p>`;
        grid.appendChild(empty);
    }

    function mediaBlock(post) {
        if (post.type === "photo" && post.hasMedia) {
            return `<div class="community-photo community-photo--image"><img src="${escapeHtml(api.mediaUrl(post.id))}" alt=""></div>`;
        }
        if (post.type === "video" && post.hasMedia) {
            return `<div class="community-photo community-photo--video">
                <video src="${escapeHtml(api.mediaUrl(post.id))}" playsinline muted loop preload="metadata"></video>
                <button type="button" class="community-play" data-play-video aria-label="Play video">
                    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M8 5.5v13l11-6.5-11-6.5z"></path></svg>
                </button>
            </div>`;
        }
        return "";
    }

    function tagsBlock(post) {
        const tags = Array.isArray(post.tags) ? post.tags.filter(Boolean).slice(0, 6) : [];
        if (!tags.length) {
            return "";
        }
        return `<div class="community-tags">${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>`;
    }

    function commentsBlock(post) {
        const comments = Array.isArray(post.comments) ? post.comments : [];
        const items = comments.map((comment) => `
            <li class="community-comment">
                <div>
                    <strong>${escapeHtml(authorLabel(comment))}</strong>
                    <p>${escapeHtml(comment.body || "")}</p>
                </div>
                <button type="button" class="community-report" data-report-comment="${escapeHtml(post.id)}" data-comment-id="${escapeHtml(comment.id)}" aria-label="Report comment">Report</button>
            </li>
        `).join("");
        return `
            <div class="community-comments" hidden data-comments-for="${escapeHtml(post.id)}">
                <ul>${items || "<li class=\"community-comment-empty\">No comments yet.</li>"}</ul>
                <form class="community-comment-form" data-comment-form="${escapeHtml(post.id)}">
                    <label class="visually-hidden" for="comment-${escapeHtml(post.id)}">Comment</label>
                    <input id="comment-${escapeHtml(post.id)}" class="form-input" maxlength="400" placeholder="Write a comment">
                    <button type="submit" class="btn btn-primary btn-sm">Reply</button>
                </form>
            </div>
        `;
    }

    function renderPosts() {
        const grid = el("communityGrid");
        if (!grid) {
            return;
        }
        grid.replaceChildren();
        if (!posts.length) {
            const nearHint = rank === "near"
                ? `No posts within ${api.NEAR_MILES} miles yet. Be the first to share a bed, flock, or harvest.`
                : "No posts yet. Be the first to share a bed, flock, or harvest.";
            renderEmpty("No community posts yet", nearHint);
            return;
        }
        posts.forEach((post) => {
            const card = document.createElement("article");
            card.className = "community-card paper-card";
            const liked = Boolean(post.liked);
            const name = authorLabel(post);
            const miles = milesLabel(post);
            const caption = captionText(post.caption);
            card.innerHTML = `
                <div class="community-who">
                    <span class="community-av" aria-hidden="true">${escapeHtml((name || "G").slice(0, 1).toUpperCase())}</span>
                    <strong>${escapeHtml(name)}</strong>
                    <span class="community-time">${escapeHtml(timeAgo(post.createdAt))}</span>
                    ${miles ? `<span class="community-meta">${escapeHtml(miles)}</span>` : ""}
                </div>
                ${caption ? `<p class="community-caption">${escapeHtml(caption)}</p>` : ""}
                ${mediaBlock(post)}
                ${tagsBlock(post)}
                <div class="community-actions">
                    <button type="button" class="community-like${liked ? " is-on" : ""}" data-like="${escapeHtml(post.id)}" aria-pressed="${liked ? "true" : "false"}">♥ ${Number(post.likeCount) || 0}</button>
                    <button type="button" class="community-toggle-comments" data-toggle-comments="${escapeHtml(post.id)}">Comment ${Number(post.commentCount) || 0}</button>
                    <button type="button" class="community-report" data-report-post="${escapeHtml(post.id)}" aria-label="Report post">Report</button>
                </div>
                ${commentsBlock(post)}
            `;
            grid.appendChild(card);
        });
        bindMediaFrames(grid);
    }

    function minFeedRatio() {
        return window.matchMedia("(min-width: 768px)").matches ? 16 / 10 : 4 / 5;
    }

    function clampFeedRatio(width, height) {
        const min = minFeedRatio();
        if (!width || !height) {
            return min;
        }
        return Math.min(1.91, Math.max(min, width / height));
    }

    function applyMediaRatio(frame, width, height) {
        if (!frame) {
            return;
        }
        frame.style.aspectRatio = String(clampFeedRatio(width, height));
    }

    function bindMediaFrames(grid) {
        if (!grid) {
            return;
        }
        grid.querySelectorAll(".community-photo img").forEach((image) => {
            const frame = image.closest(".community-photo");
            if (image.naturalWidth) {
                applyMediaRatio(frame, image.naturalWidth, image.naturalHeight);
            } else {
                image.addEventListener("load", () => {
                    applyMediaRatio(frame, image.naturalWidth, image.naturalHeight);
                }, { once: true });
            }
        });
        grid.querySelectorAll(".community-photo video").forEach((video) => {
            const frame = video.closest(".community-photo");
            const fit = () => applyMediaRatio(frame, video.videoWidth, video.videoHeight);
            if (video.videoWidth) {
                fit();
            } else {
                video.addEventListener("loadedmetadata", fit, { once: true });
            }
            video.addEventListener("play", () => frame && frame.classList.add("is-playing"));
            video.addEventListener("pause", () => frame && frame.classList.remove("is-playing"));
            video.addEventListener("ended", () => frame && frame.classList.remove("is-playing"));
        });
    }

    function toggleVideo(button) {
        const frame = button.closest(".community-photo");
        const video = frame && frame.querySelector("video");
        if (!video) {
            return;
        }
        if (video.paused) {
            document.querySelectorAll(".community-photo video").forEach((other) => {
                if (other !== video) {
                    other.pause();
                }
            });
            video.muted = false;
            video.play().catch(() => {
                video.muted = true;
                return video.play();
            });
        } else {
            video.pause();
        }
    }

    async function loadFeed() {
        const title = el("communityHeading");
        if (title) {
            title.textContent = RANK_TITLES[rank] || RANK_TITLES.near;
        }
        setStatus("Loading posts…", false);
        try {
            const data = await api.list({
                rank: rank,
                lat: viewer.lat,
                lng: viewer.lng,
                zip: viewer.zip,
            });
            posts = Array.isArray(data.posts) ? data.posts : [];
            setStatus("", false);
            renderPosts();
            if (data.locationNeeded && rank === "near" && posts.length) {
                setStatus(`Showing recent posts. Add a ZIP on Farm, or allow location, to limit the feed to ${api.NEAR_MILES} miles.`, false);
            }
        } catch (err) {
            posts = [];
            renderEmpty(
                "No community posts yet",
                "Be the first to share a bed, flock, or harvest. Sign in, then use Share your post."
            );
            const message = err.message || "";
            if (message && !/not found/i.test(message)) {
                setStatus(message, true);
            } else {
                setStatus("", false);
            }
        }
    }

    function setRank(next) {
        rank = next;
        document.querySelectorAll("[data-community-rank]").forEach((button) => {
            const on = button.getAttribute("data-community-rank") === rank;
            button.classList.toggle("is-on", on);
            button.setAttribute("aria-pressed", on ? "true" : "false");
        });
        loadFeed();
    }

    function openComposer() {
        if (!requireSignIn("share a post")) {
            return;
        }
        const dialog = el("communityComposer");
        if (dialog && typeof dialog.showModal === "function") {
            dialog.showModal();
        }
    }

    function closeComposer() {
        const dialog = el("communityComposer");
        if (dialog && dialog.open) {
            dialog.close();
        }
    }

    function selectedType() {
        const checked = document.querySelector("input[name=\"communityPostType\"]:checked");
        return (checked && checked.value) || "text";
    }

    function setComposerStatus(message, isError) {
        const status = el("communityComposerStatus");
        if (!status) {
            return;
        }
        status.textContent = message || "";
        status.classList.toggle("is-error", Boolean(isError));
    }

    function setPostEnabled(enabled) {
        const submit = el("communityComposerSubmit");
        if (submit) {
            submit.disabled = !enabled;
        }
    }

    function pickedFile() {
        const file = el("communityFile");
        return file && file.files && file.files[0] ? file.files[0] : null;
    }

    async function checkPickedFile() {
        const type = selectedType();
        if (type === "text") {
            setComposerStatus("", false);
            setPostEnabled(true);
            return true;
        }
        const file = pickedFile();
        if (!file) {
            setComposerStatus("", false);
            setPostEnabled(true);
            return true;
        }
        try {
            const result = await api.validateMedia(type, file);
            setComposerStatus(result.message || "", false);
            setPostEnabled(true);
            return true;
        } catch (err) {
            setComposerStatus(err.message || "That file cannot be posted.", true);
            setPostEnabled(false);
            return false;
        }
    }

    function syncComposerType() {
        const type = selectedType();
        const fileWrap = el("communityFileWrap");
        const file = el("communityFile");
        const hint = el("communityFileHint");
        if (fileWrap) {
            fileWrap.hidden = type === "text";
        }
        if (file) {
            file.required = type !== "text";
            file.accept = type === "video" ? "video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm" : "image/*";
            file.value = "";
        }
        if (hint) {
            hint.textContent = type === "video"
                ? "Videos up to 50 MB and 60 seconds."
                : "Photos up to 12 MB.";
        }
        setComposerStatus("", false);
        setPostEnabled(true);
    }

    async function submitComposer(event) {
        event.preventDefault();
        if (!requireSignIn("share a post")) {
            return;
        }
        const type = selectedType();
        const fileOk = await checkPickedFile();
        if (!fileOk) {
            return;
        }
        const caption = el("communityCaption");
        const tags = el("communityTags");
        const file = el("communityFile");
        setComposerStatus("Posting…", false);
        setPostEnabled(false);
        try {
            await api.create({
                type: type,
                caption: caption ? caption.value : "",
                tags: tags && tags.value
                    ? tags.value.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean).slice(0, 6)
                    : [],
                zipCode: viewer.zip,
                lat: viewer.lat,
                lng: viewer.lng,
                file: pickedFile(),
            });
            if (caption) {
                caption.value = "";
            }
            if (tags) {
                tags.value = "";
            }
            if (file) {
                file.value = "";
            }
            closeComposer();
            setComposerStatus("", false);
            setStatus("Posted to the community feed.", false);
            await loadFeed();
        } catch (err) {
            setComposerStatus(err.message || "Could not post.", true);
        } finally {
            setPostEnabled(true);
        }
    }

    async function onGridClick(event) {
        const videoFrame = event.target.closest(".community-photo--video");
        if (videoFrame) {
            const play = videoFrame.querySelector("[data-play-video]");
            if (play) {
                toggleVideo(play);
            }
            return;
        }
        const likeBtn = event.target.closest("[data-like]");
        if (likeBtn) {
            if (!requireSignIn("like a post")) {
                return;
            }
            const id = likeBtn.getAttribute("data-like");
            const next = likeBtn.getAttribute("aria-pressed") !== "true";
            try {
                const data = await api.like(id, next);
                const post = posts.find((row) => row.id === id);
                if (post) {
                    post.liked = Boolean(data.liked);
                    post.likeCount = Number(data.likeCount) || 0;
                }
                renderPosts();
            } catch (err) {
                setStatus(err.message || "Could not like that post.", true);
            }
            return;
        }
        const toggle = event.target.closest("[data-toggle-comments]");
        if (toggle) {
            const panel = document.querySelector(`[data-comments-for="${toggle.getAttribute("data-toggle-comments")}"]`);
            if (panel) {
                panel.hidden = !panel.hidden;
            }
            return;
        }
        const reportPost = event.target.closest("[data-report-post]");
        if (reportPost) {
            if (!requireSignIn("report a post")) {
                return;
            }
            try {
                await api.reportPost(reportPost.getAttribute("data-report-post"));
                setStatus("Thanks. We received the report.", false);
            } catch (err) {
                setStatus(err.message || "Could not send the report.", true);
            }
            return;
        }
        const reportComment = event.target.closest("[data-report-comment]");
        if (reportComment) {
            if (!requireSignIn("report a comment")) {
                return;
            }
            try {
                await api.reportComment(
                    reportComment.getAttribute("data-report-comment"),
                    reportComment.getAttribute("data-comment-id")
                );
                setStatus("Thanks. We received the report.", false);
            } catch (err) {
                setStatus(err.message || "Could not send the report.", true);
            }
        }
    }

    async function onGridSubmit(event) {
        const form = event.target.closest("[data-comment-form]");
        if (!form) {
            return;
        }
        event.preventDefault();
        if (!requireSignIn("comment")) {
            return;
        }
        const input = form.querySelector("input");
        const body = input ? input.value.trim() : "";
        if (!body) {
            return;
        }
        try {
            await api.comment(form.getAttribute("data-comment-form"), body);
            if (input) {
                input.value = "";
            }
            await loadFeed();
        } catch (err) {
            setStatus(err.message || "Could not add that comment.", true);
        }
    }

    async function loadViewerPlace() {
        viewer.id = (global.AgriviaAuth && global.AgriviaAuth.getFarmUuid && global.AgriviaAuth.getFarmUuid()) || "";
        viewer.name = pickDisplayName(
            global.AgriviaAuth && global.AgriviaAuth.getName && global.AgriviaAuth.getName(),
            global.AgriviaAuth && global.AgriviaAuth.getEmail && global.AgriviaAuth.getEmail()
        );
        if (signedIn() && global.AgriviaFarmApi && global.AgriviaFarmApi.getPortfolio) {
            try {
                const portfolio = await global.AgriviaFarmApi.getPortfolio();
                viewer.zip = (portfolio && portfolio.profile && portfolio.profile.zipCode) || "";
                viewer.name = pickDisplayName(
                    portfolio && portfolio.profile && portfolio.profile.userName,
                    viewer.name
                );
            } catch (err) {
                viewer.zip = "";
            }
        }
        if (!navigator.geolocation) {
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (position) => {
                viewer.lat = position.coords.latitude;
                viewer.lng = position.coords.longitude;
                if (rank === "near") {
                    loadFeed();
                }
            },
            () => {},
            { maximumAge: 600000, timeout: 4000 }
        );
    }

    function bind() {
        if (!el("communityFeed")) {
            return;
        }
        document.querySelectorAll("[data-community-rank]").forEach((button) => {
            button.addEventListener("click", () => setRank(button.getAttribute("data-community-rank")));
        });
        const share = el("communityShare");
        if (share) {
            share.addEventListener("click", openComposer);
        }
        const composer = el("communityComposerForm");
        if (composer) {
            composer.addEventListener("submit", submitComposer);
        }
        const cancel = el("communityComposerCancel");
        if (cancel) {
            cancel.addEventListener("click", closeComposer);
        }
        document.querySelectorAll("input[name=\"communityPostType\"]").forEach((input) => {
            input.addEventListener("change", syncComposerType);
        });
        const fileInput = el("communityFile");
        if (fileInput) {
            fileInput.addEventListener("change", checkPickedFile);
        }
        const caption = el("communityCaption");
        const count = el("communityCaptionCount");
        if (caption && count) {
            const updateCount = () => {
                count.textContent = `${caption.value.length} / ${api.MAX_CAPTION}`;
            };
            caption.addEventListener("input", updateCount);
            updateCount();
        }
        const grid = el("communityGrid");
        if (grid) {
            grid.addEventListener("click", onGridClick);
            grid.addEventListener("submit", onGridSubmit);
        }
        syncComposerType();
        loadViewerPlace();
        loadFeed();
        global.addEventListener("agrivia-auth-changed", () => {
            loadViewerPlace();
            loadFeed();
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", bind);
    } else {
        bind();
    }
})(window);
