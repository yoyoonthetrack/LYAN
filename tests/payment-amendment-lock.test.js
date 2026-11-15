'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const PG = '/Users/mac/hb/Cellar/postgresql@17/17.11_1/bin';
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

test('two local Postgres sessions share the quote lock before a payment row exists', async () => {
    const psql = path.join(PG, 'psql');
    if (!fs.existsSync(psql)) {
        assert.fail('PostgreSQL local absent. Le test à deux sessions n’a pas été exécuté.');
    }
    const conn = localTarget();
    assert.ok(conn, 'Aucun Postgres local sur 127.0.0.1. Le test à deux sessions n’a pas été exécuté.');
    assert.deepEqual(conn.slice(0, 2), ['-h', '127.0.0.1']);
    const db = 'lyann_99_lock_' + process.pid;
    const created = psqlRun([...conn, '-d', 'postgres'], `CREATE DATABASE ${db};`);
    assert.equal(created.status, 0, created.stderr);
    const args = [...conn, '-d', db];
    try {
        const migration = fs.readFileSync(path.join(__dirname, '..', '99_mission_cap_and_deal_dedupe_staging.sql'), 'utf8');
        const start = migration.indexOf('CREATE OR REPLACE FUNCTION public.lyann_lock_quote_payment_rows');
        const end = migration.indexOf('GRANT EXECUTE ON FUNCTION public.lyann_insert_milestone_payment');
        assert.ok(start > 0 && end > start);
        const functions = migration.slice(start, end);
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
            ${functions}
        `;
        const loaded = psqlRun(args, setup);
        assert.equal(loaded.status, 0, loaded.stderr);

        const holder = spawn(psql, [...args, '-X', '-q'], { stdio: ['pipe', 'pipe', 'pipe'] });
        let holderOut = '';
        holder.stdout.on('data', (chunk) => { holderOut += chunk; });
        holder.stderr.on('data', (chunk) => { holderOut += chunk; });
        holder.stdin.write(`BEGIN;\nSELECT public.lyann_lock_quote_payment_rows('${quoteId}');\nSELECT pg_sleep(5);\nCOMMIT;\n`);
        holder.stdin.end();
        await new Promise((resolve) => setTimeout(resolve, 800));

        const row = JSON.stringify({
            requester_id: requesterId,
            provider_id: providerId,
            service_amount_cents: 10000,
            customer_fee_cents: 0,
            customer_total_cents: 10000,
            provider_fee_cents: 0,
            provider_net_cents: 10000,
            lyann_revenue_cents: 0,
            amount_gross_cents: 10000,
            amount_platform_fee_cents: 0,
            amount_provider_net_cents: 10000
        }).replace(/'/g, "''");
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
    } finally {
        psqlRun([...conn, '-d', 'postgres'], `DROP DATABASE IF EXISTS ${db} WITH (FORCE);`);
    }
});
