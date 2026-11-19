/**
 * Hujjatlar paketi - sayt mijozi (egasi 2026-11-19): nomzodlar serverdan (`/api/hujjat-maydoni?amal=paket_nomzod`: Disk + akt reestri),
 * mavjud versiya Diskdan (BEPUL, `/api/hujjat-maydoni-ol`), yo'qlari - yagona dvigatel `/api/hujjat-yarat` (token yechiladi, Diskka yoziladi).
 * Yangi hujjat mantig'i yo'q; hammasi mavjud endpointlar ustida.
 */
import { vaqtliOqish } from './vaqtli-fetch';
import { hujjatYarat, type HujjatTur } from './hujjat-yarat';
import { filtrServerga, type PaketFiltr } from '../lib/hujjat-paket/nomzod';
import type { RoyxatQator } from '../lib/hujjat-paket/royxat';
import type { Nomzod } from '../lib/hujjat-paket/nomzod';
import type { Olingan, Yetkazuvchi } from '../lib/hujjat-paket/yigish';

export type NomzodNatija = { ok: true; nomzodlar: Nomzod[]; jami: number; kesilgan: boolean } | { ok: false; xabar: string };

export async function paketNomzodOl(kompaniyaId: number, filtr: PaketFiltr): Promise<NomzodNatija> {
  try {
    const q = new URLSearchParams({ amal: 'paket_nomzod', kompaniya_id: String(kompaniyaId), filtr: JSON.stringify(filtrServerga(filtr)) });
    const r = await vaqtliOqish(`/api/hujjat-maydoni?${q.toString()}`);
    const j = await r.json().catch(() => null) as { ok?: boolean; nomzodlar?: Nomzod[]; jami?: number; kesilgan?: boolean; code?: string; xato?: string } | null;
    if (r.ok && j?.ok && Array.isArray(j.nomzodlar)) return { ok: true, nomzodlar: j.nomzodlar, jami: j.jami ?? j.nomzodlar.length, kesilgan: j.kesilgan === true };
    return { ok: false, xabar: j?.xato || j?.code || 'Hujjatlar ro\'yxati o\'qilmadi' };
  } catch (e) { return { ok: false, xabar: e instanceof Error ? e.message : 'Tarmoq xatosi' }; }
}

const fayloNomi = (h: string | null, zaxira: string): string => {
  const m = /filename\*=UTF-8''([^;]+)/i.exec(h ?? '');
  if (m) { try { return decodeURIComponent(m[1]); } catch { /* zaxira */ } }
  return zaxira;
};

/** Diskdagi joriy versiya (BEPUL). */
export async function diskdanOl(n: Pick<Nomzod, 'fayl_id' | 'sarlavha'>): Promise<Olingan> {
  if (n.fayl_id == null) throw new Error('Diskda fayl yo\'q');
  const r = await vaqtliOqish(`/api/hujjat-maydoni-ol?id=${n.fayl_id}`, {}, 120_000);
  if (!r.ok) throw new Error(`Diskdan o'qilmadi (HTTP ${r.status})`);
  return { bytes: new Uint8Array(await r.arrayBuffer()), faylNomi: fayloNomi(r.headers.get('Content-Disposition'), `${n.sarlavha}.xlsx`) };
}

/** `/api/hujjat-yarat` parametrlari (nomzod -> tur + parametrlar). null - bu turni yasab bo'lmaydi. */
export function yasashSorovi(n: Nomzod): { tur: HujjatTur; parametrlar: Record<string, number> } | null {
  switch (n.tur) {
    case 'f2': return n.akt_id != null ? { tur: 'f2', parametrlar: { akt_id: n.akt_id } } : null;
    case 'forma3': return n.forma3_id != null && n.shartnoma_id != null ? { tur: 'forma3', parametrlar: { shartnoma_id: n.shartnoma_id, f3_id: n.forma3_id } } : null;
    case 'nakopitelniy': case 'm29': return n.oy ? { tur: n.tur, parametrlar: { oy_son: Number(n.oy.replace('-', '')) } } : null;
    case 'slichitelniy': case 'ostatka': return { tur: n.tur, parametrlar: {} };
    default: return null;
  }
}

export function saytYetkazuvchi(kompaniyaId: number): Yetkazuvchi {
  return {
    diskdan: diskdanOl,
    async yasa(n) {
      const s = yasashSorovi(n);
      if (!s) throw new Error('Bu hujjat turini yasab bo\'lmaydi');
      if (n.obyekt_id == null) throw new Error('Obyekt aniqlanmadi (Diskda ham yo\'q)');
      // F-2: Diskdagi yangi versiya bo'lsa server shuni beradi (zudlik bilan); token yuklab olishda, mazmun kaliti bo'yicha bir marta.
      const r = await hujjatYarat({ kompaniyaId, obyektId: n.obyekt_id, tur: s.tur, format: 'xlsx', parametrlar: s.tur === 'f2' ? { ...s.parametrlar, disk_afzal: 1 } : s.parametrlar });
      if (!r.ok) throw new Error(r.xabar);
      return { bytes: r.bytes, faylNomi: r.faylNomi };
    },
  };
}

/* ------------------------------------------------------------------ ro'yxat (server filtri + sahifalash), saqlangan filtrlar */

export type RoyxatNatija = { ok: true; nomzodlar: RoyxatQator[]; jami: number; kesilgan: boolean; barchaKalitlar: string[]; offset: number; variantlar?: Variantlar } | { ok: false; xabar: string };
export const SAHIFA_HAJMI = 50;
export type Variantlar = { shartnomalar: Array<{ id: number; raqam: string | null }>; obyektlar: Array<{ id: number; nom: string | null; shartnoma_id: number | null }> };

export async function paketRoyxatOl(kompaniyaId: number, filtr: PaketFiltr, offset = 0, sahifaLimit = SAHIFA_HAJMI, variantlar = false): Promise<RoyxatNatija> {
  try {
    const q = new URLSearchParams({ amal: 'paket_royxat', kompaniya_id: String(kompaniyaId), filtr: JSON.stringify({ ...filtrServerga(filtr), offset, sahifa_limit: sahifaLimit, ...(variantlar ? { variantlar: true } : {}) }) });
    const r = await vaqtliOqish(`/api/hujjat-maydoni?${q.toString()}`);
    const j = await r.json().catch(() => null) as { ok?: boolean; nomzodlar?: RoyxatQator[]; jami?: number; kesilgan?: boolean; barcha_kalitlar?: string[]; offset?: number; variantlar?: Variantlar; code?: string; xato?: string } | null;
    if (r.ok && j?.ok && Array.isArray(j.nomzodlar)) return { ok: true, nomzodlar: j.nomzodlar, jami: j.jami ?? j.nomzodlar.length, kesilgan: j.kesilgan === true, barchaKalitlar: j.barcha_kalitlar ?? j.nomzodlar.map((n) => n.kalit), offset: j.offset ?? offset, ...(j.variantlar ? { variantlar: j.variantlar } : {}) };
    return { ok: false, xabar: j?.xato || j?.code || 'Hujjatlar ro\'yxati o\'qilmadi' };
  } catch (e) { return { ok: false, xabar: e instanceof Error ? e.message : 'Tarmoq xatosi' }; }
}

/** Tanlangan kalitlarning to'liq nomzodlari (yuklab olish uchun): shu filtr bo'yicha sahifalab, faqat tanlanganlarni qoldiradi. */
export async function tanlanganNomzodlar(kompaniyaId: number, filtr: PaketFiltr, kalitlar: ReadonlySet<string>): Promise<RoyxatQator[]> {
  const chiqish: RoyxatQator[] = [];
  for (let offset = 0; chiqish.length < kalitlar.size && offset < 3000; offset += 500) {
    const r = await paketRoyxatOl(kompaniyaId, filtr, offset, 500);
    if (!r.ok) throw new Error(r.xabar);
    for (const n of r.nomzodlar) if (kalitlar.has(n.kalit)) chiqish.push(n);
    if (offset + 500 >= r.jami) break;
  }
  return chiqish;
}

export type SaqlanganFiltr = { id: number; nom: string; filtr: Record<string, unknown> };

async function maydonPost(body: Record<string, unknown>): Promise<{ ok: boolean; body: Record<string, unknown> | null }> {
  try {
    const r = await vaqtliOqish('/api/hujjat-maydoni', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => null) as Record<string, unknown> | null;
    return { ok: r.ok && j?.ok === true, body: j };
  } catch { return { ok: false, body: null }; }
}

export async function filtrlarOl(kompaniyaId: number): Promise<SaqlanganFiltr[]> {
  try {
    const r = await vaqtliOqish(`/api/hujjat-maydoni?amal=filtr_royxat&kompaniya_id=${kompaniyaId}`);
    const j = await r.json().catch(() => null) as { ok?: boolean; filtrlar?: SaqlanganFiltr[] } | null;
    return r.ok && j?.ok && Array.isArray(j.filtrlar) ? j.filtrlar : [];
  } catch { return []; }
}
export async function filtrSaqla(kompaniyaId: number, nom: string, filtr: PaketFiltr): Promise<boolean> {
  return (await maydonPost({ amal: 'filtr_saqla', kompaniya_id: kompaniyaId, nom, filtr: filtrServerga(filtr) })).ok;
}
export async function filtrOchir(kompaniyaId: number, id: number): Promise<boolean> {
  return (await maydonPost({ amal: 'filtr_ochir', kompaniya_id: kompaniyaId, id })).ok;
}

export type TayyorHolat = { faylId: number | null; versiya: number | null; yangilandi: string | null; yangilanmoqda: boolean; eskirgan: boolean };
/** F-2 sahifasi uchun: «Excel tayyor · v5 · 2 daqiqa oldin». */
export async function tayyorHolatOl(kompaniyaId: number, aktId: number): Promise<TayyorHolat | null> {
  try {
    const r = await vaqtliOqish(`/api/hujjat-maydoni?amal=tayyor&kompaniya_id=${kompaniyaId}&akt_id=${aktId}`);
    const j = await r.json().catch(() => null) as { ok?: boolean; fayl_id?: number | null; versiya?: number | null; yangilandi?: string | null; navbat_holat?: string | null; eskirgan?: boolean } | null;
    if (!r.ok || !j?.ok) return null;
    return { faylId: j.fayl_id ?? null, versiya: j.versiya ?? null, yangilandi: j.yangilandi ?? null, yangilanmoqda: j.navbat_holat === 'kutmoqda' || j.navbat_holat === 'ishlanmoqda', eskirgan: j.eskirgan === true };
  } catch { return null; }
}