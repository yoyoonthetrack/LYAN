const fs = require('fs');

const feedPath = 'feed.html';
const chatPath = 'chat-logic.js';
let feed = fs.readFileSync(feedPath, 'utf8');
let chat = fs.readFileSync(chatPath, 'utf8');

// --- Milestone form: percentage + amount side by side ---
feed = feed.replace(
  'Jalons de paiement (Répartition en %)',
  'Jalons de paiement (pourcentage ou montant)'
);

for (let i = 1; i <= 3; i++) {
  const percentId = `mdJ${i}Percent`;
  const amountId = `mdJ${i}Amount`;
  if (!feed.includes(`id="${amountId}"`)) {
    const percentPattern = new RegExp(`(<input[^>]*id="${percentId}"[^>]*)(\\srequired)?([^>]*>)(\\s*<span[^>]*>%<\\/span>)`);
    feed = feed.replace(percentPattern, (m, before, required, after, percentSpan) => {
      const normalizedBefore = before.replace(/min="10"/g, 'min="0"').replace(/max="80"/g, 'max="100"');
      return `${normalizedBefore}${after}${percentSpan}\n                                    <input type="number" id="${amountId}" class="modal-input" placeholder="0,00" min="0" step="0.01" inputmode="decimal" aria-label="Montant du jalon ${i}" style="flex: 1.25; font-size: 0.8rem; height: 32px; padding: 2px 8px;">\n                                    <span style="font-size: 0.8rem;">€</span>`;
    });
  }
}

if (!feed.includes('id="mdAllocationSummary"')) {
  const thirdRowPattern = /(<div[^>]*style="display: flex; gap: 10px; align-items: center; margin-bottom: 8px;">[\s\S]*?id="mdJ3Percent"[\s\S]*?<\/div>)/;
  feed = feed.replace(thirdRowPattern, `$1\n                                <div id="mdAllocationSummary" style="margin-top: 10px; padding: 10px 12px; border-radius: 12px; background: #F8FAFC; border: 1px solid #E2E8F0; font-size: 0.78rem; color: #475569; line-height: 1.45;">\n                                    <div style="display:flex; justify-content:space-between; gap:12px;"><span>Répartition</span><strong id="mdAllocationPercentTotal">0 %</strong></div>\n                                    <div style="display:flex; justify-content:space-between; gap:12px;"><span>Montant réparti</span><strong id="mdAllocationAmountTotal">0,00 €</strong></div>\n                                    <div style="display:flex; justify-content:space-between; gap:12px;"><span>Reste à répartir</span><strong id="mdAllocationRemaining">—</strong></div>\n                                </div>`);
}

// --- Shared synchronisation logic ---
if (!chat.includes('function initMilestoneAllocationSync()')) {
  const submitAnchor = '    // SUBMIT MILESTONE DEVIS\n';
  const helper = `    // Milestone allocation: percentage <-> amount, always reconciled to total.\n    function initMilestoneAllocationSync() {\n        const totalInput = document.getElementById('mdTotalAmount');\n        if (!totalInput || totalInput.dataset.allocationSyncBound === 'true') return;\n        totalInput.dataset.allocationSyncBound = 'true';\n\n        const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;\n        const roundPercent = (value) => Math.round((Number(value) || 0) * 100) / 100;\n        const getTotal = () => Math.max(0, parseFloat(totalInput.value) || 0);\n\n        const updateSummary = () => {\n            const total = getTotal();\n            let amountSum = 0;\n            let percentSum = 0;\n            for (let i = 1; i <= 3; i++) {\n                amountSum += Math.max(0, parseFloat(document.getElementById('mdJ' + i + 'Amount')?.value) || 0);\n                percentSum += Math.max(0, parseFloat(document.getElementById('mdJ' + i + 'Percent')?.value) || 0);\n            }\n            amountSum = roundMoney(amountSum);\n            percentSum = roundPercent(percentSum);\n            const remaining = roundMoney(total - amountSum);\n            const pctEl = document.getElementById('mdAllocationPercentTotal');\n            const amtEl = document.getElementById('mdAllocationAmountTotal');\n            const remEl = document.getElementById('mdAllocationRemaining');\n            if (pctEl) pctEl.textContent = percentSum.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' %';\n            if (amtEl) amtEl.textContent = amountSum.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';\n            if (remEl) {\n                remEl.textContent = remaining.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';\n                remEl.style.color = Math.abs(remaining) <= 0.01 ? 'var(--primary)' : (remaining < 0 ? '#B91C1C' : '#475569');\n            }\n        };\n\n        const syncFromPercent = (index) => {\n            const total = getTotal();\n            const pct = Math.min(100, Math.max(0, parseFloat(document.getElementById('mdJ' + index + 'Percent')?.value) || 0));\n            const amountInput = document.getElementById('mdJ' + index + 'Amount');\n            if (amountInput) amountInput.value = total > 0 ? roundMoney(total * pct / 100).toFixed(2) : '';\n            updateSummary();\n        };\n\n        const syncFromAmount = (index) => {\n            const total = getTotal();\n            const amount = Math.max(0, parseFloat(document.getElementById('mdJ' + index + 'Amount')?.value) || 0);\n            const pctInput = document.getElementById('mdJ' + index + 'Percent');\n            if (pctInput) pctInput.value = total > 0 ? String(roundPercent(amount / total * 100)) : '';\n            updateSummary();\n        };\n\n        for (let i = 1; i <= 3; i++) {\n            const pctInput = document.getElementById('mdJ' + i + 'Percent');\n            const amountInput = document.getElementById('mdJ' + i + 'Amount');\n            if (pctInput) {\n                pctInput.step = '0.01';\n                pctInput.min = '0';\n                pctInput.max = '100';\n                pctInput.removeAttribute('required');\n                pctInput.addEventListener('input', () => syncFromPercent(i));\n            }\n            if (amountInput) amountInput.addEventListener('input', () => syncFromAmount(i));\n        }\n\n        totalInput.addEventListener('input', () => {\n            for (let i = 1; i <= 3; i++) {\n                const pctInput = document.getElementById('mdJ' + i + 'Percent');\n                if (pctInput && pctInput.value !== '') syncFromPercent(i);\n            }\n            updateSummary();\n        });\n        updateSummary();\n    }\n\n    initMilestoneAllocationSync();\n\n`;
  if (!chat.includes(submitAnchor)) throw new Error('Milestone submit anchor not found');
  chat = chat.replace(submitAnchor, helper + submitAnchor);
}

// Replace legacy percent-only extraction and amount calculation with dual-source reconciliation.
const legacyExtraction = `                const p1 = parseInt(document.getElementById('mdJ1Percent')?.value) || 0;\n                const p2 = parseInt(document.getElementById('mdJ2Percent')?.value) || 0;\n                const p3 = parseInt(document.getElementById('mdJ3Percent')?.value) || 0;`;
const dualExtraction = `                const rawAmounts = [1, 2, 3].map(i => Math.max(0, parseFloat(document.getElementById('mdJ' + i + 'Amount')?.value) || 0));\n                const rawPercents = [1, 2, 3].map(i => Math.max(0, parseFloat(document.getElementById('mdJ' + i + 'Percent')?.value) || 0));\n                const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;\n                const roundPercent = (value) => Math.round((Number(value) || 0) * 100) / 100;\n\n                const amounts = rawAmounts.map((amount, idx) => amount > 0 ? roundMoney(amount) : roundMoney(total * rawPercents[idx] / 100));\n                const percents = amounts.map(amount => total > 0 ? roundPercent(amount / total * 100) : 0);\n                const [p1, p2, p3] = percents;`;
if (chat.includes(legacyExtraction)) chat = chat.replace(legacyExtraction, dualExtraction);

const legacyAmounts = `                // Calcul atomique des montants de jalons\n                const m1 = Math.round(total * (p1 / 100) * 100) / 100;\n                const m2 = Math.round(total * (p2 / 100) * 100) / 100;\n                const m3 = Math.round((total - m1 - m2) * 100) / 100;`;
const dualAmounts = `                // Montants et pourcentages restent synchronisés quelle que soit l'unité saisie.\n                const [m1, m2, m3] = amounts;\n                const allocatedTotal = roundMoney(m1 + m2 + m3);\n                if (Math.abs(allocatedTotal - total) > 0.01) {\n                    const msg = 'La somme des jalons doit correspondre au montant total (' + total.toFixed(2) + ' €). Montant actuellement réparti : ' + allocatedTotal.toFixed(2) + ' €.';\n                    if (window.lyannAlert) window.lyannAlert(msg);\n                    else alert(msg);\n                    return;\n                }`;
if (chat.includes(legacyAmounts)) chat = chat.replace(legacyAmounts, dualAmounts);

fs.writeFileSync(feedPath, feed);
fs.writeFileSync(chatPath, chat);
console.log('Milestone allocation normalized: percentage and amount are bidirectionally synchronized.');
