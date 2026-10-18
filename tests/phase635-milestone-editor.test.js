'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const editor = require('../quote-milestone-editor.js');

test('6.35 french decimal parse and cent rounding', () => {
    assert.equal(editor.parseDecimal('25,5').value, 25.5);
    assert.equal(editor.parseDecimal('1 000,50').value, 1000.5);
    assert.equal(editor.roundCents(10.005), 1001);
    assert.equal(editor.fromCents(199), 1.99);
});

test('6.35 editing one percent never changes the other jalons', () => {
    const state = editor.createState({
        defaults: [
            { title: 'A', percent: 25, amount: 25 },
            { title: 'B', percent: 25, amount: 25 },
            { title: 'C', percent: 50, amount: 50 }
        ]
    });
    editor.applyTotal(state, 100);
    const before = editor.snapshot(state);
    editor.applyPercent(state, before[0].id, 10, 100);
    const after = editor.snapshot(state);
    assert.equal(after[0].percent, 10);
    assert.equal(after[0].amount, 10);
    assert.equal(after[1].percent, 25);
    assert.equal(after[1].amount, 25);
    assert.equal(after[2].percent, 50);
    assert.equal(after[2].amount, 50);
    assert.equal(editor.summary(state, 100).remaining, 15);
});

test('6.35 add stays at 0% without redistributing, remove keeps others', () => {
    const state = editor.createState({
        defaults: [
            { title: 'A', percent: 25, amount: 25 },
            { title: 'B', percent: 25, amount: 25 },
            { title: 'C', percent: 50, amount: 50 }
        ]
    });
    editor.applyTotal(state, 100);
    const added = editor.addRow(state);
    assert.equal(added.percent, 0);
    assert.equal(added.amountCents, 0);
    const ids = state.rows.map((row) => row.id);
    assert.equal(ids.includes(added.id), true);
    const firstId = state.rows[0].id;
    editor.removeRow(state, added.id);
    assert.deepEqual(state.rows.map((row) => row.id), ids.filter((id) => id !== added.id));
    assert.equal(state.rows[0].id, firstId);
    assert.equal(state.rows[0].percent, 25);
    assert.equal(state.rows[2].percent, 50);
});

test('6.35 amount edit updates only that percent; remainder assign is explicit', () => {
    const state = editor.createState({
        defaults: [
            { title: 'A', percent: 25, amount: 25 },
            { title: 'B', percent: 25, amount: 25 },
            { title: 'C', percent: 50, amount: 50 }
        ]
    });
    editor.applyTotal(state, 100);
    const idB = state.rows[1].id;
    editor.applyAmount(state, idB, 40, 100);
    assert.equal(state.rows[0].amountCents, 2500);
    assert.equal(state.rows[1].amountCents, 4000);
    assert.equal(state.rows[1].percent, 40);
    assert.equal(state.rows[2].amountCents, 5000);
    editor.assignRemainder(state, idB, 100);
    assert.equal(state.rows[1].amountCents, 2500);
    assert.equal(editor.summary(state, 100).balanced, true);
});

test('6.35 indivisible cents stay exact on validation after remainder', () => {
    const state = editor.createState({
        defaults: [
            { title: 'A', percent: 33.33, amount: 0 },
            { title: 'B', percent: 33.33, amount: 0 },
            { title: 'C', percent: 33.33, amount: 0 }
        ]
    });
    editor.applyTotal(state, 100);
    const view = editor.summary(state, 100);
    assert.equal(view.balanced, false);
    editor.assignRemainder(state, state.rows[2].id, 100);
    const checked = editor.validate(state, 100);
    assert.equal(checked.ok, true);
    const sum = checked.milestones.reduce((acc, row) => acc + editor.roundCents(row.amount), 0);
    assert.equal(sum, 10000);
});

test('6.35 source no longer rebalances sibling jalons on input', () => {
    const chat = fs.readFileSync(path.join(__dirname, '..', 'chat-logic.js'), 'utf8');
    assert.match(chat, /LYANN_MILESTONE_EDITOR/);
    assert.doesNotMatch(chat, /function rebalanceMilestones/);
    assert.match(chat, /Affecter le reste à ce jalon/);
});
