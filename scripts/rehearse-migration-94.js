#!/usr/bin/env node
'use strict';

/*
 * Migration 94 rehearsal generator (Staging tdktfbtqceldlaeqjtow ONLY, never Production).
 *
 *   node scripts/rehearse-migration-94.js --rehearsal > rehearsal.sql
 *   node scripts/rehearse-migration-94.js --snapshot  > snapshot.sql
 *
 * --rehearsal prints ONE plpgsql DO statement. It:
 *   1. snapshots policies / privileges / view definitions / data fingerprints          (state 1, before)
 *   2. probes what anon, a member, an admin and the service role can read               (probes 1)
 *   3. runs 94_visitor_member_detail_lock_staging.sql, snapshots and probes again       (state 2, after apply)
 *   4. runs 94_visitor_member_detail_lock_rollback.sql, snapshots and probes again      (state 3, after rollback)
 *   5. ends with RAISE EXCEPTION carrying the report, so the whole statement (a single transaction) is ROLLED BACK.
 * It contains no COMMIT and the migration files' own BEGIN/COMMIT are stripped. Nothing can persist: an uncaught exception aborts the
 * statement, and the report travels in the error message.
 *
 * --snapshot prints a read-only query (md5 per section) used to compare the live state before and after the rehearsal.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MIGRATION = '94_visitor_member_detail_lock_staging.sql';
const ROLLBACK = '94_visitor_member_detail_lock_rollback.sql';
const STAGING_REF = 'tdktfbtqceldlaeqjtow';

function stripTransaction(sql) {
    return sql
        .split('\n')
        .filter(line => !/^\s*(BEGIN|COMMIT)\s*;\s*$/i.test(line))
        .join('\n');
}

function readSql(name) {
    return stripTransaction(fs.readFileSync(path.join(ROOT, name), 'utf8'));
}

// Sections compared between states. Every ACL is sorted so the textual order of aclitems never creates a false difference.
const SNAPSHOT_SECTIONS = {
    policies: `(select coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text), '[]'::jsonb) from (
        select schemaname, tablename, policyname, permissive, cmd, roles::text as roles, qual, with_check
        from pg_policies where schemaname in ('public', 'storage')) x)`,
    rel_acl: `(select coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text), '[]'::jsonb) from (
        select n.nspname || '.' || c.relname as rel, c.relkind::text as kind, c.relrowsecurity as rls, c.reloptions::text as opts,
               pg_get_userbyid(c.relowner) as owner,
               (select coalesce(jsonb_agg(a order by a), '[]'::jsonb) from unnest(coalesce(c.relacl::text[], '{}'::text[])) a) as acl
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname in ('public', 'storage') and c.relkind in ('r', 'v', 'm', 'p')) x)`,
    col_acl: `(select coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text), '[]'::jsonb) from (
        select n.nspname || '.' || c.relname || '.' || a.attname as col,
               (select coalesce(jsonb_agg(q order by q), '[]'::jsonb) from unnest(a.attacl::text[]) q) as acl
        from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
        where n.nspname in ('public', 'storage') and a.attacl is not null and not a.attisdropped) x)`,
    fn_acl: `(select coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text), '[]'::jsonb) from (
        select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as fn, p.prosecdef as secdef,
               pg_get_userbyid(p.proowner) as owner,
               (select coalesce(jsonb_agg(a order by a), '[]'::jsonb) from unnest(coalesce(p.proacl::text[], '{}'::text[])) a) as acl,
               md5(pg_get_functiondef(p.oid)) as body
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prokind = 'f') x)`,
    views: `(select coalesce(jsonb_agg(jsonb_build_array(viewname, definition) order by viewname), '[]'::jsonb)
        from pg_views where schemaname = 'public')`,
    data: `jsonb_build_object(
        'reviews', (select count(*) || ':' || coalesce(md5(string_agg(t::text, '' order by t.id)), '') from public.reviews t),
        'portfolio', (select count(*) || ':' || coalesce(md5(string_agg(t::text, '' order by t.id)), '') from public.user_portfolio_items t),
        'recommendations', (select count(*) || ':' || coalesce(md5(string_agg(t::text, '' order by t.recommender_id, t.target_id)), '') from public.recommendations t),
        'profiles', (select count(*) || ':' || coalesce(md5(string_agg(t.id::text || coalesce(t.bio, ''), '' order by t.id)), '') from public.profiles t),
        'services', (select count(*) || ':' || coalesce(md5(string_agg(t.id::text, '' order by t.id)), '') from public.services t),
        'objects', (select count(*) from storage.objects))`
};
const SECTION_KEYS = Object.keys(SNAPSHOT_SECTIONS);

function snapshotExpression() {
    return `jsonb_build_object(${SECTION_KEYS.map(k => `'${k}', ${SNAPSHOT_SECTIONS[k]}`).join(',\n')})`;
}

// What each role can read. Each probe returns one scalar (as text). {T} is a member that has reviews.
const PROBES = [
    ['reviews_all', `select count(*)::text from public.reviews`],
    ['reviews_of_target', `select count(*)::text from public.reviews where target_id = '{T}'`],
    ['portfolio_all', `select count(*)::text from public.user_portfolio_items`],
    ['recommendations_all', `select count(*)::text from public.recommendations`],
    ['pp_rows', `select count(*)::text from public.public_profiles`],
    ['pp_select_star', `select count(*)::text from (select * from public.public_profiles limit 5) x`],
    ['pp_cards_columns', `select count(*)::text from (select id, first_name, last_name, avatar_url, territory, city, is_pro, professional_status, is_verified, is_pro_verified, average_rating, reviews_count from public.public_profiles) x`],
    ['pp_territory_filter', `select count(*)::text from public.public_profiles where territory is not null`],
    ['pp_rating_aggregate', `select count(*)::text from public.public_profiles where reviews_count > 0`],
    ['pp_bio_non_empty', `select count(*)::text from public.public_profiles where bio is not null and length(bio) > 0`],
    ['pp_bio_search_oracle', `select count(*)::text from public.public_profiles where bio ilike '%a%'`],
    ['services_rows', `select count(*)::text from public.services`],
    ['services_description_non_empty', `select count(*)::text from public.services where description is not null and length(description) > 0`],
    ['requests_rows', `select count(*)::text from public.requests`],
    ['request_locations_rows', `select count(*)::text from public.request_locations`],
    ['messages_rows', `select count(*)::text from public.messages`],
    ['payments_rows', `select count(*)::text from public.payments`],
    ['favorites_rows', `select count(*)::text from public.user_favorites`],
    ['rpc_trust_bio_length', `select coalesce(length(public.get_user_trust_and_reputation('{T}')->>'bio'), 0)::text`],
    ['rpc_pro_status', `select (public.get_public_profile_pro_status('{T}') is not null)::text`],
    ['rpc_public_badges', `select count(*)::text from public.lyann_public_badges(array['{T}'::uuid])`],
    ['taxonomy_nodes', `select count(*)::text from public.lyann_taxonomy_node`],
    ['editorial_highlights', `select count(*)::text from public.editorial_highlights`],
    ['storage_portfolio_list', `select count(*)::text from storage.objects where bucket_id = 'portfolio_images'`],
    ['storage_request_photos_list', `select count(*)::text from storage.objects where bucket_id = 'request-photos'`],
    ['storage_avatars_list', `select count(*)::text from storage.objects where bucket_id = 'avatars'`],
    ['is_admin', `select coalesce(public.is_current_user_admin(), false)::text`]
];

function esc(value) {
    return String(value).replace(/'/g, "''");
}

function buildRehearsalSql() {
    const migration = readSql(MIGRATION);
    const rollback = readSql(ROLLBACK);
    const probes = PROBES.map(([key, sql]) => `jsonb_build_array('${esc(key)}', '${esc(sql)}')`).join(',\n        ');
    const diffs = SECTION_KEYS.filter(k => k !== 'data');

    return `DO $rehearsal$
DECLARE
    v_member uuid;
    v_admin uuid;
    v_target uuid;
    ph int;
    snaps jsonb[] := ARRAY[]::jsonb[];
    probesByPhase jsonb[] := ARRAY[]::jsonb[];
    pr jsonb;
    res text;
    role_def record;
    probe jsonb;
    k text;
    claims text;
    diff_apply jsonb := '{}'::jsonb;
    diff_rollback jsonb := '{}'::jsonb;
    rollback_equal jsonb := '{}'::jsonb;
    probe_changes jsonb := '{}'::jsonb;
    report jsonb;
BEGIN
    -- Staging marker (migration 93 exists only on Staging in this repository's history): refuse anything else.
    IF to_regclass('public.editorial_highlights') IS NULL THEN
        RAISE EXCEPTION 'REHEARSAL REFUSED: not the Staging schema (expected ${STAGING_REF})';
    END IF;

    SELECT target_id INTO v_target FROM public.reviews GROUP BY target_id ORDER BY count(*) DESC LIMIT 1;
    SELECT id INTO v_member FROM public.profiles WHERE id <> v_target ORDER BY created_at LIMIT 1;
    SELECT am.user_id INTO v_admin FROM public.admin_members am JOIN public.admin_roles ar ON ar.id = am.role_id
        WHERE am.status = 'ACTIVE' AND ar.code IN ('SUPER_ADMIN','ADMIN','OWNER') ORDER BY am.user_id LIMIT 1;

    FOR ph IN 1..3 LOOP
        IF ph = 2 THEN
            EXECUTE $m94$
${migration}
$m94$;
        ELSIF ph = 3 THEN
            EXECUTE $r94$
${rollback}
$r94$;
        END IF;

        snaps := snaps || (${snapshotExpression()});

        pr := '{"anon":{},"member":{},"admin":{},"service":{}}'::jsonb;
        FOR role_def IN
            SELECT * FROM (VALUES
                ('anon', 'anon', NULL::uuid),
                ('member', 'authenticated', v_member),
                ('admin', 'authenticated', v_admin),
                ('service', 'service_role', NULL::uuid)) AS t(label, db_role, uid)
        LOOP
            claims := CASE WHEN role_def.uid IS NULL THEN json_build_object('role', role_def.db_role)::text
                           ELSE json_build_object('role', role_def.db_role, 'sub', role_def.uid)::text END;
            FOR probe IN SELECT jsonb_array_elements(jsonb_build_array(
        ${probes}
            )) LOOP
                BEGIN
                    EXECUTE format('SET LOCAL ROLE %I', role_def.db_role);
                    PERFORM set_config('request.jwt.claims', claims, true);
                    EXECUTE replace(probe->>1, '{T}', v_target::text) INTO res;
                    pr := jsonb_set(pr, ARRAY[role_def.label, probe->>0], to_jsonb(res));
                EXCEPTION WHEN OTHERS THEN
                    pr := jsonb_set(pr, ARRAY[role_def.label, probe->>0], to_jsonb('ERR: ' || SQLERRM));
                END;
                RESET ROLE;
            END LOOP;
        END LOOP;
        probesByPhase := probesByPhase || pr;
    END LOOP;

    -- State 1 -> 2: the intended changes only. State 1 -> 3: must be empty (exact rollback).
    FOREACH k IN ARRAY ARRAY[${diffs.map(d => `'${d}'`).join(', ')}] LOOP
        diff_apply := diff_apply || jsonb_build_object(k, jsonb_build_object(
            'removed', (SELECT coalesce(jsonb_agg(e), '[]'::jsonb) FROM (SELECT jsonb_array_elements(snaps[1]->k) e EXCEPT SELECT jsonb_array_elements(snaps[2]->k)) q),
            'added',   (SELECT coalesce(jsonb_agg(e), '[]'::jsonb) FROM (SELECT jsonb_array_elements(snaps[2]->k) e EXCEPT SELECT jsonb_array_elements(snaps[1]->k)) q)));
        diff_rollback := diff_rollback || jsonb_build_object(k, jsonb_build_object(
            'removed', (SELECT coalesce(jsonb_agg(e), '[]'::jsonb) FROM (SELECT jsonb_array_elements(snaps[1]->k) e EXCEPT SELECT jsonb_array_elements(snaps[3]->k)) q),
            'added',   (SELECT coalesce(jsonb_agg(e), '[]'::jsonb) FROM (SELECT jsonb_array_elements(snaps[3]->k) e EXCEPT SELECT jsonb_array_elements(snaps[1]->k)) q)));
        rollback_equal := rollback_equal || jsonb_build_object(k, snaps[1]->k = snaps[3]->k);
    END LOOP;
    rollback_equal := rollback_equal || jsonb_build_object('data', snaps[1]->'data' = snaps[3]->'data', 'data_unchanged_by_apply', snaps[1]->'data' = snaps[2]->'data', 'probes', probesByPhase[1] = probesByPhase[3]);

    FOR role_def IN SELECT unnest(ARRAY['anon','member','admin','service']) AS label LOOP
        probe_changes := probe_changes || jsonb_build_object(role_def.label, (
            SELECT coalesce(jsonb_object_agg(a.key, jsonb_build_object('before', a.value, 'after', b.value)), '{}'::jsonb)
            FROM jsonb_each(probesByPhase[1]->role_def.label) a JOIN jsonb_each(probesByPhase[2]->role_def.label) b USING (key)
            WHERE a.value <> b.value));
    END LOOP;

    report := jsonb_build_object(
        'ids', jsonb_build_object('target_with_reviews', v_target, 'member', v_member, 'admin', v_admin),
        'rollback_equal', rollback_equal,
        'rollback_diff', diff_rollback,
        'apply_diff', diff_apply,
        'probe_changes_apply', probe_changes,
        'probes_before', probesByPhase[1],
        'probes_after_apply', probesByPhase[2]);

    -- ALWAYS abort: the report is carried by the error message and the single statement (one transaction) is rolled back.
    RAISE EXCEPTION 'REHEARSAL_REPORT %', report::text;
END
$rehearsal$;
`;
}

function buildSnapshotSql() {
    const expr = snapshotExpression();
    return `select key, md5(value::text) as fingerprint, jsonb_typeof(value) as kind,
       case when jsonb_typeof(value) = 'array' then jsonb_array_length(value) end as items
from jsonb_each(${expr}) order by key;\n`;
}

module.exports = { buildRehearsalSql, buildSnapshotSql, stripTransaction, PROBES, SNAPSHOT_SECTIONS, MIGRATION, ROLLBACK, STAGING_REF };

if (require.main === module) {
    const mode = process.argv[2];
    if (mode === '--rehearsal') process.stdout.write(buildRehearsalSql());
    else if (mode === '--snapshot') process.stdout.write(buildSnapshotSql());
    else {
        process.stderr.write('usage: node scripts/rehearse-migration-94.js --rehearsal | --snapshot\n');
        process.exit(2);
    }
}
