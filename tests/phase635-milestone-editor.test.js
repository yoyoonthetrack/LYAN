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

test('6.35 invalid totals, zero jalons and broken sums stop before a server call', () => {
    const named = editor.createState({
        defaults: [
            { title: 'A', percent: 50, amount: 20 },
            { title: 'B', percent: 50, amount: 20 }
        ]
    });
    editor.applyTotal(named, 40);
    assert.equal(editor.validate(named, 0).ok, false);
    assert.match(editor.validate(named, 0).message, /montant total/);
    assert.equal(editor.validate(named, -5).ok, false);
    named.rows[1].title = '';
    assert.match(editor.validate(named, 40).message, /nom/);
    named.rows[1].title = 'B';
    named.rows[1].amountCents = 0;
    assert.match(editor.validate(named, 40).message, /montant supérieur à 0/);
    named.rows[1].amountCents = 1000;
    const mismatch = editor.validate(named, 40);
    assert.equal(mismatch.ok, false);
    assert.match(mismatch.message, /doit égaler le total/);
    assert.equal(editor.parseDecimal('abc').ok, false);
    assert.equal(editor.parseDecimal('-2').value, -2);
    const negative = editor.createState({ defaults: [{ title: 'A', percent: -10, amount: -1 }] });
    assert.match(editor.validate(negative, 10).message, /négatifs|montant supérieur à 0/);
});

test('6.35 rounding keeps the cent remainder explicit', () => {
    const state = editor.createState({
        defaults: [
            { title: 'A', percent: 33.33, amount: 0 },
            { title: 'B', percent: 33.33, amount: 0 },
            { title: 'C', percent: 33.34, amount: 0 }
        ]
    });
    editor.applyTotal(state, 10);
    const before = editor.summary(state, 10);
    assert.equal(before.balanced, false);
    editor.assignRemainder(state, state.rows[2].id, 10);
    const checked = editor.validate(state, 10);
    assert.equal(checked.ok, true);
    const cents = checked.milestones.reduce((sum, row) => sum + editor.roundCents(row.amount), 0);
    assert.equal(cents, 1000);
});

test('6.35 a quote revision refuses a zero amount and a missing server confirmation', () => {
    const revision = require('../quote-revision.js');
    const zero = revision.validateMilestones([{ title: 'Jalon', amount: 0 }]);
    assert.equal(zero.ok, false);
    assert.equal(zero.code, 'amount');
    const negative = revision.validateMilestones([{ title: 'Jalon', amount: -1 }]);
    assert.equal(negative.ok, false);
    const chat = fs.readFileSync(path.join(__dirname, '..', 'chat-logic.js'), 'utf8');
    const creator = chat.slice(chat.indexOf('async function createProductionQuoteForContact'), chat.indexOf('function invalidateActiveQuoteContext'));
    const closeAt = chat.indexOf('closeAllOverlays();', chat.indexOf('SUBMIT MILESTONE DEVIS'));
    const guardAt = chat.indexOf('created.success !== true', chat.indexOf('SUBMIT MILESTONE DEVIS') === -1 ? 0 : chat.indexOf('async function createProductionQuoteForContact'));
    assert.ok(guardAt > 0 && guardAt < closeAt);
    assert.match(creator, /Le devis n’a pas été enregistré/);
    assert.doesNotMatch(creator, /closeAllOverlays/);
    function confirmed(created) {
        return Boolean(created && created.success === true && created.quote_id);
    }
    assert.equal(confirmed(null), false);
    assert.equal(confirmed({ success: false, quote_id: 'x' }), false);
    assert.equal(confirmed({ success: true }), false);
    assert.equal(confirmed({ success: true, quote_id: 'x' }), true);
});

test('6.35 a named jalon at zero euros is refused before any server call', () => {
    const state = editor.createState({
        defaults: [
            { title: 'A', percent: 100, amount: 40 },
            { title: 'B', percent: 0, amount: 0 }
        ]
    });
    editor.applyTotal(state, 40);
    const checked = editor.validate(state, 40);
    assert.equal(checked.ok, false);
    assert.match(checked.message, /montant supérieur à 0/);
});

test('6.35 source no longer rebalances sibling jalons on input', () => {
    const chat = fs.readFileSync(path.join(__dirname, '..', 'chat-logic.js'), 'utf8');
    assert.match(chat, /LYANN_MILESTONE_EDITOR/);
    assert.match(chat, /created\.success !== true \|\| !created\.quote_id/);
    assert.doesNotMatch(chat, /function rebalanceMilestones/);
    assert.match(chat, /Affecter le reste à ce jalon/);
});
