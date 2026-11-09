/**
 * Local Farm preview. Used only when AgriviaConfig.farmPreview is on and
 * nobody is signed in. Production (agrivia.ai) never sets that flag.
 */
(function (global) {
    const hensId = "preview-hens";
    const tomatoId = "preview-tomatoes";
    const lambId = "preview-lamb";

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
            {
                id: lambId,
                kind: "Cattle",
                title: "Lamb · Sheep",
                status: "Healthy",
                count: 6,
                livestockCard: {
                    label: "LIVESTOCK",
                    title: "Lamb · Sheep",
                    herd_line: "6 head · 4 ewes, 1 ram, 1 lamb",
                    purpose_breed_line: "Meat · Dorper",
                    stage_label: "Ewes bred Oct 8 · lambing Feb 27 – Mar 9, 2027",
                    ready_line: "Market lambs Apr 24–Jun 23, 2027",
                    next_task: { task: "CDT ewes (pre-lambing)", due_date: "2027-01-30", reason: "Ewes yearly CDT about 4 weeks before lambing." },
                    more_task_count: 2,
                    next_tasks: [
                        { task: "CDT ewes (pre-lambing)", due_date: "2027-01-30", reason: "Ewes yearly CDT about 4 weeks before lambing." },
                        { task: "Deworm (FAMACHA check)", due_date: "2026-11-05", reason: "FAMACHA check every 4–6 weeks in the warm season." },
                        { task: "Log last shearing date", due_date: "2026-10-28", reason: "Last shearing date is not recorded.", missing_last_care: true },
                    ],
                    water_today: "~12 gal",
                    heat_alert: "High 97°F today · check shade and water",
                    last_care_line: "Deworm Oct 1 · Vaccine Oct 1",
                    reminders_default_on: true,
                    details: {
                        species: "sheep",
                        total_head: 6,
                        groups: { ewes: 4, rams: 1, lambs: 1 },
                        purpose: ["meat"],
                        breed: "Dorper",
                        acquired_date: "2026-10-26",
                        breeding_status: "bred",
                        breeding_date: "2026-10-08",
                        last_care: { deworm: "2026-10-01", vaccine: "2026-10-01" },
                        feed: ["pasture"],
                        grazing_acres: 2,
                    },
                },
                careSummary: {
                    hasAnchor: true,
                    anchorDate: "2026-10-26",
                    stageLabel: "Germination",
                    milestones: [
                        { milestone_key: "first_flower", label: "First flower", estimated_from: "2026-11-01", estimated_to: "2026-11-01" },
                        { milestone_key: "first_harvest", label: "Harvest", estimated_from: "2027-05-01", estimated_to: "2027-05-01" },
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
        if (asset.kind === "Cattle" && asset.livestockCard) {
            const card = asset.livestockCard;
            return {
                status: "success",
                has_plan: true,
                category: "Cattle",
                asset_id: asset.id,
                asset_title: card.title || asset.title,
                display_name: card.title || asset.title,
                quantity: asset.count,
                schedule_status: "ready",
                livestock_card: card,
                next_tasks: card.next_tasks || [],
                ready_line: card.ready_line || "",
                current_stage: card.stage_label ? { label: card.stage_label, stage_key: "livestock" } : null,
                stages: [],
                milestones: [],
                guidance: [],
                reminders: (state.reminders[asset.id] || []).slice(),
                disclaimer: "Local preview. Guidance only — not a vet diagnosis or extension visit.",
            };
        }
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
