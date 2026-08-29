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
        if (!form || !input || !messages) {
            return;
        }

        const deviceUuid = api.getOrCreateDeviceUuid();
        const category = config.category;
        let isSending = false;

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

            try {
                const result = await api.getAdvisoryResponse(deviceUuid, category, query);
                pending.remove();
                const answerText = result.answer.trim();
                if (!answerText) {
                    appendNode(createStatus("No answer came back. Try a more specific farm question.", "empty"));
                    return;
                }
                const assistant = createMessage("assistant", answerText);
                if (result.qaId) {
                    addRatingRow(assistant, result.qaId, deviceUuid);
                }
                appendNode(assistant);

                const followUps = result.suggestionChips.slice();
                if (result.nextQuestionPrompt) {
                    followUps.unshift(result.nextQuestionPrompt);
                }
                renderChips(chips, followUps, (label) => {
                    sendQuery(label);
                });
            } catch (err) {
                pending.remove();
                const message = err && err.name === "AbortError"
                    ? "The advisor took too long. Try again."
                    : (err && err.message) || "The advisor could not answer that request.";
                appendNode(createStatus(message, "error"));
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

        api.getWelcomeGreeting(deviceUuid, category, new Date().getHours())
            .then((welcome) => {
                if (welcome.greeting && greetingEl) {
                    setText(greetingEl, welcome.greeting);
                }
                renderChips(chips, welcome.suggestions || [], (label) => {
                    sendQuery(label);
                });
            })
            .catch(() => {
                // Empty-state copy in HTML stays; no mock greeting.
            });
    }

    document.addEventListener("DOMContentLoaded", init);
})(window);
