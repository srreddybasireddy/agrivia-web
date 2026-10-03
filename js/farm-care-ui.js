/**
 * Care dashboard on the Farm view: today list, asset care page, and the header bell.
 * Stage names, task copy, and milestone text are rendered from the API.
 */
(function (global) {
    const care = global.AgriviaFarmCare;
    let unread = 0;
    let pollTimer = 0;
    let scheduleTimer = 0;
    let scheduleTries = 0;
    let openAssetId = "";

    function el(id) {
        return document.getElementById(id);
    }

    function api() {
        return global.AgriviaFarmApi;
    }

    function signedIn() {
        if (global.AgriviaAuth && global.AgriviaAuth.isSignedIn()) {
            return true;
        }
        return Boolean(global.AgriviaFarmPreview && global.AgriviaFarmPreview.enabled());
    }

    function listFrom(data, keys) {
        for (let i = 0; i < keys.length; i += 1) {
            const value = data && data[keys[i]];
            if (Array.isArray(value)) {
                return value;
            }
        }
        return [];
    }

    function text(value) {
        return typeof value === "string" ? value.trim() : "";
    }

    function clear(node) {
        if (node) {
            node.replaceChildren();
        }
    }

    function button(label, className) {
        const node = document.createElement("button");
        node.type = "button";
        node.className = className;
        node.textContent = label;
        return node;
    }

    function setUnread(count) {
        unread = Math.max(0, Number(count) || 0);
        const dot = el("farmBellDot");
        const bell = el("farmBell");
        if (dot) {
            dot.hidden = unread < 1;
        }
        if (bell) {
            bell.setAttribute("aria-label", unread ? `Notifications, ${unread} unread` : "Notifications");
        }
    }

    async function refreshUnread() {
        if (!signedIn() || !api()) {
            setUnread(0);
            return;
        }
        try {
            const data = await api().unreadCount();
            const count = data.count != null ? data.count : data.unread_count;
            setUnread(count);
        } catch (err) {
            setUnread(unread);
        }
    }

    function startPoll() {
        const bell = el("farmBell");
        if (bell) {
            bell.hidden = !signedIn();
        }
        if (!signedIn()) {
            closeNotify();
            return;
        }
        refreshUnread();
        if (!pollTimer) {
            pollTimer = global.setInterval(refreshUnread, 60000);
        }
    }

    function taskRows(data) {
        return listFrom(data, ["tasks", "items", "today"]);
    }

    function renderToday() {
        const panel = el("farmToday");
        const body = el("farmTodayBody");
        if (!panel || !body || !signedIn() || !api()) {
            if (panel) {
                panel.hidden = true;
            }
            return;
        }
        if (openAssetId) {
            panel.hidden = true;
            return;
        }
        panel.hidden = false;
        body.replaceChildren();
        const skeleton = document.createElement("p");
        skeleton.className = "farm-care-status";
        skeleton.textContent = "Loading today’s tasks…";
        body.appendChild(skeleton);
        api().getToday().then((data) => {
            paintToday(body, taskRows(data));
        }).catch((err) => {
            clear(body);
            const message = document.createElement("p");
            message.className = "farm-care-status is-error";
            message.textContent = err.message || "Today’s tasks could not be loaded.";
            body.appendChild(message);
        });
    }

    function paintToday(body, tasks) {
        clear(body);
        if (!tasks.length) {
            const empty = document.createElement("p");
            empty.className = "farm-care-status";
            empty.textContent = "Nothing due today.";
            const link = document.createElement("button");
            link.type = "button";
            link.className = "farm-care-link";
            link.textContent = "Set up reminders";
            link.addEventListener("click", () => {
                const grid = el("farmAssetGrid");
                if (grid) {
                    grid.scrollIntoView({ behavior: "smooth", block: "start" });
                }
            });
            body.appendChild(empty);
            body.appendChild(link);
            return;
        }
        const list = document.createElement("ul");
        list.className = "farm-today-list";
        tasks.forEach((task) => {
            list.appendChild(todayRow(task));
        });
        body.appendChild(list);
    }

    function todayRow(task) {
        const row = document.createElement("li");
        row.className = care.isOverdue(task) ? "is-overdue" : "";
        const check = document.createElement("input");
        check.type = "checkbox";
        check.setAttribute("aria-label", "Done");
        const copy = document.createElement("span");
        const taskType = text(task.task_type || task.taskType || task.type);
        const assetName = text(task.asset_name || task.assetName || task.asset_title);
        copy.textContent = text(task.label || task.title) || [care.taskLine({
            type: taskType,
            label: "",
            dueAt: task.due_at || task.dueAt,
        }), assetName].filter(Boolean).join(" · ");
        const snooze = button("Snooze", "farm-care-link");
        const reminderId = task.reminder_id || task.reminderId || task.id;
        check.addEventListener("change", () => runTodayAction(row, () => api().completeReminder(reminderId), check));
        snooze.addEventListener("click", () => runTodayAction(row, () => api().snoozeReminder(reminderId, "1h"), check));
        row.appendChild(check);
        row.appendChild(copy);
        row.appendChild(snooze);
        return row;
    }

    async function runTodayAction(row, action) {
        const previous = row.hidden;
        row.hidden = true;
        try {
            await action();
            renderToday();
            refreshUnread();
        } catch (err) {
            row.hidden = previous;
            const note = el("farmLoadStatus");
            if (note) {
                note.hidden = false;
                note.textContent = err.message || "Could not update that task.";
            }
        }
    }

    function cardFacts(asset) {
        const model = care.normalizeAsset(asset);
        const list = document.createElement("dl");
        list.className = "farm-facts";
        care.factRows(model, "card").forEach((row) => {
            const item = document.createElement("div");
            const term = document.createElement("dt");
            term.textContent = row.label;
            const value = document.createElement("dd");
            if (row.kind === "add") {
                const add = button(row.value, "farm-fact-add");
                add.setAttribute("aria-label", `${row.value.replace(/^\+\s*/, "")} for ${model.name}`);
                add.addEventListener("click", (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (global.AgriviaFarmUi && global.AgriviaFarmUi.editAsset) {
                        global.AgriviaFarmUi.editAsset(asset, true);
                    }
                });
                value.appendChild(add);
            } else if (row.kind === "cta") {
                const cta = button(row.value, "farm-fact-add");
                cta.setAttribute("aria-label", `${row.value} for ${model.name}`);
                cta.addEventListener("click", (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    openAnchor(asset);
                });
                value.appendChild(cta);
            } else if (row.kind === "hint") {
                value.className = "farm-fact-hint";
                value.textContent = row.value;
            } else if (row.kind === "reminders") {
                value.appendChild(document.createTextNode(row.value));
                if (row.action) {
                    const turn = button(row.action, "farm-care-link");
                    turn.setAttribute("aria-label", `${row.action} reminders for ${model.name}`);
                    turn.addEventListener("click", (event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        showAsset(asset.id);
                    });
                    value.appendChild(document.createTextNode(" · "));
                    value.appendChild(turn);
                }
            } else if (row.kind === "stage" && row.total > 1) {
                value.textContent = row.value;
                const bar = document.createElement("span");
                bar.className = "farm-stage-mini";
                bar.setAttribute("aria-hidden", "true");
                for (let index = 0; index < row.total; index += 1) {
                    const segment = document.createElement("span");
                    if (index <= row.index) {
                        segment.className = "is-on";
                    }
                    bar.appendChild(segment);
                }
                value.appendChild(bar);
            } else {
                value.textContent = row.value;
            }
            item.appendChild(term);
            item.appendChild(value);
            list.appendChild(item);
        });
        return list;
    }

    function appendCardCare(copy, asset) {
        copy.appendChild(cardFacts(asset));
        const open = document.createElement("a");
        open.className = "farm-care-link farm-care-plan-link";
        open.href = `#${assetHash(asset.id)}`;
        open.textContent = "Care plan →";
        open.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            showAsset(asset.id);
        });
        copy.appendChild(open);
    }

    function refreshCardFacts(asset) {
        if (!asset || !asset.id) {
            return;
        }
        const escaped = global.CSS && CSS.escape ? CSS.escape(asset.id) : String(asset.id).replace(/"/g, "");
        const card = document.querySelector(`[data-asset-id="${escaped}"]`);
        const facts = card && card.querySelector(".farm-facts");
        if (!facts) {
            return;
        }
        facts.replaceWith(cardFacts(asset));
    }

    function line(value, className) {
        const node = document.createElement("p");
        node.className = className;
        node.textContent = value;
        return node;
    }

    function openAnchor(asset) {
        const dialog = el("farmAnchorDialog");
        const title = el("farmAnchorTitle");
        const form = el("farmAnchorForm");
        if (!dialog || !form) {
            return;
        }
        if (title) {
            title.textContent = asset.title || "Set date";
        }
        form.reset();
        form.dataset.assetId = asset.id || "";
        form.dataset.category = asset.kind || asset.category || "";
        form.dataset.assetTitle = asset.title || "";
        form.dataset.count = asset.count == null ? "" : String(asset.count);
        if (typeof dialog.showModal === "function") {
            dialog.showModal();
        }
    }

    async function submitAnchor(event) {
        event.preventDefault();
        const form = event.currentTarget;
        const status = el("farmAnchorStatus");
        const assetId = form.dataset.assetId;
        const date = el("farmAnchorDate");
        const weeks = el("farmAnchorWeeks");
        const anchorDate = date && date.value ? date.value : "";
        const ageWeeks = weeks && weeks.value !== "" ? weeks.value : "";
        if (!anchorDate && ageWeeks === "") {
            if (status) {
                status.textContent = "Add a date or an age in weeks.";
            }
            return;
        }
        try {
            await api().saveCarePlan(assetId, {
                category: form.dataset.category,
                assetTitle: form.dataset.assetTitle,
                subjectKey: care.subjectKeyOf(form.dataset.assetTitle),
                quantity: form.dataset.count,
                anchorDate: anchorDate,
                ageWeeks: ageWeeks,
            });
            const dialog = el("farmAnchorDialog");
            if (dialog) {
                dialog.close();
            }
            if (global.AgriviaFarmUi) {
                await global.AgriviaFarmUi.refresh();
            }
        } catch (err) {
            if (status) {
                status.textContent = err.message || "Could not save that date.";
            }
        }
    }

    function showDetail(show) {
        const detail = el("farmDetail");
        const list = el("farmList");
        const today = el("farmToday");
        if (detail) {
            detail.hidden = !show;
        }
        if (list) {
            list.hidden = Boolean(show);
        }
        if (today && show) {
            today.hidden = true;
        }
    }

    async function openAsset(id, options) {
        const quiet = Boolean(options && options.quiet && openAssetId === id && el("farmDetailBody") && el("farmDetailBody").querySelector(".farm-detail-hero"));
        openAssetId = id || "";
        const body = el("farmDetailBody");
        showDetail(true);
        if (!body) {
            return;
        }
        let statusNode = null;
        if (!quiet) {
            clear(body);
            statusNode = document.createElement("p");
            statusNode.className = "farm-care-status";
            statusNode.textContent = "Loading care plan…";
            body.appendChild(statusNode);
        }
        if (!signedIn()) {
            if (statusNode) {
                statusNode.textContent = "Sign in to see this care plan.";
            }
            return;
        }
        try {
            const asset = assetById(id);
            const [view, reminderPayload] = await Promise.all([
                api().getCareView(id, asset),
                api().getReminders(id, asset).catch(() => ({ reminders: [] })),
            ]);
            paintDetail(body, asset, view || {}, reminderPayload || {});
        } catch (err) {
            clear(body);
            const message = document.createElement("p");
            message.className = "farm-care-status is-error";
            message.textContent = err.message || "Could not load this care plan.";
            body.appendChild(message);
        }
    }

    function assetHash(id) {
        return `farm/asset/${encodeURIComponent(id)}`;
    }

    function showAsset(id) {
        const next = assetHash(id);
        const current = String(global.location.hash || "").replace(/^#/, "");
        if (current === next) {
            openAsset(id);
            return;
        }
        global.location.hash = next;
    }

    function closeAsset() {
        const returnId = openAssetId;
        openAssetId = "";
        showDetail(false);
        if (String(global.location.hash || "").indexOf("farm/asset/") !== -1) {
            global.location.hash = "farm";
        }
        renderToday();
        const card = returnId && document.querySelector(`[data-asset-id="${returnId}"] .farm-care-plan-link`);
        if (card) {
            card.focus();
        }
    }

    function assetById(id) {
        const ui = global.AgriviaFarmUi;
        const snapshot = ui && ui.getSnapshot && ui.getSnapshot();
        const assets = (snapshot && snapshot.assets) || [];
        return assets.find((item) => item.id === id) || { id: id };
    }

    function paintDetail(body, asset, view, reminderPayload) {
        clear(body);
        const saved = listFrom(reminderPayload, ["reminders"]);
        const plan = Object.assign({}, view || {}, { reminders: saved });
        const model = care.normalizeAsset(asset, plan);
        const hero = document.createElement("header");
        hero.className = "farm-detail-hero paper-card";
        const copy = document.createElement("div");
        copy.className = "farm-detail-copy";
        const chips = document.createElement("div");
        chips.className = "farm-asset-head";
        const type = document.createElement("span");
        type.className = "farm-type-chip";
        type.textContent = model.kindLabel;
        chips.appendChild(type);
        if (model.status) {
            const pill = document.createElement("span");
            pill.className = model.status === "Planning" ? "farm-status-pill is-planning" : "farm-status-pill";
            const dot = document.createElement("span");
            dot.className = "farm-status-dot";
            dot.setAttribute("aria-hidden", "true");
            pill.appendChild(dot);
            pill.appendChild(document.createTextNode(model.status));
            chips.appendChild(pill);
        }
        copy.appendChild(chips);
        const title = document.createElement("h2");
        title.id = "farmAssetTitle";
        title.tabIndex = -1;
        title.textContent = model.name || model.kindLabel || "Care plan";
        copy.appendChild(title);
        const sub = document.createElement("p");
        sub.className = "farm-detail-sub";
        const subject = model.displayName || model.name;
        const mismatch = model.displayName && model.name && model.displayName.toLowerCase() !== model.name.toLowerCase();
        const place = [
            mismatch ? `Schedule uses ${model.displayName}` : (subject && `${subject} care plan`),
            model.zip && `ZIP ${model.zip}`,
            model.climate,
        ].filter(Boolean).join(" · ");
        sub.textContent = place;
        copy.appendChild(sub);
        const facts = document.createElement("dl");
        facts.className = "farm-keyfacts";
        care.factRows(model, "detail").forEach((row) => {
            if (row.kind === "hint" || row.kind === "reminders") {
                return;
            }
            const item = document.createElement("div");
            const term = document.createElement("dt");
            term.textContent = row.label;
            const value = document.createElement("dd");
            if (row.kind === "cta") {
                const cta = button(row.value, "farm-fact-add");
                cta.setAttribute("aria-label", `${row.value} for ${model.name}`);
                cta.addEventListener("click", () => openAnchor(asset));
                value.appendChild(cta);
            } else if (row.kind === "add") {
                const add = button(row.value, "farm-fact-add");
                add.addEventListener("click", () => {
                    if (global.AgriviaFarmUi && global.AgriviaFarmUi.editAsset) {
                        global.location.hash = "farm";
                        global.AgriviaFarmUi.editAsset(asset, true);
                    }
                });
                value.appendChild(add);
            } else {
                value.textContent = row.value;
            }
            item.appendChild(term);
            item.appendChild(value);
            facts.appendChild(item);
        });
        copy.appendChild(facts);
        if (model.schedule && model.schedule.confidence === "low") {
            copy.appendChild(line("Low confidence estimate", "farm-care-status"));
        }
        if (model.schedule && model.schedule.notes) {
            copy.appendChild(line(model.schedule.notes, "farm-care-status"));
        }
        hero.appendChild(copy);
        const imageUrl = care.illustrationFor(asset);
        if (imageUrl) {
            const art = document.createElement("img");
            art.className = "farm-detail-art";
            art.src = imageUrl;
            art.alt = "";
            hero.appendChild(art);
        }
        body.appendChild(hero);

        const grid = document.createElement("div");
        grid.className = "farm-detail-grid";
        const main = document.createElement("div");
        if (model.stage && model.stage.stages && model.stage.stages.length) {
            main.appendChild(stageSection(model));
        }
        if (model.anchor.date && model.milestones.length) {
            main.appendChild(milestoneSection(model));
        } else if (!model.anchor.date) {
            const empty = document.createElement("section");
            empty.className = "paper-card farm-section";
            const heading = document.createElement("h3");
            heading.textContent = "Estimated milestones";
            empty.appendChild(heading);
            const note = document.createElement("p");
            note.textContent = "Add a planting date to see estimates.";
            empty.appendChild(note);
            const ctaLabel = care.ctaLabel(model.anchor.promptKey, model.kind, model.status);
            const cta = button(ctaLabel, "farm-fact-add");
            cta.setAttribute("aria-label", `${ctaLabel} for ${model.name}`);
            cta.addEventListener("click", () => openAnchor(asset));
            empty.appendChild(cta);
            main.appendChild(empty);
        }
        if (model.guidance.length) {
            main.appendChild(guidanceSection(model));
        }
        const side = document.createElement("div");
        side.appendChild(reminderEditor(asset, model));
        side.appendChild(askCard(model));
        grid.appendChild(main);
        grid.appendChild(side);
        body.appendChild(grid);
        title.focus();
    }

    function stageSection(model) {
        const section = document.createElement("section");
        section.className = "paper-card farm-section";
        const heading = document.createElement("h3");
        heading.textContent = "Growth stage";
        section.appendChild(heading);
        const track = document.createElement("div");
        track.className = "farm-stage-track";
        track.setAttribute("role", "img");
        const day = model.stage.day != null ? model.stage.day : "";
        track.setAttribute("aria-label", `Day ${day}, ${model.stage.label}, stage ${model.stage.index + 1} of ${model.stage.total}`);
        model.stage.stages.forEach((stage) => {
            const bar = document.createElement("span");
            bar.className = stage.is_current || stage.isCurrent ? "is-current" : "";
            track.appendChild(bar);
        });
        section.appendChild(track);
        if (model.stage.summary) {
            const summary = document.createElement("p");
            summary.textContent = model.stage.summary;
            section.appendChild(summary);
        }
        if (model.stage.nextLabel) {
            const next = document.createElement("p");
            next.textContent = `Next stage: ${model.stage.nextLabel}` + (model.stage.nextStartsDay != null ? ` from about day ${model.stage.nextStartsDay}` : "");
            section.appendChild(next);
        }
        return section;
    }

    function milestoneSection(model) {
        const section = document.createElement("section");
        section.className = "paper-card farm-section";
        const heading = document.createElement("h3");
        heading.textContent = "Estimated milestones";
        section.appendChild(heading);
        const note = document.createElement("p");
        note.className = "farm-care-status";
        note.textContent = "Estimated ranges, not guarantees.";
        section.appendChild(note);
        const list = document.createElement("dl");
        list.className = "farm-milestones";
        model.milestones.forEach((item) => {
            const row = document.createElement("div");
            const term = document.createElement("dt");
            term.textContent = item.label;
            const value = document.createElement("dd");
            value.textContent = care.formatRange(item.from, item.to, { year: true });
            row.appendChild(term);
            row.appendChild(value);
            list.appendChild(row);
        });
        section.appendChild(list);
        return section;
    }

    function guidanceSection(model) {
        const section = document.createElement("section");
        section.className = "paper-card farm-section";
        const heading = document.createElement("h3");
        heading.textContent = "Care plan";
        section.appendChild(heading);
        model.guidance.filter((item) => item.optional !== true).forEach((item) => {
            const row = document.createElement("article");
            row.className = "farm-guidance";
            const title = document.createElement("h4");
            title.textContent = text(item.label) || text(item.task_type || item.taskType);
            const when = document.createElement("p");
            when.textContent = care.intervalText(item.interval_days || item.intervalDays);
            const copy = document.createElement("p");
            copy.textContent = text(item.guidance_text || item.guidanceText);
            row.appendChild(title);
            row.appendChild(when);
            row.appendChild(copy);
            const climate = text(item.climate_note || item.climateNote);
            if (climate) {
                const note = document.createElement("p");
                note.className = "farm-climate-note";
                note.textContent = climate;
                row.appendChild(note);
            }
            section.appendChild(row);
        });
        return section;
    }

    function askCard(model) {
        const card = document.createElement("section");
        card.className = "paper-card farm-ask-card";
        const heading = document.createElement("h3");
        heading.textContent = `Questions about your ${model.name.toLowerCase()}?`;
        card.appendChild(heading);
        const ask = button(`Ask Advisor about ${model.name}`, "btn btn-primary");
        ask.addEventListener("click", () => {
            global.dispatchEvent(new CustomEvent("agrivia-chat-open-asset", {
                detail: {
                    assetId: model.id,
                    category: model.kind,
                    title: model.name,
                },
            }));
            if (typeof global.navigateTo === "function") {
                global.navigateTo("ai-advisor");
            }
        });
        card.appendChild(ask);
        const disclaimer = document.createElement("p");
        disclaimer.className = "farm-care-status";
        disclaimer.textContent = model.disclaimer || "Guidance only — estimated ranges, not guarantees.";
        card.appendChild(disclaimer);
        return card;
    }

    function reminderEditor(asset, model) {
        const form = document.createElement("form");
        form.className = "paper-card farm-section";
        const heading = document.createElement("h3");
        heading.textContent = "Reminders";
        form.appendChild(heading);
        const lead = document.createElement("p");
        lead.className = "farm-care-status";
        lead.textContent = "Nothing is sent until you turn a reminder on.";
        form.appendChild(lead);
        const rows = (model.reminders.rows || []).map((row) => ({
            id: row.id || "",
            taskType: row.task_type || row.taskType || "",
            label: text(row.label) || row.task_type || row.taskType || "Task",
            enabled: Boolean(row.enabled),
            timeOfDay: text(row.time_of_day || row.timeOfDay || row.time_local || row.timeLocal) || "07:00",
            intervalDays: Number(row.interval_days || row.intervalDays) || 1,
        })).concat((model.reminders.suggested || []).map((row) => ({
            id: "",
            taskType: row.task_type,
            label: row.label,
            enabled: false,
            timeOfDay: row.time_of_day || "08:00",
            intervalDays: row.interval_days || 1,
        })));
        rows.forEach((row, index) => {
            const line = document.createElement("div");
            line.className = "farm-reminder-row";
            const copy = document.createElement("div");
            const name = document.createElement("strong");
            name.textContent = row.label;
            const freq = document.createElement("p");
            freq.textContent = care.intervalText(row.intervalDays);
            copy.appendChild(name);
            copy.appendChild(freq);
            const time = document.createElement("input");
            time.type = "time";
            time.value = row.timeOfDay.slice(0, 5);
            time.setAttribute("aria-label", `${row.label} time`);
            time.addEventListener("change", () => {
                rows[index].timeOfDay = time.value;
            });
            const toggle = document.createElement("input");
            toggle.type = "checkbox";
            toggle.setAttribute("role", "switch");
            toggle.setAttribute("aria-label", `${row.label} reminder`);
            toggle.checked = row.enabled;
            toggle.addEventListener("change", () => {
                rows[index].enabled = toggle.checked;
            });
            line.appendChild(copy);
            line.appendChild(time);
            line.appendChild(toggle);
            form.appendChild(line);
        });
        const save = button("Save reminders", "btn btn-primary btn-sm");
        const status = document.createElement("p");
        status.className = "farm-care-status";
        status.setAttribute("aria-live", "polite");
        save.addEventListener("click", async (event) => {
            event.preventDefault();
            save.disabled = true;
            try {
                await api().saveReminders(asset.id, rows, asset);
                status.textContent = "Saved.";
                if (global.AgriviaFarmUi && global.AgriviaFarmUi.refresh) {
                    await global.AgriviaFarmUi.refresh();
                }
            } catch (err) {
                status.textContent = err.message || "Could not save reminders.";
            } finally {
                save.disabled = false;
            }
        });
        form.appendChild(save);
        form.appendChild(status);
        return form;
    }

    function closeNotify() {
        const panel = el("farmNotify");
        const bell = el("farmBell");
        if (panel) {
            panel.hidden = true;
        }
        if (bell) {
            bell.setAttribute("aria-expanded", "false");
        }
    }

    async function openNotifications(full) {
        const panel = el("farmNotify");
        const bell = el("farmBell");
        if (!panel || !signedIn()) {
            return;
        }
        panel.hidden = false;
        panel.classList.toggle("is-sheet", Boolean(full));
        if (bell) {
            bell.setAttribute("aria-expanded", "true");
        }
        const body = el("farmNotifyBody");
        if (!body) {
            return;
        }
        clear(body);
        const loading = document.createElement("p");
        loading.className = "farm-care-status";
        loading.textContent = "Loading notifications…";
        body.appendChild(loading);
        try {
            const data = await api().listNotifications("");
            const items = listFrom(data, ["notifications", "items"]);
            paintNotifications(body, items);
            const unreadItems = items.filter((item) => {
                if (item.read_at) {
                    return false;
                }
                if (Object.prototype.hasOwnProperty.call(item, "read_at")) {
                    return true;
                }
                return item.read === false || item.status === "unread";
            });
            await Promise.all(unreadItems.map((item) => api().readNotification(item.id).catch(() => null)));
            if (unreadItems.length) {
                setUnread(Math.max(0, unread - unreadItems.length));
                refreshUnread();
            }
        } catch (err) {
            clear(body);
            const message = document.createElement("p");
            message.className = "farm-care-status is-error";
            message.textContent = err.message || "Notifications could not be loaded.";
            body.appendChild(message);
        }
    }

    function paintNotifications(body, items) {
        clear(body);
        const groups = care.groupNotifications(items.map((item) => ({
            ...item,
            dueAt: item.due_at || item.dueAt || item.created_at || item.createdAt,
        })));
        [
            ["Today", groups.today],
            ["Upcoming", groups.upcoming],
            ["Earlier", groups.earlier],
        ].forEach((entry) => {
            if (!entry[1].length) {
                return;
            }
            const heading = document.createElement("h3");
            heading.textContent = entry[0];
            body.appendChild(heading);
            entry[1].forEach((item) => body.appendChild(notifyRow(item)));
        });
        if (!items.length) {
            const empty = document.createElement("p");
            empty.className = "farm-care-status";
            empty.textContent = "No notifications.";
            body.appendChild(empty);
        }
    }

    function notifyRow(item) {
        const row = document.createElement("article");
        row.className = "farm-notify-row";
        const title = document.createElement("strong");
        title.textContent = text(item.title_text || item.title);
        const body = document.createElement("p");
        body.textContent = text(item.body_text || item.body);
        const done = button("Done", "farm-care-link");
        const snooze = button("Snooze", "farm-care-link");
        done.addEventListener("click", () => notifyAction(row, "complete", item.id));
        snooze.addEventListener("click", () => notifyAction(row, "snooze", item.id, "tonight"));
        row.appendChild(title);
        row.appendChild(body);
        row.appendChild(done);
        row.appendChild(snooze);
        return row;
    }

    async function notifyAction(row, action, id, preset) {
        const previous = unread;
        setUnread(care.unreadAfter(unread, action));
        row.hidden = true;
        try {
            if (action === "complete") {
                await api().completeNotification(id);
            } else {
                await api().snoozeNotification(id, preset || "1h");
            }
            refreshUnread();
        } catch (err) {
            row.hidden = false;
            setUnread(previous);
        }
    }

    function syncRoute() {
        const hash = String(global.location.hash || "").replace("#", "");
        const match = hash.match(/^farm\/asset\/([^/?#]+)$/);
        if (match) {
            const id = decodeURIComponent(match[1]);
            const body = el("farmDetailBody");
            if (openAssetId === id && body && body.querySelector(".farm-detail-hero")) {
                showDetail(true);
                return;
            }
            openAsset(id);
            return;
        }
        if (openAssetId) {
            openAssetId = "";
            showDetail(false);
        }
        if (hash === "notifications") {
            openNotifications(true);
        }
    }

    function pendingSchedules() {
        const ui = global.AgriviaFarmUi;
        const snapshot = ui && ui.getSnapshot && ui.getSnapshot();
        return ((snapshot && snapshot.assets) || []).filter((asset) => {
            const summary = asset.careSummary || {};
            const status = summary.schedule_status || summary.scheduleStatus || "";
            return status === "processing" || status === "pending";
        });
    }

    async function refreshPendingSchedules() {
        const pending = pendingSchedules();
        if (!pending.length || !api() || !care.summaryFromView) {
            return;
        }
        await Promise.all(pending.map(async (asset) => {
            try {
                const view = await api().getCareView(asset.id, asset);
                const summary = care.summaryFromView(asset.careSummary, view || {});
                if (global.AgriviaFarmUi && global.AgriviaFarmUi.patchCareSummary) {
                    global.AgriviaFarmUi.patchCareSummary(asset.id, summary);
                }
                const status = summary.schedule_status || summary.scheduleStatus || "";
                if (openAssetId === asset.id && status !== "processing" && status !== "pending") {
                    openAsset(asset.id, { quiet: true });
                }
            } catch (err) {
                // Leave the card as it is and try on the next tick.
            }
        }));
    }

    function watchSchedules() {
        if (!pendingSchedules().length || !api()) {
            scheduleTries = 0;
            if (scheduleTimer) {
                global.clearInterval(scheduleTimer);
                scheduleTimer = 0;
            }
            return;
        }
        if (scheduleTimer) {
            return;
        }
        scheduleTries = 0;
        scheduleTimer = global.setInterval(() => {
            scheduleTries += 1;
            if (scheduleTries > 15 || !pendingSchedules().length) {
                global.clearInterval(scheduleTimer);
                scheduleTimer = 0;
                return;
            }
            refreshPendingSchedules();
        }, 4000);
    }

    function init() {
        const form = el("farmAnchorForm");
        if (form) {
            form.addEventListener("submit", submitAnchor);
        }
        const cancel = el("farmAnchorCancel");
        if (cancel) {
            cancel.addEventListener("click", () => {
                const dialog = el("farmAnchorDialog");
                if (dialog) {
                    dialog.close();
                }
            });
        }
        const back = el("farmDetailBack");
        if (back) {
            back.addEventListener("click", closeAsset);
        }
        const bell = el("farmBell");
        if (bell) {
            bell.addEventListener("click", () => {
                const panel = el("farmNotify");
                if (panel && !panel.hidden) {
                    closeNotify();
                    return;
                }
                openNotifications(false);
            });
        }
        const viewAll = el("farmNotifyAll");
        if (viewAll) {
            viewAll.addEventListener("click", () => {
                global.location.hash = "notifications";
            });
        }
        global.addEventListener("focus", refreshUnread);
        global.addEventListener("agrivia-auth-changed", startPoll);
        global.addEventListener("agrivia-farm-changed", () => {
            startPoll();
            renderToday();
            syncRoute();
            watchSchedules();
        });
        startPoll();
        renderToday();
    }

    document.addEventListener("DOMContentLoaded", init);

    global.AgriviaFarmCareUi = {
        appendCardCare: appendCardCare,
        refreshCardFacts: refreshCardFacts,
        renderToday: renderToday,
        openAsset: openAsset,
        openNotifications: openNotifications,
        syncRoute: syncRoute,
    };
}(window));
