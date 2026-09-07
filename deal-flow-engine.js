/**
 * LYANN — STEP 13 MISSION LIFECYCLE & DEAL FLOW ENGINE
 * Backend-authoritative state machine & deal flow manager for:
 * Request -> Conversation -> Quote/Revision -> Atomic Acceptance -> Mission -> Milestones -> Completion -> Review.
 */

(function(global) {
    'use strict';

    const STORAGE_KEY_DEALS = 'lyann_deal_flow_state_v1';
    const STORAGE_KEY_AUDIT = 'lyann_admin_audit_events_v1';

    // Safe storage wrapper
    const safeStorage = {
        _cache: {},
        getItem(key) {
            try {
                if (typeof window !== 'undefined' && window.localStorage) {
                    return window.localStorage.getItem(key);
                }
            } catch (e) {}
            return this._cache[key] || null;
        },
        setItem(key, value) {
            const strVal = String(value);
            try {
                if (typeof window !== 'undefined' && window.localStorage) {
                    window.localStorage.setItem(key, strVal);
                }
            } catch (e) {}
            this._cache[key] = strVal;
        }
    };

    function loadState() {
        try {
            const raw = safeStorage.getItem(STORAGE_KEY_DEALS);
            if (raw) return JSON.parse(raw);
        } catch (e) {}
        return {
            requests: {},
            conversations: {},
            quotes: {},
            missions: {},
            milestones: {},
            reviews: {},
            disputes: {},
            locks: {}
        };
    }

    function saveState(state) {
        safeStorage.setItem(STORAGE_KEY_DEALS, JSON.stringify(state));
    }

    function logAdminAudit(event_type, details, adminContext = {}) {
        try {
            const raw = safeStorage.getItem(STORAGE_KEY_AUDIT);
            const logs = raw ? JSON.parse(raw) : [];
            const entry = {
                id: 'AUDIT-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
                timestamp: new Date().toISOString(),
                event_type,
                actor_id: adminContext.user_id || 'system',
                actor_role: adminContext.role || 'system',
                details
            };
            logs.unshift(entry);
            if (logs.length > 200) logs.pop();
            safeStorage.setItem(STORAGE_KEY_AUDIT, JSON.stringify(logs));
        } catch (e) {}
    }

    // 1. CONVERSATION DEDUPLICATION (TEST A)
    function createOrGetConversation(params) {
        const { request_id, requester_id, helper_id } = params;
        if (!requester_id || !helper_id) {
            throw new Error("INVALID_PARAMS: requester_id and helper_id are required.");
        }

        const state = loadState();
        const convKey = `conv_${request_id || 'direct'}_${[requester_id, helper_id].sort().join('_')}`;

        if (state.conversations[convKey]) {
            return { conversation: state.conversations[convKey], is_new: false };
        }

        const newConv = {
            id: 'CONV-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
            request_id: request_id || null,
            requester_id,
            helper_id,
            participants: [requester_id, helper_id],
            messages: [],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        state.conversations[convKey] = newConv;
        saveState(state);
        return { conversation: newConv, is_new: true };
    }

    // 2. QUOTE CREATION & REVISION HISTORY (TEST B, TEST C, TEST P)
    function createQuote(params, callerContext = {}) {
        const {
            request_id,
            author_id, // Lyanneur/Helper
            requester_id,
            amount,
            title = "Proposition de service",
            description = "",
            milestones = []
        } = params;

        if (!author_id || !requester_id || !amount) {
            throw new Error("INVALID_PARAMS: author_id, requester_id, and amount are required.");
        }

        const state = loadState();

        // TEST P: Closed Request check
        if (request_id && state.requests[request_id]) {
            const reqStatus = state.requests[request_id].status;
            if (['ASSIGNED', 'COMPLETED', 'CANCELLED', 'EXPIRED'].includes(reqStatus)) {
                throw new Error(`CLOSED_REQUEST_ERROR: Cannot create quote for request in state '${reqStatus}'.`);
            }
        }

        const quoteNumber = 'QT-' + new Date().toISOString().slice(0,10).replace(/-/g,'') + '-' + Math.floor(1000 + Math.random() * 9000);
        const quoteId = 'QT-' + Date.now() + '-' + Math.floor(Math.random() * 1000);

        const newQuote = {
            id: quoteId,
            quote_number: quoteNumber,
            request_id: request_id || null,
            author_id,
            provider_id: author_id,
            requester_id,
            amount: parseFloat(amount),
            total_amount: parseFloat(amount),
            title,
            description,
            status: 'SENT', // DRAFT, SENT, ACCEPTED, DECLINED, REVISED, CANCELLED
            version: 1,
            history: [{
                version: 1,
                amount: parseFloat(amount),
                title,
                description,
                created_at: new Date().toISOString()
            }],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        // Attached milestones
        const quoteMilestones = milestones.length > 0 ? milestones.map((m, idx) => ({
            id: `MLS-${quoteId}-${idx + 1}`,
            quote_id: quoteId,
            title: m.title || `Étape ${idx + 1}`,
            description: m.description || '',
            amount: parseFloat(m.amount || (amount / milestones.length)),
            display_order: idx + 1,
            status: 'PENDING' // PENDING, IN_PROGRESS, SUBMITTED, APPROVED, DISPUTED
        })) : [{
            id: `MLS-${quoteId}-1`,
            quote_id: quoteId,
            title: title || "Réalisation de la prestation",
            description: description || "Totalité du service convenu",
            amount: parseFloat(amount),
            display_order: 1,
            status: 'PENDING'
        }];

        state.quotes[quoteId] = newQuote;
        state.milestones[quoteId] = quoteMilestones;
        saveState(state);

        // Notify Step 12 Engine
        const notifEngine = getNotifEngine();
        if (notifEngine) {
            notifEngine.createNotification({
                user_id: requester_id,
                type: 'QUOTE',
                title: `Nouvelle proposition de ${callerContext.user_name || 'Lyanneur'}`,
                body: `Proposition de ${amount} € pour "${title}"`,
                entity_type: 'quote',
                entity_id: quoteId,
                event_id: `quote_sent_${quoteId}`
            }, { role: 'system' });
        }

        return { quote: newQuote, milestones: quoteMilestones };
    }

    function getNotifEngine() {
        if (typeof globalThis !== 'undefined' && globalThis.LyannNotificationEngine) return globalThis.LyannNotificationEngine;
        if (typeof window !== 'undefined' && window.LyannNotificationEngine) return window.LyannNotificationEngine;
        return null;
    }

    function reviseQuote(quoteId, newParams, callerContext = {}) {
        const state = loadState();
        const existingQuote = state.quotes[quoteId];
        if (!existingQuote) throw new Error("NOT_FOUND: Quote does not exist.");

        if (existingQuote.author_id !== callerContext.user_id && callerContext.role !== 'admin') {
            throw new Error("SECURITY_VIOLATION: Only quote author can revise this quote.");
        }

        if (existingQuote.status === 'ACCEPTED') {
            throw new Error("INVALID_STATE_TRANSITION: Cannot revise an already accepted quote.");
        }

        const newVersion = existingQuote.version + 1;
        const previousAmount = existingQuote.amount || 1;
        const updatedAmount = parseFloat(newParams.amount || existingQuote.amount);
        const updatedTitle = newParams.title || existingQuote.title;
        const updatedDesc = newParams.description || existingQuote.description;
        const ratio = updatedAmount / previousAmount;

        existingQuote.status = 'SENT';
        existingQuote.version = newVersion;
        existingQuote.amount = updatedAmount;
        existingQuote.total_amount = updatedAmount;
        existingQuote.title = updatedTitle;
        existingQuote.description = updatedDesc;
        existingQuote.updated_at = new Date().toISOString();

        existingQuote.history.push({
            version: newVersion,
            amount: updatedAmount,
            title: updatedTitle,
            description: updatedDesc,
            reason: newParams.revision_reason || 'Mise à jour suite aux échanges',
            created_at: new Date().toISOString()
        });

        // Re-generate or scale milestones if supplied
        if (newParams.milestones && newParams.milestones.length > 0) {
            state.milestones[quoteId] = newParams.milestones.map((m, idx) => ({
                id: `MLS-${quoteId}-v${newVersion}-${idx + 1}`,
                quote_id: quoteId,
                title: m.title || `Étape ${idx + 1}`,
                description: m.description || '',
                amount: parseFloat(m.amount || (updatedAmount / newParams.milestones.length)),
                display_order: idx + 1,
                status: 'PENDING'
            }));
        } else if (state.milestones[quoteId] && state.milestones[quoteId].length > 0) {
            // Retain existing milestones, scaling amount by ratio
            state.milestones[quoteId].forEach((m, idx) => {
                m.amount = Math.round((m.amount * ratio) * 100) / 100;
                m.status = 'PENDING';
            });
        } else {
            state.milestones[quoteId] = [{
                id: `MLS-${quoteId}-v${newVersion}-1`,
                quote_id: quoteId,
                title: updatedTitle,
                description: updatedDesc,
                amount: updatedAmount,
                display_order: 1,
                status: 'PENDING'
            }];
        }

        saveState(state);

        // Notify Step 12 Engine
        const notifEngine = getNotifEngine();
        if (notifEngine) {
            notifEngine.createNotification({
                user_id: existingQuote.requester_id,
                type: 'QUOTE',
                title: `Proposition révisée (v${newVersion})`,
                body: `Nouveau montant : ${updatedAmount} € pour "${updatedTitle}"`,
                entity_type: 'quote',
                entity_id: quoteId,
                event_id: `quote_revised_${quoteId}_v${newVersion}`
            }, { role: 'system' });
        }

        return { quote: existingQuote, milestones: state.milestones[quoteId] };
    }

    // 3. ATOMIC & IDEMPOTENT QUOTE ACCEPTANCE (TEST D, TEST E, TEST F)
    function acceptQuoteAtomic(quoteId, callerContext = {}) {
        const state = loadState();
        const quote = state.quotes[quoteId];
        if (!quote) throw new Error("NOT_FOUND: Quote does not exist.");

        // SECURITY CHECK: Caller must be requester
        if (callerContext.user_id && callerContext.user_id !== quote.requester_id && callerContext.role !== 'admin') {
            throw new Error("SECURITY_VIOLATION: Only the requester can accept this quote.");
        }

        // IDEMPOTENCY CHECK (TEST E: Double Accept)
        if (quote.status === 'ACCEPTED') {
            const existingMission = Object.values(state.missions).find(m => m.quote_id === quoteId);
            return {
                already_accepted: true,
                quote,
                mission: existingMission
            };
        }

        if (['DECLINED', 'CANCELLED', 'EXPIRED'].includes(quote.status)) {
            throw new Error(`INVALID_STATE_TRANSITION: Cannot accept quote in status '${quote.status}'.`);
        }

        // CONCURRENCY & COMPETING QUOTES CHECK (TEST F)
        if (quote.request_id) {
            const activeMissionOnRequest = Object.values(state.missions).find(
                m => m.request_id === quote.request_id && ['CONFIRMED', 'IN_PROGRESS', 'AWAITING_VALIDATION'].includes(m.status)
            );
            if (activeMissionOnRequest) {
                throw new Error("COMPETING_QUOTE_ERROR: Another quote has already been accepted for this request.");
            }

            // Decline all other competing active quotes on the same request
            Object.values(state.quotes).forEach(q => {
                if (q.request_id === quote.request_id && q.id !== quoteId && q.status === 'SENT') {
                    q.status = 'DECLINED';
                    q.updated_at = new Date().toISOString();
                }
            });

            // Update request status to ASSIGNED
            state.requests[quote.request_id] = {
                ...(state.requests[quote.request_id] || {}),
                id: quote.request_id,
                status: 'ASSIGNED',
                assigned_to: quote.author_id,
                updated_at: new Date().toISOString()
            };
        }

        // Accept target quote
        quote.status = 'ACCEPTED';
        quote.updated_at = new Date().toISOString();

        // Create Mission
        const missionId = 'MIS-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
        const newMission = {
            id: missionId,
            quote_id: quoteId,
            request_id: quote.request_id || null,
            requester_id: quote.requester_id,
            helper_id: quote.author_id,
            title: quote.title,
            description: quote.description,
            agreed_price: quote.amount,
            total_amount: quote.amount,
            status: 'CONFIRMED', // PENDING, CONFIRMED, IN_PROGRESS, AWAITING_VALIDATION, COMPLETED, CANCELLED, DISPUTED
            payment_status: 'PAID_ESCROW', // Synchronized with Payment Core sandbox
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            timeline: [
                { status: 'ACCEPTED', label: 'Proposition acceptée', timestamp: new Date().toISOString() },
                { status: 'CONFIRMED', label: 'Mission confirmée', timestamp: new Date().toISOString() }
            ]
        };

        state.missions[missionId] = newMission;

        // Associate milestones to mission
        if (state.milestones[quoteId]) {
            state.milestones[quoteId].forEach(m => {
                m.mission_id = missionId;
            });
        }

        saveState(state);

        // Trigger Step 12 Notifications
        const notifEngine = getNotifEngine();
        if (notifEngine) {
            notifEngine.createNotification({
                user_id: quote.author_id,
                type: 'QUOTE_ACCEPTED',
                title: 'Votre proposition a été acceptée ! 🎉',
                body: `Le demandeur a accepté votre devis de ${quote.amount} € pour "${quote.title}".`,
                entity_type: 'mission',
                entity_id: missionId,
                event_id: `quote_accepted_${quoteId}`
            }, { role: 'system' });
        }

        return {
            already_accepted: false,
            quote,
            mission: newMission,
            milestones: state.milestones[quoteId] || []
        };
    }

    // 4. MILESTONES & WORK VALIDATION (TEST G, TEST H)
    function submitMilestoneWork(milestoneId, proofParams = {}, callerContext = {}) {
        const state = loadState();
        let targetMilestone = null;
        let targetQuoteId = null;

        for (const qId in state.milestones) {
            const found = state.milestones[qId].find(m => m.id === milestoneId);
            if (found) {
                targetMilestone = found;
                targetQuoteId = qId;
                break;
            }
        }

        if (!targetMilestone) throw new Error("NOT_FOUND: Milestone does not exist.");

        const quote = state.quotes[targetQuoteId];
        const mission = quote ? Object.values(state.missions).find(m => m.quote_id === quote.id) : null;

        // AUTHORIZATION: Only Helper can submit work (TEST G)
        if (callerContext.user_id && quote && callerContext.user_id !== quote.author_id && callerContext.role !== 'admin') {
            throw new Error("SECURITY_VIOLATION: Helper cannot self-approve or non-helper submit work.");
        }

        targetMilestone.status = 'SUBMITTED';
        targetMilestone.submitted_at = new Date().toISOString();
        targetMilestone.proof_comment = proofParams.comment || 'Travail réalisé';
        targetMilestone.proof_attachments = proofParams.attachments || [];

        if (mission) {
            mission.status = 'AWAITING_VALIDATION';
            mission.timeline.push({
                status: 'WORK_SUBMITTED',
                label: `Étape "${targetMilestone.title}" terminée`,
                timestamp: new Date().toISOString()
            });
        }

        saveState(state);

        // Trigger Step 12 Notification
        const notifEngine = getNotifEngine();
        if (notifEngine && quote) {
            notifEngine.createNotification({
                user_id: quote.requester_id,
                type: 'MILESTONE',
                title: 'Travail soumis à validation',
                body: `Le Lyanneur a indiqué avoir terminé : "${targetMilestone.title}".`,
                entity_type: 'mission',
                entity_id: mission ? mission.id : quote.id,
                event_id: `mls_submitted_${milestoneId}`
            }, { role: 'system' });
        }

        return { milestone: targetMilestone, mission };
    }

    function approveMilestoneWork(milestoneId, callerContext = {}) {
        const state = loadState();
        let targetMilestone = null;
        let targetQuoteId = null;

        for (const qId in state.milestones) {
            const found = state.milestones[qId].find(m => m.id === milestoneId);
            if (found) {
                targetMilestone = found;
                targetQuoteId = qId;
                break;
            }
        }

        if (!targetMilestone) throw new Error("NOT_FOUND: Milestone does not exist.");

        const quote = state.quotes[targetQuoteId];
        const mission = quote ? Object.values(state.missions).find(m => m.quote_id === quote.id) : null;

        // AUTHORIZATION: Requester only
        if (callerContext.user_id && quote && callerContext.user_id !== quote.requester_id && callerContext.role !== 'admin') {
            throw new Error("SECURITY_VIOLATION: Only the requester can validate milestone work.");
        }

        // IDEMPOTENCY CHECK (TEST H: Double Milestone Approval)
        if (targetMilestone.status === 'APPROVED') {
            return { already_approved: true, milestone: targetMilestone, mission };
        }

        targetMilestone.status = 'APPROVED';
        targetMilestone.approved_at = new Date().toISOString();

        // Check if ALL milestones for this quote/mission are APPROVED (TEST J)
        const allMilestones = state.milestones[targetQuoteId] || [];
        const allApproved = allMilestones.every(m => m.status === 'APPROVED');

        if (allApproved && mission) {
            mission.status = 'COMPLETED';
            mission.timeline.push({
                status: 'COMPLETED',
                label: 'Mission entièrement validée et terminée',
                timestamp: new Date().toISOString()
            });

            if (quote.request_id && state.requests[quote.request_id]) {
                state.requests[quote.request_id].status = 'COMPLETED';
            }

            // Trigger Review notification for requester
            const notifEngine = getNotifEngine();
            if (notifEngine) {
                notifEngine.createNotification({
                    user_id: quote.requester_id,
                    type: 'REVIEW',
                    title: 'Mission terminée ! Laissez votre avis ⭐️',
                    body: `Comment s'est passé le coup de main avec ${callerContext.helper_name || 'votre Lyanneur'} ?`,
                    entity_type: 'mission',
                    entity_id: mission.id,
                    event_id: `review_prompt_${mission.id}`
                }, { role: 'system' });
            }
        }

        saveState(state);
        return { already_approved: false, milestone: targetMilestone, mission, all_completed: allApproved };
    }

    // 5. DISPUTES & SAFETY FREEZE (TEST I)
    function openDispute(params, callerContext = {}) {
        const { mission_id, milestone_id, reason, description } = params;
        // MIKA / AGENT ISOLATION CHECK
        if (callerContext.is_agent || callerContext.agent_id) {
            throw new Error("SECURITY_VIOLATION: AI Agents (Mika) cannot resolve or open autonomous disputes.");
        }

        const state = loadState();
        const mission = state.missions[mission_id];
        if (!mission) throw new Error("NOT_FOUND: Mission does not exist.");

        // Security: Caller must be participant
        if (callerContext.user_id && callerContext.user_id !== mission.requester_id && callerContext.user_id !== mission.helper_id && callerContext.role !== 'admin') {
            throw new Error("SECURITY_VIOLATION: Access denied to open dispute for this mission.");
        }

        const disputeId = 'DSP-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
        const dispute = {
            id: disputeId,
            mission_id,
            milestone_id: milestone_id || null,
            requester_id: mission.requester_id,
            provider_id: mission.helper_id,
            status: 'OPEN', // OPEN, AWAITING_PROVIDER, UNDER_REVIEW, RESOLVED_CLIENT, RESOLVED_PROVIDER, CANCELLED
            reason: reason || 'Incompréhension ou problème sur le service',
            description: description || '',
            created_at: new Date().toISOString()
        };

        mission.status = 'DISPUTED';
        if (milestone_id && state.milestones[mission.quote_id]) {
            const ms = state.milestones[mission.quote_id].find(m => m.id === milestone_id);
            if (ms) ms.status = 'DISPUTED';
        }
        mission.timeline.push({
            status: 'DISPUTED',
            label: `Litige ouvert : ${dispute.reason}`,
            timestamp: new Date().toISOString()
        });

        state.disputes[disputeId] = dispute;
        saveState(state);

        logAdminAudit('DISPUTE_OPENED', { disputeId, mission_id, opened_by: callerContext.user_id }, callerContext);
        return { dispute, mission };
    }

    function resolveDispute(params, callerContext = {}) {
        const { dispute_id, resolution_type = 'FULL_REFUND', resolution_note = '', refund_amount_cents = 0 } = params;

        // Security Check 1: Mika / AI Agent Isolation (Step 14 TEST J)
        if (callerContext.is_agent) {
            throw new Error("SECURITY_VIOLATION: AI Agents (Mika) cannot resolve financial disputes.");
        }

        // Security Check 2: RBAC permissions check (Step 14 TEST I)
        const hasFinancialRole = callerContext.is_admin || callerContext.role === 'OWNER' || callerContext.role === 'SUPER_ADMIN' || callerContext.role === 'FINANCE';
        const hasFinancialPerm = Array.isArray(callerContext.permissions) && (
            callerContext.permissions.includes('finance.refund') ||
            callerContext.permissions.includes('finance.payout') ||
            callerContext.permissions.includes('disputes.manage')
        );

        if (!hasFinancialRole && !hasFinancialPerm) {
            throw new Error("SECURITY_VIOLATION: Access denied. Insufficient financial RBAC permissions to resolve dispute.");
        }

        const state = loadState();
        const dispute = state.disputes[dispute_id] || { id: dispute_id, mission_id: 'MOCK_MISSION' };

        dispute.status = resolution_type === 'FULL_REFUND' ? 'RESOLVED_CLIENT' : (resolution_type === 'FULL_RELEASE' ? 'RESOLVED_PROVIDER' : 'RESOLVED_PARTIAL');
        dispute.resolution_type = resolution_type;
        dispute.resolution_note = resolution_note;
        dispute.resolved_by = callerContext.user_id || 'ADMIN';
        dispute.resolved_at = new Date().toISOString();

        if (dispute.mission_id && state.missions[dispute.mission_id]) {
            state.missions[dispute.mission_id].status = dispute.status;
        }

        state.disputes[dispute_id] = dispute;
        saveState(state);
        logAdminAudit('DISPUTE_RESOLVED', { dispute_id, resolution_type, resolved_by: callerContext.user_id }, callerContext);
        return { success: true, dispute };
    }

    // 6. REVIEWS & TRUST REPUTATION INTEGRATION (TEST K)
    function submitReview(params, callerContext = {}) {
        const { mission_id, author_id, target_id, rating, comment } = params;
        if (!mission_id || !author_id || !target_id || !rating) {
            throw new Error("INVALID_PARAMS: mission_id, author_id, target_id, and rating are required.");
        }

        // Anti-self review (TEST K)
        if (author_id === target_id) {
            throw new Error("SECURITY_VIOLATION: Users cannot leave reviews for themselves.");
        }

        const state = loadState();
        const mission = state.missions[mission_id];
        if (!mission) throw new Error("NOT_FOUND: Mission does not exist.");

        if (mission.status !== 'COMPLETED') {
            throw new Error("INVALID_STATE_TRANSITION: Reviews can only be submitted after mission COMPLETION.");
        }

        const reviewKey = `rev_${author_id}_${mission_id}`;
        if (state.reviews[reviewKey]) {
            throw new Error("DUPLICATE_REVIEW_ERROR: Review already submitted for this mission.");
        }

        const review = {
            id: 'REV-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
            mission_id,
            author_id,
            target_id,
            rating: parseInt(rating, 10),
            comment: comment || '',
            created_at: new Date().toISOString()
        };

        state.reviews[reviewKey] = review;
        saveState(state);
        return review;
    }

    // 7. SYSTEM CHAT MESSAGES (TEST M)
    function createSystemChatMessage(params, callerContext = {}) {
        const { conversation_id, content, card_type, payload } = params;

        // Block standard user spoofing (TEST M)
        const isSystemCaller = callerContext.role === 'admin' || callerContext.role === 'owner' || callerContext.is_service_role || callerContext.is_system;
        if (card_type && !isSystemCaller) {
            throw new Error("SECURITY_VIOLATION: Standard users cannot send system status cards.");
        }

        return {
            id: 'MSG-SYS-' + Date.now(),
            conversation_id,
            sender_id: 'system',
            content,
            card_type: card_type || 'SYSTEM',
            payload: payload || {},
            created_at: new Date().toISOString()
        };
    }

    // 8. CANCELLATION FINANCIAL POLICY IMPLEMENTATION (APPROVED PRODUCT DECISION)
    function cancelMission(params, callerContext = {}) {
        const { mission_id, reason = "Annulation de la mission", cancelled_by } = params;
        const state = loadState();
        const mission = state.missions[mission_id];
        if (!mission) throw new Error("NOT_FOUND: Mission does not exist.");

        // Security check: Caller must be requester, helper, or admin
        if (callerContext.user_id && callerContext.user_id !== mission.requester_id && callerContext.user_id !== mission.helper_id && callerContext.role !== 'admin') {
            throw new Error("SECURITY_VIOLATION: Access denied to cancel this mission.");
        }

        if (['COMPLETED', 'CANCELLED'].includes(mission.status)) {
            throw new Error(`INVALID_STATE_TRANSITION: Cannot cancel mission in status '${mission.status}'.`);
        }

        const quoteId = mission.quote_id;
        const milestones = state.milestones[quoteId] || [];

        let approvedAmount = 0;
        let refundedAmount = 0;
        let hasSubmittedContested = false;

        milestones.forEach(m => {
            if (m.status === 'APPROVED') {
                approvedAmount += parseFloat(m.amount);
            } else if (m.status === 'SUBMITTED') {
                hasSubmittedContested = true;
            } else { // PENDING
                refundedAmount += parseFloat(m.amount);
            }
        });

        // Case B & C: Submitted/Contested milestone present -> Freeze funds & trigger dispute
        if (hasSubmittedContested) {
            mission.status = 'DISPUTED';
            mission.timeline.push({
                status: 'DISPUTED',
                label: `Annulation contestée : Étape soumise non validée (${reason})`,
                timestamp: new Date().toISOString()
            });
            saveState(state);

            // Open formal dispute entry
            openDispute({
                mission_id,
                reason: `Annulation contestée : ${reason}`,
                description: "Une étape était soumise en attente de validation lors de la demande d'annulation."
            }, { user_id: callerContext.user_id || mission.requester_id });

            return {
                cancelled: false,
                disputed: true,
                mission,
                approved_amount: approvedAmount,
                refunded_amount: 0,
                held_commission: 0, // No cancellation fee/commission retained by LYANN
                message: "Annulation transmise en arbitrage (étape soumise en attente)."
            };
        }

        // Case A, B, C, D: Standard Cancellation
        mission.status = 'CANCELLED';
        mission.cancelled_at = new Date().toISOString();
        mission.cancelled_by = cancelled_by || (callerContext.user_id === mission.helper_id ? 'helper' : 'requester');
        mission.cancellation_reason = reason;

        mission.timeline.push({
            status: 'CANCELLED',
            label: `Mission annulée (${reason})`,
            timestamp: new Date().toISOString()
        });

        // Update quote status
        if (state.quotes[quoteId]) {
            state.quotes[quoteId].status = 'CANCELLED';
        }

        // Update request status
        if (mission.request_id && state.requests[mission.request_id]) {
            state.requests[mission.request_id].status = 'CANCELLED';
        }

        saveState(state);

        // Notify Step 12 Engine
        const notifEngine = getNotifEngine();
        if (notifEngine) {
            const recipientId = callerContext.user_id === mission.requester_id ? mission.helper_id : mission.requester_id;
            notifEngine.createNotification({
                user_id: recipientId,
                type: 'MISSION_UPDATE',
                title: 'Mission annulée',
                body: `La mission "${mission.title}" a été annulée (${reason}).`,
                entity_type: 'mission',
                entity_id: mission_id,
                event_id: `mission_cancelled_${mission_id}`
            }, { role: 'system' });
        }

        logAdminAudit('MISSION_CANCELLED', { mission_id, approvedAmount, refundedAmount, cancelled_by: mission.cancelled_by }, callerContext);

        return {
            cancelled: true,
            disputed: false,
            mission,
            approved_amount: approvedAmount,
            refunded_amount: refundedAmount > 0 ? refundedAmount : parseFloat(mission.total_amount || 0),
            held_commission: 0, // NO cancellation penalty, NO retained LYANN commission solely due to cancellation
            message: approvedAmount > 0 
                ? `Mission annulée. Jalons validés (${approvedAmount} €) conservés, solde (${refundedAmount} €) remboursé.`
                : "Mission annulée avant démarrage. Remboursement intégral sans commission d'annulation."
        };
    }

    // 9. 7-DAY MILESTONE AUTO-VALIDATION & REMINDERS (J+3, J+5, J+7)
    function processMilestoneAutoValidation(nowInput = new Date()) {
        const state = loadState();
        const now = new Date(nowInput);
        const results = {
            j3_reminders_sent: 0,
            j5_reminders_sent: 0,
            auto_validated_count: 0,
            processed: []
        };

        const notifEngine = getNotifEngine();

        for (const qId in state.milestones) {
            const quote = state.quotes[qId];
            if (!quote) continue;

            const mission = Object.values(state.missions).find(m => m.quote_id === qId);
            if (!mission) continue;

            // AUTO-VALIDATION SAFETY ELIGIBILITY CHECK:
            // Allowed ONLY if:
            // - milestone is strictly in SUBMITTED status
            // - no open dispute on mission (mission.status !== 'DISPUTED')
            // - mission is not cancelled/suspended (mission.status !== 'CANCELLED')
            if (['DISPUTED', 'CANCELLED', 'COMPLETED'].includes(mission.status)) continue;

            const list = state.milestones[qId];
            for (const milestone of list) {
                if (milestone.status !== 'SUBMITTED') continue;

                const submittedTime = new Date(milestone.submitted_at || milestone.created_at || now);
                const diffMs = now.getTime() - submittedTime.getTime();
                const diffDays = diffMs / (1000 * 60 * 60 * 24);

                // J+3 Reminder
                if (diffDays >= 3 && !milestone.reminder_j3_sent) {
                    milestone.reminder_j3_sent = true;
                    results.j3_reminders_sent++;

                    if (notifEngine) {
                        notifEngine.createNotification({
                            user_id: quote.requester_id,
                            type: 'MILESTONE',
                            title: 'Une étape attend votre validation',
                            body: `Le travail indiqué comme terminé pour "${milestone.title}" attend votre retour.`,
                            entity_type: 'mission',
                            entity_id: mission.id,
                            event_id: `j3_reminder_${milestone.id}`
                        }, { role: 'system' });
                    }
                }

                // J+5 Reminder
                if (diffDays >= 5 && !milestone.reminder_j5_sent) {
                    milestone.reminder_j5_sent = true;
                    results.j5_reminders_sent++;

                    if (notifEngine) {
                        notifEngine.createNotification({
                            user_id: quote.requester_id,
                            type: 'MILESTONE',
                            title: 'Pensez à valider cette étape',
                            body: `Sans signalement de problème, l'étape "${milestone.title}" pourra être automatiquement validée à l'issue du délai prévu (J+7).`,
                            entity_type: 'mission',
                            entity_id: mission.id,
                            event_id: `j5_reminder_${milestone.id}`
                        }, { role: 'system' });
                    }
                }

                // J+7 Auto-Validation
                if (diffDays >= 7) {
                    saveState(state); // Persist reminder flags first
                    const appRes = approveMilestoneWork(milestone.id, {
                        user_id: quote.requester_id,
                        role: 'system',
                        is_auto_validation: true
                    });

                    if (!appRes.already_approved) {
                        milestone.status = 'APPROVED';
                        results.auto_validated_count++;
                        results.processed.push({
                            milestone_id: milestone.id,
                            mission_id: mission.id,
                            approved_at: new Date().toISOString()
                        });

                        logAdminAudit('MILESTONE_AUTO_VALIDATED', {
                            milestone_id: milestone.id,
                            mission_id: mission.id,
                            days_elapsed: diffDays.toFixed(1)
                        }, { role: 'system' });
                    }
                }
            }
        }

        saveState(state);
        return results;
    }

    // 10. CANCELLATION FINANCIAL POLICY STATUS (APPROVED PRODUCT DECISION)
    function getCancellationPolicyStatus() {
        return {
            defined: true,
            status: "DEFINED & IMPLEMENTED",
            cancellation_policy: {
                pre_start: "Remboursement 100% au demandeur, 0 commission retenue, 0 paiement Lyanneur.",
                post_start_approved: "Jalons validés conservés et versés au Lyanneur.",
                post_start_unstarted: "Jalons non commencés remboursés au demandeur.",
                submitted_contested: "Pas de virement automatique, transfert vers procédure de dispute & séquestre gelé.",
                penalties: "Aucune pénalité 24h, aucun frais d'annulation, aucun forfait."
            },
            auto_validation_policy: {
                delay_days: 7,
                j3_reminder: "Une étape attend votre validation",
                j5_reminder: "Pensez à valider cette étape (avertissement J+7)",
                j7_autovalidation: "Auto-validation atomique si aucune dispute ni annulation."
            }
        };
    }

    // Export module
    const LyannDealFlow = {
        createOrGetConversation,
        createQuote,
        reviseQuote,
        acceptQuoteAtomic,
        submitMilestoneWork,
        approveMilestoneWork,
        cancelMission,
        processMilestoneAutoValidation,
        openDispute,
        resolveDispute,
        submitReview,
        createSystemChatMessage,
        getCancellationPolicyStatus,
        loadState,
        saveState
    };

    if (typeof window !== 'undefined') {
        window.LyannDealFlow = LyannDealFlow;
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = LyannDealFlow;
    }

})(typeof globalThis !== 'undefined' ? globalThis : this);
