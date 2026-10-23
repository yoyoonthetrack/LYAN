'use strict';
(function(root) {
const PLANS = Object.freeze({
 FREE: Object.freeze({code:'FREE',name:'Gratuit',monthlyCents:0,badge:null,missionsPerMonth:2,photos:5,videos:0,categories:1,verification:false,business:false,available:true}),
 PLUS: Object.freeze({code:'PLUS',name:'Plus',monthlyCents:790,badge:'Lyanneur Plus',missionsPerMonth:null,photos:20,videos:1,categories:3,verification:false,business:false,available:true}),
 PRO: Object.freeze({code:'PRO',name:'Pro',monthlyCents:1990,badge:'Pro',missionsPerMonth:null,photos:50,videos:3,categories:5,verification:true,business:true,available:true}),
 ENTERPRISE: Object.freeze({code:'ENTERPRISE',name:'Entreprise',monthlyCents:null,badge:null,available:false})
});
const FEATURES = Object.freeze([
 ['Consulter et publier des Bokantaj',true,true,true],
 ['Voir les annonces, les profils et la carte',true,true,true],
 ['Messagerie, favoris et avis',true,true,true],
 ['Demandes de service','Illimitées','Illimitées','Illimitées'],
 ['Missions comme prestataire','2 par mois','Illimitées','Illimitées'],
 ['Paiement par étape',true,true,true],
 ['Historique des missions',true,true,true],
 ['Photos du portfolio',5,20,50],
 ['Vidéos du portfolio',0,1,3],
 ['Catégories d’activité',1,3,5],
 ['Badge de formule','—','Lyanneur Plus','Pro'],
 ['Dépôt et examen des justificatifs',false,false,true],
 ['Badge Vérifié',false,false,'Après validation'],
 ['Vitrine d’établissement',false,false,'1 établissement'],
 ['Horaires, promotions et repère durable',false,false,true],
 ['Suivi centralisé des missions et paiements',false,false,true],
 ['Gestion des devis et factures PDF',false,false,true],
 ['Acomptes, avoirs et export CSV',false,false,true],
 ['Synthèse mensuelle de l’activité',false,false,true],
 ['Gestion du compte','1 personne','1 personne','1 personne'],
 ['Assistance','Standard','Standard','Prioritaire']
]);
function effectivePlan(subscription, now = Date.now()) {
 if (!subscription || !['PLUS','PRO'].includes(subscription.plan) ||
 !['active','cancel_at_period_end'].includes(subscription.status) ||
 !Number.isFinite(Date.parse(subscription.expires_at)) || Date.parse(subscription.expires_at) <= now) return PLANS.FREE;
 return PLANS[subscription.plan];
}
function verifiedBadge(plan, dossier, now = Date.now()) {
 if(plan.code!=='PRO'||dossier?.status!=='approved'||!['general','construction','regulated'].includes(dossier.identity?.activity)||!Array.isArray(dossier.documents)||!dossier.documents.length)return false;
 const required=['registration',...(dossier.identity.activity==='construction'?['insurance','decennial']:[]),...(dossier.identity.activity==='regulated'?['qualification','insurance']:[])];
 return required.every(kind=>dossier.documents.some(d=>d.kind===kind))&&dossier.documents.every(d=>{
  if(d.decision!=='approved'||(['insurance','decennial'].includes(d.kind)&&!d.expires_at))return false;
  if(!d.expires_at)return true;
  const date=Date.parse(d.expires_at+'T00:00:00Z');
  return /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(d.expires_at)&&Number.isFinite(date)&&new Date(date).toISOString().slice(0,10)===d.expires_at&&date+86400000>now;
 });
}
function badgeLabel(profile, now = Date.now()) {
 const b=profile?.lyann_badges;
 if(!b||!Number.isFinite(Date.parse(b.valid_until))||Date.parse(b.valid_until)<=now)return '';
 return b.plan==='PLUS'?'Lyanneur Plus':b.plan==='PRO'?(b.verified===true?'Pro · Vérifié':'Pro'):'';
}
const api = Object.freeze({PLANS,FEATURES,effectivePlan,verifiedBadge,badgeLabel});
if(typeof module !== 'undefined' && module.exports) module.exports=api;
else root.LYANN_PLANS=api;
})(typeof window === 'undefined' ? globalThis : window);
