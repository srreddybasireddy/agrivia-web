/**
 * Pure care-dashboard helpers. Labels for stages, tasks, and milestones
 * come from the API. This file only formats dates and generic actions.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    }
    root.AgriviaFarmCare = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
    function text(value) {
        return typeof value === "string" ? value.trim() : "";
    }

    function taskOf(raw) {
        if (!raw || typeof raw !== "object") {
            return null;
        }
        const type = text(raw.task_type || raw.taskType || raw.type);
        const label = text(raw.label);
        const dueAt = raw.due_at || raw.dueAt || "";
        if (!type && !label && !dueAt) {
            return null;
        }
        return { type: type, label: label, dueAt: dueAt };
    }

    function milestoneOf(raw) {
        if (!raw || typeof raw !== "object") {
            return null;
        }
        const label = text(raw.label);
        const from = raw.estimated_from || raw.estimatedFrom || "";
        const to = raw.estimated_to || raw.estimatedTo || "";
        if (!label && !from && !to) {
            return null;
        }
        return {
            key: text(raw.milestone_key || raw.milestoneKey || raw.key),
            label: label,
            shortLabel: text(raw.short_label || raw.shortLabel),
            estimatedFrom: from,
            estimatedTo: to,
        };
    }

    function normalizeSummary(raw) {
        if (!raw || typeof raw !== "object") {
            return null;
        }
        const count = Number(raw.reminders_enabled_count ?? raw.remindersEnabledCount);
        const milestones = raw.milestones || raw.next_milestone || raw.nextMilestone;
        return {
            hasAnchor: Boolean(raw.has_anchor ?? raw.hasAnchor),
            anchorPromptKey: text(raw.anchor_prompt_key || raw.anchorPromptKey),
            anchorDate: dateOnly(raw.anchor_date || raw.anchorDate),
            stageLabel: text(raw.stage_label || raw.stageLabel),
            ageLabel: text(raw.age_label || raw.ageLabel),
            nextTask: taskOf(raw.next_task || raw.nextTask),
            nextMilestone: milestoneOf(Array.isArray(milestones) ? milestones[0] : milestones),
            milestones: (Array.isArray(milestones) ? milestones : []).map(milestoneOf).filter(Boolean),
            quantity: positiveCount(raw.quantity != null ? raw.quantity : (raw.asset_count != null ? raw.asset_count : raw.count)),
            remindersEnabledCount: Number.isFinite(count) && count > 0 ? count : 0,
            scheduleStatus: text(raw.schedule_status || raw.scheduleStatus),
            scheduleStatusLabel: text(raw.schedule_status_label || raw.scheduleStatusLabel),
            scheduleError: text(raw.schedule_error || raw.scheduleError),
            confidence: text(raw.confidence).toLowerCase(),
            notes: text(raw.notes),
        };
    }

    function dateOnly(value) {
        const raw = text(value);
        const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
        return match ? match[1] : "";
    }

    function positiveCount(value) {
        const number = Number(value);
        if (!Number.isFinite(number) || number <= 0) {
            return null;
        }
        return Math.round(number);
    }

    function subjectKeyOf(title) {
        const raw = text(title).toLowerCase();
        if (!raw || raw === "grow" || raw === "crop" || raw === "garden") {
            return "";
        }
        const word = (raw.split(/\s+/)[0] || "").replace(/[^a-z0-9]/g, "");
        if (!word) {
            return "";
        }
        if (word.length > 4 && word.endsWith("es")) {
            return word.slice(0, -2);
        }
        if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) {
            return word.slice(0, -1);
        }
        return word;
    }

    function sentenceCase(value) {
        return text(value).split(/\s+/).filter(Boolean).map((word, index) => {
            const lower = word.toLowerCase();
            if (index === 0) {
                return lower.charAt(0).toUpperCase() + lower.slice(1);
            }
            return lower;
        }).join(" ");
    }

    function ctaLabel(promptKey, kind, status) {
        const key = text(promptKey).toLowerCase();
        const planning = text(status).toLowerCase() === "planning";
        if (kind === "Poultry & Eggs" || key === "hatch_date") {
            return "Set hatch date";
        }
        if (kind === "Cattle" || key === "acquired_age") {
            return "Set acquired date";
        }
        if (key === "plant_date" || key === "transplant_date" || key === "set_plant_date" || kind === "Garden" || kind === "Crops" || planning) {
            return "Set planting date";
        }
        const value = text(promptKey);
        if (!value) {
            return "Set date";
        }
        if (value.indexOf("_") !== -1) {
            return sentenceCase(value.replace(/_/g, " "));
        }
        return sentenceCase(value);
    }

    function formatWhen(value, now) {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return "";
        }
        const clock = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
        const day = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
        const today = (now || new Date()).toDateString() === date.toDateString();
        return today ? `today ${clock}` : `${day} ${clock}`;
    }

    function parseLocalDate(value) {
        const raw = text(value);
        if (!raw) {
            return null;
        }
        const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (match) {
            return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
        }
        const date = new Date(raw);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    function formatDate(value, options) {
        const date = value instanceof Date ? value : parseLocalDate(value);
        if (!date || Number.isNaN(date.getTime())) {
            return "";
        }
        const withYear = Boolean(options && options.year);
        return new Intl.DateTimeFormat("en-US", {
            month: "short",
            day: "numeric",
            year: withYear ? "numeric" : undefined,
        }).format(date);
    }

    function formatRange(from, to, options) {
        const start = parseLocalDate(from);
        const end = parseLocalDate(to);
        const withYear = Boolean(options && options.year);
        if (!start && !end) {
            return "";
        }
        if (start && end && start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
            if (rangeNeedsYear(start, end, withYear)) {
                return `${formatDate(start, { year: true })} – ${formatDate(end, { year: true })}`;
            }
            const month = new Intl.DateTimeFormat("en-US", { month: "short" }).format(start);
            return `${month} ${start.getDate()} – ${end.getDate()}`;
        }
        const showYear = rangeNeedsYear(start, end, withYear);
        const left = formatDate(start || end, { year: showYear });
        const right = formatDate(end || start, { year: showYear });
        if (!end || !start) {
            return formatDate(start || end, { year: withYear });
        }
        return `${left} – ${right}`;
    }

    function rangeNeedsYear(start, end, force) {
        if (force) {
            return true;
        }
        if (!start || !end) {
            return false;
        }
        const year = new Date().getFullYear();
        return start.getFullYear() !== end.getFullYear()
            || start.getFullYear() !== year
            || end.getFullYear() !== year;
    }

    function formatDay(value) {
        return formatDate(value, { year: false });
    }

    function taskLine(task, now) {
        if (!task) {
            return "";
        }
        if (task.label) {
            return task.label;
        }
        const when = formatWhen(task.dueAt, now);
        if (task.type && when) {
            return `${task.type} · ${when}`;
        }
        return task.type || when;
    }

    const MILESTONE_LABELS = {
        first_flower: "First flower",
        first_fruit: "First fruit",
        first_harvest: "First harvest",
        first_egg: "First egg",
    };

    function isWeakShortLabel(value) {
        const raw = text(value);
        if (!raw) {
            return true;
        }
        if (/^[A-Z]{1,3}$/.test(raw)) {
            return true;
        }
        return raw.length <= 3 && !/\s/.test(raw);
    }

    function shortMilestoneLabel(raw) {
        const key = text(raw && (raw.key || raw.milestone_key || raw.milestoneKey)).toLowerCase();
        if (MILESTONE_LABELS[key]) {
            return MILESTONE_LABELS[key];
        }
        const source = text(raw && raw.label).replace(/^Estimated\s+/i, "").replace(/\s*\(range[^)]*\)\s*$/i, "").trim();
        const lower = source.toLowerCase();
        if (/\bfruit\b/.test(lower)) {
            return MILESTONE_LABELS.first_fruit;
        }
        if (/\bharvest\b/.test(lower)) {
            return MILESTONE_LABELS.first_harvest;
        }
        if (/\begg\b/.test(lower)) {
            return MILESTONE_LABELS.first_egg;
        }
        if (/\bflower/.test(lower)) {
            return MILESTONE_LABELS.first_flower;
        }
        const explicit = text(raw && (raw.short_label || raw.shortLabel));
        if (explicit && !isWeakShortLabel(explicit)) {
            return explicit.charAt(0).toUpperCase() + explicit.slice(1);
        }
        if (!source || isWeakShortLabel(source)) {
            return "";
        }
        return source.charAt(0).toUpperCase() + source.slice(1);
    }

    const HARVEST_KEYS = ["first_harvest", "first_fruit", "first_egg"];

    function isHarvestMilestone(item) {
        if (!item) {
            return false;
        }
        const key = text(item.key || item.milestone_key || item.milestoneKey).toLowerCase();
        if (HARVEST_KEYS.indexOf(key) !== -1 || key === "harvest" || /_harvest$/.test(key)) {
            return true;
        }
        const label = text(item.shortLabel || item.short_label || item.label).toLowerCase();
        return /\bharvest\b/.test(label) || /\bfruit\b/.test(label);
    }

    function harvestMilestone(milestones, kind) {
        const rows = Array.isArray(milestones) ? milestones : [];
        // Layers are for eggs; a meat "harvest" window should not win on poultry cards.
        const prefer = kind === "Poultry & Eggs"
            ? ["first_egg", "first_harvest", "first_fruit"]
            : HARVEST_KEYS;
        let index = 0;
        for (index = 0; index < prefer.length; index += 1) {
            const key = prefer[index];
            const found = rows.find((item) => text(item && (item.key || item.milestone_key || item.milestoneKey)).toLowerCase() === key);
            if (found) {
                return found;
            }
        }
        return rows.find(isHarvestMilestone) || null;
    }

    /** Card row label for the primary outcome milestone (crop harvest vs poultry eggs). */
    function outcomeRowLabel(milestone) {
        const key = text(milestone && (milestone.key || milestone.milestone_key || milestone.milestoneKey)).toLowerCase();
        if (key === "first_egg") {
            return "First egg";
        }
        if (key === "first_fruit") {
            return "First fruit";
        }
        if (key === "first_harvest" || key === "harvest" || /_harvest$/.test(key)) {
            return "Harvest";
        }
        const short = shortMilestoneLabel(milestone);
        if (short) {
            return short;
        }
        return "Harvest";
    }

    function harvestLine(summary) {
        const normalized = normalizeSummary(summary);
        if (!normalized) {
            return "";
        }
        const status = normalized.scheduleStatus;
        if (status === "processing" || status === "pending" || status === "failed") {
            return "";
        }
        const match = harvestMilestone(normalized.milestones);
        if (!match) {
            return "";
        }
        return formatRange(match.estimatedFrom || match.from, match.estimatedTo || match.to);
    }

    function timeOfDayValue(value, fallback) {
        const raw = text(value);
        const match = raw.match(/^(\d{1,2}):(\d{2})/);
        if (!match) {
            return text(fallback) || "08:00";
        }
        const hour = Math.min(23, Math.max(0, Number(match[1])));
        const minute = Math.min(59, Math.max(0, Number(match[2])));
        return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    }

    function milestoneLine(milestone) {
        if (!milestone) {
            return "";
        }
        const range = formatRange(milestone.estimatedFrom, milestone.estimatedTo);
        if (range) {
            return range;
        }
        return shortMilestoneLabel(milestone) || text(milestone.label);
    }

    function cardModel(summary, now) {
        const normalized = summary && summary.hasAnchor !== undefined && summary.stageLabel !== undefined
            ? summary
            : normalizeSummary(summary);
        if (!normalized || !normalized.hasAnchor) {
            return {
                mode: "cta",
                prompt: ctaLabel(normalized && normalized.anchorPromptKey),
            };
        }
        const stage = [normalized.stageLabel, normalized.ageLabel].filter(Boolean).join(" · ");
        return {
            mode: "rows",
            stage: stage,
            task: taskLine(normalized.nextTask, now),
            taskType: normalized.nextTask ? normalized.nextTask.type : "",
            milestone: milestoneLine(normalized.nextMilestone),
            reminderCount: normalized.remindersEnabledCount,
        };
    }

    function quantityLabel(count) {
        const value = positiveCount(count);
        return value == null ? "" : String(value);
    }

    function reminderBody(reminders) {
        const rows = Array.isArray(reminders) ? reminders : [];
        return {
            reminders: rows.map((row) => {
                const interval = Number(row.intervalDays != null ? row.intervalDays : row.interval_days);
                const item = {
                    task_type: row.taskType || row.task_type || "",
                    enabled: Boolean(row.enabled),
                    time_of_day: text(row.timeOfDay || row.time_of_day || row.timeLocal || row.time_local) || "07:00",
                    interval_days: Number.isFinite(interval) && interval > 0 ? interval : 1,
                    channel: "in_app",
                };
                if (row.id) {
                    item.id = row.id;
                }
                return item;
            }),
        };
    }

    function unreadAfter(count, action) {
        const current = Number(count) || 0;
        if (action === "complete" || action === "read" || action === "snooze") {
            return Math.max(0, current - 1);
        }
        return current;
    }

    function startOfDay(date) {
        return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    }

    function groupNotifications(items, now) {
        const clock = now || new Date();
        const todayStart = startOfDay(clock);
        const tomorrowStart = todayStart + 24 * 60 * 60 * 1000;
        const groups = { today: [], upcoming: [], earlier: [] };
        (Array.isArray(items) ? items : []).forEach((item) => {
            const due = new Date(item.dueAt || item.due_at || item.createdAt || item.created_at || "");
            const time = due.getTime();
            if (Number.isNaN(time) || time < todayStart) {
                groups.earlier.push(item);
            } else if (time < tomorrowStart) {
                groups.today.push(item);
            } else {
                groups.upcoming.push(item);
            }
        });
        return groups;
    }

    function isOverdue(task, now) {
        if (!task) {
            return false;
        }
        if (task.overdue === true) {
            return true;
        }
        const due = new Date(task.dueAt || task.due_at || "");
        return !Number.isNaN(due.getTime()) && due.getTime() < (now || new Date()).getTime();
    }

    const KIND_LABELS = {
        Crops: "Crops",
        Cattle: "Livestock",
        Garden: "Garden",
        "Poultry & Eggs": "Poultry",
        "Birds & Bees": "Birds / bees",
        "Fish & Shrimp": "Fish",
    };

    const COUNT_LABELS = {
        Garden: "Plants",
        Crops: "Acres",
        "Poultry & Eggs": "Birds",
        Cattle: "Head",
        "Birds & Bees": "Hives",
        "Fish & Shrimp": "Fish",
    };

    const TASK_LABELS = {
        water: "Water",
        feed: "Feed",
        fertilize: "Fertilize",
        pest_check: "Pest check",
        health_check: "Health check",
        vaccine_check: "Vaccine/health reminder",
        harvest_check: "Harvest check",
    };

    const TASK_TIMES = {
        water: "07:00",
        feed: "08:00",
        fertilize: "08:00",
        pest_check: "08:00",
        health_check: "09:00",
        vaccine_check: "09:00",
        harvest_check: "08:00",
    };

    function displayName(value) {
        const raw = text(value);
        if (!raw) {
            return "";
        }
        const letters = raw.replace(/[^A-Za-z]/g, "");
        if (!letters) {
            return raw;
        }
        const allLower = letters === letters.toLowerCase();
        const allUpper = letters === letters.toUpperCase();
        if (!allLower && !allUpper) {
            return raw;
        }
        return raw.toLowerCase().replace(/(^|[^a-z])([a-z])/g, (match, lead, letter) => lead + letter.toUpperCase());
    }

    function kindLabelOf(kind) {
        return KIND_LABELS[kind] || kind || "";
    }

    function countLabelOf(kind) {
        return COUNT_LABELS[kind] || "Count";
    }

    function taskLabel(type) {
        const key = text(type).toLowerCase();
        return TASK_LABELS[key] || sentenceCase(key.replace(/_/g, " "));
    }

    function intervalText(days) {
        const value = Number(days);
        if (!Number.isFinite(value) || value <= 0) {
            return "";
        }
        if (value === 1) {
            return "Every day";
        }
        if (value === 7) {
            return "Weekly";
        }
        return `Every ${value} days`;
    }

    function varietyOf(asset, name) {
        const raw = text(asset.variety || asset.subtitle);
        if (!raw) {
            return null;
        }
        if (/^\d+$/.test(raw) || /^standard/i.test(raw)) {
            return null;
        }
        if (name && raw.toLowerCase() === name.toLowerCase()) {
            return null;
        }
        if (text(asset.title) && raw.toLowerCase() === text(asset.title).toLowerCase()) {
            return null;
        }
        if (raw.length > 48 || /[.!?]/.test(raw)) {
            return null;
        }
        return raw;
    }

    function anchorMeta(asset, summary, careView) {
        const promptKey = text((careView && (careView.anchor_prompt_key || careView.anchorPromptKey)) || summary.anchorPromptKey);
        const date = dateOnly((careView && (careView.anchor_date || careView.anchorDate)) || summary.anchorDate || asset.plantedDate);
        let label = "Planted";
        const key = promptKey.toLowerCase();
        if (asset.kind === "Poultry & Eggs" || key === "hatch_date") {
            label = "Hatched";
        } else if (asset.kind === "Cattle" || key === "acquired_age") {
            label = "Acquired";
        } else if (text(asset.status).toLowerCase() === "planning") {
            label = "Planned planting";
        }
        return { date: date || null, label: label, promptKey: promptKey };
    }

    function stageOf(summary, careView) {
        const current = careView && (careView.current_stage || careView.currentStage);
        const next = careView && (careView.next_stage || careView.nextStage);
        const stages = careView && Array.isArray(careView.stages) ? careView.stages : [];
        const label = text(current && current.label) || summary.stageLabel;
        if (!label && !stages.length) {
            return null;
        }
        const ageMatch = summary.ageLabel && summary.ageLabel.match(/(\d+)/);
        const day = current && current.day != null ? Number(current.day) : (ageMatch ? Number(ageMatch[1]) : null);
        const index = Math.max(0, stages.findIndex((stage) => stage.is_current || stage.isCurrent));
        return {
            label: label,
            day: Number.isFinite(day) ? day : null,
            startDay: current && current.start_day != null ? Number(current.start_day) : null,
            endDay: current && current.end_day != null ? Number(current.end_day) : null,
            index: stages.length ? index : 0,
            total: stages.length,
            summary: text(current && current.summary),
            nextLabel: text(next && next.label),
            nextStartsDay: next && next.start_day != null ? Number(next.start_day) : null,
            stages: stages,
        };
    }

    function milestonesOf(summary, careView) {
        const source = (careView && careView.milestones) || summary.milestones || [];
        return source.map((item) => ({
            key: text(item.key || item.milestone_key),
            label: shortMilestoneLabel(item),
            from: dateOnly(item.estimated_from || item.estimatedFrom),
            to: dateOnly(item.estimated_to || item.estimatedTo),
        })).filter((item) => item.label || item.from || item.to);
    }

    function nextTaskOf(summary, careView) {
        const guidance = careView && Array.isArray(careView.guidance) ? careView.guidance : [];
        const first = guidance.find((item) => item && item.optional !== true) || guidance[0];
        const task = summary.nextTask;
        const type = text((task && task.type) || (first && (first.task_type || first.taskType)));
        const label = text((task && task.label) || (first && (first.guidance_text || first.guidanceText || first.label)));
        if (!type && !label) {
            return null;
        }
        const interval = Number((first && (first.interval_days || first.intervalDays)) || (task && task.intervalDays));
        return {
            type: type,
            label: label,
            intervalDays: Number.isFinite(interval) ? interval : null,
        };
    }

    function suggestedReminders(model, careView) {
        const saved = new Set(((model && model.reminders && model.reminders.rows) || []).map((row) => text(row.task_type || row.taskType).toLowerCase()));
        const fromApi = careView && Array.isArray(careView.suggested_reminders) ? careView.suggested_reminders : [];
        const guidance = careView && Array.isArray(careView.guidance) ? careView.guidance : [];
        let source = fromApi;
        if (!source.length) {
            const seen = new Set();
            source = [];
            guidance.forEach((item) => {
                const type = text(item.task_type || item.taskType).toLowerCase();
                if (!type || seen.has(type)) {
                    return;
                }
                seen.add(type);
                source.push(item);
            });
        }
        if (!source.length) {
            return [];
        }
        return source.map((item) => {
            const type = text(item.task_type || item.taskType).toLowerCase();
            return {
                task_type: type,
                label: text(item.label) || taskLabel(type),
                interval_days: Number(item.interval_days || item.intervalDays) || 1,
                time_of_day: text(item.time_of_day || item.timeOfDay) || TASK_TIMES[type] || "08:00",
            };
        }).filter((item) => item.task_type && !saved.has(item.task_type));
    }

    function hintFor() {
        return "Add a date to see estimates";
    }

    function summaryFromView(previous, view) {
        const prior = previous && typeof previous === "object" ? previous : {};
        const source = view && typeof view === "object" ? view : {};
        if (source.has_plan === false && !source.milestones && !source.schedule_status && !source.scheduleStatus) {
            return prior;
        }
        const status = text(source.schedule_status || source.scheduleStatus);
        const waiting = status === "processing" || status === "pending" || status === "failed";
        const stage = source.current_stage || source.currentStage;
        const guidance = Array.isArray(source.guidance) ? source.guidance : [];
        const next = guidance.find((item) => item && item.optional !== true && item.is_optional !== true) || guidance[0];
        return Object.assign({}, prior, {
            has_anchor: Boolean(source.has_anchor ?? source.hasAnchor ?? prior.has_anchor ?? prior.hasAnchor),
            anchor_date: source.anchor_date || source.anchorDate || prior.anchor_date || prior.anchorDate || "",
            anchor_prompt_key: source.anchor_prompt_key || source.anchorPromptKey || prior.anchor_prompt_key || prior.anchorPromptKey || "",
            stage_label: waiting ? "" : text(stage && stage.label),
            age_label: waiting ? "" : text(source.age_label || source.ageLabel),
            next_task: !waiting && next ? {
                task_type: next.task_type || next.taskType || next.type || "",
                label: next.guidance_text || next.guidanceText || next.label || "",
            } : null,
            milestones: waiting ? [] : (source.milestones || []),
            schedule_status: status,
            schedule_status_label: text(source.schedule_status_label || source.scheduleStatusLabel),
            schedule_error: text(source.schedule_error || source.scheduleError),
            confidence: text(source.confidence),
            notes: text(source.notes),
            subject_key: text(source.subject_key || source.subjectKey) || prior.subject_key || prior.subjectKey || "",
        });
    }

    function normalizeAsset(listAsset, careView) {
        const asset = listAsset || {};
        const summary = normalizeSummary(asset.careSummary) || {
            hasAnchor: false,
            anchorPromptKey: "",
            anchorDate: "",
            stageLabel: "",
            ageLabel: "",
            nextTask: null,
            milestones: [],
            quantity: null,
            remindersEnabledCount: 0,
        };
        const view = careView && typeof careView === "object" ? careView : null;
        const hasPlan = Boolean(view && view.has_plan !== false && (view.anchor_date || view.current_stage || view.guidance || view.display_name || summary.hasAnchor));
        const name = displayName(asset.title) || displayName(view && (view.asset_title || view.assetTitle)) || displayName(view && view.display_name) || kindLabelOf(asset.kind);
        const anchor = anchorMeta(asset, summary, view);
        if (anchor.date) {
            summary.hasAnchor = true;
        }
        const saved = [];
        const reminderSource = (view && view.reminders) || [];
        reminderSource.forEach((row) => saved.push(row));
        const model = {
            id: asset.id || "",
            kind: asset.kind || "",
            kindLabel: kindLabelOf(asset.kind),
            name: name,
            rawName: text(asset.title),
            status: text(asset.status),
            variety: varietyOf(asset, name),
            count: asset.kind === "Crops"
                ? null
                : (positiveCount(asset.count != null ? asset.count : (view && (view.asset_count != null ? view.asset_count : view.quantity))) || summary.quantity),
            acres: asset.kind === "Crops" && Number(asset.acres) > 0 ? Number(asset.acres) : null,
            countLabel: countLabelOf(asset.kind),
            anchor: anchor,
            stage: summary.hasAnchor || (view && view.current_stage) ? stageOf(summary, view) : stageOf(summary, view),
            nextTask: nextTaskOf(summary, view),
            milestones: (summary.hasAnchor || (view && view.milestones)) ? milestonesOf(summary, view) : [],
            reminders: {
                enabledCount: summary.remindersEnabledCount,
                rows: saved,
                suggested: [],
            },
            hasPlan: hasPlan || summary.hasAnchor,
            subjectKey: text(view && (view.subject_key || view.subjectKey)) || subjectKeyOf(asset.title),
            imageUrl: text(asset.imageUrl),
            guidance: view && Array.isArray(view.guidance) ? view.guidance : [],
            disclaimer: text(view && view.disclaimer),
            climate: text(view && (view.climate_band || view.climateBand)),
            zip: text(view && (view.zip_code || view.zipCode)),
            displayName: text(view && view.display_name),
            schedule: {
                status: text((view && (view.schedule_status || view.scheduleStatus)) || summary.scheduleStatus),
                label: text((view && (view.schedule_status_label || view.scheduleStatusLabel)) || summary.scheduleStatusLabel),
                error: text((view && (view.schedule_error || view.scheduleError)) || summary.scheduleError),
                confidence: text((view && view.confidence) || summary.confidence).toLowerCase(),
                notes: text((view && view.notes) || summary.notes),
            },
        };
        if (model.schedule.status === "processing" || model.schedule.status === "pending" || model.schedule.status === "failed") {
            model.stage = null;
            model.nextTask = null;
            model.milestones = [];
        }
        if (!model.anchor.date) {
            model.milestones = [];
            model.stage = null;
            model.nextTask = null;
        }
        model.reminders.suggested = suggestedReminders(model, view);
        return model;
    }

    function factRows(model, scope) {
        const rows = [];
        if (!model) {
            return rows;
        }
        if (model.kind === "Crops") {
            if (model.acres != null) {
                const acres = model.acres % 1 === 0 ? String(model.acres) : String(Number(model.acres.toFixed(1)));
                rows.push({ label: "Acres", value: acres, kind: "value" });
            } else {
                rows.push({ label: "Acres", value: "+ Add acres", kind: "add" });
            }
        } else if (model.count != null) {
            rows.push({ label: model.countLabel, value: String(model.count), kind: "value" });
        } else {
            const noun = model.countLabel === "Plants" ? "plant count" : model.countLabel.toLowerCase();
            rows.push({ label: model.countLabel, value: `+ Add ${noun}`, kind: "add" });
        }
        if (model.anchor && model.anchor.date) {
            rows.push({
                label: model.anchor.label,
                value: formatDate(model.anchor.date, { year: true }),
                kind: "value",
            });
        } else {
            rows.push({
                label: model.anchor ? model.anchor.label : "Date",
                value: ctaLabel(model.anchor && model.anchor.promptKey, model.kind, model.status),
                kind: "cta",
            });
        }
        if (scope === "detail") {
            const age = model.stage && model.stage.day != null ? `${model.stage.day} days` : "";
            if (age) {
                rows.push({ label: "Age", value: age, kind: "value" });
            }
        }
        const waiting = model.schedule && (model.schedule.status === "processing" || model.schedule.status === "pending" || model.schedule.status === "failed");
        if (waiting) {
            rows.push({
                label: "Stage",
                value: model.schedule.label || (model.schedule.status === "failed" ? "Could not load care timing" : "Calculating care timing…"),
                kind: "status",
            });
        } else if (model.stage && model.stage.label) {
            const bits = [model.stage.label];
            if (model.stage.day != null) {
                bits.push(`day ${model.stage.day}`);
            }
            rows.push({
                label: "Stage",
                value: bits.join(" · "),
                kind: "stage",
                index: model.stage.index,
                total: model.stage.total,
            });
        }
        if (!waiting && scope !== "detail" && model.nextTask && model.nextTask.label) {
            rows.push({ label: "Next", value: model.nextTask.label, kind: "value" });
        }
        if (!waiting && scope !== "detail") {
            const outcome = harvestMilestone(model.milestones, model.kind);
            if (outcome) {
                const outcomeRange = formatRange(outcome.from || outcome.estimatedFrom, outcome.to || outcome.estimatedTo);
                if (outcomeRange) {
                    rows.push({ label: outcomeRowLabel(outcome), value: outcomeRange, kind: "value" });
                }
            }
            model.milestones.filter((item) => item !== outcome).slice(0, 2).forEach((item) => {
                const range = formatRange(item.from, item.to);
                if (item.label && range) {
                    rows.push({ label: item.label, value: range, kind: "value" });
                }
            });
            if (!model.anchor.date) {
                rows.push({ label: "Estimates", value: hintFor(model.kind), kind: "hint" });
            }
        }
        if (scope !== "detail") {
            const on = model.reminders.enabledCount > 0;
            rows.push({
                label: "Reminders",
                value: on ? `On (${model.reminders.enabledCount})` : "Off",
                action: on ? "" : "Turn on",
                kind: "reminders",
            });
        }
        return rows;
    }

    function illustrationFor(asset) {
        const name = text(asset && (asset.rawName || asset.title)).toLowerCase();
        const peppers = {
            chilli: true, chillies: true, chili: true, chilies: true, chile: true,
            "hot pepper": true, "hot peppers": true,
        };
        const current = text(asset && asset.imageUrl);
        if (peppers[name] && (!current || current.indexOf("farm-deco-garden") !== -1)) {
            return "assets/images/farm-deco-pepper.png";
        }
        return current;
    }

    return {
        normalizeSummary: normalizeSummary,
        normalizeAsset: normalizeAsset,
        cardModel: cardModel,
        quantityLabel: quantityLabel,
        reminderBody: reminderBody,
        unreadAfter: unreadAfter,
        groupNotifications: groupNotifications,
        formatWhen: formatWhen,
        formatDate: formatDate,
        formatRange: formatRange,
        harvestLine: harvestLine,
        harvestMilestone: harvestMilestone,
        outcomeRowLabel: outcomeRowLabel,
        timeOfDayValue: timeOfDayValue,
        parseLocalDate: parseLocalDate,
        isOverdue: isOverdue,
        taskLine: taskLine,
        subjectKeyOf: subjectKeyOf,
        displayName: displayName,
        factRows: factRows,
        summaryFromView: summaryFromView,
        suggestedReminders: suggestedReminders,
        intervalText: intervalText,
        shortMilestoneLabel: shortMilestoneLabel,
        illustrationFor: illustrationFor,
        ctaLabel: ctaLabel,
    };
}));
