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

test("missing quantity never renders as zero", () => {
    assert.equal(care.quantityLabel(null), "Count not set");
    assert.equal(care.quantityLabel(0), "Count not set");
    assert.equal(care.quantityLabel(6), "6");
});

test("reminder save keeps reminders off unless enabled and stays in-app", () => {
    const body = care.reminderBody([
        { taskType: "water", enabled: false, timeLocal: "18:00", frequency: "daily", channel: "push" },
        { taskType: "feed", enabled: true, timeLocal: "07:00", frequency: "daily", channel: "in_app" },
    ]);
    assert.equal(body.reminders[0].enabled, false);
    assert.equal(body.reminders[0].channel, "in_app");
    assert.equal(body.reminders[1].enabled, true);
});

test("subject key comes from the asset name", () => {
    assert.equal(care.subjectKeyOf("Tomatoes"), "tomato");
    assert.equal(care.subjectKeyOf("chilli"), "chilli");
    assert.equal(care.subjectKeyOf("Banana"), "banana");
    assert.equal(care.subjectKeyOf("Grow"), "");
});

test("done and snooze lower the unread count", () => {
    assert.equal(care.unreadAfter(3, "complete"), 2);
    assert.equal(care.unreadAfter(1, "snooze"), 0);
    assert.equal(care.unreadAfter(0, "complete"), 0);
});
