/**
 * Dynamic Guides hub and article pages. Cards and bodies come from AgriviaGuidesApi.
 */
(function (global) {
    const TAB_COPY = {
        growing: "Learn to grow plants and raise animals.",
        equipment: "Gear that supports your garden and animals.",
    };

    function el(id) {
        return document.getElementById(id);
    }

    function slugFromLocation() {
        const querySlug = new URLSearchParams(window.location.search).get("slug");
        if (querySlug) {
            return querySlug.trim().toLowerCase();
        }
        const match = window.location.pathname.match(/\/guides\/([a-z0-9-]+)(?:\.html)?$/i);
        if (match && match[1] !== "index" && match[1] !== "article") {
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

    function hrefFor(guide) {
        if (guide && guide.slug) {
            return `${guide.slug}.html`;
        }
        return "index.html";
    }

    function tabFromUrl() {
        const params = new URLSearchParams(window.location.search);
        const tab = (params.get("tab") || "growing").toLowerCase();
        return tab === "equipment" || tab === "all" ? tab : "growing";
    }

    function queryFromUrl() {
        return (new URLSearchParams(window.location.search).get("q") || "").trim();
    }

    function topicFromUrl() {
        return (new URLSearchParams(window.location.search).get("topic") || "").trim();
    }

    function hubUrl(tab, q, topic) {
        const params = new URLSearchParams();
        params.set("tab", tab || "growing");
        if (q) {
            params.set("q", q);
        }
        if (topic) {
            params.set("topic", topic);
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
            const id = youtubeId(item.url);
            if (id) {
                const frame = document.createElement("iframe");
                frame.className = "guide-video-frame";
                frame.setAttribute("title", item.title || "Guide video");
                frame.setAttribute("allowfullscreen", "true");
                frame.src = `https://www.youtube-nocookie.com/embed/${id}`;
                mount.appendChild(frame);
                return;
            }
            const link = document.createElement("a");
            link.href = item.url;
            link.className = "btn btn-outline";
            link.textContent = item.title || "Watch video";
            mount.appendChild(link);
        });
    }

    function cardNode(guide, showTab) {
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
            if (guide.has_video) {
                const badge = document.createElement("span");
                badge.className = "guide-video-badge";
                badge.textContent = "Video";
                photo.appendChild(badge);
            }
            const tag = document.createElement("span");
            tag.className = "category-tag";
            tag.textContent = showTab
                ? (guide.primary_tab === "equipment" ? "Equipment" : "Growing")
                : ((guide.topics || [])[0] || "");
            photo.appendChild(tag);
            link.appendChild(photo);
        }
        const title = document.createElement("h3");
        title.textContent = guide.title;
        link.appendChild(title);
        const summary = document.createElement("p");
        summary.textContent = guide.summary;
        link.appendChild(summary);
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
        if (search) {
            search.value = q;
        }
        if (helper) {
            helper.textContent = TAB_COPY[tab] || TAB_COPY.growing;
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
            const payload = await global.AgriviaGuidesApi.list({ tab: tab, q: q, topic: topic });
            if (status) {
                status.hidden = true;
            }
            const showTab = Boolean(q);
            if (!q && payload.featured && featured) {
                featured.hidden = false;
                const img = document.createElement("img");
                img.className = "featured-photo";
                img.src = payload.featured.thumbnail_url;
                img.alt = "";
                const copy = document.createElement("div");
                copy.className = "featured-copy";
                const kicker = document.createElement("p");
                kicker.className = "featured-kicker";
                kicker.textContent = "Start here for new growers";
                const heading = document.createElement("h2");
                heading.textContent = payload.featured.title;
                const summary = document.createElement("p");
                summary.textContent = payload.featured.summary;
                const cta = document.createElement("a");
                cta.className = "btn btn-primary";
                cta.href = hrefFor(payload.featured);
                cta.textContent = "Read guide";
                copy.appendChild(kicker);
                copy.appendChild(heading);
                copy.appendChild(summary);
                copy.appendChild(cta);
                featured.appendChild(img);
                featured.appendChild(copy);
            }
            (payload.guides || []).forEach((guide) => {
                if (payload.featured && !q && guide.slug === payload.featured.slug) {
                    return;
                }
                grid.appendChild(cardNode(guide, showTab));
            });
            if (!(payload.guides || []).length) {
                if (status) {
                    status.hidden = false;
                    status.textContent = q
                        ? "No guides match that search."
                        : "No guides in this tab yet.";
                }
                const starters = el("guidesStarters");
                if (starters) {
                    starters.replaceChildren();
                    (payload.starters || []).forEach((item) => {
                        const a = document.createElement("a");
                        a.className = "query-chip";
                        a.href = hubUrl("growing", item.query);
                        a.textContent = item.label;
                        starters.appendChild(a);
                    });
                    starters.hidden = !(payload.starters || []).length;
                }
            } else {
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
                window.location.href = hubUrl(tabFromUrl(), q.trim());
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
        renderHub();
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
        if (status) {
            status.hidden = false;
            status.textContent = "Loading guide…";
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
            const kicker = el("guideKicker");
            if (kicker) {
                kicker.textContent = guide.primary_tab === "equipment" ? "Equipment" : "Growing";
            }
            const title = el("guideTitle");
            if (title) {
                title.textContent = guide.title;
            }
            const summary = el("guideSummary");
            if (summary) {
                summary.textContent = guide.summary;
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
                setTrustedHtml(body, guide.body_html);
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
        } catch (err) {
            if (status) {
                status.hidden = false;
                status.textContent = err.message || "That guide could not be loaded.";
            }
        }
    }

    function init() {
        if (el("guidesGrid")) {
            bindHub();
        }
        if (el("guideArticle")) {
            renderDetail();
        }
    }

    document.addEventListener("DOMContentLoaded", init);
})(window);
