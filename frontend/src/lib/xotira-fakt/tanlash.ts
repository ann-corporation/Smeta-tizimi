/**
 * «Xotiradan fakt» — qator miqdori maydoni va nomzod tanlash (sof mantiq; UI shu yerdan oladi).
 * Miqdor maydoni: son / % / «hammasi». Son so'rovdagi birlikda (m3) — smeta birligiga (100М3) nomzod bo'yicha o'tkaziladi.
 */
import type { XotiraNomzod } from './moslash';
import type { XotiraQator } from './parse';
import { miqdorOqi } from './parse';
import { hajmniHisobla } from './savat';

const yaxlit = (x: number) => Math.round(x * 1e6) / 1e6;

/** Matndan ajratilgan miqdorning maydon uchun boshlang'ich matni (birliksiz): «120», «50%», «hammasi». */
export function miqdorBoshlang(q: XotiraQator): string {
  if (q.turi === 'son' && q.qiymat != null) return String(q.qiymat);
  if (q.turi === 'foiz' && q.qiymat != null) return `${q.qiymat}%`;
  if (q.turi === 'hammasi') return 'hammasi';
  return '';
}

/**
 * Maydondagi miqdor + tanlangan nomzod → fakt hajmi (smeta birligida). null — hisoblab bo'lmadi.
 * Qo'lda o'zgartirilgan son so'rovdagi birlikda deb olinadi va asl so'rov nisbati bilan smeta birligiga o'tkaziladi;
 * so'rovda son bo'lmagan bo'lsa (foiz/hammasi/yo'q) — son smeta birligida.
 */
export function nomzodHajmi(q: XotiraQator, n: XotiraNomzod, maydon: string): number | null {
  const m = miqdorOqi(maydon);
  if (m.turi === 'son' && m.qiymat != null) {
    const nisbat = q.turi === 'son' && q.qiymat && n.miqdor != null ? n.miqdor / q.qiymat : 1;
    return yaxlit(m.qiymat * nisbat);
  }
  return hajmniHisobla(m.turi, m.qiymat, n);
}
