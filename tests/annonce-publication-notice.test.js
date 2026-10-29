'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const test = require('node:test');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
const wizardAt = source.indexOf('WIZARD : BESOIN');
const feed = source.slice(0, wizardAt);
const wizard = source.slice(wizardAt);

test('the publication notice is available outside the feed scope', () => {
    assert.ok(wizardAt > 0);
    assert.match(feed, /window\.showPublicationNotice = showPublicationNotice/);
    assert.match(feed, /showPublicationNotice\(\{/);
    assert.equal(wizard.match(/(?<![\w.])showPublicationNotice\s*\(/), null);
    assert.match(wizard, /window\.showPublicationNotice\(/);
    const confirmAt = wizard.indexOf('Annonce enregistrée, confirmation interrompue');
    assert.ok(confirmAt > 0);
    assert.equal((wizard.match(/Erreur lors de la publication/g) || []).length, 2);
    assert.equal(wizard.slice(confirmAt).includes('Erreur lors de la publication'), false);
    assert.match(wizard, /dataset\.publishing === '1'/);
});

function staticServer() {
    const types = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.webp': 'image/webp',
        '.json': 'application/json'
    };
    return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
            const url = new URL(req.url, 'http://127.0.0.1');
            const filePath = path.normalize(path.join(root, decodeURIComponent(url.pathname)));
            if (!filePath.startsWith(root)) {
                res.writeHead(403);
                res.end();
                return;
            }
            fs.readFile(filePath, (err, body) => {
                if (err) {
                    res.writeHead(404);
                    res.end();
                    return;
                }
                res.writeHead(200, { 'Content-Type': types[path.extname(filePath)] || 'application/octet-stream' });
                res.end(body);
            });
        });
        server.listen(0, '127.0.0.1', () => resolve(server));
    });
}

async function publishFromSummary(page, { noticeThrows = false, holdCreate = false } = {}) {
    await page.evaluate(({ noticeThrows, holdCreate }) => {
        window.__publishCalls = 0;
        window.__createRelease = null;
        window.LYANN_AUTH_STATE = window.LYANN_AUTH_STATE || {};
        window.LYANN_AUTH_STATE.isAuthenticated = () => true;
        window.LYANN_AUTH_STATE.getSnapshot = () => ({ status: 'ready', userId: 'qa-member' });
        window.LYANN_ROUTER = window.LYANN_ROUTER || {};
        window.LYANN_ROUTER.requireAuthForInteraction = async () => true;
        window.LYANN_API_CLIENT = window.LYANN_API_CLIENT || {};
        window.LYANN_API_CLIENT.getCurrentUser = async () => ({ id: 'qa-member' });
        window.LYANN_API_CLIENT.suggestRequestTitles = async () => ({ titles: [] });
        window.LYANN_API_CLIENT.createRequest = (payload) => {
            window.__publishCalls += 1;
            const row = {
                id: 'req-notice',
                title: payload.title,
                description: payload.description,
                category: payload.category,
                location: payload.location,
                status: 'OPEN',
                budget: null,
                public_moderation_status: 'pending'
            };
            if (!holdCreate) return Promise.resolve(row);
            return new Promise((resolve) => { window.__createRelease = () => resolve(row); });
        };
        window.LyanAI = window.LyanAI || {};
        window.LyanAI.classifyNeed = async () => ({
            classification_status: 'CLASSIFIED',
            category: 'Menuiserie',
            subcategory: 'Terrasse',
            title: 'Terrasse en bois'
        });
        window.LyanAI.fetchTaxonomyFromDB = async () => [];
        window.syncWizardTaxonomyDropdowns = async () => {};
        if (typeof window.escapeSearchHtml !== 'function') window.escapeSearchHtml = (value) => String(value ?? '');
        if (typeof window.escapeHtmlAttr !== 'function') window.escapeHtmlAttr = (value) => String(value ?? '');
        if (noticeThrows) {
            window.showPublicationNotice = () => { throw new Error('notice down'); };
        }
    }, { noticeThrows, holdCreate });

    await page.evaluate(() => window.openLyannWizard());
    await page.locator('#wizardDescInput').fill('Besoin d aide pour poser une terrasse en bois dans le jardin.');
    await page.locator('#wizardBtnNext').click();
    await page.waitForFunction(() => {
        const step = document.querySelector('.wizard-step[data-step="2"]');
        return step && step.style.display === 'block';
    });
    await page.evaluate(() => {
        const input = document.getElementById('wizardTitleInput');
        input.value = 'Terrasse en bois de test';
        const block = document.getElementById('wizardTitleBlock');
        const edit = document.getElementById('wizardTitleEdit');
        if (block) block.hidden = false;
        if (edit) edit.hidden = false;
    });
    for (let step = 0; step < 3; step += 1) {
        await page.locator('#wizardBtnNext').click();
    }
    await page.locator('.wizard-step[data-step="6"]').waitFor({ state: 'visible' });
    const summary = await page.locator('#modal-request-help h4').filter({ hasText: 'Résumé de votre demande' }).textContent();
    assert.match(summary, /^5\./);

    if (holdCreate) {
        await page.evaluate(() => {
            const button = document.getElementById('wizardBtnSubmit');
            button.click();
            button.click();
        });
        await page.waitForFunction(() => window.__publishCalls === 1);
        await page.evaluate(() => window.__createRelease());
    } else {
        await page.locator('#wizardBtnSubmit').click();
    }
    await page.locator('#modal-request-help').getByText('Votre Lyann est publié').waitFor();
    const calls = await page.evaluate(() => window.__publishCalls);
    assert.equal(calls, 1);
}

test('publishing an announcement confirms the saved request on desktop and mobile', { timeout: 120000 }, async () => {
    const server = await staticServer();
    const origin = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch({ headless: true });
    const errors = [];
    try {
        for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
            const page = await browser.newPage({ viewport });
            page.on('pageerror', (err) => errors.push(err.message));
            page.on('dialog', (dialog) => dialog.accept());
            await page.goto(`${origin}/results.html?mode=annonces`, { waitUntil: 'domcontentloaded' });
            await page.waitForFunction(() => typeof window.openLyannWizard === 'function' && typeof window.showPublicationNotice === 'function');
            await publishFromSummary(page);
            await page.close();
        }
        const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
        page.on('pageerror', (err) => errors.push(err.message));
        page.on('dialog', (dialog) => dialog.accept());
        await page.goto(`${origin}/results.html?mode=annonces`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => typeof window.showPublicationNotice === 'function');
        await publishFromSummary(page, { noticeThrows: true, holdCreate: true });
        const body = await page.locator('#modal-request-help').innerText();
        assert.match(body, /Votre Lyann est publié/);
        assert.doesNotMatch(body, /Erreur lors de la publication/);
        await page.close();
    } finally {
        await browser.close();
        await new Promise((resolve) => server.close(resolve));
    }
    assert.equal(errors.filter((message) => /showPublicationNotice/.test(message)).join('\n'), '');
});
