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
    assert.equal(care.shortMilestoneLabel({ label: "Estimated first flowers (range)" }), "First flowers");
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
    assert.equal(rows.find((row) => row.label === "First flowers").value, "Oct 11 – 31");
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
    assert.equal(rows.some((row) => row.value === "Count not set"), false);
    assert.equal(model.milestones.length, 0);
});

test("done and snooze lower the unread count", () => {
    assert.equal(care.unreadAfter(3, "complete"), 2);
    assert.equal(care.unreadAfter(1, "snooze"), 0);
    assert.equal(care.unreadAfter(0, "complete"), 0);
});
