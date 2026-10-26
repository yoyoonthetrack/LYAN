'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('a stale quote revision is a business error, not a retryable serialization failure', () => {
    const sql = fs.readFileSync(path.join(__dirname, '..', '51_quote_modifications_and_safety.sql'), 'utf8');
    const start = sql.indexOf('FUNCTION public.revise_sent_quote');
    const body = sql.slice(start, sql.indexOf('REVOKE ALL ON FUNCTION public.revise_sent_quote', start));
    assert.ok(body.includes("ERRCODE = 'P0001'"));
    assert.equal(body.includes('40001'), false);
});
