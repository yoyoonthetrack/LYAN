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
