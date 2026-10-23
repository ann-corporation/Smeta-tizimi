/**
 * F2 PODVAL — qo'lda qatorlar (bojxona, shef-montaj). A5-1 (koordinator 2026-10-24).
 *
 * Podvaldagi bunday satr (СУМ, № va shifr yo'q) ustama hisob satri emas — haqiqiy pul: smetada shu nom bilan, shu
 * summada qator bo'lishi mumkin. Tartib: (1) smetada NOM O'XSHASH va SUMMA aynan (±1) bo'lgan YAGONA qator bo'lsa —
 * ◐ BOG'LASH taklifi (hajm 1; qo'shimcha emas); (2) bo'lmasa taklif yo'q: operator mavjud «qo'shimcha» oqimidan foydalanadi.
 * Avtomatik yozish yo'q; dvigatel podval qatorlarini ko'rmaydi (nom bo'yicha tasodifiy bog'lamasligi uchun).
 */
import type { F2Tugun } from '../smeta-anatomiya/f2';
import { kalit } from '../smeta-anatomiya/matn';
import type { IshJoyi } from './ishJoyi';

/** Dvigatelga beriladigan daraxt: podval razdeli chiqarib tashlanadi. */
export const dvigatelDaraxti = (daraxt: readonly F2Tugun[]): F2Tugun[] => daraxt.filter((t) => !t.podval);

const TOXTASH = new Set(['НДС', 'ДЛЯ', 'ПО', 'ЕГО', 'ТОЛЬКО']);
const sozlar = (nom: string): Set<string> => {
  const s = new Set<string>();
  for (const w of kalit(nom).replace(/[^A-ZА-ЯЁ0-9]+/g, ' ').split(' ')) if (w.length >= 4 && !TOXTASH.has(w) && !/^\d+$/.test(w)) s.add(w);
  return s;
};

export interface PodvalSmetaQator { id: number; tur: string | null; nom: string | null; summa: number | null }

/** Podval qatori uchun smetadagi mos qator id si (yagona bo'lsa), aks holda null. */
export function podvalMosQator(podval: Pick<F2Tugun, 'nom' | 'summa'>, smeta: readonly PodvalSmetaQator[]): number | null {
  if (podval.summa == null) return null;
  const f2 = sozlar(podval.nom);
  if (!f2.size) return null;
  const mos = smeta.filter((q) => {
    if (q.id <= 0 || q.tur === 'rz' || q.summa == null || Math.abs(q.summa - podval.summa!) > 1) return false;
    const s = sozlar(q.nom ?? '');
    if (!s.size) return false;
    // Smeta nomining ma'noli so'zlari F2 nomida ham bor (yoki aksincha).
    const [kichik, katta] = s.size <= f2.size ? [s, f2] : [f2, s];
    return [...kichik].every((w) => katta.has(w));
  });
  return mos.length === 1 ? mos[0].id : null;
}

/** Bog'lanmagan podval qatorlariga ◐ taklif qo'shadi (mavjud bog'lanishlar tegilmaydi). */
export function podvalTaklifQosh(ij: IshJoyi, qatorlar: readonly F2Tugun[], smeta: readonly PodvalSmetaQator[]): IshJoyi {
  const bog = new Map(ij.bog);
  let ozgardi = false;
  for (const t of qatorlar) {
    if (!t.podval || t.tur === 'rz' || bog.has(t.uid) || ij.otkaz.has(t.uid)) continue;
    const id = podvalMosQator(t, smeta);
    if (id != null) { bog.set(t.uid, { qatorId: id, holat: 'taklif', usul: 'podval_summa' }); ozgardi = true; }
  }
  return ozgardi ? { bog, otkaz: ij.otkaz } : ij;
}
