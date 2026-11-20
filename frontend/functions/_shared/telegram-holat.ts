/**
 * telegram-holat.ts — bot sifati poydevori (docs/ops/YAGONA_OQIMLAR.md): bitta markazlashgan tizim, har platformada bir xil.
 *
 *  1) HISOB TILI: javob tili Telegram `language_code` dan EMAS, foydalanuvchi hisobidan (`t2_foydalanuvchi.til`, sayt profili bilan bir xil;
 *     bo'sh bo'lsa — o'zbek lotin). Bir chatda til tasodifan almashmaydi. `/til` hisob tilini o'zgartiradi (hamma platformada o'zgaradi).
 *  2) KUTILAYOTGAN NIYAT: bot savol bergach (obyekt raqami, taklif qilinadigan odam, fakt matni, Jarvis suhbati) keyingi oddiy xabar
 *     shu amalni yakunlaydi. Qisqa muddatli holat chat bo'yicha (Cloudflare Cache API; bo'lmasa — isolate xotirasi). Maxfiy ma'lumot
 *     SAQLANMAYDI: faqat id/raqam/foydalanuvchi yozgan qisqa matn; muddat tugagach o'zi yo'qoladi.
 *  3) SINOV OBYEKTLARI: nomi SINOV/TEST bilan boshlanadigan obyektlar haqiqiy kompaniya ro'yxatida ko'rsatilmaydi (faqat ular qolsa — ko'rinadi).
 */
import { type TgEnv, type TgTil, tgRpc } from './telegram';

/* ───────── hisob tili ───────── */
export async function hisobTili(env: TgEnv, uid: number): Promise<TgTil> {
  const r = await tgRpc<{ ok?: boolean; profil?: { til?: string | null } }>(env, 't2_profil_ol_v1', { p_actor_id: uid });
  const t = r?.ok ? r.profil?.til : null;
  return t === 'ru' || t === 'en' ? t : 'uz';
}
export async function tilOzgartir(env: TgEnv, uid: number, til: TgTil): Promise<boolean> {
  const r = await tgRpc<{ ok?: boolean }>(env, 't2_profil_yangila_v1', { p_actor_id: uid, p_ism: null, p_telefon: null, p_til: til, p_avatar_rang: null });
  return !!r?.ok;
}
export const tilYaroqli = (v: unknown): v is TgTil => v === 'uz' || v === 'ru' || v === 'en';

/* ───────── kutilayotgan niyat (chat bo'yicha, qisqa muddat) ───────── */
export type Kutilgan =
  | { tur: 'foto'; fileId: string; w?: number; h?: number; izoh: string }
  | { tur: 'fakt'; oid?: number }
  | { tur: 'fakt_obyekt'; matn: string }
  | { tur: 'taklif'; qiymat?: string };
export type JarvisHolat = { company: number; id: string; mode: 'n' | 'o' };
export type HolatKalit = 'kutish' | 'jarvis' | 'oxirgi' | 'start';

const XOTIRA = new Map<string, { q: string; t: number }>();
const kalitUrl = (chatId: number, k: HolatKalit) => `https://tg-holat.invalid/${chatId}/${k}`;
type KeshLike = { put(r: Request, s: Response): Promise<void>; match(r: Request): Promise<Response | undefined>; delete(r: Request): Promise<boolean> };
const kesh = (): KeshLike | null => { try { return ((globalThis as { caches?: { default?: KeshLike } }).caches?.default) ?? null; } catch { return null; } };

export async function holatYoz(chatId: number, k: HolatKalit, qiymat: unknown, soniya = 600): Promise<void> {
  const q = JSON.stringify(qiymat);
  const c = kesh();
  if (c) { try { await c.put(new Request(kalitUrl(chatId, k)), new Response(q, { headers: { 'Cache-Control': `max-age=${soniya}` } })); return; } catch { /* xotiraga tushadi */ } }
  if (XOTIRA.size > 2000) XOTIRA.clear();
  XOTIRA.set(`${chatId}:${k}`, { q, t: Date.now() + soniya * 1000 });
}
export async function holatOl<T>(chatId: number, k: HolatKalit): Promise<T | null> {
  try {
    const c = kesh();
    if (c) { const r = await c.match(new Request(kalitUrl(chatId, k))); return r ? await r.json() as T : null; }
    const x = XOTIRA.get(`${chatId}:${k}`);
    return x && x.t > Date.now() ? JSON.parse(x.q) as T : null;
  } catch { return null; }
}
export async function holatOch(chatId: number, k: HolatKalit): Promise<void> {
  XOTIRA.delete(`${chatId}:${k}`);
  const c = kesh();
  if (c) { try { await c.delete(new Request(kalitUrl(chatId, k))); } catch { /* muddati o'zi tugaydi */ } }
}
export const holatTozalaTest = () => XOTIRA.clear();

/* ───────── sinov obyektlari ───────── */
export const sinovNomi = (nom: unknown) => /^\s*(sinov|test|тест)/i.test(String(nom ?? ''));
/** Haqiqiy obyektlar bo'lsa — sinovlari chiqarib tashlanadi; faqat sinovlar qolgan bo'lsa — o'zgarishsiz. Tartib saqlanadi. */
export function sinovniSuz<T extends { nom?: string | null }>(q: readonly T[]): T[] {
  const real = q.filter((x) => !sinovNomi(x.nom));
  return real.length ? real : [...q];
}

/* ───────── matn niyati (xabar ro'yxatdagi buyruq/kutilgan holat bilan bog'liq bo'lmaganda) ───────── */
export type Niyat = 'ombor' | 'fakt' | 'jarvis';
const OMBOR = /(?:^|[^\p{L}])(?:keldi|keltirildi|keltirdim|kirim|prixod|приход|chiqim|rasxod|расход|berdim|berildi|chiqardim|chiqdi|olib\s+keldi|qoldiq|ostatka|остаток|ombor\p{L}*|sklad\p{L}*|склад|qabul\s+qildim|received|issued|warehouse|stock)(?=$|[^\p{L}])/iu;
const FAKT_FEL = /(?:qilindi|qildik|quyildi|quydik|yotqizildi|yotqizdik|o['‘’`]rnatildi|bajarildi|bajardik|qazildi|ishlandi|tortildi|terildi|ko['‘’`]tarildi|suvaldi|bo['‘’`]yaldi|yopildi|выполнен\p{L}*|сделан\p{L}*|уложен\p{L}*|залит\p{L}*|completed|poured|laid)/iu;
const MIQDOR = /\d+(?:[.,]\d+)?\s*(?:m3|m³|m2|m²|km|kg|tonna|dona|pm|м3|м2|кг|шт|t|m)(?=$|[^\p{L}\d])/iu;
export function niyatAniqla(matn: string): Niyat {
  const t = matn.trim();
  if (/\?\s*$/.test(t)) return 'jarvis';
  if (OMBOR.test(t)) return 'ombor';
  if (FAKT_FEL.test(t) && MIQDOR.test(t)) return 'fakt';
  return 'jarvis';
}
