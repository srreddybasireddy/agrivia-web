/**
 * Dynamic Guides hub and article pages. Cards and bodies come from AgriviaGuidesApi.
 */
(function (global) {
    const TAB_COPY = {
        documents: "How-to documents from Agrivia and other growers.",
        videos: "Farm videos — what worked, and what only partly did.",
        growing: "How-to documents from Agrivia and other growers.",
        equipment: "How-to documents from Agrivia and other growers.",
    };

    function el(id) {
        return document.getElementById(id);
    }

    function inGuidesFolder() {
        return /\/guides(\/|$)/i.test(window.location.pathname);
    }

    function slugFromLocation() {
        const querySlug = new URLSearchParams(window.location.search).get("slug");
        if (querySlug) {
            return querySlug.trim().toLowerCase();
        }
        const match = window.location.pathname.match(/\/guides\/([a-z0-9-]+)(?:\.html)?$/i);
        if (match && !["index", "article", "write"].includes(match[1].toLowerCase())) {
            return match[1].toLowerCase();
        }
        return "";
    }

    function setTrustedHtml(node, html) {
        node.innerHTML = html || "";
        node.querySelectorAll("script").forEach((script) => script.remove());
    }

    function youtubeId(url) {
        if (!url) {
            return "";
        }
        const match = String(url).match(/(?:youtu\.be\/|v=|embed\/)([A-Za-z0-9_-]{11})/);
        return match ? match[1] : "";
    }

    function vimeoId(url) {
        if (!url) {
            return "";
        }
        const match = String(url).match(/vimeo\.com\/(?:video\/)?(\d+)/i);
        return match ? match[1] : "";
    }

    function hrefFor(guide) {
        if (!(guide && guide.slug)) {
            return inGuidesFolder() ? "index.html" : "guides/index.html";
        }
        return `/guides/${guide.slug}`;
    }

    function tabFromUrl() {
        const params = new URLSearchParams(window.location.search);
        const tab = (params.get("tab") || "documents").toLowerCase();
        if (tab === "videos") {
            return "videos";
        }
        return "documents";
    }

    function queryFromUrl() {
        return (new URLSearchParams(window.location.search).get("q") || "").trim();
    }

    function topicFromUrl() {
        return (new URLSearchParams(window.location.search).get("topic") || "").trim();
    }

    function outcomeFromUrl() {
        const outcome = (new URLSearchParams(window.location.search).get("outcome") || "").toLowerCase();
        return outcome === "success" || outcome === "experience" ? outcome : "";
    }

    function hubUrl(tab, q, topic, outcome) {
        const params = new URLSearchParams();
        params.set("tab", tab || "documents");
        if (q) {
            params.set("q", q);
        }
        if (topic) {
            params.set("topic", topic);
        }
        if (tab === "videos" && outcome) {
            params.set("outcome", outcome);
        }
        return `index.html?${params.toString()}`;
    }

    function renderVideo(mount, media) {
        if (!mount) {
            return;
        }
        mount.replaceChildren();
        const videos = (media || []).filter((item) => item.kind === "video" && item.url);
        if (!videos.length) {
            mount.hidden = true;
            return;
        }
        mount.hidden = false;
        videos.forEach((item) => {
            const yt = youtubeId(item.url);
            if (yt) {
                const frame = document.createElement("iframe");
                frame.className = "guide-video-frame";
                frame.setAttribute("title", item.title || "Guide video");
                frame.setAttribute("allowfullscreen", "true");
                frame.src = `https://www.youtube-nocookie.com/embed/${yt}`;
                mount.appendChild(frame);
                return;
            }
            const vim = vimeoId(item.url);
            if (vim) {
                const frame = document.createElement("iframe");
                frame.className = "guide-video-frame";
                frame.setAttribute("title", item.title || "Guide video");
                frame.setAttribute("allowfullscreen", "true");
                frame.src = `https://player.vimeo.com/video/${vim}`;
                mount.appendChild(frame);
                return;
            }
            const link = document.createElement("a");
            link.href = item.url;
            link.className = "btn btn-outline";
            link.rel = "noopener noreferrer";
            link.target = "_blank";
            link.textContent = item.title || "Watch video";
            mount.appendChild(link);
        });
    }

    function formatLabel(guide) {
        if (guide && guide.format === "video") {
            return guide.outcome === "experience" ? "Experience" : "Success";
        }
        return "Document";
    }

    function sourceLine(guide) {
        if (!(guide && guide.source === "user")) {
            return "";
        }
        return guide.author_name ? `By ${guide.author_name}` : "Reader guide";
    }

    function countLabel(count, one, many) {
        const n = Number(count) || 0;
        return n === 1 ? `1 ${one}` : `${n} ${many}`;
    }

    function statsLine(guide) {
        const likes = Number(guide && guide.like_count) || 0;
        const comments = Number(guide && guide.comment_count) || 0;
        return `${countLabel(likes, "like", "likes")} · ${countLabel(comments, "comment", "comments")}`;
    }

    function appendStats(parent, guide) {
        const stats = document.createElement("p");
        stats.className = "guide-card-stats";
        stats.textContent = statsLine(guide);
        parent.appendChild(stats);
    }

    function cardNode(guide) {
        const article = document.createElement("article");
        article.className = "blog-card paper-card guide-card-strong";
        const link = document.createElement("a");
        link.className = "blog-card-hit";
        link.href = hrefFor(guide);
        if (guide.thumbnail_url) {
            const photo = document.createElement("span");
            photo.className = "guide-card-photo";
            const img = document.createElement("img");
            img.src = guide.thumbnail_url;
            img.alt = "";
            photo.appendChild(img);
            if (guide.has_video || guide.format === "video") {
                const badge = document.createElement("span");
                badge.className = "guide-video-badge";
                badge.textContent = "Video";
                photo.appendChild(badge);
            }
            link.appendChild(photo);
        }
        const tag = document.createElement("span");
        tag.className = "category-tag";
        tag.textContent = formatLabel(guide);
        link.appendChild(tag);
        const title = document.createElement("h3");
        title.textContent = guide.title;
        link.appendChild(title);
        if (guide.summary) {
            const summary = document.createElement("p");
            summary.textContent = guide.summary;
            link.appendChild(summary);
        }
        const byline = sourceLine(guide);
        if (byline) {
            const author = document.createElement("p");
            author.className = "guide-card-byline";
            author.textContent = byline;
            link.appendChild(author);
        }
        appendStats(link, guide);
        article.appendChild(link);
        return article;
    }

    async function renderHub() {
        const grid = el("guidesGrid");
        const featured = el("guidesFeatured");
        const status = el("guidesStatus");
        const helper = el("guidesTabHelper");
        const tabs = el("guidesTabs");
        const search = el("guidesSearchInput");
        if (!grid) {
            return;
        }
        const tab = tabFromUrl();
        const q = queryFromUrl();
        const topic = topicFromUrl();
        const outcome = tab === "videos" ? outcomeFromUrl() : "";
        if (search) {
            search.value = q;
            search.placeholder = tab === "videos"
                ? "Search farm videos (goats, beds, heat…)"
                : "Search documents (tomatoes, goats, soil…)";
        }
        if (helper) {
            helper.textContent = TAB_COPY[tab] || TAB_COPY.documents;
        }
        const writeBtn = el("guidesWriteBtn");
        if (writeBtn) {
            writeBtn.textContent = tab === "videos" ? "Post a video" : "Write a guide";
            writeBtn.href = tab === "videos" ? "write.html?tab=videos" : "write.html?tab=documents";
        }
        const videoTabs = el("guidesOutcomeTabs");
        if (videoTabs) {
            videoTabs.hidden = tab !== "videos";
            videoTabs.querySelectorAll("[data-outcome]").forEach((button) => {
                const value = button.getAttribute("data-outcome") || "";
                button.setAttribute("aria-pressed", value === outcome ? "true" : "false");
            });
        }
        if (tabs) {
            tabs.querySelectorAll("[data-tab]").forEach((button) => {
                button.setAttribute("aria-pressed", button.getAttribute("data-tab") === tab ? "true" : "false");
            });
        }
        grid.replaceChildren();
        if (featured) {
            featured.hidden = true;
            featured.replaceChildren();
        }
        if (status) {
            status.hidden = false;
            status.textContent = "Loading guides…";
        }
        try {
            const payload = await global.AgriviaGuidesApi.list({
                tab: tab,
                q: q,
                topic: topic,
                outcome: outcome,
                sort: "rated",
                limit: q ? 50 : 10,
            });
            if (status) {
                status.hidden = true;
            }
            if (!q && payload.featured && featured) {
                featured.hidden = false;
                featured.classList.toggle("featured-guide-text", !payload.featured.thumbnail_url);
                if (payload.featured.thumbnail_url) {
                    const img = document.createElement("img");
                    img.className = "featured-photo";
                    img.src = payload.featured.thumbnail_url;
                    img.alt = "";
                    featured.appendChild(img);
                }
                const copy = document.createElement("div");
                copy.className = "featured-copy";
                const kicker = document.createElement("p");
                kicker.className = "featured-kicker";
                kicker.textContent = formatLabel(payload.featured);
                const heading = document.createElement("h2");
                heading.textContent = payload.featured.title;
                const summary = document.createElement("p");
                summary.textContent = payload.featured.summary;
                const stats = document.createElement("p");
                stats.className = "guide-card-stats";
                stats.textContent = statsLine(payload.featured);
                const cta = document.createElement("a");
                cta.className = "btn btn-primary";
                cta.href = hrefFor(payload.featured);
                cta.textContent = payload.featured.format === "video" ? "Watch video" : "Read guide";
                copy.appendChild(kicker);
                copy.appendChild(heading);
                copy.appendChild(summary);
                copy.appendChild(stats);
                copy.appendChild(cta);
                featured.appendChild(copy);
            }
            (payload.guides || []).forEach((guide) => {
                if (payload.featured && !q && guide.slug === payload.featured.slug) {
                    return;
                }
                grid.appendChild(cardNode(guide));
            });
            if (!(payload.guides || []).length) {
                if (status) {
                    status.hidden = false;
                    status.textContent = q
                        ? (tab === "videos"
                            ? "No published videos match that search."
                            : "No published documents match that search.")
                        : (tab === "videos"
                            ? "No farm videos in this tab yet. Post one from your place."
                            : "No documents in this tab yet.");
                }
                const empty = el("guidesEmptyActions");
                if (empty) {
                    empty.hidden = false;
                    empty.replaceChildren();
                    if (q) {
                        const ask = document.createElement("a");
                        ask.className = "btn btn-primary";
                        ask.href = `/?ask=${encodeURIComponent(q)}#ai-advisor`;
                        ask.textContent = "Ask the advisor";
                        empty.appendChild(ask);
                    }
                    const write = document.createElement("a");
                    write.className = "btn btn-outline";
                    write.href = q
                        ? `write.html?tab=${encodeURIComponent(tab)}&q=${encodeURIComponent(q)}`
                        : `write.html?tab=${encodeURIComponent(tab)}`;
                    write.textContent = tab === "videos"
                        ? (q ? "Post this video" : "Post a video")
                        : (q ? "Write this guide" : "Write a guide");
                    empty.appendChild(write);
                }
                const starters = el("guidesStarters");
                if (starters) {
                    starters.replaceChildren();
                    (payload.starters || []).forEach((item) => {
                        const a = document.createElement("a");
                        a.className = "query-chip";
                        a.href = hubUrl(tab, item.query);
                        a.textContent = item.label;
                        starters.appendChild(a);
                    });
                    starters.hidden = !(payload.starters || []).length;
                }
            } else {
                const empty = el("guidesEmptyActions");
                if (empty) {
                    empty.hidden = true;
                    empty.replaceChildren();
                }
                const starters = el("guidesStarters");
                if (starters) {
                    starters.hidden = true;
                }
            }
        } catch (err) {
            if (status) {
                status.hidden = false;
                status.textContent = err.message || "Guides could not be loaded.";
            }
        }
    }

    function bindHub() {
        const form = el("guidesSearchForm");
        const tabs = el("guidesTabs");
        if (form) {
            form.addEventListener("submit", (event) => {
                event.preventDefault();
                const q = (el("guidesSearchInput") && el("guidesSearchInput").value) || "";
                window.location.href = hubUrl(tabFromUrl(), q.trim(), "", outcomeFromUrl());
            });
        }
        if (tabs) {
            tabs.addEventListener("click", (event) => {
                const button = event.target.closest("[data-tab]");
                if (!button) {
                    return;
                }
                window.location.href = hubUrl(button.getAttribute("data-tab"), queryFromUrl());
            });
        }
        const outcomeTabs = el("guidesOutcomeTabs");
        if (outcomeTabs) {
            outcomeTabs.addEventListener("click", (event) => {
                const button = event.target.closest("[data-outcome]");
                if (!button) {
                    return;
                }
                window.location.href = hubUrl("videos", queryFromUrl(), topicFromUrl(), button.getAttribute("data-outcome") || "");
            });
        }
        renderHub();
    }

    function requireSignIn(message) {
        const auth = global.AgriviaAuth;
        if (auth && auth.isSignedIn()) {
            return true;
        }
        window.alert(message || "Sign in to do that.");
        return false;
    }

    function renderEngage(guide) {
        const mount = el("guideEngage");
        const commentsMount = el("guideComments");
        if (!mount || !guide || !guide.slug) {
            return;
        }
        mount.hidden = false;
        mount.replaceChildren();
        const likes = document.createElement("button");
        likes.type = "button";
        likes.className = "guide-vote" + (guide.viewer_vote === 1 ? " is-on" : "");
        likes.setAttribute("aria-pressed", guide.viewer_vote === 1 ? "true" : "false");
        likes.textContent = `Like ${guide.like_count || 0}`;
        const dislikes = document.createElement("button");
        dislikes.type = "button";
        dislikes.className = "guide-vote" + (guide.viewer_vote === -1 ? " is-on" : "");
        dislikes.setAttribute("aria-pressed", guide.viewer_vote === -1 ? "true" : "false");
        dislikes.textContent = `Dislike ${guide.dislike_count || 0}`;
        likes.addEventListener("click", async () => {
            if (!requireSignIn("Sign in to like this guide.")) {
                return;
            }
            try {
                const next = guide.viewer_vote === 1 ? 0 : 1;
                const payload = await global.AgriviaGuidesApi.vote(guide.slug, next);
                guide.viewer_vote = payload.vote;
                guide.like_count = payload.like_count;
                guide.dislike_count = payload.dislike_count;
                renderEngage(guide);
            } catch (err) {
                window.alert(err.message || "Could not save that vote.");
            }
        });
        dislikes.addEventListener("click", async () => {
            if (!requireSignIn("Sign in to dislike this guide.")) {
                return;
            }
            try {
                const next = guide.viewer_vote === -1 ? 0 : -1;
                const payload = await global.AgriviaGuidesApi.vote(guide.slug, next);
                guide.viewer_vote = payload.vote;
                guide.like_count = payload.like_count;
                guide.dislike_count = payload.dislike_count;
                renderEngage(guide);
            } catch (err) {
                window.alert(err.message || "Could not save that vote.");
            }
        });
        mount.appendChild(likes);
        mount.appendChild(dislikes);

        if (!commentsMount) {
            return;
        }
        commentsMount.hidden = false;
        commentsMount.replaceChildren();
        const heading = document.createElement("h2");
        heading.textContent = "Comments";
        commentsMount.appendChild(heading);
        const list = document.createElement("ol");
        list.className = "guide-comment-list";
        (guide.comments || []).forEach((item) => {
            const li = document.createElement("li");
            const name = document.createElement("strong");
            name.textContent = item.author_name || "Reader";
            const body = document.createElement("p");
            body.textContent = item.body || "";
            li.appendChild(name);
            li.appendChild(body);
            list.appendChild(li);
        });
        if (!(guide.comments || []).length) {
            const empty = document.createElement("p");
            empty.className = "farm-status";
            empty.textContent = "No comments yet.";
            commentsMount.appendChild(empty);
        } else {
            commentsMount.appendChild(list);
        }
        const form = document.createElement("form");
        form.className = "guide-comment-form";
        const label = document.createElement("label");
        label.className = "visually-hidden";
        label.setAttribute("for", "guideCommentBody");
        label.textContent = "Add a comment";
        const input = document.createElement("textarea");
        input.id = "guideCommentBody";
        input.className = "form-input";
        input.rows = 3;
        input.maxLength = 1000;
        input.required = true;
        input.placeholder = "What worked, what you would change, or a question for the writer.";
        const submit = document.createElement("button");
        submit.type = "submit";
        submit.className = "btn btn-primary";
        submit.textContent = "Post comment";
        form.appendChild(label);
        form.appendChild(input);
        form.appendChild(submit);
        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            if (!requireSignIn("Sign in to comment.")) {
                return;
            }
            try {
                const payload = await global.AgriviaGuidesApi.addComment(guide.slug, input.value);
                guide.comments = (guide.comments || []).concat([payload.comment]);
                guide.comment_count = (guide.comment_count || 0) + 1;
                input.value = "";
                renderEngage(guide);
            } catch (err) {
                window.alert(err.message || "Could not post that comment.");
            }
        });
        commentsMount.appendChild(form);
    }

    async function renderDetail() {
        const slug = slugFromLocation();
        const article = el("guideArticle");
        const status = el("guideStatus");
        if (!article) {
            return;
        }
        if (!slug) {
            if (status) {
                status.hidden = false;
                status.textContent = "That guide was not found.";
            }
            return;
        }
        const titleEl = el("guideTitle");
        const alreadyPainted = Boolean(titleEl && titleEl.textContent.trim());
        if (status) {
            if (alreadyPainted) {
                status.hidden = true;
            } else {
                status.hidden = false;
                status.textContent = "Loading guide…";
            }
        }
        if (/\/article\.html$/i.test(window.location.pathname) && window.history && window.history.replaceState) {
            window.history.replaceState({}, "", `/guides/${slug}`);
        }
        try {
            const payload = await global.AgriviaGuidesApi.get(slug);
            const guide = payload.guide;
            if (status) {
                status.hidden = true;
            }
            document.title = `${guide.title} | Agrivia`;
            const canonical = document.querySelector('link[rel="canonical"]');
            if (canonical) {
                canonical.setAttribute("href", `https://agrivia.ai${guide.canonical_path}`);
            }
            const description = document.querySelector('meta[name="description"]');
            if (description && guide.summary) {
                description.setAttribute("content", guide.summary);
            }
            const kicker = el("guideKicker");
            if (kicker) {
                if (guide.format === "video") {
                    kicker.textContent = guide.outcome === "experience"
                        ? "Video · Experience"
                        : "Video · Success";
                } else {
                    kicker.textContent = "Document";
                }
            }
            const title = el("guideTitle");
            if (title) {
                title.textContent = guide.title;
            }
            const summary = el("guideSummary");
            if (summary) {
                summary.textContent = guide.summary;
            }
            const author = el("guideAuthor");
            if (author) {
                if (guide.source === "user") {
                    author.hidden = false;
                    author.textContent = guide.author_name
                        ? `Written by ${guide.author_name}`
                        : "Written by a reader";
                } else {
                    author.hidden = true;
                    author.textContent = "";
                }
            }
            const topics = el("guideTopics");
            if (topics) {
                topics.replaceChildren();
                (guide.topics || []).forEach((topic) => {
                    const chip = document.createElement("span");
                    chip.className = "guide-topic-chip";
                    chip.textContent = topic;
                    topics.appendChild(chip);
                });
            }
            renderVideo(el("guideMediaMount"), guide.media);
            const body = el("guideBody");
            if (body) {
                const html = String(guide.body_html || "").trim();
                if (html) {
                    setTrustedHtml(body, html);
                } else {
                    body.replaceChildren();
                    const empty = document.createElement("p");
                    empty.className = "farm-status";
                    empty.textContent = guide.format === "video"
                        ? "Watch the video above. The publisher did not add extra notes."
                        : "This guide has no article text yet.";
                    body.appendChild(empty);
                }
            }
            const related = el("guideRelated");
            if (related) {
                related.replaceChildren();
                const growing = (guide.related || []).filter((item) => item.primary_tab === "growing");
                const equipment = (guide.related || []).filter((item) => item.primary_tab === "equipment");
                const preferred = guide.primary_tab === "growing"
                    ? growing.concat(equipment)
                    : growing.concat(equipment);
                if (!preferred.length) {
                    related.hidden = true;
                } else {
                    related.hidden = false;
                    const heading = document.createElement("h2");
                    heading.textContent = "Related";
                    related.appendChild(heading);
                    preferred.forEach((item) => {
                        const a = document.createElement("a");
                        a.href = hrefFor(item);
                        a.textContent = item.title;
                        related.appendChild(a);
                    });
                }
            }
            const ask = el("guideAsk");
            if (ask) {
                ask.href = `/?ask=${encodeURIComponent(guide.title)}#ai-advisor`;
            }
            renderEngage(guide);
        } catch (err) {
            if (status) {
                status.hidden = false;
                status.textContent = err.message || "That guide could not be loaded.";
            }
        }
    }

    function popularCardNode(guide) {
        const link = document.createElement("a");
        link.className = "popular-card paper-card";
        link.href = hrefFor(guide);
        if (guide.thumbnail_url) {
            const photo = document.createElement("span");
            photo.className = "popular-photo";
            const img = document.createElement("img");
            img.src = guide.thumbnail_url;
            img.alt = "";
            photo.appendChild(img);
            link.appendChild(photo);
        }
        const body = document.createElement("span");
        body.className = "popular-card-body";
        const tag = document.createElement("span");
        tag.className = "category-tag";
        tag.textContent = formatLabel(guide);
        const title = document.createElement("h3");
        title.textContent = guide.title;
        body.appendChild(tag);
        body.appendChild(title);
        if (guide.summary) {
            const summary = document.createElement("p");
            summary.textContent = guide.summary;
            body.appendChild(summary);
        }
        const byline = sourceLine(guide);
        if (byline) {
            const author = document.createElement("p");
            author.className = "guide-card-byline";
            author.textContent = byline;
            body.appendChild(author);
        }
        appendStats(body, guide);
        const arrow = document.createElement("span");
        arrow.className = "popular-arrow";
        arrow.setAttribute("aria-hidden", "true");
        arrow.textContent = "→";
        body.appendChild(arrow);
        link.appendChild(body);
        return link;
    }

    let heroRotateTimer = 0;
    let heroLines = [];
    let heroIndex = 0;

    function fallbackSubtitles() {
        return [
            "How-to guides and an on-site advisor for your backyard homestead",
            "How-to guides, practical advice, and an AI advisor for your backyard homestead",
            "Step-by-step guides and an AI advisor for plants, animals, and a small place",
            "Read a how-to, or ask the advisor about your place",
            "Help for raised beds, livestock, and the gear that supports them",
        ];
    }

    function compactHeroSubtitle() {
        return "How-to guides and an on-site advisor";
    }

    function randomSubtitleIndex(exceptIndex) {
        if (heroLines.length < 2) {
            return 0;
        }
        let next = exceptIndex;
        while (next === exceptIndex) {
            next = Math.floor(Math.random() * heroLines.length);
        }
        return next;
    }

    function applyHeroSubtitle(text) {
        const subtitle = el("heroSubtitle");
        if (subtitle) {
            subtitle.textContent = text;
        }
    }

    function startHeroRotate() {
        const subtitle = el("heroSubtitle");
        if (!subtitle) {
            return;
        }
        if (window.matchMedia("(max-width: 768px)").matches) {
            applyHeroSubtitle(compactHeroSubtitle());
            return;
        }
        heroLines = fallbackSubtitles();
        const current = (subtitle.textContent || "").replace(/\s+/g, " ").trim();
        const match = heroLines.indexOf(current);
        heroIndex = match >= 0 ? match : randomSubtitleIndex(-1);
        applyHeroSubtitle(heroLines[heroIndex]);
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            return;
        }
        if (heroRotateTimer) {
            window.clearInterval(heroRotateTimer);
        }
        heroRotateTimer = window.setInterval(() => {
            if (heroLines.length < 2) {
                return;
            }
            heroIndex = randomSubtitleIndex(heroIndex);
            subtitle.classList.add("is-fading");
            window.setTimeout(() => {
                applyHeroSubtitle(heroLines[heroIndex]);
                subtitle.classList.remove("is-fading");
            }, 220);
        }, 8000);
    }

    async function renderHomeGuides() {
        const grid = el("homeGrowingGuides");
        const footer = el("footerGuideLinks");
        const section = el("start");
        if (!grid && !footer) {
            return;
        }
        try {
            const payload = await global.AgriviaGuidesApi.list({
                tab: "all",
                sort: "rated",
                limit: 5,
            });
            const guides = payload.guides || [];
            if (grid) {
                grid.replaceChildren();
                guides.forEach((guide) => {
                    grid.appendChild(popularCardNode(guide));
                });
            }
            if (section) {
                section.hidden = guides.length === 0;
            }
            if (footer) {
                footer.replaceChildren();
                guides.forEach((guide) => {
                    const item = document.createElement("li");
                    const link = document.createElement("a");
                    link.href = hrefFor(guide);
                    link.textContent = guide.title;
                    item.appendChild(link);
                    footer.appendChild(item);
                });
            }
        } catch (err) {
            if (grid) {
                grid.replaceChildren();
            }
            if (section) {
                section.hidden = true;
            }
        }
    }

    function fieldValue(id) {
        const node = el(id);
        return node ? String(node.value || "").trim() : "";
    }

    function setField(id, value) {
        const node = el(id);
        if (node) {
            node.value = value || "";
        }
    }

    function writePayload(status) {
        return {
            title: fieldValue("guideWriteTitle"),
            summary: fieldValue("guideWriteSummary"),
            bodyHtml: fieldValue("guideWriteBody"),
            primaryTab: fieldValue("guideWriteTab") || "growing",
            videoUrl: fieldValue("guideWriteVideo"),
            videoTitle: fieldValue("guideWriteVideoTitle"),
            status: status,
            query: fieldValue("guideWriteTopic"),
            format: fieldValue("guideWriteFormat") || "document",
            outcome: fieldValue("guideWriteOutcome") || "",
        };
    }

    function showWriteStatus(message, isError) {
        const status = el("guideWriteStatus");
        if (!status) {
            return;
        }
        status.hidden = !message;
        status.textContent = message || "";
        status.classList.toggle("is-error", Boolean(isError));
    }

    async function refreshMine() {
        const list = el("guideMineList");
        if (!list || !global.AgriviaAuth || !global.AgriviaAuth.isSignedIn()) {
            if (list) {
                list.hidden = true;
                list.replaceChildren();
            }
            return;
        }
        try {
            const payload = await global.AgriviaGuidesApi.mine();
            list.replaceChildren();
            (payload.guides || []).forEach((guide) => {
                const item = document.createElement("li");
                const link = document.createElement("a");
                link.href = `${hrefFor(guide)}${guide.status === "draft" ? "" : ""}`;
                link.textContent = `${guide.title} (${guide.status || "draft"})`;
                item.appendChild(link);
                list.appendChild(item);
            });
            list.hidden = !(payload.guides || []).length;
        } catch (err) {
            list.hidden = true;
        }
    }

    function paintWriteKind() {
        const format = fieldValue("guideWriteFormat") || "document";
        const isVideo = format === "video";
        const outcomeWrap = el("guideWriteOutcomeWrap");
        const videoWrap = el("guideWriteVideoWrap");
        const bodyLabel = el("guideWriteBodyLabel");
        if (outcomeWrap) {
            outcomeWrap.hidden = !isVideo;
        }
        if (videoWrap) {
            videoWrap.hidden = false;
        }
        if (bodyLabel) {
            bodyLabel.textContent = isVideo
                ? "What happened (notes)"
                : "Guide body";
        }
        const bodyInput = el("guideWriteBody");
        if (bodyInput) {
            bodyInput.required = !isVideo;
        }
        const heading = el("guideWriteHeading");
        if (heading) {
            heading.textContent = isVideo ? "Post a farm video" : "Write a guide";
        }
        const videoInput = el("guideWriteVideo");
        if (videoInput) {
            videoInput.required = isVideo;
        }
        const outcomeInput = el("guideWriteOutcome");
        if (outcomeInput) {
            outcomeInput.required = isVideo;
        }
    }

    function paintWriteAuth() {
        const guest = el("guideWriteGuest");
        const signed = el("guideWriteSigned");
        const form = el("guideWriteForm");
        const auth = global.AgriviaAuth;
        const inSession = auth && auth.isSignedIn();
        if (guest) {
            guest.hidden = Boolean(inSession);
        }
        if (signed) {
            signed.hidden = !inSession;
        }
        if (form) {
            form.hidden = !inSession;
        }
        const email = el("guideWriteEmail");
        if (email && auth) {
            email.textContent = auth.getEmail() || auth.getName() || "Signed in";
        }
        if (inSession) {
            refreshMine();
        }
    }

    async function bindWrite() {
        const params = new URLSearchParams(window.location.search);
        if (!fieldValue("guideWriteTopic")) {
            setField("guideWriteTopic", params.get("q") || "");
        }
        const requestedTab = (params.get("tab") || "").toLowerCase();
        if (requestedTab === "videos" || requestedTab === "documents") {
            setField("guideWriteFormat", requestedTab === "videos" ? "video" : "document");
        } else if (params.get("tab")) {
            setField("guideWriteTab", params.get("tab"));
        }
        paintWriteKind();
        const formatSelect = el("guideWriteFormat");
        if (formatSelect) {
            formatSelect.addEventListener("change", paintWriteKind);
        }
        const auth = global.AgriviaAuth;
        const mount = el("guideWriteGoogle");
        if (auth) {
            const cfg = await auth.fetchAuthConfig();
            if (cfg.enabled && mount) {
                auth.renderGoogleButton(mount, cfg.clientId);
            }
            document.addEventListener("agrivia-auth-changed", paintWriteAuth);
            paintWriteAuth();
        }
        const form = el("guideWriteForm");
        if (!form) {
            return;
        }
        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const publish = event.submitter && event.submitter.getAttribute("data-status") === "published";
            showWriteStatus(publish ? "Publishing…" : "Saving draft…");
            try {
                const slug = fieldValue("guideWriteSlug");
                const fields = writePayload(publish ? "published" : "draft");
                const payload = slug
                    ? await global.AgriviaGuidesApi.update(slug, fields)
                    : await global.AgriviaGuidesApi.create(fields);
                const saved = payload.guide;
                setField("guideWriteSlug", saved.slug);
                setField("guideWriteTitle", saved.title);
                setField("guideWriteSummary", saved.summary);
                showWriteStatus(saved.status === "published" ? "Published to Guides." : "Draft saved.");
                await refreshMine();
                if (saved.status === "published") {
                    window.location.href = hrefFor(saved);
                }
            } catch (err) {
                showWriteStatus(err.message || "Could not save that guide.", true);
            }
        });
        const draftBtn = el("guideWriteDraftAi");
        if (draftBtn) {
            draftBtn.addEventListener("click", async () => {
                const topic = fieldValue("guideWriteTopic") || fieldValue("guideWriteTitle");
                if (!topic) {
                    showWriteStatus("Describe the topic first.", true);
                    return;
                }
                showWriteStatus("Drafting with the advisor… this can take a minute.");
                try {
                    const payload = await global.AgriviaGuidesApi.draft(
                        topic,
                        fieldValue("guideWriteTab"),
                        fieldValue("guideWriteVideo")
                    );
                    const guide = payload.guide;
                    setField("guideWriteSlug", guide.slug);
                    setField("guideWriteTitle", guide.title);
                    setField("guideWriteSummary", guide.summary);
                    setField("guideWriteBody", (guide.body_html || "").replace(/<\/p>/g, "</p>\n"));
                    showWriteStatus("Draft ready. Edit it, add a video URL if you have one, then publish.");
                    await refreshMine();
                } catch (err) {
                    showWriteStatus(err.message || "Could not draft that guide.", true);
                }
            });
        }
    }

    function bindGuidesAuth() {
        const auth = global.AgriviaAuth;
        const mount = el("googleSignInBtn");
        if (!auth) {
            return;
        }
        const paint = function () {
            const signedIn = auth.isSignedIn();
            const guest = el("authGuest");
            const signed = el("authSignedIn");
            const label = el("authEmailLabel");
            if (guest) {
                guest.hidden = signedIn;
            }
            if (signed) {
                signed.hidden = !signedIn;
            }
            if (label) {
                label.textContent = auth.getEmail() || auth.getName() || "Signed in";
            }
        };
        document.addEventListener("agrivia-auth-changed", paint);
        paint();
        const signOutBtn = el("authSignOut");
        if (signOutBtn) {
            signOutBtn.addEventListener("click", async () => {
                await auth.signOut();
            });
        }
        if (mount) {
            auth.fetchAuthConfig().then((cfg) => {
                if (cfg.enabled && cfg.clientId) {
                    auth.renderGoogleButton(mount, cfg.clientId);
                }
            });
        }
    }

    function init() {
        bindGuidesAuth();
        if (el("guidesGrid")) {
            bindHub();
        }
        if (el("guideArticle")) {
            renderDetail();
        }
        if (el("heroSubtitle")) {
            startHeroRotate();
        }
        if (el("homeGrowingGuides") || el("footerGuideLinks")) {
            renderHomeGuides();
        }
        if (el("guideWriteForm")) {
            bindWrite();
        }
    }

    document.addEventListener("DOMContentLoaded", init);
})(window);
