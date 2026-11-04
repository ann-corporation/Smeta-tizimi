/**
 * М-29 - yagona kirish yuklagichi + hujjat quruvchi (avval M29Native sahifasi ichida edi).
 * Sahifa ham, shartnoma oylik paketi ham shu funksiyalarni chaqiradi: bir xil kirishdan bir xil bayt.
 */
import { sbOqi, sbT2DaraxtOl, sbT2KompaniyalarOl, type T2Kompaniya } from '../../api/supabase';
import { sbT2F2TafsilotOl } from '../../api/t2-narx';
import { t } from '../../i18n/til';
import { m29Hisobla, type M29Kirish, type M29SmetaQator, type M29SkladQator } from '../m29';
import { m29Hujjat } from '../m29/export';
import type { ImzoNomlar } from '../hujjat-yozuvchi';

export type M29Yuklangan = { kirish: M29Kirish; ogoh: string; oylar: string[] };

/** Hisobot oylari: tasdiqlangan F2 oylari va sklad harakati oylari (o'sish tartibida). */
export function m29Oylari(k: M29Kirish): string[] {
  return [...new Set([
    ...k.f2.filter((x) => x.akt_holat === 'tasdiqlangan').map((x) => x.oy.slice(0, 7)),
    ...k.sklad.map((x) => String(x.sana).slice(0, 7)),
  ])].filter((x) => /^\d{4}-\d{2}$/.test(x)).sort();
}

/** Smeta + to'liq F2 qatorlari + sklad chiqimi. F2 to'liq o'qilmasa - xato (chala ma'lumot ustida M-29 tuzilmaydi). Sklad o'qilmasa - ogohlantirish. */
export async function m29KirishOl(oid: number): Promise<M29Yuklangan> {
  const [d, f, s] = await Promise.all([
    sbT2DaraxtOl(oid),
    sbT2F2TafsilotOl({ obyektId: oid, tur: 'f2' }),
    sbOqi<M29SkladQator>({ jadval: 't2_sklad_harakat', filtr: `obyekt_id=eq.${oid}&holat=eq.faol`, ustunlar: 'operatsiya,sana,nomi,birligi,obyomi', limit: 100000 }),
  ]);
  if (!d.ok) throw new Error(t('Smeta o‘qilmadi.'));
  if (!f.ok || f.toliq === false) throw new Error(t('F2 qatorlari to‘liq o‘qilmadi — M-29 chala ma’lumot ustida tuzilmaydi.'));
  const ogoh = s.ok ? '' : t('Sklad harakatlari o‘qilmadi — «Фактически» ustuni bo‘sh (noma’lum) qoladi.');
  const smeta = (d.qatorlar || []) as unknown as M29SmetaQator[];
  const f2 = (f.qatorlar || []).map((q) => ({ qator_id: q.qator_id, oy: String(q.oy), hajm: q.certified_quantity ?? q.hajm, akt_holat: q.akt_holat }));
  const sklad = s.ok ? (s.qatorlar || []) : [];
  const kirish: M29Kirish = { smeta, f2, sklad };
  return { kirish, ogoh, oylar: m29Oylari(kirish) };
}

export async function pudratchiNomiOl(kompaniyaId: number): Promise<string | null> {
  const r = await sbT2KompaniyalarOl();
  if (!r.ok) return null;
  const k = ((r.qatorlar || []) as T2Kompaniya[]).find((x) => x.id === kompaniyaId);
  return k?.toliq_nom || k?.nom || null;
}

/** М-29 hujjati: hisobot oyi + oldingi har oy alohida ustun (egasi 2026-09-30). Sahifa va paket bir xil. */
export function m29HujjatQur(p: { kirish: M29Kirish; davr: string; obyektNom: string; pudratchi: string | null; imzo?: ImzoNomlar }): { bytes: Uint8Array; faylNomi: string } {
  const natija = m29Hisobla(p.kirish, p.davr);
  const oldingiOylar = m29Oylari(p.kirish).filter((m) => m < p.davr).map((oy) => ({ oy, natija: m29Hisobla(p.kirish, oy) }));
  return m29Hujjat(natija, { obyektNom: p.obyektNom, pudratchi: p.pudratchi, imzo: p.imzo, oldingiOylar });
}

export type M29PaketNatija = { ok: true; nom: string; bytes: Uint8Array } | { ok: false; bosh?: boolean; xato: string };

/** Paket yo'li: shartnoma oyi M-29 hisobot oyi bo'ladi; shu oyda tasdiqlangan F2 ham, sklad harakati ham bo'lmasa - hujjat yo'q. */
export async function m29PaketFayli(p: { kompaniyaId: number; obyektId: number; obyektNom: string; oy: string; imzo?: ImzoNomlar; pudratchi?: string | null }): Promise<M29PaketNatija> {
  let y: M29Yuklangan;
  try { y = await m29KirishOl(p.obyektId); } catch (e) { return { ok: false, xato: e instanceof Error ? e.message : t('Yuklanmadi.') }; }
  if (!y.oylar.includes(p.oy)) return { ok: false, bosh: true, xato: t('Bu oyda M-29 uchun ma’lumot yo‘q') };
  const pudratchi = p.pudratchi !== undefined ? p.pudratchi : await pudratchiNomiOl(p.kompaniyaId).catch(() => null);
  const h = m29HujjatQur({ kirish: y.kirish, davr: p.oy, obyektNom: p.obyektNom, pudratchi, imzo: p.imzo });
  return { ok: true, nom: h.faylNomi, bytes: h.bytes };
}
