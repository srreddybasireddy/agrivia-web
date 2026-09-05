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

        const body = document.createElement("p");
        body.className = "chat-message-text";
        body.textContent = text;
        wrap.appendChild(body);
        return wrap;
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

    function renderChips(container, chips, onPick) {
        container.replaceChildren();
        chips.forEach((label) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "query-chip";
            button.textContent = label;
            button.addEventListener("click", () => onPick(label));
            container.appendChild(button);
        });
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
        const greetingEl = el("chatGreeting");
        const categoryRow = el("chatCategories");
        const saveHint = el("chatSaveHint");
        if (!form || !input || !messages) {
            return;
        }

        let selectedCategory = config.category || "General";
        let isSending = false;

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

        function showEmpty(visible) {
            if (empty) {
                empty.hidden = !visible;
            }
        }

        function appendNode(node) {
            showEmpty(false);
            messages.appendChild(node);
            messages.scrollTop = messages.scrollHeight;
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
        }

        function syncGuestHint() {
            if (saveHint) {
                saveHint.hidden = isSignedIn();
            }
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
                const category = categoryForQuery(query);
                renderActiveCategory();
                const result = await api.getAdvisoryResponse(deviceUuid, category, query);
                pending.remove();
                const answerText = result.answer.trim();
                if (!answerText) {
                    appendNode(createStatus("No answer came back. Try a more specific farm question.", "empty"));
                    showDefaultChips();
                    return;
                }
                const assistant = createMessage("assistant", answerText);
                if (result.qaId) {
                    addRatingRow(assistant, result.qaId, deviceUuid);
                }
                appendNode(assistant);
                try {
                    await showFarmFeedback(before);
                } catch (err) {
                    // Chat already succeeded; farm refresh is best-effort.
                }

                const followUps = chipsAfterAnswer(query, result);
                const pendingChip = global.AgriviaFarmUi && global.AgriviaFarmUi.getPendingPrompt
                    ? global.AgriviaFarmUi.getPendingPrompt()
                    : "";
                if (pendingChip && followUps.indexOf(pendingChip) === -1) {
                    followUps.unshift(pendingChip);
                }
                renderChips(chips, followUps.slice(0, 4), (label) => {
                    sendQuery(label);
                });
            } catch (err) {
                pending.remove();
                const message = err && err.name === "AbortError"
                    ? "The advisor took too long. Try again."
                    : (err && err.message) || "The advisor could not answer that request.";
                appendNode(createStatus(message, "error"));
                showDefaultChips();
            } finally {
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

        const defaultHobbyChips = [
            "Shade for six cattle in a drylot",
            "Drip kit for raised beds",
            "Electric fence for goats and poultry",
            "Freeze-proof cattle tank"
        ];

        const afterAnswerChips = [
            "What farm tasks should I focus on this week?",
            "Give me seasonal tips for my region",
        ];

        function topicFollowUps(query, answer) {
            const haystack = `${query} ${answer}`.toLowerCase();
            if (/cow|cattle|calf|herd/.test(haystack)) {
                return [
                    "How much shade do they need in a drylot?",
                    "What should change in their winter feed?",
                ];
            }
            if (/goat|sheep/.test(haystack)) {
                return [
                    "What fencing works for goats on a small place?",
                    "How do I keep water from freezing?",
                ];
            }
            if (/chicken|poultry|hen|egg|coop/.test(haystack)) {
                return [
                    "How do I keep coop water from freezing?",
                    "What should I check in the run this week?",
                ];
            }
            if (/tomato|garden|raised bed|leaf|drip/.test(haystack)) {
                return [
                    "How often should I water raised beds this week?",
                    "What should I photograph on a sick leaf?",
                ];
            }
            return [];
        }

        function chipsAfterAnswer(query, result) {
            const followUps = [];
            const seen = {};
            function add(label) {
                const chip = (label || "").trim();
                if (!chip || seen[chip]) {
                    return;
                }
                seen[chip] = true;
                followUps.push(chip);
            }
            add(result.nextQuestionPrompt);
            (result.suggestionChips || []).forEach(add);
            const hasApiChips = followUps.length > 0;
            topicFollowUps(query, result.answer).forEach(add);
            if (!hasApiChips) {
                afterAnswerChips.forEach(add);
                defaultHobbyChips.forEach(add);
            }
            return followUps.slice(0, 4);
        }

        function showDefaultChips() {
            renderChips(chips, defaultHobbyChips, (label) => {
                sendQuery(label);
            });
        }

        renderActiveCategory();
        syncGuestHint();
        global.addEventListener("agrivia-auth-changed", () => {
            if (!isSignedIn()) {
                setChatCategory("");
            }
            syncGuestHint();
        });
        global.addEventListener("agrivia-chat-category", (event) => {
            const name = event && event.detail && event.detail.category;
            setChatCategory(name);
        });

        api.getWelcomeGreeting(currentDeviceUuid(), config.category || "General", new Date().getHours())
            .then((welcome) => {
                if (welcome.greeting && greetingEl) {
                    setText(greetingEl, welcome.greeting);
                }
                const suggestions = (welcome.suggestions && welcome.suggestions.length > 0)
                    ? welcome.suggestions
                    : defaultHobbyChips;
                renderChips(chips, suggestions, (label) => {
                    sendQuery(label);
                });
            })
            .catch(() => {
                renderChips(chips, defaultHobbyChips, (label) => {
                    sendQuery(label);
                });
            });
    }

    document.addEventListener("DOMContentLoaded", init);
})(window);
