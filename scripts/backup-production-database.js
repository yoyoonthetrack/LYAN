'use strict';

// Read-only logical backup of Production, then a restore into a temporary
// local PostgreSQL that is never the Production or Staging database.
// The password comes from LYANN_SUPABASE_DB_PASSWORD. Nothing is printed.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REF = 'gzispjfoywklpqatjyop';
const OUT = process.env.LYANN_PRODUCTION_BACKUP || path.join(process.env.HOME || '', 'Developer/lyann-releases/backups/production-latest.dump');

function bin(name) {
    const home = process.env.HOME || '';
    const guesses = [
        process.env.LYANN_PG_BIN && path.join(process.env.LYANN_PG_BIN, name),
        path.join(home, 'hb/Cellar/postgresql@17/17.11_1/bin', name),
        '/opt/homebrew/opt/postgresql@17/bin/' + name
    ].filter(Boolean);
    for (const guess of guesses) if (fs.existsSync(guess)) return guess;
    return name;
}

function run(cmd, args, env) {
    const result = spawnSync(cmd, args, { env, encoding: 'utf8' });
    return { code: result.status, out: result.stdout || '', err: result.stderr || '' };
}

function main() {
    const secret = process.env.LYANN_SUPABASE_DB_PASSWORD || '';
    if (!secret) {
        console.error('REFUS : LYANN_SUPABASE_DB_PASSWORD absent.');
        process.exit(1);
    }
    if (OUT.includes('/Users/mac/Developer/lyann/')) {
        console.error('REFUS : la sauvegarde ne doit pas être écrite dans le dépôt.');
        process.exit(1);
    }
    fs.mkdirSync(path.dirname(OUT), { recursive: true, mode: 0o700 });
    const env = { ...process.env, PGPASSWORD: secret, PGSSLMODE: 'require' };
    const dump = run(bin('pg_dump'), [
        '-h', 'aws-0-eu-central-1.pooler.supabase.com',
        '-p', '5432',
        '-U', 'postgres.' + REF,
        '-d', 'postgres',
        '-Fc',
        '--no-owner',
        '--no-acl',
        '-f', OUT
    ], env);
    if (dump.code !== 0) {
        console.error('REFUS : pg_dump a échoué.');
        process.exit(2);
    }
    fs.chmodSync(OUT, 0o600);
    const list = run(bin('pg_restore'), ['--list', OUT], env);
    const required = ['public bokantaj_posts', 'public profiles', 'public payments', 'public requests'];
    if (list.code !== 0 || required.some((entry) => !list.out.includes(entry))) {
        console.error('REFUS : la sauvegarde n’est pas lisible.');
        process.exit(3);
    }
    console.log(JSON.stringify({
        ok: true,
        bytes: fs.statSync(OUT).size,
        productionWrites: false,
        storageBytesIncluded: false,
        vaultExtension: 'supabase_vault absent d’un PostgreSQL local'
    }));
}

main();
