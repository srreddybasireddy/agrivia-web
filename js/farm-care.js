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
        const type = text(raw.type);
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
        return { label: label, estimatedFrom: from, estimatedTo: to };
    }

    function normalizeSummary(raw) {
        if (!raw || typeof raw !== "object") {
            return null;
        }
        const count = Number(raw.reminders_enabled_count ?? raw.remindersEnabledCount);
        return {
            hasAnchor: Boolean(raw.has_anchor ?? raw.hasAnchor),
            anchorPromptKey: text(raw.anchor_prompt_key || raw.anchorPromptKey),
            stageLabel: text(raw.stage_label || raw.stageLabel),
            ageLabel: text(raw.age_label || raw.ageLabel),
            nextTask: taskOf(raw.next_task || raw.nextTask),
            nextMilestone: milestoneOf(raw.next_milestone || raw.nextMilestone),
            remindersEnabledCount: Number.isFinite(count) && count > 0 ? count : 0,
        };
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

    function ctaLabel(promptKey) {
        const value = text(promptKey);
        if (!value) {
            return "Set date";
        }
        if (value.indexOf(" ") !== -1 || value.indexOf("_") === -1) {
            return value;
        }
        return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
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

    function formatDay(value) {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return "";
        }
        return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
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

    function milestoneLine(milestone) {
        if (!milestone) {
            return "";
        }
        if (milestone.label) {
            return milestone.label;
        }
        const from = formatDay(milestone.estimatedFrom);
        const to = formatDay(milestone.estimatedTo);
        if (from && to && from !== to) {
            return `${from} – ${to}`;
        }
        return from || to;
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
        const value = Number(count);
        if (!Number.isFinite(value) || value <= 0) {
            return "Count not set";
        }
        return String(Math.round(value));
    }

    function reminderBody(reminders) {
        const rows = Array.isArray(reminders) ? reminders : [];
        return {
            reminders: rows.map((row) => ({
                id: row.id || "",
                task_type: row.taskType || row.task_type || "",
                enabled: Boolean(row.enabled),
                time_local: row.timeLocal || row.time_local || "",
                frequency: row.frequency || "",
                channel: row.channel === "push" ? "in_app" : (row.channel || "in_app"),
            })),
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

    return {
        normalizeSummary: normalizeSummary,
        cardModel: cardModel,
        quantityLabel: quantityLabel,
        reminderBody: reminderBody,
        unreadAfter: unreadAfter,
        groupNotifications: groupNotifications,
        formatWhen: formatWhen,
        isOverdue: isOverdue,
        taskLine: taskLine,
        subjectKeyOf: subjectKeyOf,
    };
}));
