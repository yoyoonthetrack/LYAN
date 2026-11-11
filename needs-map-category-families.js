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

    /** @type {ReadonlyArray<{id:string,label:string,tone:'green'|'yellow'}>} */
    const FAMILIES = Object.freeze([
        { id: 'plomberie', label: 'Plomberie', tone: 'green' },
        { id: 'electricite', label: 'Électricité', tone: 'yellow' },
        { id: 'bricolage', label: 'Bricolage', tone: 'green' },
        { id: 'jardinage', label: 'Jardinage', tone: 'yellow' },
        { id: 'menage', label: 'Ménage', tone: 'yellow' },
        { id: 'beaute', label: 'Beauté', tone: 'green' },
        { id: 'numerique', label: 'Numérique', tone: 'yellow' },
        { id: 'quotidien', label: 'Services du quotidien', tone: 'green' }
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

    function familyForCategory(category) {
        const key = normalize(category);
        if (!key) return 'quotidien';
        if (CATEGORY_FAMILY[key]) return CATEGORY_FAMILY[key];
        if (key.includes('plomb')) return 'plomberie';
        if (key.includes('electr') || key.includes('eclair')) return 'electricite';
        if (key.includes('jardin') || key.includes('elag') || key.includes('potager') || key.includes('tonte')) return 'jardinage';
        if (key.includes('menage') || key.includes('nettoy')) return 'menage';
        if (key.includes('coiff') || key.includes('beaute') || key.includes('esthet') || key.includes('barbier') || key.includes('ongle')) return 'beaute';
        if (key.includes('informat') || key.includes('ordinateur') || key.includes('web') || key.includes('smartphone') || key.includes('wifi')) return 'numerique';
        if (key.includes('bricol') || key.includes('macon') || key.includes('peint') || key.includes('menuis') || key.includes('carrel')) return 'bricolage';
        return 'quotidien';
    }

    function familyForRow(row, leaves = []) {
        if (!row) return 'quotidien';
        if (row.taxonomy_id && Array.isArray(leaves) && leaves.length) {
            const leaf = leaves.find((t) => t.id === row.taxonomy_id);
            if (leaf?.category) return familyForCategory(leaf.category);
        }
        return familyForCategory(row.category);
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
        return FAMILIES.find((f) => f.id === id) || FAMILIES.find((f) => f.id === 'quotidien');
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
