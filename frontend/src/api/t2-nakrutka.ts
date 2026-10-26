/**
 * t2-nakrutka.ts — NAKRUTKA (markup/overhead) cascade, native T2 port of
 * T1 GAS's apiNakrutkaOl/apiNakrutkaSaqla/apiObyektNakrutka/apiNakrutkaKoef
 * (Smeta tizimi/80_Shartnoma.js). See
 * supabase/migrations/20261014090000_t2_nakrutka_v1.sql for why resource
 * `kat` (category) drives this: transport/warehouse/contractor/insurance/
 * risk/VAT steps apply to different category sums, not uniformly.
 *
 * Reads /api/sb {soro:'nakrutka_koef_ol_v1'|'obyekt_nakrutka_v1'} (actor
 * always from the verified session, never client-supplied). Write goes
 * through /api/sb-yoz {amal:'nakrutka_koef_saqla'}, same idempotency law
 * as every other write RPC in this codebase (p_operation_id).
 */

import { yangiOperationId } from './supabase';

export const NAKRUTKA_KOEF_KODLAR = [
  'ЗТР_СОЦСТРАХ', 'ТРАНСПОРТ_МАТЕРИАЛ', 'СКЛАДСКИЕ_МАТЕРИАЛ', 'СКЛАДСКИЕ_МК',
  'ТРАНСПОРТ_КАБЕЛЬ', 'ПРОЧИЕ_ПОДРЯДЧИК', 'ТРАНСПОРТ_ОБОРУД', 'ЗАГОТ_СКЛАД_ОБОРУД',
  'СТРАХОВАНИЕ', 'РИСК', 'НДС',
] as const;
export type NakrutkaKoefKod = typeof NAKRUTKA_KOEF_KODLAR[number];

export const NAKRUTKA_KOEF_IZOH: Record<NakrutkaKoefKod, string> = {
  ЗТР_СОЦСТРАХ: 'Соцстрах ЗТР ичида (маълумот учун, ҳисобга кирмайди)',
  ТРАНСПОРТ_МАТЕРИАЛ: 'Транспорт харажатлари — материаллар %',
  СКЛАДСКИЕ_МАТЕРИАЛ: 'Склад харажатлари — материаллар %',
  СКЛАДСКИЕ_МК: 'Склад харажатлари — металлоконструкция (М/К) %',
  ТРАНСПОРТ_КАБЕЛЬ: 'Транспорт — кабель ва провод %',
  ПРОЧИЕ_ПОДРЯДЧИК: 'Пудратчининг бошқа харажатлари %',
  ТРАНСПОРТ_ОБОРУД: 'Транспорт харажатлари — ускуна %',
  ЗАГОТ_СКЛАД_ОБОРУД: 'Тайёрлов-склад харажатлари — ускуна %',
  СТРАХОВАНИЕ: 'Обектни суғурталаш %',
  РИСК: 'Риск коэффициенти % (одатда 0, қўлда белгиланади)',
  НДС: 'ҚҚС %',
};

export type NakrutkaKoeffitsientlar = Record<NakrutkaKoefKod, number>;
/** Amaldagi koeffitsientlar qaysi qatlamdan: smeta podvali (obyekt) → shartnoma → kompaniya → sukut. */
export type NakrutkaManba = 'smeta_podvali' | 'shartnoma' | 'kompaniya' | 'sukut';
export type NakrutkaKategoriyaJadval = Record<'ЧЕЛ' | 'МАШ' | 'МАТ' | 'ОБ' | 'М/К' | 'КАБ' | 'БЕЗСКЛАД', number>;
export type NakrutkaKaskad = {
  pryamye: number; chel: number; mash: number; mat: number; ob: number; kab: number;
  tr_mat: number; skl_mat: number; tr_kab: number;
  itogo1: number; prochie: number; itogo2: number;
  tr_ob: number; zag_ob: number; itogo3: number;
  strax: number; risk: number; itogo4: number; nds: number; vsego: number;
};

async function soroOqi<T>(body: Record<string, unknown>): Promise<{ ok: boolean; natija?: T; error?: string }> {
  const r = await fetch('/api/sb', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.json();
}

export async function t2NakrutkaKoefOl(kompaniyaId: number, shartnomaId?: number | null): Promise<
  { ok: boolean; shartnoma_id: number | null; koeffitsientlar: NakrutkaKoeffitsientlar; jadval: NakrutkaKategoriyaJadval; error?: string }
> {
  const r = await soroOqi<{ ok: boolean; shartnoma_id: number | null; koeffitsientlar: NakrutkaKoeffitsientlar; jadval: NakrutkaKategoriyaJadval }>(
    { soro: 'nakrutka_koef_ol_v1', kompaniya_id: kompaniyaId, shartnoma_id: shartnomaId ?? undefined });
  if (!r.ok || !r.natija || r.natija.ok !== true) {
    return { ok: false, shartnoma_id: null, koeffitsientlar: {} as NakrutkaKoeffitsientlar, jadval: {} as NakrutkaKategoriyaJadval, error: r.error || 'Koeffitsientlar o\'qilmadi' };
  }
  return r.natija;
}

export async function t2NakrutkaKoefSaqla(p: { kompaniyaId: number; shartnomaId?: number | null; koefKod: NakrutkaKoefKod; qiymat: number; operationId?: string }): Promise<{ ok: boolean; code?: string; error?: string }> {
  const res = await fetch('/api/sb-yoz', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amal: 'nakrutka_koef_saqla', kompaniya_id: p.kompaniyaId, shartnoma_id: p.shartnomaId ?? null,
      koef_kod: p.koefKod, qiymat: p.qiymat, operation_id: p.operationId || yangiOperationId(),
    }),
  });
  return await res.json();
}

export async function t2ObyektNakrutka(obyektId: number, shartnomaId?: number | null): Promise<{
  ok: boolean; code?: string; error?: string; obyekt_id?: number; shartnoma_id?: number | null;
  cats?: { chel: number; mash: number; mat: number; ob: number; mk: number; kab: number; bez: number };
  koeffitsientlar?: NakrutkaKoeffitsientlar; nakrutka?: NakrutkaKaskad; jadval?: NakrutkaKategoriyaJadval;
  /** Koeffitsient manbai (migratsiya 20261113420000): smeta podvali / shartnoma / kompaniya / sukut. Eski server — yo'q. */
  nk_manba?: NakrutkaManba; nakrutka_podval_id?: number | null;
}> {
  const r = await soroOqi<{
    ok: boolean; code?: string; obyekt_id: number; shartnoma_id: number | null;
    cats: { chel: number; mash: number; mat: number; ob: number; mk: number; kab: number; bez: number };
    koeffitsientlar: NakrutkaKoeffitsientlar; nakrutka: NakrutkaKaskad; jadval: NakrutkaKategoriyaJadval;
    nk_manba?: NakrutkaManba; nakrutka_podval_id?: number | null;
  }>({ soro: 'obyekt_nakrutka_v1', obyekt_id: obyektId, shartnoma_id: shartnomaId ?? undefined });
  if (!r.ok || !r.natija || r.natija.ok !== true) {
    return { ok: false, error: r.error || r.natija?.code || 'Nakrutka hisoblanmadi', code: r.natija?.code };
  }
  return r.natija;
}
