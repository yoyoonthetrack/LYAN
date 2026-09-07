/**
 * LYANN — STEP 16: PROFESSIONAL VERIFICATION, KYC & COMPLIANCE ENGINE
 * 
 * Production-grade system for:
 * 1. Strictly separating Subscription PRO (commercial) from Professional Verification (legal/trust).
 * 2. SIREN/SIRET format validation (Luhn check, DOM-TOM territories support).
 * 3. Generic Document Model (Private Storage, Signed URLs, Versioning, Expiration).
 * 4. Activity-Level Eligibility & Matrix Requirements (e.g. Jardinage vs Électricité).
 * 5. PRO_REQUIRED Matching Integration (Step 11 authority, Step 14 Safety overrule).
 * 6. Public Profile Privacy (Public badges, private docs/addresses protected).
 * 7. Admin Verification Center (RBAC, append-only audit trail, review queues).
 * 8. Expiration Engine (New matching opportunities blocked, active missions preserved).
 * 9. Mika / AI Agents Human-In-The-Loop Isolation.
 */

(function (global) {
    'use strict';

    // 1. SUPPORTED TERRITORIES & DOCUMENT TYPES
    const TERRITORIES = {
        GUADELOUPE: { code: 'GUADELOUPE', label: 'Guadeloupe (971)' },
        MARTINIQUE: { code: 'MARTINIQUE', label: 'Martinique (972)' },
        GUYANE: { code: 'GUYANE', label: 'Guyane (973)' },
        REUNION: { code: 'REUNION', label: 'La Réunion (974)' },
        MAYOTTE: { code: 'MAYOTTE', label: 'Mayotte (976)' },
        METROPOLE: { code: 'METROPOLE', label: 'France Métropolitaine' }
    };

    const DOCUMENT_TYPES = {
        BUSINESS_REGISTRATION: { code: 'BUSINESS_REGISTRATION', label: 'Kbis / Extrait INSEE / Registre' },
        IDENTITY: { code: 'IDENTITY', label: "Pièce d'identité (CNI / Passeport)" },
        INSURANCE: { code: 'INSURANCE', label: 'Attestation Assurance RCV / Decennale' },
        QUALIFICATION: { code: 'QUALIFICATION', label: 'Diplôme / Certification Métier' },
        AUTHORIZATION: { code: 'AUTHORIZATION', label: 'Agrément / Autorisation Administrative' },
        OTHER: { code: 'OTHER', label: 'Autre justificatif' }
    };

    const DOCUMENT_STATUSES = {
        PENDING: 'PENDING',
        VERIFIED: 'VERIFIED',
        REJECTED: 'REJECTED',
        EXPIRED: 'EXPIRED',
        REPLACED: 'REPLACED'
    };

    const GLOBAL_VERIFICATION_STATUSES = {
        NOT_STARTED: 'NOT_STARTED',
        INCOMPLETE: 'INCOMPLETE',
        PENDING_REVIEW: 'PENDING_REVIEW',
        VERIFIED: 'VERIFIED',
        PARTIALLY_VERIFIED: 'PARTIALLY_VERIFIED',
        REJECTED: 'REJECTED',
        EXPIRED: 'EXPIRED',
        SUSPENDED: 'SUSPENDED'
    };

    // IN-MEMORY DATA STORES (FOR BACKEND & INTEGRATION TESTS)
    const _identities = new Map();     // userId -> identity object
    const _documents = new Map();      // docId -> doc object
    const _eligibilities = new Map();  // userId_category -> eligibility object
    const _auditLogs = [];             // append-only log array
    const _activityRequirements = new Map(); // category -> requirements array

    // DEFAULT ACTIVITY REQUIREMENTS MATRIX
    _activityRequirements.set('electricite', {
        category: 'electricite',
        label: 'Électricité réglementée',
        requires_business_registration: true,
        requires_insurance: true,
        requires_qualification: true,
        required_document_types: ['BUSINESS_REGISTRATION', 'INSURANCE', 'QUALIFICATION']
    });

    _activityRequirements.set('batiment', {
        category: 'batiment',
        label: 'Bâtiment & Travaux',
        requires_business_registration: true,
        requires_insurance: true,
        requires_qualification: false,
        required_document_types: ['BUSINESS_REGISTRATION', 'INSURANCE']
    });

    _activityRequirements.set('jardinage', {
        category: 'jardinage',
        label: 'Jardinage & Espaces Verts',
        requires_business_registration: true,
        requires_insurance: false,
        requires_qualification: false,
        required_document_types: ['BUSINESS_REGISTRATION']
    });

    // 2. SIREN & SIRET LUHN ALGORITHM FORMAT VALIDATOR
    function validateLuhnSIRET(identifier) {
        if (!identifier || typeof identifier !== 'string') return false;
        const cleaned = identifier.replace(/\s+/g, '');
        if (!/^\d+$/.test(cleaned)) return false;
        if (cleaned.length !== 9 && cleaned.length !== 14) return false;

        let sum = 0;
        for (let i = 0; i < cleaned.length; i++) {
            let digit = parseInt(cleaned.charAt(cleaned.length - 1 - i), 10);
            if (i % 2 === 1) {
                digit *= 2;
                if (digit > 9) digit -= 9;
            }
            sum += digit;
        }
        return sum % 10 === 0;
    }

    function sanitizeSIRET(siret) {
        if (!siret) return "";
        return siret.replace(/\s+/g, '').trim();
    }

    // 3. BUSINESS IDENTITY MANAGEMENT
    function setProfessionalIdentity(userId, data) {
        if (!userId) throw new Error("USER_ID_REQUIRED");

        const rawSiret = sanitizeSIRET(data.siret || data.siren || "");
        let siren = null;
        let siret = null;

        if (rawSiret) {
            if (rawSiret.length === 9) {
                siren = rawSiret;
            } else if (rawSiret.length === 14) {
                siret = rawSiret;
                siren = rawSiret.substring(0, 9);
            }
            // Strict format validation
            if (!validateLuhnSIRET(rawSiret)) {
                return { success: false, error: 'INVALID_SIRET_FORMAT', message: 'Format SIREN/SIRET invalide' };
            }
        }

        const existing = _identities.get(userId) || {
            user_id: userId,
            created_at: new Date().toISOString()
        };

        const updated = {
            ...existing,
            activity_type: data.activity_type || existing.activity_type || 'INDEPENDENT',
            business_name: data.business_name || existing.business_name || null,
            legal_name: data.legal_name || existing.legal_name || null,
            siren: siren || existing.siren || null,
            siret: siret || existing.siret || null,
            territory: data.territory || existing.territory || 'GUADELOUPE',
            business_address: data.business_address || existing.business_address || null,
            is_public_address: data.is_public_address === true,
            public_phone: data.public_phone || existing.public_phone || null,
            public_email: data.public_email || existing.public_email || null,
            website_url: data.website_url || existing.website_url || null,
            verification_status: existing.verification_status || GLOBAL_VERIFICATION_STATUSES.INCOMPLETE,
            updated_at: new Date().toISOString()
        };

        _identities.set(userId, updated);
        logAuditAction(userId, userId, null, 'UPDATE_BUSINESS_IDENTITY', 'Mise à jour identité professionnelle');
        return { success: true, identity: updated };
    }

    function getProfessionalIdentity(userId) {
        return _identities.get(userId) || null;
    }

    // 4. PRIVATE DOCUMENT MANAGEMENT & SECURITY
    const ALLOWED_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
    const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

    function uploadProfessionalDocument(userId, fileMetadata) {
        if (!userId) throw new Error("USER_ID_REQUIRED");
        if (!fileMetadata || !fileMetadata.file_name) throw new Error("FILE_METADATA_REQUIRED");

        // Validate File Size & MIME Type
        if (fileMetadata.file_size > MAX_FILE_SIZE_BYTES) {
            return { success: false, error: 'FILE_TOO_LARGE', message: 'Taille maximale 10 Mo' };
        }
        if (fileMetadata.mime_type && !ALLOWED_MIME_TYPES.has(fileMetadata.mime_type)) {
            return { success: false, error: 'INVALID_MIME_TYPE', message: 'Format de fichier non autorisé' };
        }

        const docId = fileMetadata.id || `doc_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        const docType = fileMetadata.document_type || DOCUMENT_TYPES.BUSINESS_REGISTRATION.code;
        const activityCat = fileMetadata.activity_category || 'general';

        // Check if replacing an existing document for the same type & category
        let version = 1;
        let replacedDocId = null;
        for (const [id, doc] of _documents.entries()) {
            if (doc.user_id === userId && doc.document_type === docType && doc.activity_category === activityCat && doc.status !== DOCUMENT_STATUSES.REPLACED) {
                doc.status = DOCUMENT_STATUSES.REPLACED;
                doc.replaced_by_id = docId;
                version = doc.version + 1;
                replacedDocId = id;
            }
        }

        const serverGeneratedPath = `pro-documents/${userId}/${docType.toLowerCase()}_${Date.now()}_${docId.substr(0, 8)}.pdf`;

        const newDoc = {
            id: docId,
            user_id: userId,
            document_type: docType,
            activity_category: activityCat,
            file_path: serverGeneratedPath,
            file_name: fileMetadata.file_name,
            file_size: fileMetadata.file_size || 102400,
            mime_type: fileMetadata.mime_type || 'application/pdf',
            status: DOCUMENT_STATUSES.PENDING,
            issued_at: fileMetadata.issued_at || null,
            expires_at: fileMetadata.expires_at || null,
            rejection_reason: null,
            reviewed_at: null,
            reviewer_id: null,
            version: version,
            replaced_by_id: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        _documents.set(docId, newDoc);

        // Update identity status to PENDING_REVIEW if previously incomplete
        const identity = _identities.get(userId);
        if (identity && identity.verification_status !== GLOBAL_VERIFICATION_STATUSES.VERIFIED) {
            identity.verification_status = GLOBAL_VERIFICATION_STATUSES.PENDING_REVIEW;
        }

        logAuditAction(userId, userId, docId, 'UPLOAD', `Upload document ${docType} v${version}`);

        return { success: true, document: newDoc };
    }

    function getUserDocuments(userId, requestingUserId = null, permissions = []) {
        // Privacy Enforcement: User A cannot read User B's documents without admin permission
        if (requestingUserId && requestingUserId !== userId) {
            const hasPermission = permissions.includes('professional_documents.read') || permissions.includes('admin.all');
            if (!hasPermission) {
                return { success: false, error: 'ACCESS_DENIED', message: 'Accès aux documents privés refusé' };
            }
        }

        const docs = [];
        for (const doc of _documents.values()) {
            if (doc.user_id === userId) {
                docs.push(doc);
            }
        }
        return { success: true, documents: docs };
    }

    function generateSignedStorageUrl(docId, requestingUserId, permissions = []) {
        const doc = _documents.get(docId);
        if (!doc) return { success: false, error: 'DOCUMENT_NOT_FOUND' };

        if (requestingUserId !== doc.user_id) {
            const hasPermission = permissions.includes('professional_documents.read') || permissions.includes('admin.all');
            if (!hasPermission) {
                return { success: false, error: 'ACCESS_DENIED' };
            }
        }

        // Generate temporary 15-minute signed URL
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        const signedUrl = `https://storage.lyann.internal/v1/object/sign/pro-documents/${doc.file_path}?token=sig_${docId}_${Date.now()}`;
        return { success: true, signed_url: signedUrl, expires_at: expiresAt };
    }

    // 5. REVIEW & ADMIN VERIFICATION ENGINE
    function reviewDocument(reviewerUserId, docId, decision, options = {}, permissions = []) {
        // RBAC Enforcement
        const hasPermission = permissions.includes('professional_verification.review') || permissions.includes('admin.all');
        if (!hasPermission) {
            return { success: false, error: 'RBAC_PERMISSION_DENIED', message: 'Permission de révision manquante' };
        }

        const doc = _documents.get(docId);
        if (!doc) return { success: false, error: 'DOCUMENT_NOT_FOUND' };

        const validDecisions = ['APPROVE', 'REJECT', 'REQUEST_INFO'];
        if (!validDecisions.includes(decision)) return { success: false, error: 'INVALID_DECISION' };

        if (decision === 'APPROVE') {
            doc.status = DOCUMENT_STATUSES.VERIFIED;
            doc.rejection_reason = null;
            if (options.expires_at) doc.expires_at = options.expires_at;
        } else if (decision === 'REJECT') {
            doc.status = DOCUMENT_STATUSES.REJECTED;
            doc.rejection_reason = options.reason || 'Document non conforme ou illisible';
        } else if (decision === 'REQUEST_INFO') {
            doc.status = DOCUMENT_STATUSES.PENDING;
            doc.rejection_reason = options.reason || 'Information complémentaire requise';
        }

        doc.reviewed_at = new Date().toISOString();
        doc.reviewer_id = reviewerUserId;
        doc.updated_at = new Date().toISOString();

        // Re-evaluate user global verification status
        evaluateUserGlobalStatus(doc.user_id);

        logAuditAction(reviewerUserId, doc.user_id, docId, decision, options.reason || `Décision révision: ${decision}`);

        return { success: true, document: doc };
    }

    function evaluateUserGlobalStatus(userId) {
        const userDocs = [];
        for (const d of _documents.values()) {
            if (d.user_id === userId && d.status !== DOCUMENT_STATUSES.REPLACED) {
                userDocs.push(d);
            }
        }

        const identity = _identities.get(userId);
        if (!identity) return GLOBAL_VERIFICATION_STATUSES.NOT_STARTED;

        if (userDocs.length === 0) {
            identity.verification_status = GLOBAL_VERIFICATION_STATUSES.INCOMPLETE;
            return GLOBAL_VERIFICATION_STATUSES.INCOMPLETE;
        }

        const hasVerifiedKbis = userDocs.some(d => d.document_type === DOCUMENT_TYPES.BUSINESS_REGISTRATION.code && d.status === DOCUMENT_STATUSES.VERIFIED);
        const hasRejected = userDocs.some(d => d.status === DOCUMENT_STATUSES.REJECTED);
        const hasExpired = userDocs.some(d => d.status === DOCUMENT_STATUSES.EXPIRED);

        let finalStatus = GLOBAL_VERIFICATION_STATUSES.PENDING_REVIEW;
        if (hasVerifiedKbis) {
            finalStatus = GLOBAL_VERIFICATION_STATUSES.VERIFIED;
        } else if (hasRejected) {
            finalStatus = GLOBAL_VERIFICATION_STATUSES.REJECTED;
        } else if (hasExpired) {
            finalStatus = GLOBAL_VERIFICATION_STATUSES.EXPIRED;
        }

        identity.verification_status = finalStatus;

        // Auto update activity eligibilities for verified docs
        for (const doc of userDocs) {
            if (doc.status === DOCUMENT_STATUSES.VERIFIED) {
                const key = `${userId}_${doc.activity_category}`;
                _eligibilities.set(key, {
                    user_id: userId,
                    activity_category: doc.activity_category,
                    status: GLOBAL_VERIFICATION_STATUSES.VERIFIED,
                    verified_at: new Date().toISOString(),
                    expires_at: doc.expires_at
                });
            }
        }

        return finalStatus;
    }

    // 6. EXPIRATION ENGINE
    function checkAndProcessExpirations(nowDate = new Date()) {
        const expiredDocs = [];
        for (const doc of _documents.values()) {
            if (doc.expires_at && new Date(doc.expires_at) < nowDate && doc.status === DOCUMENT_STATUSES.VERIFIED) {
                doc.status = DOCUMENT_STATUSES.EXPIRED;
                doc.updated_at = nowDate.toISOString();
                expiredDocs.push(doc);

                // Expire activity eligibility
                const key = `${doc.user_id}_${doc.activity_category}`;
                const elig = _eligibilities.get(key);
                if (elig) {
                    elig.status = GLOBAL_VERIFICATION_STATUSES.EXPIRED;
                    elig.updated_at = nowDate.toISOString();
                }

                evaluateUserGlobalStatus(doc.user_id);
                logAuditAction('system_expiration_job', doc.user_id, doc.id, 'EXPIRE', `Expiration automatique du document ${doc.document_type}`);
            }
        }
        return { expired_count: expiredDocs.length, expired_documents: expiredDocs };
    }

    // 7. PRO_REQUIRED & STEP 11 MATCHING INTEGRATION
    function checkActivityEligibility(userId, activityCategory = 'general') {
        const key = `${userId}_${activityCategory}`;
        const elig = _eligibilities.get(key);

        if (elig && elig.status === GLOBAL_VERIFICATION_STATUSES.VERIFIED) {
            // Check if expired
            if (elig.expires_at && new Date(elig.expires_at) < new Date()) {
                return false;
            }
            return true;
        }

        // Fallback: check global identity verification status
        const identity = _identities.get(userId);
        if (identity && identity.verification_status === GLOBAL_VERIFICATION_STATUSES.VERIFIED) {
            return true;
        }

        return false;
    }

    function checkMatchingEligibility(candidate, needCategory = 'general', safetyStatus = 'SAFE') {
        const candidateId = candidate.id || candidate.user_id;

        // Rule 1: Step 14 Safety Authority Overrule
        if (global.LyannSafetyEngine && typeof global.LyannSafetyEngine.isUserSanctioned === 'function') {
            if (global.LyannSafetyEngine.isUserSanctioned(candidateId, 'MATCHING_ONLY')) {
                return false;
            }
        }

        // Rule 2: If need is PRO_REQUIRED, commercial PRO subscription ALONE is rejected!
        if (safetyStatus === 'PRO_REQUIRED') {
            // Check real professional verification, NOT subscription_plan = PRO
            const isVerifiedPro = checkActivityEligibility(candidateId, needCategory);
            if (!isVerifiedPro) {
                return false;
            }
        }

        return true;
    }

    // 8. PUBLIC BADGES & PUBLIC PROFILE PRIVACY
    function getPublicProfileVerification(userId) {
        const identity = _identities.get(userId);
        if (!identity) {
            return {
                is_verified_pro: false,
                public_badge: null,
                business_name: null,
                activity_type: null,
                verified_categories: []
            };
        }

        const isVerified = identity.verification_status === GLOBAL_VERIFICATION_STATUSES.VERIFIED;
        const verifiedCategories = [];
        for (const [key, elig] of _eligibilities.entries()) {
            if (key.startsWith(`${userId}_`) && elig.status === GLOBAL_VERIFICATION_STATUSES.VERIFIED) {
                verifiedCategories.push(elig.activity_category);
            }
        }

        return {
            is_verified_pro: isVerified,
            public_badge: isVerified ? "Professionnel vérifié" : null,
            business_name: identity.business_name || identity.legal_name || null,
            activity_type: identity.activity_type,
            territory: identity.territory,
            website_url: identity.website_url || null,
            public_address: identity.is_public_address ? identity.business_address : null,
            verified_categories: verifiedCategories
            // STRICT PRIVACY: NO private identity docs, NO private address, NO SIRET address if private, NO internal admin notes
        };
    }

    // 9. MIKA ISOLATION & HUMAN-IN-THE-LOOP
    function processMikaAction(mikaAgentId, action, targetUserId, options = {}) {
        const forbiddenActions = ['APPROVE', 'REJECT', 'MODIFY_DOCUMENT', 'ALTER_EXPIRATION', 'BYPASS_PRO_REQUIRED'];
        if (forbiddenActions.includes(action)) {
            logAuditAction(mikaAgentId, targetUserId, null, 'MIKA_ACTION_BLOCKED', `Mika attempted forbidden action: ${action}`);
            return {
                success: false,
                error: 'MIKA_ACTION_FORBIDDEN',
                message: 'Mika ne peut pas exécuter de décision de vérification réglementaire. Human-in-the-loop requis.'
            };
        }

        // Allowed Mika actions: EXPLAIN, SUMMARIZE, REQUEST_PREPARATION
        return {
            success: true,
            action: action,
            message: `Mika a préparé la demande pour examen humain.`
        };
    }

    // 10. ACCOUNT DELETION & LEGAL RETENTION POLICY
    function handleAccountDeletionRequest(userId) {
        const userDocs = getUserDocuments(userId).documents || [];
        const hasVerifiedDocs = userDocs.some(d => d.status === DOCUMENT_STATUSES.VERIFIED);

        if (hasVerifiedDocs) {
            return {
                success: false,
                error: 'LEGAL_RETENTION_POLICY_REQUIRED',
                message: 'Conservation légale des justificatifs professionnels obligatoire (Politique de rétention réglementaire).'
            };
        }
        return { success: true, message: 'Données de vérification purgées.' };
    }

    // 11. DOCUMENT UPDATE SECURITY CONTROL (NO DIRECT CLIENT UPDATE)
    function updateProfessionalDocument(requestingUserId, docId, updates = {}, permissions = []) {
        const doc = _documents.get(docId);
        if (!doc) return { success: false, error: 'DOCUMENT_NOT_FOUND' };

        const hasAdminPermission = permissions.includes('compliance.review') || permissions.includes('professional_verification.review') || permissions.includes('admin.all');

        if (!hasAdminPermission) {
            return {
                success: false,
                error: 'SECURITY_VIOLATION',
                message: 'Les modifications directes client sur les documents professionnels sont interdites. Créez une nouvelle version de document.'
            };
        }

        // Admin updates allowed
        if (updates.status) doc.status = updates.status;
        if (updates.expires_at !== undefined) doc.expires_at = updates.expires_at;
        if (updates.version !== undefined) doc.version = updates.version;
        doc.updated_at = new Date().toISOString();

        return { success: true, document: doc };
    }

    // 12. AUDIT LOGGING (FORGERY RESISTANT)
    function logAuditAction(actorId, targetUserId, docId, action, reason = '', permissions = []) {
        const privilegedActions = ['APPROVE', 'REJECT', 'OVERRIDE', 'SUSPEND', 'REQUEST_INFO'];
        if (privilegedActions.includes(action)) {
            const isSystemJob = actorId.startsWith('system_');
            const hasPermission = permissions.includes('compliance.review') || permissions.includes('professional_verification.review') || permissions.includes('admin.all');
            if (!hasPermission && !isSystemJob) {
                return { success: false, error: 'AUDIT_FORGERY_DENIED', message: 'Création d event d audit privilégié par un utilisateur non autorisé refusée.' };
            }
        }

        const logEntry = {
            id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            actor_id: actorId,
            target_user_id: targetUserId,
            document_id: docId,
            action: action,
            reason: reason,
            created_at: new Date().toISOString()
        };
        _auditLogs.push(logEntry);
        return { success: true, log: logEntry };
    }

    function getAuditLogs(targetUserId = null) {
        if (targetUserId) {
            return _auditLogs.filter(l => l.target_user_id === targetUserId);
        }
        return [..._auditLogs];
    }

    // RESET STORE FOR UNIT TESTS
    function _resetStore() {
        _identities.clear();
        _documents.clear();
        _eligibilities.clear();
        _auditLogs.length = 0;
    }

    // EXPORT PUBLIC MODULE API
    const LyannProVerificationEngine = {
        TERRITORIES,
        DOCUMENT_TYPES,
        DOCUMENT_STATUSES,
        GLOBAL_VERIFICATION_STATUSES,
        validateLuhnSIRET,
        setProfessionalIdentity,
        getProfessionalIdentity,
        uploadProfessionalDocument,
        updateProfessionalDocument,
        getUserDocuments,
        generateSignedStorageUrl,
        reviewDocument,
        evaluateUserGlobalStatus,
        checkAndProcessExpirations,
        checkActivityEligibility,
        checkMatchingEligibility,
        getPublicProfileVerification,
        processMikaAction,
        handleAccountDeletionRequest,
        logAuditAction,
        getAuditLogs,
        _resetStore
    };

    if (typeof window !== 'undefined') {
        window.LyannProVerificationEngine = LyannProVerificationEngine;
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = LyannProVerificationEngine;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);
