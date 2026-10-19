'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { LyanAIClassifier } = require('../ai-classifier');

test('a washing machine is electromenager, not couture', async () => {
    const ai = new LyanAIClassifier();
    const result = await ai.classifyNeed("Besoin de quelqu'un pour réparer ma machine à laver.");
    assert.equal(result.classification_status, 'CLASSIFIED');
    assert.equal(result.category, 'Électroménager');
    assert.equal(result.universe, 'Maison & Travaux');
    assert.notEqual(result.universe, 'Mode & Couture');
});

test('a sewing machine stays in couture', async () => {
    const ai = new LyanAIClassifier();
    const result = await ai.classifyNeed("Besoin d'une couturière pour réparer ma machine à coudre et faire un ourlet.");
    assert.equal(result.category, 'Couture');
    assert.equal(result.universe, 'Mode & Couture');
});
