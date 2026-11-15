'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { calculateMilestonePricing, legacyPaymentColumns } = require('../api/stripe-policy');

const PG = '/Users/mac/hb/Cellar/postgresql@17/17.11_1/bin';
const root = path.join(__dirname, '..');
const quoteId = '10000000-0000-0000-0000-000000000001';
const missionId = '20000000-0000-0000-0000-000000000002';
const milestoneId = '30000000-0000-0000-0000-000000000003';
const requesterId = '40000000-0000-0000-0000-000000000004';
const providerId = '50000000-0000-0000-0000-000000000005';

function psqlRun(args, sql) {
    return spawnSync(path.join(PG, 'psql'), [
        ...args, '-v', 'ON_ERROR_STOP=1', '-X', '-q', '-c', sql
    ], { encoding: 'utf8' });
}

function psqlValue(args, sql) {
    const result = spawnSync(path.join(PG, 'psql'), [
        ...args, '-v', 'ON_ERROR_STOP=1', '-X', '-q', '-t', '-A', '-c', sql
    ], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
}

function localTarget() {
    const listing = spawnSync('ps', ['aux'], { encoding: 'utf8' });
    const line = listing.stdout.split('\n').find((row) => (
        row.includes('/postgres ')
        && row.includes('/var/folders/')
        && row.includes('lyann-610w-')
        && row.includes('listen_addresses=127.0.0.1')
        && row.includes(' -p ')
    ));
    if (!line) return null;
    const port = (line.match(/ -p (\d+)/) || [])[1];
    if (!port) return null;
    return ['-h', '127.0.0.1', '-p', port];
}

function paymentFunctions(migration) {
    const centsStart = migration.indexOf('CREATE OR REPLACE FUNCTION public.lyann_money_cents');
    const centsEnd = migration.indexOf('REVOKE ALL ON FUNCTION public.lyann_money_cents');
    const start = migration.indexOf('CREATE OR REPLACE FUNCTION public.lyann_lock_quote_payment_rows');
    const endMarker = 'REVOKE INSERT ON TABLE public.payments FROM PUBLIC, anon, authenticated, service_role;';
    const end = migration.indexOf(endMarker);
    assert.ok(centsStart > 0 && centsEnd > centsStart);
    assert.ok(start > 0 && end > start);
    return migration.slice(centsStart, centsEnd) + '\n' + migration.slice(start, end + endMarker.length);
}

function paymentRow(amountEur) {
    const price = calculateMilestonePricing(String(amountEur));
    const legacy = legacyPaymentColumns(price);
    const cents = (value) => Number(value);
    return {
        requester_id: requesterId,
        provider_id: providerId,
        service_amount_cents: cents(price.service_amount_cents),
        customer_fee_cents: cents(price.customer_fee_cents),
        customer_total_cents: cents(price.customer_total_cents),
        provider_fee_cents: cents(price.provider_fee_cents),
        provider_net_cents: cents(price.provider_net_cents),
        lyann_revenue_cents: cents(price.lyann_revenue_cents),
        amount_gross_cents: legacy.amount_gross_cents,
        amount_platform_fee_cents: legacy.amount_platform_fee_cents,
        amount_provider_net_cents: legacy.amount_provider_net_cents
    };
}

function sqlLiteral(row) {
    return JSON.stringify(row).replace(/'/g, "''");
}

function withDatabase(name, body) {
    const psql = path.join(PG, 'psql');
    if (!fs.existsSync(psql)) {
        assert.fail('PostgreSQL local absent. Le test à deux sessions n’a pas été exécuté.');
    }
    const conn = localTarget();
    assert.ok(conn, 'Aucun Postgres local sur 127.0.0.1. Le test à deux sessions n’a pas été exécuté.');
    assert.deepEqual(conn.slice(0, 2), ['-h', '127.0.0.1']);
    const db = 'lyann_99_lock_' + name + '_' + process.pid;
    const created = psqlRun([...conn, '-d', 'postgres'], `CREATE DATABASE ${db};`);
    assert.equal(created.status, 0, created.stderr);
    const args = [...conn, '-d', db];
    const migration = fs.readFileSync(path.join(root, '99_mission_cap_and_deal_dedupe_staging.sql'), 'utf8');
    const setup = `
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
        END $$;
        CREATE TABLE public.quotes (
            id uuid PRIMARY KEY,
            mission_id uuid,
            status text,
            requester_id uuid,
            provider_id uuid
        );
        CREATE TABLE public.missions (
            id uuid PRIMARY KEY,
            status text
        );
        CREATE TABLE public.milestones (
            id uuid PRIMARY KEY,
            quote_id uuid,
            status text,
            amount numeric
        );
        CREATE TABLE public.messages (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            conversation_id uuid,
            sender_id uuid,
            content text,
            message_type text,
            entity_type text,
            entity_id uuid,
            metadata jsonb,
            is_read boolean
        );
        CREATE TABLE public.payments (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            milestone_id uuid,
            quote_id uuid,
            mission_id uuid,
            requester_id uuid,
            provider_id uuid,
            service_amount_cents bigint,
            customer_fee_cents bigint,
            customer_total_cents bigint,
            provider_fee_cents bigint,
            provider_net_cents bigint,
            lyann_revenue_cents bigint,
            amount_refunded_cents bigint,
            currency text,
            payment_status text,
            transfer_status text,
            amount_gross_cents bigint,
            amount_platform_fee_cents bigint,
            amount_provider_net_cents bigint,
            metadata jsonb
        );
        INSERT INTO public.missions VALUES ('${missionId}', 'AGREED');
        INSERT INTO public.quotes VALUES ('${quoteId}', '${missionId}', 'ACCEPTED', '${requesterId}', '${providerId}');
        INSERT INTO public.milestones VALUES ('${milestoneId}', '${quoteId}', 'PENDING', 100);
        ${paymentFunctions(migration)}
    `;
    const loaded = psqlRun(args, setup);
    assert.equal(loaded.status, 0, loaded.stderr);
    return Promise.resolve(body(args)).finally(() => {
        psqlRun([...conn, '-d', 'postgres'], `DROP DATABASE IF EXISTS ${db} WITH (FORCE);`);
    });
}

test('two local Postgres sessions share the quote lock before a payment row exists', async () => {
    await withDatabase('share', async (args) => {
        const psql = path.join(PG, 'psql');
        const holder = spawn(psql, [...args, '-X', '-q'], { stdio: ['pipe', 'pipe', 'pipe'] });
        let holderOut = '';
        holder.stdout.on('data', (chunk) => { holderOut += chunk; });
        holder.stderr.on('data', (chunk) => { holderOut += chunk; });
        holder.stdin.write(`BEGIN;\nSELECT public.lyann_lock_quote_payment_rows('${quoteId}');\nSELECT pg_sleep(5);\nCOMMIT;\n`);
        holder.stdin.end();
        await new Promise((resolve) => setTimeout(resolve, 800));

        const row = sqlLiteral(paymentRow(100));
        const blocked = psqlRun(args, `SELECT public.lyann_insert_milestone_payment('${milestoneId}', '${row}'::jsonb);`);
        assert.notEqual(blocked.status, 0);
        assert.match(blocked.stderr, /lock timeout|55P03|verrou/i);

        await new Promise((resolve, reject) => {
            holder.on('exit', (code) => code === 0 ? resolve() : reject(new Error(holderOut)));
        });

        const inserted = psqlRun(args, `SELECT public.lyann_insert_milestone_payment('${milestoneId}', '${row}'::jsonb);`);
        assert.equal(inserted.status, 0, inserted.stderr);
        const failed = psqlRun(args, `UPDATE public.payments SET payment_status = 'FAILED' WHERE milestone_id = '${milestoneId}';`);
        assert.equal(failed.status, 0, failed.stderr);
        const refused = psqlRun(args, `SELECT public.lyann_refuse_paid_amendment('${quoteId}', '${missionId}');`);
        assert.notEqual(refused.status, 0);
        assert.match(refused.stderr, /paiement est déjà sécurisé/);
    });
});

test('a milestone amount changed after the API read is refused before any payment row', async () => {
    await withDatabase('race', async (args) => {
        const psql = path.join(PG, 'psql');
        const stale = sqlLiteral(paymentRow(100));
        const holder = spawn(psql, [...args, '-X', '-q'], { stdio: ['pipe', 'pipe', 'pipe'] });
        let holderOut = '';
        holder.stdout.on('data', (chunk) => { holderOut += chunk; });
        holder.stderr.on('data', (chunk) => { holderOut += chunk; });
        holder.stdin.write(
            `BEGIN;\nSELECT public.lyann_lock_quote_payment_rows('${quoteId}');\n` +
            `UPDATE public.milestones SET amount = 80 WHERE id = '${milestoneId}';\n` +
            `SELECT pg_sleep(1);\nCOMMIT;\n`
        );
        holder.stdin.end();
        await new Promise((resolve) => setTimeout(resolve, 400));

        const blocked = psqlRun(args, `SELECT public.lyann_insert_milestone_payment('${milestoneId}', '${stale}'::jsonb);`);
        await new Promise((resolve, reject) => {
            holder.on('exit', (code) => code === 0 ? resolve() : reject(new Error(holderOut)));
        });
        assert.notEqual(blocked.status, 0);
        assert.match(blocked.stderr, /Aucun paiement n'a été créé/);
        assert.equal(psqlValue(args, 'SELECT count(*) FROM public.payments;'), '0');

        const current = sqlLiteral(paymentRow(80));
        const inserted = psqlRun(args, `SELECT public.lyann_insert_milestone_payment('${milestoneId}', '${current}'::jsonb);`);
        assert.equal(inserted.status, 0, inserted.stderr);
        assert.equal(psqlValue(args, 'SELECT service_amount_cents FROM public.payments;'), '8000');
    });
});

test('fee divergence is refused and rollback keeps the payment history', async () => {
    await withDatabase('fees', async (args) => {
        const tampered = paymentRow(100);
        tampered.customer_fee_cents = 0;
        tampered.customer_total_cents = tampered.service_amount_cents;
        const refused = psqlRun(args, `SELECT public.lyann_insert_milestone_payment('${milestoneId}', '${sqlLiteral(tampered)}'::jsonb);`);
        assert.notEqual(refused.status, 0);
        assert.match(refused.stderr, /frais ne correspondent pas/);
        assert.equal(psqlValue(args, 'SELECT count(*) FROM public.payments;'), '0');

        const inserted = psqlRun(args, `SELECT public.lyann_insert_milestone_payment('${milestoneId}', '${sqlLiteral(paymentRow(100))}'::jsonb);`);
        assert.equal(inserted.status, 0, inserted.stderr);
        const before = psqlValue(args, 'SELECT id::text FROM public.payments;');
        assert.match(before, /^[0-9a-f-]{36}$/);

        const rollback = fs.readFileSync(path.join(root, '99_mission_cap_and_deal_dedupe_rollback.sql'), 'utf8');
        assert.match(rollback, /DROP FUNCTION IF EXISTS public\.lyann_insert_milestone_payment\(uuid, jsonb\)/);
        assert.match(rollback, /Ne supprime pas/);
        assert.doesNotMatch(rollback, /DELETE FROM public\.payments/);
        assert.doesNotMatch(rollback, /DROP TABLE[^;]*\bpayments\b/i);
        assert.doesNotMatch(rollback, /TRUNCATE[^;]*\bpayments\b/i);

        const dropped = psqlRun(args, 'DROP FUNCTION IF EXISTS public.lyann_insert_milestone_payment(uuid, jsonb);');
        assert.equal(dropped.status, 0, dropped.stderr);
        assert.equal(psqlValue(args, "SELECT to_regprocedure('public.lyann_insert_milestone_payment(uuid,jsonb)') IS NULL;"), 't');
        assert.equal(psqlValue(args, 'SELECT count(*) FROM public.payments;'), '1');
        assert.equal(psqlValue(args, 'SELECT id::text FROM public.payments;'), before);
        assert.equal(psqlValue(args, 'SELECT count(*) FROM public.milestones;'), '1');
        assert.equal(psqlValue(args, 'SELECT count(*) FROM public.quotes;'), '1');
    });
});

test('a direct payment insert is refused and several quote_updated versions survive', async () => {
    await withDatabase('gate', async (args) => {
        const direct = psqlRun(args, `
            INSERT INTO public.payments (
                milestone_id, quote_id, mission_id, requester_id, provider_id,
                service_amount_cents, customer_fee_cents, customer_total_cents,
                provider_fee_cents, provider_net_cents, lyann_revenue_cents,
                amount_refunded_cents, currency, payment_status, transfer_status
            ) VALUES (
                '${milestoneId}', '${quoteId}', '${missionId}', '${requesterId}', '${providerId}',
                10000, 300, 10300, 300, 9700, 600, 0, 'EUR', 'CREATED', 'NOT_STARTED'
            );
        `);
        assert.notEqual(direct.status, 0);
        assert.match(direct.stderr, /parcours verrouillé/);

        const asService = psqlRun(args, `
            SET ROLE service_role;
            INSERT INTO public.payments (
                milestone_id, quote_id, mission_id, requester_id, provider_id,
                service_amount_cents, customer_fee_cents, customer_total_cents,
                provider_fee_cents, provider_net_cents, lyann_revenue_cents,
                amount_refunded_cents, currency, payment_status, transfer_status
            ) VALUES (
                '${milestoneId}', '${quoteId}', '${missionId}', '${requesterId}', '${providerId}',
                10000, 300, 10300, 300, 9700, 600, 0, 'EUR', 'CREATED', 'NOT_STARTED'
            );
        `);
        assert.notEqual(asService.status, 0);
        assert.match(asService.stderr, /permission denied|42501/i);
        assert.equal(psqlValue(args, 'SELECT count(*) FROM public.payments;'), '0');

        const inserted = psqlRun(args, `SELECT public.lyann_insert_milestone_payment('${milestoneId}', '${sqlLiteral(paymentRow(100))}'::jsonb);`);
        assert.equal(inserted.status, 0, inserted.stderr);

        const quoteUpdated = psqlRun(args, `
            INSERT INTO public.messages (content, message_type, entity_type, entity_id, metadata, is_read) VALUES
                ('Devis modifié', 'quote_updated', 'quote', '${quoteId}', '{"version":"1"}'::jsonb, false),
                ('Avenant accepté', 'quote_updated', 'quote', '${quoteId}', '{"version":"2"}'::jsonb, false);
        `);
        assert.equal(quoteUpdated.status, 0, quoteUpdated.stderr);
        const rollback = fs.readFileSync(path.join(root, '99_mission_cap_and_deal_dedupe_rollback.sql'), 'utf8');
        const start = rollback.indexOf('DROP INDEX IF EXISTS public.idx_messages_timeline_event');
        const end = rollback.indexOf('GRANT INSERT ON TABLE public.payments TO service_role;');
        assert.ok(start > 0 && end > start);
        const indexed = psqlRun(args, rollback.slice(start, end));
        assert.equal(indexed.status, 0, indexed.stderr);
        assert.equal(psqlValue(args, "SELECT count(*) FROM public.messages WHERE message_type = 'quote_updated';"), '2');
        assert.equal(psqlValue(args, 'SELECT count(*) FROM public.payments;'), '1');
        const sameVersion = psqlRun(args, `
            INSERT INTO public.messages (content, message_type, entity_type, entity_id, metadata, is_read)
            VALUES ('Doublon', 'quote_updated', 'quote', '${quoteId}', '{"version":"2"}'::jsonb, false);
        `);
        assert.notEqual(sameVersion.status, 0);
        assert.match(sameVersion.stderr, /duplicate key|idx_messages_quote_updated_version/);
        assert.equal(psqlValue(args, "SELECT count(*) FROM public.messages WHERE message_type = 'quote_updated';"), '2');
        const accepted = psqlRun(args, `
            INSERT INTO public.messages (content, message_type, entity_type, entity_id, is_read)
            VALUES ('Devis accepté', 'quote_accepted', 'quote', '${quoteId}', false);
        `);
        assert.equal(accepted.status, 0, accepted.stderr);
        const acceptedAgain = psqlRun(args, `
            INSERT INTO public.messages (content, message_type, entity_type, entity_id, is_read)
            VALUES ('Doublon accepté', 'quote_accepted', 'quote', '${quoteId}', false);
        `);
        assert.notEqual(acceptedAgain.status, 0);
        assert.match(acceptedAgain.stderr, /idx_messages_timeline_event/);
        assert.equal(psqlValue(args, "SELECT count(*) FROM public.messages WHERE message_type = 'quote_accepted';"), '1');
        assert.equal(psqlValue(args, "SELECT count(*) FROM public.messages WHERE message_type = 'quote_updated';"), '2');
    });
});

test('half-up fees match the pricing policy and application roles cannot set the insert marker', async () => {
    await withDatabase('fees_marker', async (args) => {
        const cases = [
            ['10.01', '31000000-0000-0000-0000-000000000011', 30, 971],
            ['10.02', '31000000-0000-0000-0000-000000000012', 30, 972],
            ['10.99', '31000000-0000-0000-0000-000000000013', 33, 1066]
        ];
        for (const [amount, id, providerFee, providerNet] of cases) {
            const milestone = psqlRun(args, `
                INSERT INTO public.milestones (id, quote_id, status, amount)
                VALUES ('${id}', '${quoteId}', 'PENDING', ${amount});
            `);
            assert.equal(milestone.status, 0, milestone.stderr);
            const price = calculateMilestonePricing(amount);
            assert.equal(Number(price.provider_fee_cents), providerFee);
            assert.equal(Number(price.customer_fee_cents), 149);
            assert.equal(Number(price.provider_net_cents), providerNet);
            const inserted = psqlRun(args, `SELECT public.lyann_insert_milestone_payment('${id}', '${sqlLiteral(paymentRow(amount))}'::jsonb);`);
            assert.equal(inserted.status, 0, inserted.stderr);
            const stored = psqlValue(args, `
                SELECT provider_fee_cents::text || ',' || customer_fee_cents::text || ',' ||
                       customer_total_cents::text || ',' || provider_net_cents::text || ',' ||
                       lyann_revenue_cents::text
                FROM public.payments WHERE milestone_id = '${id}';
            `);
            assert.equal(stored, [
                Number(price.provider_fee_cents),
                Number(price.customer_fee_cents),
                Number(price.customer_total_cents),
                Number(price.provider_net_cents),
                Number(price.lyann_revenue_cents)
            ].join(','));
        }

        const ceiling = paymentRow('10.01');
        ceiling.provider_fee_cents = 31;
        ceiling.provider_net_cents = 970;
        ceiling.lyann_revenue_cents = 180;
        ceiling.amount_platform_fee_cents = 180;
        ceiling.amount_provider_net_cents = 970;
        const roundedUp = psqlRun(args, `SELECT public.lyann_insert_milestone_payment('31000000-0000-0000-0000-000000000011', '${sqlLiteral(ceiling)}'::jsonb);`);
        assert.notEqual(roundedUp.status, 0);
        assert.match(roundedUp.stderr, /frais ne correspondent pas|montant du jalon a changé/);
        assert.equal(psqlValue(args, "SELECT count(*) FROM public.payments WHERE milestone_id = '31000000-0000-0000-0000-000000000011';"), '1');

        assert.equal(psqlValue(args, `
            SELECT (p.proowner = c.relowner)
            FROM pg_proc p
            JOIN pg_class c ON c.relname = 'payments' AND c.relnamespace = 'public'::regnamespace
            WHERE p.proname = 'lyann_insert_milestone_payment' AND p.prosecdef;
        `), 't');
        assert.equal(psqlValue(args, `
            SELECT prosecdef FROM pg_proc WHERE proname = 'lyann_guard_payment_insert';
        `), 't');
        for (const role of ['anon', 'authenticated', 'service_role']) {
            assert.equal(psqlValue(args, `SELECT has_table_privilege('${role}', 'public.payments', 'INSERT');`), 'f', role);
            assert.equal(psqlValue(args, `SELECT has_function_privilege('${role}', 'public.lyann_guard_payment_insert()', 'EXECUTE');`), 'f', role);
        }
        assert.equal(psqlValue(args, `SELECT has_function_privilege('service_role', 'public.lyann_insert_milestone_payment(uuid,jsonb)', 'EXECUTE');`), 't');
        assert.equal(psqlValue(args, `SELECT has_function_privilege('authenticated', 'public.lyann_insert_milestone_payment(uuid,jsonb)', 'EXECUTE');`), 'f');
        assert.equal(psqlValue(args, `SELECT has_function_privilege('anon', 'public.lyann_insert_milestone_payment(uuid,jsonb)', 'EXECUTE');`), 'f');

        const forged = psqlRun(args, `
            BEGIN;
            SET ROLE service_role;
            SELECT set_config('lyann.payment_insert', 'on', true);
            INSERT INTO public.payments (
                milestone_id, quote_id, mission_id, requester_id, provider_id,
                service_amount_cents, customer_fee_cents, customer_total_cents,
                provider_fee_cents, provider_net_cents, lyann_revenue_cents,
                amount_refunded_cents, currency, payment_status, transfer_status
            ) VALUES (
                '31000000-0000-0000-0000-000000000011', '${quoteId}', '${missionId}', '${requesterId}', '${providerId}',
                1001, 149, 1150, 30, 971, 179, 0, 'EUR', 'CREATED', 'NOT_STARTED'
            );
            ROLLBACK;
        `);
        assert.notEqual(forged.status, 0);
        assert.match(forged.stderr, /permission denied|42501/i);

        const replication = psqlRun(args, `
            BEGIN;
            SET ROLE service_role;
            SET session_replication_role = replica;
            ROLLBACK;
        `);
        assert.notEqual(replication.status, 0);
        assert.match(replication.stderr, /permission denied/i);

        const extra = psqlRun(args, `
            INSERT INTO public.milestones (id, quote_id, status, amount)
            VALUES ('31000000-0000-0000-0000-000000000099', '${quoteId}', 'PENDING', 10.01);
        `);
        assert.equal(extra.status, 0, extra.stderr);
        const leaked = psqlRun(args, `
            BEGIN;
            SELECT public.lyann_insert_milestone_payment(
                '31000000-0000-0000-0000-000000000099',
                '${sqlLiteral(paymentRow('10.01'))}'::jsonb
            );
            INSERT INTO public.payments (
                milestone_id, quote_id, mission_id, requester_id, provider_id,
                service_amount_cents, customer_fee_cents, customer_total_cents,
                provider_fee_cents, provider_net_cents, lyann_revenue_cents,
                amount_refunded_cents, currency, payment_status, transfer_status
            ) VALUES (
                '31000000-0000-0000-0000-000000000011', '${quoteId}', '${missionId}', '${requesterId}', '${providerId}',
                1001, 149, 1150, 30, 971, 179, 0, 'EUR', 'CREATED', 'NOT_STARTED'
            );
            ROLLBACK;
        `);
        assert.notEqual(leaked.status, 0);
        assert.match(leaked.stderr, /parcours verrouillé/);
        assert.equal(psqlValue(args, 'SELECT count(*) FROM public.payments;'), '3');
    });
});
