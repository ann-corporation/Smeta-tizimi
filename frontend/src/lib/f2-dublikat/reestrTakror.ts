/**
 * F2 REESTRI «Takrorlar» tekshiruvi (egasi 2026-10-25): bir xil raqam (bir shartnoma/obyekt doirasida), bir xil summa + obyekt,
 * tuzatish aktlari («N-П») va ularning asl akti juftligi. Faqat o‘qish — hech narsa o‘zgartirilmaydi.
 */
import { raqamKaliti, summaYaqin } from './tekshiruv';

export type TakrorAkt = { id: number; obyekt_id: number; oy: string; raqam: string | null; holat: string; hujjat_jami: number | null };
export type TakrorTur = 'raqam' | 'summa' | 'tuzatish';
export type TakrorGuruh = {
  tur: TakrorTur;
  /** raqam: «№49»; summa: obyekt id; tuzatish: «№35-П». */
  kalit: string;
  aktlar: TakrorAkt[];
  /** tuzatish juftligida asl akt topilmadimi. */
  aslYoq?: boolean;
};

/** «35-П», «35 - P», «35-п» → asl raqam «35» (tuzatuvchi minus akt). */
export function tuzatishAsli(raqam: string | null | undefined): string | null {
  const m = /^(.+?)\s*-\s*[ПпPp]$/.exec(String(raqam ?? '').trim());
  return m ? m[1].trim() : null;
}

export function reestrTakrorlar(aktlar: readonly TakrorAkt[], shartnomaByObyekt: ReadonlyMap<number, readonly number[]>): TakrorGuruh[] {
  const faol = aktlar.filter((a) => a.holat !== 'bekor');
  // Doira: umumiy shartnomali obyektlar bitta; shartnomasiz obyekt — o‘zi.
  const ota = new Map<string, string>();
  const topIl = (x: string): string => { let r = x; while ((ota.get(r) ?? r) !== r) r = ota.get(r)!; return r; };
  const birlash = (a: string, b: string) => { const ra = topIl(a), rb = topIl(b); if (ra !== rb) ota.set(ra, rb); };
  for (const a of faol) { const o = `o${a.obyekt_id}`; if (!ota.has(o)) ota.set(o, o); for (const s of shartnomaByObyekt.get(a.obyekt_id) ?? []) { const k = `s${s}`; if (!ota.has(k)) ota.set(k, k); birlash(o, k); } }
  const doira = (a: TakrorAkt) => topIl(`o${a.obyekt_id}`);
  const asosiy = faol.filter((a) => tuzatishAsli(a.raqam) == null);
  const out: TakrorGuruh[] = [];

  const raqamGuruh = new Map<string, TakrorAkt[]>();
  for (const a of asosiy) { const r = raqamKaliti(a.raqam); if (!r) continue; const k = `${doira(a)}|${r}`; (raqamGuruh.get(k) ?? raqamGuruh.set(k, []).get(k)!).push(a); }
  for (const l of raqamGuruh.values()) if (l.length > 1) out.push({ tur: 'raqam', kalit: `№${l[0].raqam!.trim()}`, aktlar: [...l].sort((x, y) => x.id - y.id) });

  const obyektGuruh = new Map<number, TakrorAkt[]>();
  for (const a of asosiy) if (a.hujjat_jami != null && Math.abs(a.hujjat_jami) >= 0.005) (obyektGuruh.get(a.obyekt_id) ?? obyektGuruh.set(a.obyekt_id, []).get(a.obyekt_id)!).push(a);
  for (const [oid, l] of obyektGuruh) {
    const tartib = [...l].sort((x, y) => (x.hujjat_jami! - y.hujjat_jami!) || x.id - y.id);
    let joriy: TakrorAkt[] = [];
    const yop = () => { if (joriy.length > 1) out.push({ tur: 'summa', kalit: String(oid), aktlar: [...joriy].sort((x, y) => x.id - y.id) }); joriy = []; };
    for (const a of tartib) {
      if (joriy.length && !summaYaqin(joriy[0].hujjat_jami, a.hujjat_jami)) yop();
      joriy.push(a);
    }
    yop();
  }

  for (const a of faol) {
    const asl = tuzatishAsli(a.raqam);
    if (asl == null) continue;
    const topildi = asosiy.filter((x) => x.obyekt_id === a.obyekt_id && raqamKaliti(x.raqam) === raqamKaliti(asl));
    out.push({ tur: 'tuzatish', kalit: `№${a.raqam!.trim()}`, aktlar: [a, ...topildi], aslYoq: topildi.length === 0 });
  }
  return out;
}