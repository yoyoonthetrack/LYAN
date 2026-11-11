'use strict';
const { S, T } = require('./_dsl');

// « Autres » : filet de sécurité de la 10e position. Jamais proposé comme compétence de profil.
module.exports = [
    T('autre_demande', 'Autre besoin (demande libre)', 'libre', {},
        'autre|autres|divers|demande libre|je ne trouve pas|autre besoin|autre service',
        'je ne sais pas dans quelle categorie ranger ma demande|c est un peu particulier',
        '',
        [
            S('non_classee', 'Demande à classer', 'non classe|a classer|besoin particulier|demande atypique|question|renseignement', 'je ne sais pas comment decrire mon besoin'),
            S('service_direct', 'Service direct (demande ciblée à un membre)', 'service direct|demande directe|demande ciblee|demande a un membre|contact direct', 'je veux demander un service a une personne precise')
        ])
];
