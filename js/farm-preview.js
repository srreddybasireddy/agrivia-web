/**
 * Local Farm preview. Used only when AgriviaConfig.farmPreview is on and
 * nobody is signed in. Production (agrivia.ai) never sets that flag.
 */
(function (global) {
    const hensId = "preview-hens";
    const tomatoId = "preview-tomatoes";

    const state = {
        assets: [
            {
                id: hensId,
                kind: "Poultry & Eggs",
                title: "Backyard hens",
                status: "Active",
                count: null,
                careSummary: {
                    hasAnchor: false,
                    anchorPromptKey: "Set age",
                    stageLabel: "",
                    ageLabel: "",
                    nextTask: null,
                    nextMilestone: null,
                    remindersEnabledCount: 0,
                },
            },
            {
                id: tomatoId,
                kind: "Garden",
                title: "Tomato bed",
                status: "Growing",
                count: 4,
                careSummary: {
                    hasAnchor: true,
                    anchorPromptKey: "plant_date",
                    anchorDate: "2026-09-01",
                    stageLabel: "Grower",
                    ageLabel: "day 42",
                    nextTask: { task_type: "water", label: "Water · today 6 PM" },
                    milestones: [
                        { label: "Estimated first fruit (range)", estimated_from: "2026-10-20", estimated_to: "2026-11-08" },
                    ],
                    remindersEnabledCount: 0,
                },
            },
        ],
        reminders: {
            [hensId]: [],
            [tomatoId]: [
                { id: "preview-water", taskType: "Water", enabled: false, timeLocal: "18:00", frequency: "daily", channel: "in_app" },
            ],
        },
        tasks: [
            { id: "preview-task-water", reminderId: "preview-water", label: "Water · today 6 PM", dueAt: new Date().toISOString(), overdue: false },
        ],
        notifications: [
            { id: "preview-note-1", title: "Tomato bed", body: "Water is due today.", dueAt: new Date().toISOString(), read: false, status: "unread" },
        ],
    };

    function enabled() {
        const config = global.AgriviaConfig;
        const auth = global.AgriviaAuth;
        if (!config || !config.farmPreview) {
            return false;
        }
        return !(auth && auth.isSignedIn());
    }

    function portfolio() {
        return {
            profile: {
                userName: "Local grower",
                email: "",
                phoneNumber: "",
                zipCode: "85041",
                address: "Local preview",
                farmSizeAcres: 0,
            },
            assets: state.assets.map((asset) => Object.assign({}, asset)),
            careItems: [],
            pending: null,
            listErrors: false,
        };
    }

    function today() {
        return { tasks: state.tasks.slice() };
    }

    function careView(assetId) {
        const asset = state.assets.find((item) => item.id === assetId) || state.assets[0];
        const summary = asset.careSummary || {};
        return {
            asset: {
                id: asset.id,
                name: asset.title,
                category: asset.kind,
                quantity: asset.count,
                anchor_date: summary.hasAnchor ? new Date().toISOString() : "",
            },
            stages: summary.hasAnchor
                ? [
                    { label: "Seedling", start_day: 0, end_day: 20, is_current: false },
                    { label: summary.stageLabel || "Grower", start_day: 21, end_day: 50, is_current: true },
                    { label: "Harvest", start_day: 51, end_day: null, is_current: false },
                ]
                : [],
            current_stage: summary.hasAnchor ? { label: summary.stageLabel || "Grower", day: 42, start_day: 21, end_day: 50, summary: "Local preview stage note." } : null,
            milestones: summary.milestones || [],
            guidance: summary.hasAnchor ? [{ task_type: "water", label: "Water", interval_days: 1, guidance_text: summary.nextTask && summary.nextTask.label }] : [],
            sections: summary.hasAnchor
                ? [{ title: "Water", note: "Local preview climate note for ZIP 85041.", items: [{ label: "Water", body: summary.nextTask && summary.nextTask.label }] }]
                : [],
            reminders: (state.reminders[asset.id] || []).slice(),
            disclaimer: "Local preview. Guidance only — not a vet diagnosis or extension visit.",
        };
    }

    function reminders(assetId) {
        return { reminders: (state.reminders[assetId] || []).slice() };
    }

    function saveCarePlan(assetId, fields) {
        const asset = state.assets.find((item) => item.id === assetId);
        if (!asset) {
            return Promise.reject(new Error("That asset is not in the local preview."));
        }
        asset.careSummary.hasAnchor = true;
        asset.careSummary.stageLabel = asset.careSummary.stageLabel || "Started";
        asset.careSummary.ageLabel = fields && fields.ageWeeks ? `~${fields.ageWeeks} weeks` : "~just set";
        if (!asset.careSummary.nextTask) {
            asset.careSummary.nextTask = { type: "Check", label: "Check · today", dueAt: new Date().toISOString() };
        }
        return Promise.resolve({ ok: true });
    }

    function saveReminders(assetId, reminders) {
        state.reminders[assetId] = (reminders || []).map((row) => Object.assign({}, row));
        const asset = state.assets.find((item) => item.id === assetId);
        if (asset && asset.careSummary) {
            asset.careSummary.remindersEnabledCount = state.reminders[assetId].filter((row) => row.enabled).length;
        }
        return Promise.resolve({ ok: true });
    }

    function completeReminder(reminderId) {
        state.tasks = state.tasks.filter((task) => task.reminderId !== reminderId && task.id !== reminderId);
        return Promise.resolve({ ok: true });
    }

    function snoozeReminder(reminderId) {
        return completeReminder(reminderId);
    }

    function listNotifications() {
        return { notifications: state.notifications.slice() };
    }

    function unreadCount() {
        return { count: state.notifications.filter((item) => item.status === "unread" || item.read === false).length };
    }

    function readNotification(id) {
        state.notifications.forEach((item) => {
            if (item.id === id) {
                item.read = true;
                item.status = "read";
            }
        });
        return Promise.resolve({ ok: true });
    }

    function completeNotification(id) {
        state.notifications = state.notifications.filter((item) => item.id !== id);
        return Promise.resolve({ ok: true });
    }

    function snoozeNotification(id) {
        return completeNotification(id);
    }

    global.AgriviaFarmPreview = {
        enabled: enabled,
        portfolio: portfolio,
        today: today,
        careView: careView,
        reminders: reminders,
        saveCarePlan: saveCarePlan,
        saveReminders: saveReminders,
        completeReminder: completeReminder,
        snoozeReminder: snoozeReminder,
        listNotifications: listNotifications,
        unreadCount: unreadCount,
        readNotification: readNotification,
        completeNotification: completeNotification,
        snoozeNotification: snoozeNotification,
    };
}(window));
