'use strict';

const fs = require('fs');
const path = require('path');

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const Q1 = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
const Q2 = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2';
const root = path.join(__dirname, '..', '..');

async function main() {
    const { default: EmbeddedPostgres } = await import('/tmp/lyann-embedded/node_modules/embedded-postgres/dist/index.js');
    const pg = require('/tmp/lyann-embedded/node_modules/pg');
    const port = 55433;
    const databaseDir = '/tmp/lyann-accept-cluster';
    fs.rmSync(databaseDir, { recursive: true, force: true });
    const embedded = new EmbeddedPostgres({
        databaseDir,
        user: 'postgres',
        password: 'postgres',
        port,
        persistent: true
    });
    await embedded.initialise();
    await embedded.start();
    await embedded.createDatabase('preflight');
    const config = { host: '127.0.0.1', port, user: 'postgres', password: 'postgres', database: 'preflight' };
    const admin = new pg.Client(config);
    await admin.connect();
    const setup = fs.readFileSync(path.join(__dirname, 'quote-accept-preflight.cjs'), 'utf8');
    const schemaStart = setup.indexOf('-- SCHEMA_START');
    const schemaEnd = setup.indexOf('-- SCHEMA_END');
    if (schemaStart < 0 || schemaEnd < 0) throw new Error('could not reuse the isolated schema');
    await admin.query(setup.slice(schemaStart, schemaEnd));
    await admin.query(fs.readFileSync(path.join(root, '51_52_one_transaction.sql'), 'utf8'));
    await admin.query(`
        INSERT INTO public.profiles (id) VALUES ('${A}'), ('${B}');
        INSERT INTO public.requests (id, title, status) VALUES
            ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Peinture', 'OPEN'),
            ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'Clim', 'OPEN');
        INSERT INTO public.request_invitations (id, request_id, requester_id, recipient_id, status) VALUES
            ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '${A}', '${B}', 'ACCEPTED'),
            ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', '${A}', '${B}', 'ACCEPTED');
        INSERT INTO public.quotes (id, request_id, request_invitation_id, requester_id, provider_id, status, version, description, total_amount, amount) VALUES
            ('${Q1}', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', '${A}', '${B}', 'SENT', 1, 'Salon', 80, 80),
            ('${Q2}', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', '${A}', '${B}', 'SENT', 1, 'Split', 500, 500);
    `);
    await admin.end();

    const left = new pg.Client(config);
    const right = new pg.Client(config);
    await left.connect();
    await right.connect();
    await left.query('BEGIN');
    await left.query(`SELECT set_config('lyann.uid', '${A}', true)`);
    await left.query(`SELECT id FROM public.quotes WHERE id = '${Q1}' FOR UPDATE`);
    const started = Date.now();
    const waiting = right.query(`
        SELECT set_config('lyann.uid', '${A}', false);
        SELECT public.accept_request_quote('${Q1}', 1);
    `).then(
        () => ({ ok: true, ms: Date.now() - started }),
        (error) => ({ ok: false, ms: Date.now() - started, message: String(error.message || error) })
    );
    await new Promise((resolve) => setTimeout(resolve, 600));
    await left.query(`
        UPDATE public.quotes SET status = 'ACCEPTED', updated_at = now() WHERE id = '${Q1}';
        INSERT INTO public.missions (requester_id, helper_id, related_request_id, request_invitation_id, title, status, total_amount)
        VALUES ('${A}', '${B}', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'Peinture', 'AGREED', 80);
    `);
    await left.query('COMMIT');
    const blocked = await waiting;
    if (blocked.ok) throw new Error('the waiting session accepted a quote locked by the other session');
    if (blocked.ms < 500) throw new Error('the second session did not wait on the row lock: ' + blocked.ms + ' ms');
    if (!/ne peut plus être accepté|concurrence|statut/.test(blocked.message)) {
        throw new Error('unexpected concurrent error: ' + blocked.message);
    }

    const one = new pg.Client(config);
    const two = new pg.Client(config);
    await one.connect();
    await two.connect();
    const race = await Promise.all([one, two].map((client) => client.query(`
        SELECT set_config('lyann.uid', '${A}', false);
        SELECT public.accept_request_quote('${Q2}', 1) AS result;
    `).then(
        (result) => ({ ok: true, result }),
        (error) => ({ ok: false, message: String(error.message || error) })
    )));
    const wins = race.filter((item) => item.ok).length;
    const count = await one.query(`SELECT count(*)::int AS n FROM public.missions WHERE request_invitation_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'`);
    if (wins !== 1 || count.rows[0].n !== 1) {
        throw new Error('concurrent accept produced ' + wins + ' successes and ' + count.rows[0].n + ' missions');
    }
    console.log(JSON.stringify({
        waited_ms: blocked.ms,
        race_wins: wins,
        missions: count.rows[0].n
    }));
    await Promise.all([left.end(), right.end(), one.end(), two.end()]);
    await embedded.stop();
}

main().catch(async (error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
