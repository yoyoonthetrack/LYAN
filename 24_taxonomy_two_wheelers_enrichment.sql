-- Migration 24: Step 10 Taxonomy Enrichment - Two-Wheelers (Scooter / Moto)
-- Idempotent INSERT with anti-duplicate guard

BEGIN;

INSERT INTO public.lyann_taxonomy (
    universe,
    category,
    subcategory,
    synonyms,
    tags,
    safety_level,
    active
)
SELECT
    'Auto & Mobilité',
    'Mécanique & Entretien Deux-Roues',
    'Réparation & Entretien Deux-Roues',
    ARRAY[
        'scooter',
        'scooters',
        'moto',
        'motos',
        'deux-roues',
        'deux roues',
        'mobylette',
        'cyclomoteur',
        'réparation scooter',
        'reparation scooter',
        'mécanique moto',
        'mecanique moto',
        'entretien scooter',
        'entretien moto'
    ],
    ARRAY[
        '#SCOOTER',
        '#MOTO',
        '#DEUX_ROUES',
        '#MECANIQUE'
    ],
    'NORMAL',
    TRUE
WHERE NOT EXISTS (
    SELECT 1
    FROM public.lyann_taxonomy
    WHERE universe = 'Auto & Mobilité'
      AND category = 'Mécanique & Entretien Deux-Roues'
      AND subcategory = 'Réparation & Entretien Deux-Roues'
);

COMMIT;
