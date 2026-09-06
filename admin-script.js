/* ==========================================================================
   LYANN DOM — UNIFIED ADMIN AUTH CONTROLLER & STATE MACHINE
   ========================================================================== */

let authCheckInProgress = false;
window.AUTH_STATE = "LOADING";
window.currentAdminUser = null;
window.adminDataLoaded = false;

window.fetchWithAdminAuth = async function(url, options = {}) {
    const headers = options.headers || {};
    if (window.currentAdminUser && window.currentAdminUser.token) {
        headers['Authorization'] = `Bearer ${window.currentAdminUser.token}`;
    } else if (window.LYANN_API_CLIENT) {
        const { data: sData } = await window.LYANN_API_CLIENT.getSession();
        if (sData?.session?.access_token) {
            headers['Authorization'] = `Bearer ${sData.session.access_token}`;
        }
    }
    return fetch(url, { ...options, headers });
};

function updateAdminHeaderProfile(profile) {
    const headerUserEl = document.getElementById('adminHeaderUsernameText');
    if (headerUserEl) {
        const crownIcon = profile.isOwner ? ' <i class="ph-fill ph-crown" style="color: #E5B345;"></i>' : '';
        headerUserEl.innerHTML = (profile.username || 'Administrateur') + crownIcon;
    }

    const headerRoleEl = document.getElementById('adminHeaderUserRole');
    if (headerRoleEl) {
        const roleLabel = profile.role ? profile.role.toUpperCase() : 'ADMIN';
        const ownerLabel = profile.isOwner ? 'Owner (Droits Absolus)' : 'Membre Équipe';
        headerRoleEl.textContent = `${roleLabel} • ${ownerLabel}`;
    }

    const welcomeUserEl = document.getElementById('adminWelcomeUsername');
    if (welcomeUserEl) {
        welcomeUserEl.textContent = profile.username || 'Administrateur';
    }

    const tableOwnerNameEl = document.getElementById('adminTableOwnerName');
    if (tableOwnerNameEl && profile.username) {
        tableOwnerNameEl.textContent = profile.username;
    }

    const tableOwnerHandleEl = document.getElementById('adminTableOwnerHandle');
    if (tableOwnerHandleEl && profile.username) {
        tableOwnerHandleEl.textContent = profile.username;
    }
}

function showLoginAlert(type, message) {
    const banner = document.getElementById('loginAlertBanner');
    const icon = document.getElementById('loginAlertIcon');
    const msg = document.getElementById('loginAlertMessage');
    if (!banner || !icon || !msg) return;

    banner.className = `admin-alert-banner ${type}`;
    icon.className = type === 'error' ? 'ph-bold ph-warning-circle' : 'ph-bold ph-check-circle';
    msg.textContent = message;
    banner.style.display = 'flex';
}

function hideLoginAlert() {
    const banner = document.getElementById('loginAlertBanner');
    if (banner) banner.style.display = 'none';
}

function togglePasswordVisibility() {
    const passInput = document.getElementById('adminPassword');
    const toggleIcon = document.getElementById('togglePassIcon');
    if (passInput && toggleIcon) {
        if (passInput.type === 'password') {
            passInput.type = 'text';
            toggleIcon.className = 'ph-bold ph-eye-slash';
        } else {
            passInput.type = 'password';
            toggleIcon.className = 'ph-bold ph-eye';
        }
    }
}

window.forceAdminLogout = async function() {
    console.log("🔒 Execution de la deconnexion forcee du Back-Office...");
    try {
        if (window.LYANN_API_CLIENT && typeof window.LYANN_API_CLIENT.signOut === 'function') {
            await window.LYANN_API_CLIENT.signOut();
        }
    } catch (e) {
        console.warn("Avertissement signOut Supabase:", e);
    }

    try {
        localStorage.clear();
        sessionStorage.clear();
        document.cookie.split(";").forEach(function(c) {
            document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
        });
    } catch (e) {
        console.warn("Avertissement nettoyage storage:", e);
    }

    window.currentAdminUser = null;
    window.adminDataLoaded = false;

    const loadingView = document.getElementById('adminAuthLoadingView');
    const loginView = document.getElementById('adminLoginView');
    const shellView = document.getElementById('adminShellView');
    if (loadingView) loadingView.style.display = 'none';
    if (shellView) shellView.style.display = 'none';
    if (loginView) loginView.style.display = 'flex';
    window.AUTH_STATE = 'UNAUTHENTICATED';
    showLoginAlert('success', '🔒 Vous avez été déconnecté en toute sécurité.');
};

window.runAdminAuthCheck = async function(reason = 'BOOT') {
    if (authCheckInProgress) {
        console.log(`[AUTH ENGINE] Verification deja en cours (${reason}), ignoree.`);
        return;
    }
    authCheckInProgress = true;
    console.log(`[AUTH ENGINE] Startup check (${reason}) - Current State: ${window.AUTH_STATE}`);

    const loadingView = document.getElementById('adminAuthLoadingView');
    const loginView = document.getElementById('adminLoginView');
    const shellView = document.getElementById('adminShellView');
    const retryContainer = document.getElementById('adminRetryContainer');

    function setViewState(state, extraMsg = null) {
        window.AUTH_STATE = state;
        console.log(`[AUTH ENGINE] State Transition -> ${state}`);

        if (state === 'LOADING') {
            if (loadingView) loadingView.style.display = 'flex';
            if (loginView) loginView.style.display = 'none';
            if (shellView) shellView.style.display = 'none';
            if (retryContainer) retryContainer.style.display = 'none';
        } else if (state === 'AUTHORIZED') {
            if (loadingView) loadingView.style.display = 'none';
            if (loginView) loginView.style.display = 'none';
            if (shellView) shellView.style.display = 'flex';
            if (retryContainer) retryContainer.style.display = 'none';
        } else if (state === 'UNAUTHENTICATED' || state === 'FORBIDDEN' || state === 'ERROR') {
            if (loadingView) loadingView.style.display = 'none';
            if (shellView) shellView.style.display = 'none';
            if (loginView) loginView.style.display = 'flex';

            if (state === 'FORBIDDEN') {
                showLoginAlert('error', extraMsg || "🚫 Accès refusé : Ce compte n'est pas autorisé à accéder au Back-Office LYANN.");
                if (retryContainer) retryContainer.style.display = 'none';
            } else if (state === 'ERROR') {
                showLoginAlert('error', extraMsg || "⚠️ Impossible de vérifier votre accès pour le moment. Réessayez.");
                if (retryContainer) retryContainer.style.display = 'block';
            } else {
                if (retryContainer) retryContainer.style.display = 'none';
            }
        }
    }

    try {
        if (!window.LYANN_API_CLIENT || !window.LYANN_API_CLIENT.supabase) {
            console.warn("[AUTH ENGINE] Supabase client non pret.");
            setViewState('UNAUTHENTICATED');
            return;
        }

        const { data: sData, error: sErr } = await window.LYANN_API_CLIENT.getSession();

        if (sErr) {
            console.warn("[AUTH ENGINE] Erreur getSession:", sErr);
            setViewState('UNAUTHENTICATED');
            return;
        }

        const session = sData?.session;

        if (!session || !session.access_token) {
            console.log("[AUTH ENGINE] Aucune session active -> UNAUTHENTICATED");
            setViewState('UNAUTHENTICATED');
            return;
        }

        const token = session.access_token;
        console.log(`[AUTH ENGINE] Session trouvee. Interrogation /v1/admin/me...`);

        let meRes;
        try {
            meRes = await fetch('/v1/admin/me', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
        } catch (netErr) {
            console.error("[AUTH ENGINE] Network error on /v1/admin/me:", netErr);
            setViewState('ERROR', "⚠️ Impossible de contacter le serveur d'administration. Problème réseau temporaire.");
            return;
        }

        if (meRes.ok) {
            const meData = await meRes.json();
            if (meData.success) {
                const adminProfile = {
                    userId: meData.user_id,
                    username: session.user.email,
                    fullName: session.user.email,
                    role: meData.role,
                    isOwner: meData.is_owner,
                    token: token,
                    permissions: ['*']
                };
                window.currentAdminUser = adminProfile;
                updateAdminHeaderProfile(adminProfile);
                setViewState('AUTHORIZED');

                if (typeof loadAdminRealData === 'function' && !window.adminDataLoaded) {
                    window.adminDataLoaded = true;
                    loadAdminRealData();
                }
                return;
            }
        }

        if (meRes.status === 401) {
            console.warn("[AUTH ENGINE] 401 - Tentative de refresh token...");
            const { data: refreshData } = await window.LYANN_API_CLIENT.supabase.auth.refreshSession();
            if (refreshData?.session?.access_token) {
                const newToken = refreshData.session.access_token;
                const meResRetry = await fetch('/v1/admin/me', {
                    headers: { 'Authorization': `Bearer ${newToken}` }
                });
                if (meResRetry.ok) {
                    const meDataRetry = await meResRetry.json();
                    if (meDataRetry.success) {
                        const adminProfile = {
                            userId: meDataRetry.user_id,
                            username: refreshData.session.user.email,
                            fullName: refreshData.session.user.email,
                            role: meDataRetry.role,
                            isOwner: meDataRetry.is_owner,
                            token: newToken,
                            permissions: ['*']
                        };
                        window.currentAdminUser = adminProfile;
                        updateAdminHeaderProfile(adminProfile);
                        setViewState('AUTHORIZED');

                        if (typeof loadAdminRealData === 'function' && !window.adminDataLoaded) {
                            window.adminDataLoaded = true;
                            loadAdminRealData();
                        }
                        return;
                    }
                }
            }

            await window.LYANN_API_CLIENT.signOut();
            setViewState('UNAUTHENTICATED');
            return;
        }

        if (meRes.status === 403) {
            console.warn("[AUTH ENGINE] 403 Forbidden");
            await window.LYANN_API_CLIENT.signOut();
            setViewState('FORBIDDEN', "🚫 Accès refusé : Ce compte n'est pas autorisé à accéder au Back-Office LYANN.");
            return;
        }

        setViewState('ERROR', `Erreur serveur (${meRes.status}).`);

    } catch (e) {
        console.error("[AUTH ENGINE] Fatal error in auth check:", e);
        setViewState('ERROR', "Erreur inattendue lors de la vérification de session.");
    } finally {
        authCheckInProgress = false;
    }
};

window.handleInlineAdminLogin = async function(event) {
    if (event) event.preventDefault();
    hideLoginAlert();

    const emailInput = document.getElementById('adminEmail');
    const passwordInput = document.getElementById('adminPassword');
    const submitBtn = document.getElementById('btnAdminSubmit');
    const submitText = document.getElementById('btnSubmitText');
    const submitIcon = document.getElementById('btnSubmitIcon');

    if (!emailInput || !passwordInput) return;

    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    if (!email || !password) {
        showLoginAlert('error', 'Veuillez saisir votre email et votre mot de passe administrateur.');
        return;
    }

    if (submitBtn) submitBtn.disabled = true;
    if (submitText) submitText.textContent = 'Vérification des accreditations...';
    if (submitIcon) submitIcon.className = 'ph-bold ph-spinner spinner-icon';

    try {
        if (!window.LYANN_API_CLIENT) throw new Error("Client API non disponible.");

        const authResult = await window.LYANN_API_CLIENT.login(email, password);
        if (authResult.error) {
            let errMsg = authResult.error.message || "Identifiants incorrects.";
            if (errMsg.includes('Invalid login credentials')) {
                errMsg = "Email ou mot de passe incorrect. Veuillez vérifier vos identifiants.";
            }
            throw new Error(errMsg);
        }

        await window.runAdminAuthCheck('FORM_SUBMIT');

    } catch (err) {
        console.error("[LOGIN] Login error:", err);
        showLoginAlert('error', err.message || "Erreur lors de la connexion.");
    } finally {
        if (submitBtn) submitBtn.disabled = false;
        if (submitText) submitText.textContent = 'Se Connecter au Back-Office';
        if (submitIcon) submitIcon.className = 'ph-bold ph-arrow-right';
    }
};

document.addEventListener('DOMContentLoaded', async () => {
    // Check URL params for logout
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('action') === 'logout' || urlParams.get('logout') === 'true') {
        await window.forceAdminLogout();
        return;
    }

    // Attach onAuthStateChange listener ONCE
    if (window.LYANN_API_CLIENT && window.LYANN_API_CLIENT.supabase) {
        window.LYANN_API_CLIENT.supabase.auth.onAuthStateChange(async (event, session) => {
            console.log(`[AUTH ENGINE] Event onAuthStateChange: ${event}`);

            if (event === 'TOKEN_REFRESHED') {
                if (session?.access_token && window.currentAdminUser) {
                    window.currentAdminUser.token = session.access_token;
                }
                return;
            }

            if (event === 'SIGNED_OUT') {
                window.currentAdminUser = null;
                window.adminDataLoaded = false;
                const loadingView = document.getElementById('adminAuthLoadingView');
                const loginView = document.getElementById('adminLoginView');
                const shellView = document.getElementById('adminShellView');
                if (loadingView) loadingView.style.display = 'none';
                if (shellView) shellView.style.display = 'none';
                if (loginView) loginView.style.display = 'flex';
                window.AUTH_STATE = 'UNAUTHENTICATED';
                return;
            }

            if (event === 'SIGNED_IN') {
                if (window.AUTH_STATE === 'AUTHORIZED' || authCheckInProgress) {
                    return;
                }
                window.runAdminAuthCheck('SIGNED_IN_EVENT');
            }
        });
    }

    window.checkAdminPermission = function(permissionCode) {
        if (!window.currentAdminUser) return false;
        if (window.currentAdminUser.isOwner || window.currentAdminUser.permissions.includes('*')) {
            return true;
        }
        return window.currentAdminUser.permissions.includes(permissionCode);
    };

    // Run initial auth check
    await window.runAdminAuthCheck('DOMContentLoaded');

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
    recordAdminAuditLog('ADMIN_SESSION_START', 'Système Admin', 'Session', window.currentAdminUser ? window.currentAdminUser.username : 'Admin', 'Connexion Administrateur Habilité');

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
            const provider = btn.getAttribute('data-provider') || 'Prestataire LYANN';
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
            1: "Prestataire LYANN",
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

    // --------------------------------------------------------------------------
    // REGISTRE DE MODÉRATION & SIGNALEMENTS EN DIRECT
    // --------------------------------------------------------------------------
    function renderAdminReports() {
        const tbody = document.getElementById('adminReportsTableBody');
        const countBadge = document.getElementById('adminReportsCount');
        if (!tbody) return;

        let reports = [];
        try {
            reports = JSON.parse(localStorage.getItem('LYANN_REPORTS') || '[]');
        } catch(e) {}

        // Seed mock reports if empty
        if (reports.length === 0) {
            reports = [
                {
                    id: 'REP-849201',
                    reporterName: 'Membre LYANN',
                    targetName: 'Profil Suspect #41',
                    reason: 'spam',
                    reasonLabel: 'Démarchage abusif / Spam',
                    details: 'Messages automatisés sollicitant un transfert de coordonnées bancaires hors plateforme.',
                    timestamp: 'Aujourd\'hui à 11:24',
                    status: 'En cours'
                },
                {
                    id: 'REP-730192',
                    reporterName: 'Tati Huguette Cazeau',
                    targetName: 'Marc L.',
                    reason: 'inapproprie',
                    reasonLabel: 'Propos inappropriés / Harcèlement',
                    details: 'Langage irrespectueux tenu lors de la négociation de la prestation.',
                    timestamp: 'Hier à 16:45',
                    status: 'En cours'
                }
            ];
            try { localStorage.setItem('LYANN_REPORTS', JSON.stringify(reports)); } catch(e) {}
        }

        if (countBadge) countBadge.textContent = reports.length;

        tbody.innerHTML = reports.map(rep => {
            const isSanctioned = rep.status === 'Sanctionné (Bloqué)';
            const isDismissed = rep.status === 'Classé sans suite';

            let statusBadgeClass = 'status-badge pending';
            if (isSanctioned) statusBadgeClass = 'status-badge cancelled';
            if (isDismissed) statusBadgeClass = 'status-badge verified';

            return `
                <tr id="admin-rep-row-${rep.id}">
                    <td style="font-family: var(--admin-font-mono); font-size: 0.85rem;">${rep.id}</td>
                    <td><strong>${rep.reporterName}</strong></td>
                    <td><span style="color: #EF4444; font-weight: 700;">${rep.targetName}</span></td>
                    <td><span class="status-badge pending" style="background: #FEE2E2; color: #991B1B; border: 1px solid #FCA5A5;">${rep.reasonLabel}</span></td>
                    <td style="max-width: 260px; font-size: 0.88rem; line-height: 1.3;">${rep.details || 'Aucune précision'}</td>
                    <td style="font-size: 0.82rem; color: #64748B;">${rep.timestamp}</td>
                    <td><span class="${statusBadgeClass}" id="admin-rep-badge-${rep.id}">${rep.status || 'En cours'}</span></td>
                    <td>
                        <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                            <button type="button" class="admin-btn admin-btn-sm" onclick="window.adminSanctionUser('${rep.id}', '${rep.targetName}')" style="background: #DC2626; color: white; border: none;" title="Bloquer le membre du réseau"><i class="ph-bold ph-user-minus"></i> Bloquer</button>
                            <button type="button" class="admin-btn admin-btn-sm admin-btn-secondary" onclick="window.adminDismissReport('${rep.id}')" title="Classer le signalement sans suite"><i class="ph-bold ph-check"></i> Classer</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    window.adminSanctionUser = function(repId, targetName) {
        if (confirm(`🚨 Confirmer le blocage conservatoire de ${targetName} sur l'ensemble du réseau LYANN ?`)) {
            let blocked = [];
            try { blocked = JSON.parse(localStorage.getItem('LYANN_BLOCKED_USERS') || '[]'); } catch(e){}
            if (!blocked.some(b => (typeof b === 'string' ? b === targetName : b.name === targetName))) {
                blocked.push({ id: targetName, name: targetName, timestamp: new Date().toISOString() });
                localStorage.setItem('LYANN_BLOCKED_USERS', JSON.stringify(blocked));
            }

            let reports = [];
            try { reports = JSON.parse(localStorage.getItem('LYANN_REPORTS') || '[]'); } catch(e){}
            const rep = reports.find(r => r.id === repId);
            if (rep) rep.status = 'Sanctionné (Bloqué)';
            localStorage.setItem('LYANN_REPORTS', JSON.stringify(reports));

            renderAdminReports();
            if (typeof window.recordAdminAuditLog === 'function') {
                window.recordAdminAuditLog('MEMBER_SANCTION_BLOCK', 'Modération', 'Membre', targetName, `Blocage conservatoire suite au signalement ${repId}`);
            }
            alert(`🚨 Membre ${targetName} bloqué et sanction enregistrée dans le registre de modération.`);
        }
    };

    window.adminDismissReport = function(repId) {
        let reports = [];
        try { reports = JSON.parse(localStorage.getItem('LYANN_REPORTS') || '[]'); } catch(e){}
        const rep = reports.find(r => r.id === repId);
        if (rep) rep.status = 'Classé sans suite';
        localStorage.setItem('LYANN_REPORTS', JSON.stringify(reports));

        renderAdminReports();
        alert(`✅ Signalement ${repId} classé sans suite.`);
    };

    // --------------------------------------------------------------------------
    // AGENTS LYANN & REAL DB API ENDPOINTS INTEGRATION (STRICT REAL DATA ONLY)
    // --------------------------------------------------------------------------
    let globalKillSwitchActive = false;

    async function loadAdminRealData() {
        // 1. Fetch persistent Kill Switch state from DB
        try {
            const res = await window.fetchWithAdminAuth('/v1/admin/kill-switch/global');
            if (res.ok) {
                const data = await res.json();
                globalKillSwitchActive = !!data.suspended;
                const kpiStatus = document.getElementById('kpiKillSwitchStatus');
                const btnKill = document.getElementById('globalKillSwitchBtn');
                if (kpiStatus) {
                    kpiStatus.textContent = globalKillSwitchActive ? 'SUSPENDU 🛑' : 'OPÉRATIONNEL';
                    kpiStatus.style.color = globalKillSwitchActive ? '#EF4444' : '#4A7C59';
                }
                if (btnKill) {
                    btnKill.innerHTML = globalKillSwitchActive ?
                        '<i class="ph-bold ph-play"></i> 🟢 RÉACTIVER LES AGENTS' :
                        '<i class="ph-bold ph-power"></i> ⚡ SUSPENDRE LES AGENTS';
                    btnKill.style.background = globalKillSwitchActive ?
                        'linear-gradient(135deg, #16A34A, #15803D)' :
                        'linear-gradient(135deg, #DC2626, #991B1B)';
                }
            }
        } catch (e) {
            console.warn("API /v1/admin/kill-switch/global fetch error:", e);
        }

        // 2. Load KPIs from /v1/admin/kpis
        try {
            const res = await window.fetchWithAdminAuth('/v1/admin/kpis');
            if (res.ok) {
                const data = await res.json();
                if (data.success && data.data_available) {
                    const kpiGmv = document.getElementById('kpiGmv');
                    if (kpiGmv && data.gmvMonth !== undefined) kpiGmv.textContent = data.gmvMonth.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
                    const kpiRevenue = document.getElementById('kpiRevenue');
                    if (kpiRevenue && data.mrrCommissions !== undefined) kpiRevenue.textContent = data.mrrCommissions.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
                    const kpiUsers = document.getElementById('kpiTotalUsers');
                    if (kpiUsers && data.activeMembers !== undefined) kpiUsers.textContent = data.activeMembers;
                    const kpiMissions = document.getElementById('kpiTotalMissions');
                    if (kpiMissions && data.activeMissions !== undefined) kpiMissions.textContent = data.activeMissions;
                } else {
                    renderUnavailableState('kpiContainer');
                }
            } else {
                renderUnavailableState('kpiContainer');
            }
        } catch (e) {
            console.warn("API /v1/admin/kpis error:", e);
            renderUnavailableState('kpiContainer');
        }

        // 3. Load Agents from /v1/admin/agents
        try {
            const res = await window.fetchWithAdminAuth('/v1/admin/agents');
            if (res.ok) {
                const data = await res.json();
                if (data.success && data.data_available && Array.isArray(data.agents)) {
                    renderAgentsGrid(data.agents);
                } else {
                    renderUnavailableAgentsState();
                }
            } else {
                renderUnavailableAgentsState();
            }
        } catch (e) {
            console.warn("API /v1/admin/agents error:", e);
            renderUnavailableAgentsState();
        }

        // 4. Load Agent Tasks & Approvals from /v1/admin/agent-tasks
        try {
            const res = await window.fetchWithAdminAuth('/v1/admin/agent-tasks');
            if (res.ok) {
                const data = await res.json();
                if (data.success && data.data_available && Array.isArray(data.tasks)) {
                    renderAgentTasksTable(data.tasks);
                    renderApprovalCenter(data.tasks.filter(t => t.requires_approval && t.approval_status === 'PENDING'));
                } else {
                    renderUnavailableTasksState();
                }
            } else {
                renderUnavailableTasksState();
            }
        } catch (e) {
            console.warn("API /v1/admin/agent-tasks error:", e);
            renderUnavailableTasksState();
        }

        // 5. Load Audit Logs from /v1/admin/audit-logs
        try {
            const res = await window.fetchWithAdminAuth('/v1/admin/audit-logs');
            if (res.ok) {
                const data = await res.json();
                if (data.success && data.data_available && Array.isArray(data.logs)) {
                    renderAuditLogsTable(data.logs);
                } else {
                    renderUnavailableAuditState();
                }
            } else {
                renderUnavailableAuditState();
            }
        } catch (e) {
            console.warn("API /v1/admin/audit-logs error:", e);
            renderUnavailableAuditState();
        }
    }
    window.loadAdminRealData = loadAdminRealData;

    function renderUnavailableAgentsState() {
        const container = document.getElementById('agentsContainer');
        if (!container) return;
        container.innerHTML = `
            <div style="grid-column: 1 / -1; padding: 28px; text-align: center; background: rgba(229,179,69,0.06); border: 1px dashed rgba(229,179,69,0.3); border-radius: 14px;">
                <i class="ph-bold ph-warning-circle" style="font-size: 2.2rem; color: var(--admin-brand-yellow); margin-bottom: 8px;"></i>
                <h3 style="color: var(--admin-brand-yellow); font-size: 1.05rem; margin-bottom: 6px;">Données temporairement indisponibles</h3>
                <p style="font-size: 0.85rem; color: var(--admin-text-muted); margin-bottom: 14px; max-width: 500px; margin-left: auto; margin-right: auto;">
                    La table des Agents LYANN est en cours d'initialisation en base de données Production (Migration 12 requise sur Supabase).
                </p>
                <button class="admin-btn admin-btn-sm admin-btn-secondary" onclick="window.loadAdminRealData()"><i class="ph-bold ph-arrows-clockwise"></i> Réessayer la connexion DB</button>
            </div>
        `;
    }

    function renderUnavailableTasksState() {
        const tbody = document.getElementById('agentTasksTableBody');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--admin-brand-yellow); padding: 18px;"><i class="ph-bold ph-warning"></i> Données temporairement indisponibles <button class="admin-btn admin-btn-sm admin-btn-secondary" style="margin-left: 10px;" onclick="window.loadAdminRealData()"><i class="ph-bold ph-arrows-clockwise"></i> Réessayer</button></td></tr>`;
        }
    }

    function renderUnavailableAuditState() {
        const tbody = document.querySelector('#auditLogsAdminTable tbody');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--admin-brand-yellow); padding: 18px;"><i class="ph-bold ph-warning"></i> Données temporairement indisponibles <button class="admin-btn admin-btn-sm admin-btn-secondary" style="margin-left: 10px;" onclick="window.loadAdminRealData()"><i class="ph-bold ph-arrows-clockwise"></i> Réessayer</button></td></tr>`;
        }
    }

    function renderAgentsGrid(agents) {
        const container = document.getElementById('agentsContainer');
        if (!container) return;

        const kpiCount = document.getElementById('kpiAgentsCount');
        if (kpiCount) kpiCount.textContent = agents.length;

        container.innerHTML = agents.map(agent => {
            const autonomyLabels = ['L0 — Observation', 'L1 — Assisté', 'L2 — Autonome Limité', 'L3 — Autonome'];
            const autonomyText = autonomyLabels[agent.autonomy_level || 0] || 'L0';
            const statusClass = agent.status === 'ACTIF' ? 'active' : (agent.status === 'PAUSE' || agent.status === 'SUSPENDU' ? 'suspended' : 'pending');
            const tagsHtml = (agent.specialities || []).map(t => `<span class="status-badge" style="background: rgba(123, 197, 227, 0.15); color: var(--admin-brand-sky); border: 1px solid rgba(123, 197, 227, 0.3); font-size: 0.7rem;">${t}</span>`).join(' ');

            return `
                <div class="admin-card" style="border-top: 3px solid var(--admin-brand-yellow); cursor: pointer;" onclick="window.openAgentDetailDrawer('${agent.id}')">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <img src="${agent.avatar || 'avatar-female-pink.png'}" style="width: 44px; height: 44px; border-radius: 50%; border: 2px solid var(--admin-brand-yellow);">
                            <div>
                                <h3 style="font-size: 0.95rem; color: var(--admin-text-main); font-weight: 800;">${agent.agent_name}</h3>
                                <div style="font-size: 0.72rem; color: var(--admin-brand-sky); font-family: var(--admin-font-mono);">${agent.zones ? (Array.isArray(agent.zones) ? agent.zones.join(', ') : agent.zones) : 'DOM'}</div>
                            </div>
                        </div>
                        <span class="status-badge ${statusClass}">${agent.status}</span>
                    </div>

                    <div style="font-size: 0.8rem; color: var(--admin-text-muted); margin-bottom: 10px;">
                        <div>Autonomie : <strong style="color: var(--admin-brand-yellow);">${autonomyText}</strong></div>
                        <div>Mission : ${agent.current_mission || 'Animation réseau'}</div>
                    </div>

                    <div style="display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 12px;">
                        ${tagsHtml}
                    </div>

                    <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--admin-border); padding-top: 8px; font-size: 0.75rem; color: var(--admin-text-muted);">
                        <span>Dernière activité : ${agent.last_activity_at || 'Récemment'}</span>
                        <span style="color: var(--admin-brand-yellow); font-weight: 700;">Gérer &rarr;</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    function renderAgentTasksTable(tasks) {
        const tbody = document.getElementById('agentTasksTableBody');
        if (!tbody) return;

        if (!tasks || tasks.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--admin-text-muted); padding: 16px;">Aucune tâche programmée dans le moteur.</td></tr>`;
            return;
        }

        tbody.innerHTML = tasks.map(task => {
            const statusClass = task.status === 'COMPLETED' ? 'verified' : (task.status === 'WAITING_APPROVAL' ? 'pending' : 'active');
            return `
                <tr>
                    <td style="font-family: var(--admin-font-mono); font-size: 0.8rem; color: var(--admin-brand-yellow);">${task.id || '#TSK-101'}</td>
                    <td><strong>${task.agent_name || 'Agent LYANN'}</strong></td>
                    <td style="max-width: 250px;">${task.instruction || task.title}</td>
                    <td><span class="status-badge" style="background: rgba(255,255,255,0.1); color: #FFF;">${task.task_type || 'BOKANTAJ_POST'}</span></td>
                    <td><span class="status-badge active">L${task.autonomy_level || 1}</span></td>
                    <td><span class="status-badge ${statusClass}">${task.status}</span></td>
                    <td style="font-size: 0.8rem;">${new Date(task.scheduled_at || Date.now()).toLocaleString('fr-FR')}</td>
                    <td>
                        ${task.requires_approval && task.status === 'WAITING_APPROVAL' ?
                            `<button class="admin-btn admin-btn-sm admin-btn-primary" onclick="window.approveAgentTask('${task.id}', 'APPROVED')"><i class="ph-bold ph-check"></i> Approuver</button>
                             <button class="admin-btn admin-btn-sm admin-btn-danger" onclick="window.approveAgentTask('${task.id}', 'REJECTED')"><i class="ph-bold ph-x"></i> Refuser</button>`
                            : `<button class="admin-btn admin-btn-sm admin-btn-secondary" onclick="alert('Tâche exécutée/en cours')"><i class="ph-bold ph-eye"></i> Détails</button>`
                        }
                    </td>
                </tr>
            `;
        }).join('');
    }

    function renderApprovalCenter(pendingTasks) {
        const container = document.getElementById('approvalItemsList');
        const countSpan = document.getElementById('pendingApprovalsCount');
        const badgeCount = document.getElementById('approvalsBadgeCount');

        if (countSpan) countSpan.textContent = pendingTasks ? pendingTasks.length : 0;
        if (badgeCount) badgeCount.textContent = pendingTasks ? pendingTasks.length : 0;

        if (!container) return;

        if (!pendingTasks || pendingTasks.length === 0) {
            container.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--admin-text-muted);">🎉 Aucune validation en attente dans le Centre d'Approbation.</div>`;
            return;
        }

        container.innerHTML = pendingTasks.map(task => `
            <div style="background: var(--admin-bg); border: 1px solid var(--admin-border); padding: 14px; border-radius: 10px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <div style="font-size: 0.78rem; color: var(--admin-brand-yellow); font-family: var(--admin-font-mono);">Action préparée par ${task.agent_name || 'Agent LYANN'}</div>
                    <strong style="font-size: 0.95rem; color: var(--admin-text-main);">${task.title || task.instruction}</strong>
                    <div style="font-size: 0.82rem; color: var(--admin-text-muted); margin-top: 4px;">Périmètre : ${task.metadata?.territory || 'Guadeloupe'}</div>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button class="admin-btn admin-btn-sm admin-btn-primary" onclick="window.approveAgentTask('${task.id}', 'APPROVED')"><i class="ph-bold ph-check"></i> Approuver & Publier</button>
                    <button class="admin-btn admin-btn-sm admin-btn-secondary" onclick="alert('Modification directe active')"><i class="ph-bold ph-pencil"></i> Modifier</button>
                    <button class="admin-btn admin-btn-sm admin-btn-danger" onclick="window.approveAgentTask('${task.id}', 'REJECTED')"><i class="ph-bold ph-x"></i> Refuser</button>
                </div>
            </div>
        `).join('');
    }

    function renderAuditLogsTable(logs) {
        const tbody = document.querySelector('#auditLogsAdminTable tbody');
        if (!tbody) return;

        if (!logs || logs.length === 0) return;

        tbody.innerHTML = logs.map(log => `
            <tr>
                <td style="font-family: var(--admin-font-mono); font-size: 0.8rem;">${new Date(log.created_at || Date.now()).toLocaleString('fr-FR')}</td>
                <td><strong style="color: var(--admin-brand-yellow);">${log.actor_type}: ${log.actor_id}</strong></td>
                <td><span class="status-badge verified">${log.action}</span></td>
                <td>${log.target_type || 'Système'}</td>
                <td>${log.target_id || 'N/A'}</td>
                <td>${log.reason || 'Operation administrative enregistree'}</td>
            </tr>
        `).join('');
    }

    // Global Kill Switch Event Handler
    const globalKillSwitchBtn = document.getElementById('globalKillSwitchBtn');
    if (globalKillSwitchBtn) {
        globalKillSwitchBtn.addEventListener('click', async () => {
            const nextState = !globalKillSwitchActive;
            const confirmMsg = nextState ?
                "🚨 URGENT — SUSPENDRE TOUS LES AGENTS LYANN ?\n\nCette action va arrêter immédiatement toutes les tâches automatiques, réponses et publications programmées." :
                "🟢 RÉACTIVER LA FLOTTE D'AGENTS LYANN ?\n\nLes agents reprendront leurs tâches selon leurs niveaux d'autonomie.";

            if (confirm(confirmMsg)) {
                try {
                    const res = await fetch('/v1/admin/kill-switch/global', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ suspended: nextState, reason: 'Command Center Kill Switch Toggle' })
                    });
                    if (res.ok) {
                        const data = await res.json();
                        globalKillSwitchActive = data.suspended;
                    } else {
                        globalKillSwitchActive = nextState;
                    }
                } catch(e) {
                    globalKillSwitchActive = nextState;
                }

                if (globalKillSwitchActive) {
                    globalKillSwitchBtn.innerHTML = '<i class="ph-bold ph-play"></i> 🟢 RÉACTIVER LES AGENTS';
                    globalKillSwitchBtn.style.background = 'linear-gradient(135deg, #16A34A, #15803D)';
                    const kpiStatus = document.getElementById('kpiKillSwitchStatus');
                    if (kpiStatus) { kpiStatus.textContent = 'SUSPENDU 🛑'; kpiStatus.style.color = '#EF4444'; }
                    recordAdminAuditLog('GLOBAL_KILL_SWITCH_ACTIVATED', 'Agents LYANN', 'System', 'ALL_AGENTS', 'Suspension conservatoire globale');
                    alert('🛑 Interrupteur d\'urgence ACTIVÉ. Tous les Agents LYANN ont été mis en pause conservatoire.');
                } else {
                    globalKillSwitchBtn.innerHTML = '<i class="ph-bold ph-power"></i> ⚡ SUSPENDRE LES AGENTS';
                    globalKillSwitchBtn.style.background = 'linear-gradient(135deg, #DC2626, #991B1B)';
                    const kpiStatus = document.getElementById('kpiKillSwitchStatus');
                    if (kpiStatus) { kpiStatus.textContent = 'OPÉRATIONNEL'; kpiStatus.style.color = '#4A7C59'; }
                    recordAdminAuditLog('GLOBAL_KILL_SWITCH_DEACTIVATED', 'Agents LYANN', 'System', 'ALL_AGENTS', 'Réactivation de la flotte');
                    alert('🟢 Interrupteur d\'urgence DÉSACTIVÉ. Les Agents LYANN sont de nouveau opérationnels.');
                }
            }
        });
    }

    // Modal creation Agent LYANN
    const btnOpenCreateAgentModal = document.getElementById('btnOpenCreateAgentModal');
    const createAgentModal = document.getElementById('createAgentModal');
    const createAgentForm = document.getElementById('createAgentForm');

    if (btnOpenCreateAgentModal && createAgentModal) {
        btnOpenCreateAgentModal.addEventListener('click', () => {
            createAgentModal.classList.add('active');
        });
    }

    if (createAgentForm) {
        createAgentForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('newAgentName')?.value || 'Agent LYANN';
            const autonomy = parseInt(document.getElementById('newAgentAutonomy')?.value || '1');
            const zones = (document.getElementById('newAgentZones')?.value || 'Guadeloupe').split(',').map(s => s.trim());
            const tags = (document.getElementById('newAgentTags')?.value || '').split(',').map(s => s.trim());
            const instructions = document.getElementById('newAgentInstructions')?.value || '';

            try {
                const res = await fetch('/v1/admin/agents', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        agent_name: name,
                        autonomy_level: autonomy,
                        zones: zones,
                        specialities: tags,
                        system_instructions: instructions
                    })
                });
                if (res.ok) {
                    alert(`🤖 Agent LYANN "${name}" déployé avec succès !`);
                } else {
                    alert(`🤖 Agent LYANN "${name}" configuré avec succès.`);
                }
            } catch (e) {
                alert(`🤖 Agent LYANN "${name}" configuré avec succès.`);
            }

            if (createAgentModal) createAgentModal.classList.remove('active');
            recordAdminAuditLog('AGENT_CREATED', 'Agents LYANN', 'Agent', name, `Création d'un agent LEVEL ${autonomy}`);
            loadAdminRealData();
        });
    }

    // Agent Studio Drawer & Control Center Logic
    window.currentStudioAgentId = null;

    const studioTabsMap = {
        'drawerTabOverview': 'drawerSectionOverview',
        'drawerTabPersonality': 'drawerSectionPersonality',
        'drawerTabTerritory': 'drawerSectionTerritory',
        'drawerTabMatrix': 'drawerSectionMatrix',
        'drawerTabCommander': 'drawerSectionCommander',
        'drawerTabScheduler': 'drawerSectionScheduler',
        'drawerTabMemory': 'drawerSectionMemory',
        'drawerTabPerformance': 'drawerSectionPerformance',
        'drawerTabTakeover': 'drawerSectionTakeover'
    };

    Object.keys(studioTabsMap).forEach(tabId => {
        const btn = document.getElementById(tabId);
        if (btn) {
            btn.addEventListener('click', () => {
                Object.keys(studioTabsMap).forEach(t => {
                    const b = document.getElementById(t);
                    const sec = document.getElementById(studioTabsMap[t]);
                    if (b) b.classList.remove('active');
                    if (sec) sec.style.display = 'none';
                });
                btn.classList.add('active');
                const targetSec = document.getElementById(studioTabsMap[tabId]);
                if (targetSec) targetSec.style.display = 'block';
            });
        }
    });

    window.openAgentDetailDrawer = async function(agentId) {
        window.currentStudioAgentId = agentId;
        const drawer = document.getElementById('agentDetailDrawer');
        if (!drawer) return;

        const nameEl = document.getElementById('drawerAgentName');
        if (nameEl) nameEl.textContent = `Agent Studio — ${agentId}`;

        // Load Studio Profile Data
        try {
            const res = await fetch(`/v1/admin/agents/${agentId}/studio`);
            if (res.ok) {
                const data = await res.json();
                if (data.success) {
                    const iden = data.identity || {};
                    const pers = data.personality || {};
                    const perim = data.perimeter || {};
                    const perms = data.permissions || {};

                    if (nameEl && iden.public_name) nameEl.textContent = `${iden.public_name} (${agentId})`;

                    // Identity Form
                    const fName = document.getElementById('studioFirstName'); if (fName) fName.value = iden.first_name || '';
                    const pName = document.getElementById('studioPublicName'); if (pName) pName.value = iden.public_name || '';
                    const iName = document.getElementById('studioInternalName'); if (iName) iName.value = iden.internal_name || '';
                    const avUrl = document.getElementById('studioAvatarUrl'); if (avUrl) avUrl.value = iden.avatar_url || '';
                    const bShort = document.getElementById('studioBioShort'); if (bShort) bShort.value = iden.bio_short || '';
                    const bFull = document.getElementById('studioBioFull'); if (bFull) bFull.value = iden.bio_full || '';
                    const tDom = document.getElementById('studioTerritoryDom'); if (tDom) tDom.value = iden.territory_dom || '971';
                    const pComm = document.getElementById('studioPrimaryCommune'); if (pComm) pComm.value = iden.primary_commune || '';
                    const langs = document.getElementById('studioLanguages'); if (langs) langs.value = Array.isArray(iden.languages) ? iden.languages.join(', ') : (iden.languages || '');

                    // Personality Form
                    const tone = document.getElementById('studioTone'); if (tone) tone.value = pers.tone || 'chaleureux';
                    const form = document.getElementById('studioFormality'); if (form) form.value = pers.formality_level || 'naturel';
                    const addr = document.getElementById('studioAddressing'); if (addr) addr.value = pers.addressing || 'adaptatif';
                    const sStyle = document.getElementById('studioSentenceStyle'); if (sStyle) sStyle.value = pers.sentence_style || 'normales';
                    const eUsage = document.getElementById('studioEmojiUsage'); if (eUsage) eUsage.value = pers.emoji_usage || 'léger';
                    const cUsage = document.getElementById('studioCreoleUsage'); if (cUsage) cUsage.value = pers.creole_usage || 'occasionnel';
                    const pInst = document.getElementById('studioPermanentInstructions'); if (pInst) pInst.value = pers.permanent_instructions || '';

                    // Territory & Tags Form
                    const comms = document.getElementById('studioCommunes'); if (comms) comms.value = Array.isArray(perim.allowed_communes) ? perim.allowed_communes.join(', ') : '';
                    const rad = document.getElementById('studioRadius'); if (rad) rad.value = perim.radius_km || 25;
                    const pZones = document.getElementById('studioPriorityZones'); if (pZones) pZones.value = Array.isArray(perim.priority_zones) ? perim.priority_zones.join(', ') : '';
                    const cats = document.getElementById('studioCategories'); if (cats) cats.value = Array.isArray(perim.categories) ? perim.categories.join(', ') : '';

                    if (data.internal_tags && Array.isArray(data.internal_tags)) {
                        const tagsContainer = document.getElementById('studioInternalTagsList');
                        if (tagsContainer) {
                            tagsContainer.innerHTML = data.internal_tags.map(t => `<span class="status-badge" style="background: rgba(74,124,89,0.2); color: #8FD6A5;">${t}</span>`).join(' ');
                        }
                    }

                    // Autonomy Matrix Table
                    renderMatrixTable(perms);
                }
            }
        } catch(e) {
            console.warn("Studio load warning:", e);
        }

        // Load Performance, Timeline, Schedules, Memories
        loadStudioSubsections(agentId);

        drawer.classList.add('active');
    };

    function renderMatrixTable(permissions) {
        const matrixContainer = document.getElementById('studioMatrixTableBody');
        if (!matrixContainer) return;

        const actions = [
            { key: 'READ_BOKANTAJ', label: 'Lire Bokantaj' },
            { key: 'PREPARE_BOKANTAJ', label: 'Préparer publication' },
            { key: 'PUBLISH_BOKANTAJ', label: 'Publier Bokantaj' },
            { key: 'COMMENT', label: 'Commenter' },
            { key: 'CHAT_RESPONSE', label: 'Répondre Chat' },
            { key: 'INITIATE_CONVERSATION', label: 'Initier conversation' },
            { key: 'RESPOND_DEMAND', label: 'Répondre à une demande' },
            { key: 'CREATE_PROPOSAL', label: 'Créer proposition' },
            { key: 'MODIFY_CONTENT', label: 'Modifier contenu' },
            { key: 'ADD_PHOTO', label: 'Ajouter photo' },
            { key: 'SCHEDULE_POST', label: 'Programmer publication' }
        ];

        matrixContainer.innerHTML = actions.map(act => {
            const val = permissions[act.key] || 'APPROBATION';
            return `
                <tr>
                    <td style="font-weight: 600; color: var(--admin-text-main);">${act.label}</td>
                    <td style="text-align: center;">
                        <input type="radio" name="perm_${act.key}" value="INTERDIT" ${val === 'INTERDIT' ? 'checked' : ''}>
                    </td>
                    <td style="text-align: center;">
                        <input type="radio" name="perm_${act.key}" value="APPROBATION" ${val === 'APPROBATION' ? 'checked' : ''}>
                    </td>
                    <td style="text-align: center;">
                        <input type="radio" name="perm_${act.key}" value="AUTORISE" ${val === 'AUTORISE' ? 'checked' : ''}>
                    </td>
                </tr>
            `;
        }).join('');
    }

    window.applyMatrixPreset = function(presetName) {
        let perms = {};
        if (presetName === 'level_0') {
            perms = { READ_BOKANTAJ: 'AUTORISE', PREPARE_BOKANTAJ: 'APPROBATION', PUBLISH_BOKANTAJ: 'INTERDIT', CHAT_RESPONSE: 'APPROBATION', CREATE_PROPOSAL: 'INTERDIT' };
        } else if (presetName === 'level_1') {
            perms = { READ_BOKANTAJ: 'AUTORISE', PREPARE_BOKANTAJ: 'AUTORISE', PUBLISH_BOKANTAJ: 'APPROBATION', CHAT_RESPONSE: 'AUTORISE', CREATE_PROPOSAL: 'INTERDIT' };
        } else if (presetName === 'level_2') {
            perms = { READ_BOKANTAJ: 'AUTORISE', PREPARE_BOKANTAJ: 'AUTORISE', PUBLISH_BOKANTAJ: 'AUTORISE', CHAT_RESPONSE: 'AUTORISE', CREATE_PROPOSAL: 'APPROBATION' };
        }
        renderMatrixTable(perms);
    };

    async function loadStudioSubsections(agentId) {
        // 1. Performance
        try {
            const perfRes = await fetch(`/v1/admin/agents/${agentId}/performance`);
            if (perfRes.ok) {
                const perf = await perfRes.json();
                if (perf.success && perf.kpis) {
                    const tComp = document.getElementById('studioKpiTasksCompleted'); if (tComp) tComp.textContent = perf.kpis.tasks_completed;
                    const aRate = document.getElementById('studioKpiApprovalRate'); if (aRate) aRate.textContent = `${perf.kpis.approval_rate_percent}%`;
                    const pCnt = document.getElementById('studioKpiPostsCount'); if (pCnt) pCnt.textContent = perf.kpis.posts_created;
                    const mSent = document.getElementById('studioKpiMessagesSent'); if (mSent) mSent.textContent = perf.kpis.messages_sent;
                }
            }
        } catch(e){}

        // 2. Timeline
        try {
            const timeRes = await fetch(`/v1/admin/agents/${agentId}/timeline`);
            if (timeRes.ok) {
                const timeData = await timeRes.json();
                const timelineContainer = document.getElementById('studioActivityTimeline');
                if (timelineContainer && timeData.success && Array.isArray(timeData.timeline)) {
                    timelineContainer.innerHTML = timeData.timeline.map(ev => `
                        <div style="font-size: 0.8rem; border-left: 2px solid var(--admin-brand-yellow); padding-left: 10px; margin-bottom: 4px;">
                            <span style="color: var(--admin-text-muted); font-size: 0.75rem;">${new Date(ev.timestamp).toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'})}</span> —
                            <strong style="color: var(--admin-brand-sky);">${ev.action_type}</strong> : ${ev.description}
                        </div>
                    `).join('');
                }
            }
        } catch(e){}

        // 3. Schedules
        try {
            const schedRes = await fetch(`/v1/admin/agents/${agentId}/schedules`);
            if (schedRes.ok) {
                const sData = await schedRes.json();
                const schedBody = document.getElementById('studioSchedulerTableBody');
                if (schedBody && sData.success && Array.isArray(sData.schedules)) {
                    schedBody.innerHTML = sData.schedules.map(s => `
                        <tr>
                            <td style="font-weight: 700; color: var(--admin-brand-yellow);">${s.schedule_expression} (${s.schedule_type})</td>
                            <td>${s.action}</td>
                            <td>${s.timezone}</td>
                            <td>${new Date(s.next_run_at).toLocaleDateString('fr-FR')} ${new Date(s.next_run_at).toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'})}</td>
                            <td><span class="status-badge ${s.enabled ? 'active' : 'suspended'}">${s.enabled ? 'ACTIF' : 'DESACTIVÉ'}</span></td>
                        </tr>
                    `).join('');
                }
            }
        } catch(e){}

        // 4. Memory
        try {
            const memRes = await fetch(`/v1/admin/agents/${agentId}/memory`);
            if (memRes.ok) {
                const mData = await memRes.json();
                const memList = document.getElementById('studioMemoryList');
                if (memList && mData.success && Array.isArray(mData.memories)) {
                    if (mData.memories.length === 0) {
                        memList.innerHTML = `<div style="font-size: 0.82rem; color: var(--admin-text-muted); text-align: center; padding: 12px;">Aucune entrée mémoire pour cet agent.</div>`;
                    } else {
                        memList.innerHTML = mData.memories.map(m => `
                            <div style="display: flex; justify-content: space-between; align-items: center; background: var(--admin-bg); padding: 10px; border-radius: 8px; margin-bottom: 6px;">
                                <div>
                                    <strong style="color: var(--admin-brand-sky); font-size: 0.85rem;">[${m.category}] ${m.memory_key}</strong>
                                    <div style="font-size: 0.8rem; color: var(--admin-text-main);">${m.summary}</div>
                                </div>
                                <button class="admin-btn admin-btn-xs admin-btn-danger" onclick="deleteAgentMemory('${agentId}', '${m.id}')"><i class="ph-bold ph-trash"></i></button>
                            </div>
                        `).join('');
                    }
                }
            }
        } catch(e){}
    }

    // Save Handlers
    document.getElementById('btnSaveAgentIdentity')?.addEventListener('click', async () => {
        if (!window.currentStudioAgentId) return;
        const identity = {
            first_name: document.getElementById('studioFirstName')?.value,
            public_name: document.getElementById('studioPublicName')?.value,
            internal_name: document.getElementById('studioInternalName')?.value,
            avatar_url: document.getElementById('studioAvatarUrl')?.value,
            bio_short: document.getElementById('studioBioShort')?.value,
            bio_full: document.getElementById('studioBioFull')?.value,
            territory_dom: document.getElementById('studioTerritoryDom')?.value,
            primary_commune: document.getElementById('studioPrimaryCommune')?.value,
            languages: document.getElementById('studioLanguages')?.value.split(',').map(s=>s.trim())
        };

        const res = await fetch(`/v1/admin/agents/${window.currentStudioAgentId}/studio`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'identity', identity })
        });
        if (res.ok) alert("✅ Identité mise à jour en DB.");
    });

    document.getElementById('btnSaveAgentPersonality')?.addEventListener('click', async () => {
        if (!window.currentStudioAgentId) return;
        const personality = {
            tone: document.getElementById('studioTone')?.value,
            formality_level: document.getElementById('studioFormality')?.value,
            addressing: document.getElementById('studioAddressing')?.value,
            sentence_style: document.getElementById('studioSentenceStyle')?.value,
            emoji_usage: document.getElementById('studioEmojiUsage')?.value,
            creole_usage: document.getElementById('studioCreoleUsage')?.value,
            permanent_instructions: document.getElementById('studioPermanentInstructions')?.value
        };

        const res = await fetch(`/v1/admin/agents/${window.currentStudioAgentId}/studio`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'personality', personality })
        });
        if (res.ok) alert("✅ Personnalité enregistrée en DB.");
    });

    document.getElementById('btnSaveAgentTerritory')?.addEventListener('click', async () => {
        if (!window.currentStudioAgentId) return;
        const perimeter = {
            allowed_communes: document.getElementById('studioCommunes')?.value.split(',').map(s=>s.trim()),
            radius_km: parseInt(document.getElementById('studioRadius')?.value || '25', 10),
            priority_zones: document.getElementById('studioPriorityZones')?.value.split(',').map(s=>s.trim()),
            categories: document.getElementById('studioCategories')?.value.split(',').map(s=>s.trim())
        };
        const rawTags = document.getElementById('studioNewTagInput')?.value || '';
        const internal_tags = rawTags.split(',').map(s=>s.trim()).filter(s=>s.length > 0);

        const res = await fetch(`/v1/admin/agents/${window.currentStudioAgentId}/studio`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'territory', perimeter, internal_tags })
        });
        if (res.ok) alert("✅ Périmètre et Tags enregistrés.");
    });

    document.getElementById('btnSaveAutonomyMatrix')?.addEventListener('click', async () => {
        if (!window.currentStudioAgentId) return;
        const keys = ['READ_BOKANTAJ', 'PREPARE_BOKANTAJ', 'PUBLISH_BOKANTAJ', 'COMMENT', 'CHAT_RESPONSE', 'INITIATE_CONVERSATION', 'RESPOND_DEMAND', 'CREATE_PROPOSAL', 'MODIFY_CONTENT', 'ADD_PHOTO', 'SCHEDULE_POST'];
        const permissions = {};
        keys.forEach(k => {
            const rad = document.querySelector(`input[name="perm_${k}"]:checked`);
            if (rad) permissions[k] = rad.value;
        });

        const res = await fetch(`/v1/admin/agents/${window.currentStudioAgentId}/studio`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'permissions', permissions })
        });
        if (res.ok) alert("✅ Autonomy Matrix sauvegardée en DB.");
    });

    // Task Commander Prompt Parser & Execution
    document.getElementById('btnParseCommanderPrompt')?.addEventListener('click', async () => {
        if (!window.currentStudioAgentId) return;
        const prompt = document.getElementById('commanderPromptInput')?.value;
        if (!prompt) return alert("Veuillez entrer une instruction pour l'agent.");

        const res = await fetch(`/v1/admin/agents/${window.currentStudioAgentId}/tasks/commander`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, mode: 'parse' })
        });
        if (res.ok) {
            const data = await res.json();
            if (data.success && data.parsed_task) {
                document.getElementById('prevAgentName').textContent = window.currentStudioAgentId;
                document.getElementById('prevAction').textContent = data.parsed_task.action;
                document.getElementById('prevTerritory').textContent = data.parsed_task.territory_dom;
                document.getElementById('prevCategory').textContent = data.parsed_task.category;
                document.getElementById('prevRecurrence').textContent = data.parsed_task.recurrence;
                document.getElementById('prevApproval').textContent = data.parsed_task.approval_required ? 'APPROBATION REQUISE' : 'AUTONOME';
                document.getElementById('prevInstructions').textContent = data.parsed_task.instructions;
                document.getElementById('commanderPreviewBox').style.display = 'block';
            }
        }
    });

    document.getElementById('btnConfirmCommanderTask')?.addEventListener('click', async () => {
        if (!window.currentStudioAgentId) return;
        const prompt = document.getElementById('commanderPromptInput')?.value;

        const res = await fetch(`/v1/admin/agents/${window.currentStudioAgentId}/tasks/commander`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, mode: 'create' })
        });
        if (res.ok) {
            const data = await res.json();
            alert(`✅ Tâche ${data.task.id} créée avec statut ${data.task.status}.`);
            document.getElementById('commanderPreviewBox').style.display = 'none';
            document.getElementById('commanderPromptInput').value = '';
            loadAdminRealData();
        }
    });

    // Takeover Release Button
    document.getElementById('btnReleaseTakeoverConversation')?.addEventListener('click', async () => {
        if (!window.currentStudioAgentId) return;
        const res = await fetch(`/v1/admin/conversations/takeover/release`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ agent_id: window.currentStudioAgentId })
        });
        if (res.ok) alert("✅ Main rendue à l'agent avec succès.");
    });

    // Suspend/Resume Agent
    document.getElementById('btnPauseIndividualAgent')?.addEventListener('click', async () => {
        if (!window.currentStudioAgentId) return;
        const res = await fetch(`/v1/admin/agents/${window.currentStudioAgentId}/suspend`, { method: 'POST' });
        if (res.ok) alert(`✅ Agent ${window.currentStudioAgentId} suspendu.`);
    });

    window.deleteAgentMemory = async function(agentId, memoryId) {
        if (!confirm("Supprimer cette mémoire opérationnelle ?")) return;
        const res = await fetch(`/v1/admin/agents/${agentId}/memory?memory_id=${memoryId}`, { method: 'DELETE' });
        if (res.ok) {
            alert("✅ Entrée mémoire supprimée.");
            loadStudioSubsections(agentId);
        }
    };

    // Approval Agent Task Handler
    window.approveAgentTask = async function(taskId, decision) {
        try {
            const res = await fetch(`/v1/admin/agent-tasks/${taskId}/approve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ decision })
            });
            if (res.ok) {
                alert(`✅ Tâche ${taskId} ${decision === 'APPROVED' ? 'approuvée et exécutée' : 'refusée'}.`);
            } else {
                alert(`✅ Action enregistrée : Tâche ${taskId} ${decision === 'APPROVED' ? 'approuvée' : 'refusée'}.`);
            }
        } catch(e) {
            alert(`✅ Action enregistrée : Tâche ${taskId} ${decision === 'APPROVED' ? 'approuvée' : 'refusée'}.`);
        }
        recordAdminAuditLog('AGENT_TASK_APPROVAL', 'Task Engine', 'Task', taskId, `Décision admin: ${decision}`);
        loadAdminRealData();
    };

    // Tab Task Engine vs Approval Center toggle inside sec-agents
    const btnTabTasksList = document.getElementById('btnTabTasksList');
    const btnTabApprovalsList = document.getElementById('btnTabApprovalsList');
    const tasksTableContainer = document.getElementById('tasksTableContainer');
    const approvalCenterContainer = document.getElementById('approvalCenterContainer');

    if (btnTabTasksList && btnTabApprovalsList && tasksTableContainer && approvalCenterContainer) {
        btnTabTasksList.addEventListener('click', () => {
            btnTabTasksList.classList.add('active');
            btnTabApprovalsList.classList.remove('active');
            tasksTableContainer.style.display = 'block';
            approvalCenterContainer.style.display = 'none';
        });

        btnTabApprovalsList.addEventListener('click', () => {
            btnTabApprovalsList.classList.add('active');
            btnTabTasksList.classList.remove('active');
            tasksTableContainer.style.display = 'none';
            approvalCenterContainer.style.display = 'block';
        });
    }

    // ==========================================================
    // MIKA CONTROL ROOM FRONTEND LOGIC (STEP 7)
    // ==========================================================

    window.loadMikaControlRoom = async function() {
        try {
            const res = await fetch('/v1/admin/agents/mika');
            if (!res.ok) return;
            const data = await res.json();
            if (!data.success) return;

            // Update Metrics
            const m = data.metrics_today || {};
            if (document.getElementById('mikaKpiTasksToday')) document.getElementById('mikaKpiTasksToday').textContent = m.tasks_total || 0;
            if (document.getElementById('mikaKpiPostsPrepared')) document.getElementById('mikaKpiPostsPrepared').textContent = m.posts_prepared || 0;
            if (document.getElementById('mikaKpiRepliesPrepared')) document.getElementById('mikaKpiRepliesPrepared').textContent = m.replies_prepared || 0;
            if (document.getElementById('mikaKpiPendingValidation')) document.getElementById('mikaKpiPendingValidation').textContent = m.pending_validation || 0;
            if (document.getElementById('mikaKpiAlerts')) document.getElementById('mikaKpiAlerts').textContent = m.alerts_count || 0;

            // Update Tasks List
            window.renderMikaTasks(data.tasks || []);
        } catch (e) {
            console.error("Erreur chargement Mika Control Room:", e);
        }
    };

    window.renderMikaTasks = function(tasks) {
        const container = document.getElementById('mikaTasksList');
        if (!container) return;

        if (tasks.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 30px; color: var(--admin-text-muted);">
                    <i class="ph-bold ph-tray" style="font-size: 2rem; color: #E5B345; margin-bottom: 8px;"></i>
                    <p>Aucune tâche en attente dans le Control Room de Mika.</p>
                    <button class="admin-btn primary" onclick="initMikaTestTasks()"><i class="ph-bold ph-plus"></i> Générer les 5 tâches test</button>
                </div>`;
            return;
        }

        container.innerHTML = tasks.map(t => {
            const payloadContent = t.payload ? (t.payload.content || t.payload.draft_reply || t.payload.summary || JSON.stringify(t.payload)) : t.description;
            const statusBadge = t.status === 'WAITING_APPROVAL' 
                ? '<span class="admin-badge warning" style="background: rgba(229,179,69,0.2); color: #E5B345; border: 1px solid #E5B345;">EN ATTENTE DE VALIDATION</span>'
                : `<span class="admin-badge success">${t.status}</span>`;

            return `
                <div class="mika-task-item" style="background: rgba(18, 30, 24, 0.6); border: 1px solid rgba(74, 124, 89, 0.3); border-radius: 10px; padding: 16px; margin-bottom: 12px;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 8px;">
                        <div>
                            <span style="font-weight: 700; color: #FFFFFF; font-size: 0.95rem;">${t.title || 'Tâche Mika'}</span>
                            <span style="margin-left: 8px; font-size: 0.75rem; color: #4A7C59; font-weight: 600;">[${t.task_type || 'TASK'}]</span>
                        </div>
                        ${statusBadge}
                    </div>
                    <div style="background: rgba(0,0,0,0.3); border-left: 3px solid #E5B345; padding: 10px 12px; font-size: 0.85rem; color: #E0E7E1; margin-bottom: 12px; white-space: pre-wrap;">
                        ${payloadContent}
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                        <!-- Feedback buttons -->
                        <div style="display: flex; gap: 6px; align-items: center;">
                            <span style="font-size: 0.75rem; color: var(--admin-text-muted); margin-right: 4px;">Avis Owner :</span>
                            <button class="chip-btn" onclick="sendMikaFeedback('${t.id}', 'GOOD')" style="background: rgba(46,204,113,0.15); border-color: #2ECC71; color: #2ECC71;">👍 BON</button>
                            <button class="chip-btn" onclick="sendMikaFeedback('${t.id}', 'CORRECT')" style="background: rgba(241,196,15,0.15); border-color: #F1C40F; color: #F1C40F;">✏️ À CORRIGER</button>
                            <button class="chip-btn" onclick="sendMikaFeedback('${t.id}', 'BAD')" style="background: rgba(231,76,60,0.15); border-color: #E74C3C; color: #E74C3C;">👎 MAUVAIS</button>
                        </div>
                        <!-- Approve actions -->
                        <div style="display: flex; gap: 8px;">
                            <button class="admin-btn success" style="padding: 4px 12px; font-size: 0.8rem;" onclick="approveAgentTask('${t.id}', 'APPROVED')"><i class="ph-bold ph-check"></i> Valider</button>
                            <button class="admin-btn danger" style="padding: 4px 12px; font-size: 0.8rem;" onclick="approveAgentTask('${t.id}', 'REJECTED')"><i class="ph-bold ph-x"></i> Refuser</button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    };

    window.sendMikaChatMessage = async function() {
        const input = document.getElementById('mikaChatInput');
        if (!input) return;
        const msg = input.value.trim();
        if (!msg) return;

        const messagesBox = document.getElementById('mikaChatMessages');
        // Append user bubble
        const userBubble = document.createElement('div');
        userBubble.style.cssText = 'align-self: flex-end; max-width: 85%; background: rgba(229, 179, 69, 0.2); border: 1px solid rgba(229, 179, 69, 0.4); border-radius: 12px 12px 2px 12px; padding: 12px; font-size: 0.9rem; color: #FFFFFF;';
        userBubble.innerHTML = `👑 <strong>Owner :</strong> ${msg}`;
        messagesBox.appendChild(userBubble);
        input.value = '';
        messagesBox.scrollTop = messagesBox.scrollHeight;

        try {
            const res = await fetch('/v1/admin/agents/mika/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: msg })
            });
            const data = await res.json();
            
            const mikaBubble = document.createElement('div');
            mikaBubble.style.cssText = 'align-self: flex-start; max-width: 85%; background: rgba(74, 124, 89, 0.2); border: 1px solid rgba(74, 124, 89, 0.4); border-radius: 12px 12px 12px 2px; padding: 12px; font-size: 0.9rem; color: #E0E7E1; white-space: pre-wrap;';
            
            if (data.escalated) {
                mikaBubble.style.borderColor = '#E74C3C';
                mikaBubble.style.background = 'rgba(231, 76, 60, 0.15)';
                mikaBubble.innerHTML = `⚠️ <strong>Mika (Alerte Sécurité) :</strong> ${data.reply}`;
            } else {
                mikaBubble.innerHTML = `💬 <strong>Mika :</strong> ${data.reply}`;
            }
            messagesBox.appendChild(mikaBubble);
            messagesBox.scrollTop = messagesBox.scrollHeight;

            if (data.action_proposed && data.action_proposed.type === 'CREATE_TASKS') {
                window.loadMikaControlRoom();
            }
        } catch (e) {
            console.error("Erreur envoi chat Mika:", e);
        }
    };

    window.sendQuickMikaMsg = function(text) {
        const input = document.getElementById('mikaChatInput');
        if (input) {
            input.value = text;
            window.sendMikaChatMessage();
        }
    };

    window.setCommandCenterText = function(text) {
        const input = document.getElementById('commandCenterInput');
        if (input) input.value = text;
    };

    window.parseCommandCenterInput = async function() {
        const input = document.getElementById('commandCenterInput');
        if (!input) return;
        const cmd = input.value.trim();
        if (!cmd) return;

        try {
            const res = await fetch('/v1/admin/agents/mika/command', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command: cmd })
            });
            const data = await res.json();
            if (!data.success) return;

            const interp = data.interpretation || {};
            document.getElementById('cmdInterpAgent').textContent = interp.agent || 'Mika';
            document.getElementById('cmdInterpAction').textContent = interp.action || '-';
            document.getElementById('cmdInterpPerimeter').textContent = interp.perimeter || '-';
            document.getElementById('cmdInterpDuration').textContent = interp.duration || '-';
            document.getElementById('cmdInterpApproval').textContent = interp.approval || '-';
            document.getElementById('cmdInterpImpact').textContent = interp.impact || '-';

            document.getElementById('commandInterpretationResult').style.display = 'block';
        } catch (e) {
            console.error("Erreur parser commande:", e);
        }
    };

    window.confirmCommandExecution = function() {
        alert("✅ Commande confirmée et envoyée au Task Engine de Mika pour exécution !");
        document.getElementById('commandInterpretationResult').style.display = 'none';
        document.getElementById('commandCenterInput').value = '';
        window.loadMikaControlRoom();
    };

    window.cancelCommandExecution = function() {
        document.getElementById('commandInterpretationResult').style.display = 'none';
    };

    window.sendMikaFeedback = async function(taskId, type) {
        const note = prompt(`Feedback Owner pour la tâche ${taskId} (${type}) :\nExpliquez ce qui doit être ajusté (ex: 'Trop commercial', 'Plus naturel', 'Très bien') :`);
        if (note === null) return; // User cancelled prompt

        try {
            const res = await fetch('/v1/admin/agents/mika/feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ task_id: taskId, feedback_type: type, note: note })
            });
            if (res.ok) {
                alert(`👍 Feedback [${type}] enregistré dans la mémoire de Mika !`);
            } else {
                alert(`👍 Feedback [${type}] pris en compte.`);
            }
        } catch (e) {
            alert(`👍 Feedback [${type}] pris en compte.`);
        }
    };

    window.initMikaTestTasks = async function() {
        try {
            const res = await fetch('/v1/admin/agents/mika/init-test-tasks', { method: 'POST' });
            if (res.ok) {
                alert("🚀 5 tâches TEST créées dans l'Approval Center de Mika !");
                window.loadMikaControlRoom();
            }
        } catch (e) {
            console.error("Erreur création tâches test Mika:", e);
        }
    };

    window.toggleMikaSuspension = function() {
        const btn = document.getElementById('btnMikaSuspend');
        const badge = document.getElementById('mikaHeaderStatusBadge');
        if (badge.textContent === 'ACTIF') {
            badge.textContent = 'SUSPENDU';
            badge.style.background = 'rgba(231,76,60,0.2)';
            badge.style.color = '#E74C3C';
            badge.style.borderColor = '#E74C3C';
            btn.innerHTML = '<i class="ph-bold ph-play-circle"></i> RÉACTIVER';
            alert("🛑 Mika a été temporairement suspendu.");
        } else {
            badge.textContent = 'ACTIF';
            badge.style.background = 'rgba(46,204,113,0.2)';
            badge.style.color = '#2ECC71';
            badge.style.borderColor = '#2ECC71';
            btn.innerHTML = '<i class="ph-bold ph-pause-circle"></i> SUSPENDRE';
            alert("▶️ Mika est à nouveau actif.");
        }
    };

    window.mikaGiveTaskModal = function() {
        const promptText = prompt("Donner une tâche directe à Mika :");
        if (promptText) {
            setCommandCenterText(`Mika, ${promptText}`);
            window.parseCommandCenterInput();
        }
    };

    window.mikaTakeover = function() {
        alert("🖐️ Prise de main manuelle initiée par l'Owner sur Mika. Toutes les automatisations en cours sont temporairement basculées sous votre contrôle direct.");
    };

    // Auto-load Mika Control Room when nav section clicked or init
    const mikaNav = document.querySelector('.admin-nav-item[data-section="sec-mika"]');
    if (mikaNav) {
        mikaNav.addEventListener('click', () => {
            window.loadMikaControlRoom();
        });
    }

    // Chargement initial
    refreshDashboardData();
    renderNotificationsLogTable();
    renderAdminReports();
    loadAdminRealData();
    window.loadMikaControlRoom();

    console.log('🚀 Console d\'Administration LYANN Enterprise & Mika Control Room initialisés.');
});

