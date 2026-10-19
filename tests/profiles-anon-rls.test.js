'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sql = fs.readFileSync(path.join(__dirname, '..', '56_profiles_anon_rls.sql'), 'utf8');
const rollback = fs.readFileSync(path.join(__dirname, '..', '56_profiles_anon_rls_rollback.sql'), 'utf8');

function profilesAllowed(role, uid, rowId, isAdmin) {
    if (uid && uid === rowId) return true;
    if ((role || '') !== 'authenticated') return false;
    return isAdmin === true;
}

function messagesAllowed(role, participant, isAdmin) {
    if ((role || '') !== 'authenticated') return false;
    return participant === true || isAdmin === true;
}

test('56 anonymous profile read does not call the admin helper', () => {
    assert.match(sql, /WHEN auth\.uid\(\) = id THEN true/);
    assert.match(sql, /IS DISTINCT FROM 'authenticated' THEN false/);
    assert.match(sql, /ELSE public\.is_current_user_admin\(\)/);
    assert.doesNotMatch(sql, /GRANT EXECUTE ON FUNCTION public\.is_current_user_admin/);
    assert.doesNotMatch(sql, /ALTER VIEW|CREATE VIEW|CREATE OR REPLACE VIEW/);
    assert.doesNotMatch(sql, /DELETE FROM/);
    assert.equal(profilesAllowed('anon', null, 'user-1', false), false);
    assert.equal(profilesAllowed('anon', null, 'user-1', true), false);
});

test('56 owners and authenticated admins keep profile and message access', () => {
    assert.equal(profilesAllowed('authenticated', 'user-1', 'user-1', false), true);
    assert.equal(profilesAllowed('authenticated', 'admin', 'user-1', true), true);
    assert.equal(profilesAllowed('authenticated', 'user-2', 'user-1', false), false);
    assert.equal(messagesAllowed('anon', true, true), false);
    assert.equal(messagesAllowed('authenticated', true, false), true);
    assert.equal(messagesAllowed('authenticated', false, true), true);
    assert.equal(messagesAllowed('authenticated', false, false), false);
    assert.match(sql, /is_current_user_conversation_participant\(conversation_id\)/);
});

test('56 rollback restores the previous policies and does not touch the directory view', () => {
    assert.match(rollback, /auth\.uid\(\) = id\s+OR public\.is_current_user_admin\(\)/);
    assert.match(rollback, /is_current_user_conversation_participant\(conversation_id\)\s+OR public\.is_current_user_admin\(\)/);
    assert.doesNotMatch(rollback, /ALTER VIEW|CREATE VIEW|CREATE OR REPLACE VIEW/);
    assert.doesNotMatch(rollback, /DELETE FROM/);
});
