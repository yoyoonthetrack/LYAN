/**
 * TEST SUITE DE NON-RÉGRESSION ET PARITÉ MULTI-PLATEFORMES LYANN
 * Valide automatiquement l'intégrité des fichiers, formulaires, rôles transactionnels et modales.
 */

const fs = require('fs');
const path = require('path');

let errors = 0;
let passes = 0;

function assert(condition, message) {
    if (condition) {
        console.log(`  ✅ PASS: ${message}`);
        passes++;
    } else {
        console.error(`  ❌ FAIL: ${message}`);
        errors++;
    }
}

console.log("\n=======================================================");
console.log("🧪 LYANN INTEGRITY & NON-REGRESSION AUDIT SUITE");
console.log("=======================================================\n");

// 1. Audit Structure HTML & Modales
const htmlFiles = ['index.html', 'feed.html', 'results.html', 'how-it-works.html', 'about.html', 'pricing.html', 'payment-portal.html'];
const requiredModals = ['modal-request-help', 'loginModal', 'onboardingModal', 'bookingModal', 'userAccountModal', 'quickProfileModal', 'chatModal'];
const requiredScripts = ['notifications-service.js', 'dialog.js', 'api-client.js', 'ai-classifier.js', 'script.js', 'onboarding.js', 'chat-logic.js', 'payment-script.js'];

console.log("1. Checking HTML Pages, Required Modals & Scripts:");
htmlFiles.forEach(file => {
    if (!fs.existsSync(file)) {
        assert(false, `File ${file} exists`);
        return;
    }
    const content = fs.readFileSync(file, 'utf8');
    
    // Check modals
    requiredModals.forEach(modal => {
        assert(content.includes(`id="${modal}"`), `${file} contains modal #${modal}`);
    });

    // Check scripts
    requiredScripts.forEach(script => {
        assert(content.includes(`src="${script}"`), `${file} includes script ${script}`);
    });
});

// 2. Audit JavaScript Core Engine
console.log("\n2. Checking JavaScript Core Engine Files:");
const jsFiles = ['script.js', 'api-client.js', 'ai-classifier.js', 'chat-logic.js', 'onboarding.js', 'payment-script.js', 'notifications-service.js', 'dialog.js'];
jsFiles.forEach(file => {
    assert(fs.existsSync(file), `JS engine script ${file} exists`);
    const content = fs.readFileSync(file, 'utf8');
    assert(content.length > 500, `JS engine script ${file} is non-empty (${content.length} bytes)`);
});

// 3. Audit Taxonomy & Territory Communes
console.log("\n3. Checking Taxonomy & Territory Communes (Guadeloupe 971 / DOM):");
const scriptContent = fs.readFileSync('script.js', 'utf8');
assert(scriptContent.includes('TERRITORY_CITIES'), 'TERRITORY_CITIES taxonomy map defined');
assert(scriptContent.includes('Les Abymes') && scriptContent.includes('Baie-Mahault') && scriptContent.includes('Le Gosier'), 'Guadeloupe communes present');

// 4. Audit Transactional Role Engine (Demandeur vs Prestataire)
console.log("\n4. Checking Transactional Role Engine (api-client.js):");
const apiClientContent = fs.readFileSync('api-client.js', 'utf8');
assert(apiClientContent.includes('getAvailableMissionActions'), 'getAvailableMissionActions function present');
assert(apiClientContent.includes('isRequester') && apiClientContent.includes('isHelper'), 'Role context evaluation (isRequester vs isHelper) implemented');
assert(apiClientContent.includes('MAKE_PROPOSAL') && apiClientContent.includes('ACCEPT_PRICE') && apiClientContent.includes('PAY_MISSION') && apiClientContent.includes('MARK_DONE'), 'Full state machine actions present');

// 5. Final Summary
console.log("\n=======================================================");
console.log(`📊 TEST AUDIT SUMMARY: ${passes} PASSED, ${errors} FAILED`);
console.log("=======================================================\n");

if (errors > 0) {
    process.exit(1);
} else {
    process.exit(0);
}
