const fs = require('fs');

const feedPath = 'feed.html';
let feed = fs.readFileSync(feedPath, 'utf8');

const startMarker = '<label style="font-size: 0.78rem; font-weight: 700; display: block; margin-bottom: 8px; color: var(--primary-dark);">Jalons de paiement';
const start = feed.indexOf(startMarker);
if (start === -1) {
  if (feed.includes('class="milestone-allocation-section"')) {
    console.log('Milestone layout already normalized.');
    process.exit(0);
  }
  throw new Error('Milestone allocation section start not found');
}

const endNeedle = '<p style="font-size: 0.72rem; color: var(--text-muted); margin-top: 5px;"><i class="ph ph-info"></i> Le total des jalons doit faire 100%.</p>';
const endStart = feed.indexOf(endNeedle, start);
if (endStart === -1) throw new Error('Milestone allocation section end not found');
const end = endStart + endNeedle.length;

const field = (i, titlePlaceholder) => `
                                <div class="milestone-allocation-card" style="width:100%; box-sizing:border-box; padding:12px; border:1px solid #E6E1D9; border-radius:14px; background:#FFFFFF; display:flex; flex-direction:column; gap:10px;">
                                    <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
                                        <strong style="font-size:0.78rem; color:var(--primary-dark);">Jalon ${i}</strong>
                                        <span style="font-size:0.7rem; color:var(--text-muted);">% ↔ €</span>
                                    </div>
                                    <input type="text" id="mdJ${i}Title" class="modal-input" placeholder="${titlePlaceholder}" required style="width:100%; box-sizing:border-box; font-size:0.82rem; height:38px; padding:6px 10px;">
                                    <div style="display:grid; grid-template-columns:minmax(0,1fr) 26px minmax(0,1fr); align-items:end; gap:8px; width:100%;">
                                        <label style="display:flex; flex-direction:column; gap:4px; min-width:0; font-size:0.68rem; font-weight:700; color:#64748B;">
                                            Pourcentage
                                            <div style="display:flex; align-items:center; gap:6px; min-width:0;">
                                                <input type="number" id="mdJ${i}Percent" class="modal-input" placeholder="${i === 1 ? '30' : i === 2 ? '40' : '30'}" min="0" max="100" step="0.01" inputmode="decimal" aria-label="Pourcentage du jalon ${i}" style="width:100%; min-width:0; box-sizing:border-box; font-size:0.82rem; height:38px; padding:6px 10px;">
                                                <span style="font-size:0.78rem; font-weight:700; color:#475569;">%</span>
                                            </div>
                                        </label>
                                        <span aria-hidden="true" style="height:38px; display:flex; align-items:center; justify-content:center; color:#94A3B8; font-weight:800;">↔</span>
                                        <label style="display:flex; flex-direction:column; gap:4px; min-width:0; font-size:0.68rem; font-weight:700; color:#64748B;">
                                            Montant
                                            <div style="display:flex; align-items:center; gap:6px; min-width:0;">
                                                <input type="number" id="mdJ${i}Amount" class="modal-input" placeholder="0,00" min="0" step="0.01" inputmode="decimal" aria-label="Montant du jalon ${i}" style="width:100%; min-width:0; box-sizing:border-box; font-size:0.82rem; height:38px; padding:6px 10px;">
                                                <span style="font-size:0.78rem; font-weight:700; color:#475569;">€</span>
                                            </div>
                                        </label>
                                    </div>
                                </div>`;

const replacement = `<div class="milestone-allocation-section" style="width:100%; max-width:520px; margin:0 auto; display:flex; flex-direction:column; gap:10px; box-sizing:border-box;">
                                <div style="display:flex; align-items:flex-end; justify-content:space-between; gap:12px;">
                                    <div>
                                        <label style="font-size:0.8rem; font-weight:800; display:block; color:var(--primary-dark);">Jalons de paiement</label>
                                        <span style="font-size:0.7rem; color:var(--text-muted);">Saisissez le pourcentage ou le montant : l’autre valeur se calcule automatiquement.</span>
                                    </div>
                                </div>
${field(1, 'Titre (ex: Préparation)')}
${field(2, 'Titre (ex: Gros oeuvre)')}
${field(3, 'Titre (ex: Finitions)')}
                                <div id="mdAllocationSummary" style="width:100%; box-sizing:border-box; margin-top:2px; padding:10px 12px; border-radius:12px; background:#F8FAFC; border:1px solid #E2E8F0; font-size:0.76rem; color:#475569; line-height:1.45;">
                                    <div style="display:flex; justify-content:space-between; gap:12px;"><span>Répartition</span><strong id="mdAllocationPercentTotal">0 %</strong></div>
                                    <div style="display:flex; justify-content:space-between; gap:12px;"><span>Montant réparti</span><strong id="mdAllocationAmountTotal">0,00 €</strong></div>
                                    <div style="display:flex; justify-content:space-between; gap:12px;"><span>Reste à répartir</span><strong id="mdAllocationRemaining">—</strong></div>
                                </div>
                                <p style="font-size:0.72rem; color:var(--text-muted); margin:0;"><i class="ph ph-info"></i> La répartition doit correspondre à 100 % du montant total.</p>
                            </div>`;

feed = feed.slice(0, start) + replacement + feed.slice(end);

// Center the detailed quote form in the right-hand chat pane while keeping it responsive.
feed = feed.replace(
  '<form id="milestoneDevisForm" style="padding: 20px; display: flex; flex-direction: column; gap: 10px; max-height: 380px; overflow-y: auto;">',
  '<form id="milestoneDevisForm" style="width:100%; max-width:560px; margin:0 auto; padding:20px 24px 24px; box-sizing:border-box; display:flex; flex-direction:column; gap:10px; max-height:420px; overflow-y:auto;">'
);

fs.writeFileSync(feedPath, feed);
console.log('Milestone layout normalized: centered cards with visible percentage and amount fields.');
