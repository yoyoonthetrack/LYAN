'use strict';
(function(){
 const $=(id)=>document.getElementById(id);
 const esc=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const labels={draft:'Brouillon',submitted:'En cours d’examen',needs_info:'À compléter',approved:'Validé',rejected:'Refusé',suspended:'Validation suspendue'};
 let current=null, currentPlan=null, lastFocus=null;
 async function request(path,body,blob=false){
  const client=window.apiClient||window.LYANN_API_CLIENT;
  const session=await client?.getSession();
  const token=session?.data?.session?.access_token;
  if(!token)throw Error('Connectez-vous à LYANN pour continuer.');
  const origin=typeof getLyannBackendOrigin==='function'?getLyannBackendOrigin():window.LYANN_BACKEND_ORIGIN||'';
  if(window.Capacitor?.isNativePlatform?.()&&!origin)throw Error('La passerelle Staging doit être configurée pour cette application.');
  const res=await fetch(origin+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  if(blob&&res.ok)return res.blob();
  const data=await res.json();
  if(!res.ok)throw Error(data.error||'Opération indisponible.');
  return data;
 }
 function notice(message,error=false){const el=$('businessDialog')?.querySelector('#businessNotice')||$('businessNotice');if(el){el.textContent=message;el.dataset.error=String(error);}}
 async function action(button,fn){
  if(button.disabled)return;
  button.disabled=true;
  try{await fn();}catch(e){notice(e.message,true);}finally{button.disabled=false;}
 }
 function formData(form){return Object.fromEntries(new FormData(form));}
 function renderDossier(data){
  current=data.dossier;currentPlan=data.plan;
  $('businessPlan').textContent=data.plan.name+(data.verified?' · Vérifié':'');
  const allowed=data.plan.code==='PRO';
  if($('proEligibility'))$('proEligibility').textContent=allowed?'LYANN lit vos documents, puis décide.':'';
  $('dossierStatus').textContent=current?labels[current.status]:'Aucun dossier envoyé';
  $('dossierMessage').textContent=current?.message||'';
  const editable=allowed&&(!current||['draft','needs_info','rejected'].includes(current.status));
  for(const control of $('proIdentity').elements)control.disabled=!editable;
  if(current)for(const [key,value]of Object.entries(current.identity))if($('proIdentity').elements[key])$('proIdentity').elements[key].value=value;
  $('proUpload').hidden=!editable||!current;
  $('proSubmit').hidden=!editable||!current;
  $('proDocuments').innerHTML=(current?.documents||[]).map(d=>'<li><strong>'+esc(d.name)+'</strong> — '+esc(d.kind)+(d.expires_at?' · valable jusqu’au '+esc(d.expires_at):'')+' <button type="button" data-document="'+esc(d.id)+'" data-owner="'+esc(current.user_id)+'">Télécharger</button></li>').join('');
 }
 function contactForm(kind){
  return '<form id="businessContact"><input type="hidden" name="kind" value="'+kind+'"><label>Nom<input name="name" maxlength="160" required autocomplete="name"></label><label>Organisation<input name="organization" maxlength="160" required autocomplete="organization"></label><label>E-mail<input name="email" type="email" maxlength="254" required autocomplete="email"></label><label>Nombre de collaborateurs ou d’établissements<input name="size" maxlength="100"></label><label>Votre message<textarea name="message" maxlength="3000" required rows="4"></textarea></label><p>Votre demande sera consultée par l’équipe LYANN. Une connexion est nécessaire pour l’envoyer.</p><button type="submit">Envoyer ma demande</button></form>';
 }
 function closeDialog(){const d=$('businessDialog');if(d){d.close();d.remove();}lastFocus?.focus();}
 function dialog(title,html){
  lastFocus=document.activeElement;
  $('businessDialog')?.remove();
  const d=document.createElement('dialog');d.id='businessDialog';d.className='business-dialog';
  d.setAttribute('aria-labelledby','businessDialogTitle');
  d.innerHTML='<button type="button" data-close aria-label="Fermer">×</button><h2 id="businessDialogTitle">'+esc(title)+'</h2><p id="businessNotice" role="status" aria-live="polite"></p>'+html;
  document.body.append(d);d.querySelector('[data-close]').onclick=closeDialog;
  d.addEventListener('cancel',e=>{e.preventDefault();closeDialog();});d.showModal();
 }
 function contact(kind){
  dialog(kind==='enterprise'?'Contacter LYANN Entreprise':'Proposer un partenariat',contactForm(kind));
  $('businessContact').onsubmit=e=>{e.preventDefault();action(e.submitter,async()=>{
   const data=await request('/v1/business/contact',formData(e.target));
   notice(data.message);e.target.reset();e.target.hidden=true;
  });};
 }
 function openPlan(code){
  if(code==='ENTERPRISE'){contact('enterprise');return;}
  const plan=window.LYANN_PLANS.PLANS[code];
  if(!plan)return;
  dialog(plan.name,'<p>'+(code==='FREE'?'Cette formule est incluse avec un compte LYANN.':'Cette formule est en préparation. Aucun abonnement payant ne peut encore être acheté. Le prix d’un achat sera celui du magasin.')+'</p><a class="business-link" href="'+(code==='FREE'?'index.html#signup':'professional.html')+'">'+(code==='FREE'?'Rejoindre LYANN':'Voir mon espace professionnel')+'</a>');
 }
 const PLAN_NOTES={
  'Vidéos du portfolio':'Prévu, pas encore disponible',
  'Gestion des devis et factures PDF':'Documents de test sur Staging, pas une facturation définitive',
  'Acomptes, avoirs et export CSV':'Export d’activité disponible. Facturation conforme non ouverte',
  'Assistance':'L’assistance prioritaire reste prévue'
 };
 function cellText(label,value){
  const base=value===true?'Inclus':value===false?'—':String(value??'');
  const offered=value===true||(typeof value==='number'&&value>0)||(label==='Assistance'&&value==='Prioritaire');
  return offered&&PLAN_NOTES[label]?base+' · '+PLAN_NOTES[label]:base;
 }
 function applyPlanDisclosure(data){
  const allowed=data?.plan?.code==='PRO';
  document.querySelectorAll('[data-pro-tools], [data-pro-verify]').forEach((el)=>{el.hidden=!allowed;});
  const gate=$('proToolsGate');
  if(gate)gate.hidden=!!allowed;
  const identity=$('proIdentity');
  if(identity)identity.hidden=!allowed;
  const eligibility=$('proEligibility');
  if(eligibility)eligibility.hidden=!allowed;
 }
 async function loadMe(){const data=await request('/v1/business/me');if($('proIdentity'))renderDossier(data);applyPlanDisclosure(data);return data;}
 window.LYANN_BUSINESS={openPlan,contact,request,loadMe};
 async function renderAdmin(which,page=0){
  const dossiers=which==='dossiers', path='/v1/admin/business/'+which;
  const result=await request(path+'?page='+page);
  if(which==='places') {
   $('adminBusinessRows').innerHTML=result.rows.map(row=>'<article class="business-panel"><h2>'+esc(row.content.name)+'</h2><p>'+esc(row.content.description)+'</p><p>'+esc(row.content.address)+' · '+esc(row.content.hours)+'</p><p>'+esc(row.content.closures)+' · '+esc(row.content.promotion)+'</p><p>Position : '+esc(row.content.lat)+', '+esc(row.content.lng)+' · Photos : '+esc(row.content.photo_ids.join(', '))+'</p><p>'+esc(row.status)+' · '+esc(row.review_message)+'</p><form data-place-review="'+esc(row.user_id)+'" data-version="'+row.version+'"><label>Décision<select name="status"><option value="approved">Publier</option><option value="rejected">Refuser</option><option value="suspended">Suspendre</option></select></label><label>Message<textarea name="message" required maxlength="2000"></textarea></label><button>Enregistrer</button></form></article>').join('')||'<p>Aucune vitrine.</p>';
  } else $('adminBusinessRows').innerHTML=result.rows.map(row=>dossiers?
   '<article class="business-panel"><h2>'+esc(row.identity.business_name)+'</h2><p>'+esc(row.identity.legal_name)+' · SIRET '+esc(row.identity.siret)+'</p><p>'+esc(row.identity.address)+' · '+esc(row.identity.representative)+' · '+esc(row.identity.activity)+'</p><p><strong>'+esc(labels[row.status])+'</strong> · Version '+row.version+'</p><p>'+esc(row.message)+'</p><ul>'+row.documents.map(d=>'<li>'+esc(d.kind)+' — '+esc(d.name)+(d.expires_at?' · '+esc(d.expires_at):'')+' <button data-document="'+esc(d.id)+'" data-owner="'+esc(row.user_id)+'">Télécharger</button></li>').join('')+'</ul><form data-review="'+esc(row.user_id)+'" data-version="'+row.version+'"><label>Décision<select name="status"><option value="needs_info">Demander un complément / rouvrir</option><option value="approved">Valider</option><option value="rejected">Refuser</option><option value="suspended">Suspendre</option></select></label><label>Message destiné au professionnel<textarea name="message" required maxlength="2000"></textarea></label><label><input type="checkbox" name="confirmChecked"> J’ai examiné tous les justificatifs et leur validité.</label><button>Enregistrer la décision</button></form><button data-history="'+esc(row.user_id)+'">Voir l’historique</button><pre data-history-output="'+esc(row.user_id)+'"></pre></article>':
   '<article class="business-panel"><h2>'+esc(row.organization)+'</h2><p>'+esc(row.kind)+' · '+esc(row.name)+' · '+esc(row.email)+'</p><p>'+esc(row.size)+'</p><p class="business-message">'+esc(row.message)+'</p><form data-contact-id="'+esc(row.id)+'"><label>Traitement<select name="status">'+[['new','Nouveau'],['in_progress','En cours'],['closed','Traité']].map(([v,l])=>'<option value="'+v+'" '+(row.status===v?'selected':'')+'>'+l+'</option>').join('')+'</select></label><button>Enregistrer</button></form></article>').join('')||'<p>Aucun dossier à afficher.</p>';
  $('businessPage').textContent='Page '+(page+1);
  $('businessPrevious').disabled=page===0;$('businessNext').disabled=result.rows.length<25;
  $('businessPrevious').onclick=()=>action($('businessPrevious'),()=>renderAdmin(which,page-1));
  $('businessNext').onclick=()=>action($('businessNext'),()=>renderAdmin(which,page+1));
 }
 function init(){
  if($('plansComparison')){
   const rows=window.LYANN_PLANS.FEATURES;
   const names=['Gratuit','Plus','Pro'];
   const summary=$('plansComparison').querySelector('summary');
   const body=document.createElement('div');
   const switcher=document.createElement('div');
   switcher.className='lyann-compare-switch';
   switcher.setAttribute('role','tablist');
   switcher.setAttribute('aria-label','Choisir une formule à comparer');
   const mobile=document.createElement('div');
   mobile.className='lyann-compare-mobile';
   function showPlan(index){
    switcher.querySelectorAll('button').forEach((button,i)=>button.setAttribute('aria-selected',i===index?'true':'false'));
    mobile.replaceChildren();
    rows.forEach(([label,...values])=>{
     const row=document.createElement('div');
     if(cellText(label,values[index])!==(values[index]===true?'Inclus':values[index]===false?'—':String(values[index]??'')))row.className='is-planned';
     const name=document.createElement('span');
     name.textContent=label;
     const value=document.createElement('strong');
     value.textContent=cellText(label,values[index]);
     row.append(name,value);
     mobile.append(row);
    });
   }
   names.forEach((name,index)=>{
    const button=document.createElement('button');
    button.type='button';
    button.setAttribute('role','tab');
    button.textContent=name;
    button.onclick=()=>showPlan(index);
    switcher.append(button);
   });
   showPlan(0);
   const table=document.createElement('table');
   table.className='lyann-compare-desktop';
   table.innerHTML='<caption>Comparer les formules</caption><thead><tr><th scope="col">Fonctionnalité</th><th scope="col">Gratuit</th><th scope="col">Plus</th><th scope="col">Pro</th><th scope="col">Entreprise</th></tr></thead><tbody>'+rows.map(([label,...values])=>'<tr><th scope="row">'+esc(label)+'</th>'+values.map(v=>'<td>'+esc(cellText(label,v))+'</td>').join('')+'<td>Bientôt</td></tr>').join('')+'</tbody>';
   body.append(switcher,mobile,table);
   $('plansComparison').replaceChildren(summary||Object.assign(document.createElement('summary'),{textContent:'Comparer les formules'}),body);
  }
  const join=$('lyannJoinFree');
  if(join)join.onclick=()=>document.querySelector('.open-signup-trigger')?.click();
  const grid=document.querySelector('.lyann-offer-grid');
  function pickOffer(code,fromUser){
   if(!grid)return;
   document.querySelectorAll('[data-offer]').forEach((card)=>{
    const on=card.dataset.offer===code;
    card.classList.toggle('is-picked',on);
    card.setAttribute('aria-pressed',on?'true':'false');
   });
   const note=$('lyannOfferChoice');
   if(note){
    note.textContent=code==='PRO'
     ?'Pro : votre activité peut être examinée par LYANN. L’achat s’ouvrira dans l’application, au prix du magasin.'
     :code==='PLUS'
      ?'Plus : missions illimitées, à votre rythme. L’achat s’ouvrira dans l’application, au prix du magasin.'
      :code==='ENTERPRISE'
       ?'Entreprise n’est pas en vente. Écrivez-nous si vous représentez une organisation.'
       :'Gratuit reste avec vous. Plus et Pro s’ouvrent quand vous en avez besoin.';
   }
   if(fromUser&&code==='ENTERPRISE')contact('enterprise');
  }
  if(grid){
   grid.querySelectorAll('[data-offer]').forEach((card)=>{
    card.tabIndex=0;
    card.addEventListener('keydown',(e)=>{
     if(e.key==='Enter'||e.key===' '){e.preventDefault();pickOffer(card.dataset.offer,true);}
    });
   });
   grid.addEventListener('click',(e)=>{
    if(e.target.closest('a, [data-business-contact], [data-store-buy] button, #lyannJoinFree'))return;
    const choose=e.target.closest('[data-offer-choose]');
    const card=e.target.closest('[data-offer]');
    if(choose){e.stopPropagation();pickOffer(choose.dataset.offerChoose,true);return;}
    if(card)pickOffer(card.dataset.offer,true);
   });
   pickOffer(document.querySelector('[data-offer].is-picked')?.dataset.offer||'PLUS',false);
  }
  if($('lyannPlanState')){
   (async()=>{
    const client=window.apiClient||window.LYANN_API_CLIENT;
    let session=null;
    try{session=await client?.getSession?.();}catch(_){}
    const token=session?.data?.session?.access_token;
    if(!token){
     $('lyannPlanState').textContent='Connectez-vous pour afficher votre formule. Les achats dans l’application ne sont pas encore ouverts.';
     return;
    }
    if(join)join.hidden=true;
    try{
     const data=await request('/v1/business/me');
     const name=data?.plan?.name;
     if(!name)throw Error('missing');
     $('lyannPlanState').textContent='Votre formule : '+name+'.'+(data.purchasesEnabled===false?' Les achats dans l’application ne sont pas encore ouverts.':'');
     document.querySelector('[data-offer="'+data.plan.code+'"]')?.classList.add('is-current');
     const head=document.querySelector('[data-offer="'+data.plan.code+'"] .lyann-offer-head');
     if(head&&!head.querySelector('.lyann-current')){
      const badge=document.createElement('span');
      badge.className='lyann-current';
      badge.textContent='Votre formule';
      head.append(badge);
     }
     pickOffer(data.plan.code,false);
    }catch(_){
     $('lyannPlanState').textContent='Votre formule n’a pas pu être vérifiée. Les achats dans l’application ne sont pas encore ouverts.';
    }
   })();
  }
  document.addEventListener('click',e=>{
   const contactButton=e.target.closest('[data-business-contact]');
   if(contactButton){e.preventDefault();contact(contactButton.dataset.businessContact);}
   const download=e.target.closest('[data-document]');
   if(download)action(download,async()=>{
    const blob=await request('/v1/business/documents/'+download.dataset.owner+'/'+download.dataset.document,null,true);
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='justificatif.'+(blob.type==='application/pdf'?'pdf':blob.type==='image/png'?'png':'jpg');a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
   });
   const history=e.target.closest('[data-history]');
   if(history)action(history,async()=>{
    const data=await request('/v1/admin/business/dossiers/'+history.dataset.history+'/history');
    document.querySelector('[data-history-output="'+history.dataset.history+'"]').textContent=data.rows.map(x=>x.created_at+' · '+x.action+' · v'+x.version+' · '+x.actor_id).join('\n');
   });
  });
  if($('proIdentity')){
   loadMe().catch(e=>{notice(e.message,true);applyPlanDisclosure({plan:{code:'FREE'}});});
   $('proIdentity').onsubmit=e=>{e.preventDefault();action(e.submitter,async()=>{
    await request('/v1/business/dossier',{...formData(e.target),version:current?.version});await loadMe();notice('Informations enregistrées.');
   });};
   $('proUpload').onsubmit=e=>{e.preventDefault();action(e.submitter,async()=>{
    const file=e.target.elements.file.files[0];if(!file||file.size>2*1024*1024)throw Error('Choisissez un PDF, JPEG ou PNG de 2 Mo maximum.');
    const base64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(Error('Lecture du fichier impossible.'));reader.readAsDataURL(file);});
    await request('/v1/business/documents',{...formData(e.target),file:undefined,name:file.name,base64,version:current.version});
    await loadMe();e.target.reset();notice('Justificatif reçu.');
   });};
   $('proSubmit').onclick=e=>action(e.target,async()=>{await request('/v1/business/dossier/submit',{version:current.version});await loadMe();notice('Votre dossier a été envoyé.');});
  }

  if($('placeForm')){
   let place=null,map=null,marker=null;
   const form=$('placeForm');
   function setPoint(lng,lat){
    form.elements.lat.value=lat;form.elements.lng.value=lng;
    $('placeLocation').textContent='Emplacement sélectionné sur la carte.';
    if(map){if(!marker){marker=new window.maplibregl.Marker({draggable:true}).setLngLat([lng,lat]).addTo(map);marker.on('dragend',()=>{const p=marker.getLngLat();setPoint(p.lng,p.lat);});}else marker.setLngLat([lng,lat]);}
   }
   $('loadPlace').onclick=e=>action(e.target,async()=>{
    const data=await request('/v1/business/place');place=data.place;
    form.hidden=false;$('placeStatus').textContent=place?({pending:'En cours d’examen',approved:'Publiée',rejected:'À corriger',suspended:'Suspendue'}[place.status]+' · '+place.review_message):'Nouvelle vitrine';
    for(const [key,value]of Object.entries(place?.content||{}))if(form.elements[key]&&key!=='photo_ids')form.elements[key].value=value??'';
    $('placePhotos').innerHTML=data.portfolio.map(p=>'<option value="'+esc(p.id)+'" '+(place?.content.photo_ids?.includes(p.id)?'selected':'')+'>'+esc(p.title||'Photo du portfolio')+'</option>').join('');
    if(window.maplibregl&&!map){
     map=new window.maplibregl.Map({container:'placeMap',style:'assets/maps/lyann-liberty.json',center:[-61.55,16.25],zoom:10});
     map.addControl(new window.maplibregl.NavigationControl());
     map.on('click',e=>setPoint(e.lngLat.lng,e.lngLat.lat));
     map.on('error',()=>{$('placeLocation').textContent='La carte ne se charge pas. Réessayez ou utilisez votre position actuelle.';});
    }
    if(place){setPoint(place.content.lng,place.content.lat);map?.jumpTo({center:[place.content.lng,place.content.lat],zoom:15});}
   });
   $('locatePlace').onclick=()=>{
    if(!navigator.geolocation){notice('Localisation indisponible.',true);return;}
    navigator.geolocation.getCurrentPosition(p=>{setPoint(p.coords.longitude,p.coords.latitude);map?.jumpTo({center:[p.coords.longitude,p.coords.latitude],zoom:16});},()=>notice('Localisation refusée ou indisponible. Choisissez le lieu sur la carte.',true),{timeout:10000});
   };
   form.onsubmit=e=>{e.preventDefault();action(e.submitter,async()=>{
    const content=formData(form);content.photo_ids=Array.from($('placePhotos').selectedOptions).map(o=>o.value);content.version=place?.version;
    const data=await request('/v1/business/place',content);place=data.place;$('placeStatus').textContent='En cours d’examen';notice('Votre vitrine a été envoyée à LYANN.');
   });};
   $('activityMonth').value=new Date().toISOString().slice(0,7);
   $('loadActivity').onclick=e=>action(e.target,async()=>{
    const data=await request('/v1/business/activity?month='+encodeURIComponent($('activityMonth').value));
    $('invoiceMission').innerHTML='<option value="">Choisir une mission</option>'+data.missions.map(m=>'<option value="'+esc(m.id)+'">'+esc(m.title)+'</option>').join('');
    $('activityRows').innerHTML='<h3>Missions du mois</h3>'+data.missions.map(m=>'<p>'+esc(m.title)+' · '+esc(m.status)+' · '+esc(m.total_amount)+' €</p>').join('')+'<h3>Opérations de paiement du mois</h3>'+data.payments.map(p=>'<p>'+esc(p.payment_status)+' · Montant de la prestation : '+esc((p.service_amount_cents||0)/100)+' € · Net prévu : '+esc((p.provider_net_cents||0)/100)+' € · Transfert : '+esc(p.transfer_status)+'</p>').join('');
    if(!data.missions.length&&!data.payments.length)$('activityRows').textContent='Aucune activité enregistrée pour ce mois.';
   });
   $('exportActivity').onclick=e=>action(e.target,async()=>{
    const blob=await request('/v1/business/activity?format=csv&month='+encodeURIComponent($('activityMonth').value),null,true);
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='activite-'+$('activityMonth').value+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
   });
  }


  if($('businessRights')){
   const loadRights=async()=>{
    const r=await request('/v1/business/rights');
    const count=(key)=>esc(r.usage[key])+' / '+(r.limits[key]===null?'illimité':esc(r.limits[key]));
    const over=!r.enforced&&['missions','photos','categories'].some((key)=>r.limits[key]!==null&&Number(r.usage[key])>Number(r.limits[key]));
    $('businessRights').innerHTML='<p>'+esc(r.enforced?'Limites de test actives.':'Plafonds prévus, pas encore appliqués.')+(over?' Un compteur dépasse déjà le plafond.':'')+'</p><ul><li>Missions : '+count('missions')+'</li><li>Photos : '+count('photos')+'</li><li>Catégories : '+count('categories')+'</li></ul><p>Renouvellement missions : '+esc(new Date(r.resets_at).toLocaleDateString('fr-FR',{timeZone:'UTC'}))+' à 00 h UTC.</p>';
   };
   $('refreshRights').onclick=e=>action(e.target,loadRights);
   loadRights().catch(e=>{$('businessRights').textContent=e.message;});
  }
  if($('testQuota'))$('testQuota').onsubmit=e=>{e.preventDefault();action(e.submitter,async()=>{
   const b=formData(e.target);b.enabled=b.enabled==='true';notice((await request('/v1/admin/business/quota-test',b)).message);
  });};

  if($('invoiceForm')){
   let invoiceKey=crypto.randomUUID();
   const form=$('invoiceForm');
   form.elements.kind.onchange=()=>{$('invoiceFields').hidden=form.elements.kind.value==='credit';};
   const loadInvoices=async()=>{
    const data=await request('/v1/business/invoices');
    $('invoiceRows').innerHTML=data.rows.map(row=>'<p>'+esc(row.number)+' · '+esc(row.kind)+' · '+esc((row.total_cents/100).toFixed(2))+' € <button data-invoice-pdf="'+esc(row.id)+'">Télécharger le PDF</button></p>').join('')||'<p>Aucun document.</p>';
    $('invoiceOriginal').innerHTML='<option value="">Choisir la facture d’origine</option>'+data.rows.filter(row=>row.kind!=='credit').map(row=>'<option value="'+esc(row.id)+'">'+esc(row.number)+'</option>').join('');
   };
   $('loadInvoices').onclick=e=>action(e.target,loadInvoices);
   form.onsubmit=e=>{e.preventDefault();action(e.submitter,async()=>{
    const b=formData(form);b.idempotency_key=invoiceKey;b.confirmIssuer=form.elements.confirmIssuer.checked;
    if(b.kind!=='credit'){
     const amount=String(b.amount).replace(',','.');
     if(!/^\d{1,7}(\.\d{1,2})?$/.test(amount))throw Error('Indiquez un montant avec deux décimales maximum.');
     b.amount_cents=Math.round(Number(amount)*100);
    }
    const result=await request('/v1/business/invoices',b);invoiceKey=crypto.randomUUID();await loadInvoices();notice('Document de test émis : '+result.invoice.number);
   });};
   document.addEventListener('click',e=>{
    const button=e.target.closest('[data-invoice-pdf]');if(!button)return;
    action(button,async()=>{
     const blob=await request('/v1/business/invoices/'+button.dataset.invoicePdf+'/pdf',null,true),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='document-test.pdf';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
    });
   });
  }
  if($('adminBusinessRows')){
   $('testMembership').onsubmit=e=>{e.preventDefault();action(e.submitter,async()=>{const data=await request('/v1/admin/business/test-membership',formData(e.target));notice(data.message);});};
   $('loadDossiers').onclick=e=>action(e.target,()=>renderAdmin('dossiers'));
   $('loadPlaces').onclick=e=>action(e.target,()=>renderAdmin('places'));
   $('loadContacts').onclick=e=>action(e.target,()=>renderAdmin('contacts'));
   document.addEventListener('submit',e=>{
    const form=e.target;
    if(form.matches('[data-place-review]')){e.preventDefault();action(e.submitter,async()=>{await request('/v1/admin/business/places/'+form.dataset.placeReview+'/review',{...formData(form),version:Number(form.dataset.version)});await renderAdmin('places');notice('Décision enregistrée.');});}
    if(form.matches('[data-review]')){e.preventDefault();action(e.submitter,async()=>{
     await request('/v1/admin/business/dossiers/'+form.dataset.review+'/review',{...formData(form),version:Number(form.dataset.version),confirmChecked:form.elements.confirmChecked.checked});
     await renderAdmin('dossiers');notice('Décision enregistrée.');
    });}
    if(form.matches('[data-contact-id]')){e.preventDefault();action(e.submitter,async()=>{
     await request('/v1/admin/business/contacts/'+form.dataset.contactId,formData(form));notice('Traitement enregistré.');
    });}
   });
  }
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
