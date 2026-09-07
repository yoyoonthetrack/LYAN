-- ====================================================================
-- LYANN — STEP 16: PROFESSIONAL VERIFICATION, KYC & COMPLIANCE MIGRATION
-- Migration File: 23_professional_verification_compliance.sql
-- ====================================================================
-- HARDENED PRODUCTION VERSION (STRICT SECURITY, RBAC & RLS ENFORCEMENT)
-- ====================================================================
-- DO NOT EXECUTE AUTOMATICALLY. FOR MANUAL REVIEW ONLY.
-- ====================================================================

BEGIN;

-- 1. SEED COMPLIANCE PERMISSIONS INTO LYANN RBAC SYSTEM
INSERT INTO public.admin_permissions (code, name, module) VALUES
    ('compliance.read', 'Consulter les vérifications professionnelles & documents privés', 'Conformité'),
    ('compliance.review', 'Examiner, valider et trancher les dossiers professionnels', 'Conformité')
ON CONFLICT (code) DO NOTHING;

-- Map Compliance permissions to SUPER_ADMIN, OWNER, and MODERATION roles
DO $$
DECLARE
    v_role_owner UUID;
    v_role_super UUID;
    v_role_moderation UUID;
BEGIN
    SELECT id INTO v_role_owner FROM public.admin_roles WHERE code = 'OWNER';
    SELECT id INTO v_role_super FROM public.admin_roles WHERE code = 'SUPER_ADMIN';
    SELECT id INTO v_role_moderation FROM public.admin_roles WHERE code = 'MODERATION';

    IF v_role_owner IS NOT NULL THEN
        INSERT INTO public.admin_role_permissions (role_id, permission_id)
        SELECT v_role_owner, id FROM public.admin_permissions WHERE code IN ('compliance.read', 'compliance.review')
        ON CONFLICT DO NOTHING;
    END IF;

    IF v_role_super IS NOT NULL THEN
        INSERT INTO public.admin_role_permissions (role_id, permission_id)
        SELECT v_role_super, id FROM public.admin_permissions WHERE code IN ('compliance.read', 'compliance.review')
        ON CONFLICT DO NOTHING;
    END IF;

    IF v_role_moderation IS NOT NULL THEN
        INSERT INTO public.admin_role_permissions (role_id, permission_id)
        SELECT v_role_moderation, id FROM public.admin_permissions WHERE code IN ('compliance.read', 'compliance.review')
        ON CONFLICT DO NOTHING;
    END IF;
END $$;


-- 2. PROFESSIONAL IDENTITIES TABLE
CREATE TABLE IF NOT EXISTS public.professional_identities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    activity_type VARCHAR(100) NOT NULL DEFAULT 'INDEPENDENT'
        CONSTRAINT chk_pro_identities_activity_type CHECK (activity_type IN ('INDEPENDENT', 'AUTO_ENTREPRENEUR', 'COMPANY', 'ARTISAN', 'OTHER')),
    business_name VARCHAR(255),
    legal_name VARCHAR(255),
    siren VARCHAR(9)
        CONSTRAINT chk_pro_identities_siren CHECK (siren IS NULL OR siren ~ '^\d{9}$'),
    siret VARCHAR(14)
        CONSTRAINT chk_pro_identities_siret CHECK (siret IS NULL OR siret ~ '^\d{14}$'),
    territory VARCHAR(50) NOT NULL DEFAULT 'GUADELOUPE'
        CONSTRAINT chk_pro_identities_territory CHECK (territory IN ('GUADELOUPE', 'MARTINIQUE', 'GUYANE', 'REUNION', 'MAYOTTE', 'METROPOLE')),
    business_address TEXT,
    is_public_address BOOLEAN NOT NULL DEFAULT FALSE,
    public_phone VARCHAR(50),
    public_email VARCHAR(255),
    website_url TEXT,
    verification_status VARCHAR(50) NOT NULL DEFAULT 'INCOMPLETE'
        CONSTRAINT chk_pro_identities_verif_status CHECK (verification_status IN ('NOT_STARTED', 'INCOMPLETE', 'PENDING_REVIEW', 'VERIFIED', 'PARTIALLY_VERIFIED', 'REJECTED', 'EXPIRED', 'SUSPENDED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- 3. PROFESSIONAL DOCUMENTS TABLE (PRIVATE BY DEFAULT)
CREATE TABLE IF NOT EXISTS public.professional_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT, -- RESTRICT to prevent accidental deletion during legal retention
    document_type VARCHAR(50) NOT NULL
        CONSTRAINT chk_pro_docs_doc_type CHECK (document_type IN ('BUSINESS_REGISTRATION', 'IDENTITY', 'INSURANCE', 'QUALIFICATION', 'CERTIFICATION', 'AUTHORIZATION', 'OTHER')),
    activity_category VARCHAR(100) NOT NULL DEFAULT 'general',
    file_path TEXT NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_size INTEGER NOT NULL CONSTRAINT chk_pro_docs_file_size CHECK (file_size > 0),
    mime_type VARCHAR(100) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING'
        CONSTRAINT chk_pro_docs_status CHECK (status IN ('PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED', 'REPLACED')),
    issued_at DATE,
    expires_at DATE,
    rejection_reason TEXT,
    reviewed_at TIMESTAMPTZ,
    reviewer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    version INTEGER NOT NULL DEFAULT 1 CONSTRAINT chk_pro_docs_version CHECK (version >= 1),
    replaced_by_id UUID REFERENCES public.professional_documents(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_pro_docs_date_coherence CHECK (expires_at IS NULL OR issued_at IS NULL OR expires_at >= issued_at)
);


-- 4. ACTIVITY REQUIREMENTS TABLE (CONFIGURABLE UNTIL COMPLIANCE VALIDATION)
CREATE TABLE IF NOT EXISTS public.activity_requirements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_category VARCHAR(100) NOT NULL UNIQUE,
    activity_label VARCHAR(255) NOT NULL,
    requires_business_registration BOOLEAN NOT NULL DEFAULT TRUE,
    requires_insurance BOOLEAN NOT NULL DEFAULT FALSE,
    requires_qualification BOOLEAN NOT NULL DEFAULT FALSE,
    required_document_types TEXT[] DEFAULT ARRAY['BUSINESS_REGISTRATION'],
    disclaimer TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- 5. USER ACTIVITY ELIGIBILITY TABLE
CREATE TABLE IF NOT EXISTS public.user_activity_eligibility (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    activity_category VARCHAR(100) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'NOT_STARTED'
        CONSTRAINT chk_user_eligibility_status CHECK (status IN ('NOT_STARTED', 'INCOMPLETE', 'PENDING_REVIEW', 'VERIFIED', 'PARTIALLY_VERIFIED', 'REJECTED', 'EXPIRED', 'SUSPENDED')),
    verified_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, activity_category)
);


-- 6. PROFESSIONAL VERIFICATION AUDIT LOGS (STRICT APPEND-ONLY)
CREATE TABLE IF NOT EXISTS public.professional_verification_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    target_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    document_id UUID REFERENCES public.professional_documents(id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL,
    reason TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- 7. INDEXES FOR PERFORMANCE & LOOKUPS
CREATE INDEX IF NOT EXISTS idx_pro_identities_user ON public.professional_identities(user_id);
CREATE INDEX IF NOT EXISTS idx_pro_identities_siret ON public.professional_identities(siret);
CREATE INDEX IF NOT EXISTS idx_pro_docs_user ON public.professional_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_pro_docs_status ON public.professional_documents(status);
CREATE INDEX IF NOT EXISTS idx_pro_eligibility_user_cat ON public.user_activity_eligibility(user_id, activity_category);
CREATE INDEX IF NOT EXISTS idx_pro_audit_target ON public.professional_verification_audit_logs(target_user_id);


-- 8. STRICT AUTHORITATIVE FIELD PROTECTION TRIGGERS
CREATE OR REPLACE FUNCTION public.protect_pro_identity_authoritative_fields()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT public.has_admin_permission(auth.uid(), 'compliance.review') THEN
        IF NEW.verification_status IS DISTINCT FROM OLD.verification_status THEN
            RAISE EXCEPTION 'SECURITY_VIOLATION: Clients cannot modify authoritative verification_status.';
        END IF;
        NEW.user_id := OLD.user_id;
        NEW.created_at := OLD.created_at;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_protect_pro_identity_fields ON public.professional_identities;
CREATE TRIGGER trg_protect_pro_identity_fields
    BEFORE UPDATE ON public.professional_identities
    FOR EACH ROW EXECUTE FUNCTION public.protect_pro_identity_authoritative_fields();


CREATE OR REPLACE FUNCTION public.protect_pro_document_authoritative_fields()
RETURNS TRIGGER AS $$
BEGIN
    -- Standard clients cannot perform UPDATE on professional_documents
    IF NOT public.has_admin_permission(auth.uid(), 'compliance.review') THEN
        RAISE EXCEPTION 'SECURITY_VIOLATION: Direct client updates on professional documents are forbidden. Create a new document version instead.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_protect_pro_doc_fields ON public.professional_documents;
CREATE TRIGGER trg_protect_pro_doc_fields
    BEFORE UPDATE ON public.professional_documents
    FOR EACH ROW EXECUTE FUNCTION public.protect_pro_document_authoritative_fields();


-- 9. APPEND-ONLY TRIGGER ON AUDIT LOGS (PREVENT ALL UPDATES AND DELETES)
CREATE OR REPLACE FUNCTION public.enforce_pro_audit_append_only()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'SECURITY_VIOLATION: professional_verification_audit_logs is strictly append-only. UPDATE and DELETE operations are forbidden.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pro_audit_append_only ON public.professional_verification_audit_logs;
CREATE TRIGGER trg_pro_audit_append_only
    BEFORE UPDATE OR DELETE ON public.professional_verification_audit_logs
    FOR EACH ROW EXECUTE FUNCTION public.enforce_pro_audit_append_only();


-- 10. ROW LEVEL SECURITY (RLS) POLICIES

-- Enable RLS on all tables
ALTER TABLE public.professional_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professional_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_activity_eligibility ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professional_verification_audit_logs ENABLE ROW LEVEL SECURITY;

-- 10.1 Professional Identities RLS
DROP POLICY IF EXISTS pro_identities_owner_select ON public.professional_identities;
CREATE POLICY pro_identities_owner_select ON public.professional_identities
    FOR SELECT USING (auth.uid() = user_id OR public.has_admin_permission(auth.uid(), 'compliance.read'));

DROP POLICY IF EXISTS pro_identities_owner_insert ON public.professional_identities;
CREATE POLICY pro_identities_owner_insert ON public.professional_identities
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS pro_identities_owner_update ON public.professional_identities;
CREATE POLICY pro_identities_owner_update ON public.professional_identities
    FOR UPDATE USING (auth.uid() = user_id OR public.has_admin_permission(auth.uid(), 'compliance.review'));

-- 10.2 Professional Documents RLS (PRIVATE BY DEFAULT - NO CLIENT DIRECT UPDATE)
DROP POLICY IF EXISTS pro_documents_select ON public.professional_documents;
CREATE POLICY pro_documents_select ON public.professional_documents
    FOR SELECT USING (auth.uid() = user_id OR public.has_admin_permission(auth.uid(), 'compliance.read'));

DROP POLICY IF EXISTS pro_documents_insert ON public.professional_documents;
CREATE POLICY pro_documents_insert ON public.professional_documents
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS pro_documents_update ON public.professional_documents;
CREATE POLICY pro_documents_update ON public.professional_documents
    FOR UPDATE USING (public.has_admin_permission(auth.uid(), 'compliance.review'));

-- 10.3 Activity Requirements RLS
DROP POLICY IF EXISTS activity_req_read ON public.activity_requirements;
CREATE POLICY activity_req_read ON public.activity_requirements
    FOR SELECT USING (TRUE);

-- 10.4 User Activity Eligibility RLS
DROP POLICY IF EXISTS activity_elig_select ON public.user_activity_eligibility;
CREATE POLICY activity_elig_select ON public.user_activity_eligibility
    FOR SELECT USING (auth.uid() = user_id OR public.has_admin_permission(auth.uid(), 'compliance.read'));

DROP POLICY IF EXISTS activity_elig_admin_manage ON public.user_activity_eligibility;
CREATE POLICY activity_elig_admin_manage ON public.user_activity_eligibility
    FOR ALL USING (public.has_admin_permission(auth.uid(), 'compliance.review'));

-- 10.5 Audit Logs RLS (STRICT PRIVACY & NO CLIENT DIRECT INSERT)
DROP POLICY IF EXISTS pro_audit_admin_select ON public.professional_verification_audit_logs;
CREATE POLICY pro_audit_admin_select ON public.professional_verification_audit_logs
    FOR SELECT USING (public.has_admin_permission(auth.uid(), 'audit.read') OR public.has_admin_permission(auth.uid(), 'compliance.read'));

DROP POLICY IF EXISTS pro_audit_insert ON public.professional_verification_audit_logs;
CREATE POLICY pro_audit_insert ON public.professional_verification_audit_logs
    FOR INSERT WITH CHECK (public.has_admin_permission(auth.uid(), 'compliance.review'));


-- 11. SUPABASE STORAGE RLS POLICIES FOR PRIVATE BUCKET 'pro-documents'
INSERT INTO storage.buckets (id, name, public)
VALUES ('pro-documents', 'pro-documents', FALSE)
ON CONFLICT (id) DO UPDATE SET public = FALSE;

-- Storage Policies (Idempotent: DROP IF EXISTS before CREATE)
DROP POLICY IF EXISTS "Pro docs owner select" ON storage.objects;
CREATE POLICY "Pro docs owner select" ON storage.objects
    FOR SELECT USING (bucket_id = 'pro-documents' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_admin_permission(auth.uid(), 'compliance.read')));

DROP POLICY IF EXISTS "Pro docs owner insert" ON storage.objects;
CREATE POLICY "Pro docs owner insert" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'pro-documents' AND (storage.foldername(name))[1] = auth.uid()::text);


-- 12. PUBLIC PROFILE ELIGIBILITY RPC WHITELIST (SECURITY DEFINER)
-- Exposes ONLY privacy-safe public data. Strictly hides documents, private addresses, and audit notes.
CREATE OR REPLACE FUNCTION public.get_public_profile_pro_status(p_target_user_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_identity RECORD;
    v_categories JSONB;
    v_is_verified BOOLEAN;
BEGIN
    SELECT * INTO v_identity FROM public.professional_identities WHERE user_id = p_target_user_id;

    IF v_identity IS NULL THEN
        RETURN jsonb_build_object(
            'is_verified_pro', false,
            'public_badge', NULL,
            'business_name', NULL,
            'activity_type', NULL,
            'verified_categories', '[]'::jsonb
        );
    END IF;

    v_is_verified := (v_identity.verification_status = 'VERIFIED');

    SELECT COALESCE(jsonb_agg(activity_category), '[]'::jsonb) INTO v_categories
    FROM public.user_activity_eligibility
    WHERE user_id = p_target_user_id AND status = 'VERIFIED';

    RETURN jsonb_build_object(
        'is_verified_pro', v_is_verified,
        'public_badge', CASE WHEN v_is_verified THEN 'Professionnel vérifié' ELSE NULL END,
        'business_name', COALESCE(v_identity.business_name, v_identity.legal_name),
        'activity_type', v_identity.activity_type,
        'territory', v_identity.territory,
        'website_url', v_identity.website_url,
        'public_address', CASE WHEN v_identity.is_public_address THEN v_identity.business_address ELSE NULL END,
        'verified_categories', v_categories
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_public_profile_pro_status(UUID) TO anon, authenticated;

COMMIT;
