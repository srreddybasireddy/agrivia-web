/**
 * Write-a-guide page. Saves through AgriviaGuidesApi. The body box is plain text;
 * the API wraps paragraphs. Advisor HTML is converted before it is shown.
 */
(function (global) {
    const COPY = {
        document: {
            heading: "Write a guide",
            lede: "A written how-to. Readers see the title, the summary, and the guide.",
        },
        video: {
            heading: "Post a farm video",
            lede: "A public video from your farm, plus a short note about how it went.",
        },
    };

    function el(id) {
        return document.getElementById(id);
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

    function formatValue() {
        const video = el("guideWriteFormatVideo");
        return video && video.getAttribute("aria-pressed") === "true" ? "video" : "document";
    }

    function setFormat(value) {
        const isVideo = value === "video";
        const documentBtn = el("guideWriteFormatDocument");
        const videoBtn = el("guideWriteFormatVideo");
        if (documentBtn) {
            documentBtn.setAttribute("aria-pressed", isVideo ? "false" : "true");
            documentBtn.classList.toggle("is-on", !isVideo);
        }
        if (videoBtn) {
            videoBtn.setAttribute("aria-pressed", isVideo ? "true" : "false");
            videoBtn.classList.toggle("is-on", isVideo);
        }
    }

    function htmlToPlain(html) {
        const raw = String(html || "").trim();
        if (!raw || !/<[a-z][\s\S]*>/i.test(raw)) {
            return raw;
        }
        const withBreaks = raw
            .replace(/<br\s*\/?>/gi, "\n")
            .replace(/<\/(p|h2|h3|div)>/gi, "\n\n")
            .replace(/<li[^>]*>/gi, "- ")
            .replace(/<\/li>/gi, "\n")
            .replace(/<\/(ul|ol)>/gi, "\n");
        const stripped = withBreaks.replace(/<[^>]+>/g, "");
        return stripped
            .replace(/&nbsp;/gi, " ")
            .replace(/&amp;/gi, "&")
            .replace(/&lt;/gi, "<")
            .replace(/&gt;/gi, ">")
            .replace(/&quot;/gi, "\"")
            .replace(/&#39;/gi, "'")
            .replace(/[ \t]+\n/g, "\n")
            .replace(/\n{3,}/g, "\n\n")
            .trim();
    }

    function statusLabel(status) {
        return String(status || "").toLowerCase() === "published" ? "Published" : "Draft";
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

    function writePayload(status) {
        const format = formatValue();
        const isVideo = format === "video";
        return {
            title: fieldValue("guideWriteTitle"),
            summary: fieldValue("guideWriteSummary"),
            bodyHtml: isVideo ? fieldValue("guideWriteNotes") : fieldValue("guideWriteBody"),
            primaryTab: fieldValue("guideWriteTab") || "growing",
            videoUrl: isVideo ? fieldValue("guideWriteVideoUrl") : "",
            videoTitle: isVideo ? fieldValue("guideWriteVideoTitle") : "",
            status: status,
            query: fieldValue("guideWriteTopic"),
            format: format,
            outcome: isVideo ? (fieldValue("guideWriteOutcome") || "success") : "",
        };
    }

    function paintWriteKind() {
        const isVideo = formatValue() === "video";
        const copy = isVideo ? COPY.video : COPY.document;
        const documentPanel = el("guideWriteDocument");
        const videoPanel = el("guideWriteVideo");
        const heading = el("guideWriteHeading");
        const lede = el("guideWriteLede");
        const body = el("guideWriteBody");
        const videoUrl = el("guideWriteVideoUrl");
        const outcome = el("guideWriteOutcome");
        if (documentPanel) {
            documentPanel.hidden = isVideo;
        }
        if (videoPanel) {
            videoPanel.hidden = !isVideo;
        }
        if (heading) {
            heading.textContent = copy.heading;
        }
        if (lede) {
            lede.textContent = copy.lede;
        }
        if (body) {
            body.required = !isVideo;
        }
        if (videoUrl) {
            videoUrl.required = isVideo;
        }
        if (outcome) {
            outcome.required = isVideo;
        }
    }

    function fillFromGuide(guide) {
        if (!guide) {
            return;
        }
        const format = guide.format === "video" ? "video" : "document";
        const plain = htmlToPlain(guide.body_html || guide.bodyHtml || "");
        const media = Array.isArray(guide.media) ? guide.media : [];
        const video = media.find((item) => item && item.kind === "video" && item.url) || media[0] || {};
        setField("guideWriteSlug", guide.slug);
        setField("guideWriteTitle", guide.title);
        setField("guideWriteSummary", guide.summary);
        setField("guideWriteTab", guide.primary_tab || guide.primaryTab || "growing");
        setField("guideWriteTopic", "");
        setFormat(format);
        if (format === "video") {
            setField("guideWriteNotes", plain);
            setField("guideWriteBody", "");
            setField("guideWriteVideoUrl", video.url || "");
            setField("guideWriteVideoTitle", video.title && video.title !== "Guide video" ? video.title : "");
            setField("guideWriteOutcome", guide.outcome === "experience" ? "experience" : "success");
        } else {
            setField("guideWriteBody", plain);
            setField("guideWriteNotes", "");
            setField("guideWriteVideoUrl", "");
            setField("guideWriteVideoTitle", "");
            setField("guideWriteOutcome", "success");
        }
        paintWriteKind();
        const title = el("guideWriteTitle");
        if (title) {
            title.focus();
        }
    }

    async function openMineGuide(slug) {
        showWriteStatus("Opening…");
        try {
            const payload = await global.AgriviaGuidesApi.get(slug);
            fillFromGuide(payload.guide);
            showWriteStatus("");
        } catch (err) {
            showWriteStatus(err.message || "Could not open that guide.", true);
        }
    }

    async function refreshMine() {
        const list = el("guideMineList");
        const heading = el("guideMineHeading");
        if (!list || !global.AgriviaAuth || !global.AgriviaAuth.isSignedIn()) {
            if (list) {
                list.hidden = true;
                list.replaceChildren();
            }
            if (heading) {
                heading.hidden = true;
            }
            return;
        }
        try {
            const payload = await global.AgriviaGuidesApi.mine();
            list.replaceChildren();
            (payload.guides || []).forEach((guide) => {
                if (!guide || !guide.slug) {
                    return;
                }
                const item = document.createElement("li");
                const open = document.createElement("button");
                open.type = "button";
                open.className = "guide-mine-open";
                open.textContent = guide.title || "Untitled";
                open.addEventListener("click", () => {
                    openMineGuide(guide.slug);
                });
                const badge = document.createElement("span");
                badge.className = "guide-mine-status";
                badge.textContent = statusLabel(guide.status);
                item.appendChild(open);
                item.appendChild(badge);
                if (guide.status === "published") {
                    const view = document.createElement("a");
                    view.href = `/guides/${guide.slug}`;
                    view.textContent = "View";
                    item.appendChild(view);
                }
                list.appendChild(item);
            });
            const hasGuides = list.childElementCount > 0;
            list.hidden = !hasGuides;
            if (heading) {
                heading.hidden = !hasGuides;
            }
        } catch (err) {
            list.hidden = true;
            if (heading) {
                heading.hidden = true;
            }
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
        if (inSession) {
            refreshMine();
        }
    }

    function bindWrite() {
        const params = new URLSearchParams(window.location.search);
        if (!fieldValue("guideWriteTopic")) {
            setField("guideWriteTopic", params.get("q") || "");
        }
        const requestedTab = (params.get("tab") || "").toLowerCase();
        if (requestedTab === "videos" || requestedTab === "documents") {
            setFormat(requestedTab === "videos" ? "video" : "document");
        } else if (requestedTab === "growing" || requestedTab === "equipment") {
            setField("guideWriteTab", requestedTab);
        }
        paintWriteKind();
        [el("guideWriteFormatDocument"), el("guideWriteFormatVideo")].forEach((button) => {
            if (!button) {
                return;
            }
            button.addEventListener("click", () => {
                setFormat(button.getAttribute("data-format"));
                paintWriteKind();
            });
        });
        const auth = global.AgriviaAuth;
        const mount = el("guideWriteGoogle");
        if (auth) {
            auth.fetchAuthConfig().then((cfg) => {
                if (cfg.enabled && mount) {
                    auth.renderGoogleButton(mount, cfg.clientId);
                }
            });
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
                    window.location.href = `/guides/${saved.slug}`;
                }
            } catch (err) {
                showWriteStatus(err.message || "Could not save that guide.", true);
            }
        });
        const draftBtn = el("guideWriteDraftAi");
        if (draftBtn) {
            draftBtn.addEventListener("click", async () => {
                const topic = fieldValue("guideWriteTitle") || fieldValue("guideWriteTopic");
                if (!topic) {
                    showWriteStatus("Add a title first.", true);
                    const title = el("guideWriteTitle");
                    if (title) {
                        title.focus();
                    }
                    return;
                }
                showWriteStatus("Drafting with the advisor… this can take a minute.");
                draftBtn.disabled = true;
                try {
                    const payload = await global.AgriviaGuidesApi.draft(
                        topic,
                        fieldValue("guideWriteTab"),
                        ""
                    );
                    fillFromGuide(payload.guide);
                    showWriteStatus("Draft ready. Edit it, then publish.");
                    await refreshMine();
                } catch (err) {
                    showWriteStatus(err.message || "Could not draft that guide.", true);
                } finally {
                    draftBtn.disabled = false;
                }
            });
        }
    }

    function init() {
        if (el("guideWriteForm")) {
            bindWrite();
        }
    }

    global.AgriviaGuidesWrite = {
        htmlToPlain: htmlToPlain,
    };

    document.addEventListener("DOMContentLoaded", init);
})(window);
