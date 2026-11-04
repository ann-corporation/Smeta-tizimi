/**
 * Yuk birjasi: masofa (km) hisoblash — SERVER tomonda, mijozda kalit YO'Q. Ochiq OSRM (kalitsiz) yoki env `ROUTING_URL` (o'z OSRM / ORS-mos);
 * xato bo'lsa to'g'ri chiziq × yo'l koeffitsiyenti ("taxminiy" belgisi bilan). Natija izolyat xotirasida keshlanadi (juft nuqta, ~11 m aniqlik, 24 soat).
 * Faqat O'zbekiston ichki yo'nalishlari (egasi qarori 2026-11-04): koordinata O'zbekiston ramkasidan tashqarida bo'lsa — rad.
 */
import { osrmAdapter, taxminiyMarshrut, togriNuqta, type MarshrutManba, type Nuqta } from '../../src/lib/transport/geo';

export type MarshrutJavob = { km: number; daqiqa: number; manba: MarshrutManba; kesh: boolean };
export const OSRM_SUKUT = 'https://router.project-osrm.org';
/** O'zbekiston chegaraviy ramkasi (taxminiy to'rtburchak; aniq chegara tekshiruvi emas). */
export const UZ_RAMKA = { latMin: 37.0, latMax: 45.7, lngMin: 55.9, lngMax: 73.2 } as const;
export const KESH_MUDDAT_MS = 24 * 3_600_000;
const KESH_CHEGARA = 500;

const kesh = new Map<string, { t: number; v: Omit<MarshrutJavob, 'kesh'> }>();
export function keshTozala() { kesh.clear(); }

export const uzichida = (p: Nuqta) => p.lat >= UZ_RAMKA.latMin && p.lat <= UZ_RAMKA.latMax && p.lng >= UZ_RAMKA.lngMin && p.lng <= UZ_RAMKA.lngMax;
export const keshKalit = (a: Nuqta, b: Nuqta) => [a.lat, a.lng, b.lat, b.lng].map((x) => x.toFixed(4)).join(',');

export type MarshrutXato = 'NUQTA_NOTOGRI' | 'UZ_TASHQARI';

export async function marshrutHisobla(
  a: Partial<Nuqta> | null | undefined, b: Partial<Nuqta> | null | undefined,
  o: { baza?: string; fetchFn?: typeof fetch; hozir?: number; vaqtMs?: number } = {},
): Promise<{ ok: true; natija: MarshrutJavob } | { ok: false; code: MarshrutXato }> {
  if (!togriNuqta(a) || !togriNuqta(b)) return { ok: false, code: 'NUQTA_NOTOGRI' };
  if (!uzichida(a) || !uzichida(b)) return { ok: false, code: 'UZ_TASHQARI' };
  const hozir = o.hozir ?? Date.now();
  const kalit = keshKalit(a, b);
  const bor = kesh.get(kalit);
  if (bor && hozir - bor.t < KESH_MUDDAT_MS) return { ok: true, natija: { ...bor.v, kesh: true } };
  let yol: Omit<MarshrutJavob, 'kesh'> | null = null;
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), o.vaqtMs ?? 6000);
    try {
      const r = await osrmAdapter(o.baza || OSRM_SUKUT, o.fetchFn ?? fetch)([a, b], ctrl.signal);
      if (r) yol = { km: r.km, daqiqa: r.daqiqa, manba: r.manba };
    } finally { clearTimeout(to); }
  } catch { /* taxminiyga o'tamiz */ }
  if (!yol) {
    const t = taxminiyMarshrut([a, b]);
    if (!t) return { ok: false, code: 'NUQTA_NOTOGRI' };
    yol = { km: t.km, daqiqa: t.daqiqa, manba: t.manba };
  }
  // Taxminiy natija keshlanmaydi: tarmoq tiklangach haqiqiy yo'l olinsin.
  if (yol.manba === 'yol') {
    if (kesh.size >= KESH_CHEGARA) kesh.delete(kesh.keys().next().value as string);
    kesh.set(kalit, { t: hozir, v: yol });
  }
  return { ok: true, natija: { ...yol, kesh: false } };
}