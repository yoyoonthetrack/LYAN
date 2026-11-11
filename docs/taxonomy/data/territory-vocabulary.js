'use strict';
/*
 * Lot de vocabulaire TERRITORIAL (local/créole) par région d'outre-mer couverte par LYANN :
 *   antilles (Guadeloupe, Martinique, Saint-Martin) · guyane · reunion
 * Structure : { région: { codeNœud: 'terme|terme|…' } } — les termes sont ajoutés au nœud en type `local`
 * et marqués avec leur région (colonne `territories` ; NULL = valable partout).
 *
 * ⚠️ STATUT : proposition rédigée sans locuteur natif. Chaque terme doit être relu par une personne du territoire
 * avant publication (voir docs/taxonomy/10-product-review.md §4 et décision D13).
 * Les 196 termes locaux historiques (lot initial, Antilles en majorité) ne sont pas encore marqués par région.
 */
module.exports = {
    antilles: {
        nuisibles_hygiene_insectes: 'demoustication|dengue|chikungunya|zika|moustique tigre|gites larvaires|moustiques',
        activites_nautiques_voile_glisse: 'yole|yole ronde|course de yoles|gommier',
        amenagement_exterieur_abri_pergola: 'ajoupa|carbet|case a outils',
        activites_nautiques_peche_loisir: 'sortie en mer avec un pecheur|peche au gros|marin pecheur',
        langues_autres_langues: 'neerlandais|papiamento|anglais de saint martin'
    },
    guyane: {
        bateau_mecanique_marine: 'pirogue|moteur de pirogue|reparation pirogue|coque de pirogue|moteur de pirogue en panne|pirogue moteur en panne',
        colis_livraison_fret_inter_iles: 'transport fluvial|fret fluvial|marchandises par pirogue|fret sur le fleuve|livraison en commune isolee',
        amenagement_exterieur_abri_pergola: 'carbet|construire un carbet|carbet en bois|abri en bois en foret',
        menuiserie_bois_terrasse_pergola: 'carbet|construire un carbet|carbet en bois',
        traiteur_evenement_plats_creoles_evenement: 'maripa|couac|cassave|bouillon d awara|awara|poisson boucane|cuisine guyanaise|pimentade',
        cuisine_domicile_chef_domicile: 'cuisine guyanaise|couac|cassave|maripa',
        langues_autres_langues: 'hmong|nenge|bushinenge|sranan tongo|taki taki|portugais bresilien|creole haitien|cours de hmong|cours de portugais',
        traduction_interpretation: 'interprete bushinenge|interprete hmong|interprete creole haitien',
        agricole_recolte_entretien: 'abattis|abattis a defricher|defricher un abattis|jardin creole',
        debroussaillage_terrain: 'debroussaillage en foret|ouvrir un layon|layon'
    },
    reunion: {
        menuiserie_bois_terrasse_pergola: 'varangue|refaire la varangue|varangue a refaire|lambrequins|lambrequin|bardeaux',
        peinture: 'case creole|peindre ma case|peinture de case|case en tole',
        toiture_etancheite: 'tole de la case|case en tole|toit de case',
        traiteur_evenement_plats_creoles_evenement: 'cari|cari poulet|rougail|rougail saucisse|samoussa|samoussas|bonbon piment|bonbons piment|achards|civet|bichique|boucane',
        cuisine_domicile_chef_domicile: 'cari|rougail|samoussa|bonbon piment|achards|civet',
        danse_danses_traditionnelles: 'maloya|sega|seggae|cours de maloya|cours de sega',
        musique_spectacle_traditions_carnaval: 'maloya|sega|seggae|kayamb',
        artisanat_creation_vannerie_textiles_locaux: 'vacoa|tressage vacoa|tressage de vacoa|chapeau en vacoa|panier en vacoa',
        randonnee_nature_canyoning_aventure: 'parapente|vol libre|via ferrata|randonnee au volcan|mafate|salazie|cilaos',
        nuisibles_hygiene_serpents_animaux: 'tangue|tangue dans le jardin|rats des cannes',
        aide_personnes_agees_compagnie_presence: 'gramoun|gramoune|ma gramoun|mon gramoun|aide pour ma gramoun',
        potager_vivrier_verger_fruitiers: 'litchi|litchis|letchi|bibasse|goyavier|cueillette de litchis|vanille',
        activites_nautiques_peche_loisir: 'peche au gros|pecher au gros|peche a la ligne|peche en mer',
        arts_martiaux_capoeira_traditions: 'moringue|moringue reunionnais'
    }
};
