/**
 * LYANN — STEP 14: SAFETY, DISPUTES & TRUST PROTECTION ENGINE
 * 
 * Production-grade safety, dispute resolution, reporting, user blocking,
 * sanctions, appeals, content safety, risk signals, and admin case center.
 * 
 * Rules:
 * - 100% Backend-Authoritative, Idempotent, & Privacy-Preserving
 * - Payment Isolation: Reports or AI classifications NEVER alter payments or refund funds automatically.
 * - Mika / AI Agents: Strictly Human-in-the-Loop for sanctions, bans, and financial resolutions.
 * - Append-only immutable audit logging for all critical operations.
 */

(function (global) {
    'use strict';

    // In-memory state store for tests and runtime caching
    const state = {
        blocks: {},            // key: `${blocker_id}_${blocked_id}` -> Block object
        reports: {},           // key: report_id -> Report object
        disputes: {},          // key: dispute_id -> Dispute object
        evidence: {},         // key: evidence_id -> Evidence object
        sanctions: {},         // key: sanction_id -> Sanction object
        appeals: {},           // key: appeal_id -> Appeal object
        risk_signals: [],      // array of RiskSignal objects
        admin_notes: [],       // array of InternalNote objects
        audit_events: [],      // array of AuditEvent objects
        prohibited_requests: new Set(), // set of request IDs marked PROHIBITED
        pending_deletions: {}  // user_id -> deletion state
    };

    // Helper: log immutable audit event
    function logAdminAudit(action, metadata, callerContext = {}) {
        const event = {
            id: 'AUD-' + Date.now() + '-' + Math.floor(Math.random() * 10000),
            actor_type: callerContext.is_agent ? 'AGENT' : (callerContext.role === 'ADMIN' || callerContext.is_admin ? 'ADMIN' : 'SYSTEM'),
            actor_id: callerContext.user_id || 'system',
            actor_name: callerContext.actor_name || callerContext.user_id || 'System',
            action: action,
            module_name: 'SAFETY_DISPUTES',
            target_type: metadata.target_type || 'CASE',
            target_id: metadata.target_id || metadata.dispute_id || metadata.report_id || null,
            metadata: metadata,
            created_at: new Date().toISOString()
        };
        state.audit_events.push(event);
        return event;
    }

    // Helper: get DealFlow state
    function getDealFlowState() {
        const engine = global.LyannDealFlow || global.LyannDealFlowEngine;
        if (engine && typeof engine.loadState === 'function') {
            return engine.loadState();
        }
        return { requests: {}, missions: {}, disputes: {}, payments: {} };
    }

    // =========================================================================
    // 1. USER BLOCKING SYSTEM
    // =========================================================================

    /**
     * Block a user.
     * Prevents future matching, new direct chats, and non-essential notifications.
     * Does NOT destroy existing active missions, payments, or obligations.
     */
    function blockUser(blockerId, blockedId, reason = "Comportement indésirable", callerContext = {}) {
        if (!blockerId || !blockedId) throw new Error("INVALID_INPUT: Blocker ID and Blocked ID are required.");
        if (blockerId === blockedId) throw new Error("INVALID_ACTION: User cannot block themselves.");

        const blockKey = `${blockerId}_${blockedId}`;
        const block = {
            id: 'BLK-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
            blocker_id: blockerId,
            blocked_id: blockedId,
            reason: reason,
            created_at: new Date().toISOString(),
            is_active: true
        };

        state.blocks[blockKey] = block;
        logAdminAudit('USER_BLOCKED', { blocker_id: blockerId, blocked_id: blockedId, reason }, callerContext);

        // Check if an active mission exists between them
        let activeMissionNotice = null;
        const dfState = getDealFlowState();
        const activeMission = Object.values(dfState.missions || {}).find(m => {
            const hId = m.provider_id || m.helper_id;
            return (m.requester_id === blockerId && hId === blockedId) ||
                   (hId === blockerId && m.requester_id === blockedId);
        });

        if (activeMission && !['COMPLETED', 'CANCELLED'].includes(activeMission.status)) {
            activeMissionNotice = {
                has_active_mission: true,
                mission_id: activeMission.id,
                guidance: "Une mission active existe. Le blocage préserve la mission, les paiements et les preuves. Si vous rencontrez un problème sur cette mission, veuillez 'Signaler un problème' via la console de litige."
            };
        }

        return {
            success: true,
            block,
            privacy_note: "Le blocage est privé. Aucun message n'a été envoyé à l'utilisateur bloqué.",
            active_mission_notice: activeMissionNotice
        };
    }

    function unblockUser(blockerId, blockedId, callerContext = {}) {
        const blockKey = `${blockerId}_${blockedId}`;
        if (state.blocks[blockKey]) {
            state.blocks[blockKey].is_active = false;
            logAdminAudit('USER_UNBLOCKED', { blocker_id: blockerId, blocked_id: blockedId }, callerContext);
        }
        return { success: true };
    }

    function isUserBlocked(userA, userB) {
        if (!userA || !userB) return false;
        const key1 = `${userA}_${userB}`;
        const key2 = `${userB}_${userA}`;
        return !!((state.blocks[key1] && state.blocks[key1].is_active) || (state.blocks[key2] && state.blocks[key2].is_active));
    }

    // =========================================================================
    // 2. REPORTING SYSTEM
    // =========================================================================

    const VALID_REPORT_REASONS = [
        'INAPPROPRIATE_BEHAVIOR',
        'HARASSMENT',
        'MISLEADING_CONTENT',
        'SPAM',
        'FRAUD_ATTEMPT',
        'SAFETY_ISSUE',
        'FORBIDDEN_SERVICE',
        'IMPERSONATION',
        'DISCRIMINATION',
        'OTHER'
    ];

    function createReport(params, callerContext = {}) {
        const { reporter_id, target_type, target_id, reason, comment = "", evidence_url = null, is_urgent_danger = false } = params;

        if (!reporter_id || !target_type || !target_id || !reason) {
            throw new Error("INVALID_INPUT: reporter_id, target_type, target_id, and reason are required.");
        }

        const reportId = 'RPT-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
        const isUrgent = is_urgent_danger || reason === 'SAFETY_ISSUE' || reason === 'HARASSMENT';

        const report = {
            id: reportId,
            reporter_id,
            target_type,
            target_id,
            reason,
            comment,
            evidence_url,
            priority: isUrgent ? 'URGENT' : 'NORMAL',
            status: 'OPEN',
            created_at: new Date().toISOString(),
            raw_report_altered_trust: false,
            auto_sanction_applied: false
        };

        state.reports[reportId] = report;
        logAdminAudit('REPORT_CREATED', { reportId, reporter_id, target_type, target_id, reason, priority: report.priority }, callerContext);

        const totalReportsOnTarget = Object.values(state.reports).filter(r => r.target_id === target_id).length;
        if (totalReportsOnTarget >= 3) {
            report.priority = 'HIGH_PRIORITY_REVIEW';
            recordRiskSignal(target_id, 'MASS_REPORTING_TARGET', `Utilisateur ou contenu fait l'objet de ${totalReportsOnTarget} signalements. Priorité d'examen humain augmentée.`);
        }

        let emergencyAdvisory = null;
        if (isUrgent) {
            emergencyAdvisory = "En cas de danger immédiat pour votre sécurité ou celle d'un tiers, contactez directement les services d'urgence (17 / 18 / 112) plutôt que d'attendre une réponse LYANN.";
        }

        if (global.LyannNotificationEngine && typeof global.LyannNotificationEngine.sendNotification === 'function') {
            global.LyannNotificationEngine.sendNotification({
                user_id: reporter_id,
                channel: 'IN_APP',
                type: 'SAFETY_REPORT_CONFIRMATION',
                title: 'Signalement reçu',
                body: 'Votre signalement a bien été transmis à notre équipe d\'examen.',
                metadata: { report_id: reportId }
            });
        }

        return {
            success: true,
            report,
            emergency_advisory: emergencyAdvisory,
            trust_altered: false,
            auto_sanctioned: false
        };
    }

    // =========================================================================
    // 3. DISPUTE & EVIDENCE MANAGEMENT
    // =========================================================================

    function addDisputeEvidence(params, callerContext = {}) {
        const { dispute_id, uploaded_by, file_path, file_type = 'image/png', file_size_bytes = 1024, description = "" } = params;

        if (!dispute_id || !uploaded_by || !file_path) {
            throw new Error("INVALID_INPUT: dispute_id, uploaded_by, and file_path are required.");
        }

        if (callerContext.user_id && callerContext.user_id !== uploaded_by && !callerContext.is_admin) {
            throw new Error("SECURITY_VIOLATION: Cannot upload evidence on behalf of another user.");
        }

        const evidenceId = 'EVD-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
        const evidence = {
            id: evidenceId,
            dispute_id,
            uploaded_by,
            file_path,
            file_type,
            file_size_bytes,
            description,
            created_at: new Date().toISOString(),
            is_immutable: true
        };

        state.evidence[evidenceId] = evidence;
        logAdminAudit('EVIDENCE_ADDED', { evidenceId, dispute_id, uploaded_by, file_path }, callerContext);

        const dfState = getDealFlowState();
        if (dfState.disputes && dfState.disputes[dispute_id]) {
            dfState.disputes[dispute_id].timeline = dfState.disputes[dispute_id].timeline || [];
            dfState.disputes[dispute_id].timeline.push({
                step: 'EVIDENCE_ADDED',
                timestamp: new Date().toISOString(),
                actor_id: uploaded_by,
                label: 'Preuve soumise au dossier'
            });
        }

        return { success: true, evidence };
    }

    function deleteEvidence(evidenceId, callerContext = {}) {
        const evidence = state.evidence[evidenceId];
        if (!evidence) throw new Error("NOT_FOUND: Evidence not found.");

        if (!callerContext.is_admin && !callerContext.has_permission?.('moderation.manage')) {
            throw new Error("SECURITY_VIOLATION: Evidence is immutable and cannot be deleted by standard users.");
        }

        delete state.evidence[evidenceId];
        logAdminAudit('EVIDENCE_DELETED_AUDIT', { evidenceId, deleted_by: callerContext.user_id, original_evidence: evidence }, callerContext);
        return { success: true, message: "Preuve supprimée par l'administration. Trace d'audit conservée." };
    }

    // =========================================================================
    // 4. SANCTIONS & GRANULAR RESTRICTIONS
    // =========================================================================

    const SANCTION_TYPES = ['WARNING', 'TEMPORARY_RESTRICTION', 'TEMPORARY_SUSPENSION', 'PERMANENT_SUSPENSION'];

    function applySanction(params, callerContext = {}) {
        const { target_user_id, sanction_type, reason, scope = 'ALL', duration_days = 7, case_id = null } = params;

        if (callerContext.is_agent) {
            throw new Error("SECURITY_VIOLATION: AI Agents (Mika) cannot autonomously issue user sanctions.");
        }

        if (!callerContext.is_admin && !callerContext.has_permission?.('moderation.manage')) {
            throw new Error("SECURITY_VIOLATION: Insufficient permissions to issue sanctions.");
        }

        if (!target_user_id || !sanction_type || !reason) {
            throw new Error("INVALID_INPUT: target_user_id, sanction_type, and reason are required.");
        }

        const sanctionId = 'SNC-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
        const expiresAt = sanction_type.startsWith('TEMPORARY') ? new Date(Date.now() + duration_days * 86400000).toISOString() : null;

        const sanction = {
            id: sanctionId,
            target_user_id,
            sanction_type,
            reason,
            scope,
            duration_days: sanction_type.startsWith('TEMPORARY') ? duration_days : null,
            expires_at: expiresAt,
            applied_by: callerContext.user_id || 'ADMIN',
            case_id,
            status: 'ACTIVE',
            created_at: new Date().toISOString()
        };

        state.sanctions[sanctionId] = sanction;
        logAdminAudit('SANCTION_APPLIED', { sanctionId, target_user_id, sanction_type, reason, scope }, callerContext);

        if (global.LyannNotificationEngine && typeof global.LyannNotificationEngine.sendNotification === 'function') {
            global.LyannNotificationEngine.sendNotification({
                user_id: target_user_id,
                channel: 'IN_APP',
                type: 'SANCTION_NOTICE',
                title: 'Information importante sur votre compte',
                body: `Une mesure de restriction (${sanction_type}) a été appliquée à votre compte. Motif : ${reason}.`,
                metadata: { sanction_id: sanctionId }
            });
        }

        return { success: true, sanction };
    }

    function isUserSanctioned(userId, actionType = 'ALL') {
        if (!userId) return false;
        const now = new Date();
        return Object.values(state.sanctions).some(s => {
            if (s.target_user_id !== userId || s.status !== 'ACTIVE') return false;
            if (s.expires_at && new Date(s.expires_at) < now) {
                s.status = 'EXPIRED';
                return false;
            }
            if (s.sanction_type === 'PERMANENT_SUSPENSION' || s.sanction_type === 'TEMPORARY_SUSPENSION') return true;
            if (s.scope === 'ALL' || s.scope === actionType) return true;
            return false;
        });
    }

    // =========================================================================
    // 5. APPEALS / RE-EXAMINATION SYSTEM
    // =========================================================================

    function submitAppeal(params, callerContext = {}) {
        const { user_id, sanction_id, reason, additional_info = "" } = params;

        if (!user_id || !sanction_id || !reason) {
            throw new Error("INVALID_INPUT: user_id, sanction_id, and reason are required.");
        }

        const existingAppeal = Object.values(state.appeals).find(a => 
            a.sanction_id === sanction_id && a.user_id === user_id && a.status === 'PENDING'
        );

        if (existingAppeal) {
            throw new Error("DUPLICATE_APPEAL: Un recours concernant cette sanction est déjà en cours d'examen.");
        }

        const appealId = 'APL-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
        const appeal = {
            id: appealId,
            sanction_id,
            user_id,
            reason,
            additional_info,
            status: 'PENDING',
            created_at: new Date().toISOString()
        };

        state.appeals[appealId] = appeal;
        logAdminAudit('APPEAL_SUBMITTED', { appealId, sanction_id, user_id }, callerContext);

        return {
            success: true,
            appeal,
            message: "Votre demande de réexamen a bien été enregistrée et sera examinée par l'équipe d'administration."
        };
    }

    // =========================================================================
    // 6. ADMIN CASE CENTER & INTERNAL NOTES
    // =========================================================================

    function addAdminInternalNote(caseId, caseType, noteText, callerContext = {}) {
        if (!callerContext.is_admin && !callerContext.has_permission?.('disputes.read')) {
            throw new Error("SECURITY_VIOLATION: Only authorized admin personnel can add internal notes.");
        }

        const note = {
            id: 'NOT-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
            case_id: caseId,
            case_type: caseType,
            author_id: callerContext.user_id || 'ADMIN',
            note_text: noteText,
            is_internal: true,
            created_at: new Date().toISOString()
        };

        state.admin_notes.push(note);
        logAdminAudit('ADMIN_INTERNAL_NOTE_ADDED', { caseId, caseType, noteId: note.id }, callerContext);
        return { success: true, note };
    }

    function getAdminCaseCenter(filters = {}, callerContext = {}) {
        if (!callerContext.is_admin && !callerContext.has_permission?.('disputes.read') && !callerContext.has_permission?.('moderation.manage')) {
            throw new Error("SECURITY_VIOLATION: Access denied to Admin Case Center.");
        }

        const reports = Object.values(state.reports);
        const dfState = getDealFlowState();
        const disputes = Object.values(dfState.disputes || {});
        const appeals = Object.values(state.appeals);

        return {
            reports,
            disputes,
            appeals,
            risk_signals: state.risk_signals,
            internal_notes: state.admin_notes
        };
    }

    // =========================================================================
    // 7. PRIVATE RISK SIGNALS
    // =========================================================================

    function recordRiskSignal(userId, signalType, details = "") {
        const signal = {
            id: 'RSK-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
            user_id: userId,
            signal_type: signalType,
            details: details,
            is_private: true,
            created_at: new Date().toISOString()
        };
        state.risk_signals.push(signal);
        return signal;
    }

    // =========================================================================
    // 8. CONTENT SAFETY & PROHIBITED CONTENT HANDLING
    // =========================================================================

    function markContentProhibited(requestId, reason = "Contenu interdit ou dangereux", callerContext = {}) {
        state.prohibited_requests.add(requestId);
        logAdminAudit('CONTENT_MARKED_PROHIBITED', { requestId, reason }, callerContext);

        const dfState = getDealFlowState();
        if (dfState.requests && dfState.requests[requestId]) {
            dfState.requests[requestId].safety_status = 'PROHIBITED';
            dfState.requests[requestId].safety_reason = reason;
        }

        return {
            success: true,
            requestId,
            status: 'PROHIBITED',
            action: 'Nouveaux dispatches et propositions immédiatement bloqués. Historique d\'audit préservé.'
        };
    }

    function isContentProhibited(requestId) {
        return state.prohibited_requests.has(requestId);
    }

    // =========================================================================
    // 9. REVIEW PROTECTION & ANTI-RETALIATION
    // =========================================================================

    function reportReview(reviewId, reporterId, reason = "Avis inapproprié", callerContext = {}) {
        const report = createReport({
            reporter_id: reporterId,
            target_type: 'REVIEW',
            target_id: reviewId,
            reason: reason,
            comment: "Signalement d'un avis pour examen de modération"
        }, callerContext);

        return {
            success: true,
            message: "Signalement de l'avis transmis en modération. L'avis reste publié en attente de vérification humaine.",
            review_auto_deleted: false
        };
    }

    // =========================================================================
    // 10. ACCOUNT DELETION WITH ACTIVE CASE PROTECTION
    // =========================================================================

    function requestAccountDeletion(userId, callerContext = {}) {
        if (!userId) throw new Error("INVALID_INPUT: user_id is required.");

        const dfState = getDealFlowState();
        const hasActiveDispute = Object.values(dfState.disputes || {}).some(d => {
            const hId = d.provider_id || d.helper_id;
            return (d.requester_id === userId || hId === userId) && 
                   !['RESOLVED_CLIENT', 'RESOLVED_PROVIDER', 'RESOLVED_PARTIAL', 'CANCELLED'].includes(d.status);
        });

        if (hasActiveDispute) {
            state.pending_deletions[userId] = {
                status: 'BLOCKED_BY_DISPUTE',
                requested_at: new Date().toISOString(),
                reason: "Suppression suspendue : Litige actif en cours d'arbitrage. Les preuves et données nécessaires au traitement restent conservées conformément au cadre d'audit."
            };

            logAdminAudit('ACCOUNT_DELETION_BLOCKED_BY_DISPUTE', { userId }, callerContext);

            return {
                success: false,
                status: 'PENDING_DELETION_BLOCKED_BY_DISPUTE',
                legal_retention_required: true,
                message: "Votre demande de suppression de compte est enregistrée mais suspendue en raison d'un litige actif. Les données nécessaires à la résolution du litige sont conservées temporairement."
            };
        }

        state.pending_deletions[userId] = {
            status: 'QUEUED_FOR_DELETION',
            requested_at: new Date().toISOString()
        };

        logAdminAudit('ACCOUNT_DELETION_QUEUED', { userId }, callerContext);
        return { success: true, status: 'QUEUED_FOR_DELETION' };
    }

    // =========================================================================
    // PUBLIC API EXPORT
    // =========================================================================

    const LyannSafetyEngine = {
        blockUser,
        unblockUser,
        isUserBlocked,
        createReport,
        VALID_REPORT_REASONS,
        addDisputeEvidence,
        deleteEvidence,
        applySanction,
        isUserSanctioned,
        SANCTION_TYPES,
        submitAppeal,
        addAdminInternalNote,
        getAdminCaseCenter,
        recordRiskSignal,
        markContentProhibited,
        isContentProhibited,
        reportReview,
        requestAccountDeletion,
        getState: () => state
    };

    global.LyannSafetyEngine = LyannSafetyEngine;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = LyannSafetyEngine;
    }

})(typeof window !== 'undefined' ? window : globalThis);
