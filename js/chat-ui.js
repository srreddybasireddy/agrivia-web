/**
 * Website chat UI. Talks only through AgriviaChatApi (same farmi /api/chat contract).
 */
(function (global) {
    const config = global.AgriviaConfig;
    const api = global.AgriviaChatApi;

    function el(id) {
        return document.getElementById(id);
    }

    function setText(node, text) {
        if (node) {
            node.textContent = text;
        }
    }

    function isSignedIn() {
        const auth = global.AgriviaAuth;
        return Boolean(auth && auth.isSignedIn() && auth.getFarmUuid());
    }

    function createMessage(role, text) {
        const wrap = document.createElement("div");
        wrap.className = `chat-message chat-message-${role}`;
        if (role === "user") {
            const kicker = document.createElement("p");
            kicker.className = "chat-ask-you";
            kicker.textContent = "You asked";
            const question = document.createElement("p");
            question.className = "chat-ask-q";
            question.textContent = text;
            wrap.appendChild(kicker);
            wrap.appendChild(question);
            return wrap;
        }
        const body = document.createElement("div");
        body.className = "chat-message-body chat-ask-a";
        const copy = document.createElement("p");
        copy.className = "chat-message-text";
        copy.textContent = text;
        body.appendChild(copy);
        wrap.appendChild(body);
        return wrap;
    }

    function farmAdvisorContext() {
        const farmUi = global.AgriviaFarmUi;
        if (!farmUi || !farmUi.hasAdvisorFarmContext || !farmUi.hasAdvisorFarmContext()) {
            return null;
        }
        const snapshot = farmUi.getSnapshot && farmUi.getSnapshot();
        const assets = snapshot && Array.isArray(snapshot.assets) ? snapshot.assets : [];
        const profile = (snapshot && snapshot.profile) || {};
        return {
            assets: assets,
            profile: profile,
            place: farmUi.placeLine ? farmUi.placeLine(profile) : "",
            kindLabel: farmUi.kindLabel || function (kind) { return kind; },
        };
    }

    function farmAskLine(assets) {
        const titles = (assets || [])
            .map((asset) => (asset.title || "").trim())
            .filter(Boolean)
            .slice(0, 3);
        if (titles.length === 1) {
            return `Ask about ${titles[0]}, or anything else on the place.`;
        }
        if (titles.length === 2) {
            return `Ask about ${titles[0]}, ${titles[1]}, or anything else on the place.`;
        }
        if (titles.length >= 3) {
            return `Ask about ${titles[0]}, ${titles[1]}, ${titles[2]}, or anything else on the place.`;
        }
        return "";
    }

    function createFarmRailRow(asset, kindLabel) {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "advisor-asset-row";
        row.setAttribute("data-kind", asset.kind || "");
        row.setAttribute("data-title", asset.title || "");
        row.setAttribute("data-asset-id", asset.id || "");

        if (asset.imageUrl) {
            const thumb = document.createElement("img");
            thumb.className = "advisor-asset-thumb";
            thumb.src = asset.imageUrl;
            thumb.alt = "";
            thumb.addEventListener("error", () => {
                thumb.replaceWith(createRailFallback());
            });
            row.appendChild(thumb);
        } else {
            row.appendChild(createRailFallback());
        }

        const copy = document.createElement("span");
        copy.className = "advisor-asset-copy";
        const title = document.createElement("strong");
        title.textContent = asset.title || "Saved asset";
        copy.appendChild(title);
        const metaParts = [];
        if (asset.kind) {
            metaParts.push(kindLabel(asset.kind));
        }
        if (asset.status) {
            metaParts.push(asset.status);
        }
        if (metaParts.length) {
            const meta = document.createElement("span");
            meta.textContent = metaParts.join(" · ");
            copy.appendChild(meta);
        }
        row.appendChild(copy);
        return row;
    }

    function createRailFallback() {
        const mark = document.createElement("span");
        mark.className = "advisor-asset-fallback";
        mark.setAttribute("aria-hidden", "true");
        return mark;
    }

    function createStatus(text, kind) {
        const wrap = document.createElement("div");
        wrap.className = `chat-status chat-status-${kind}`;
        wrap.textContent = text;
        return wrap;
    }

    function formatAcres(acres) {
        if (!acres || acres <= 0) {
            return "";
        }
        return acres === 1 ? "1 acre" : `${acres} acres`;
    }

    function formatDate(value) {
        if (!value) {
            return "";
        }
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return "";
        }
        return date.toLocaleDateString(undefined, { month: "short", year: "numeric" });
    }

    function createAssetCard(asset) {
        const card = document.createElement("aside");
        card.className = "chat-asset-card";

        const kicker = document.createElement("p");
        kicker.className = "chat-asset-kicker";
        kicker.textContent = "Saved to your farm";
        card.appendChild(kicker);

        const title = document.createElement("p");
        title.className = "chat-asset-title";
        title.textContent = asset.title;
        card.appendChild(title);

        const parts = [asset.kind];
        const acres = formatAcres(asset.acres);
        if (acres) {
            parts.push(acres);
        }
        if (asset.subtitle) {
            parts.push(asset.subtitle);
        }
        const planted = formatDate(asset.plantedDate);
        if (planted) {
            parts.push(`Planted ${planted}`);
        }
        const meta = document.createElement("p");
        meta.className = "chat-asset-meta";
        meta.textContent = parts.join(" · ");
        card.appendChild(meta);
        return card;
    }

    function createFarmUpdatedCard() {
        const card = document.createElement("aside");
        card.className = "chat-asset-card";
        const kicker = document.createElement("p");
        kicker.className = "chat-asset-kicker";
        kicker.textContent = "Farm updated";
        card.appendChild(kicker);
        const body = document.createElement("p");
        body.className = "chat-asset-meta";
        body.textContent = "Open Farm to see the latest totals.";
        card.appendChild(body);
        return card;
    }

    function asChip(item) {
        if (typeof item === "string") {
            const text = item.trim();
            return text ? { label: text, query: text } : null;
        }
        if (!item || typeof item !== "object") {
            return null;
        }
        const query = (item.query || item.query_text || item.label || "").trim();
        const label = (item.label || item.title || query).trim();
        if (!query || !label) {
            return null;
        }
        return { label: label, query: query };
    }

    function renderChips(container, chips, onPick) {
        container.replaceChildren();
        const items = (chips || []).map(asChip).filter(Boolean);
        if (!items.length) {
            container.hidden = true;
            return;
        }
        container.hidden = false;
        items.forEach((item) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "query-chip";
            button.textContent = item.label;
            button.addEventListener("click", () => onPick(item.query));
            container.appendChild(button);
        });
    }

    function consumePendingAsk() {
        const params = new URLSearchParams(window.location.search);
        const ask = (params.get("ask") || "").trim();
        if (!ask) {
            return "";
        }
        params.delete("ask");
        const next = params.toString();
        const hash = window.location.hash || "#ai-advisor";
        const url = next
            ? `${window.location.pathname}?${next}${hash}`
            : `${window.location.pathname}${hash}`;
        if (window.history && window.history.replaceState) {
            window.history.replaceState({}, "", url);
        }
        return ask;
    }

    function addRatingRow(parent, qaId, deviceUuid) {
        const row = document.createElement("div");
        row.className = "chat-rating";

        const hint = document.createElement("span");
        hint.textContent = "Was this useful?";
        row.appendChild(hint);

        [
            { rating: 1, label: "Helpful" },
            { rating: -1, label: "Not helpful" },
        ].forEach((item) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "chat-rating-btn";
            button.textContent = item.label;
            button.addEventListener("click", async () => {
                row.querySelectorAll("button").forEach((btn) => {
                    btn.disabled = true;
                });
                try {
                    await api.submitRating(deviceUuid, qaId, item.rating);
                    setText(hint, "Thanks for the feedback.");
                } catch (err) {
                    setText(hint, "Could not save that rating.");
                    row.querySelectorAll("button").forEach((btn) => {
                        btn.disabled = false;
                    });
                }
            });
            row.appendChild(button);
        });

        parent.appendChild(row);
    }

    function init() {
        const form = el("chatForm");
        const input = el("chatInput");
        const sendBtn = el("chatSendBtn");
        const messages = el("chatMessages");
        const empty = el("chatEmpty");
        const chips = el("chatChips");
        const jobChips = el("chatJobChips");
        const greetingEl = el("chatGreeting");
        const welcomeTitle = el("chatWelcomeTitle");
        const welcomeLead = el("chatWelcomeLead");
        const categoryRow = el("chatCategories");
        const saveHint = el("chatSaveHint");
        const shell = form.closest(".chat-shell");
        if (!form || !input || !messages) {
            return;
        }

        let selectedCategory = config.category || "General";
        let activeAsset = null;
        let isSending = false;
        let lastWelcomeGreeting = "";
        const defaultTitle = welcomeTitle ? welcomeTitle.textContent : "What are you working on today?";
        const defaultPlaceholder = input.getAttribute("placeholder") || "";
        const askLines = [];
        let askIndex = 0;
        let askRotateTimer = 0;

        function threadStorageKey(assetId) {
            const auth = global.AgriviaAuth;
            const farmUuid = auth && auth.getFarmUuid ? auth.getFarmUuid() : "";
            return `agrivia_asset_chat_v1:${farmUuid || "guest"}:${assetId || "general"}`;
        }

        function readThread(assetId) {
            try {
                const raw = global.localStorage.getItem(threadStorageKey(assetId));
                const parsed = raw ? JSON.parse(raw) : [];
                return Array.isArray(parsed) ? parsed : [];
            } catch (err) {
                return [];
            }
        }

        function writeThread(assetId, turns) {
            try {
                global.localStorage.setItem(threadStorageKey(assetId), JSON.stringify((turns || []).slice(-30)));
            } catch (err) {
                // private mode
            }
        }

        function captureThread() {
            const turns = [];
            messages.querySelectorAll(".chat-message").forEach((node) => {
                if (node.classList.contains("chat-message-user")) {
                    const question = node.querySelector(".chat-ask-q");
                    if (question && question.textContent) {
                        turns.push({ role: "user", text: question.textContent });
                    }
                } else if (node.classList.contains("chat-message-assistant")) {
                    const answer = node.querySelector(".chat-message-text");
                    if (answer && answer.textContent) {
                        turns.push({ role: "assistant", text: answer.textContent });
                    }
                }
            });
            return turns.slice(-30);
        }

        function persistActiveThread() {
            const id = activeAsset && activeAsset.assetId ? activeAsset.assetId : "general";
            writeThread(id, captureThread());
        }

        function assetRecord(assetId) {
            const farmUi = global.AgriviaFarmUi;
            const snapshot = farmUi && farmUi.getSnapshot ? farmUi.getSnapshot() : null;
            const assets = (snapshot && snapshot.assets) || [];
            return assets.find((item) => item.id === assetId) || null;
        }

        function describeAsset(asset) {
            if (!asset) {
                return "";
            }
            const summary = asset.careSummary || {};
            const lines = [];
            if (asset.title) {
                lines.push(`Name: ${asset.title}`);
            }
            if (asset.kind) {
                lines.push(`Kind: ${asset.kind}`);
            }
            if (asset.status) {
                lines.push(`Status: ${asset.status}`);
            }
            if (asset.count != null) {
                lines.push(`Count: ${asset.count}`);
            }
            if (asset.subtitle) {
                lines.push(`Details: ${asset.subtitle}`);
            }
            if (summary.anchorDate) {
                lines.push(`Anchor date: ${summary.anchorDate}`);
            }
            if (summary.stageLabel) {
                lines.push(`Stage: ${summary.stageLabel}${summary.ageLabel ? ` ${summary.ageLabel}` : ""}`);
            }
            if (summary.nextTask && summary.nextTask.label) {
                lines.push(`Next care: ${summary.nextTask.label}`);
            }
            (summary.milestones || []).slice(0, 3).forEach((item) => {
                if (item && item.label) {
                    lines.push(`Milestone: ${item.label}`);
                }
            });
            return lines.join("\n").slice(0, 1500);
        }

        function chatFocus() {
            if (!activeAsset || !activeAsset.assetId) {
                return null;
            }
            const record = assetRecord(activeAsset.assetId);
            return {
                assetId: activeAsset.assetId,
                assetTitle: activeAsset.title || (record && record.title) || "",
                assetContext: describeAsset(record),
            };
        }

        function renderThread(turns) {
            messages.replaceChildren();
            (turns || []).forEach((turn) => {
                if (!turn || (turn.role !== "user" && turn.role !== "assistant") || !turn.text) {
                    return;
                }
                messages.appendChild(createMessage(turn.role, turn.text));
            });
            const hasTurns = messages.childElementCount > 0;
            showEmpty(!hasTurns);
            if (hasTurns) {
                messages.scrollTop = messages.scrollHeight;
            }
        }

        function focusAsset(detail) {
            const payload = detail || {};
            const assetId = payload.assetId || "";
            if (!assetId) {
                return;
            }
            persistActiveThread();
            const record = assetRecord(assetId);
            activeAsset = {
                assetId: assetId,
                category: payload.category || (record && record.kind) || "",
                title: payload.title || (record && record.title) || "",
            };
            setChatCategory(activeAsset.category);
            input.placeholder = activeAsset.title ? `Ask about ${activeAsset.title}…` : defaultPlaceholder;
            renderThread(readThread(assetId));
            applyWelcomeCopy();
            highlightFarmRail();
            input.focus();
        }

        function setAskLines(prompts) {
            askLines.length = 0;
            (Array.isArray(prompts) ? prompts : []).forEach((text) => {
                const line = String(text || "").trim();
                if (line && askLines.indexOf(line) === -1) {
                    askLines.push(line);
                }
            });
            askIndex = askLines.length
                ? Math.floor(Math.random() * askLines.length)
                : 0;
        }

        function nextAskIndex(except) {
            if (askLines.length < 2) {
                return 0;
            }
            let next = except;
            while (next === except) {
                next = Math.floor(Math.random() * askLines.length);
            }
            return next;
        }

        function guestAskLine() {
            return askLines[askIndex] || "";
        }

        function currentDeviceUuid() {
            const auth = global.AgriviaAuth;
            if (auth && auth.isSignedIn() && auth.getFarmUuid()) {
                return auth.getFarmUuid();
            }
            return api.getOrCreateDeviceUuid();
        }

        function isKnownCategory(name) {
            const allowed = config.chatCategories || [];
            return allowed.indexOf(name) !== -1 && name !== "General";
        }

        function inferChatCategory(text) {
            const haystack = (text || "").toLowerCase();
            if (!haystack) {
                return "";
            }
            const rules = [
                { category: "Fish & Shrimp", pattern: /\b(fish|shrimp|prawn|tilapia|catfish|pond|aquaculture)\b/ },
                { category: "Birds & Bees", pattern: /\b(bee|bees|hive|honey|apiary)\b/ },
                { category: "Poultry & Eggs", pattern: /\b(chicken|chickens|hen|hens|rooster|poultry|egg|eggs|coop|broiler|layer)\b/ },
                { category: "Cattle", pattern: /\b(cattle|cow|cows|calf|calves|herd|steer|heifer|bull|goat|goats|sheep|lamb|pig|pigs|hog|horse|horses|livestock)\b/ },
                { category: "Crops", pattern: /\b(acre|acres|crop|crops|harvest|soybean|wheat|cotton|corn field)\b/ },
                { category: "Garden", pattern: /\b(garden|gardens|tomato|tomatoes|pepper|lettuce|kale)\b|raised beds?|drip kit/ },
            ];
            for (let i = 0; i < rules.length; i += 1) {
                if (rules[i].pattern.test(haystack)) {
                    return rules[i].category;
                }
            }
            return "";
        }

        function categoryForQuery(query) {
            const inferred = inferChatCategory(query);
            if (inferred) {
                selectedCategory = inferred;
            }
            return selectedCategory || config.category || "General";
        }

        function setBusy(busy) {
            isSending = busy;
            input.disabled = busy;
            if (sendBtn) {
                sendBtn.disabled = busy;
            }
        }

        function shouldRotateAsk() {
            if (!empty || empty.hidden || !greetingEl || askLines.length < 2) {
                return false;
            }
            const ctx = farmAdvisorContext();
            if (ctx && farmAskLine(ctx.assets)) {
                return false;
            }
            return true;
        }

        function stopAskRotate() {
            if (askRotateTimer) {
                window.clearInterval(askRotateTimer);
                askRotateTimer = 0;
            }
        }

        function startAskRotate() {
            stopAskRotate();
            if (!shouldRotateAsk()) {
                return;
            }
            if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
                return;
            }
            askRotateTimer = window.setInterval(() => {
                if (!shouldRotateAsk()) {
                    return;
                }
                askIndex = nextAskIndex(askIndex);
                setText(greetingEl, guestAskLine());
            }, 8000);
        }

        function showEmpty(visible) {
            if (empty) {
                empty.hidden = !visible;
            }
            if (jobChips) {
                jobChips.hidden = !visible;
            }
            if (chips) {
                chips.hidden = visible;
            }
            if (shell) {
                shell.classList.toggle("is-empty", visible);
            }
            syncGuestHint();
            if (visible) {
                startAskRotate();
            } else {
                stopAskRotate();
            }
        }

        function appendNode(node) {
            showEmpty(false);
            messages.appendChild(node);
            const thread = messages.closest(".chat-thread");
            if (thread) {
                thread.scrollTop = thread.scrollHeight;
            } else {
                messages.scrollTop = messages.scrollHeight;
            }
        }

        function renderActiveCategory() {
            if (!categoryRow) {
                return;
            }
            categoryRow.replaceChildren();
            const active = isKnownCategory(selectedCategory) ? selectedCategory : "";
            if (!active) {
                categoryRow.hidden = true;
                return;
            }
            categoryRow.hidden = false;
            const label = document.createElement("span");
            label.className = "chat-categories-label";
            label.textContent = "Topic";
            const badge = document.createElement("span");
            badge.className = "chat-category-badge";
            badge.textContent = active;
            categoryRow.appendChild(label);
            categoryRow.appendChild(badge);
        }

        function setChatCategory(name) {
            if (isKnownCategory(name)) {
                selectedCategory = name;
            } else {
                selectedCategory = config.category || "General";
            }
            renderActiveCategory();
            highlightFarmRail();
        }

        function syncGuestHint() {
            if (!saveHint) {
                return;
            }
            const narrow = window.matchMedia("(max-width: 768px)").matches;
            const conversationOn = empty && empty.hidden;
            saveHint.hidden = isSignedIn() || narrow || conversationOn;
        }

        function highlightFarmRail() {
            const assetsEl = el("advisorFarmAssets");
            if (!assetsEl) {
                return;
            }
            const activeId = activeAsset && activeAsset.assetId ? activeAsset.assetId : "";
            assetsEl.querySelectorAll(".advisor-asset-row").forEach((row) => {
                row.classList.toggle("is-active", Boolean(activeId) && row.getAttribute("data-asset-id") === activeId);
            });
        }

        function applyWelcomeCopy() {
            const ctx = farmAdvisorContext();
            if (welcomeTitle) {
                welcomeTitle.textContent = ctx ? "Welcome to the Agrivia advisor" : defaultTitle;
            }
            if (welcomeLead) {
                welcomeLead.hidden = true;
            }
            if (!greetingEl) {
                return;
            }
            let text = "";
            if (activeAsset && activeAsset.title) {
                text = `Ask about ${activeAsset.title}. Answers use the details saved for this item.`;
            } else if (ctx) {
                text = farmAskLine(ctx.assets);
            }
            if (!text) {
                text = guestAskLine();
            }
            if (!text && lastWelcomeGreeting && !isGenericGreeting(lastWelcomeGreeting)) {
                text = lastWelcomeGreeting;
            }
            setText(greetingEl, text);
            greetingEl.hidden = !text;
        }

        function syncFarmAdvisorLayout() {
            const ctx = farmAdvisorContext();
            const layout = el("advisorLayout");
            const rail = el("advisorFarmRail");
            const place = el("advisorFarmPlace");
            const assetsEl = el("advisorFarmAssets");
            if (layout) {
                layout.classList.toggle("advisor-has-farm", Boolean(ctx));
            }
            if (rail) {
                rail.hidden = !ctx;
            }
            applyWelcomeCopy();
            if (!ctx || !assetsEl) {
                if (assetsEl) {
                    assetsEl.replaceChildren();
                }
                if (!ctx) {
                    input.placeholder = defaultPlaceholder;
                }
                return;
            }
            if (place) {
                place.textContent = ctx.place;
                place.hidden = !ctx.place;
            }
            assetsEl.replaceChildren();
            ctx.assets.forEach((asset) => {
                assetsEl.appendChild(createFarmRailRow(asset, ctx.kindLabel));
            });
            highlightFarmRail();
        }

        async function showFarmFeedback(before) {
            const farmUi = global.AgriviaFarmUi;
            if (!isSignedIn() || !farmUi) {
                return;
            }
            if (!before) {
                await farmUi.refresh();
                return;
            }
            let diff = await farmUi.refreshAndDiff(before);
            if (!diff.added.length && !diff.totalsChanged) {
                await new Promise((resolve) => setTimeout(resolve, 1200));
                diff = await farmUi.refreshAndDiff(before);
            }
            if (diff.added.length) {
                setChatCategory(diff.added[0].kind);
                diff.added.slice(0, 3).forEach((asset) => {
                    appendNode(createAssetCard(asset));
                });
                return;
            }
            if (diff.totalsChanged) {
                appendNode(createFarmUpdatedCard());
            }
        }

        async function sendQuery(rawQuery) {
            const query = (rawQuery || "").trim().slice(0, config.maxQueryLength);
            if (!query || isSending) {
                return;
            }

            input.value = "";
            chips.replaceChildren();
            appendNode(createMessage("user", query));
            const pending = createStatus("Thinking…", "loading");
            appendNode(pending);
            setBusy(true);

            const farmUi = global.AgriviaFarmUi;
            const before = isSignedIn() && farmUi ? farmUi.getSnapshot() : null;

            try {
                const deviceUuid = currentDeviceUuid();
                const category = activeAsset && activeAsset.category
                    ? activeAsset.category
                    : categoryForQuery(query);
                renderActiveCategory();
                const result = await api.getAdvisoryResponse(deviceUuid, category, query, chatFocus());
                pending.remove();
                const answerText = answerWithFollowUp(result);
                if (!answerText) {
                    appendNode(createStatus("No answer came back. Try a more specific farm question.", "empty"));
                    showDefaultChips();
                    return;
                }
                const assistant = createMessage("assistant", answerText);
                if (result.qaId) {
                    addRatingRow(assistant.querySelector(".chat-message-body") || assistant, result.qaId, deviceUuid);
                }
                appendNode(assistant);
                try {
                    await showFarmFeedback(before);
                } catch (err) {
                    // Chat already succeeded; farm refresh is best-effort.
                }

                const followUps = chipsAfterAnswer(result);
                renderChips(chips, followUps.slice(0, 4), (query) => {
                    sendQuery(query);
                });
            } catch (err) {
                pending.remove();
                const message = err && err.name === "AbortError"
                    ? "The advisor took too long. Try again."
                    : (err && err.message) || "The advisor could not answer that request.";
                appendNode(createStatus(message, "error"));
                showDefaultChips();
            } finally {
                persistActiveThread();
                setBusy(false);
                input.focus();
            }
        }

        form.addEventListener("submit", (event) => {
            event.preventDefault();
            sendQuery(input.value);
        });

        input.addEventListener("keydown", (event) => {
            if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                sendQuery(input.value);
            }
        });

        function isGenericGreeting(text) {
            return /assist you|agricultural needs|assistance service|how can i help|here to help|planning and managing your farm|job in front of you/i.test(text || "");
        }

        function isGenericChip(text) {
            // Greeting leftovers only. Farm-task / seasonal chips are real API templates now.
            return /how can i help you|planning and managing your farm/i.test(text || "");
        }

        function answerWithFollowUp(result) {
            let text = String(result.answer || "").trim();
            const prompt = String(result.nextQuestionPrompt || "").trim();
            if (!prompt) {
                return text;
            }
            const haystack = text.toLowerCase();
            const needle = prompt.toLowerCase().replace(/[?؟]$/, "").trim();
            if (needle && haystack.includes(needle)) {
                return text;
            }
            return `${text}\n\n${prompt}`;
        }

        function chipsAfterAnswer(result) {
            const followUps = [];
            const seen = {};
            const prompt = (result.nextQuestionPrompt || "").trim();
            function add(item) {
                const chip = asChip(item);
                if (!chip || seen[chip.query] || isGenericChip(chip.query) || isGenericChip(chip.label)) {
                    return;
                }
                if (prompt && (chip.query === prompt || chip.label === prompt)) {
                    return;
                }
                seen[chip.query] = true;
                followUps.push(chip);
            }
            (result.suggestionChips || []).forEach(add);
            return followUps.slice(0, 4);
        }

        function renderStarterChips(suggestions) {
            if (!jobChips) {
                return;
            }
            jobChips.replaceChildren();
            const items = (suggestions || [])
                .map(asChip)
                .filter((chip) => chip && !isGenericChip(chip.query) && !isGenericChip(chip.label))
                .slice(0, 4);
            if (!items.length) {
                const browse = document.createElement("a");
                browse.href = "guides/index.html";
                browse.className = "btn btn-outline job-chips-fallback";
                browse.textContent = "Browse guides";
                jobChips.appendChild(browse);
                jobChips.hidden = false;
                return;
            }
            items.forEach((item) => {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "job-chip";
                button.setAttribute("data-query", item.query);
                button.textContent = item.label;
                jobChips.appendChild(button);
            });
            jobChips.hidden = false;
        }

        function showDefaultChips() {
            showEmpty(true);
            if (chips) {
                chips.replaceChildren();
                chips.hidden = true;
            }
        }

        function onChipClick(event) {
            const chip = event.target.closest("[data-query]");
            if (!chip || isSending) {
                return;
            }
            sendQuery(chip.getAttribute("data-query"));
        }

        if (chips) {
            chips.addEventListener("click", onChipClick);
        }
        if (jobChips) {
            jobChips.addEventListener("click", onChipClick);
        }
        const farmAssetsEl = el("advisorFarmAssets");
        if (farmAssetsEl) {
            farmAssetsEl.addEventListener("click", (event) => {
                const row = event.target.closest(".advisor-asset-row");
                if (!row || isSending) {
                    return;
                }
                focusAsset({
                    assetId: row.getAttribute("data-asset-id") || "",
                    category: row.getAttribute("data-kind") || "",
                    title: row.getAttribute("data-title") || "",
                });
            });
        }

        renderActiveCategory();
        syncGuestHint();
        syncFarmAdvisorLayout();
        startAskRotate();
        const narrowAdvisor = window.matchMedia("(max-width: 768px)");
        if (narrowAdvisor.addEventListener) {
            narrowAdvisor.addEventListener("change", syncGuestHint);
        }
        global.addEventListener("agrivia-auth-changed", () => {
            if (!isSignedIn()) {
                setChatCategory("");
                input.placeholder = defaultPlaceholder;
            }
            syncGuestHint();
            syncFarmAdvisorLayout();
        });
        global.addEventListener("agrivia-farm-changed", () => {
            syncFarmAdvisorLayout();
        });
        global.addEventListener("agrivia-chat-category", (event) => {
            const name = event && event.detail && event.detail.category;
            setChatCategory(name);
        });
        global.addEventListener("agrivia-chat-open-asset", (event) => {
            const detail = event && event.detail ? event.detail : {};
            focusAsset(detail);
        });
        global.addEventListener("agrivia-chat-ask", (event) => {
            const detail = event && event.detail ? event.detail : {};
            if (detail.category) {
                setChatCategory(detail.category);
            }
            if (detail.query) {
                sendQuery(detail.query);
            }
        });

        const pendingAsk = consumePendingAsk();
        if (pendingAsk) {
            if (typeof global.navigateTo === "function") {
                global.navigateTo("ai-advisor");
            } else {
                window.location.hash = "ai-advisor";
            }
            sendQuery(pendingAsk);
            return;
        }

        api.getWelcomeGreeting(currentDeviceUuid(), config.category || "General", new Date().getHours())
            .then((welcome) => {
                lastWelcomeGreeting = (welcome.greeting || "").trim();
                setAskLines(welcome.askPrompts);
                applyWelcomeCopy();
                startAskRotate();
                const starters = [];
                (welcome.suggestions || []).forEach((item) => starters.push(item));
                renderStarterChips(starters);
            })
            .catch(() => {
                setAskLines([]);
                applyWelcomeCopy();
                renderStarterChips([]);
            });
    }

    document.addEventListener("DOMContentLoaded", init);
})(window);
