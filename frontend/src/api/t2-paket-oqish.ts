/**
 * Daraxt + holat — bitta so'rovda (obyekt paketi) o'qish. `/api/obyekt-paket` ustunli JSON beradi: ~10-12 sahifa
 * (`t2_daraxt` + `t2_qator_holat`, har biri ~4-6 s) o'rniga BITTA chaqiruv, tanasi qator-obyektlardan ancha kichik.
 *
 * Xulq o'zgarmaydi: natija `sbT2DaraxtOl(T2_DARAXT_USTUNLARI)` + `sbT2QatorHolatOl(T2_HOLAT_DARAXT_USTUNLARI_YOQ)`
 * bilan bir xil shaklda (`paketdanQatorlar` / `paketdanHolatlar`). Har qanday nosozlik (403 — f2/narx ruxsati yo'q,
 * eski server, tarmoq, noto'g'ri shakl) — `null`: chaqiruvchi eski sahifalab yo'lga qaytadi (jim yarim ma'lumot yo'q).
 * Bir vaqtdagi bir xil obyekt so'rovlari BITTAGA birlashtiriladi (ikki hook/panel ikki marta yuklamasin).
 */
import type { T2Qator, T2QatorHolat } from './supabase';
import { obyektPaketOl } from './t2-obyekt-paket';
import { paketDekod, paketdanF2Holatlar, paketdanHolatlar, paketdanQatorlar, type F2Holat } from '../ombor/paket';

export type DaraxtHolat = { rows: T2Qator[]; states: T2QatorHolat[] };

/** Tez yo'lni o'chirish (diagnostika): brauzerda localStorage['gas.paketOqish'] = '0'. Sinxron — o'chiq bo'lsa hech qanday kutish yo'q. */
export function paketTezYoliYoqilgan(): boolean {
  try { return globalThis.localStorage?.getItem('gas.paketOqish') !== '0'; } catch { return true; }
}

const ketayotgan = new Map<number, Promise<DaraxtHolat | null>>();

async function oqi(obyektId: number): Promise<DaraxtHolat | null> {
  try {
    const r = await obyektPaketOl(obyektId);
    if (!r.ok || r.paket.obyekt_id !== obyektId) return null;
    const p = paketDekod(r.paket);
    return { rows: paketdanQatorlar(p), states: paketdanHolatlar(p) };
  } catch { return null; }
}

/** Paketdan daraxt + holat; `null` — paket yo'li ishlamadi (eski yo'lga qayting). */
export function paketdanDaraxtHolatOl(obyektId: number): Promise<DaraxtHolat | null> {
  const bor = ketayotgan.get(obyektId);
  if (bor) return bor;
  const p = oqi(obyektId).finally(() => { if (ketayotgan.get(obyektId) === p) ketayotgan.delete(obyektId); });
  ketayotgan.set(obyektId, p);
  return p;
}

export type F2DaraxtHolat = { rows: T2Qator[]; f2Holat: F2Holat[] };
const ketayotganF2 = new Map<number, Promise<F2DaraxtHolat | null>>();

async function oqiF2(obyektId: number): Promise<F2DaraxtHolat | null> {
  try {
    const r = await obyektPaketOl(obyektId);
    if (!r.ok || r.paket.obyekt_id !== obyektId) return null;
    const p = paketDekod(r.paket);
    const f2Holat = paketdanF2Holatlar(p);
    return f2Holat ? { rows: paketdanQatorlar(p), f2Holat } : null; // f2_narx/smeta_hajm yo'q (eski server): eski yo'l
  } catch { return null; }
}

/** F2 tayyorlash uchun daraxt + holat (F2_HOLAT_USTUNLAR shaklida) paketdan; `null`: eski yo'lga qayting. */
export function paketdanF2DaraxtHolatOl(obyektId: number): Promise<F2DaraxtHolat | null> {
  const bor = ketayotganF2.get(obyektId);
  if (bor) return bor;
  const p = oqiF2(obyektId).finally(() => { if (ketayotganF2.get(obyektId) === p) ketayotganF2.delete(obyektId); });
  ketayotganF2.set(obyektId, p);
  return p;
}