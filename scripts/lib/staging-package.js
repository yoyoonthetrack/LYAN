'use strict';
// Selection and export of the Staging Preview package (Phase 3.2C-6). Development / release machine only:
// it is NOT shipped to Vercel (nothing requires it from the build or from a function).
//
// The package is exported from a COMMIT with `git archive`, so ignored, untracked or locally modified files
// can never be uploaded. The selection is rule-based (config/staging-preview-package.json) and checked:
//   - every file reachable from the pages and from the two functions must be in the package (closure);
//   - nothing forbidden may be in the package;
//   - every required resource must be present.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const integrity = require('./package-integrity');

const RULES_FILE = path.join('config', 'staging-preview-package.json');
const REFERENCED = /[A-Za-z0-9_@./\-]+\.(?:js|css|png|jpg|jpeg|webp|svg|gif|mp4|webm|woff2?|json|ico|mp3|wav|html|pbf|txt|webmanifest|ttf)\b/g;
const TEXT = /\.(html|js|css|json|webmanifest)$/;
// A bare file name found in a script is only trusted for these locations (build comments mention many tools).
const TOKEN_ALLOWED = /^(?:[^/]+\.(?:js|css|html|json|png|jpg|jpeg|webp|svg|gif|mp4|ico)|assets\/.+|vendor\/.+|sounds\/.+|config\/.+|api\/.+)$/;

function loadRules(root) {
    return JSON.parse(fs.readFileSync(path.join(root, RULES_FILE), 'utf8'));
}

/** Files reachable from the HTML pages, the two functions and the build entry (require() and quoted file names). */
function computeClosure(root, files, rules) {
    const known = new Set(files);
    const seeds = [
        ...files.filter((f) => !f.includes('/') && f.endsWith('.html')),
        ...rules.entryPoints,
        ...rules.functionIncludeFiles,
        rules.buildEntry
    ].filter((f) => known.has(f));
    const closure = new Set(seeds);
    const queue = [...seeds];
    const add = (file, why) => { if (known.has(file) && !closure.has(file)) { closure.add(file); queue.push(file); } return why; };
    while (queue.length) {
        const file = queue.pop();
        if (!TEXT.test(file)) continue;
        const dir = path.posix.dirname(file);
        // Comments are NOT stripped: a naive stripper swallows code after strings such as '/v1/*'. Over-including is safe, missing a file is not.
        const text = fs.readFileSync(path.join(root, file), 'utf8');
        if (file.endsWith('.js')) {
            for (const m of text.matchAll(/require\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g)) {
                const base = path.posix.normalize(path.posix.join(dir, m[1]));
                for (const candidate of [base, `${base}.js`, `${base}.json`, `${base}/index.js`]) add(candidate);
            }
        }
        for (const m of text.matchAll(REFERENCED)) {
            const token = m[0].replace(/^\.?\/+/, '');
            const candidates = [path.posix.normalize(path.posix.join(dir, token))];
            if (!file.startsWith('api/')) candidates.push(token);
            for (const candidate of candidates) if (TOKEN_ALLOWED.test(candidate)) add(candidate);
        }
    }
    return closure;
}

/** The package file list for a directory holding the exported commit. */
function selectPackage(root, rules = loadRules(root)) {
    const files = integrity.walk(root);
    const closure = computeClosure(root, files, rules);
    const forbidden = rules.forbiddenPatterns.map((p) => new RegExp(p));
    const excluded = new Set(rules.excludePaths);
    const selected = new Map();
    const reasons = new Map();
    const take = (file, why) => { if (!selected.has(file)) selected.set(file, why); };
    for (const file of files) {
        const ext = path.posix.extname(file).slice(1).toLowerCase();
        const topLevel = !file.includes('/');
        if (topLevel && rules.rootAlways.includes(ext)) take(file, 'page-ou-style');
        else if (topLevel && rules.rootMedia.includes(ext)) take(file, 'image-racine');
        else if (rules.includeDirs.some((d) => file.startsWith(`${d}/`))) take(file, 'ressource-statique');
        else if (rules.includeFiles.includes(file)) take(file, 'configuration-deploiement');
        else if (closure.has(file)) take(file, file.startsWith('api/') ? 'fonction-serveur' : 'code-reference');
    }
    for (const file of files) {
        if (excluded.has(file)) { selected.delete(file); reasons.set(file, 'exclu-explicitement'); }
        else if (forbidden.some((re) => re.test(file))) { selected.delete(file); reasons.set(file, 'interdit'); }
        else if (!selected.has(file)) reasons.set(file, 'non-reference');
    }
    return { files, closure, selected: [...selected.keys()].sort(), reasons, categories: selected };
}

/** Throws with every violated rule. Used by the exporter and by the tests. */
function checkPackage(root, pkg, rules = loadRules(root)) {
    const problems = [];
    const set = new Set(pkg.selected);
    const forbidden = rules.forbiddenPatterns.map((p) => new RegExp(p));
    for (const file of pkg.selected) if (forbidden.some((re) => re.test(file))) problems.push(`interdit dans le paquet : ${file}`);
    for (const file of rules.requiredResources) if (!set.has(file)) problems.push(`ressource indispensable absente : ${file}`);
    for (const file of pkg.closure) {
        if (!set.has(file) && !rules.excludePaths.includes(file) && !forbidden.some((re) => re.test(file))) problems.push(`référencé mais hors paquet : ${file}`);
    }
    for (const file of pkg.selected) {
        if (file.startsWith('scripts/') && !pkg.closure.has(file)) problems.push(`script hors fermeture : ${file}`);
    }
    return problems;
}

function git(root, ...args) {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 }).trim();
}

function exportCommit(repo, commit, dest) {
    fs.mkdirSync(dest, { recursive: true });
    const archive = path.join(os.tmpdir(), `lyann-export-${process.pid}-${Date.now()}.tar`);
    try {
        execFileSync('git', ['archive', '--format=tar', `--output=${archive}`, commit], { cwd: repo });
        execFileSync('tar', ['-xf', archive, '-C', dest]);
    } finally {
        fs.rmSync(archive, { force: true });
    }
}

/**
 * Builds <outDir>/package (what Vercel receives) from <commit>, plus <outDir>/evidence/*.
 * Returns { commit, manifestSha256, fileCount, packageDir, exclusions }.
 */
function buildPackage({ repo, commit, outDir }) {
    const full = git(repo, 'rev-parse', '--verify', `${commit}^{commit}`);
    const exportDir = path.join(outDir, 'commit-export');
    const packageDir = path.join(outDir, 'package');
    fs.rmSync(outDir, { recursive: true, force: true });
    exportCommit(repo, full, exportDir);
    const rules = loadRules(exportDir);
    const pkg = selectPackage(exportDir, rules);
    const problems = checkPackage(exportDir, pkg, rules);
    if (problems.length) throw new Error(`Paquet invalide :\n  - ${problems.join('\n  - ')}`);
    for (const file of pkg.selected) {
        const target = path.join(packageDir, file);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(path.join(exportDir, file), target);
        fs.chmodSync(target, 0o644);
    }
    const lines = integrity.manifestLines(packageDir, pkg.selected);
    const manifestSha256 = integrity.manifestSha256(lines);
    const info = { schema: 1, commit: full, fileCount: pkg.selected.length, manifestSha256 };
    fs.writeFileSync(path.join(packageDir, integrity.PACKAGE_INFO), `${JSON.stringify(info, null, 2)}\n`);
    integrity.verifyPackage(packageDir, full);
    const evidence = path.join(outDir, 'evidence');
    fs.mkdirSync(evidence, { recursive: true });
    fs.writeFileSync(path.join(evidence, 'package-manifest.sha256'), `${lines.join('\n')}\n`);
    const exclusions = pkg.files.filter((f) => !pkg.categories.has(f)).map((f) => `${pkg.reasons.get(f)}\t${f}`).sort();
    fs.writeFileSync(path.join(evidence, 'excluded-from-commit.tsv'), `raison\tchemin\n${exclusions.join('\n')}\n`);
    fs.writeFileSync(path.join(evidence, 'package-categories.tsv'), `categorie\tchemin\n${pkg.selected.map((f) => `${pkg.categories.get(f)}\t${f}`).join('\n')}\n`);
    fs.rmSync(exportDir, { recursive: true, force: true });
    return { ...info, packageDir, evidenceDir: evidence, exclusions: exclusions.length, selected: pkg.selected };
}

module.exports = { loadRules, computeClosure, selectPackage, checkPackage, exportCommit, buildPackage };
