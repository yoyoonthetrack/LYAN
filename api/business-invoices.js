'use strict';
function invoiceSnapshot(input,seller,mission){
 const clean=(v,max)=>{if(typeof v!=='string'||!v.trim()||v.length>max)throw Error('Informations de facturation incomplètes.');return v.trim();};
 const total=Number(input.amount_cents),rate=Number(input.vat_rate);
 if(!Number.isSafeInteger(total)||total<=0||total>100000000||![0,2.1,5.5,8.5,10,20].includes(rate))throw Error('Montant ou taux de TVA invalide.');
 const due=clean(input.due_date,10),service=clean(input.service_date,10);
 for(const value of [due,service])if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)throw Error('Date invalide.');
 if(due<new Date().toISOString().slice(0,10))throw Error('Échéance passée.');
 const net=Math.round(total/(1+rate/100));
 const result={seller:{name:seller.legal_name,address:seller.address,siret:seller.siret,legal_details:clean(input.legal_details,1000)},
 customer:{name:clean(input.customer_name,160),address:clean(input.customer_address,400)},
 description:clean(input.description||mission.title,1500),service_date:service,due_date:due,
 total_cents:total,net_cents:net,vat_cents:total-net,vat_rate:rate,
 tax_notice:rate===0?clean(input.tax_notice,400):'',vat_number:rate>0?clean(input.vat_number,60):'',
 payment_terms:clean(input.payment_terms,1500),test_document:true};
 if(input.confirmIssuer!==true)throw Error('Confirmez les informations de votre entreprise et votre régime fiscal.');
 return result;
}
function renderInvoicePdf(invoice){
 const PDFDocument=require('pdfkit');
 return new Promise((resolve,reject)=>{
  const pdf=new PDFDocument({size:'A4',margin:48}),chunks=[];
  pdf.on('data',c=>chunks.push(c));pdf.on('error',reject);pdf.on('end',()=>resolve(Buffer.concat(chunks)));
  const s=invoice.snapshot,money=n=>(Number(n)/100).toFixed(2)+' EUR';
  pdf.fontSize(12).fillColor('#a33').text('STAGING — DOCUMENT DE TEST — SANS VALEUR COMPTABLE');
  pdf.moveDown().fillColor('#233c30').fontSize(22).text(invoice.kind==='credit'?'Avoir':invoice.kind==='deposit'?'Facture d’acompte':'Facture de solde');
  pdf.fontSize(11).text(invoice.number).text('Émis le '+invoice.created_at.slice(0,10));
  if(invoice.original_id)pdf.text('Avoir intégral de la facture '+(s.original_number||invoice.original_id));
  pdf.moveDown().fontSize(14).text('Prestataire').fontSize(11).text(s.seller.name).text(s.seller.address).text('SIRET : '+s.seller.siret).text(s.seller.legal_details);
  if(s.vat_number)pdf.text('N° TVA : '+s.vat_number);
  pdf.moveDown().fontSize(14).text('Client').fontSize(11).text(s.customer.name).text(s.customer.address);
  pdf.moveDown().text('Prestation : '+s.description).text('Date de prestation : '+s.service_date).text('Mission : '+invoice.mission_id);
  pdf.moveDown().text('Montant HT : '+money(s.net_cents)).text('TVA ('+s.vat_rate+' %) : '+money(s.vat_cents)).text('Montant TTC : '+money(s.total_cents));
  if(s.tax_notice)pdf.text(s.tax_notice);
  pdf.moveDown().text('Échéance : '+s.due_date).text(s.payment_terms);
  pdf.moveDown().text('Ce document n’exécute aucun paiement et ne prouve aucun encaissement.');
  pdf.end();
 });
}
module.exports={invoiceSnapshot,renderInvoicePdf};
