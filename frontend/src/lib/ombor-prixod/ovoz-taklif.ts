import { qidiruvKaliti } from '../../i18n/lotin-kirill';
import type { MaterialTaklif } from './taklif';
import type { PrixodMaydonlar } from './qoralama';

const tokens = (v:string) => qidiruvKaliti(v.normalize('NFKC')).replace(/[^a-z0-9.,-]+/g,' ').trim();
const inText = (text:string, candidate:string) => (` ${text} `).includes(` ${tokens(candidate)} `);
const unitAliases:Record<string,string[]>={m3:['kub','kubometr','m3'],m2:['kvadrat','m2'],t:['tonna','tonn','t'],kg:['kilogramm','kilo','kg'],dona:['dona','sht'],qop:['qop']};
export type OvozTaklif = { maydonlar:Partial<PrixodMaydonlar>; operatsiya:'prixod'|'rasxod'|null; nomzodlar:string[]; noaniq:boolean };

/** Grounded, deliberately bounded suggestions. Speech is evidence for a draft, never a posting command. */
export function ovozdanKirimTaklif(text:string, catalog:readonly MaterialTaklif[]):OvozTaklif {
  const source=tokens(text);
  const receipt=/(^| )(keldi|kirim|prixod|prihod)( |$)/.test(source);
  const issue=/(^| )(berdim|chiqim|rasxod|rashod|vydal)( |$)/.test(source);
  const operatsiya=receipt===issue?null:receipt?'prixod':'rasxod';
  const candidates=catalog.filter(item=>inText(source,item.nom));
  const result:OvozTaklif={maydonlar:{},operatsiya,nomzodlar:candidates.map(x=>x.nom),noaniq:receipt&&issue||candidates.length!==1};
  if(candidates.length!==1)return result;
  const item=candidates[0];result.maydonlar.nom=item.nom;
  const numbers:Array<{birlik:string;miqdor:string}>=[];
  for(const unit of item.birliklar){
    const normal=tokens(unit);const aliases=new Set([normal,...(unitAliases[normal]??[])]);
    for(const alias of aliases){
      const escaped=alias.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      const re=new RegExp(`(?:^| )([0-9]+(?:[.,][0-9]+)?)\\s+${escaped}(?= |$)`,'g');
      for(const m of source.matchAll(re))if(Number(m[1].replace(',','.'))>0)numbers.push({birlik:unit,miqdor:m[1]});
    }
  }
  const unique=[...new Map(numbers.map(n=>[JSON.stringify(n),n])).values()];
  if(unique.length===1)Object.assign(result.maydonlar,unique[0]);else result.noaniq=true;
  const suppliers=item.yetkazuvchilar.filter(s=>inText(source,s));
  if(suppliers.length===1)result.maydonlar.yetkazuvchi=suppliers[0];
  if(suppliers.length>1)result.noaniq=true;
  const dates=[...text.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)];
  if(dates.length===1)result.maydonlar.sana=dates[0][0];
  return result;
}
