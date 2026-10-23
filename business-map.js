'use strict';
(function(){
const layers=new WeakMap();let seq=0;
window.LYANN_BUSINESS_MAP={async refresh(map,bounds,current){
 const generation=++seq;
 let layer=layers.get(map);if(!layer){layer=window.L.layerGroup().addTo(map);layers.set(map,layer);}
 layer.clearLayers();
 try{
  const origin=typeof getLyannBackendOrigin==='function'?getLyannBackendOrigin():'';
  if(window.Capacitor?.isNativePlatform?.()&&!origin)return;
  const response=await fetch(origin+'/v1/business/places?'+new URLSearchParams(bounds));
  if(!response.ok)return;
  const data=await response.json();if(generation!==seq||!current())return;
  for(const place of data.places||[]){
   const card=document.createElement('div');card.className='bokantaj-preview';
   const title=document.createElement('strong');title.textContent=place.name+' · Établissement vérifié';
   const address=document.createElement('p');address.textContent=place.address;
   const text=document.createElement('p');text.textContent=place.description;
   const hours=document.createElement('p');hours.textContent='Horaires : '+place.hours;
   card.append(title,address,text,hours);
   for(const value of [place.closures,place.promotion])if(value){const p=document.createElement('p');p.textContent=value;card.append(p);}
   if(place.rating!=null){const p=document.createElement('p');p.textContent=place.rating.toFixed(1)+'/5 · '+place.review_count+' avis liés à des missions';card.append(p);}
   if(place.phone){const p=document.createElement('p');p.textContent='Contact : '+place.phone;card.append(p);}
   for(const src of place.photos||[]){const image=document.createElement('img');image.src=origin+src;image.alt=place.name;image.loading='lazy';image.style.maxWidth='100%';card.append(image);}
   const icon=window.L.divIcon({className:'business-place-marker',html:'<span aria-hidden="true">▣</span>',iconSize:[40,40],iconAnchor:[20,40]});
   window.L.marker([place.lat,place.lng],{icon,title:place.name+' — établissement',keyboard:true}).bindPopup(card,{maxWidth:300}).addTo(layer);
  }
 }catch(_){if(generation===seq)layer.clearLayers();}
}};
})();
