import { qidiruvKaliti } from '../../i18n/lotin-kirill';
import { prixodMiqdor,prixodSana } from '../ombor-prixod/kitob';
import type { KunlikTarix } from './servis';
export type KunlikMaydonlar={sana:string;nomi:string;birligi:string;miqdor:string;postavshik:string;qabulQiluvchi:string;qabulTuri:string;izoh:string;hujjat:string};
export function kunlikBugun(offset=0):string{const d=new Date();d.setDate(d.getDate()+offset);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
const key=(s:string)=>qidiruvKaliti(s.normalize('NFKC')).replace(/[^a-z0-9]+/g,' ').trim();
const aliases:Record<string,string[]>={m3:['kub','kubometr'],m2:['kvadrat'],t:['tonna','tonn'],kg:['kilo','kilogramm'],qop:['qop'],dona:['sht','dona']};
const uniq=(v:string[])=>[...new Set(v.filter(Boolean))];
export function kunlikMatnTaklif(text:string,history:readonly KunlikTarix[],amal:'prixod'|'rasxod',chosen?:string):{fields:Partial<KunlikMaydonlar>;nomlar:string[];mos:boolean}{
 const normal=key(text);const words=normal.split(' ');
 const receipt=/(^| )(keldi|kirim|prixod|prihod)( |$)/.test(normal),issue=/(^| )(berdim|chiqim|rasxod|rashod)( |$)/.test(normal);
 const mos=!(receipt&&issue)&&!(amal==='prixod'?issue:receipt);
 if(!mos)return{fields:{},nomlar:[],mos:false};
 const nomlar=uniq(history.map(r=>r.nomi)).filter(n=>{const core=key(n).split(' ').filter(w=>/[a-z]{3}/.test(w));return core.length>0&&core.some(w=>words.some(q=>q.length>=3&&(w.startsWith(q)||q===w)));});
 const nomi=chosen&&nomlar.includes(chosen)?chosen:nomlar.length===1?nomlar[0]:null;
 if(!nomi)return{fields:{},nomlar,mos};
 const rows=history.filter(r=>r.nomi===nomi);const fields:Partial<KunlikMaydonlar>={nomi};
 const quantities=new Map<string,{birligi:string;miqdor:string}>();
 for(const birligi of uniq(rows.map(r=>r.birligi))){for(const alias of uniq([key(birligi),...(aliases[key(birligi)]??[])])){
  const escaped=alias.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const rx=new RegExp(`(?:^|\\s)(\\d+(?:[.,]\\d+)?)\\s*${escaped}(?=\\s|$)`,'gi');
  for(const match of qidiruvKaliti(text.normalize('NFKC')).matchAll(rx)){const qty=prixodMiqdor(match[1]);if(qty!=null&&qty>0)quantities.set(JSON.stringify([birligi,qty]),{birligi,miqdor:String(qty)});}
 }}
 if(quantities.size===1)Object.assign(fields,[...quantities.values()][0]);
 const matches=(names:string[])=>uniq(names).filter(n=>{const escaped=key(n).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');return new RegExp(`(?:^| )${escaped}(?:dan|ga)?(?: |$)`).test(normal);});
 const providers=matches(rows.map(r=>r.postavshik??''));if(amal==='prixod'&&providers.length===1)fields.postavshik=providers[0];
 const recipients=matches(history.map(r=>r.qabul_qiluvchi??''));if(recipients.length===1)fields.qabulQiluvchi=recipients[0];
 const dates=[...text.matchAll(/\b(?:\d{4}-\d{2}-\d{2}|\d{2}\.\d{2}\.\d{4})\b/g)].map(m=>prixodSana(m[0])).filter(Boolean);
 if(dates.length===1)fields.sana=dates[0]!;
 // The user's own wording is retained as the reason; no invented business purpose.
 if(amal==='prixod'&&text.trim().length<=500)fields.izoh=text.trim();
 if(amal==='rasxod'){
  const purpose=/\buchun\s+(.+)/i.exec(text);if(purpose)fields.izoh=purpose[1].trim().slice(0,500);
  if(/\bbrigada/i.test(normal))fields.qabulTuri='brigada';else if(/\busta/i.test(normal))fields.qabulTuri='usta';else if(/\bprorab/i.test(normal))fields.qabulTuri='prarab';
 }
 return{fields,nomlar,mos};
}
