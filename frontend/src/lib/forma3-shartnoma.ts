/**
 * forma3-shartnoma.ts — Forma 3 SHARTNOMA rejimi: toza yordamchilar (UI siz).
 * Hujjat hisobi/Excel — `forma3-export.ts` (`forma3ShartnomaHujjat`); server — `t2_forma3_yarat_v1` / `t2_forma3_shartnoma_aktlar_v1`.
 * Qoida (egasi): shartnoma + davr → shartnomaning BARCHA obyektlari tasdiqlangan F2 aktlari, boshqa (bekor qilinmagan) F3 da
 * bo'lmaganlari oldindan belgilanadi → bitta F3.
 */
import type { Forma3ShartnomaAkt } from '../api/t2-document-control';

/** «YYYY-MM» → shu oyning birinchi va oxirgi kuni («YYYY-MM-DD»). Noto'g'ri oy — null. */
export function f3OyChegarasi(oy: string): { boshi: string; oxiri: string } | null {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(oy || '');
  if (!m) return null;
  const kun = new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).getUTCDate();
  return { boshi: `${m[1]}-${m[2]}-01`, oxiri: `${m[1]}-${m[2]}-${String(kun).padStart(2, '0')}` };
}

export interface F3AktTanlov {
  /** Oldindan belgilanadigan aktlar: tasdiqlangan, hech bir bekor qilinmagan F3 ga kirmagan. */
  tanlangan: number[];
  /** Boshqa F3 ga allaqachon kirgan aktlar — ro'yxatda ko'rinadi, lekin belgilanmaydi va yuborilmaydi. */
  band: Forma3ShartnomaAkt[];
  /** Obyekt bo'yicha guruhlangan (obyekt nomi tartibida) ro'yxat. */
  guruhlar: Array<{ obyekt_id: number; nom: string; aktlar: Forma3ShartnomaAkt[] }>;
}

/** Server ro'yxatidan UI tanlovi: band aktlar chiqarib tashlanadi, qolgani oldindan belgilanadi. */
export function f3AktTanlov(aktlar: ReadonlyArray<Forma3ShartnomaAkt>): F3AktTanlov {
  const tanlangan = aktlar.filter((a) => !a.band).map((a) => a.akt_id);
  const band = aktlar.filter((a) => a.band);
  const byOb = new Map<number, { obyekt_id: number; nom: string; aktlar: Forma3ShartnomaAkt[] }>();
  for (const a of aktlar) {
    const g = byOb.get(a.obyekt_id) ?? { obyekt_id: a.obyekt_id, nom: a.obyekt_nom ?? `#${a.obyekt_id}`, aktlar: [] };
    g.aktlar.push(a);
    byOb.set(a.obyekt_id, g);
  }
  return { tanlangan, band, guruhlar: [...byOb.values()].sort((x, y) => x.nom.localeCompare(y.nom)) };
}

/** Yuboriladigan akt idlari: faqat ro'yxatdagi, band bo'lmagan va foydalanuvchi belgilagan aktlar (begona id o'tmaydi). */
export function f3YuboriladiganAktlar(aktlar: ReadonlyArray<Forma3ShartnomaAkt>, belgilangan: ReadonlySet<number>): number[] {
  return aktlar.filter((a) => !a.band && belgilangan.has(a.akt_id)).map((a) => a.akt_id);
}
