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

    console.log('🚀 Console d\'Administration LYANN Enterprise initialisée.');
});
