/* LYANN — Familles visuelles carte Annonces (8 pins).
 * Correspondance déterministe category métier → famille d'affichage. Pas de taxonomie nouvelle. */
(function () {
    'use strict';

    const root = typeof window !== 'undefined' ? window : globalThis;

    const normalize = (value) => String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();

    /** Huit familles V2, mêmes codes que marketplace-taxonomy.js. */
    const FAMILIES = Object.freeze([
        { id: 'maison', label: 'Maison & travaux', tone: 'green' },
        { id: 'jardin', label: 'Jardin & extérieur', tone: 'yellow' },
        { id: 'entretien', label: 'Ménage & entretien', tone: 'yellow' },
        { id: 'beaute', label: 'Beauté & bien-être', tone: 'green' },
        { id: 'transport', label: 'Transport & véhicules', tone: 'green' },
        { id: 'famille', label: 'Famille & assistance', tone: 'yellow' },
        { id: 'evenement', label: 'Événementiel & cuisine', tone: 'green' },
        { id: 'numerique', label: 'Numérique & services pros', tone: 'yellow' }
    ]);

    const ALL_FAMILY_IDS = FAMILIES.map((f) => f.id);

    // Correspondance explicite des catégories lyann_taxonomy.category (seeds 17 + 38 + variantes).
    const CATEGORY_FAMILY = Object.freeze({
        plomberie: 'plomberie',
        electricite: 'electricite',
        electromenager: 'electricite',
        bricolage: 'bricolage',
        peinture: 'bricolage',
        'carrelage & sol': 'bricolage',
        maconnerie: 'bricolage',
        serrurerie: 'bricolage',
        climatisation: 'bricolage',
        'toiture & gouttieres': 'bricolage',
        vitrerie: 'bricolage',
        menuiserie: 'bricolage',
        outillage: 'bricolage',
        'entretien jardin': 'jardinage',
        elagage: 'jardinage',
        potager: 'jardinage',
        piscine: 'jardinage',
        arrosage: 'jardinage',
        'aide agricole': 'jardinage',
        jardinage: 'jardinage',
        menage: 'menage',
        'coiffure & esthetique': 'beaute',
        maquillage: 'beaute',
        barbier: 'beaute',
        massage: 'beaute',
        ongles: 'beaute',
        stylisme: 'beaute',
        'tresses & meches': 'beaute',
        beaute: 'beaute',
        'depannage informatique': 'numerique',
        smartphone: 'numerique',
        'creation web': 'numerique',
        'reseaux sociaux': 'numerique',
        graphisme: 'numerique',
        'montage video': 'numerique',
        informatique: 'numerique',
        code: 'numerique',
        ordinateur: 'numerique',
        numerique: 'numerique',
        'entretien jardin': 'jardinage',
        'mecanique automobile': 'quotidien',
        carrosserie: 'quotidien',
        pneumatiques: 'quotidien',
        'lavage auto': 'quotidien',
        depannage: 'quotidien',
        covoiturage: 'quotidien',
        'livraison & manutention': 'quotidien',
        courses: 'quotidien',
        aeroport: 'quotidien',
        colis: 'quotidien',
        demenagement: 'quotidien',
        'soutien scolaire': 'quotidien',
        langues: 'quotidien',
        permis: 'quotidien',
        'garde d enfants': 'quotidien',
        'garde d’enfants': 'quotidien',
        'personnes agees': 'quotidien',
        'personnes âgées': 'quotidien',
        accompagnement: 'quotidien',
        'garde d animaux': 'quotidien',
        toilettage: 'quotidien',
        education: 'quotidien',
        photographie: 'quotidien',
        'aide administrative': 'quotidien',
        comptabilite: 'quotidien',
        traduction: 'quotidien',
        redaction: 'quotidien',
        couture: 'quotidien',
        'cuisine & patisserie': 'quotidien',
        'cuisine & pâtisserie': 'quotidien',
        'traiteur domicile': 'quotidien',
        patisserie: 'quotidien',
        'cours de musique': 'quotidien',
        'poterie & ceramique': 'quotidien',
        'poterie & céramique': 'quotidien',
        'sport & coaching': 'quotidien',
        fitness: 'quotidien',
        danse: 'quotidien',
        natation: 'quotidien',
        yoga: 'quotidien',
        'arts martiaux': 'quotidien',
        bateau: 'quotidien',
        peche: 'quotidien',
        plongee: 'quotidien',
        plongée: 'quotidien',
        voile: 'quotidien',
        'dj & son': 'quotidien',
        traiteur: 'quotidien',
        decoration: 'quotidien',
        animation: 'quotidien',
        videaste: 'quotidien',
        vidéaste: 'quotidien',
        outillage: 'quotidien',
        evenement: 'quotidien',
        événement: 'quotidien',
        'peinture & dessin': 'quotidien',
        artisanat: 'quotidien'
    });

    const OLD_TO_V2 = Object.freeze({
        plomberie: 'maison', electricite: 'maison', bricolage: 'maison', jardinage: 'jardin',
        menage: 'entretien', beaute: 'beaute', numerique: 'numerique'
    });
    const QUOTIDIEN_V2 = Object.freeze({
        'mecanique automobile': 'transport', carrosserie: 'transport', pneumatiques: 'transport', 'lavage auto': 'transport',
        depannage: 'transport', covoiturage: 'transport', 'livraison & manutention': 'transport', courses: 'famille',
        aeroport: 'transport', colis: 'transport', demenagement: 'transport',
        'soutien scolaire': 'famille', langues: 'famille', permis: 'transport',
        'garde d enfants': 'famille', 'garde d’enfants': 'famille', 'personnes agees': 'famille', 'personnes âgées': 'famille',
        accompagnement: 'famille', 'garde d animaux': 'famille', toilettage: 'famille', education: 'famille',
        photographie: 'evenement', 'aide administrative': 'numerique', comptabilite: 'numerique', traduction: 'numerique', redaction: 'numerique',
        couture: 'beaute', 'cuisine & patisserie': 'evenement', 'cuisine & pâtisserie': 'evenement', 'traiteur domicile': 'evenement',
        patisserie: 'evenement', 'cours de musique': 'evenement', 'poterie & ceramique': 'evenement', 'poterie & céramique': 'evenement',
        'sport & coaching': 'famille', fitness: 'famille', danse: 'evenement', natation: 'famille', yoga: 'famille',
        'arts martiaux': 'famille', bateau: 'transport', peche: 'famille', plongee: 'famille', 'plongée': 'famille', voile: 'transport',
        'dj & son': 'evenement', traiteur: 'evenement', decoration: 'evenement', animation: 'evenement', videaste: 'evenement', 'vidéaste': 'evenement',
        evenement: 'evenement', 'événement': 'evenement', 'peinture & dessin': 'evenement', artisanat: 'evenement'
    });

    /** Un radical ne compte que s'il est un mot, ou le début d'un mot. « menage » ne traverse pas « demenagement ». */
    function hasStem(key, stem) {
        return key.split(/[^a-z0-9]+/).filter(Boolean).some((word) => word === stem || word.startsWith(stem));
    }

    function legacyFamilyId(category) {
        const key = normalize(category);
        if (!key) return '';
        if (CATEGORY_FAMILY[key]) return CATEGORY_FAMILY[key];
        if (hasStem(key, 'plomb')) return 'plomberie';
        if (hasStem(key, 'electr') || hasStem(key, 'eclair')) return 'electricite';
        if (hasStem(key, 'jardin') || hasStem(key, 'elag') || hasStem(key, 'potager') || hasStem(key, 'tonte')) return 'jardinage';
        if (hasStem(key, 'menage') || hasStem(key, 'nettoy')) return 'menage';
        if (hasStem(key, 'coiff') || hasStem(key, 'beaute') || hasStem(key, 'esthet') || hasStem(key, 'barbier') || hasStem(key, 'ongle')) return 'beaute';
        if (hasStem(key, 'informat') || hasStem(key, 'ordinateur') || hasStem(key, 'web') || hasStem(key, 'smartphone') || hasStem(key, 'wifi')) return 'numerique';
        if (hasStem(key, 'bricol') || hasStem(key, 'macon') || hasStem(key, 'peint') || hasStem(key, 'menuis') || hasStem(key, 'carrel') || hasStem(key, 'clim')) return 'bricolage';
        if (hasStem(key, 'covoit') || hasStem(key, 'livraison') || hasStem(key, 'voiture') || hasStem(key, 'camion')) return 'quotidien';
        return '';
    }

    function familyForCategory(category) {
        const key = normalize(category);
        if (QUOTIDIEN_V2[key]) return QUOTIDIEN_V2[key];
        if (hasStem(key, 'demenage')) return 'transport';
        const old = legacyFamilyId(category);
        if (old === 'quotidien') {
            if (key.includes('enfant') || key.includes('senior') || key.includes('animaux') || key.includes('scolaire')) return 'famille';
            if (key.includes('cuisin') || key.includes('photo') || key.includes('mariage') || key.includes('traiteur') || key.includes('musique')) return 'evenement';
            if (key.includes('voiture') || key.includes('livr') || key.includes('transport') || key.includes('camion') || key.includes('aeroport')) return 'transport';
            return '';
        }
        return OLD_TO_V2[old] || '';
    }

    function familyForRow(row, leaves = []) {
        if (!row) return '';
        if (row._v2Family && ALL_FAMILY_IDS.includes(row._v2Family)) return row._v2Family;
        if (row.taxonomy_id && Array.isArray(leaves) && leaves.length) {
            const leaf = leaves.find((t) => t.id === row.taxonomy_id);
            if (leaf?.category) return familyForCategory(leaf.category);
        }
        return familyForCategory(row.category || row.title);
    }

    function filterRowsByFamilies(rows, selectedFamilies, leaves = []) {
        const list = Array.isArray(rows) ? rows : [];
        const pick = Array.isArray(selectedFamilies) ? selectedFamilies.filter(Boolean) : [];
        if (!pick.length || pick.length >= FAMILIES.length) return list;
        const allowed = new Set(pick);
        return list.filter((row) => allowed.has(familyForRow(row, leaves)));
    }

    /* Sélection de familles (feuille « Catégories sur la carte »).
     * Règle unique : la sélection est une liste explicite d'identifiants valides, en ordre canonique.
     * Liste vide (ou complète) = aucun filtre = « Toutes ». Un clic sur une famille n'ajoute ou ne retire QUE cette famille. */
    function canonicalFamilySelection(selected) {
        const set = new Set(Array.isArray(selected) ? selected : []);
        return ALL_FAMILY_IDS.filter((id) => set.has(id));
    }

    function toggleFamilySelection(selected, id) {
        if (!ALL_FAMILY_IDS.includes(id)) return canonicalFamilySelection(selected);
        const set = new Set(canonicalFamilySelection(selected));
        if (set.has(id)) set.delete(id); else set.add(id);
        return ALL_FAMILY_IDS.filter((familyId) => set.has(familyId));
    }

    /** Filtre effectif à appliquer : null si aucun filtre (vide ou toutes les familles). */
    function effectiveFamilyFilter(selected) {
        const list = canonicalFamilySelection(selected);
        return list.length === 0 || list.length >= FAMILIES.length ? null : list;
    }

    function familyMeta(id) {
        return FAMILIES.find((f) => f.id === id) || { id: '', label: '', tone: 'green' };
    }

    const api = Object.freeze({
        FAMILIES,
        ALL_FAMILY_IDS,
        CATEGORY_FAMILY,
        familyForCategory,
        familyForRow,
        filterRowsByFamilies,
        canonicalFamilySelection,
        toggleFamilySelection,
        effectiveFamilyFilter,
        familyMeta,
        normalizeCategoryKey: normalize
    });

    root.LYANN_MAP_CATEGORY_FAMILIES = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
