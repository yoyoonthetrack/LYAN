-- ============================================================================
-- LYANN — Migration 38: taxonomie large pour classer une multitude de besoins
--
-- Les compétences d'un membre restent personnelles (public.services).
-- Cette table, elle, est le dictionnaire partagé : plus elle est large, plus
-- une annonce rédigée en langage libre retombe sur une vraie catégorie.
-- Les lignes existantes ne sont ni remplacées ni désactivées.
-- ============================================================================

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS idx_lyann_taxonomy_leaf
    ON public.lyann_taxonomy (universe, category, subcategory);

INSERT INTO public.lyann_taxonomy (universe, category, subcategory, synonyms, tags, safety_level, active)
SELECT v.universe, v.category, v.subcategory, v.synonyms, v.tags, v.safety_level, true
FROM (
    VALUES
    -- Maison & Travaux
    ('Maison & Travaux', 'Peinture', 'Intérieur & Extérieur', ARRAY['peinture','peindre','peintre','enduit','plafond','mur','façade','facade','relooking'], ARRAY['#PEINTURE','#MAISON'], 'NORMAL'),
    ('Maison & Travaux', 'Carrelage & Sol', 'Pose & Joints', ARRAY['carrelage','carreleur','faïence','faience','parquet','sol','joint','carreau'], ARRAY['#CARRELAGE','#SOL'], 'NORMAL'),
    ('Maison & Travaux', 'Maçonnerie', 'Petits ouvrages', ARRAY['maçon','macon','parpaing','béton','beton','muret','dalle','ciment','enduit façade'], ARRAY['#MACONNERIE'], 'NORMAL'),
    ('Maison & Travaux', 'Serrurerie', 'Ouverture & Serrure', ARRAY['serrurier','serrure','clé','cle','porte claquée','porte claquee','cylindre','blindage'], ARRAY['#SERRURERIE'], 'CAUTION'),
    ('Maison & Travaux', 'Climatisation', 'Pose & Entretien', ARRAY['clim','climatisation','climatiseur','split','froid','filtre clim','gaz frigorigène'], ARRAY['#CLIM','#FROID'], 'PRO_REQUIRED'),
    ('Maison & Travaux', 'Électroménager', 'Réparation', ARRAY['frigo','réfrigérateur','refrigerateur','lave-linge','lave linge','lave-vaisselle','four','micro-ondes','électroménager'], ARRAY['#ELECTROMENAGER'], 'NORMAL'),
    ('Maison & Travaux', 'Toiture & Gouttières', 'Étanchéité & Fuite', ARRAY['toit','toiture','gouttière','gouttiere','tuile','fuite toit','étanchéité','etancheite'], ARRAY['#TOITURE'], 'CAUTION'),
    ('Maison & Travaux', 'Vitrerie', 'Vitre & Store', ARRAY['vitre','vitrage','store','mousse','moustiquaire','fenêtre','fenetre','baie'], ARRAY['#VITRERIE'], 'NORMAL'),
    ('Maison & Travaux', 'Menuiserie', 'Bois & Agencement', ARRAY['menuisier','bois','étagère sur mesure','etagere','porte bois','placard'], ARRAY['#MENUISERIE'], 'NORMAL'),
    ('Maison & Travaux', 'Plomberie', 'Installation sanitaire', ARRAY['chauffe-eau','cumulus','ballon','douche','wc','sanitaire','installation plomberie'], ARRAY['#PLOMBERIE','#INSTALLATION'], 'NORMAL'),

    -- Jardin
    ('Jardin & Extérieur', 'Élagage', 'Taille d’arbres', ARRAY['élagage','elagage','élagueur','elagueur','arbre','manguier','cocotier','branche','abattage'], ARRAY['#JARDIN','#ELAGAGE'], 'CAUTION'),
    ('Jardin & Extérieur', 'Potager', 'Culture & Entretien', ARRAY['potager','plantation','légume','legume','compost','jardin créole','jardin creole'], ARRAY['#POTAGER'], 'NORMAL'),
    ('Jardin & Extérieur', 'Piscine', 'Entretien & Mise en service', ARRAY['piscine','skimmer','chlore','ph','bâche','bache','liner'], ARRAY['#PISCINE'], 'NORMAL'),
    ('Jardin & Extérieur', 'Arrosage', 'Irrigation', ARRAY['arrosage','irrigation','goutte à goutte','programmateur'], ARRAY['#ARROSAGE'], 'NORMAL'),

    -- Auto
    ('Auto & Mobilité', 'Carrosserie', 'Rayure & Choc', ARRAY['carrosserie','bosse','rayure','pare-choc','pare choc','peinture auto'], ARRAY['#AUTO','#CARROSSERIE'], 'NORMAL'),
    ('Auto & Mobilité', 'Pneumatiques', 'Montage & Réparation', ARRAY['pneu','pneus','crevaison','équilibrage','equilibrage','jante','roue'], ARRAY['#PNEUS'], 'NORMAL'),
    ('Auto & Mobilité', 'Lavage Auto', 'Intérieur & Extérieur', ARRAY['lavage','nettoyer voiture','shampoing siège','detailing','lustrage'], ARRAY['#LAVAGE_AUTO'], 'NORMAL'),
    ('Auto & Mobilité', 'Dépannage', 'Remorquage', ARRAY['dépanneuse','depanneuse','remorquage','panne route','batterie à plat'], ARRAY['#DEPANNAGE_AUTO'], 'NORMAL'),

    -- Transport
    ('Transport & Livraison', 'Courses', 'Livraison courses', ARRAY['courses','superette','marché','marche','livrer courses','commission'], ARRAY['#COURSES','#LIVRAISON'], 'NORMAL'),
    ('Transport & Livraison', 'Aéroport', 'Transfert', ARRAY['aéroport','aeroport','ptg','pointe-à-pitre','navette aéroport','arrivée vol'], ARRAY['#AEROPORT'], 'NORMAL'),
    ('Transport & Livraison', 'Colis', 'Livraison colis', ARRAY['colis','paquet','amazon','relais','livreur'], ARRAY['#COLIS'], 'NORMAL'),
    ('Transport & Livraison', 'Déménagement', 'Aide au déménagement', ARRAY['déménagement','demenagement','cartons','monter meuble','porter','manutention'], ARRAY['#DEMENAGEMENT'], 'NORMAL'),

    -- Numérique
    ('Informatique & Numérique', 'Smartphone', 'Réglage & Dépannage', ARRAY['téléphone','telephone','smartphone','android','iphone','whatsapp','application'], ARRAY['#SMARTPHONE'], 'NORMAL'),
    ('Informatique & Numérique', 'Création Web', 'Site & Boutique', ARRAY['site internet','site web','wordpress','boutique en ligne','landing'], ARRAY['#WEB'], 'NORMAL'),
    ('Informatique & Numérique', 'Réseaux sociaux', 'Community management', ARRAY['instagram','facebook','tiktok','community','réseaux sociaux','reseaux sociaux','posts'], ARRAY['#SOCIAL'], 'NORMAL'),
    ('Informatique & Numérique', 'Graphisme', 'Logo & Affiche', ARRAY['logo','affiche','flyer','canva','graphiste','identité visuelle','identite visuelle'], ARRAY['#GRAPHISME'], 'NORMAL'),
    ('Informatique & Numérique', 'Montage Vidéo', 'Captation & Montage', ARRAY['montage vidéo','montage video','capcut','youtube','reel','after effects'], ARRAY['#VIDEO'], 'NORMAL'),

    -- Apprentissage
    ('Cours & Apprentissage', 'Langues', 'Anglais & Espagnol', ARRAY['anglais','english','espagnol','langue','conversation anglaise'], ARRAY['#LANGUES'], 'NORMAL'),
    ('Cours & Apprentissage', 'Langues', 'Créole', ARRAY['créole','creole','kréyol','kreyol','parler créole'], ARRAY['#CREOLE'], 'NORMAL'),
    ('Cours & Apprentissage', 'Informatique', 'Bureautique', ARRAY['word','excel','powerpoint','bureautique','ordinateur débutant'], ARRAY['#BUREAUTIQUE'], 'NORMAL'),
    ('Cours & Apprentissage', 'Code', 'Programmation', ARRAY['code','python','javascript','programmation','développement','developpement'], ARRAY['#CODE'], 'NORMAL'),
    ('Cours & Apprentissage', 'Permis', 'Code de la route', ARRAY['permis','code de la route','conduire','leçons de conduite','lecons de conduite'], ARRAY['#PERMIS'], 'NORMAL'),

    -- Famille
    ('Aide du Quotidien', 'Garde d’enfants', 'Babysitting', ARRAY['baby-sitting','babysitting','garde enfant','nounou','enfants','soirée enfants','soiree enfants'], ARRAY['#BABYSITTING'], 'NORMAL'),
    ('Aide du Quotidien', 'Soutien scolaire', 'Primaire & Collège', ARRAY['devoirs enfant','aide aux leçons','lecons','collège','college','primaire'], ARRAY['#SOUTIEN'], 'NORMAL'),
    ('Aide du Quotidien', 'Personnes âgées', 'Présence & Aide', ARRAY['personne âgée','personne agee','senior','aide à domicile','aide a domicile','compagnie'], ARRAY['#SENIORS'], 'NORMAL'),

    -- Animaux
    ('Animaux', 'Garde d animaux', 'Chats & NAC', ARRAY['chat','chats','nac','lapin','garde chat','cat sitting'], ARRAY['#CHATS'], 'NORMAL'),
    ('Animaux', 'Toilettage', 'Bain & Coupe', ARRAY['toilettage','toiletteur','bain chien','coupe poil'], ARRAY['#TOILETTAGE'], 'NORMAL'),
    ('Animaux', 'Éducation', 'Éducation canine', ARRAY['éducateur','educateur','obéissance','obedience','chiot'], ARRAY['#EDUCATION_CANINE'], 'NORMAL'),

    -- Beauté
    ('Beauté & Bien-être', 'Maquillage', 'Événementiel', ARRAY['maquillage','make-up','makeup','maquilleuse','mariage maquillage'], ARRAY['#MAQUILLAGE'], 'NORMAL'),
    ('Beauté & Bien-être', 'Barbier', 'Coupe homme', ARRAY['barbier','barbe','coupe homme','fade','rasage'], ARRAY['#BARBIER'], 'NORMAL'),
    ('Beauté & Bien-être', 'Massage', 'Bien-être', ARRAY['massage','masseur','relaxation','dos','détente','detente'], ARRAY['#MASSAGE'], 'NORMAL'),
    ('Beauté & Bien-être', 'Ongles', 'Manucure & Pose', ARRAY['ongles','manucure','pédicure','pedicure','gel','nail art'], ARRAY['#ONGLES'], 'NORMAL'),

    -- Événementiel
    ('Événementiel', 'DJ & Son', 'Animation musicale', ARRAY['dj','sonorisation','sono','playlist','mix','animation'], ARRAY['#DJ','#SON'], 'NORMAL'),
    ('Événementiel', 'Traiteur', 'Repas événement', ARRAY['traiteur','buffet','cocktail','réception','reception','plat créole','plat creole'], ARRAY['#TRAITEUR'], 'NORMAL'),
    ('Événementiel', 'Décoration', 'Décor événement', ARRAY['décoration','decoration','ballons','arche','fleuriste événement','fleuriste evenement'], ARRAY['#DECO'], 'NORMAL'),
    ('Événementiel', 'Animation', 'Enfants & Adultes', ARRAY['animateur','clown','magicien','kermesse','anniversaire enfants'], ARRAY['#ANIMATION'], 'NORMAL'),
    ('Événementiel', 'Vidéaste', 'Captation événement', ARRAY['vidéaste','videaste','cameraman','film mariage','aftermovie'], ARRAY['#VIDEASTE'], 'NORMAL'),

    -- Sport
    ('Sport & Activités', 'Fitness', 'Coaching sportif', ARRAY['coach sportif','musculation','fitness','perte de poids','remise en forme'], ARRAY['#FITNESS'], 'NORMAL'),
    ('Sport & Activités', 'Danse', 'Cours de danse', ARRAY['danse','zouk','kompa','salsa','choregraphie','chorégraphie'], ARRAY['#DANSE'], 'NORMAL'),
    ('Sport & Activités', 'Natation', 'Cours de natation', ARRAY['nager','natation','piscine cours','bébé nageur','bebe nageur'], ARRAY['#NATATION'], 'NORMAL'),
    ('Sport & Activités', 'Yoga', 'Yoga & Pilates', ARRAY['yoga','pilates','méditation','meditation','souplesse'], ARRAY['#YOGA'], 'NORMAL'),
    ('Sport & Activités', 'Arts martiaux', 'Défense & Discipline', ARRAY['judo','karaté','karate','boxe','self-défense','self defense'], ARRAY['#ARTS_MARTIAUX'], 'NORMAL'),

    -- Mer (Antilles)
    ('Mer & Nautisme', 'Bateau', 'Entretien & Sortie', ARRAY['bateau','annexe','moteur hors-bord','hors bord','coque','nautisme'], ARRAY['#BATEAU'], 'NORMAL'),
    ('Mer & Nautisme', 'Pêche', 'Sortie pêche', ARRAY['pêche','peche','pêcheur','pecheur','en mer','appât','appat'], ARRAY['#PECHE'], 'NORMAL'),
    ('Mer & Nautisme', 'Plongée', 'Baptême & Encadrement', ARRAY['plongée','plongee','tuba','palmes','bouteille','moniteur plongée'], ARRAY['#PLONGEE'], 'CAUTION'),
    ('Mer & Nautisme', 'Voile', 'Initiation voile', ARRAY['voile','catamaran','dériveur','deriveur','kayak mer'], ARRAY['#VOILE'], 'NORMAL'),

    -- Cuisine
    ('Cuisine & Alimentation', 'Traiteur domicile', 'Plats à emporter', ARRAY['plat du jour','bokit','accras','colombo','cuisiner pour moi','repas livré','repas livre'], ARRAY['#TRAITEUR_DOMICILE'], 'NORMAL'),
    ('Cuisine & Alimentation', 'Pâtisserie', 'Gâteaux & Desserts', ARRAY['gâteau','gateau','pâtisserie','patisserie','wedding cake','dessert'], ARRAY['#PATISSERIE'], 'NORMAL'),

    -- Mode
    ('Mode & Couture', 'Stylisme', 'Conseil look', ARRAY['styliste','look','relooking','shopping accompagné','shopping accompagne'], ARRAY['#STYLISME'], 'NORMAL'),
    ('Mode & Couture', 'Tresses & Mèches', 'Pose', ARRAY['mèches','meches','tissage','vanilles','locks','nattes'], ARRAY['#TRESSES'], 'NORMAL'),

    -- Admin / pro
    ('Administratif', 'Comptabilité', 'Devis & Factures', ARRAY['comptable','facturation','devis excel','auto-entrepreneur','urssaf'], ARRAY['#COMPTA'], 'NORMAL'),
    ('Administratif', 'Traduction', 'FR / EN / ES / Créole', ARRAY['traduction','traducteur','interprète','interprete'], ARRAY['#TRADUCTION'], 'NORMAL'),
    ('Administratif', 'Rédaction', 'CV & Lettres', ARRAY['cv','lettre de motivation','linkedin','rédaction','redaction'], ARRAY['#REDACTION'], 'NORMAL'),

    -- Location / logistique
    ('Location & Matériel', 'Outillage', 'Prêt & Location', ARRAY['location outil','perceuse','échafaudage','echafaudage','groupe électrogène','groupe electrogene'], ARRAY['#OUTILLAGE'], 'NORMAL'),
    ('Location & Matériel', 'Événement', 'Location matériel fête', ARRAY['location tente','table fête','table fete','chaise','sono location','vaisselle'], ARRAY['#LOCATION_FETE'], 'NORMAL'),

    -- Agriculture
    ('Agriculture & Marché', 'Aide agricole', 'Récolte & Entretien', ARRAY['banane','canne','jardin créole','jardin creole','récolte','recolte','abattis'], ARRAY['#AGRICULTURE'], 'NORMAL'),

    -- Spiritualité / culture (keep NORMAL, no medical claims)
    ('Art & Création', 'Peinture & Dessin', 'Cours & Commande', ARRAY['peinture tableau','dessin','portrait','aquarelle','toile'], ARRAY['#DESSIN'], 'NORMAL'),
    ('Art & Création', 'Artisanat', 'Création locale', ARRAY['artisanat','bijoux','madras','woodwork','création locale','creation locale'], ARRAY['#ARTISANAT'], 'NORMAL')
) AS v(universe, category, subcategory, synonyms, tags, safety_level)
WHERE NOT EXISTS (
    SELECT 1
    FROM public.lyann_taxonomy t
    WHERE t.universe = v.universe
      AND t.category = v.category
      AND t.subcategory = v.subcategory
);

COMMIT;
