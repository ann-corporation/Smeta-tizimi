/**
 * Mashina-soat narxlarining rasmiy ro'yxati (egasi bergan «Перечень усреднённых прогнозируемых цен маш.-часа машин и
 * механизмов (без НДС)» 01.01.2026, 710 pozitsiya). Norma resursi nomi ro'yxatdagidan boshqacha yoziladi ("БУЛЬДОЗЕРЫ ...
 * (КРОМЕ ВОДОХОЗЯЙСТВЕННОГО) 79 (108) КВТ" ↔ "Бульдозеры ... 79 (108) КВТ (Л.С)"), shuning uchun xarakteristika dvigateli
 * (resource-match: mashina quvvati/sig'imi tokenlari to'liq mos bo'lishi shart) bilan moslanadi; noaniqlarini AI tanlaydi.
 */
import type { KatalogQatori } from '../narx-katalog/types';
import type { PriceJustification } from './model';
import type { MatchCatalog } from './resource-match';

export type MashKatalog = { schema: string; manba: { nom: string; sana: string; fayl: string; sha256: string }; rows: Array<{ n: number; nom: string; narx: number; sahifa: number }> };

export function mashView(k: MashKatalog): MatchCatalog {
  const rows: KatalogQatori[] = k.rows.map(r => ({ id: r.n, manba_id: 0, kod: String(r.n), nom: r.nom, birlik: 'маш-ч', narx: r.narx, hudud: null, ishlab_chiqaruvchi: null,
    nds_holati: 'nds_siz', nds_izoh: null, yil: Number(k.manba.sana.slice(0, 4)), kvartal: null, narx_varianti: `стр. ${r.sahifa}`, guruh: null, hudud_kalit: null,
    manba_nom: `${k.manba.nom} на ${k.manba.sana.split('-').reverse().join('.')}`, manba_tur: 'mash_soat', manba_sana: k.manba.sana }));
  return { size: rows.length, name: i => rows[i].nom, unit: () => 'маш-ч', region: () => null, price: i => rows[i].narx, row: i => rows[i] };
}

/** «Обоснование» of a machine-hour price from the list: document, position number and page. */
export function mashAsosi(r: KatalogQatori, sabab: string | null): PriceJustification {
  return { docType: 'MACHINE_HOUR', document: `${r.manba_nom}, ${r.narx_varianti}, поз. № ${r.kod}, цена без НДС`.slice(0, 400), sourceName: r.nom, sourceUnit: 'маш-ч',
    sourcePrice: r.narx == null ? null : String(r.narx), conversion: null, reason: sabab };
}

let cached: Promise<MashKatalog> | null = null;
export function mashKatalogi(fetcher: (u: string) => Promise<Response> = u => fetch(u, { credentials: 'same-origin' })): Promise<MashKatalog> {
  if (!cached) cached = (async () => {
    const cur = await fetcher('/api/mash-katalog?f=current');
    if (!cur.ok) throw new Error('MASH_CATALOG_UNAVAILABLE');
    const { revision } = await cur.json() as { revision: string };
    if (!/^[a-f0-9]{16}$/.test(revision)) throw new Error('MASH_REVISION_INVALID');
    const r = await fetcher(`/api/mash-katalog?rev=${revision}`);
    if (!r.ok) throw new Error('MASH_CATALOG_UNAVAILABLE');
    const k = await r.json() as MashKatalog;
    if (k.schema !== 'mash-katalog-v1' || !Array.isArray(k.rows)) throw new Error('MASH_SCHEMA_INVALID');
    return k;
  })().catch(e => { cached = null; throw e; });
  return cached;
}
