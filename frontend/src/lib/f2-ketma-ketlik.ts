/**
 * F2 qoralamalari KETMA-KETLIGI (egasi 2026-10-24): obyekt ichida hisobot oyi o'sish, keyin F2 raqami.
 * Har obyektda eng eski yozilmagan F2 — «Navbatdagi». Kechroq oyni yozmoqchi bo'lganda eskiroq yozilmagan qoralama bo'lsa — ogohlantirish
 * (blok emas, «Baribir yozish» mumkin).
 */
import type { T2F2DavomQator } from '../api/t2-f2-davom';

const oyKalit = (oy: string | null): string => (oy && /^\d{4}-\d{2}/.test(oy) ? oy.slice(0, 7) : '9999-99');
const raqamSon = (r: string | null): number => { const n = parseInt(String(r ?? '').replace(/\D+/g, ''), 10); return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER; };

export function qoralamaTartibi<T extends Pick<T2F2DavomQator, 'oy' | 'raqam' | 'job_id'>>(a: T, b: T): number {
  return oyKalit(a.oy).localeCompare(oyKalit(b.oy)) || raqamSon(a.raqam) - raqamSon(b.raqam) || String(a.raqam ?? '').localeCompare(String(b.raqam ?? '')) || a.job_id - b.job_id;
}

/** Obyekt ichida tartiblangan ro'yxat (obyektlar o'z tartibida qoladi). */
export function tartiblangan<T extends Pick<T2F2DavomQator, 'oy' | 'raqam' | 'job_id'>>(q: readonly T[]): T[] {
  return [...q].sort(qoralamaTartibi);
}

/** Har obyektning «Navbatdagi» F2 si: eng eski YOZILMAGAN qoralama (job_id lar to'plami). */
export function navbatdagilar(q: readonly T2F2DavomQator[]): Set<number> {
  const eng = new Map<number, T2F2DavomQator>();
  for (const x of q) {
    if (x.yozilgan) continue;
    const e = eng.get(x.obyekt_id);
    if (!e || qoralamaTartibi(x, e) < 0) eng.set(x.obyekt_id, x);
  }
  return new Set([...eng.values()].map((x) => x.job_id));
}

/** Shu obyektda `oy` dan ESKIROQ yozilmagan qoralama (eng eskisi) yoki null. `joriyJobId` — hozir ochiq qoralamaning o'zi. */
export function eskiYozilmagan(q: readonly T2F2DavomQator[], obyektId: number, oy: string, joriyJobId?: number | null): T2F2DavomQator | null {
  const kalit = oyKalit(oy);
  let eng: T2F2DavomQator | null = null;
  for (const x of q) {
    if (x.yozilgan || x.obyekt_id !== obyektId || x.job_id === joriyJobId || x.oy == null) continue;
    if (oyKalit(x.oy) >= kalit) continue;
    if (!eng || qoralamaTartibi(x, eng) < 0) eng = x;
  }
  return eng;
}