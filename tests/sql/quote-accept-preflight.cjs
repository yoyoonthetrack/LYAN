'use strict';

const fs = require('fs');
const path = require('path');
const { PGlite } = require('/tmp/lyann-pglite/node_modules/@electric-sql/pglite');

const root = path.join(__dirname, '..', '..');
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';

function uid(id) {
    return `SELECT set_config('lyann.uid', '${id}', false)`;
}

async function expectError(db, sql, pattern) {
    try {
        await db.exec(sql);
    } catch (error) {
        const message = String(error.message || error);
        if (!pattern.test(message)) throw new Error('Unexpected error: ' + message);
        return message;
    }
    throw new Error('Expected an error matching ' + pattern);
}

async function main() {
    const db = new PGlite();
    await db.exec(`
        -- SCHEMA_START
        CREATE ROLE authenticated;
        CREATE ROLE anon;
        CREATE ROLE service_role;
        CREATE SCHEMA auth;
        CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
            SELECT NULLIF(current_setting('lyann.uid', true), '')::uuid;
        $$;
        CREATE FUNCTION public.is_current_user_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false; $$;
        CREATE TABLE public.profiles (id uuid PRIMARY KEY);
        CREATE TABLE public.requests (id uuid PRIMARY KEY, title text, status text);
        CREATE TABLE public.request_invitations (
            id uuid PRIMARY KEY, request_id uuid, requester_id uuid, recipient_id uuid, status text
        );
        CREATE TABLE public.conversations (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(), started_by uuid, context_mode text
        );
        CREATE TABLE public.conversation_participants (conversation_id uuid, user_id uuid);
        CREATE TABLE public.user_blocks (blocker_id uuid, blocked_id uuid, created_at timestamptz DEFAULT now());
        CREATE TABLE public.user_reports (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            reporter_id uuid, target_user_id uuid, reason text, details text,
            status text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
        );
        CREATE TABLE public.quotes (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            request_id uuid, request_invitation_id uuid, conversation_id uuid,
            requester_id uuid, provider_id uuid, status text, version int DEFAULT 1,
            description text, details text, amount numeric, total_amount numeric,
            valid_until timestamptz, mission_id uuid, updated_at timestamptz DEFAULT now()
        );
        CREATE TABLE public.milestones (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            quote_id uuid, title text, description text, amount numeric,
            percentage numeric, display_order int, status text, created_at timestamptz DEFAULT now()
        );
        CREATE TABLE public.missions (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            requester_id uuid, helper_id uuid, related_request_id uuid, request_invitation_id uuid,
            title text, status text, total_amount numeric,
            created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
        );
        CREATE UNIQUE INDEX idx_missions_unique_active_invitation
            ON public.missions(request_invitation_id)
            WHERE request_invitation_id IS NOT NULL AND status != 'CANCELLED';
        CREATE TABLE public.payments (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            milestone_id uuid, quote_id uuid, payment_status text
        );
        CREATE TABLE public.messages (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            conversation_id uuid, sender_id uuid, content text, is_read boolean
        );
        CREATE SCHEMA storage;
        CREATE TABLE storage.buckets (
            id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]
        );
        CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text);
        CREATE FUNCTION storage.foldername(object_name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
            SELECT CASE WHEN object_name IS NULL OR position('/' IN object_name) = 0 THEN NULL
                ELSE string_to_array(regexp_replace(object_name, '/[^/]+$', ''), '/') END;
        $$;
        CREATE FUNCTION storage.filename(object_name text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
            SELECT regexp_replace(object_name, '^.*/', '');
        $$;
        CREATE FUNCTION storage.extension(object_name text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
            SELECT lower(regexp_replace(object_name, '^.*\\.', ''));
        $$;
        CREATE FUNCTION public.is_blocked_between(p_user_a uuid, p_user_b uuid)
        RETURNS boolean LANGUAGE sql STABLE AS $$
            SELECT EXISTS (
                SELECT 1 FROM public.user_blocks b
                WHERE (b.blocker_id = p_user_a AND b.blocked_id = p_user_b)
                   OR (b.blocker_id = p_user_b AND b.blocked_id = p_user_a)
            );
        $$;
        CREATE FUNCTION public.get_or_create_conversation(p_target_user_id uuid)
        RETURNS uuid LANGUAGE plpgsql AS $$
        DECLARE v_my_id uuid; v_conv_id uuid;
        BEGIN
            v_my_id := auth.uid();
            IF v_my_id IS NULL THEN RAISE EXCEPTION 'Non authentifié' USING ERRCODE = '42501'; END IF;
            SELECT cp1.conversation_id INTO v_conv_id
            FROM public.conversation_participants cp1
            JOIN public.conversation_participants cp2 ON cp1.conversation_id = cp2.conversation_id
            WHERE cp1.user_id = v_my_id AND cp2.user_id = p_target_user_id
              AND (SELECT COUNT(*) FROM public.conversation_participants cp3 WHERE cp3.conversation_id = cp1.conversation_id) = 2
            LIMIT 1;
            IF v_conv_id IS NOT NULL THEN RETURN v_conv_id; END IF;
            INSERT INTO public.conversations (started_by, context_mode) VALUES (v_my_id, 'direct') RETURNING id INTO v_conv_id;
            INSERT INTO public.conversation_participants (conversation_id, user_id)
            VALUES (v_conv_id, v_my_id), (v_conv_id, p_target_user_id);
            RETURN v_conv_id;
        END $$;
        -- SCHEMA_END
    `);
    await db.exec(fs.readFileSync(path.join(root, '51_52_one_transaction.sql'), 'utf8'));

    await db.exec(`
        INSERT INTO public.profiles (id) VALUES ('${A}'), ('${B}'), ('${C}');
        INSERT INTO public.requests (id, title, status) VALUES
            ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Peinture', 'OPEN'),
            ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'Clim', 'OPEN'),
            ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', 'Toiture', 'OPEN'),
            ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4', 'Portail', 'OPEN');
        INSERT INTO public.request_invitations (id, request_id, requester_id, recipient_id, status) VALUES
            ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '${A}', '${B}', 'ACCEPTED'),
            ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', '${A}', '${B}', 'ACCEPTED'),
            ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', '${A}', '${B}', 'ACCEPTED'),
            ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4', '${A}', '${B}', 'ACCEPTED');
        INSERT INTO public.quotes (id, request_id, request_invitation_id, requester_id, provider_id, status, version, description, total_amount, amount) VALUES
            ('cccccccc-cccc-4ccc-8ccc-ccccccccccc1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', '${A}', '${B}', 'SENT', 1, 'Salon', 80, 80),
            ('cccccccc-cccc-4ccc-8ccc-ccccccccccc2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', '${A}', '${B}', 'SENT', 1, 'Split', 500, 500),
            ('cccccccc-cccc-4ccc-8ccc-ccccccccccc3', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3', '${A}', '${B}', 'SENT', 1, 'Tuiles', 2000, 2000),
            ('cccccccc-cccc-4ccc-8ccc-ccccccccccc4', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4', '${A}', '${B}', 'SENT', 1, 'Moteur', 200, 200);
        INSERT INTO public.milestones (quote_id, title, amount, display_order, status) VALUES
            ('cccccccc-cccc-4ccc-8ccc-ccccccccccc2', 'Pose', 500, 1, 'PENDING'),
            ('cccccccc-cccc-4ccc-8ccc-ccccccccccc3', 'Couverture', 2000, 1, 'PENDING');
    `);

    await db.exec(uid(C));
    await expectError(db, `SELECT public.accept_request_quote('cccccccc-cccc-4ccc-8ccc-ccccccccccc1', 1)`, /demandeur/);
    await db.exec(uid(B));
    await expectError(db, `SELECT public.accept_request_quote('cccccccc-cccc-4ccc-8ccc-ccccccccccc1', 1)`, /demandeur/);

    await db.exec(uid(A));
    const accepted = await db.query(`SELECT public.accept_request_quote('cccccccc-cccc-4ccc-8ccc-ccccccccccc1', 1) AS result`);
    if (accepted.rows[0].result.status !== 'ACCEPTED' || accepted.rows[0].result.version !== 1) {
        throw new Error('version 1 acceptance did not return the expected payload');
    }
    await expectError(db, `SELECT public.accept_request_quote('cccccccc-cccc-4ccc-8ccc-ccccccccccc1', 1)`, /ne peut plus être accepté/);
    const missionsOne = await db.query(`SELECT count(*)::int AS n FROM public.missions WHERE request_invitation_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'`);
    if (missionsOne.rows[0].n !== 1) throw new Error('double acceptance created ' + missionsOne.rows[0].n + ' missions');

    await db.exec(uid(B));
    const revised2 = await db.query(`
        SELECT public.revise_sent_quote(
            'cccccccc-cccc-4ccc-8ccc-ccccccccccc2',
            'Split, deux unités',
            NULL,
            '[{"title":"Pose","amount":300},{"title":"Mise en service","amount":200}]'::jsonb,
            1
        ) AS result
    `);
    if (revised2.rows[0].result.version !== 2) throw new Error('revision did not reach version 2');
    const revised3 = await db.query(`
        SELECT public.revise_sent_quote(
            'cccccccc-cccc-4ccc-8ccc-ccccccccccc2',
            'Split, trois unités',
            NULL,
            '[{"title":"Pose","amount":200},{"title":"Liaison","amount":150},{"title":"Mise en service","amount":150}]'::jsonb,
            2
        ) AS result
    `);
    if (revised3.rows[0].result.version !== 3) throw new Error('revision did not reach version 3');

    await db.exec(uid(A));
    await expectError(db, `SELECT public.accept_request_quote('cccccccc-cccc-4ccc-8ccc-ccccccccccc2', 1)`, /changé/);
    await expectError(db, `SELECT public.accept_request_quote('cccccccc-cccc-4ccc-8ccc-ccccccccccc2', 2)`, /changé/);
    const current = await db.query(`SELECT public.accept_request_quote('cccccccc-cccc-4ccc-8ccc-ccccccccccc2', 3) AS result`);
    if (current.rows[0].result.version !== 3) throw new Error('version 3 was not accepted');
    await expectError(db, `SELECT public.accept_request_quote('cccccccc-cccc-4ccc-8ccc-ccccccccccc2')`, /modifié|ne peut plus être accepté/);

    await db.exec(uid(A));
    await expectError(db, `SELECT public.accept_request_quote('cccccccc-cccc-4ccc-8ccc-ccccccccccc3', 9)`, /changé/);
    const legacy = await db.query(`SELECT public.accept_request_quote('cccccccc-cccc-4ccc-8ccc-ccccccccccc3') AS result`);
    if (legacy.rows[0].result.version !== 1) throw new Error('one-argument acceptance did not keep version 1');

    await db.exec(uid(C));
    await expectError(db, `SELECT public.reject_request_quote('cccccccc-cccc-4ccc-8ccc-ccccccccccc4')`, /refuser|function/);
    await db.exec(`
        CREATE OR REPLACE FUNCTION public.reject_request_quote(p_quote_id uuid)
        RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
        DECLARE v_my_id uuid; v_quote_record record;
        BEGIN
            v_my_id := auth.uid();
            IF v_my_id IS NULL THEN RAISE EXCEPTION 'Non authentifié' USING ERRCODE = '42501'; END IF;
            SELECT * INTO v_quote_record FROM public.quotes WHERE id = p_quote_id;
            IF v_quote_record.requester_id != v_my_id THEN
                RAISE EXCEPTION 'Seul le demandeur de la prestation peut refuser ce devis' USING ERRCODE = '42501';
            END IF;
            IF v_quote_record.status IS DISTINCT FROM 'SENT' THEN
                RAISE EXCEPTION 'Le devis ne peut plus être refusé' USING ERRCODE = '22000';
            END IF;
            UPDATE public.quotes SET status = 'REJECTED' WHERE id = p_quote_id AND status = 'SENT';
            RETURN jsonb_build_object('status', 'REJECTED');
        END $$;
    `);
    await expectError(db, `SELECT public.reject_request_quote('cccccccc-cccc-4ccc-8ccc-ccccccccccc4')`, /demandeur/);
    await db.exec(uid(A));
    const rejected = await db.query(`SELECT public.reject_request_quote('cccccccc-cccc-4ccc-8ccc-ccccccccccc4') AS result`);
    if (rejected.rows[0].result.status !== 'REJECTED') throw new Error('requester refusal did not reject the quote');

    await db.exec(uid(A));
    const firstConversation = await db.query(`SELECT public.get_or_create_conversation('${B}') AS id`);
    const again = await db.query(`SELECT public.get_or_create_conversation('${B}') AS id`);
    if (firstConversation.rows[0].id !== again.rows[0].id) throw new Error('an existing conversation was not reused');
    await db.exec(`INSERT INTO public.profiles (id) VALUES ('44444444-4444-4444-8444-444444444444')`);
    await db.exec(`INSERT INTO public.user_blocks (blocker_id, blocked_id) VALUES ('${A}', '44444444-4444-4444-8444-444444444444')`);
    await expectError(db, `SELECT public.get_or_create_conversation('44444444-4444-4444-8444-444444444444')`, /ne peut pas recevoir/);
    const reusedAfterBlock = await db.query(`SELECT public.get_or_create_conversation('${B}') AS id`);
    if (reusedAfterBlock.rows[0].id !== firstConversation.rows[0].id) throw new Error('a block replaced an existing conversation');

    await db.exec(`
        INSERT INTO public.requests (id, title, status) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5', 'Blocage', 'OPEN');
        INSERT INTO public.request_invitations (id, request_id, requester_id, recipient_id, status)
            VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb5', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5', '${A}', '${B}', 'ACCEPTED');
        INSERT INTO public.quotes (id, request_id, request_invitation_id, requester_id, provider_id, status, version, total_amount, amount)
            VALUES ('cccccccc-cccc-4ccc-8ccc-ccccccccccc5', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb5', '${A}', '${B}', 'SENT', 1, 80, 80);
        INSERT INTO public.user_blocks (blocker_id, blocked_id) VALUES ('${A}', '${B}');
    `);
    await expectError(db, `SELECT public.accept_request_quote('cccccccc-cccc-4ccc-8ccc-ccccccccccc5', 1)`, /ne peut plus être accepté/);
    const blockedMissions = await db.query(`SELECT count(*)::int AS n FROM public.missions WHERE request_invitation_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb5'`);
    if (blockedMissions.rows[0].n !== 0) throw new Error('a blocked acceptance created a mission');

    const privileges = await db.query(`
        SELECT
            has_function_privilege('anon', 'public.accept_request_quote(uuid)', 'EXECUTE') AS anon_one,
            has_function_privilege('anon', 'public.accept_request_quote(uuid, integer)', 'EXECUTE') AS anon_two,
            has_function_privilege('public', 'public.accept_request_quote(uuid)', 'EXECUTE') AS public_one,
            has_function_privilege('public', 'public.accept_request_quote(uuid, integer)', 'EXECUTE') AS public_two,
            has_function_privilege('authenticated', 'public.accept_request_quote(uuid)', 'EXECUTE') AS auth_one,
            has_function_privilege('authenticated', 'public.accept_request_quote(uuid, integer)', 'EXECUTE') AS auth_two,
            has_function_privilege('service_role', 'public.accept_request_quote(uuid, integer)', 'EXECUTE') AS service_two
    `);
    const rights = privileges.rows[0];
    if (rights.anon_one || rights.anon_two || rights.public_one || rights.public_two) {
        throw new Error('anon or public can execute accept_request_quote: ' + JSON.stringify(rights));
    }
    if (!rights.auth_one || !rights.auth_two || !rights.service_two) {
        throw new Error('signed-in roles lost accept_request_quote: ' + JSON.stringify(rights));
    }

    await db.exec(`
        ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.conversation_participants FORCE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS no_direct_participant_insert ON public.conversation_participants;
        CREATE POLICY no_direct_participant_insert ON public.conversation_participants
            FOR INSERT TO authenticated WITH CHECK (false);
        GRANT INSERT ON public.conversation_participants TO authenticated;
        CREATE OR REPLACE FUNCTION public.test_open_pair(p_other uuid)
        RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
        DECLARE v_id uuid;
        BEGIN
            INSERT INTO public.conversations (started_by, context_mode) VALUES (auth.uid(), 'direct') RETURNING id INTO v_id;
            INSERT INTO public.conversation_participants (conversation_id, user_id)
            VALUES (v_id, auth.uid()), (v_id, p_other);
            RETURN v_id;
        END $$;
    `);
    await db.exec(`SET ROLE authenticated`);
    await db.exec(uid(A));
    await expectError(
        db,
        `INSERT INTO public.conversation_participants (conversation_id, user_id) VALUES ('${firstConversation.rows[0].id}', '${C}')`,
        /row-level security|policy|ne peut pas recevoir/
    );
    await db.exec(`RESET ROLE`);
    await db.exec(uid(A));
    await expectError(db, `SELECT public.test_open_pair('44444444-4444-4444-8444-444444444444')`, /ne peut pas recevoir/);
    await db.exec(`SELECT set_config('lyann.uid', '', false)`);
    const servicePair = await db.query(`SELECT public.test_open_pair('${C}') AS id`);
    if (!servicePair.rows[0].id) throw new Error('a service write without a user was refused');

    await db.exec(fs.readFileSync(path.join(root, '46_user_block_enforcement.sql'), 'utf8'));
    await db.exec(`GRANT INSERT ON public.messages TO authenticated`);
    await db.exec(uid(A));
    const stillThere = await db.query(`SELECT public.get_or_create_conversation('${B}') AS id`);
    if (stillThere.rows[0].id !== firstConversation.rows[0].id) throw new Error('blocking removed an existing conversation');
    await db.exec(`SET ROLE authenticated`);
    await expectError(
        db,
        `INSERT INTO public.messages (conversation_id, sender_id, content, is_read) VALUES ('${firstConversation.rows[0].id}', '${A}', 'bonjour', false)`,
        /ne peut pas recevoir/
    );
    await db.exec(`RESET ROLE`);

    const summary = await db.query(`
        SELECT status, version, (SELECT count(*) FROM public.missions m WHERE m.request_invitation_id = q.request_invitation_id)::int AS missions
        FROM public.quotes q
        WHERE id IN (
            'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
            'cccccccc-cccc-4ccc-8ccc-ccccccccccc2',
            'cccccccc-cccc-4ccc-8ccc-ccccccccccc3',
            'cccccccc-cccc-4ccc-8ccc-ccccccccccc4',
            'cccccccc-cccc-4ccc-8ccc-ccccccccccc5'
        )
        ORDER BY id
    `);
    console.log(JSON.stringify(summary.rows));
    await db.close();
}

main().catch((error) => {
    console.error(error && error.message ? error.message : error);
    process.exit(1);
});
