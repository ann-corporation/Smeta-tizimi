/**
 * Usta «Bugun» sahifasi uchun naryad satrlari (mobil: 4–6 katta tugma, oddiy til). Usta O'Z birligida ko'radi: hajm va birlik usta birligida,
 * qisqa nom — qurilish lug'atidan. Seam: `bugungiIshlarManbasi()` (#372) shu mapperdan foydalanadi. Faqat o'qish; «bajarildi» — `naryadBajarildi`.
 */
import { birlikOdam, odamNomi, type Til } from '../qurilish-lugat';
import type { Naryad } from './index';

export type UstaIsh = {
  naryadId: number; versiya: number; raqam: string; holat: Naryad['holat'];
  naryadQatorId: number; nom: string; birlik: string; hajm: number; bajarilgan: number | null; kat: string;
};

/** Naryadning har satri → usta ko'radigan bitta ish (usta birligi bo'lsa — hajm / koef). */
export function ustaIshQatorlari(n: Naryad, til: Til = 'uz'): UstaIsh[] {
  return n.qatorlar.map((q) => {
    const ustaBirlikda = q.usta_birlik != null && q.koef != null && q.koef > 0;
    const k = ustaBirlikda ? (q.koef as number) : 1;
    return {
      naryadId: n.id, versiya: n.versiya, raqam: n.raqam, holat: n.holat, naryadQatorId: q.id, nom: odamNomi(q, til) || q.nom,
      birlik: ustaBirlikda ? (q.usta_birlik as string) : birlikOdam(q.birlik, til), hajm: Number((q.hajm / k).toPrecision(8)),
      bajarilgan: q.bajarilgan_hajm == null ? null : Number((q.bajarilgan_hajm / k).toPrecision(8)), kat: q.kat,
    };
  });
}
