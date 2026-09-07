-- ==============================================================================
-- LYANN MIGRATION 17: UNIVERSAL NEED ENGINE & SIMPLIFIED TAXONOMY
-- ==============================================================================
-- Architecture: Single table public.lyann_taxonomy + requests integration
-- Principles: Free text first, Unclassified non-blocking, Independent safety gate,
--             Extensible from Back-Office, Zero physical deletion of historical data.
-- ==============================================================================

BEGIN;

-- 0. EXTENSIONS FOR FUZZY SEARCH AND ACCENT INSENSITIVITY
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- ==============================================================================
-- 1. SINGLE TAXONOMY TABLE: PUBLIC.LYANN_TAXONOMY
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.lyann_taxonomy (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    universe TEXT NOT NULL,
    category TEXT NOT NULL,
    subcategory TEXT,
    synonyms TEXT[] DEFAULT '{}',
    tags TEXT[] DEFAULT '{}',
    safety_level TEXT DEFAULT 'NORMAL' CHECK (safety_level IN ('NORMAL', 'CAUTION', 'PRO_REQUIRED', 'RESTRICTED', 'PROHIBITED')),
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.lyann_taxonomy ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lyann taxonomy readable by everyone" ON public.lyann_taxonomy;
CREATE POLICY "Lyann taxonomy readable by everyone"
    ON public.lyann_taxonomy FOR SELECT USING (true);

DROP POLICY IF EXISTS "Lyann taxonomy manageable by admin" ON public.lyann_taxonomy;
CREATE POLICY "Lyann taxonomy manageable by admin"
    ON public.lyann_taxonomy FOR ALL USING (
        public.has_admin_permission(auth.uid(), 'taxonomy.manage')
        OR public.has_admin_permission(auth.uid(), 'settings.manage')
    );

-- Search Performance Indexes
CREATE INDEX IF NOT EXISTS idx_lyann_taxonomy_universe ON public.lyann_taxonomy(universe);
CREATE INDEX IF NOT EXISTS idx_lyann_taxonomy_category ON public.lyann_taxonomy(category);
CREATE INDEX IF NOT EXISTS idx_lyann_taxonomy_active ON public.lyann_taxonomy(active);
CREATE INDEX IF NOT EXISTS idx_lyann_taxonomy_synonyms ON public.lyann_taxonomy USING GIN (synonyms);
CREATE INDEX IF NOT EXISTS idx_lyann_taxonomy_tags ON public.lyann_taxonomy USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_lyann_taxonomy_cat_trgm ON public.lyann_taxonomy USING GIN (category gin_trgm_ops);

-- ==============================================================================
-- 2. SEED INITIAL TAXONOMY (IDEMPOTENT SEEDS COVERING 20 REPRESENTATIVE UNIVERSES)
-- ==============================================================================
INSERT INTO public.lyann_taxonomy (universe, category, subcategory, synonyms, tags, safety_level) VALUES
    ('Maison & Travaux', 'Bricolage', 'Montage meuble', ARRAY['armoire', 'lit', 'étagère', 'suédois', 'vis', 'montage', 'meuble'], ARRAY['#BRICOLAGE', '#MEUBLE', '#MONTAGE'], 'NORMAL'),
    ('Maison & Travaux', 'Plomberie', 'Fuite & Dépannage', ARRAY['robinet', 'tuyau', 'évier', 'fuite d eau', 'chasse d eau', 'plombier'], ARRAY['#PLOMBERIE', '#FUITE', '#DEPANNAGE'], 'NORMAL'),
    ('Maison & Travaux', 'Électricité', 'Panne & Dépannage', ARRAY['prise', 'interrupteur', 'disjoncteur', 'lumière', 'électricien'], ARRAY['#ELECTRICITE', '#PANNE'], 'NORMAL'),
    ('Jardin & Extérieur', 'Entretien Jardin', 'Débroussaillage', ARRAY['herbe', 'pelouse', 'tonte', 'débroussailleuse', 'jardinier', 'taille haie'], ARRAY['#JARDIN', '#DEBROUSSAILLAGE', '#TONTE'], 'NORMAL'),
    ('Auto & Mobilité', 'Mécanique Automobile', 'Diagnostic & Démarrage', ARRAY['voiture', 'auto', 'bagnole', 'batterie', 'démarrage', 'panne', 'moteur', 'mécano', 'freins'], ARRAY['#AUTO', '#MECANIQUE', '#DIAGNOSTIC', '#BATTERIE'], 'NORMAL'),
    ('Transport & Livraison', 'Covoiturage', 'Trajet local', ARRAY['covoit', 'emmener', 'déposer', 'trajet', 'voiture', 'transport personne'], ARRAY['#TRANSPORT', '#COVOITURAGE', '#TRAJET'], 'NORMAL'),
    ('Transport & Livraison', 'Livraison & Manutention', 'Transport de meuble', ARRAY['utilitaire', 'camionette', 'récupérer', 'canapé', 'transport meuble'], ARRAY['#LIVRAISON', '#MANUTENTION', '#TRANSPORT'], 'NORMAL'),
    ('Informatique & Numérique', 'Dépannage Informatique', 'Réseau & Wi-Fi', ARRAY['ordinateur', 'pc', 'mac', 'wifi', 'internet', 'connexion', 'informaticien'], ARRAY['#INFORMATIQUE', '#WIFI', '#DEPANNAGE'], 'NORMAL'),
    ('Cours & Apprentissage', 'Soutien Scolaire', 'Aide aux devoirs', ARRAY['prof', 'cours', 'maths', 'français', 'école', 'devoirs', 'tutorat'], ARRAY['#COURS', '#SOUTIEN', '#ECOLE'], 'NORMAL'),
    ('Musique', 'Cours de Musique', 'Batterie', ARRAY['prof de batterie', 'leçon batterie', 'batterie enfant', 'batteur', 'percussions'], ARRAY['#MUSIQUE', '#BATTERIE', '#COURS'], 'NORMAL'),
    ('Art & Création', 'Poterie & Céramique', 'Initiation & Cours', ARRAY['poterie', 'céramique', 'tour de potier', 'argile', 'modelage'], ARRAY['#ART', '#POTERIE', '#CERAMIQUE'], 'NORMAL'),
    ('Sport & Activités', 'Sport & Coaching', 'Tennis', ARRAY['jouer au tennis', 'partenaire tennis', 'coach tennis', 'raquette'], ARRAY['#SPORT', '#TENNIS'], 'NORMAL'),
    ('Animaux', 'Garde d animaux', 'Pension & Babysitting chien', ARRAY['garder chien', 'dog sitting', 'promenade chien', 'animaux'], ARRAY['#ANIMAUX', '#GARDE_CHIEN'], 'NORMAL'),
    ('Beauté & Bien-être', 'Coiffure & Esthétique', 'Tresses', ARRAY['coiffure', 'tresses', 'coiffer', 'tresser', 'cheveux'], ARRAY['#BEAUTE', '#TRESSES', '#COIFFURE'], 'NORMAL'),
    ('Événementiel', 'Photographie', 'Événement & Portrait', ARRAY['photographe', 'photo', 'shooting', 'anniversaire', 'mariage', 'vidéo'], ARRAY['#PHOTO', '#EVENEMENT'], 'NORMAL'),
    ('Administratif', 'Aide Administrative', 'Déclaration & Papiers', ARRAY['impôts', 'CAF', 'dossier', 'déclaration', 'papier', 'courrier'], ARRAY['#ADMINISTRATIF', '#PAPIERS'], 'NORMAL'),
    ('Aide du Quotidien', 'Accompagnement', 'Courses & Présence', ARRAY['aider senior', 'courses', 'accompagner', 'compagnie'], ARRAY['#AIDE', '#ACCOMPAGNEMENT'], 'NORMAL'),
    ('Mode & Couture', 'Couture', 'Retouche & Création', ARRAY['couturière', 'machine à coudre', 'retouche', 'ourlet', 'vêtement'], ARRAY['#COUTURE', '#RETOUCHE'], 'NORMAL'),
    ('Cuisine & Alimentation', 'Cuisine & Pâtisserie', 'Atelier Cuisine', ARRAY['apprendre à cuisiner', 'pain au levain', 'cours de cuisine', 'chef'], ARRAY['#CUISINE', '#COOKING'], 'NORMAL'),
    ('Nettoyage & Entretien', 'Ménage', 'Nettoyage Domicile', ARRAY['femme de ménage', 'nettoyage', 'repassage', 'maison propre'], ARRAY['#MENAGE', '#ENTRETIEN'], 'NORMAL')
ON CONFLICT DO NOTHING;

-- ==============================================================================
-- 3. REQUESTS TABLE EXTENSION (MINIMAL & NON-DESTRUCTIVE)
-- ==============================================================================
ALTER TABLE public.requests
    ADD COLUMN IF NOT EXISTS taxonomy_id UUID REFERENCES public.lyann_taxonomy(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS classification_confidence NUMERIC DEFAULT 1.0,
    ADD COLUMN IF NOT EXISTS classification_status TEXT DEFAULT 'UNCLASSIFIED' CHECK (classification_status IN ('CLASSIFIED', 'UNCLASSIFIED', 'NEEDS_REVIEW')),
    ADD COLUMN IF NOT EXISTS internal_tags TEXT[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS safety_status TEXT DEFAULT 'SAFE' CHECK (safety_status IN ('SAFE', 'CAUTION', 'PRO_REQUIRED', 'RESTRICTED', 'PROHIBITED', 'SAFETY_REVIEW_REQUIRED'));

CREATE INDEX IF NOT EXISTS idx_requests_taxonomy_id ON public.requests(taxonomy_id);
CREATE INDEX IF NOT EXISTS idx_requests_classification_status ON public.requests(classification_status);
CREATE INDEX IF NOT EXISTS idx_requests_safety_status ON public.requests(safety_status);
CREATE INDEX IF NOT EXISTS idx_requests_internal_tags ON public.requests USING GIN (internal_tags);

-- ==============================================================================
-- 4. BACKEND-ONLY AUTHORITATIVE SAFETY STATUS TRIGGER
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.enforce_simplified_request_safety()
RETURNS TRIGGER AS $$
DECLARE
    v_is_admin_user BOOLEAN := false;
BEGIN
    -- Check if calling user is Admin using real RBAC function
    IF auth.uid() IS NOT NULL THEN
        v_is_admin_user := public.has_admin_permission(auth.uid(), 'taxonomy.manage')
                        OR public.has_admin_permission(auth.uid(), 'settings.manage');
    END IF;

    -- Non-admin users cannot manipulate safety_status or override PROHIBITED status
    IF NOT v_is_admin_user THEN
        IF TG_OP = 'INSERT' THEN
            -- Ensure client cannot spoof safety_status on creation
            IF NEW.safety_status IS NULL OR NEW.safety_status != 'PROHIBITED' THEN
                NEW.safety_status := 'SAFE';
            END IF;
        ELSIF TG_OP = 'UPDATE' THEN
            -- Non-admin cannot alter safety_status once evaluated by system/admin
            IF OLD.safety_status IS DISTINCT FROM NEW.safety_status THEN
                RAISE EXCEPTION 'Safety status is backend-authoritative and cannot be modified by standard users.' USING ERRCODE = '42501';
            END IF;
        END IF;

        -- Force PROHIBITED requests to CANCELLED / BLOCKED status
        IF NEW.safety_status = 'PROHIBITED' THEN
            NEW.status := 'CANCELLED';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_enforce_simplified_request_safety ON public.requests;
CREATE TRIGGER trg_enforce_simplified_request_safety
    BEFORE INSERT OR UPDATE ON public.requests
    FOR EACH ROW EXECUTE FUNCTION public.enforce_simplified_request_safety();

-- ==============================================================================
-- 5. GRANULAR ADMIN PERMISSIONS FOR TAXONOMY MANAGEMENT
-- ==============================================================================
INSERT INTO public.admin_permissions (code, name, module) VALUES
    ('taxonomy.read', 'Consulter la taxonomie LYANN', 'Taxonomie'),
    ('taxonomy.manage', 'Gérer la taxonomie LYANN', 'Taxonomie')
ON CONFLICT (code) DO NOTHING;

-- Map permissions to OWNER role automatically
DO $$
DECLARE
    v_role_owner UUID;
BEGIN
    SELECT id INTO v_role_owner FROM public.admin_roles WHERE code = 'OWNER';

    IF v_role_owner IS NOT NULL THEN
        INSERT INTO public.admin_role_permissions (role_id, permission_id)
        SELECT v_role_owner, id FROM public.admin_permissions 
        WHERE code IN ('taxonomy.read', 'taxonomy.manage')
        ON CONFLICT DO NOTHING;
    END IF;
END $$;

COMMIT;
