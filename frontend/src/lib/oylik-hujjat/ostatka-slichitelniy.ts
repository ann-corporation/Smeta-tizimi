/**
 * OSTATKA va SLICHITELNIY ведомость - yagona kontekst yuklagich + hujjat quruvchi.
 * Avval HolatNative sahifasi ichida edi; endi sahifa ham, shartnoma oylik paketi ham SHU funksiyalarni chaqiradi
 * (bir xil kirishdan bir xil bayt). Pul hisobi yo'q - ostatka-export / slichitelniy-vedomost yadrosidan.
 */
import { sbT2DaraxtOl, sbT2QatorHolatOl, type T2Qator, type T2QatorHolat } from '../../api/supabase';
import { paketdanDaraxtHolatOl, paketTezYoliYoqilgan } from '../../api/t2-paket-oqish';
import { T2_DARAXT_USTUNLARI, T2_HOLAT_DARAXT_USTUNLARI_YOQ } from '../../api/t2-daraxt-ustunlar';
import { ozgarishMalumotOl } from '../../api/t2-ozgarish';
import { ozgarishRoyxatOl } from '../../api/t2-document-control';
import { t2ObyektNakrutka } from '../../api/t2-nakrutka';
import { obyektPodvaliOqi, ustamaKontekstXatosi } from '../../api/t2-nakrutka-podval';
import { f2HujjatKonteksti } from '../../api/f2-hujjat-kontekst';
import { ozgarishniQosh } from '../lrv-ozgarish';
import { ostatkaHujjatModeli, ostatkaHujjatXlsx, ostatkaIstisnolari, type OstatkaIstisno, type OstatkaModel } from '../ostatka-export';
import { slichitelniyHujjatXlsx, slichitelniyModeli, type SlichitelniyModel } from '../slichitelniy-vedomost';
import { yaxlitQatorIdlari } from '../svod-yaxlit';
import type { ImzoNomlar } from '../hujjat-yozuvchi';
import { AsosXarita } from '../slichitelniy-asos';
import { slichitelniyAsosOl } from '../../api/t2-slichitelniy-asos';
import type { NakrutkaKoeffitsientlar } from '../../api/t2-nakrutka';
import type { Podval } from '../nakrutka-konstruktor';
import type { SvodYaxlit } from '../svod-yaxlit';

/** Smeta daraxti + holat (fakt/F2) - useT2Daraxt ning to'liq yuklashi bilan bir xil (qator + holat + qo'shimcha/zamena belgilari). */
export type DaraxtManba = { rows: T2Qator[]; states: T2QatorHolat[] };

/** Daraxt va holat jadvalini bir marta o'qiydi (useT2Daraxt ham, paket ham shuni chaqiradi). Xato - sabab matni bilan. */
export async function daraxtVaHolatOl(obyektId: number): Promise<{ ok: true; rows: T2Qator[]; states: T2QatorHolat[] } | { ok: false; xato: string }> {
  // Tez yo'l: obyekt paketi — bitta so'rov (sahifalab ~10+ so'rov o'rniga). Ishlamasa — eski yo'l, natija bir xil.
  const paket = paketTezYoliYoqilgan() ? await paketdanDaraxtHolatOl(obyektId) : null;
  if (paket) return { ok: true, rows: paket.rows, states: paket.states };
  try {
    const [d, h] = await Promise.all([sbT2DaraxtOl(obyektId, T2_DARAXT_USTUNLARI), sbT2QatorHolatOl(obyektId, T2_HOLAT_DARAXT_USTUNLARI_YOQ)]);
    if (!d.ok || !h.ok) return { ok: false, xato: d.error || h.error || 'Kanonik daraxt o‘qilmadi.' };
    return { ok: true, rows: (d.qatorlar || []) as T2Qator[], states: (h.qatorlar || []) as T2QatorHolat[] };
  } catch { return { ok: false, xato: 'Kanonik daraxt o‘qilmadi. Tarmoq yoki ruxsatni tekshiring.' }; }
}

/** Paket uchun: daraxt + holat + qo'shimcha/zamena belgilari (sahifa eksporti shularni kutadi: qoshimchaHolat='tayyor'). */
export async function daraxtToliqOl(obyektId: number): Promise<{ ok: true; rows: T2Qator[]; states: T2QatorHolat[] } | { ok: false; xato: string }> {
  const [d, oz] = await Promise.all([daraxtVaHolatOl(obyektId), ozgarishMalumotOl(obyektId).catch(() => null)]);
  if (!d.ok) return d;
  if (oz == null) return { ok: false, xato: 'Qo‘shimcha/zamena belgilari o‘qilmadi.' };
  return { ok: true, rows: ozgarishniQosh(d.rows, oz), states: d.states };
}

type IstisnoXomAsos = Parameters<typeof ostatkaIstisnolari>[0][number];

/** Ostatkadan chiqarilgan (bekor qilingan) ishlar - eng so'nggi holat. O'qilmasa istisno tashlaydi (jim yo'qotish yo'q). */
export async function istisnolarOl<T extends IstisnoXomAsos = IstisnoXomAsos>(obyektId: number): Promise<{ royxat: T[]; istisnolar: OstatkaIstisno[] }> {
  const j = await ozgarishRoyxatOl(obyektId, 500);
  const royxat = ((j.ozgarishlar ?? []) as T[]).filter((o) => o.tur === 'olib_tashlash');
  return { royxat, istisnolar: ostatkaIstisnolari(royxat) };
}

export type UstamaManba = { koeffitsientlar: Partial<NakrutkaKoeffitsientlar> | null; podval: Podval | null; nkManba: string | null; svodYaxlit: SvodYaxlit | null };

/** Ustama (nakrutka) + podval + svod yaxlit. «Podval yo'q» va «o'qilmadi» farqlanadi: o'qilmasa - xato (jim standartga tushilmaydi). */
export async function ustamaManbaOl(kompaniyaId: number, obyektId: number): Promise<{ ok: true; ustama: UstamaManba } | { ok: false; xato: string }> {
  const nk = await t2ObyektNakrutka(obyektId).catch(() => null);
  const pod = nk?.ok ? await obyektPodvaliOqi(kompaniyaId, obyektId, nk.shartnoma_id ?? null, nk.nakrutka_podval_id ?? null) : null;
  const xato = ustamaKontekstXatosi(nk, pod);
  if (xato || !nk?.ok || !pod?.ok) return { ok: false, xato: xato ?? 'ustama o‘qilmadi' };
  return { ok: true, ustama: { koeffitsientlar: nk.koeffitsientlar ?? null, podval: pod.podval, nkManba: nk.nk_manba ?? null, svodYaxlit: nk.svod_yaxlit ?? null } };
}

export type OstatkaKirish = { rows: readonly T2Qator[]; states: readonly T2QatorHolat[]; istisnolar: readonly OstatkaIstisno[]; ustama: UstamaManba; obyektNom: string; imzo?: ImzoNomlar };

/** Ostatka hujjati: sahifa (HolatNative) ham, paket ham shu funksiyani chaqiradi. Ostatka yo'q bo'lsa bayt yo'q (model qaytadi). */
export function ostatkaHujjatQur(k: OstatkaKirish): { model: OstatkaModel; fayl: { bytes: Uint8Array; faylNomi: string } | null } {
  const model = ostatkaHujjatModeli(k.rows as T2Qator[], k.states as T2QatorHolat[], k.istisnolar, k.ustama.svodYaxlit);
  if (!model.barglar) return { model, fayl: null };
  const { bytes, faylNomi } = ostatkaHujjatXlsx(model, { obyektNomi: k.obyektNom, imzo: k.imzo, nakrutka: k.ustama.koeffitsientlar, podval: k.ustama.podval, nkManba: k.ustama.nkManba,
    yaxlitIdlar: yaxlitQatorIdlari(k.rows, k.ustama.svodYaxlit) });
  return { model, fayl: { bytes, faylNomi } };
}

export type SlichitelniyKirish = OstatkaKirish & { faqatFarq?: boolean; /** Fakt asosli rejim: «Основание» ustuni + asoslar reestri (RPC o'qilmasa berilmaydi). */ asos?: AsosXarita | null };

export function slichitelniyHujjatQur(k: SlichitelniyKirish): { model: SlichitelniyModel; fayl: { bytes: Uint8Array; faylNomi: string } | null } {
  const faqatFarq = k.faqatFarq ?? false;
  const model = slichitelniyModeli(k.rows as T2Qator[], k.states as T2QatorHolat[], { faqatFarq, istisnolar: k.istisnolar, svodYaxlit: k.ustama.svodYaxlit });
  if (!model.barglar) return { model, fayl: null };
  const { bytes, faylNomi } = slichitelniyHujjatXlsx(model, { obyektNomi: k.obyektNom, imzo: k.imzo, faqatFarq, istisnolar: k.istisnolar, nakrutka: k.ustama.koeffitsientlar, podval: k.ustama.podval, nkManba: k.ustama.nkManba,
    svodYaxlit: k.ustama.svodYaxlit, yaxlitIdlar: yaxlitQatorIdlari(k.rows, k.ustama.svodYaxlit), asos: k.asos ?? null });
  return { model, fayl: { bytes, faylNomi } };
}

export type PaketHujjatNatija = { ok: true; nom: string; bytes: Uint8Array } | { ok: false; bosh?: boolean; xato: string };

/** Paket yo'li (ostatka / slichitelniy): hamma kirishni o'zi o'qiydi, so'ng sahifa bilan bir xil quruvchini chaqiradi. */
export async function ostatkaPaketFayli(p: { kompaniyaId: number; obyektId: number; obyektNom: string; imzo?: ImzoNomlar; tur: 'ostatka' | 'slichitelniy' }): Promise<PaketHujjatNatija> {
  const d = await daraxtToliqOl(p.obyektId);
  if (!d.ok) return { ok: false, xato: d.xato };
  let istisnolar: OstatkaIstisno[];
  try { istisnolar = (await istisnolarOl(p.obyektId)).istisnolar; } catch { return { ok: false, xato: 'bekor qilingan ishlar ro‘yxati o‘qilmadi' }; }
  const u = await ustamaManbaOl(p.kompaniyaId, p.obyektId);
  if (!u.ok) return { ok: false, xato: u.xato };
  const kirish: OstatkaKirish = { rows: d.rows, states: d.states, istisnolar, ustama: u.ustama, obyektNom: p.obyektNom, imzo: p.imzo };
  // Slichitelniy paketda ham sahifa bilan BIR XIL quruvchi: asoslar o'qilsa «Основание» ustuni + reestr; o'qilmasa — asossiz (jim yiqilmaydi, sahifada ogohlantiriladi).
  let asos: AsosXarita | null = null;
  if (p.tur === 'slichitelniy') { const j = await slichitelniyAsosOl(p.kompaniyaId, p.obyektId, 1).catch(() => null); asos = j && j.ok ? new AsosXarita(j) : null; }
  const r = p.tur === 'ostatka' ? ostatkaHujjatQur(kirish) : slichitelniyHujjatQur({ ...kirish, asos });
  if (!r.fayl) return { ok: false, bosh: true, xato: p.tur === 'ostatka' ? 'ostatka yo‘q (barcha ishlar bajarilgan)' : 'solishtiriladigan pozitsiya yo‘q' };
  return { ok: true, nom: r.fayl.faylNomi, bytes: r.fayl.bytes };
}

/** `f2HujjatKonteksti` imzosi paketdagi barcha F2 / hujjatlarda bir xil (obyektdagi tayinlangan imzochi > shartnoma tomoni > kompaniya sukuti). */
export async function paketImzosiOl(kompaniyaId: number, obyektId: number): Promise<ImzoNomlar> {
  try { return (await f2HujjatKonteksti(kompaniyaId, obyektId)).imzo; } catch { return {}; }
}
