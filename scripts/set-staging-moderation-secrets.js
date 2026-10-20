'use strict';

/**
 * Masked local setup for Staging moderation secrets.
 * Reads OPENAI_API_KEY from the Terminal only. Never from argv, env, or a pipe.
 * Generates MODERATION_WORKER_SECRET when it is missing.
 * Writes .env.staging-v2 and prints no secret value.
 *
 *   node scripts/set-staging-moderation-secrets.js
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawnSync } = require('child_process');
const { ReadStream, WriteStream } = require('tty');
const { Writable } = require('stream');
const { assertStagingIsolation, STAGING_REF, PRODUCTION_REF } = require('./staging-v2-guard');

const ROOT = path.join(__dirname, '..');
const ENV_FILE = path.join(ROOT, '.env.staging-v2');
const SECRET_NAMES = ['OPENAI_API_KEY', 'MODERATION_WORKER_SECRET'];

function fail(message) {
  console.error(message);
  process.exit(1);
}

function parseEnv(text) {
  const out = {};
  for (const line of String(text || '').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const index = trimmed.indexOf('=');
    let value = trimmed.slice(index + 1);
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[trimmed.slice(0, index)] = value;
  }
  return out;
}

function upsert(text, key, value) {
  const line = key + '=' + JSON.stringify(value);
  const pattern = new RegExp('^' + key + '=.*$', 'm');
  if (pattern.test(text)) return text.replace(pattern, line);
  const base = text.endsWith('\n') || text.length === 0 ? text : text + '\n';
  return base + line + '\n';
}

function promptSecret(question) {
  return new Promise((resolve, reject) => {
    let inputFd;
    let outputFd;
    try {
      inputFd = fs.openSync('/dev/tty', 'r');
      outputFd = fs.openSync('/dev/tty', 'w');
    } catch (err) {
      reject(new Error('Terminal indisponible. Lancez la commande dans le Terminal.'));
      return;
    }
    const input = new ReadStream(inputFd);
    const output = new WriteStream(outputFd);
    const muted = new Writable({
      write(chunk, encoding, callback) {
        if (!muted.muted) output.write(chunk, encoding);
        callback();
      }
    });
    muted.muted = false;
    const rl = readline.createInterface({ input, output: muted, terminal: true });
    rl.question(question, (answer) => {
      muted.muted = false;
      output.write('\n');
      rl.close();
      input.destroy();
      output.end();
      resolve(String(answer || ''));
    });
    muted.muted = true;
  });
}

function acceptableKey(value) {
  return /^sk-\S{20,}$/.test(value) && !/[\r\n\s]/.test(value);
}

async function main() {
  if (process.argv.length > 2) fail('Ne passez pas la clé en argument.');
  if (!fs.existsSync(ENV_FILE)) fail('Fichier Staging introuvable. Les autres variables ne peuvent pas être conservées.');

  let apiKey = await promptSecret('Clé OpenAI API (saisie masquée, puis Entrée) : ');
  apiKey = apiKey.trim();
  if (!acceptableKey(apiKey)) {
    apiKey = '';
    fail('Clé refusée. Elle doit commencer par sk- et ne contenir aucun espace.');
  }

  const original = fs.readFileSync(ENV_FILE, 'utf8');
  const current = parseEnv(original);
  const workerSecret = current.MODERATION_WORKER_SECRET && String(current.MODERATION_WORKER_SECRET).length >= 32
    ? current.MODERATION_WORKER_SECRET
    : crypto.randomBytes(32).toString('base64url');

  let next = upsert(original, 'OPENAI_API_KEY', apiKey);
  next = upsert(next, 'MODERATION_WORKER_SECRET', workerSecret);
  apiKey = '';

  const temp = ENV_FILE + '.tmp';
  fs.writeFileSync(temp, next, { mode: 0o600 });
  fs.chmodSync(temp, 0o600);
  fs.renameSync(temp, ENV_FILE);
  fs.chmodSync(ENV_FILE, 0o600);

  const written = fs.readFileSync(ENV_FILE, 'utf8');
  const cfg = parseEnv(written);
  for (const name of Object.keys(current)) {
    if (SECRET_NAMES.includes(name)) continue;
    if (cfg[name] !== current[name]) fail('Une variable existante a changé. Écriture interrompue.');
  }
  if (!acceptableKey(cfg.OPENAI_API_KEY)) fail('La clé enregistrée est illisible.');
  if (!cfg.MODERATION_WORKER_SECRET || cfg.MODERATION_WORKER_SECRET.length < 32) fail('Le secret du worker est illisible.');
  if (written.includes(PRODUCTION_REF)) fail('Le fichier Staging contient une référence Production.');

  const mode = (fs.statSync(ENV_FILE).mode & 0o777).toString(8);
  if (mode !== '600') fail('Permissions inattendues : ' + mode);

  const ignored = spawnSync('git', ['check-ignore', '-q', '.env.staging-v2'], { cwd: ROOT });
  if (ignored.status !== 0) fail('Git n’ignore pas .env.staging-v2.');
  const tracked = spawnSync('git', ['ls-files', '--error-unmatch', '.env.staging-v2'], { cwd: ROOT, encoding: 'utf8' });
  if (tracked.status === 0) fail('.env.staging-v2 est suivi par Git.');

  assertStagingIsolation(cfg);
  if (!String(cfg.SUPABASE_URL || '').includes(STAGING_REF)) fail('SUPABASE_URL ne pointe pas vers Staging.');

  console.log(JSON.stringify({
    enregistrement: 'ok',
    OPENAI_API_KEY: 'present',
    MODERATION_WORKER_SECRET: 'present',
    mode,
    git: 'ignored',
    supabase: STAGING_REF
  }));
}

main().catch((error) => {
  const temp = ENV_FILE + '.tmp';
  if (fs.existsSync(temp)) fs.unlinkSync(temp);
  fail(String(error && error.message || error).replace(/sk-\S+/g, '[redacted]'));
});
