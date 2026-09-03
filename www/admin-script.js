/* ==========================================================================
   LYANN DOM — ENTERPRISE BACK-OFFICE ADMIN ENGINE
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    // --------------------------------------------------------------------------
    // 0. ACTIVE ADMIN USER SESSION & RBAC PERMISSIONS ENGINE
    // --------------------------------------------------------------------------
    window.currentAdminUser = {
        username: 'Yoyoothetrack',
        fullName: 'Yoyoothetrack',
        role: 'OWNER',
        isOwner: true,
        permissions: ['*'] // Owner has absolute unrevokable permissions
    };

    window.checkAdminPermission = function(permissionCode) {
        if (!window.currentAdminUser) return false;
        if (window.currentAdminUser.isOwner || window.currentAdminUser.permissions.includes('*')) {
            return true;
        }
        return window.currentAdminUser.permissions.includes(permissionCode);
    };

    function recordAdminAuditLog(action, moduleName, resourceType, resourceId, accessReason = null, oldVals = null, newVals = null) {
        if (window.LYANN_API_CLIENT && typeof window.LYANN_API_CLIENT.logAuditAction === 'function') {
            window.LYANN_API_CLIENT.logAuditAction(
                window.currentAdminUser.username,
                action,
                moduleName,
                resourceType,
                resourceId,
                accessReason,
                oldVals,
                newVals
            );
        }

        // Prepend to audit log table if visible
        const auditTableBody = document.querySelector('#auditLogsAdminTable tbody');
        if (auditTableBody) {
            const tr = document.createElement('tr');
            const nowStr = new Date().toLocaleString('fr-FR');
            tr.innerHTML = `
                <td style="font-family: var(--admin-font-mono);">${nowStr}</td>
                <td><strong style="color: var(--admin-brand-yellow);">${window.currentAdminUser.username} (${window.currentAdminUser.role})</strong></td>
                <td><span class="status-badge verified">${action}</span></td>
                <td>${moduleName}</td>
                <td>${resourceType} (${resourceId || 'N/A'})</td>
                <td>${accessReason || 'Action administrative validée'}</td>
            `;
            auditTableBody.insertBefore(tr, auditTableBody.firstChild);
        }
    }
    window.recordAdminAuditLog = recordAdminAuditLog;

    // Record initial admin session startup log
    recordAdminAuditLog('ADMIN_SESSION_START', 'Système Admin', 'Session', 'Yoyoothetrack', 'Connexion Propriétaire Super Administrateur');

    // --------------------------------------------------------------------------
    // 0.B COMMAND PALETTE (⌘ K / CTRL + K)
    // --------------------------------------------------------------------------
    const cmdPaletteModal = document.getElementById('adminCommandPaletteModal');
    const cmdPaletteInput = document.getElementById('commandPaletteInput');
    const openCmdBtn = document.getElementById('openCommandPaletteBtn');

    function toggleCommandPalette() {
        if (!cmdPaletteModal) return;
        cmdPaletteModal.classList.toggle('active');
        if (cmdPaletteModal.classList.contains('active') && cmdPaletteInput) {
            cmdPaletteInput.value = '';
            cmdPaletteInput.focus();
        }
    }

    if (openCmdBtn) {
        openCmdBtn.addEventListener('click', (e) => {
            e.preventDefault();
            toggleCommandPalette();
        });
    }

    document.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            toggleCommandPalette();
        }
        if (e.key === 'Escape' && cmdPaletteModal && cmdPaletteModal.classList.contains('active')) {
            cmdPaletteModal.classList.remove('active');
        }
    });

    if (cmdPaletteInput) {
        cmdPaletteInput.addEventListener('input', () => {
            const query = cmdPaletteInput.value.toLowerCase().trim();
            const resultsBox = document.getElementById('commandPaletteResults');
            if (!resultsBox) return;

            if (!query) {
                resultsBox.innerHTML = `
                    <div style="font-size: 0.75rem; color: var(--admin-text-muted); padding: 6px 12px; font-weight: 800; text-transform: uppercase;">Accès Rapide Pôles</div>
                    <div class="command-palette-item" onclick="document.querySelector('.admin-nav-item[data-section=\\'sec-overview\\']').click(); document.getElementById('adminCommandPaletteModal').classList.remove('active');"><i class="ph-bold ph-chart-line-up"></i> BI & Tableau de Bord</div>
                    <div class="command-palette-item" onclick="document.querySelector('.admin-nav-item[data-section=\\'sec-users\\']').click(); document.getElementById('adminCommandPaletteModal').classList.remove('active');"><i class="ph-bold ph-users"></i> Utilisateurs & KYC</div>
                    <div class="command-palette-item" onclick="document.querySelector('.admin-nav-item[data-section=\\'sec-finances\\']').click(); document.getElementById('adminCommandPaletteModal').classList.remove('active');"><i class="ph-bold ph-bank"></i> Finances & Stripe Connect</div>
                    <div class="command-palette-item" onclick="document.querySelector('.admin-nav-item[data-section=\\'sec-aiops\\']').click(); document.getElementById('adminCommandPaletteModal').classList.remove('active');"><i class="ph-bold ph-robot"></i> Bots IA & Animation</div>
                `;
                return;
            }

            const matchingNavs = Array.from(document.querySelectorAll('.admin-nav-item')).filter(nav => nav.textContent.toLowerCase().includes(query));
            resultsBox.innerHTML = matchingNavs.map(nav => {
                const secId = nav.getAttribute('data-section');
                return `<div class="command-palette-item" onclick="document.querySelector('.admin-nav-item[data-section=\\'${secId}\\']').click(); document.getElementById('adminCommandPaletteModal').classList.remove('active');"><i class="ph-bold ph-arrow-right"></i> ${nav.textContent.trim()}</div>`;
            }).join('') || `<div style="padding: 12px; font-size: 0.85rem; color: var(--admin-text-muted);">Aucun résultat trouvé pour "${query}"</div>`;
        });
    }

    // --------------------------------------------------------------------------
    // 0.C MESSAGERIE PRIVÉE ENCADRÉE (AUDIT LOGGED MANDATORY REASON)
    // --------------------------------------------------------------------------
    const btnRequestChatAccess = document.getElementById('btnRequestChatAccess');
    if (btnRequestChatAccess) {
        btnRequestChatAccess.addEventListener('click', () => {
            const reason = prompt("⚠️ ACCÈS PRIVILÉGIÉ À LA MESSAGERIE PRIVÉE\n\nVeuillez indiquer le motif obligatoire de consultation (ex: Litige #562, Réclamation Fraude, Support Ticket #1082) :");
            if (reason && reason.trim().length >= 5) {
                recordAdminAuditLog('PRIVATE_CHAT_ACCESSED', 'Messagerie Encadrée', 'Conversation', 'ALL_ACTIVE', reason.trim());
                alert(`🔓 Accès accordé sous le motif : "${reason.trim()}". L'opération a été inscrite dans les Audit Logs.`);
            } else if (reason !== null) {
                alert("❌ Consultation refusée : Le motif doit comporter au moins 5 caractères pour être valide.");
            }
        });
    }

    // --------------------------------------------------------------------------
    // 1. NAVIGATION INTER-MODULES (25 PÔLES OPÉRATIONNELS)
    // --------------------------------------------------------------------------
    const navItems = document.querySelectorAll('.admin-nav-item');
    const sections = document.querySelectorAll('.admin-section');
    const toggleAdminSidebarMobileBtn = document.getElementById('toggleAdminSidebarMobileBtn');

    if (toggleAdminSidebarMobileBtn) {
        toggleAdminSidebarMobileBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const sidebar = document.querySelector('.admin-sidebar');
            if (sidebar) {
                sidebar.classList.toggle('mobile-open');
            }
        });
    }

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const targetSectionId = item.getAttribute('data-section');
            if (!targetSectionId) return;

            // Fermeture du drawer sur mobile
            const sidebar = document.querySelector('.admin-sidebar');
            if (sidebar) {
                sidebar.classList.remove('mobile-open');
            }

            // Mise à jour de la classe active sur le menu
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            // Affichage de la section cible
            sections.forEach(sec => sec.classList.remove('active'));
            const targetSection = document.getElementById(targetSectionId);
            if (targetSection) {
                targetSection.classList.add('active');
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        });
    });

    // Raccourci vers la section Bots IA
    document.querySelectorAll('.trigger-goto-aiops').forEach(btn => {
        btn.addEventListener('click', () => {
            const aiNavItem = document.querySelector('.admin-nav-item[data-section="sec-aiops"]');
            if (aiNavItem) aiNavItem.click();
        });
    });

    // --------------------------------------------------------------------------
    // 2. MODALES & ACTIONS RAPIDES
    // --------------------------------------------------------------------------
    const adminModals = document.querySelectorAll('.admin-modal');
    const modalCloseBtns = document.querySelectorAll('.admin-modal-close');

    modalCloseBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            adminModals.forEach(m => m.classList.remove('active'));
        });
    });

    adminModals.forEach(m => {
        m.addEventListener('click', (e) => {
            if (e.target === m) m.classList.remove('active');
        });
    });

    // Validation KYC
    document.querySelectorAll('.btn-approve-kyc').forEach(btn => {
        btn.addEventListener('click', () => {
            const userName = btn.getAttribute('data-user-name') || 'Lyanneur';
            if (confirm(`Approuver le dossier d'identité KYC et attribuer le badge VÉRIFIÉ à ${userName} ?`)) {
                alert(`✅ Dossier KYC approuvé ! ${userName} est désormais prestataire vérifié avec badge vert.`);
                const statusBadge = btn.closest('tr')?.querySelector('.status-badge');
                if (statusBadge) {
                    statusBadge.className = 'status-badge verified';
                    statusBadge.textContent = 'VÉRFIÉ ✔';
                }
            }
        });
    });

    // Suspension Utilisateur
    document.querySelectorAll('.btn-suspend-user').forEach(btn => {
        btn.addEventListener('click', () => {
            const userName = btn.getAttribute('data-user-name') || 'l\'utilisateur';
            if (confirm(`⚠️ Suspendre le compte de ${userName} pour manquement aux règles communautaires ?`)) {
                alert(`🚫 Compte de ${userName} suspendu avec succès.`);
                const statusBadge = btn.closest('tr')?.querySelector('.status-badge');
                if (statusBadge) {
                    statusBadge.className = 'status-badge suspended';
                    statusBadge.textContent = 'SUSPENDU';
                }
            }
        });
    });

    // Déblocage Payout Prestataire
    document.querySelectorAll('.btn-release-payout').forEach(btn => {
        btn.addEventListener('click', () => {
            const amount = btn.getAttribute('data-amount') || '450 €';
            const provider = btn.getAttribute('data-provider') || 'David Jean-Baptiste';
            if (confirm(`Déclencher le virement SEPA/Stripe Connect de ${amount} vers ${provider} ?`)) {
                alert(`💸 Virement de ${amount} initié avec succès vers ${provider}.`);
                btn.textContent = 'Virement Effectué ✅';
                btn.disabled = true;
                btn.style.opacity = '0.6';
            }
        });
    });

    // Résolution de Ticket Support
    document.querySelectorAll('.btn-resolve-ticket').forEach(btn => {
        btn.addEventListener('click', () => {
            const ticketId = btn.getAttribute('data-ticket-id') || 'T-1082';
            alert(`🎉 Ticket ${ticketId} marqué comme résolu ! Notification envoyée au membre.`);
            const row = btn.closest('tr');
            if (row) {
                const statusBadge = row.querySelector('.status-badge');
                if (statusBadge) {
                    statusBadge.className = 'status-badge resolved';
                    statusBadge.textContent = 'RÉSOLU';
                }
            }
        });
    });

    // Approbation / Rejet des Publications IA
    document.querySelectorAll('.btn-approve-ai').forEach(btn => {
        btn.addEventListener('click', () => {
            const postId = btn.getAttribute('data-post-id');
            if (confirm('Approuver cette publication IA et la diffuser immédiatement sur Bokantaj public ?')) {
                if (window.LYANN_AI_ECOSYSTEM) {
                    window.LYANN_AI_ECOSYSTEM.approvePendingPost(postId);
                }
                const row = document.getElementById(`ai-row-${postId.replace('pending-', '')}`);
                if (row) row.remove();
                alert('✅ Publication IA approuvée et diffusée sur Bokantaj !');
            }
        });
    });

    document.querySelectorAll('.btn-reject-ai').forEach(btn => {
        btn.addEventListener('click', () => {
            const postId = btn.getAttribute('data-post-id');
            if (confirm('Rejeter et supprimer cette proposition de contenu IA ?')) {
                if (window.LYANN_AI_ECOSYSTEM) {
                    window.LYANN_AI_ECOSYSTEM.rejectPendingPost(postId);
                }
                const row = document.getElementById(`ai-row-${postId.replace('pending-', '')}`);
                if (row) row.remove();
                alert('🚫 Proposition IA rejetée.');
            }
        });
    });

    // Toggle statut Agent IA (Actif / Pause)
    document.querySelectorAll('.btn-toggle-agent').forEach(btn => {
        btn.addEventListener('click', () => {
            const agentId = btn.getAttribute('data-agent-id');
            if (window.LYANN_AI_ECOSYSTEM) {
                const newStatus = window.LYANN_AI_ECOSYSTEM.toggleAgentStatus(agentId);
                if (newStatus === 'PAUSED') {
                    btn.textContent = 'Reprendre ▶️';
                    btn.classList.replace('admin-btn-secondary', 'admin-btn-primary');
                    alert(`⏸️ Agent IA mis en pause avec succès.`);
                } else {
                    btn.textContent = 'Mettre en Pause ⏸️';
                    btn.classList.replace('admin-btn-primary', 'admin-btn-secondary');
                    alert(`▶️ Agent IA réactivé.`);
                }
            }
        });
    });
    // Remboursement 1-Clic Litige
    document.querySelectorAll('.btn-refund-booking').forEach(btn => {
        btn.addEventListener('click', () => {
            const resId = btn.getAttribute('data-res-id') || '8820';
            if (confirm(`Arbitrer le litige #RES-${resId} et procéder au remboursement intégral du client ?`)) {
                alert(`💳 Remboursement de 120.00 € effectué avec succès via Stripe.`);
                btn.textContent = 'Remboursé ✅';
                btn.disabled = true;
                btn.style.opacity = '0.6';
            }
        });
    });

    // Actions Modération
    document.querySelectorAll('.btn-delete-content').forEach(btn => {
        btn.addEventListener('click', () => {
            const modId = btn.getAttribute('data-mod-id');
            if (confirm('Supprimer définitivement ce contenu inapproprié et notifier l\'auteur ?')) {
                const row = document.getElementById(`mod-row-${modId}`);
                if (row) row.remove();
                alert('🗑️ Contenu supprimé du réseau LYANN.');
            }
        });
    });

    document.querySelectorAll('.btn-ignore-mod').forEach(btn => {
        btn.addEventListener('click', () => {
            const modId = btn.getAttribute('data-mod-id');
            const row = document.getElementById(`mod-row-${modId}`);
            if (row) row.remove();
            alert('Signalement classé sans suite.');
        });
    });

    // Bouton de Pause Générale d'Urgence IA
    const btnPauseAllAI = document.getElementById('btnPauseAllAI');
    if (btnPauseAllAI) {
        btnPauseAllAI.addEventListener('click', () => {
            if (confirm('🚨 ATTENTION : Mettre en pause TOUS les Agents IA du réseau simultanément ?')) {
                alert('⏸️ Tout le réseau d\'Agents IA a été mis en pause conservatoire.');
            }
        });
    }

    // Feature Flags Toggles
    document.querySelectorAll('.feature-flag-input').forEach(input => {
        input.addEventListener('change', () => {
            const featureName = input.getAttribute('data-feature');
            const state = input.checked ? 'ACTIVÉE' : 'DÉSACTIVÉE';
            alert(`⚙️ Fonctionnalité [${featureName}] désormais ${state} en direct sur la plateforme.`);
        });
    });

    // Mode Maintenance Global
    const maintenanceToggle = document.getElementById('globalMaintenanceToggle');
    if (maintenanceToggle) {
        maintenanceToggle.addEventListener('change', () => {
            if (maintenanceToggle.checked) {
                if (confirm('🚨 ATTENTION : Activer le Mode Maintenance global ? Le site public affichera la page de maintenance.')) {
                    alert('🚨 Mode Maintenance ACTIVÉ sur l\'ensemble des territoires DOM.');
                } else {
                    maintenanceToggle.checked = false;
                }
            } else {
                alert('🟢 Mode Maintenance DÉSACTIVÉ. La plateforme publique est de nouveau accessible.');
            }
        });
    }

    // Lancement de Campagne Notification
    const newCampaignForm = document.getElementById('newCampaignForm');
    if (newCampaignForm) {
        newCampaignForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const title = document.getElementById('campTitle')?.value || 'Alerte';
            const territory = document.getElementById('campTerritory')?.value || 'Tous les DOM';
            alert(`🚀 Campagne [${title}] programmée avec succès pour diffusion Push & SMS sur : ${territory}`);
            newCampaignForm.reset();
        });
    }

    // --------------------------------------------------------------------------
    // 3. RECHERCHE ET FILTRAGE EN TEMPS RÉEL
    // --------------------------------------------------------------------------
    const globalSearchInput = document.getElementById('globalAdminSearch');
    if (globalSearchInput) {
        globalSearchInput.addEventListener('input', () => {
            const query = globalSearchInput.value.toLowerCase();
            const rows = document.querySelectorAll('.admin-table tbody tr');
            rows.forEach(row => {
                const text = row.textContent.toLowerCase();
                row.style.display = text.includes(query) ? '' : 'none';
            });
        });
    }

    // --------------------------------------------------------------------------
    // MOTEUR DE SIMULATION DE MATCHING TEMPS RÉEL DANS L'ADMIN
    // --------------------------------------------------------------------------
    const btnExecuteAdminSimulation = document.getElementById('btnExecuteAdminSimulation');
    const btnRunMatchingSimulation = document.getElementById('btnRunMatchingSimulation');
    const adminSimulationQuery = document.getElementById('adminSimulationQuery');
    const adminSimulationResultsContainer = document.getElementById('adminSimulationResultsContainer');

    function executeAdminMatchingSimulation() {
        if (!adminSimulationQuery || !adminSimulationResultsContainer) return;
        const queryText = adminSimulationQuery.value || "J'ai une fuite sous mon évier à Sainte-Anne";
        
        if (window.LyannMatchingEngine) {
            const classified = window.LyannMatchingEngine.classifyNeed(queryText);
            const matchResult = window.LyannMatchingEngine.findMatchingLyanneursForNeed(classified, window.LYANN_MEMBERS || []);
            const dispatchResult = window.LyannMatchingEngine.dispatchTargetedNeedNotifications(classified, window.LYANN_MEMBERS || [], 5);

            let html = `<div style="color: #38BDF8; font-weight: bold; margin-bottom: 8px;">[CLASSIFICATION COMPRISE PAR LYANN]</div>`;
            html += `<div>• Texte brut: <span style="color: #FACC15;">"${classified.raw_text}"</span></div>`;
            html += `<div>• Domaine: <span style="color: #4ADE80;">${classified.domain}</span> | Catégorie: <span style="color: #4ADE80;">${classified.category}</span></div>`;
            html += `<div>• Localisation: <span style="color: #38BDF8;">${classified.location_name}</span> (${classified.latitude}, ${classified.longitude})</div>`;
            html += `<div>• Tags requis: <code>${classified.required_skills.join(', ')}</code></div>`;
            
            html += `<div style="color: #38BDF8; font-weight: bold; margin-top: 14px; margin-bottom: 8px;">[CANDIDATS LYANNEURS RECONNUS & SCORE (DÉTERMINISTE + SCORING)]</div>`;
            if (matchResult.lyanneurs.length === 0) {
                html += `<div style="color: #F87171;">Aucun candidat direct dans le rayon exact. Fallback Bokantaj actif.</div>`;
            } else {
                matchResult.lyanneurs.forEach((cand, idx) => {
                    html += `<div style="background: rgba(255,255,255,0.05); padding: 8px 12px; margin-bottom: 6px; border-radius: 6px; border-left: 3px solid #4ADE80;">`;
                    html += `<strong>#${idx + 1} ${cand.display_name}</strong> · ${cand.role} (${cand.public_location})<br>`;
                    html += `<small style="color: #94A3B8;">Distance: ${cand.distance_km} km | Note: ${cand.rating} ★ (${cand.reviewsCount} avis) | ${cand.badge}</small><br>`;
                    html += `<small style="color: #FACC15;">Raisons humaines: ${cand.human_reasons.join(' · ')}</small>`;
                    html += `</div>`;
                });
            }

            html += `<div style="color: #38BDF8; font-weight: bold; margin-top: 14px; margin-bottom: 8px;">[DIFFUSION CIBLÉE & NOTIFICATIONS]</div>`;
            html += `<div style="color: #4ADE80;">${dispatchResult.human_summary}</div>`;
            
            adminSimulationResultsContainer.innerHTML = html;
        } else {
            adminSimulationResultsContainer.innerHTML = `<div style="color: #F87171;">Moteur LyannMatchingEngine non initialisé.</div>`;
        }
    }

    if (btnExecuteAdminSimulation) {
        btnExecuteAdminSimulation.addEventListener('click', (e) => {
            e.preventDefault();
            executeAdminMatchingSimulation();
        });
    }

    if (btnRunMatchingSimulation) {
        btnRunMatchingSimulation.addEventListener('click', (e) => {
            e.preventDefault();
            const taxonomyNav = document.querySelector('.admin-nav-item[data-section="sec-taxonomy"]');
            if (taxonomyNav) taxonomyNav.click();
            setTimeout(() => executeAdminMatchingSimulation(), 100);
        });
    }

    // --------------------------------------------------------------------------
    // 4. MOTEUR ANALYTIQUE BI ET SÉLECTEUR DE PÉRIODE DYNAMIQUE
    // --------------------------------------------------------------------------
    const PERIOD_DATASETS = {
        'today': {
            gmv: '2,450 €', gmvTrend: '+8.2%',
            comm: '367 €', commTrend: '+5.1%',
            mrr: '4,190 €/m', mrrTrend: '+0.5%',
            aov: '41.20 €', aovTrend: '+1.0%',
            users: '1,840', usersTrend: '+42 aujourd\'hui',
            newUsers: '+18', newUsersTrend: '+12%',
            deals: '58', dealsTrend: '100% conclues',
            conv: '5.12%', convTrend: '+0.8%',
            kyc: '94.2%', kycTrend: 'Certifié',
            sla: '11 min', slaTrend: '-4 min',
            disputes: '0.00%', disputesTrend: '0 litige',
            retention: '76.2%', retentionTrend: '+2.1%',
            subtitle: 'Données analytiques enregistrées aujourd\'hui (4 août 2026)',
            chartLabels: ['08h', '10h', '12h', '14h', '16h', 'Actuel'],
            chartGmvVals: ['180€', '420€', '890€', '1.4k€', '1.9k€', '2.45k€'],
            chartGmvHeights: ['20%', '40%', '60%', '75%', '88%', '100%'],
            domGuadeloupe: '44% • 1,078 € (810 membres)', domGuadeloupeBar: '44%',
            domMartinique: '34% • 833 € (625 membres)', domMartiniqueBar: '34%',
            domGuyane: '14% • 343 € (257 membres)', domGuyaneBar: '14%',
            domReunion: '8% • 196 € (148 membres)', domReunionBar: '8%',
            cat1Vol: '920 €', cat1Count: '22 demandes', cat1Pct: '37.5%',
            cat2Vol: '640 €', cat2Count: '16 demandes', cat2Pct: '26.1%',
            cat3Vol: '450 €', cat3Count: '11 demandes', cat3Pct: '18.3%',
            cat4Vol: '270 €', cat4Count: '7 demandes', cat4Pct: '11.0%'
        },
        '7d': {
            gmv: '14,820 €', gmvTrend: '+14.5%',
            comm: '2,223 €', commTrend: '+11.0%',
            mrr: '4,190 €/m', mrrTrend: '+3.2%',
            aov: '42.10 €', aovTrend: '+2.4%',
            users: '5,620', usersTrend: '+112 cette semaine',
            newUsers: '+124', newUsersTrend: '+15%',
            deals: '352', dealsTrend: '99.1%',
            conv: '4.95%', convTrend: '+0.4%',
            kyc: '94.2%', kycTrend: 'Certifié',
            sla: '13 min', slaTrend: '-2 min',
            disputes: '0.28%', disputesTrend: '-0.05%',
            retention: '75.1%', retentionTrend: '+3.4%',
            subtitle: 'Données analytiques consolidées des 7 derniers jours',
            chartLabels: ['J-6', 'J-5', 'J-4', 'J-3', 'J-2', 'Hier'],
            chartGmvVals: ['1.8k€', '2.1k€', '2.3k€', '2.6k€', '2.8k€', '3.2k€'],
            chartGmvHeights: ['45%', '58%', '65%', '76%', '85%', '100%'],
            domGuadeloupe: '41% • 6,076 € (2,304 membres)', domGuadeloupeBar: '41%',
            domMartinique: '37% • 5,483 € (2,079 membres)', domMartiniqueBar: '37%',
            domGuyane: '13% • 1,926 € (730 membres)', domGuyaneBar: '13%',
            domReunion: '9% • 1,333 € (507 membres)', domReunionBar: '9%',
            cat1Vol: '5,550 €', cat1Count: '132 demandes', cat1Pct: '37.4%',
            cat2Vol: '3,920 €', cat2Count: '93 demandes', cat2Pct: '26.4%',
            cat3Vol: '2,680 €', cat3Count: '64 demandes', cat3Pct: '18.1%',
            cat4Vol: '1,640 €', cat4Count: '39 demandes', cat4Pct: '11.1%'
        },
        '30d': {
            gmv: '48,920 €', gmvTrend: '+18.4%',
            comm: '7,338 €', commTrend: '+12.1%',
            mrr: '4,190 €/m', mrrTrend: '+15.2%',
            aov: '42.50 €', aovTrend: '+3.2%',
            users: '12,480', usersTrend: '+240 membres',
            newUsers: '+485', newUsersTrend: '+8.4%',
            deals: '1,420', dealsTrend: '98.6%',
            conv: '4.82%', convTrend: '+0.6%',
            kyc: '94.2%', kycTrend: 'Certifié',
            sla: '14 min', slaTrend: '-3 min',
            disputes: '0.42%', disputesTrend: '-0.12%',
            retention: '74.5%', retentionTrend: '+4.1%',
            subtitle: 'Commissions & Volume d\'Affaires sur les 30 derniers jours',
            chartLabels: ['Sem 1', 'Sem 2', 'Sem 3', 'Sem 4', 'Sem 5', 'Actuel'],
            chartGmvVals: ['18.2k€', '24.5k€', '31.0k€', '36.8k€', '42.1k€', '48.9k€'],
            chartGmvHeights: ['45%', '55%', '68%', '78%', '88%', '100%'],
            domGuadeloupe: '42% • 20,546 € (5,241 membres)', domGuadeloupeBar: '42%',
            domMartinique: '36% • 17,611 € (4,492 membres)', domMartiniqueBar: '36%',
            domGuyane: '14% • 6,848 € (1,747 membres)', domGuyaneBar: '14%',
            domReunion: '8% • 3,915 € (998 membres)', domReunionBar: '8%',
            cat1Vol: '18,420 €', cat1Count: '482 demandes', cat1Pct: '37.6%',
            cat2Vol: '12,980 €', cat2Count: '340 demandes', cat2Pct: '26.5%',
            cat3Vol: '8,850 €', cat3Count: '295 demandes', cat3Pct: '18.1%',
            cat4Vol: '5,400 €', cat4Count: '180 demandes', cat4Pct: '11.0%'
        },
        'this_month': {
            gmv: '54,200 €', gmvTrend: '+21.0%',
            comm: '8,130 €', commTrend: '+16.4%',
            mrr: '4,190 €/m', mrrTrend: '+15.2%',
            aov: '43.10 €', aovTrend: '+4.0%',
            users: '12,480', usersTrend: '+510 ce mois',
            newUsers: '+510', newUsersTrend: '+11.2%',
            deals: '1,560', dealsTrend: '98.9%',
            conv: '5.04%', convTrend: '+0.9%',
            kyc: '95.1%', kycTrend: 'Certifié',
            sla: '12 min', slaTrend: '-4 min',
            disputes: '0.35%', disputesTrend: '-0.15%',
            retention: '75.8%', retentionTrend: '+4.8%',
            subtitle: 'Analytics financiers consolidés pour le mois d\'Août 2026',
            chartLabels: ['Sem 1', 'Sem 2', 'Sem 3', 'Sem 4', 'En cours', 'Proj.'],
            chartGmvVals: ['10k€', '22k€', '34k€', '45k€', '54.2k€', '62k€'],
            chartGmvHeights: ['30%', '50%', '70%', '82%', '90%', '100%'],
            domGuadeloupe: '43% • 23,306 € (5,366 membres)', domGuadeloupeBar: '43%',
            domMartinique: '35% • 18,970 € (4,368 membres)', domMartiniqueBar: '35%',
            domGuyane: '14% • 7,588 € (1,747 membres)', domGuyaneBar: '14%',
            domReunion: '8% • 4,336 € (998 membres)', domReunionBar: '8%',
            cat1Vol: '20,400 €', cat1Count: '520 demandes', cat1Pct: '37.6%',
            cat2Vol: '14,300 €', cat2Count: '370 demandes', cat2Pct: '26.4%',
            cat3Vol: '9,800 €', cat3Count: '310 demandes', cat3Pct: '18.1%',
            cat4Vol: '5,900 €', cat4Count: '195 demandes', cat4Pct: '10.9%'
        },
        'quarter': {
            gmv: '138,400 €', gmvTrend: '+34.2%',
            comm: '20,760 €', commTrend: '+28.5%',
            mrr: '4,190 €/m', mrrTrend: '+22.4%',
            aov: '44.00 €', aovTrend: '+5.5%',
            users: '12,480', usersTrend: '+1,420 au Q3',
            newUsers: '+1,420', newUsersTrend: '+24.1%',
            deals: '4,120', dealsTrend: '98.8%',
            conv: '5.20%', convTrend: '+1.2%',
            kyc: '95.1%', kycTrend: 'Certifié',
            sla: '12 min', slaTrend: '-5 min',
            disputes: '0.32%', disputesTrend: '-0.20%',
            retention: '77.2%', retentionTrend: '+5.6%',
            subtitle: 'Synthèse trimestrielle de la plateforme pour le Troisième Trimestre (Q3 2026)',
            chartLabels: ['Juin', 'Juillet', 'Août', 'Sept (P)', 'Oct (P)', 'Bilan Q3'],
            chartGmvVals: ['38k€', '44k€', '54.2k€', '60k€', '68k€', '138.4k€'],
            chartGmvHeights: ['40%', '52%', '65%', '75%', '85%', '100%'],
            domGuadeloupe: '42% • 58,128 € (5,241 membres)', domGuadeloupeBar: '42%',
            domMartinique: '36% • 49,824 € (4,492 membres)', domMartiniqueBar: '36%',
            domGuyane: '14% • 19,376 € (1,747 membres)', domGuyaneBar: '14%',
            domReunion: '8% • 11,072 € (998 membres)', domReunionBar: '8%',
            cat1Vol: '52,100 €', cat1Count: '1,320 demandes', cat1Pct: '37.6%',
            cat2Vol: '36,600 €', cat2Count: '940 demandes', cat2Pct: '26.4%',
            cat3Vol: '25,000 €', cat3Count: '780 demandes', cat3Pct: '18.1%',
            cat4Vol: '15,200 €', cat4Count: '480 demandes', cat4Pct: '11.0%'
        },
        'year2026': {
            gmv: '420,800 €', gmvTrend: '+68.4%',
            comm: '63,120 €', commTrend: '+58.0%',
            mrr: '4,190 €/m', mrrTrend: '+45.0%',
            aov: '42.80 €', aovTrend: '+6.1%',
            users: '12,480', usersTrend: '+8,400 en 2026',
            newUsers: '+8,400', newUsersTrend: '+68.4%',
            deals: '12,840', dealsTrend: '99.0%',
            conv: '5.10%', convTrend: '+1.4%',
            kyc: '95.1%', kycTrend: 'Certifié',
            sla: '13 min', slaTrend: '-6 min',
            disputes: '0.38%', disputesTrend: '-0.25%',
            retention: '78.0%', retentionTrend: '+7.2%',
            subtitle: 'Analytics financiers et croissance annuelle globale sur l\'Année 2026',
            chartLabels: ['Q1 2026', 'Q2 2026', 'Q3 (Actuel)', 'Q4 (Est.)', 'Objectif', 'Total 2026'],
            chartGmvVals: ['82k€', '118k€', '138k€', '160k€', '400k€', '420.8k€'],
            chartGmvHeights: ['35%', '50%', '65%', '78%', '90%', '100%'],
            domGuadeloupe: '42% • 176,736 € (5,241 membres)', domGuadeloupeBar: '42%',
            domMartinique: '36% • 151,488 € (4,492 membres)', domMartiniqueBar: '36%',
            domGuyane: '14% • 58,912 € (1,747 membres)', domGuyaneBar: '14%',
            domReunion: '8% • 33,664 € (998 membres)', domReunionBar: '8%',
            cat1Vol: '158,200 €', cat1Count: '4,120 demandes', cat1Pct: '37.6%',
            cat2Vol: '111,500 €', cat2Count: '2,940 demandes', cat2Pct: '26.5%',
            cat3Vol: '76,100 €', cat3Count: '2,480 demandes', cat3Pct: '18.1%',
            cat4Vol: '46,300 €', cat4Count: '1,420 demandes', cat4Pct: '11.0%'
        }
    };

    function updateAnalyticsDashboard(periodKey) {
        const data = PERIOD_DATASETS[periodKey] || PERIOD_DATASETS['30d'];

        const elMap = {
            'kpiGmvVal': data.gmv, 'kpiGmvTrend': data.gmvTrend,
            'kpiCommVal': data.comm, 'kpiCommTrend': data.commTrend,
            'kpiMrrVal': data.mrr, 'kpiMrrTrend': data.mrrTrend,
            'kpiAovVal': data.aov, 'kpiAovTrend': data.aovTrend,
            'kpiUsersVal': data.users, 'kpiUsersTrend': data.usersTrend,
            'kpiNewUsersVal': data.newUsers, 'kpiNewUsersTrend': data.newUsersTrend,
            'kpiDealsVal': data.deals, 'kpiDealsTrend': data.dealsTrend,
            'kpiConvVal': data.conv, 'kpiConvTrend': data.convTrend,
            'kpiKycVal': data.kyc, 'kpiKycTrend': data.kycTrend,
            'kpiSlaVal': data.sla, 'kpiSlaTrend': data.slaTrend,
            'kpiDisputesVal': data.disputes, 'kpiDisputesTrend': data.disputesTrend,
            'kpiRetentionVal': data.retention, 'kpiRetentionTrend': data.retentionTrend,

            'domGuadeloupeVal': data.domGuadeloupe,
            'domMartiniqueVal': data.domMartinique,
            'domGuyaneVal': data.domGuyane,
            'domReunionVal': data.domReunion,

            'cat1Vol': data.cat1Vol, 'cat1Count': data.cat1Count, 'cat1Pct': data.cat1Pct + ' du volume',
            'cat2Vol': data.cat2Vol, 'cat2Count': data.cat2Count, 'cat2Pct': data.cat2Pct + ' du volume',
            'cat3Vol': data.cat3Vol, 'cat3Count': data.cat3Count, 'cat3Pct': data.cat3Pct + ' du volume',
            'cat4Vol': data.cat4Vol, 'cat4Count': data.cat4Count, 'cat4Pct': data.cat4Pct + ' du volume'
        };

        for (const [id, val] of Object.entries(elMap)) {
            const el = document.getElementById(id);
            if (el) {
                if (id.includes('Trend')) {
                    const isUp = val.includes('+') || val.includes('Certifié') || val.includes('100%');
                    el.innerHTML = `<i class="ph-bold ${isUp ? 'ph-trend-up' : 'ph-trend-down'}"></i> ${val}`;
                } else {
                    el.textContent = val;
                }
            }
        }

        const barMap = {
            'domGuadeloupeBar': data.domGuadeloupeBar,
            'domMartiniqueBar': data.domMartiniqueBar,
            'domGuyaneBar': data.domGuyaneBar,
            'domReunionBar': data.domReunionBar
        };
        for (const [id, pct] of Object.entries(barMap)) {
            const bar = document.getElementById(id);
            if (bar) bar.style.width = pct;
        }

        const subtitleEl = document.getElementById('financialChartSubtitle');
        if (subtitleEl) subtitleEl.textContent = data.subtitle;

        const chartWrap = document.getElementById('analyticsBarChartWrap');
        if (chartWrap) {
            const cols = chartWrap.querySelectorAll('.analytics-bar-col');
            cols.forEach((col, idx) => {
                const labelEl = col.querySelector('.analytics-bar-label');
                const valEl = col.querySelector('.analytics-bar-val');
                const fillEl = col.querySelector('.analytics-bar-fill');

                if (labelEl && data.chartLabels[idx]) labelEl.textContent = data.chartLabels[idx];
                if (valEl && data.chartGmvVals[idx]) valEl.textContent = data.chartGmvVals[idx];
                if (fillEl && data.chartGmvHeights[idx]) fillEl.style.height = data.chartGmvHeights[idx];
            });
        }
    }

    const periodPills = document.querySelectorAll('.period-pill');
    const customDateContainer = document.getElementById('customDateRangeContainer');

    periodPills.forEach(pill => {
        pill.addEventListener('click', () => {
            periodPills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');

            const periodKey = pill.getAttribute('data-period');
            if (periodKey === 'custom') {
                if (customDateContainer) customDateContainer.classList.add('active');
            } else {
                if (customDateContainer) customDateContainer.classList.remove('active');
                updateAnalyticsDashboard(periodKey);
            }
        });
    });

    const applyCustomDateBtn = document.getElementById('applyCustomDateBtn');
    if (applyCustomDateBtn) {
        applyCustomDateBtn.addEventListener('click', () => {
            const start = document.getElementById('startDateInput')?.value || '2026-07-01';
            const end = document.getElementById('endDateInput')?.value || '2026-08-04';
            alert(`📅 Filtre analytique appliqué pour la période personnalisée du ${start} au ${end}.`);
            updateAnalyticsDashboard('30d');
        });
    }

    const analyticsTerritorySelect = document.getElementById('analyticsTerritorySelect');
    if (analyticsTerritorySelect) {
        analyticsTerritorySelect.addEventListener('change', (e) => {
            const territory = e.target.options[e.target.selectedIndex].text;
            alert(`🔍 Filtre BI appliqué : Affichage des métriques pour ${territory}`);
        });
    }

    const exportBiReportBtn = document.getElementById('exportBiReportBtn');
    if (exportBiReportBtn) {
        exportBiReportBtn.addEventListener('click', () => {
            alert('📊 Export BI initié ! Le rapport détaillé (Finances, Prestations, Rétention & Matrice Territoriale DOM) a été généré au format CSV/PDF.');
        });
    }

    const refreshAnalyticsBtn = document.getElementById('refreshAnalyticsBtn');
    if (refreshAnalyticsBtn) {
        refreshAnalyticsBtn.addEventListener('click', () => {
            const activePill = document.querySelector('.period-pill.active');
            const key = activePill ? activePill.getAttribute('data-period') : '30d';
            updateAnalyticsDashboard(key);
            refreshDashboardData();
            alert('🔄 Données analytiques et métriques BI synchronisées en temps réel.');
        });
    }

    // ==========================================================================
    // MODULE FINANCIER & ARBITRAGE DES LITIGES (DYNAMIQUE)
    // ==========================================================================
    let activeArbitrationTxId = null;

    function renderAdminTransactions() {
        const body = document.getElementById('adminTransactionsTableBody');
        if (!body) return;
        
        const txs = window.LYANN_PAYMENTS.getTransactions();
        body.innerHTML = '';
        
        txs.forEach(t => {
            const row = document.createElement('tr');
            let statusLabel = '';
            if (t.status === 'en_cours') {
                statusLabel = '<span class="status-badge active" style="background:#3182CE; color:white;">EN COURS</span>';
            } else if (t.status === 'termine') {
                statusLabel = '<span class="status-badge verified" style="background:#4A7C59; color:white;">TERMINÉ ✔</span>';
            } else if (t.status === 'litige') {
                statusLabel = '<span class="status-badge suspended" style="background:#E76F51; color:white; font-weight:800;">LITIGE ⚠️</span>';
            } else if (t.status === 'rembourse') {
                statusLabel = '<span class="status-badge suspended" style="background:#718096; color:white;">REMBOURSÉ</span>';
            } else {
                statusLabel = `<span class="status-badge open">${t.status}</span>`;
            }

            const validsCount = t.milestones.filter(m => m.status === 'approved').length;
            const milestonesText = t.requiresMilestones ? `${validsCount} / ${t.milestones.length}` : 'Prestation unique';

            row.innerHTML = `
                <td><strong>#${t.id}</strong></td>
                <td>${t.customerName}</td>
                <td>${t.providerName}</td>
                <td>${t.title}</td>
                <td style="font-family: monospace; font-weight:700;">${t.amount.toFixed(2)} €</td>
                <td style="font-family: monospace;">${t.commissionAmount.toFixed(2)} €</td>
                <td>${statusLabel}</td>
                <td>${milestonesText}</td>
            `;
            body.appendChild(row);
        });
    }

    function renderAdminWallets() {
        const body = document.getElementById('adminWalletsTableBody');
        if (!body) return;
        
        const wallets = window.LYANN_PAYMENTS.getWallets();
        const members = {
            1: "David Jean-Baptiste",
            2: "Marie-Line Popotte",
            3: "Jean-Michel Télèphe"
        };
        body.innerHTML = '';
        
        Object.entries(wallets).forEach(([id, w]) => {
            const row = document.createElement('tr');
            let kycBadge = '';
            if (w.kycStatus === 'verified') {
                kycBadge = '<span class="status-badge verified" style="background:#4A7C59; color:white;">VÉRIFIÉ ✔</span>';
            } else if (w.kycStatus === 'pending') {
                kycBadge = '<span class="status-badge open" style="background:#D69E2E; color:white;">EN COURS ⏳</span>';
            } else {
                kycBadge = '<span class="status-badge suspended" style="background:#E53E3E; color:white;">INCOMPLET ❌</span>';
            }

            row.innerHTML = `
                <td><strong>${members[id] || 'Prestataire #' + id}</strong></td>
                <td style="font-family: monospace; font-size: 0.8rem;">${w.stripeAccountId}</td>
                <td>${kycBadge}</td>
                <td style="font-family: monospace; font-weight:700;">${w.pendingBalance.toFixed(2)} €</td>
                <td style="font-family: monospace; font-weight:700; color:#81E6D9;">${w.availableBalance.toFixed(2)} €</td>
            `;
            body.appendChild(row);
        });
    }

    function updateAdminFinancesSummary() {
        const metrics = window.LYANN_PAYMENTS.getBIReport();
        const elGmv = document.getElementById('adminGmvDisplay');
        const elEscrow = document.getElementById('adminEscrowDisplay');
        const elCom = document.getElementById('adminCommissionsDisplay');
        const elProt = document.getElementById('adminProtectionsDisplay');

        if (elGmv) elGmv.textContent = `${metrics.gmv.toFixed(2)} €`;
        if (elEscrow) elEscrow.textContent = `${metrics.pendingEscrowFunds.toFixed(2)} €`;
        if (elCom) elCom.textContent = `${metrics.platformFeeRevenue.toFixed(2)} €`;
        if (elProt) elProt.textContent = `${metrics.protectionRevenue.toFixed(2)} €`;

        // Écraser les KPIs BI du haut de page
        const biGmv = document.getElementById('kpiGmvVal');
        const biCom = document.getElementById('kpiCommVal');
        if (biGmv) biGmv.textContent = `${metrics.gmv.toFixed(2)} €`;
        if (biCom) biCom.textContent = `${metrics.platformFeeRevenue.toFixed(2)} €`;
    }

    function checkActiveDisputes() {
        const card = document.getElementById('adminDisputeArbitrationCard');
        if (!card) return;

        const txs = window.LYANN_PAYMENTS.getTransactions();
        const disputeTx = txs.find(t => t.status === 'litige' && t.dispute && t.dispute.status === 'open');

        if (!disputeTx) {
            card.style.display = 'none';
            activeArbitrationTxId = null;
            return;
        }

        activeArbitrationTxId = disputeTx.id;
        card.style.display = 'block';

        // Détails
        const details = document.getElementById('arbitrationDisputeDetails');
        const disp = disputeTx.dispute;
        details.innerHTML = `
            <div><strong>ID Prestation :</strong> #${disputeTx.id}</div>
            <div><strong>Nom Litige :</strong> ${disp.id}</div>
            <div><strong>Projet :</strong> ${disputeTx.title}</div>
            <div><strong>Client (Demandeur) :</strong> ${disputeTx.customerName}</div>
            <div><strong>Prestataire :</strong> ${disputeTx.providerName}</div>
            <div><strong>Motif :</strong> <span style="color:#FC8181; font-weight:700;">${disp.reason}</span></div>
            <div style="margin-top: 8px; font-style: italic; background:rgba(0,0,0,0.1); padding:8px; border-radius:4px;">"${disp.description}"</div>
        `;

        // Preuves
        const evidence = document.getElementById('arbitrationEvidenceList');
        evidence.innerHTML = '';
        if (disp.evidenceFiles.length === 0) {
            evidence.innerHTML = '<span style="font-size:0.8rem; color:var(--admin-text-muted);">Aucune preuve photo.</span>';
        } else {
            disp.evidenceFiles.forEach(file => {
                if (file.url && file.url !== '#') {
                    const img = document.createElement('img');
                    img.src = file.url;
                    img.alt = file.name;
                    img.style.width = '65px';
                    img.style.height = '65px';
                    img.style.objectFit = 'cover';
                    img.style.borderRadius = '6px';
                    img.style.border = '1px solid var(--admin-border)';
                    evidence.appendChild(img);
                } else {
                    const span = document.createElement('span');
                    span.textContent = `📎 ${file.name}`;
                    span.style.fontSize = '0.78rem';
                    evidence.appendChild(span);
                }
            });
        }

        // Dialogue
        const chat = document.getElementById('arbitrationChatBox');
        chat.innerHTML = '';
        disp.messages.forEach(msg => {
            const bubble = document.createElement('div');
            bubble.style.padding = '6px 10px';
            bubble.style.borderRadius = '6px';
            bubble.style.marginBottom = '6px';
            bubble.style.lineHeight = '1.3';
            if (msg.sender === 'client') {
                bubble.style.background = 'rgba(123, 197, 227, 0.12)';
                bubble.style.alignSelf = 'flex-start';
                bubble.innerHTML = `<span style="color:#7BC5E3; font-weight:700;">Client:</span> ${msg.text}`;
            } else {
                bubble.style.background = 'rgba(229, 179, 69, 0.12)';
                bubble.style.alignSelf = 'flex-end';
                bubble.innerHTML = `<span style="color:#E5B345; font-weight:700;">Prestataire:</span> ${msg.text}`;
            }
            chat.appendChild(bubble);
        });
        chat.scrollTop = chat.scrollHeight;
    }

    function refreshDashboardData() {
        renderAdminTransactions();
        renderAdminWallets();
        updateAdminFinancesSummary();
        checkActiveDisputes();
    }

    // Enregistrement des configurations
    const configForm = document.getElementById('adminFinancesConfigForm');
    if (configForm) {
        const rates = window.LYANN_PAYMENTS.getConfig();
        document.getElementById('configCommissionRate').value = rates.commissionRate;
        document.getElementById('configProtectionFee').value = rates.protectionFee;

        configForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const r = parseFloat(document.getElementById('configCommissionRate').value);
            const p = parseFloat(document.getElementById('configProtectionFee').value);
            window.LYANN_PAYMENTS.saveConfig({ commissionRate: r, protectionFee: p });
            alert(`🟢 Configuration financière enregistrée ! Taux commission : ${r}%, Protection : ${p}€.`);
            updateAdminFinancesSummary();
        });
    }

    // Arbitration Actions
    document.getElementById('btnArbitrateRefundClient')?.addEventListener('click', () => {
        if (activeArbitrationTxId && confirm("Marquer la médiation comme terminée et procéder au remboursement du client ?")) {
            window.LYANN_PAYMENTS.resolveDispute(activeArbitrationTxId, 'resolved_client');
            alert("Remboursement client initié.");
            refreshDashboardData();
        }
    });

    document.getElementById('btnArbitratePayProvider')?.addEventListener('click', () => {
        if (activeArbitrationTxId && confirm("Valider les travaux et libérer les fonds restants au prestataire ?")) {
            window.LYANN_PAYMENTS.resolveDispute(activeArbitrationTxId, 'resolved_provider');
            alert("Paiement libéré vers le portefeuille.");
            refreshDashboardData();
        }
    });

    document.getElementById('btnArbitrateSplit50')?.addEventListener('click', () => {
        if (activeArbitrationTxId && confirm("Fermer le litige avec une répartition amiable de 50/50 ?")) {
            window.LYANN_PAYMENTS.resolveDispute(activeArbitrationTxId, 'resolved_split');
            alert("Arbitrage 50/50 enregistré.");
            refreshDashboardData();
        }
    });

    // Événements de synchronisation en direct avec le simulateur
    window.addEventListener('lyann_payment_tx_changed', refreshDashboardData);
    window.addEventListener('lyann_payment_wallets_changed', refreshDashboardData);
    window.addEventListener('lyann_payment_config_changed', refreshDashboardData);

    // Rendu dynamique du journal des notifications
    function renderNotificationsLogTable() {
        const tableBody = document.getElementById('notificationsLogTableBody');
        if (!tableBody) return;

        if (!window.LYANN_NOTIFICATIONS) {
            tableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--admin-text-muted); padding: 24px;">Module de notification indisponible.</td></tr>`;
            return;
        }

        const logs = window.LYANN_NOTIFICATIONS.getLogs();
        if (logs.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--admin-text-muted); padding: 24px;">Aucune notification automatique transmise pour le moment.</td></tr>`;
            return;
        }

        tableBody.innerHTML = logs.map(log => {
            const date = new Date(log.timestamp);
            const timeStr = date.toLocaleDateString('fr-FR') + ' ' + date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            
            const isEmail = log.channel === 'email';
            const channelBadge = isEmail 
                ? '<span class="status-badge" style="background: rgba(59, 130, 246, 0.15); color: #3B82F6;"><i class="ph ph-envelope"></i> EMAIL</span>' 
                : '<span class="status-badge" style="background: rgba(16, 185, 129, 0.15); color: #10B981;"><i class="ph ph-chat-text"></i> SMS</span>';
            
            const isSent = log.status === 'sent';
            const statusBadge = isSent 
                ? '<span class="status-badge active">TWILIO / SENDGRID ✅</span>' 
                : '<span class="status-badge" style="background: rgba(229, 175, 47, 0.15); color: #E5AF2F;"><i class="ph ph-monitor"></i> SIMULÉ 🖥️</span>';

            const cleanContent = log.content ? log.content.replace(/<[^>]*>/g, '').trim().substring(0, 80) + '...' : '';

            return `
                <tr>
                    <td>${timeStr}</td>
                    <td><strong>${log.recipientName}</strong></td>
                    <td style="font-family: monospace; font-size: 0.82rem;">${log.recipientContact}</td>
                    <td>${channelBadge}</td>
                    <td>
                        <div style="font-weight: 700; font-size: 0.85rem; margin-bottom: 2px;">${log.subject}</div>
                        <div style="font-size: 0.78rem; color: var(--admin-text-muted); max-width: 320px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${cleanContent}">${cleanContent}</div>
                    </td>
                    <td>${statusBadge}</td>
                </tr>
            `;
        }).join('');
    }

    window.addEventListener('lyann_notification_sent', renderNotificationsLogTable);

    // Chargement initial
    refreshDashboardData();
    renderNotificationsLogTable();

    console.log('🚀 Console d\'Administration LYANN Enterprise & Outil BI initialisés.');
});
