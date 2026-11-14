/**
 * aosr-yuborilgan.ts — АОСР ro'yxatida «Qoralama» belgisi yuborilgandan keyin ham qolib ketmasin:
 * hujjat qarshi tomonga yuborilgan bo'lsa, ro'yxatda taqdim holati (yuborilgan / ko'rilmoqda / tuzatish / qabul / rad) ko'rinadi.
 * «qaytarilgan» (pudratchi o'zi qaytarib olgan) — yana qoralama.
 */
import type { TaqdimHolat, TaqdimQisqa } from '../api/t2-tomon';

export function aosrTaqdimHolatlari(rows: readonly TaqdimQisqa[]): Map<number, TaqdimHolat> {
  const eng = new Map<number, TaqdimQisqa>();
  for (const x of rows) {
    if (x.resurs !== 'aosr' || x.manba_id == null) continue;
    const o = eng.get(x.manba_id);
    if (!o || x.id > o.id) eng.set(x.manba_id, x);
  }
  const m = new Map<number, TaqdimHolat>();
  for (const [id, x] of eng) if (x.holat !== 'qaytarilgan') m.set(id, x.holat);
  return m;
}