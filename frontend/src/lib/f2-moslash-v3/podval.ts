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

export interface PodvalSmetaQator { id: number; tur: string | null; nom: string | null; summa: number | null; hajm?: number | null; narx?: number | null }

/** Smeta qatorining summasi: yozilgan summa, bo'lmasa hajm × narx (siz qo'shgan qatorlarda summa ustuni bo'sh bo'lishi mumkin). */
const smetaSumma = (q: PodvalSmetaQator): number | null =>
  q.summa != null ? Number(q.summa) : q.hajm != null && q.narx != null ? Number(q.hajm) * Number(q.narx) : null;

/** Faqat summa bo'yicha taklif uchun pastki chegara: kichik summalar tasodifan teng bo'lishi mumkin. */
const SUMMA_YAGONA_MIN = 1_000_000;

/**
 * Podval qatori uchun smetadagi mos qator id si (yagona bo'lsa), aks holda null.
 * (1) nom o'xshash + summa aynan (±1) yagona qator; (2) bo'lmasa — butun smetada summasi aynan (±1) teng YAGONA qator
 * (egasi 2026-10-25: «summa teng bo'lsa — 4 046 929 242,85 ↔ Таможенные расходы»). Faqat ◐ taklif — operator tasdiqlaydi.
 */
export function podvalMosQator(podval: Pick<F2Tugun, 'nom' | 'summa'>, smeta: readonly PodvalSmetaQator[]): number | null {
  if (podval.summa == null) return null;
  const summaTeng = smeta.filter((q) => {
    const s = q.id > 0 && q.tur !== 'rz' ? smetaSumma(q) : null;
    return s != null && Math.abs(s - podval.summa!) <= 1;
  });
  const f2 = sozlar(podval.nom);
  const mos = f2.size ? summaTeng.filter((q) => {
    const s = sozlar(q.nom ?? '');
    if (!s.size) return false;
    // Smeta nomining ma'noli so'zlari F2 nomida ham bor (yoki aksincha).
    const [kichik, katta] = s.size <= f2.size ? [s, f2] : [f2, s];
    return [...kichik].every((w) => katta.has(w));
  }) : [];
  if (mos.length === 1) return mos[0].id;
  if (!mos.length && summaTeng.length === 1 && Math.abs(podval.summa) >= SUMMA_YAGONA_MIN) return summaTeng[0].id;
  return null;
}

/**
 * Podval qatori bog'langan smeta qatori shu aktning ASOSIY qismida ham olinganmi (masalan shef-montaj 0,5 bilan
 * yuqorida bor, podvalda esa izoh sifatida takrorlangan) — takrorlovchi F2 qatorlari uid lari. Bo'sh — takror yo'q.
 * Takror bo'lsa operator podval qatorini «faqat izoh (aktga kirmaydi)» qiladi — summa ikki marta sanalmaydi.
 */
export function podvalTakrori(t: Pick<F2Tugun, 'uid' | 'podval'>, qatorlar: readonly F2Tugun[], ij: IshJoyi): string[] {
  if (!t.podval || ij.otkaz.has(t.uid)) return [];
  const b = ij.bog.get(t.uid);
  if (!b) return [];
  return qatorlar.filter((x) => !x.podval && x.uid !== t.uid && !ij.otkaz.has(x.uid) && ij.bog.get(x.uid)?.qatorId === b.qatorId).map((x) => x.uid);
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
