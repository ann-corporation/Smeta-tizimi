/**
 * revizya.ts — varaqning yangi revizyasi yuklanganda oldingi TASDIQLANGAN revizyaga nisbatan farq (DB `_t2_lm_yoz_ich` bilan bir xil kalit).
 * Yuklashdan OLDIN ko'rsatiladi: nima o'zgardi, qaysi solishtirmalar eskiradi.
 */
import { birlikTahlil } from './birlik';

export type RevElement = { tur: string; belgi?: string | null; nom: string; birlik: string; miqdor: number | null };
export type RevKalitli = RevElement & { id?: number; qarorBor?: boolean };

export const elementKaliti = (e: Pick<RevElement, 'tur' | 'belgi' | 'nom'>) => `${e.tur.toLowerCase()}|${(e.belgi ?? '').trim().toLowerCase()}|${e.nom.trim().toLowerCase()}`;

export type RevFarq = {
  yangi: RevElement[];
  ozgargan: { eski: RevKalitli; yangi: RevElement }[];
  ayni: RevElement[];
  olingan: RevKalitli[];
  /** Qarori bor, lekin o'zgargan/olingan -> qayta ko'rib chiqiladi (eskirgan). */
  eskiradigan: RevKalitli[];
};

export function revizyaFarqi(oldingi: RevKalitli[], yangi: RevElement[]): RevFarq {
  const eski = new Map<string, RevKalitli>();
  for (const e of oldingi) eski.set(elementKaliti(e), e);
  const r: RevFarq = { yangi: [], ozgargan: [], ayni: [], olingan: [], eskiradigan: [] };
  const ko = new Set<string>();
  for (const n of yangi) {
    const k = elementKaliti(n); const e = eski.get(k);
    if (!e || ko.has(k)) { r.yangi.push(n); continue; }
    ko.add(k);
    const bir = birlikTahlil(e.birlik).baza === birlikTahlil(n.birlik).baza && e.birlik.trim().toLowerCase() === n.birlik.trim().toLowerCase();
    if (e.miqdor === n.miqdor && bir) r.ayni.push(n);
    else { r.ozgargan.push({ eski: e, yangi: n }); if (e.qarorBor) r.eskiradigan.push(e); }
  }
  for (const [k, e] of eski) if (!ko.has(k)) { r.olingan.push(e); if (e.qarorBor) r.eskiradigan.push(e); }
  return r;
}
