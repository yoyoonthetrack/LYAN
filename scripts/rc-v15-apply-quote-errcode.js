'use strict';

/**
 * Apply only revise_sent_quote on Supabase Staging.
 * Refuses Production. Saves the previous function body before writing.
 */
const fs = require('fs');
const path = require('path');

const STAGING_REF = 'tdktfbtqceldlaeqjtow';
const PRODUCTION_REF = 'gzispjfoywklpqatjyop';
const SQL_FILE = path.join(__dirname, '..', '59_revise_sent_quote_p0001.sql');
const ROLLBACK = path.join(__dirname, '..', 'artifacts', 'rc-v15', 'revise_sent_quote.rollback.sql');
const SIGNATURE = 'public.revise_sent_quote(uuid, text, timestamptz, jsonb, int)';

function tokenFromEnvFile() {
  const file = process.env.LYANN_SUPABASE_ACCESS_TOKEN_FILE
    || path.join('/Users/mac/Developer/lyann', '.env.local');
  const text = fs.readFileSync(file, 'utf8');
  const line = text.split(/\n/).find((row) => row.startsWith('SUPABASE_ACCESS_TOKEN='));
  if (!line) throw new Error('Jeton de gestion absent.');
  return line.slice('SUPABASE_ACCESS_TOKEN='.length).trim().replace(/^['"]|['"]$/g, '');
}

async function management(token, pathname, body) {
  if (pathname.includes(PRODUCTION_REF)) throw new Error('Production refusée.');
  const res = await fetch('https://api.supabase.com' + pathname, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let payload = null;
  try { payload = JSON.parse(text); } catch (_) { payload = text; }
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + text.slice(0, 280));
  return payload;
}

(async () => {
  const token = tokenFromEnvFile();
  const project = await management(token, '/v1/projects/' + STAGING_REF);
  if (!project || project.id !== STAGING_REF) throw new Error('Projet cible inattendu.');
  if (String(project.id) === PRODUCTION_REF) throw new Error('Production refusée.');
  const sql = fs.readFileSync(SQL_FILE, 'utf8');
  if (!sql.includes("ERRCODE = 'P0001'") || /ERRCODE = '40001'/.test(sql) || /gzispjfoywklpqatjyop/.test(sql)) {
    throw new Error('SQL de migration refusé.');
  }
  if (!sql.includes('CREATE OR REPLACE FUNCTION public.revise_sent_quote')) {
    throw new Error('La migration ne contient pas la fonction attendue.');
  }
  const before = await management(token, '/v1/projects/' + STAGING_REF + '/database/query', {
    query: `select pg_get_functiondef('${SIGNATURE}'::regprocedure) as definition`
  });
  const definition = before && before[0] && before[0].definition;
  if (!definition || !definition.includes('revise_sent_quote')) throw new Error('Définition actuelle illisible.');
  fs.mkdirSync(path.dirname(ROLLBACK), { recursive: true });
  fs.writeFileSync(ROLLBACK, definition.trim() + '\n');
  if (definition.includes("ERRCODE = 'P0001'") && !definition.includes('40001')) {
    console.log(JSON.stringify({ applied: false, reason: 'already-p0001', project: project.id }));
    return;
  }
  if (!definition.includes('40001')) throw new Error('La fonction Staging n’est pas celle attendue. Aucune écriture.');
  await management(token, '/v1/projects/' + STAGING_REF + '/database/query', { query: sql });
  const after = await management(token, '/v1/projects/' + STAGING_REF + '/database/query', {
    query: `select pg_get_functiondef('${SIGNATURE}'::regprocedure) as definition`
  });
  const next = after && after[0] && after[0].definition;
  if (!next || !next.includes("ERRCODE = 'P0001'") || next.includes('40001')) {
    throw new Error('Vérification après écriture échouée.');
  }
  console.log(JSON.stringify({ applied: true, project: project.id, rollback: 'artifacts/rc-v15/revise_sent_quote.rollback.sql' }));
})().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
