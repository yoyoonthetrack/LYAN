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
  $('proEligibility').textContent=allowed?'Votre formule Pro vous permet de faire vérifier votre activité.':'Le dépôt des justificatifs est réservé aux abonnés Pro. Vos documents existants restent consultables.';
  $('dossierStatus').textContent=current?labels[current.status]:'Aucun dossier envoyé';
  $('dossierMessage').textContent=current?.message||'';
  const editable=allowed&&(!current||['draft','needs_info','rejected'].includes(current.status));
  for(const control of $('proIdentity').elements)control.disabled=!editable;
  if(current)for(const [key,value]of Object.entries(current.identity))if($('proIdentity').elements[key])$('proIdentity').elements[key].value=value;
  $('proUpload').hidden=!editable||!current;
  $('proSubmit').hidden=!editable||!current;
  $('proDocuments').innerHTML=(current?.documents||[]).map(d=>'<li><strong>'+esc(d.name)+'</strong> — '+esc(d.kind)+(d.expires_at?' · valable jusqu’au '+esc(d.expires_at):'')+' <button type="button" data-document="'+esc(d.id)+'" data-owner="'+esc(current.user_id)+'">Télécharger</button></li>').join('');
 }
 async function loadMe(){renderDossier(await request('/v1/business/me'));}
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
  dialog(plan.name,'<p class="business-price">'+(plan.monthlyCents?(plan.monthlyCents/100).toLocaleString('fr-FR',{minimumFractionDigits:2})+' € / mois':'Gratuit')+'</p><p>'+ (code==='FREE'?'Échangez avec votre quartier et profitez du paiement par étape.':'Cette formule est en préparation. Aucun abonnement payant ne peut encore être acheté.')+'</p><a class="business-link" href="'+(code==='FREE'?'index.html#signup':'professional.html')+'">'+(code==='FREE'?'Rejoindre LYANN':'Voir mon espace professionnel')+'</a>');
 }
 window.LYANN_BUSINESS={openPlan,contact,request};
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
   $('plansComparison').innerHTML='<table><caption>Fonctionnalités prévues par formule</caption><thead><tr><th scope="col">Fonctionnalité</th><th scope="col">Gratuit</th><th scope="col">Plus</th><th scope="col">Pro</th><th scope="col">Entreprise</th></tr></thead><tbody>'+window.LYANN_PLANS.FEATURES.map(([label,...values])=>'<tr><th scope="row">'+esc(label)+'</th>'+values.map(v=>'<td>'+(v===true?'Inclus':v===false?'—':esc(v))+'</td>').join('')+'<td class="business-muted">Bientôt</td></tr>').join('')+'</tbody></table>';
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
   loadMe().catch(e=>notice(e.message,true));
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
    $('businessRights').innerHTML='<p>'+esc(r.enforced?'Limites appliquées à ce compte de test.':'Limites préparées, pas encore appliquées à ce compte.')+'</p><ul><li>Missions comme prestataire ce mois-ci : '+count('missions')+'</li><li>Photos du portfolio : '+count('photos')+'</li><li>Catégories actives : '+count('categories')+'</li></ul><p>Demandes et paiement par étape : accessibles dans toutes les formules.</p><p>Le compteur des missions est renouvelé le '+esc(new Date(r.resets_at).toLocaleDateString('fr-FR',{timeZone:'UTC'}))+' à 00 h UTC. Les contenus existants sont conservés après une baisse de formule.</p><p>Achats et vidéos du portfolio : pas encore activés.</p>';
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
