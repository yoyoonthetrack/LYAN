'use strict';
const { S, T } = require('./_dsl');

module.exports = [
    // ───────────── Enfants & garde ─────────────
    T('garde_enfants', 'Garde d\'enfants & babysitting', 'enfants',
        { safety: 'CAUTION', regulation: 'Entraide ponctuelle uniquement. L\'accueil régulier d\'enfants contre rémunération relève des assistantes maternelles agréées.' },
        'garde d enfants|garde enfant|babysitting|baby sitting|baby sitter|nounou|babysitter|garder mes enfants|garde de bebe|assistante maternelle',
        'je cherche quelqu un pour garder mes enfants|je sors ce soir et j ai besoin d une nounou|mon enfant sort de l ecole a 16h',
        'ti moun',
        [
            S('babysitting_soiree', 'Babysitting ponctuel (soirée, week-end)', 'babysitting|baby sitting|garde ponctuelle|garde du soir|soiree enfants|garde du week end|baby sitter|sortie du soir|garde de nuit', 'garder mes enfants ce soir|un babysitter samedi soir'),
            S('garde_reguliere', 'Garde à domicile régulière (nounou)', 'nounou|garde a domicile|garde reguliere|garde enfant domicile|garde partagee|nounou a domicile|garde en journee', 'une nounou pour la rentree|garde pendant mes horaires de travail'),
            S('sortie_ecole', 'Sortie d\'école, goûter & accompagnement', 'sortie d ecole|sortie ecole|gouter|accompagnement scolaire trajet|periscolaire|aller chercher a l ecole|cantine|garderie|mercredi', 'aller chercher mon fils a l ecole|garde le mercredi'),
            S('garde_vacances', 'Garde pendant les vacances & activités', 'garde vacances|vacances scolaires|activites enfants|centre de loisirs|stage enfants|animation vacances|jeux enfants|sorties enfants|colonie', 'garder les enfants pendant les vacances'),
            S('garde_bebe', 'Garde de bébé & jeunes enfants', 'garde de bebe|garde nourrisson|bebe|bebe a garder|puericulture|biberon|enfant en bas age|jeune enfant|eveil enfant', 'quelqu un pour garder mon bebe de 6 mois')
        ]),

    // ───────────── Soutien scolaire & cours ─────────────
    T('soutien_scolaire', 'Soutien scolaire', 'cours', {},
        'soutien scolaire|aide aux devoirs|cours particuliers|prof|professeur|tutorat|cours de maths|repetiteur|accompagnement scolaire|devoirs|ecole',
        'mon enfant a des difficultes a l ecole|il doit remonter ses notes|mon fils prepare le bac',
        '',
        [
            S('devoirs_primaire', 'Aide aux devoirs (primaire)', 'aide aux devoirs|devoirs|primaire|cp|ce1|ce2|cm1|cm2|lecture|ecriture|calcul|aide aux lecons|apprendre a lire', 'aider mon enfant avec les devoirs|apprendre a lire a mon fils'),
            S('college_lycee', 'Collège & lycée (maths, français, sciences…)', 'college|lycee|maths|mathematiques|physique chimie|svt|histoire geographie|francais|philosophie|cours particuliers|soutien scolaire college|cours de maths', 'cours de maths pour ma fille en 3eme|soutien en physique'),
            S('preparation_examens', 'Préparation aux examens & concours', 'brevet|bac|concours|preparation examen|revisions|oral|bts|dut|concours administratif|entree en 6eme|prepa|methodologie', 'preparer le bac|reviser pour le brevet'),
            S('enseignement_superieur', 'Études supérieures & reprise d\'études', 'etudes superieures|licence|master|fac|dossier etudiant|reprise d etudes|methodologie universitaire|memoire|stage etudiant|parcoursup', 'aide pour mon memoire|reorientation apres le bac')
        ]),

    T('langues', 'Cours de langues', 'cours', {},
        'langues|cours de langues|anglais|espagnol|creole|francais|portugais|allemand|italien|chinois|langue etrangere|conversation',
        'je veux apprendre l anglais|je pars a l etranger|je veux parler creole',
        'kreyol|kweyol|kreyòl|creole|patois',
        [
            S('anglais', 'Anglais', 'anglais|english|cours d anglais|conversation anglaise|toeic|toefl|anglais professionnel|anglais enfants|anglais tourisme', 'apprendre l anglais|cours d anglais pour mon travail'),
            S('espagnol', 'Espagnol', 'espagnol|spanish|cours d espagnol|conversation espagnole|espagnol professionnel|dele', 'cours d espagnol pour mon voyage'),
            S('creole', 'Créole', 'creole|kreyol|kweyol|apprendre le creole|cours de creole|ecrire en creole|parler creole|langue creole|creole haitien|kreyol ayisyen', 'apprendre le creole|cours de kreyol pour mon conjoint', 'kreyol|kweyol|patois'),
            S('francais_alphabetisation', 'Français, alphabétisation & remise à niveau', 'francais|francais langue etrangere|fle|alphabetisation|illettrisme|remise a niveau|orthographe|lecture|ecriture|grammaire|dictee', 'apprendre a lire et ecrire|remise a niveau en francais'),
            S('autres_langues', 'Autres langues (portugais, allemand, chinois…)', 'portugais|allemand|italien|chinois|neerlandais|russe|arabe|japonais|langue des signes|lsf|autre langue', 'cours de portugais|apprendre le neerlandais')
        ]),

    T('cours_musique', 'Cours de musique & chant', 'cours', { also: ['evenement'] },
        'cours de musique|musique|piano|guitare|batterie|saxophone|violon|ukulele|chant|solfege|instrument|prof de musique|percussions|tambour|ka',
        'je veux apprendre un instrument|mon enfant veut faire de la musique',
        'ka|tambour ka|tambou|ti bwa|gwoka|accordeon',
        [
            S('instruments', 'Piano, guitare, batterie & instruments', 'piano|guitare|batterie|saxophone|violon|ukulele|trompette|flute|basse|clavier|cours de piano|cours de guitare|cours de batterie|prof de batterie|lecon batterie|percussions|accordeon', 'cours de batterie pour mon fils|apprendre la guitare|prof de piano pour debutant'),
            S('chant_solfege', 'Chant, solfège & théorie', 'chant|cours de chant|solfege|chorale|technique vocale|theorie musicale|lecture de partitions|chanter', 'cours de chant|apprendre a lire une partition'),
            S('percussions_traditionnelles', 'Percussions & musiques traditionnelles', 'percussions|tambour|tambour ka|gwoka|ka|ti bwa|tambou|musique traditionnelle|tanbou|musique creole|bele', 'apprendre le ka|cours de gwoka', 'ka|tambou|ti bwa'),
            S('eveil_musical', 'Éveil musical (enfants)', 'eveil musical|musique bebe|musique enfants|initiation musicale|comptines|eveil sonore', 'eveil musical pour mon bebe')
        ]),

    T('permis_code_route', 'Code de la route & permis', 'cours', {},
        'permis|code de la route|code|permis de conduire|conduite|reviser le code|examen du code|permis moto|permis b|permis am',
        'je prepare le code|j ai peur de conduire|je dois repasser mon permis',
        '',
        [
            S('code_route', 'Révision du code de la route', 'code de la route|reviser le code|examen du code|code|questions de code|cours de code|test de code|se preparer au code', 'reviser le code avec quelqu un|j ai rate le code'),
            S('reprise_confiance', 'Reprise de confiance au volant (accompagnement)', 'reprise de confiance|peur de conduire|appréhension|accompagnement volant|conduite accompagnee amicale|reprendre le volant', 'j ai peur de conduire apres mon accident', ''),
            S('lecons_conduite', 'Leçons de conduite rémunérées', 'lecons de conduite|cours de conduite|moniteur|auto ecole|heure de conduite|permis b|apprendre a conduire', 'des lecons de conduite|moniteur de conduite', '',
                { selectable: false, safety: 'RESTRICTED', regulation: 'Les leçons de conduite rémunérées relèvent d\'écoles de conduite agréées : non proposées comme compétence.' })
        ]),

    // ───────────── Seniors & aide à la personne ─────────────
    T('aide_personnes_agees', 'Seniors : présence & accompagnement', 'seniors',
        { safety: 'CAUTION', regulation: 'Aide non médicale uniquement. Toilette, soins, aide à la prise de médicaments : professionnels agréés (services d\'aide à domicile, aides-soignants).' },
        'personne agee|personnes agees|senior|aide a domicile|accompagnement senior|compagnie|visite|aidant|grand parent|aide seniors|presence',
        'ma mere est seule|mon pere ne peut plus sortir|je ne peux pas laisser mes parents seuls',
        '',
        [
            S('compagnie_presence', 'Compagnie & présence', 'compagnie|presence|tenir compagnie|visite|discussion|lecture|jeux de societe|promenade senior|sortie senior|accompagnement de jour', 'tenir compagnie a ma grand mere|une visite pour mon pere tous les jours'),
            S('aide_repas_courses_seniors', 'Repas, courses & aide pratique', 'preparation des repas|aide aux repas|courses senior|aide pratique|menage leger senior|aide a domicile|petits services senior|aide quotidienne senior', 'preparer les repas de ma mere|faire les courses de mon pere'),
            S('accompagnement_sorties_rdv', 'Accompagnement de sorties & rendez-vous', 'accompagnement|accompagner|sortie|rendez vous|rendez vous medical|marche|promenade|messe|banque|coiffeur senior', 'accompagner ma mere a son rendez vous|sortie hebdomadaire'),
            S('aide_toilette_soins', 'Toilette, soins & aide médicale', 'toilette|aide a la toilette|soins infirmiers|aide soignant|prise de medicaments|injection|pansement|perfusion|soins a domicile|soins palliatifs', 'aide pour la toilette de ma mere|infirmier a domicile', '',
                { selectable: false, safety: 'RESTRICTED', regulation: 'Actes de soin et de toilette : services agréés ou professionnels de santé. Non proposé comme compétence LYANN.' })
        ]),

    // ───────────── Aide du quotidien ─────────────
    T('aide_quotidienne', 'Coups de main & aide du quotidien', 'quotidien', {},
        'aide ponctuelle|coup de main|aide quotidienne|petit service|service|aide|assistance|depannage humain|entraide|aider|rendre service',
        'j ai besoin d un coup de main|je ne sais pas qui appeler|je suis debordee',
        '',
        [
            S('coup_de_main', 'Coup de main ponctuel', 'coup de main|aide ponctuelle|petit service|rendre service|entraide|aide aujourd hui|aide demain|petit coup de pouce|service rapide', 'j ai besoin d un coup de main cet apres midi|quelqu un pour m aider une heure'),
            S('accompagnement_quotidien', 'Accompagnement & présence au quotidien', 'accompagnement|aide quotidienne|presence|accompagner|assistance quotidienne|aide a la personne non medicale|aide aux sorties', 'un accompagnement regulier|quelqu un pour m aider au quotidien'),
            S('aide_deplacement_courses', 'Aide aux déplacements & courses', 'aide aux deplacements|aide aux sorties|courses a pied|porter les courses|marche|accompagner faire les courses', 'aller au supermarche avec moi'),
            S('aide_evenement_famille', 'Aide pour un événement familial', 'aide evenement familial|aide bapteme|aide mariage famille|aide pour la fete|aide cuisine fete|aide repas famille|aide installation', 'un coup de main pour preparer le bapteme')
        ]),

    T('courses_commissions', 'Courses & commissions', 'quotidien', { also: ['transport'] },
        'courses|faire les courses|commissions|supermarche|marche|drive|pharmacie|aide aux courses|livrer les courses|pain|achats|marche couvert',
        'je ne peux pas aller au supermarche|j ai besoin que quelqu un aille me chercher quelque chose',
        'marche couvert|lolo|market',
        [
            S('courses_alimentaires', 'Courses alimentaires', 'courses|faire les courses|supermarche|marche|courses alimentaires|aide aux courses|drive|livraison des courses|achats alimentaires|provisions|liste de courses', 'faire mes courses pour la semaine|aller au marche pour moi'),
            S('commissions_diverses', 'Commissions & achats pour autrui', 'commissions|achats|pharmacie|poste|recuperer un document|aller chercher|banque|mairie|retirer un colis|demarches a pied|course urgente', 'aller chercher mes medicaments|deposer un dossier a la mairie'),
            S('portage_courses', 'Portage & rangement des courses', 'portage|porter les courses|ranger les courses|monter les courses|aide aux courses lourdes|etage|sacs de courses', 'monter mes courses au 4eme etage')
        ]),

    // ───────────── Animaux de compagnie ─────────────
    T('garde_animaux', 'Garde & promenade d\'animaux', 'animaux',
        { safety: 'CAUTION', regulation: 'Pas de soins vétérinaires. Pension à titre professionnel : déclaration et locaux conformes.' },
        'garde d animaux|garde animaux|pet sitting|dog sitting|chien|chat|promenade|animaux|pension|garder mon chien|garder mon chat|nac|animal de compagnie',
        'je pars en vacances et j ai un chien|qui peut nourrir mon chat|mon chien a besoin de sortir',
        'chien creole|cabri',
        [
            S('garde_chiens', 'Garde & pension de chiens', 'garde de chien|garder mon chien|pension chien|dog sitting|chien|chiot|garde de chiot|garde a domicile chien|hebergement chien|vacances chien', 'garder mon chien pendant les vacances|pension pour mon chiot'),
            S('chats_nac', 'Chats & nouveaux animaux de compagnie (NAC)', 'garde de chat|chat|chats|nac|lapin|furet|rongeur|cobaye|tortue|perruche|oiseau|poisson|cat sitting', 'nourrir mon chat pendant mon absence|garder mon lapin'),
            S('promenade', 'Promenade & sorties de chiens', 'promenade|promenade chien|promener mon chien|sortir le chien|balade chien|dog walking|marche chien|promeneur de chiens', 'promener mon chien le midi|sortir mon chien tous les jours'),
            S('visite_domicile', 'Visites à domicile (nourrissage, soins courants)', 'visite a domicile animaux|nourrir|donner a manger|visite chat|litiere|passage quotidien|changer l eau|soins courants|medicaments animaux', 'passer nourrir mon chat deux fois par jour'),
            S('transport_animaux', 'Transport d\'animaux', 'transport animaux|taxi animalier|pet taxi|emmener chez le veto|transport chien|transport chat|animal en voiture|aeroport animal', 'emmener mon chien chez le veterinaire')
        ]),

    T('toilettage_animaux', 'Toilettage d\'animaux', 'animaux', {},
        'toilettage|toiletteur|toiletteuse|bain chien|coupe poil|tonte chien|griffes|brossage|bain animal|soins hygiene animaux',
        'mon chien a des noeuds|mon chat est sale|il perd beaucoup de poils',
        '',
        [
            S('bain_coupe', 'Bain, coupe & brossage', 'bain chien|coupe poils|tonte chien|brossage|demelage|toilettage chien|toilettage chat|detartrage dents chien|poils|noeuds', 'toiletter mon chien|bain pour mon chat'),
            S('hygiene_soins', 'Griffes, oreilles & hygiène', 'griffes|oreilles|yeux|hygiene|glandes anales|pelage|puces et tiques|brossage dents|soins hygiene', 'couper les griffes de mon chien'),
            S('domicile_mobile', 'Toilettage à domicile', 'toilettage a domicile|toiletteur mobile|toilettage mobile|bain a domicile animal|salon mobile', 'un toiletteur qui vient chez moi')
        ]),

    T('education_canine', 'Éducation canine & comportement', 'animaux', { safety: 'CAUTION', regulation: 'Chiens catégorisés : obligations réglementaires (permis de détention) ; pas de diagnostic comportemental médical.' },
        'education canine|educateur canin|dressage|comportement|chiot|obeissance|rappel|ordres|laisse|socialisation|apprendre au chien|educateur',
        'mon chien tire en laisse|mon chiot fait des betises|mon chien aboie tout le temps',
        '',
        [
            S('chiot', 'Éducation du chiot', 'chiot|education chiot|propreté chiot|socialisation chiot|morsures chiot|bases education|puppy|premier chien', 'eduquer mon chiot|mon chiot mord tout'),
            S('obeissance', 'Obéissance & rappel', 'obeissance|rappel|assis|couche|pas bouger|tirer en laisse|laisse|ordres de base|dressage|marche au pied', 'mon chien ne revient pas quand je l appelle|il tire en laisse'),
            S('comportement', 'Comportement (aboiements, anxiété, agressivité)', 'comportement|aboiements|anxiete de separation|agressivite|peur|destruction|reactif|educateur comportementaliste', 'mon chien aboie toute la journee|il est tres peureux')
        ])
];
