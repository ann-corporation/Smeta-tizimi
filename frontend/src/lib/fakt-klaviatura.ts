/**
 * Fakt jurnali klaviatura navigatsiyasi — sof mantiq (egasi 2026-11-07: «fakt kiritish to'liq klaviaturada»).
 * Pul/saqlash mantiqi YO'Q: faqat filtr, «qayerda qoldim» xotirasi va qidiruv mosligi.
 */
import type { JurnalQator } from './fakt-jurnal';

export type HolatFiltr = 'hammasi' | 'kiritilgan' | 'boshlanmagan' | 'chala';
/** Alt+1…4 tartibida. Nomlar t() bilan ko'rsatiladi. */
export const HOLAT_FILTRLAR: ReadonlyArray<{ kalit: HolatFiltr; nom: string; tugma: string }> = [
  { kalit: 'hammasi', nom: 'Hammasi', tugma: 'alt+1' },
  { kalit: 'kiritilgan', nom: 'Kiritilganlar', tugma: 'alt+2' },
  { kalit: 'boshlanmagan', nom: 'Boshlanmagan', tugma: 'alt+3' },
  { kalit: 'chala', nom: 'Chala', tugma: 'alt+4' },
];

/**
 * Qator filtrga mosmi. «Kiritilganlar» — filtr yoqilgan paytdagi saqlanmagan kiritmalar (to'plam muzlatiladi:
 * yozish paytida qator ko'zdan yo'qolmasin). «Boshlanmagan» — fakt yo'q; «chala» — qisman bajarilgan.
 */
export function holatFiltrMos(f: HolatFiltr, q: Pick<JurnalQator, 'id' | 'holat'>, kiritilgan: ReadonlySet<number>): boolean {
  if (f === 'hammasi') return true;
  if (f === 'kiritilgan') return kiritilgan.has(q.id);
  if (f === 'boshlanmagan') return q.holat === 'yangi';
  return q.holat === 'qisman';
}

const qoldimKalit = (kompaniyaId: number, obyektId: number) => `fakt:qoldim:${kompaniyaId}:${obyektId}`;
/** Oxirgi faol qator (obyekt bo'yicha). Brauzer xotirasi yo'q/yopiq bo'lsa — null, xato chiqmaydi. */
export function qoldimOl(kompaniyaId: number, obyektId: number): number | null {
  try {
    const v = JSON.parse(localStorage.getItem(qoldimKalit(kompaniyaId, obyektId)) ?? 'null') as { id?: unknown } | null;
    const id = Number(v?.id);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  } catch { return null; }
}
export function qoldimYoz(kompaniyaId: number, obyektId: number, qatorId: number): void {
  try { localStorage.setItem(qoldimKalit(kompaniyaId, obyektId), JSON.stringify({ id: qatorId, vaqt: Date.now() })); } catch { /* xotirasiz ham ishlaydi */ }
}

/**
 * Qidiruv mosliklari bo'yicha keyingi/oldingi indeks (aylanma). `moslar` — o'sib boruvchi indekslar.
 * `joriy` null bo'lsa — oldinga birinchisi, orqaga oxirgisi.
 */
export function keyingiMoslik(moslar: readonly number[], joriy: number | null, yon: 1 | -1): number | null {
  if (!moslar.length) return null;
  if (joriy == null) return yon > 0 ? moslar[0] : moslar[moslar.length - 1];
  if (yon > 0) return moslar.find((i) => i > joriy) ?? moslar[0];
  for (let k = moslar.length - 1; k >= 0; k--) if (moslar[k] < joriy) return moslar[k];
  return moslar[moslar.length - 1];
}
