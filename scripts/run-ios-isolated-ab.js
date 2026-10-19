/**
 * Build Lyann-test into the iOS simulator, run the A↔B harness, then restore.
 * Never targets production gzispjfoywklpqatjyop.
 */
'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { createClient } = require('@supabase/supabase-js');

const ROOT = path.join(__dirname, '..');
const TEST_REF = 'pcmvagiuvleeciktligz';
const PROD_REF = 'gzispjfoywklpqatjyop';
const UDID = '7E928EC6-65C2-4956-9058-786D2CBB0AE0';
const BUNDLE = 'app.lyann.mobile';
const DERIVED = path.join(process.env.HOME, 'Library/Application Support/LYANN/xcode-preview');
const ARTIFACT = path.join(ROOT, 'artifacts/explorer/iphone-isolated-ab-final.png');
const RESULT_FILE = path.join(ROOT, 'artifacts/explorer/ios-isolated-ab-result.json');
const INFO_PLIST = path.join(ROOT, 'ios/App/App/Info.plist');
const INFO_PLIST_HASH = '4bddcbe6681abea169714c3ccc92e5daddd0e555c69edd682529d6809c000e71';
const INFO_PLIST_BACKUP = path.join(process.env.HOME, 'Library/Application Support/LYANN/db-backups/Info.plist.ios-ab-backup');

function die(msg) {
  console.error('STOP', msg);
  process.exit(1);
}

function readEnvLines() {
  return fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split(/\n/);
}

function commented(name, lines) {
  const re = new RegExp('^#\\s*' + name + '=(.*)$');
  for (const raw of lines) {
    const m = raw.trim().match(re);
    if (m) return m[1].replace(/^["']|["']$/g, '');
  }
  return '';
}

function active(name, lines) {
  for (const raw of lines) {
    const t = raw.trim();
    if (!t || t.startsWith('#')) continue;
    if (t.startsWith(name + '=')) return t.slice(name.length + 1).replace(/^["']|["']$/g, '');
  }
  return '';
}

function hostRef(url) {
  try {
    return new URL(url).hostname.replace('.supabase.co', '');
  } catch (e) {
    return '';
  }
}

function jwtRef(token) {
  try {
    const payload = token.split('.')[1];
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, 'base64url').toString()).ref || '';
  } catch (e) {
    return '';
  }
}

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: 'utf8',
    env: opts.env || process.env,
    timeout: opts.timeout || 300000
  });
  if (res.status !== 0 && !opts.allowFail) {
    die((opts.label || cmd) + ' failed: ' + (res.stderr || res.stdout || '').slice(0, 500));
  }
  return res;
}

function walkHtml(dir, fn) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walkHtml(p, fn);
    else if (name.endsWith('.html')) fn(p);
  }
}

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name);
    const d = path.join(dst, name);
    if (fs.statSync(s).isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function injectIsolatedBundle(cfg) {
  process.env.LYANN_E2E_ALLOW_WRITES = '1';
  process.env.LYANN_SUPABASE_URL = cfg.url;
  process.env.LYANN_SUPABASE_ANON_KEY = cfg.anon;
  process.env.VERCEL_ENV = '';
  run('node', ['build_mobile.js'], { label: 'build_mobile isolated' });

  const { injectIsolatedSupabaseConfig } = require(path.join(ROOT, 'shared-html-build'));
  const harnessSrc = fs.readFileSync(path.join(ROOT, 'scripts/ios-isolated-ab-harness.js'), 'utf8');
  // The harness may name the production ref only to refuse it.
  if (/https:\/\/gzispjfoywklpqatjyop\.supabase\.co/.test(harnessSrc)) {
    die('harness embeds production URL');
  }

  const cfgTag =
    '<script>window.__LYANN_ISO_AB_CFG=' +
    JSON.stringify({
      emailA: cfg.emailA,
      passwordA: cfg.passwordA,
      emailB: cfg.emailB,
      passwordB: cfg.passwordB,
      reportHosts: cfg.reportHosts || []
    }) +
    ';</script>\n';
  const harnessTag = '<script>\n' + harnessSrc + '\n</script>\n';

  walkHtml(path.join(ROOT, 'www'), (file) => {
    let html = fs.readFileSync(file, 'utf8');
    html = injectIsolatedSupabaseConfig(html);
    if (!html.includes('pcmvagiuvleeciktligz.supabase.co') || /https:\/\/gzispjfoywklpqatjyop\.supabase\.co/.test(html)) {
      die('inject failed for ' + file);
    }
    const base = path.basename(file);
    if (['feed.html', 'index.html', 'results.html', 'about.html'].includes(base)) {
      if (!html.includes('window.__LYANN_ISO_AB_CFG')) {
        html = html.includes('</head>')
          ? html.replace('</head>', cfgTag + harnessTag + '</head>')
          : cfgTag + harnessTag + html;
      }
    }
    fs.writeFileSync(file, html);
  });

  copyDir(path.join(ROOT, 'www'), path.join(ROOT, 'ios/App/App/public'));
  const feed = fs.readFileSync(path.join(ROOT, 'www/feed.html'), 'utf8');
  if (!feed.includes('__LYANN_ISO_AB_CFG') || !feed.includes('LYANN_ISO_AB_RESULT')) {
    die('harness not present in feed.html');
  }
  console.log('INJECTED_OK');
}

function restoreProductionBundle() {
  delete process.env.LYANN_SUPABASE_URL;
  delete process.env.LYANN_SUPABASE_ANON_KEY;
  process.env.LYANN_E2E_ALLOW_WRITES = '0';
  run('node', ['build_mobile.js'], { label: 'build_mobile restore' });
  const feed = fs.readFileSync(path.join(ROOT, 'www/feed.html'), 'utf8');
  if (feed.includes(TEST_REF) || feed.includes('__LYANN_ISO_AB_CFG')) {
    die('restore left isolated artifacts');
  }
  console.log('RESTORED_OK');
}

function buildInstallLaunch() {
  run(
    'xcodebuild',
    [
      '-project', 'ios/App/App.xcodeproj',
      '-scheme', 'App',
      '-configuration', 'Debug',
      '-destination', 'id=' + UDID,
      '-derivedDataPath', DERIVED,
      'build'
    ],
    { label: 'xcodebuild', timeout: 420000 }
  );
  const app = path.join(DERIVED, 'Build/Products/Debug-iphonesimulator/App.app');
  if (!fs.existsSync(app)) die('App.app missing');
  const feedInApp = path.join(app, 'public/feed.html');
  if (!fs.existsSync(feedInApp)) die('App.app/public/feed.html missing');
  const html = fs.readFileSync(feedInApp, 'utf8');
  const hasIsolatedInject = html.includes('window.LYANN_SUPABASE_URL') && html.includes(TEST_REF + '.supabase.co');
  const hasProdUrl = /https:\/\/gzispjfoywklpqatjyop\.supabase\.co/.test(html);
  if (!hasIsolatedInject || hasProdUrl || !html.includes('__LYANN_ISO_AB_CFG')) {
    die('installed bundle not isolated');
  }
  run('xcrun', ['simctl', 'uninstall', UDID, BUNDLE], { allowFail: true });
  run('xcrun', ['simctl', 'install', UDID, app], { label: 'simctl install' });
  run('xcrun', ['simctl', 'launch', UDID, BUNDLE], { label: 'simctl launch' });
  console.log('LAUNCHED');
  return app;
}

function macLanIp() {
  const res = spawnSync('ipconfig', ['getifaddr', 'en0'], { encoding: 'utf8' });
  return (res.stdout || '').trim() || '127.0.0.1';
}

function patchInfoPlistForLocalHttp() {
  const current = spawnSync('shasum', ['-a', '256', INFO_PLIST], { encoding: 'utf8' }).stdout.trim().split(/\s+/)[0];
  if (current !== INFO_PLIST_HASH) {
    die('Info.plist hash changed before ATS patch; refusing');
  }
  fs.copyFileSync(INFO_PLIST, INFO_PLIST_BACKUP);
  let plist = fs.readFileSync(INFO_PLIST, 'utf8');
  if (plist.includes('NSAppTransportSecurity')) return;
  plist = plist.replace(
    '</dict>\n</plist>',
    `	<key>NSAppTransportSecurity</key>
	<dict>
		<key>NSAllowsLocalNetworking</key>
		<true/>
	</dict>
</dict>
</plist>`
  );
  fs.writeFileSync(INFO_PLIST, plist);
  console.log('ATS_LOCAL_PATCHED');
}

function restoreInfoPlist() {
  if (fs.existsSync(INFO_PLIST_BACKUP)) {
    fs.copyFileSync(INFO_PLIST_BACKUP, INFO_PLIST);
  }
  const current = spawnSync('shasum', ['-a', '256', INFO_PLIST], { encoding: 'utf8' }).stdout.trim().split(/\s+/)[0];
  if (current !== INFO_PLIST_HASH) {
    die('Info.plist not restored to original hash');
  }
  console.log('ATS_RESTORED');
}

function startReportServer() {
  const box = { result: null, logs: [] };
  const server = http.createServer((req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers': 'content-type'
      });
      res.end();
      return;
    }
    if (req.method === 'POST' && req.url === '/iso-ab-report') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          box.logs.push(parsed);
          if (parsed.kind === 'LYANN_ISO_AB_RESULT') box.result = parsed.payload;
          console.log('REPORT', parsed.kind, parsed.payload && (parsed.payload.step || parsed.payload.verdict || ''));
        } catch (e) {}
        res.writeHead(200, {
          'content-type': 'application/json',
          'access-control-allow-origin': '*'
        });
        res.end('{"ok":true}');
      });
      return;
    }
    res.writeHead(404);
    res.end('missing');
  });
  server.listen(8097, '0.0.0.0');
  return { server, box };
}

function parseResult(logText) {
  const lines = String(logText || '').split(/\n/);
  let result = null;
  for (const line of lines) {
    const idx = line.indexOf('LYANN_ISO_AB_RESULT::');
    if (idx === -1) continue;
    const json = line.slice(idx + 'LYANN_ISO_AB_RESULT::'.length).trim();
    try {
      result = JSON.parse(json);
    } catch (e) {}
  }
  return result;
}

async function verifyDb(cfg, result) {
  const admin = createClient(cfg.url, cfg.service, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const old = {
    '6f7627bd-7efc-4f79-b1bf-aaa848882c55': '2026-09-20T04:24:18.704889+00:00|AGREED|50',
    '0d171f2f-0f79-4165-8d7c-d94aee02a957': '2026-09-20T04:25:08.497481+00:00|AGREED|50',
    'ccc61e3a-27ef-40b0-8cc2-1d351d1560bd': '2026-09-20T05:20:57.320957+00:00|AGREED|50',
    'd56a7e0c-9920-4aeb-8037-a6354f2aff76': '2026-09-20T05:23:39.933698+00:00|AGREED|50'
  };
  const { data: missions } = await admin
    .from('missions')
    .select('id,status,total_amount,updated_at,related_request_id')
    .order('created_at');
  const intact = Object.keys(old).every((id) => {
    const m = missions.find((x) => x.id === id);
    return m && `${m.updated_at}|${m.status}|${m.total_amount}` === old[id];
  });
  const { count: payments } = await admin.from('payments').select('*', { count: 'exact', head: true });
  let missionOk = false;
  if (result && result.ids && result.ids.mission_id) {
    const m = missions.find((x) => x.id === result.ids.mission_id);
    missionOk = !!(m && m.related_request_id === result.ids.request_id && Number(m.total_amount) === 12);
  }
  return { intact, payments, missionOk, missionCount: missions.length };
}

async function main() {
  const lines = readEnvLines();
  const activeUrl = active('SUPABASE_URL', lines);
  if (hostRef(activeUrl) === TEST_REF && active('LYANN_E2E_ALLOW_WRITES', lines) === '1') {
    // active env may still be production; we only use commented isolated keys
  }
  if (hostRef(activeUrl) === PROD_REF) {
    console.log('ACTIVE_ENV_PRODUCTION_OK_NOT_USED_FOR_ISO');
  }

  const cfg = {
    url: commented('LYANN_SUPABASE_URL', lines) || commented('SUPABASE_URL', lines),
    anon: commented('LYANN_SUPABASE_ANON_KEY', lines) || commented('SUPABASE_ANON_KEY', lines),
    service: commented('LYANN_SUPABASE_SERVICE_ROLE_KEY', lines) || commented('SUPABASE_SERVICE_ROLE_KEY', lines),
    emailA: commented('LYANN_E2E_QA_A_EMAIL', lines),
    passwordA: commented('LYANN_E2E_QA_A_PASSWORD', lines),
    emailB: commented('LYANN_E2E_QA_B_EMAIL', lines),
    passwordB: commented('LYANN_E2E_QA_B_PASSWORD', lines)
  };

  if (hostRef(cfg.url) !== TEST_REF || jwtRef(cfg.anon) !== TEST_REF || jwtRef(cfg.service) !== TEST_REF) {
    die('isolated keys invalid');
  }
  if ([cfg.url, cfg.anon, cfg.service].some((v) => String(v).includes(PROD_REF))) {
    die('production key leaked into isolated cfg');
  }

  const lan = macLanIp();
  cfg.reportHosts = [
    'http://127.0.0.1:8097',
    'http://' + lan + ':8097'
  ];
  console.log('REPORT_HOSTS', cfg.reportHosts.join(','));

  fs.mkdirSync(path.dirname(RESULT_FILE), { recursive: true });
  let reportServer = null;
  let restored = false;
  let infoPatched = false;
  try {
    patchInfoPlistForLocalHttp();
    infoPatched = true;
    reportServer = startReportServer();
    injectIsolatedBundle(cfg);
    buildInstallLaunch();

    let result = null;
    const started = Date.now();
    const deadline = started + 240000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 2500));
      const candidate = reportServer.box.result;
      if (candidate && candidate.verdict === 'PASS') {
        result = candidate;
        break;
      }
      if (candidate && candidate.verdict === 'FAIL' && candidate.ids && candidate.ids.mission_id) {
        result = candidate;
        break;
      }
      if (candidate && candidate.verdict === 'FAIL' && (candidate.retryCount >= 6 || (Date.now() - started > 180000))) {
        result = candidate;
        break;
      }
      const last = reportServer.box.logs[reportServer.box.logs.length - 1];
      console.log(
        'WAIT_HARNESS',
        Math.round((Date.now() - started) / 1000) + 's',
        'logs',
        reportServer.box.logs.length,
        last && last.payload && (last.payload.step || last.payload.verdict) || ''
      );
    }
    if (!result && reportServer.box.result) result = reportServer.box.result;

    run('xcrun', ['simctl', 'io', UDID, 'screenshot', ARTIFACT], { allowFail: true });

    if (!result) {
      fs.writeFileSync(RESULT_FILE, JSON.stringify({
        verdict: 'FAIL',
        error: 'no_harness_result',
        logs: reportServer.box.logs.slice(-20)
      }, null, 2));
      die('harness produced no LYANN_ISO_AB_RESULT');
    }

    const db = await verifyDb(cfg, result);
    result.db = db;
    fs.writeFileSync(RESULT_FILE, JSON.stringify(result, null, 2));
    console.log('RESULT', JSON.stringify({
      verdict: result.verdict,
      runtimeUrl: result.runtimeUrl,
      ids: result.ids,
      steps: Object.fromEntries(Object.entries(result.steps || {}).map(([k, v]) => [k, v.status])),
      db
    }, null, 2));

    restoreProductionBundle();
    restoreInfoPlist();
    infoPatched = false;
    restored = true;
    run(
      'xcodebuild',
      [
        '-project', 'ios/App/App.xcodeproj',
        '-scheme', 'App',
        '-configuration', 'Debug',
        '-destination', 'id=' + UDID,
        '-derivedDataPath', DERIVED,
        'build'
      ],
      { label: 'xcodebuild restore', timeout: 420000 }
    );
    const app2 = path.join(DERIVED, 'Build/Products/Debug-iphonesimulator/App.app');
    const feed2 = fs.readFileSync(path.join(app2, 'public/feed.html'), 'utf8');
    if (feed2.includes(TEST_REF) || feed2.includes('__LYANN_ISO_AB_CFG')) {
      die('restored App.app still isolated');
    }
    run('xcrun', ['simctl', 'install', UDID, app2], { label: 'simctl reinstall restored' });
    run('xcrun', ['simctl', 'launch', UDID, BUNDLE], { allowFail: true });
    console.log('DONE_IOS_AB');
    if (result.verdict !== 'PASS' || !db.intact || !db.missionOk) process.exit(2);
  } catch (err) {
    if (!restored) {
      try { restoreProductionBundle(); } catch (e) { console.error('RESTORE_FAIL', e.message); }
    }
    if (infoPatched) {
      try { restoreInfoPlist(); } catch (e) { console.error('INFO_RESTORE_FAIL', e.message); }
    }
    throw err;
  } finally {
    if (reportServer && reportServer.server) {
      try { reportServer.server.close(); } catch (e) {}
    }
  }
}

main().catch((err) => {
  console.error('FAIL', err && err.message ? err.message : err);
  process.exit(1);
});
