import { qidiruvKaliti } from '../../i18n/lotin-kirill';
import type { PrixodQator } from './turlar';

export type MaterialTaklif = { nom: string; birliklar: string[]; yetkazuvchilar: string[]; manbaQatorlar: number[] };
const exact = (s: string) => s.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();

/** Actual source candidates only. Search aliases never rename or collapse source movements. */
export function materialTaklifQur(rows: readonly PrixodQator[]): MaterialTaklif[] {
  const map = new Map<string, MaterialTaklif>();
  for (const row of rows) {
    if (!row.nom.trim()) continue;
    const key = exact(row.nom); const item = map.get(key) ?? {nom:row.nom,birliklar:[],yetkazuvchilar:[],manbaQatorlar:[]};
    if (row.birlik && !item.birliklar.includes(row.birlik)) item.birliklar.push(row.birlik);
    if (row.yetkazuvchi && !item.yetkazuvchilar.includes(row.yetkazuvchi)) item.yetkazuvchilar.push(row.yetkazuvchi);
    item.manbaQatorlar.push(row.manbaQator); map.set(key,item);
  }
  return [...map.values()];
}

export function materialTaklifQidir(items: readonly MaterialTaklif[], query: string, limit = 8): MaterialTaklif[] {
  const key = qidiruvKaliti(query); const parts = key.split(/\s+/).filter(Boolean);
  const score = (item: MaterialTaklif) => { const n = qidiruvKaliti(item.nom); return n === key ? 3 : n.startsWith(key) ? 2 : 1; };
  return items.filter(item => parts.every(p => qidiruvKaliti(item.nom).includes(p)))
    .sort((a,b)=>score(b)-score(a) || b.manbaQatorlar.length-a.manbaQatorlar.length || a.nom.localeCompare(b.nom))
    .slice(0,limit);
}

export function materialMaydonTaklif(items: readonly MaterialTaklif[], nom: string, field: 'birliklar'|'yetkazuvchilar', query = '', limit = 8): string[] {
  const selected = items.filter(i=>exact(i.nom)===exact(nom));
  const candidates = selected.length ? selected : nom.trim() ? materialTaklifQidir(items, nom) : items;
  const values = [...new Set(candidates.flatMap(i=>i[field]))];
  const queryKey = qidiruvKaliti(query);
  // An already selected value must not hide the other real options for that material.
  const key = values.some(v=>qidiruvKaliti(v)===queryKey) ? '' : queryKey;
  return values.filter(x=>!key||qidiruvKaliti(x).includes(key)).slice(0,limit);
}
