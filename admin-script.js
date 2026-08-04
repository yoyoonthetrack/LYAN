/* ==========================================================================
   LYANN DOM — ENTERPRISE BACK-OFFICE ADMIN ENGINE
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    // --------------------------------------------------------------------------
    // 1. NAVIGATION INTER-MODULES (11 PÔLES OPÉRATIONNELS)
    // --------------------------------------------------------------------------
    const navItems = document.querySelectorAll('.admin-nav-item');
    const sections = document.querySelectorAll('.admin-section');

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const targetSectionId = item.getAttribute('data-section');
            if (!targetSectionId) return;

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
            if (confirm('Approuver cette publication IA et la diffuser immédiatement sur Le Fil public ?')) {
                if (window.LYANN_AI_ECOSYSTEM) {
                    window.LYANN_AI_ECOSYSTEM.approvePendingPost(postId);
                }
                const row = document.getElementById(`ai-row-${postId.replace('pending-', '')}`);
                if (row) row.remove();
                alert('✅ Publication IA approuvée et diffusée sur Le Fil !');
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
            alert('🔄 Données analytiques et métriques BI synchronisées en temps réel.');
        });
    }

    console.log('🚀 Console d\'Administration LYANN Enterprise & Outil BI initialisés.');
});
