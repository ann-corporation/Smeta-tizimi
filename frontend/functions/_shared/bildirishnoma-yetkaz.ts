/**
 * bildirishnoma-yetkaz.ts — t2_bildirishnoma (hujjat.*) → Telegram yetkazuvchisi (sof mantiq, bog'liqliklar tashqaridan beriladi).
 *
 * Oqim (/api/bildirishnoma-yetkaz, GitHub Actions har 15 daqiqada):
 *   t2_bildirishnoma_tg_navbat_v1  → olingan qatorlar bazada darhol «yuborilmoqda» (urinish+1)
 *   yetkazPartiya()                → har qator uchun: manzil → yuborish → natija turi
 *   t2_bildirishnoma_tg_natija_v1  → faqat «yuborilmoqda» qatorlar yopiladi (yuborilgan qayta ochilmaydi)
 *
 * QAYTA YUBORMASLIK qoidasi: «xato» (qayta urinish) faqat xabar Telegramga YETMAGANI aniq bo'lganda —
 * manzilni aniqlab bo'lmadi yoki Telegram aniq vaqtinchalik rad qaytardi (429, 5xx). So'rov ketib javob kelmasa — «nomalum»,
 * bunday qator boshqa yuborilmaydi (takror xabardan ko'ra bitta yo'qotish afzal). Bot bloklangan/chat yo'q — «otkazildi».
 * Hech narsa (matn, chat_id, token) loglanmaydi.
 */
import matnlar from '../../src/i18n/lugat/qism/bildirishnoma.json';
import { MUDDAT_MATN, bildirishnomaHavolasi, bildirishnomaMatnKaliti, muddatKorinishi } from '../../src/lib/bildirishnoma-matn';

export type TgTil = 'uz' | 'ru' | 'en';
export type NavbatQator = { id: number; foydalanuvchi_id: number; mavzu: string; parametrlar?: Record<string, unknown> | null; urinish?: number };
/** null — manzilni aniqlab bo'lmadi (baza/tarmoq xatosi): xabar ketmagan, qayta urinish xavfsiz. */
export type Manzil = { yuborish: boolean; chat_id?: number; til?: TgTil | null } | null;
/** `yetdi: false` — so'rov Telegramga yetmagani aniq (fetch boshlanmadi/token yo'q). */
export type YuborishNatija = { ok: boolean; description?: string; yetdi?: boolean };
export type NatijaHolat = 'yuborildi' | 'xato' | 'otkazildi' | 'nomalum';
export type Natija = { id: number; holat: NatijaHolat; xato?: string };
export type Bogliqlik = {
  manzil: (foydalanuvchiId: number) => Promise<Manzil>;
  yubor: (chatId: number, matn: string, til: TgTil, havola: string | null) => Promise<YuborishNatija>;
};

const LUG = matnlar as Record<string, { ru: string; en: string }>;
/** bildirishnoma.json bo'yicha tarjima (kalit = o'zbek lotin matn). */
export function tgTarjima(kalit: string, til: TgTil, p?: Record<string, string>): string {
  const s = til === 'ru' || til === 'en' ? (LUG[kalit]?.[til] ?? kalit) : kalit;
  return p ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in p ? p[k] : m)) : s;
}
const tarjima = tgTarjima;

/** Telegram xabar matni (oddiy matn, parse_mode yo'q). Noma'lum mavzu — null (yuborilmaydi). */
export function telegramMatni(q: Pick<NavbatQator, 'mavzu' | 'parametrlar'>, til: TgTil): string | null {
  const kalit = bildirishnomaMatnKaliti(q.mavzu);
  if (!kalit) return null;
  const qatorlar = [tarjima(kalit, til)];
  const p = q.parametrlar ?? {};
  const raqam = typeof p.raqam === 'string' && p.raqam.trim() ? p.raqam.trim().slice(0, 60) : null;
  if (raqam) qatorlar[0] += ` — № ${raqam}`;
  const muddat = muddatKorinishi(p.muddat);
  if (muddat) qatorlar.push(tarjima(MUDDAT_MATN, til, { muddat }));
  return qatorlar.join('\n');
}

/** Telegram «bu odamga hech qachon yetmaydi» javobi (qayta urinish befoyda). */
export function doimiyRadmi(description: string | undefined): boolean {
  const d = String(description || '').toLowerCase();
  return /bot was blocked|user is deactivated|chat not found|bot can't initiate|not enough rights|have no rights|kicked/.test(d);
}

/** Telegram aniq rad etdi, xabar ketmadi — keyinroq urinish mumkin. */
export function vaqtinchalikmi(description: string | undefined): boolean {
  const d = String(description || '').toLowerCase();
  return /too many requests|retry after|internal server error|bad gateway|gateway|service unavailable|\b5\d\d\b|\b429\b/.test(d);
}

const qisqa = (s: string | undefined) => (String(s || '').replace(/[^\w .:-]/g, '').slice(0, 120) || 'NOMALUM');

/** Bitta qatorni yetkazadi. Hech qachon tashlamaydi (throw yo'q). */
export async function bittaYetkaz(q: NavbatQator, dep: Bogliqlik): Promise<Natija> {
  if (!Number.isSafeInteger(q.id) || q.id <= 0) return { id: q.id, holat: 'otkazildi', xato: 'ID' };
  let m: Manzil;
  try { m = await dep.manzil(q.foydalanuvchi_id); } catch { m = null; }
  if (m === null) return { id: q.id, holat: 'xato', xato: 'MANZIL_ANIQLANMADI' };
  if (!m.yuborish || !Number.isSafeInteger(m.chat_id)) return { id: q.id, holat: 'otkazildi', xato: 'ULANMAGAN_YOKI_ROZI_EMAS' };
  const til: TgTil = m.til === 'ru' || m.til === 'en' ? m.til : 'uz';
  const matn = telegramMatni(q, til);
  if (!matn) return { id: q.id, holat: 'otkazildi', xato: 'MAVZU_NOMALUM' };
  let r: YuborishNatija;
  try { r = await dep.yubor(m.chat_id as number, matn, til, bildirishnomaHavolasi({ mavzu: q.mavzu, parametrlar: q.parametrlar })); }
  catch { r = { ok: false, description: 'ISTISNO' }; }
  if (r.ok) return { id: q.id, holat: 'yuborildi' };
  if (r.yetdi === false) return { id: q.id, holat: 'xato', xato: qisqa(r.description) };
  if (doimiyRadmi(r.description)) return { id: q.id, holat: 'otkazildi', xato: qisqa(r.description) };
  if (vaqtinchalikmi(r.description)) return { id: q.id, holat: 'xato', xato: qisqa(r.description) };
  // Javob kelmadi yoki tushunarsiz — xabar ketgan bo'lishi mumkin: qayta yuborilmaydi.
  return { id: q.id, holat: 'nomalum', xato: qisqa(r.description) };
}

/** Partiyani ketma-ket yetkazadi (Telegram limiti: bir chatga sekundiga ~1, jami ~30). Har qator uchun bitta natija. */
export async function yetkazPartiya(qatorlar: NavbatQator[], dep: Bogliqlik): Promise<Natija[]> {
  const natija: Natija[] = [];
  const korilgan = new Set<number>();
  for (const q of qatorlar) {
    if (korilgan.has(q.id)) continue;
    korilgan.add(q.id);
    natija.push(await bittaYetkaz(q, dep));
  }
  return natija;
}

/** Natijalar xulosasi (javob uchun, matnsiz). */
export function xulosa(n: Natija[]): Record<NatijaHolat, number> {
  const s: Record<NatijaHolat, number> = { yuborildi: 0, xato: 0, otkazildi: 0, nomalum: 0 };
  for (const x of n) s[x.holat] += 1;
  return s;
}
