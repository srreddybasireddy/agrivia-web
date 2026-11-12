const test = require("node:test");
const assert = require("node:assert/strict");
const care = require("./farm-care.js");

test("card shows care rows when an anchor exists", () => {
    const model = care.cardModel({
        has_anchor: true,
        stage_label: "Grower",
        age_label: "~6 weeks",
        next_task: { type: "Water", label: "Water · today 6 PM" },
        next_milestone: { label: "Laying expected ~Dec 15 – Jan 12" },
        reminders_enabled_count: 2,
    });
    assert.equal(model.mode, "rows");
    assert.equal(model.stage, "Grower · ~6 weeks");
    assert.equal(model.task, "Water · today 6 PM");
    assert.equal(model.milestone, "Laying expected ~Dec 15 – Jan 12");
    assert.equal(model.reminderCount, 2);
});

test("card asks for a date when the anchor is missing", () => {
    const model = care.cardModel({
        has_anchor: false,
        anchor_prompt_key: "Set plant date",
    });
    assert.equal(model.mode, "cta");
    assert.equal(model.prompt, "Set plant date");
});

test("missing quantity is blank so the card can offer an action", () => {
    assert.equal(care.quantityLabel(null), "");
    assert.equal(care.quantityLabel(0), "");
    assert.equal(care.quantityLabel(6), "6");
});

test("reminder save keeps reminders off unless enabled and stays in-app", () => {
    const body = care.reminderBody([
        { taskType: "water", enabled: false, timeLocal: "18:00", frequency: "daily", channel: "push" },
        { taskType: "feed", enabled: true, timeLocal: "07:00", frequency: "daily", channel: "in_app" },
    ]);
    assert.equal(body.reminders[0].enabled, false);
    assert.equal(body.reminders[0].channel, "in_app");
    assert.equal(body.reminders[0].time_of_day, "18:00");
    assert.equal(body.reminders[0].interval_days, 1);
    assert.equal(body.reminders[1].enabled, true);
});

test("subject key comes from the asset name", () => {
    assert.equal(care.subjectKeyOf("Tomatoes"), "tomato");
    assert.equal(care.subjectKeyOf("chilli"), "chilli");
    assert.equal(care.subjectKeyOf("Banana"), "banana");
    assert.equal(care.subjectKeyOf("Grow"), "");
});

test("display names title-case only all-lower or all-upper text", () => {
    assert.equal(care.displayName("chilli"), "Chilli");
    assert.equal(care.displayName("SUBBARAM REDDY"), "Subbaram Reddy");
    assert.equal(care.displayName("BasiReddy"), "BasiReddy");
});

test("a date-only string stays on that calendar day", () => {
    const date = care.parseLocalDate("2026-09-01");
    assert.equal(date.getFullYear(), 2026);
    assert.equal(date.getMonth(), 8);
    assert.equal(date.getDate(), 1);
    assert.equal(care.formatDate("2026-09-01", { year: true }), "Sep 1, 2026");
});

test("ranges use the API dates", () => {
    assert.equal(care.formatRange("2026-10-11", "2026-10-31"), "Oct 11 – 31");
    assert.equal(care.formatRange("2026-11-05", "2026-12-10"), "Nov 5 – Dec 10");
    assert.equal(care.formatRange("2027-03-30", "2027-10-01"), "Mar 30, 2027 – Oct 1, 2027");
    assert.equal(care.formatRange("2026-12-20", "2027-01-10"), "Dec 20, 2026 – Jan 10, 2027");
    assert.equal(care.shortMilestoneLabel({ label: "Estimated first flowers (range)" }), "First flower");
    assert.equal(care.shortMilestoneLabel({
        milestone_key: "first_flower",
        short_label: "FF",
        label: "First flowering",
    }), "First flower");
    assert.equal(care.shortMilestoneLabel({
        milestone_key: "first_fruit",
        short_label: "FF",
        label: "First fruiting",
    }), "First fruit");
    assert.equal(care.shortMilestoneLabel({
        short_label: "FF",
        label: "First flowering window",
    }), "First flower");
});

test("the card shows one count and does not invent estimates without a date", () => {
    const model = care.normalizeAsset({
        id: "1",
        kind: "Garden",
        title: "chilli",
        status: "Active",
        subtitle: "10",
        count: 10,
        careSummary: {
            has_anchor: true,
            anchor_date: "2026-09-01",
            stage_label: "Vegetative",
            age_label: "day 28",
            next_task: { task_type: "water", label: "Water when the top inch of soil is dry" },
            milestones: [
                { label: "Estimated first flowers (range)", estimated_from: "2026-10-11", estimated_to: "2026-10-31" },
            ],
            reminders_enabled_count: 0,
        },
    });
    assert.equal(model.name, "Chilli");
    assert.equal(model.variety, null);
    assert.equal(model.count, 10);
    const rows = care.factRows(model, "card");
    assert.equal(rows.filter((row) => row.value === "10").length, 1);
    assert.equal(rows.find((row) => row.label === "Planted").value, "Sep 1, 2026");
    assert.equal(rows.find((row) => row.label === "Stage").value, "Vegetative · day 28");
    assert.equal(rows.find((row) => row.label === "First flower").value, "Oct 11 – 31");
});

test("a garden bed without a plan asks for a count and a date", () => {
    const model = care.normalizeAsset({
        id: "2",
        kind: "Garden",
        title: "Banana",
        status: "Growing",
        subtitle: "Banana",
        count: null,
        careSummary: { has_anchor: false, anchor_prompt_key: "plant_date" },
    });
    const rows = care.factRows(model, "card");
    assert.equal(rows.find((row) => row.kind === "add").value, "+ Add plant count");
    assert.equal(rows.find((row) => row.kind === "cta").value, "Set planting date");
    assert.equal(rows.find((row) => row.kind === "cta").label, "Planted");
    assert.equal(rows.some((row) => row.value === "Count not set"), false);
    assert.equal(model.milestones.length, 0);
});

test("a pending schedule does not show stages or milestones", () => {
    const model = care.normalizeAsset({
        id: "b",
        kind: "Garden",
        title: "Banana",
        status: "Growing",
        subtitle: "This is an estimate. The banana may not fruit in 56 days.",
        count: 9,
        careSummary: {
            has_anchor: true,
            anchor_date: "2026-08-07",
            stage_label: "Fruiting",
            age_label: "day 56",
            schedule_status: "processing",
            schedule_status_label: "Calculating care timing…",
            next_task: { label: "Check soil moisture before watering." },
            milestones: [
                { label: "First flowers", short_label: "First flowers", estimated_from: "2026-09-16", estimated_to: "2026-10-06" },
            ],
        },
    });
    assert.equal(model.variety, null);
    assert.equal(model.milestones.length, 0);
    const rows = care.factRows(model, "card");
    assert.equal(rows.find((row) => row.label === "Stage").value, "Calculating care timing…");
    assert.equal(rows.some((row) => row.label === "First flowers"), false);
    assert.equal(rows.some((row) => row.label === "Next"), false);
});

test("a care view updates only that asset summary", () => {
    const summary = care.summaryFromView({
        has_anchor: true,
        anchor_date: "2026-08-07",
        schedule_status: "processing",
        reminders_enabled_count: 1,
    }, {
        has_anchor: true,
        anchor_date: "2026-08-07",
        schedule_status: "ready",
        age_label: "day 270",
        current_stage: { label: "Flowering" },
        milestones: [{ label: "First flower", estimated_from: "2027-05-04", estimated_to: "2027-11-01" }],
        guidance: [{ task_type: "water", guidance_text: "Check soil moisture before watering.", optional: false }],
    });
    assert.equal(summary.schedule_status, "ready");
    assert.equal(summary.stage_label, "Flowering");
    assert.equal(summary.reminders_enabled_count, 1);
    assert.equal(summary.milestones.length, 1);
});

test("a failed schedule shows the backend message", () => {
    const model = care.normalizeAsset({
        id: "p",
        kind: "Garden",
        title: "Papaya",
        status: "Growing",
        careSummary: {
            has_anchor: true,
            anchor_date: "2026-10-01",
            schedule_status: "failed",
            schedule_status_label: "Could not load care timing",
        },
    });
    const rows = care.factRows(model, "card");
    assert.equal(rows.find((row) => row.label === "Stage").value, "Could not load care timing");
});

test("reminder suggestions stay empty when the API sends none", () => {
    const model = care.normalizeAsset({
        id: "c",
        kind: "Poultry & Eggs",
        title: "chicken",
        status: "Active",
        careSummary: { has_anchor: false },
    });
    assert.equal(model.reminders.suggested.length, 0);
});

test("harvest line uses the care reply dates", () => {
    const line = care.harvestLine({
        schedule_status: "ready",
        milestones: [
            {
                milestone_key: "first_flower",
                label: "First flowers",
                estimated_from: "2026-11-14",
                estimated_to: "2026-11-28",
            },
            {
                milestone_key: "first_harvest",
                label: "First harvest",
                estimated_from: "2026-11-14",
                estimated_to: "2026-12-05",
            },
        ],
    });
    assert.equal(line, "Nov 14 – Dec 5");
});

test("harvest line uses fruit dates when the reply has no harvest key", () => {
    assert.equal(care.harvestLine({
        schedule_status: "ready",
        milestones: [
            {
                milestone_key: "first_fruit",
                label: "First fruit",
                estimated_from: "2026-12-01",
                estimated_to: "2026-12-20",
            },
        ],
    }), "Dec 1 – 20");
});

test("crop cards use acres and show a harvest timeline row", () => {
    const model = care.normalizeAsset({
        id: "w",
        kind: "Crops",
        title: "Wheat",
        status: "Planted",
        acres: 0,
        careSummary: {
            has_anchor: true,
            anchor_date: "2026-10-03",
            stage_label: "Germination",
            age_label: "day 0",
            schedule_status: "ready",
            milestones: [
                {
                    milestone_key: "first_flower",
                    label: "First flower",
                    estimated_from: "2026-11-28",
                    estimated_to: "2026-12-05",
                },
                {
                    milestone_key: "first_harvest",
                    label: "First harvest",
                    estimated_from: "2027-01-01",
                    estimated_to: "2027-01-31",
                },
            ],
        },
    });
    const rows = care.factRows(model, "card");
    assert.equal(rows.find((row) => row.label === "Acres").value, "+ Add acres");
    assert.equal(rows.find((row) => row.label === "Harvest").value, "Jan 1, 2027 – Jan 31, 2027");
    assert.equal(rows.find((row) => row.label === "First flower").value, "Nov 28 – Dec 5");
    assert.equal(rows.some((row) => row.label === "Plants"), false);
});

test("poultry cards label first_egg as First egg, not Harvest", () => {
    const model = care.normalizeAsset({
        id: "c",
        kind: "Poultry & Eggs",
        title: "chicken",
        status: "Active",
        count: 6,
        careSummary: {
            has_anchor: true,
            anchor_date: "2026-09-26",
            stage_label: "Brooding",
            age_label: "day 7",
            schedule_status: "ready",
            milestones: [
                {
                    milestone_key: "first_egg",
                    label: "First Egg",
                    estimated_from: "2027-03-25",
                    estimated_to: "2027-05-24",
                },
            ],
        },
    });
    const rows = care.factRows(model, "card");
    assert.equal(rows.find((row) => row.label === "First egg").value, "Mar 25, 2027 – May 24, 2027");
    assert.equal(rows.some((row) => row.label === "Harvest"), false);
});

test("a missing care plan does not erase a schedule that is still calculating", () => {
    const summary = care.summaryFromView({
        has_anchor: true,
        anchor_date: "2026-10-03",
        schedule_status: "processing",
        schedule_status_label: "Calculating care timing…",
    }, { has_plan: false });
    assert.equal(summary.schedule_status, "processing");
    assert.equal(summary.schedule_status_label, "Calculating care timing…");
});

test("harvest line stays blank without a harvest milestone", () => {
    assert.equal(care.harvestLine({
        milestones: [
            {
                milestone_key: "germination",
                label: "Germination",
                estimated_from: "2026-10-06",
                estimated_to: "2026-10-20",
            },
        ],
    }), "");
    assert.equal(care.harvestLine({
        schedule_status: "pending",
        milestones: [
            {
                milestone_key: "first_harvest",
                label: "First harvest",
                estimated_from: "2026-11-14",
                estimated_to: "2026-12-05",
            },
        ],
    }), "");
});

test("poultry cards prefer first egg over a meat harvest window", () => {
    const model = care.normalizeAsset({
        id: "h",
        kind: "Poultry & Eggs",
        title: "Chicken",
        status: "Active",
        count: 6,
        careSummary: {
            has_anchor: true,
            anchor_date: "2026-09-26",
            schedule_status: "ready",
            milestones: [
                {
                    milestone_key: "first_harvest",
                    label: "Harvest",
                    estimated_from: "2027-03-25",
                    estimated_to: "2027-05-24",
                },
                {
                    milestone_key: "first_egg",
                    label: "First egg",
                    estimated_from: "2026-12-25",
                    estimated_to: "2027-01-24",
                },
            ],
        },
    });
    const rows = care.factRows(model, "card");
    assert.equal(rows.find((row) => row.label === "First egg").value, "Dec 25, 2026 – Jan 24, 2027");
    assert.equal(rows.some((row) => row.label === "Harvest"), false);
});

test("reminder times normalize to HH:MM for the time input", () => {
    assert.equal(care.timeOfDayValue("8:00", "08:00"), "08:00");
    assert.equal(care.timeOfDayValue("08:00:00", "07:00"), "08:00");
    assert.equal(care.timeOfDayValue("", "07:00"), "07:00");
    assert.equal(care.timeOfDayValue("morning", "08:00"), "08:00");
});

test("cattle cards hide plant dates and unconfirmed lambing", () => {
    const model = care.normalizeAsset({
        id: "lamb",
        kind: "Cattle",
        title: "Lamb · Sheep",
        status: "Healthy",
        count: 6,
        careSummary: {
            has_anchor: true,
            anchor_date: "2026-10-26",
            anchor_prompt_key: "acquired_age",
            stage_label: "Lambing",
            age_label: "day 2",
            schedule_status: "ready",
            next_task: { label: "Provide fresh water at all times." },
            milestones: [
                { milestone_key: "first_harvest", label: "First harvest", estimated_from: "2027-10-26", estimated_to: "2027-10-26" },
                { milestone_key: "first_flower", label: "First flower", estimated_from: "2026-10-26", estimated_to: "2026-10-26" },
                { milestone_key: "first_fruit", label: "First fruit", estimated_from: "2027-04-24", estimated_to: "2027-04-24" },
                { milestone_key: "first_lamb", label: "First Lamb", estimated_from: "2027-03-07", estimated_to: "2027-04-06" },
                { milestone_key: "weaning", label: "Weaning", estimated_from: "2027-01-01", estimated_to: "2027-01-20" },
            ],
        },
    });
    const rows = care.factRows(model, "card");
    assert.equal(rows.some((row) => /flower|fruit|harvest|lamb/i.test(row.label)), false);
    assert.equal(rows.find((row) => row.label === "Stage").value, "Since acquired · day 2");
    assert.match(rows.find((row) => row.label === "Weaning").value, /Jan 1/);
    assert.equal(rows.some((row) => row.label === "Next"), false);
    assert.equal(rows.find((row) => row.label === "Acquired").value, "Oct 26, 2026");
    assert.equal(rows.find((row) => row.label === "Head").value, "6");
});

test("a livestock card hides crop rows and shows the API lines", () => {
    const model = care.normalizeAsset({
        id: "lamb",
        kind: "Cattle",
        title: "Sheep · Mixed",
        status: "Healthy",
        count: 6,
        variety: "Mixed",
        careSummary: {
            has_anchor: true,
            anchor_date: "2026-10-26",
            stage_label: "Calculating care timing",
            schedule_status: "processing",
            milestones: [
                { milestone_key: "first_harvest", label: "First harvest", estimated_from: "2027-10-26", estimated_to: "2027-10-26" },
                { milestone_key: "first_flower", label: "First flower", estimated_from: "2026-11-01", estimated_to: "2026-11-01" },
                { milestone_key: "first_fruit", label: "First fruit", estimated_from: "2027-04-24", estimated_to: "2027-04-24" },
            ],
        },
        livestockCard: {
            label: "LIVESTOCK",
            title: "Lamb · Sheep",
            herd_line: "6 head · 4 ewes, 1 ram, 1 lamb",
            purpose_breed_line: "Meat · Dorper",
            stage_label: "Ewes bred Oct 8 · lambing Feb 27 – Mar 9, 2027",
            ready_line: "Market lambs Apr 24–Jun 23, 2027",
            next_task: { task: "CDT ewes (pre-lambing)", due_date: "2027-01-30" },
            more_task_count: 2,
            next_tasks: [
                { task: "CDT ewes (pre-lambing)", due_date: "2027-01-30", reason: "Ewes yearly CDT about 4 weeks before lambing." },
            ],
            water_today: "~12 gal",
            heat_alert: "High 97°F today · check shade and water",
            last_care_line: "Vaccine Oct 1",
            reminders_default_on: true,
        },
    });
    const rows = care.factRows(model, "card");
    const labels = rows.map((row) => row.label);
    assert.equal(model.name, "Lamb · Sheep");
    assert.equal(model.kindLabel, "LIVESTOCK");
    assert.equal(model.milestones.length, 0);
    assert.deepEqual(labels.filter((label) => /harvest|flower|fruit|planted|head|acquired/i.test(label)), []);
    assert.equal(rows.find((row) => row.label === "Herd").value, "6 head · 4 ewes, 1 ram, 1 lamb");
    assert.equal(rows.find((row) => row.label === "Purpose · Breed").value, "Meat · Dorper");
    assert.equal(rows.find((row) => row.label === "Stage").value, "Ewes bred Oct 8 · lambing Feb 27 – Mar 9, 2027");
    assert.equal(rows.find((row) => row.label === "Ready").value, "Market lambs Apr 24–Jun 23, 2027");
    assert.match(rows.find((row) => row.label === "Next").value, /CDT ewes/);
    assert.equal(rows.find((row) => row.label === "Next").moreCount, 2);
    assert.equal(rows.find((row) => row.label === "Water today").value, "~12 gal");
    assert.equal(rows.find((row) => row.label === "Heat").kind, "heat");
    assert.equal(rows.find((row) => row.label === "Last care").value, "Vaccine Oct 1");
    assert.equal(rows.find((row) => row.label === "Reminders").value, "On");
    assert.equal(rows.find((row) => row.label === "Reminders").action, "");
});

test("livestock reminders stay off until the API says they are on", () => {
    const model = care.normalizeAsset({
        kind: "Cattle",
        livestockCard: {
            label: "LIVESTOCK",
            title: "Sheep · Sheep",
            herd_line: "5 head",
            stage_label: "Open flock",
            reminders_default_on: false,
        },
    });
    const reminders = care.factRows(model, "card").find((row) => row.label === "Reminders");
    assert.equal(reminders.value, "Off");
    assert.equal(reminders.action, "Turn on");
});

test("cattle keeps a lambing date after a breeding date is saved", () => {
    const model = care.normalizeAsset({
        kind: "Cattle",
        title: "Sheep",
        breeding: { status: "Bred", date: "2026-10-08" },
        careSummary: {
            has_anchor: true,
            anchor_date: "2026-10-08",
            stage_label: "Pregnancy and Lambing",
            age_label: "day 20",
            schedule_status: "ready",
            milestones: [
                { milestone_key: "first_lamb", label: "First Lamb", estimated_from: "2027-03-07", estimated_to: "2027-04-06" },
            ],
        },
    });
    assert.equal(model.stage.label, "Pregnancy and Lambing");
    assert.equal(model.milestones.length, 1);
    assert.equal(model.milestones[0].label, "First Lamb");
});

test("done and snooze lower the unread count", () => {
    assert.equal(care.unreadAfter(3, "complete"), 2);
    assert.equal(care.unreadAfter(1, "snooze"), 0);
    assert.equal(care.unreadAfter(0, "complete"), 0);
});
