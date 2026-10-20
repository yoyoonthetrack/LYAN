'use strict';

// Applies the private-media moderation cutover to Production only.
// Refuses unless both gates are present. Does not change Stripe, fees,
// or an iOS upload. Prints no secret values.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const PRODUCTION_REF = 'gzispjfoywklpqatjyop';
const ROOT = path.join(__dirname, '..');
const FORWARD = [
    '70_public_content_moderation.sql',
    '71_private_media_hold.sql',
    '72_close_public_bucket_inserts.sql',
    '73_moderation_role_permission.sql'
];

function refuse(message) {
    console.error('REFUS : ' + message);
    process.exit(1);
}

function sqlText(name) {
    let sql = fs.readFileSync(path.join(ROOT, name), 'utf8').replace(/\r\n/g, '\n');
    const fence = sql.indexOf('\n```');
    if (fence !== -1) sql = sql.slice(0, fence);
    return sql.trim();
}

async function management(token, query) {
    const response = await fetch('https://api.supabase.com/v1/projects/' + PRODUCTION_REF + '/database/query', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
    });
    const text = await response.text();
    if (!response.ok) refuse('SQL HTTP ' + response.status + ' ' + text.replace(/[A-Za-z0-9_\-]{24,}/g, '[redacted]').slice(0, 240));
}

function pgRestoreBin() {
    if (process.env.LYANN_PG_RESTORE && fs.existsSync(process.env.LYANN_PG_RESTORE)) return process.env.LYANN_PG_RESTORE;
    const home = process.env.HOME || '';
    const guesses = [
        path.join(home, 'hb/Cellar/postgresql@17/17.11_1/bin/pg_restore'),
        '/opt/homebrew/opt/postgresql@17/bin/pg_restore',
        '/usr/local/opt/postgresql@17/bin/pg_restore'
    ];
    for (const guess of guesses) if (fs.existsSync(guess)) return guess;
    return 'pg_restore';
}

function verifyBackup(file) {
    if (!file || !fs.existsSync(file)) return 'fichier absent';
    const stat = fs.statSync(file);
    if (stat.size < 64 * 1024) return 'fichier vide';
    const fd = fs.openSync(file, 'r');
    const head = Buffer.alloc(4096);
    fs.readSync(fd, head, 0, head.length, 0);
    fs.closeSync(fd);
    if (head.slice(0, 5).toString() !== 'PGDMP') {
        return 'format custom PostgreSQL requis, un fichier texte ne prouve pas une restauration';
    }
    let list = '';
    try {
        list = execFileSync(pgRestoreBin(), ['--list', file], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
        return 'pg_restore ne peut pas lire cette sauvegarde';
    }
    const required = ['TABLE DATA public bokantaj_posts', 'TABLE DATA public profiles', 'TABLE DATA public payments', 'TABLE DATA public requests'];
    const missing = required.filter((entry) => !list.includes(entry));
    if (missing.length) return 'tables LYANN absentes de la sauvegarde';
    return null;
}

async function main() {
    if (process.env.LYANN_CUTOVER_DRY_RUN === '1') {
        for (const name of FORWARD) sqlText(name);
        sqlText('70_public_content_moderation_rollback.sql');
        const backupError = process.env.LYANN_PRODUCTION_BACKUP ? verifyBackup(process.env.LYANN_PRODUCTION_BACKUP) : 'aucune sauvegarde fournie';
        console.log(JSON.stringify({
            dryRun: true,
            productionWrites: false,
            backup: backupError || 'lisible',
            order: ['backup-restored', 'secrets', 'migrations-70-73', 'lock-public-uploads', 'media-gateway', 'worker-cron', 'web', 'historical-media', 'publish-tests', 'watch-and-rollback']
        }));
        return;
    }
    if (process.env.LYANN_AUTHORIZE_PRODUCTION_DEPLOY !== '1' || process.env.LYANN_PRODUCTION_CONFIRM !== 'lyann-production-moderation') {
        refuse('déploiement Production non autorisé. Rien n’a été modifié.');
    }
    const backup = process.env.LYANN_PRODUCTION_BACKUP || '';
    const backupError = verifyBackup(backup);
    if (backupError) refuse('sauvegarde non restaurable. ' + backupError);
    const access = process.env.SUPABASE_ACCESS_TOKEN || '';
    if (!access) refuse('SUPABASE_ACCESS_TOKEN absent.');
    if (process.env.LYANN_PRODUCTION_ROLLBACK === '1') {
        await management(access, sqlText('70_public_content_moderation_rollback.sql'));
        console.log('Retour arrière appliqué. Les contenus non validés restent invisibles. Les anciens inserts publics ne sont pas rouverts.');
        return;
    }
    for (const name of ['OPENAI_API_KEY', 'MODERATION_WORKER_SECRET', 'CRON_SECRET']) {
        if (!process.env[name]) refuse(name + ' absent. Le placer seulement sur le serveur.');
    }
    for (const name of FORWARD) await management(access, sqlText(name));
    console.log('Migrations appliquées sur Production. Déployer ensuite la passerelle et le worker, puis le site, avant le build 10.');
}

main().catch((error) => refuse(String(error && error.message || error).slice(0, 240)));
