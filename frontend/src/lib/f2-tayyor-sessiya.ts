/**
 * F2 tayyorlash: saqlanmagan kiritmalar sessionStorage da (obyekt bo'yicha) — sahifa yangilansa ish yo'qolmasin.
 * Faqat qulaylik: storage yo'q/o'chirilgan/xato bo'lsa jim o'tiladi, sahifa baribir to'g'ri ishlaydi.
 */
import { bosKiritma, type F2Kiritma } from './f2-tayyor';

const kalit = (obyektId: number) => `f2-tayyorlash:kiritma:${obyektId}`;

export type F2SessiyaHolat = { k: F2Kiritma; raqam: string };

const bosmi = (k: F2Kiritma) => !Object.values(k.hajm).some((v) => (v ?? '').trim() !== '')
  && !Object.values(k.narx).some((v) => (v ?? '').trim() !== '') && !Object.values(k.summa).some((v) => (v ?? '').trim() !== '')
  && !Object.values(k.narxsiz).some(Boolean);

const satrlarMi = (o: unknown): o is Record<number, string> => !!o && typeof o === 'object' && Object.values(o as object).every((v) => typeof v === 'string');
const mantiqMi = (o: unknown): o is Record<number, boolean> => !!o && typeof o === 'object' && Object.values(o as object).every((v) => typeof v === 'boolean');

export function f2SessiyaSaqla(obyektId: number, h: F2SessiyaHolat): void {
  try {
    if (bosmi(h.k)) { sessionStorage.removeItem(kalit(obyektId)); return; }
    sessionStorage.setItem(kalit(obyektId), JSON.stringify(h));
  } catch { /* storage yo'q — muhim emas */ }
}

export function f2SessiyaOqi(obyektId: number): F2SessiyaHolat | null {
  try {
    const m = sessionStorage.getItem(kalit(obyektId));
    if (!m) return null;
    const j = JSON.parse(m) as { k?: Partial<F2Kiritma>; raqam?: unknown };
    if (!j.k || !satrlarMi(j.k.hajm) || !satrlarMi(j.k.narx) || !satrlarMi(j.k.summa) || !mantiqMi(j.k.narxsiz)) return null;
    return { k: { hajm: j.k.hajm, narx: j.k.narx, summa: j.k.summa, narxsiz: j.k.narxsiz }, raqam: typeof j.raqam === 'string' ? j.raqam : '' };
  } catch { return null; }
}

export function f2SessiyaTozala(obyektId: number): void {
  try { sessionStorage.removeItem(kalit(obyektId)); } catch { /* ignore */ }
}

/** Bitta qatorning (ish yoki resurs) barcha kiritmasini tozalaydi (✕). Boshqa qatorlar tegilmaydi. */
export function f2QatorniOlibTashla(k: F2Kiritma, id: number): F2Kiritma {
  const kes = <V,>(o: Record<number, V>): Record<number, V> => { const { [id]: _o, ...qolgan } = o; void _o; return qolgan; };
  return { hajm: kes(k.hajm), narx: kes(k.narx), summa: kes(k.summa), narxsiz: kes(k.narxsiz) };
}

export { bosKiritma };
