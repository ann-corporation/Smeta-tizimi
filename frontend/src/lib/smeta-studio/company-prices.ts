/** Company estimate observations matched ONLY by resource name, characteristics and unit.
 * Codes are deliberately absent from both queries and candidate identity (owner 2026-10-10).
 * Observations are secondary offers; they never displace a material catalogue price.
 */
import { sbOqi } from '../../api/supabase';
import type { KatalogQatori } from '../narx-katalog/types';
import { characteristics, matchResource, normName, type MatchCatalog, type MatchResult } from './resource-match';

export type KuzatilganNarx = { id: number; nom: string; birlik: string | null; narx: number;
  obyektId: number; manbaId: number | null; documentId?: number | null; obyekt: string; smeta: string; sana: string | null };
type Raw = { id: number; nom: string; birlik: string | null; narx: number | string; obyekt_id: number; manba_id: number | null; yangilandi: string | null; source_document_id?: number | null; source_document?: { original_filename: string | null; kompaniya_id: number } | null };

/** Query conservative literal name prefixes, never resource codes. Completeness/errors are explicit. */
export async function kompaniyaKuzatuvlari(kompaniyaId: number, nomlar: string[]): Promise<KuzatilganNarx[]> {
  const roots = [...new Set(nomlar.flatMap(n => [characteristics(n).words[0], n.normalize('NFC').toUpperCase().match(/[А-ЯA-ZЁЎҚҲҒ]{3,}/u)?.[0]?.slice(0, 6)]).filter((w): w is string => !!w && /^[А-ЯA-ZЁЎҚҲҒ]{3,6}$/.test(w)))];
  const raw = new Map<number, Raw>();
  const fetchRoots = async (part: string[]): Promise<void> => {
    const r = await sbOqi<Raw>({ jadval:'t2_qator', ustunlar:'id,nom,birlik,narx,obyekt_id,manba_id,yangilandi,source_document_id,source_document:t2_document_registry!source_document_id(original_filename,kompaniya_id)',
      filtr:`kompaniya_id=eq.${kompaniyaId}&source_document.kompaniya_id=eq.${kompaniyaId}&tur=in.(rs,mat,ob)&narx=gt.0&or=(${part.map(w=>'nom.ilike.*'+w+'*').join(',')})`,
      tartib:'id.asc', limit:20000 });
    if (!r.ok || !Array.isArray(r.qatorlar)) throw new Error('COMPANY_PRICES_UNAVAILABLE');
    if (r.toliq === false) {
      if (part.length === 1) throw new Error('COMPANY_PRICES_INCOMPLETE');
      // Split broad batches instead of accepting an incomplete MAX/latest observation pool.
      for (const root of part) await fetchRoots([root]);
      return;
    }
    for (const x of r.qatorlar) if (typeof x.nom==='string' && Number.isFinite(Number(x.narx)) && Number(x.narx)>0) raw.set(x.id,x);
  };
  for (let i=0; i<roots.length; i+=8) await fetchRoots(roots.slice(i,i+8));
  if (!raw.size) return [];
  const objects=[...new Set([...raw.values()].map(r=>r.obyekt_id))];
  const sources=[...new Set([...raw.values()].map(r=>r.manba_id).filter((id):id is number=>id!=null))];
  const objectNames=new Map<number,string>(), sourceNames=new Map<number,string>();
  for (let i=0;i<objects.length;i+=120) {
    const r=await sbOqi<{id:number;nom:string}>({jadval:'t2_obyekt',ustunlar:'id,nom',filtr:`kompaniya_id=eq.${kompaniyaId}&id=in.(${objects.slice(i,i+120).join(',')})`,limit:120});
    if (!r.ok || !Array.isArray(r.qatorlar) || r.toliq===false) throw new Error('COMPANY_PRICE_SOURCE_UNAVAILABLE');
    for (const x of r.qatorlar) objectNames.set(x.id,x.nom);
  }
  for (let i=0;i<sources.length;i+=120) {
    const r=await sbOqi<{id:number;fayl_nom:string|null;varaq:string|null}>({jadval:'t2_manba',ustunlar:'id,fayl_nom,varaq',filtr:`kompaniya_id=eq.${kompaniyaId}&id=in.(${sources.slice(i,i+120).join(',')})`,limit:120});
    if (!r.ok || !Array.isArray(r.qatorlar) || r.toliq===false) throw new Error('COMPANY_PRICE_SOURCE_UNAVAILABLE');
    for (const x of r.qatorlar) sourceNames.set(x.id,[x.fayl_nom,x.varaq].filter(Boolean).join(' / ') || `Manba #${x.id}`);
  }
  return [...raw.values()].map(r=>({id:r.id,nom:r.nom,birlik:r.birlik,narx:Number(r.narx),obyektId:r.obyekt_id,manbaId:r.manba_id,documentId:r.source_document_id ?? null,
    obyekt:objectNames.get(r.obyekt_id) ?? `Obyekt #${r.obyekt_id}`,
    smeta:r.source_document_id!=null ? (r.source_document?.kompaniya_id===kompaniyaId && r.source_document.original_filename ? r.source_document.original_filename : `Hujjat #${r.source_document_id}`) : r.manba_id==null?'Manba ko‘rsatilmagan':sourceNames.get(r.manba_id) ?? `Manba #${r.manba_id}`,sana:r.yangilandi}));
}

type PreparedCompanyPrices = { view: MatchCatalog; matches: Map<string, MatchResult> };
// An observation array is one immutable lookup revision; callers replace it when data changes.
// Keeping the same view also lets resource-match reuse its characteristic index across resources.
const preparedPrices = new WeakMap<readonly KuzatilganNarx[], Map<boolean, PreparedCompanyPrices>>();

function prepareCompanyPrices(rows: readonly KuzatilganNarx[], machine: boolean): PreparedCompanyPrices {
  let modes = preparedPrices.get(rows);
  if (!modes) { modes = new Map(); preparedPrices.set(rows, modes); }
  const cached = modes.get(machine);
  if (cached) return cached;
  // Same product's repeated imported rows do not swamp the ranking. Keep provenance of the chosen
  // observation. Machine MAX is the standing offer rule; other observations use latest import time.
  const products=new Map<string,KuzatilganNarx>();
  for (const r of rows) {
    const k=normName(r.nom)+'\u0001'+normName(r.birlik);
    const prev=products.get(k);
    if (!prev || (machine?r.narx>prev.narx:(r.sana??'')>(prev.sana??''))) products.set(k,r);
  }
  const p=[...products.values()];
  const row=(i:number):KatalogQatori=>({id:p[i].id,manba_id:p[i].manbaId??0,kod:null,nom:p[i].nom,birlik:p[i].birlik,narx:p[i].narx,
    hudud:null,ishlab_chiqaruvchi:null,nds_holati:'nds_siz',nds_izoh:null,yil:null,kvartal:null,narx_varianti:null,guruh:null,hudud_kalit:null,
    manba_nom:`${p[i].obyekt} · ${p[i].smeta}${p[i].sana?' · import '+p[i].sana.slice(0,10):''}`,manba_tur:'kompaniya-smeta'});
  const c:MatchCatalog={size:p.length,name:i=>p[i].nom,unit:i=>p[i].birlik,region:()=>null,price:i=>p[i].narx,row};
  const prepared = { view: c, matches: new Map<string, MatchResult>() };
  modes.set(machine, prepared);
  return prepared;
}

export function kompaniyaMoslik(rows: readonly KuzatilganNarx[], name:string|null, unit:string|null, machine=false):MatchResult {
  const prepared = prepareCompanyPrices(rows, machine);
  // Exact input text matters: conversion evidence must retain the caller's target-unit spelling.
  const key = JSON.stringify([name, unit]);
  const cached = prepared.matches.get(key);
  if (cached) return cached;
  const result = matchResource(prepared.view, name, unit, null, 25);
  prepared.matches.set(key, result);
  return result;
}
