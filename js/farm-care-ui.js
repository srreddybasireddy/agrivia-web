/**
 * Care dashboard on the Farm view: today list, asset care page, and the header bell.
 * Stage names, task copy, and milestone text are rendered from the API.
 */
(function (global) {
    const care = global.AgriviaFarmCare;
    let unread = 0;
    let pollTimer = 0;
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
        copy.textContent = text(task.label || task.title) || care.taskLine({
            type: task.type,
            label: "",
            dueAt: task.due_at || task.dueAt,
        });
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

    function appendCardCare(copy, asset) {
        const model = care.cardModel(asset.careSummary);
        const block = document.createElement("div");
        block.className = "farm-care-rows";
        const count = document.createElement("p");
        count.className = "farm-asset-meta";
        count.textContent = care.quantityLabel(asset.count);
        block.appendChild(count);
        if (model.mode === "cta") {
            const cta = button(model.prompt, "btn btn-outline btn-sm farm-care-cta");
            cta.addEventListener("click", (event) => {
                event.stopPropagation();
                openAnchor(asset);
            });
            block.appendChild(cta);
        } else {
            if (model.stage) {
                block.appendChild(line(model.stage, "farm-care-stage"));
            }
            if (model.task) {
                block.appendChild(line(model.task, "farm-care-task"));
            }
            if (model.milestone) {
                block.appendChild(line(model.milestone, "farm-care-milestone"));
            }
            const bell = document.createElement("p");
            bell.className = model.reminderCount ? "farm-care-bell" : "farm-care-bell is-muted";
            bell.textContent = model.reminderCount ? `Reminders ${model.reminderCount}` : "Reminders off";
            block.appendChild(bell);
        }
        const open = button("Care plan", "farm-care-link");
        open.addEventListener("click", (event) => {
            event.stopPropagation();
            global.location.hash = `farm/asset/${encodeURIComponent(asset.id)}`;
        });
        block.appendChild(open);
        copy.appendChild(block);
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

    async function openAsset(id) {
        openAssetId = id || "";
        const body = el("farmDetailBody");
        showDetail(true);
        if (!body) {
            return;
        }
        clear(body);
        const status = document.createElement("p");
        status.className = "farm-care-status";
        status.textContent = "Loading care plan…";
        body.appendChild(status);
        if (!signedIn()) {
            status.textContent = "Sign in to see this care plan.";
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

    function closeAsset() {
        openAssetId = "";
        showDetail(false);
        if (global.location.hash.indexOf("farm/asset/") === 0) {
            global.location.hash = "farm";
        }
        renderToday();
    }

    function assetById(id) {
        const ui = global.AgriviaFarmUi;
        const snapshot = ui && ui.getSnapshot && ui.getSnapshot();
        const assets = (snapshot && snapshot.assets) || [];
        return assets.find((item) => item.id === id) || { id: id };
    }

    function paintDetail(body, asset, view, reminderPayload) {
        clear(body);
        const shown = view.asset || view;
        const header = document.createElement("header");
        header.className = "farm-detail-head";
        const title = document.createElement("h2");
        title.textContent = text(shown.name || shown.title) || "Asset";
        header.appendChild(title);
        const meta = document.createElement("p");
        const bits = [text(shown.category), care.quantityLabel(shown.quantity != null ? shown.quantity : shown.count)];
        const anchor = shown.anchor_date || shown.anchorDate;
        if (anchor) {
            bits.push(new Date(anchor).toLocaleDateString());
        }
        meta.textContent = bits.filter(Boolean).join(" · ");
        header.appendChild(meta);
        body.appendChild(header);

        const stages = listFrom(view, ["stages"]);
        if (stages.length) {
            const stepper = document.createElement("ol");
            stepper.className = "farm-stage-stepper";
            stages.forEach((stage) => {
                const item = document.createElement("li");
                item.textContent = text(stage.label || stage.stage_label);
                if (stage.current || stage.is_current) {
                    item.className = "is-current";
                }
                stepper.appendChild(item);
            });
            body.appendChild(stepper);
        }

        const milestones = listFrom(view, ["milestones"]);
        if (milestones.length) {
            const list = document.createElement("ul");
            list.className = "farm-milestone-list";
            milestones.forEach((item) => {
                const row = document.createElement("li");
                row.textContent = care.cardModel({
                    has_anchor: true,
                    next_milestone: item,
                }).milestone || text(item.label);
                list.appendChild(row);
            });
            body.appendChild(list);
        }

        listFrom(view, ["sections", "care_cards", "cards"]).forEach((section) => {
            const card = document.createElement("section");
            card.className = "paper-card farm-care-card";
            const heading = document.createElement("h3");
            heading.textContent = text(section.title || section.label);
            card.appendChild(heading);
            const note = text(section.note || section.climate_note || section.climateNote);
            if (note) {
                const copy = document.createElement("p");
                copy.textContent = note;
                card.appendChild(copy);
            }
            listFrom(section, ["items"]).forEach((item) => {
                const row = document.createElement("p");
                row.textContent = [text(item.label), text(item.body || item.detail)].filter(Boolean).join(" — ");
                card.appendChild(row);
            });
            body.appendChild(card);
        });

        body.appendChild(reminderEditor(asset, listFrom(reminderPayload, ["reminders"]).concat(listFrom(view, ["reminders"]))));

        const disclaimer = document.createElement("p");
        disclaimer.className = "farm-care-status";
        disclaimer.textContent = text(view.disclaimer) || "Guidance only — not a vet diagnosis or extension visit.";
        body.appendChild(disclaimer);

        const ask = button("Ask Advisor about this", "btn btn-primary");
        ask.addEventListener("click", () => {
            const name = text(shown.name || shown.title);
            global.dispatchEvent(new CustomEvent("agrivia-chat-ask", {
                detail: { query: name ? `About ${name}` : "" },
            }));
            if (typeof global.navigateTo === "function") {
                global.navigateTo("ai-advisor");
            }
        });
        body.appendChild(ask);
    }

    function reminderEditor(asset, rows) {
        const assetId = asset && asset.id;
        const seen = new Set();
        const unique = [];
        rows.forEach((row) => {
            const key = row.id || row.task_type || row.taskType;
            if (!key || seen.has(key)) {
                return;
            }
            seen.add(key);
            unique.push(row);
        });
        const form = document.createElement("form");
        form.className = "paper-card farm-care-card";
        const heading = document.createElement("h3");
        heading.textContent = "Reminders";
        form.appendChild(heading);
        if (!unique.length) {
            const empty = document.createElement("p");
            empty.className = "farm-care-status";
            empty.textContent = "No reminder types yet.";
            form.appendChild(empty);
            return form;
        }
        const state = unique.map((row) => ({
            id: row.id || "",
            taskType: row.task_type || row.taskType || "",
            enabled: Boolean(row.enabled),
            timeLocal: row.time_local || row.timeLocal || "18:00",
            frequency: row.frequency || "daily",
            channel: "in_app",
        }));
        state.forEach((row, index) => {
            const line = document.createElement("label");
            line.className = "farm-reminder-row";
            const toggle = document.createElement("input");
            toggle.type = "checkbox";
            toggle.checked = row.enabled;
            toggle.addEventListener("change", () => {
                state[index].enabled = toggle.checked;
            });
            const name = document.createElement("span");
            name.textContent = row.taskType || "Task";
            const time = document.createElement("input");
            time.type = "time";
            time.value = row.timeLocal.slice(0, 5);
            time.addEventListener("change", () => {
                state[index].timeLocal = time.value;
            });
            line.appendChild(toggle);
            line.appendChild(name);
            line.appendChild(time);
            form.appendChild(line);
        });
        const save = button("Save", "btn btn-primary btn-sm");
        const status = document.createElement("p");
        status.className = "farm-care-status";
        save.addEventListener("click", async (event) => {
            event.preventDefault();
            save.disabled = true;
            try {
                await api().saveReminders(assetId, state, asset);
                status.textContent = "Saved.";
                if (global.AgriviaFarmUi) {
                    global.AgriviaFarmUi.refresh();
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
            const unreadItems = items.filter((item) => item.read === false || item.status === "unread");
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
        title.textContent = text(item.title);
        const body = document.createElement("p");
        body.textContent = text(item.body);
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
            openAsset(decodeURIComponent(match[1]));
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
        });
        startPoll();
        renderToday();
    }

    document.addEventListener("DOMContentLoaded", init);

    global.AgriviaFarmCareUi = {
        appendCardCare: appendCardCare,
        renderToday: renderToday,
        openAsset: openAsset,
        openNotifications: openNotifications,
        syncRoute: syncRoute,
    };
}(window));
