'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(name) {
    return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

test('the push rollback does not replace the live notification function', () => {
    const sql = read('49_push_delivery_queue_rollback.sql');
    assert.match(sql, /NOT CERTIFIED/);
    assert.doesNotMatch(sql, /CREATE OR REPLACE FUNCTION public\.lyann_notify_on_message/);
    assert.match(sql, /DROP FUNCTION IF EXISTS public\.lyann_enqueue_push_from_notification/);
    assert.doesNotMatch(sql, /DROP TABLE/);
});

test('the quote rollback keeps block and version guards', () => {
    const sql = read('52_quote_acceptance_blocks_and_report_evidence_rollback.sql');
    assert.doesNotMatch(sql, /CREATE OR REPLACE FUNCTION public\.accept_request_quote/);
    assert.doesNotMatch(sql, /DROP FUNCTION IF EXISTS public\.accept_request_quote/);
    assert.doesNotMatch(sql, /DROP TRIGGER IF EXISTS trg_refuse_blocked_quote_write/);
    assert.match(sql, /REVOKE INSERT ON TABLE public\.report_evidence/);
});

test('block and conversation rollbacks do not remove protections still required', () => {
    const block = read('46_user_block_enforcement_rollback.sql');
    assert.match(block, /non exécuté/);
    assert.match(block, /RAISE EXCEPTION/);
    const quotes = read('51_quote_modifications_and_safety_rollback.sql');
    assert.doesNotMatch(quotes, /CREATE OR REPLACE FUNCTION public\.get_or_create_conversation/);
    assert.doesNotMatch(quotes, /DROP FUNCTION IF EXISTS public\.is_blocked_between/);
    assert.doesNotMatch(quotes, /DROP FUNCTION IF EXISTS public\.submit_user_report/);
    assert.match(quotes, /REVOKE EXECUTE ON FUNCTION public\.revise_sent_quote/);
    const media = read('50_chat_and_bokantaj_video_rollback.sql');
    assert.doesNotMatch(media, /accept_request_quote/);
    assert.doesNotMatch(media, /is_blocked_between/);
    assert.match(media, /des messages vidéo existent/);
});
