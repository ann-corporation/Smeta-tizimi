/**
 * TUGUN SUMMALARI - daraxtning har RZ / BL tuguni uchun smeta, fakt va F-2 summalari UCHTA shaklda:
 * QQS bilan, ustamali (QQS siz), ustamasiz. Yangi hisob qoidasi YO'Q: ekrandagi bo'lim kartalari
 * (`components/smeta-hujjat/SmetaAnatomiya.tsx`, `bolim`) ishlatadigan AYNAN o'sha yadro chaqiriladi:
 *   kesim   = `svodKorinishKesimi` (smeta, F-2) / `svodFaktKesimi` (fakt; F-2 bor qatorda F-2 narxi) - tugun barglari bo'yicha, `jami` = tugunning o'z summasi
 *   ustama  = `ustamaliHisobla(kesim, koeffitsientlar, podval)` (podvaldagi foizlar; kf QQS ni o'z ichiga oladi: ustamali = SUMMA x kf / 1.12)
 *   uchlik  = `qiymatUchligi` (null = noma'lum, 0 emas; minus qator ishorasi bilan saqlanadi)
 * Qurilma hech narsa hisoblamaydi: server shu natijani beradi (functions/api/obyekt-tugun-summa.ts).
 */
import { svodFaktKesimi, svodKorinishKesimi, type SvodYaxlit } from './svod-yaxlit';
import { qiymatUchligi, ustamaliHisobla, type QiymatUchlik } from './ustamali-summa';
import type { NakrutkaKoeffitsientlar } from '../api/t2-nakrutka';
import type { Podval } from './hisob-yadro';

export type TugunQator = {
  id: number;
  ota_id: number | null;
  /** 'rz' | 'bl' | 'rs' | 'mat' | 'ob' */
  tur: string;
  kat: string | null | undefined;
  /** Smeta summasi (QQS siz, ustamasiz; rz/bl da - serverning yig'indisi). */
  smeta: number | null | undefined;
  /** Fakt summasi (QQS siz). */
  fakt: number | null | undefined;
  /** Tasdiqlangan F-2 summasi (ishorali, aynan). */
  f2: number | null | undefined;
};

export type UstamaKirish = { koeffitsientlar: Partial<NakrutkaKoeffitsientlar> | null; podval: Podval | null; svodYaxlit: SvodYaxlit | null };

export type TugunUchlik = { smeta: QiymatUchlik; fakt: QiymatUchlik; f2: QiymatUchlik };

const BARG = new Set(['rs', 'mat', 'ob']);
const son = (v: number | null | undefined): number | null => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));

/** Ustama manbai bormi: koeffitsientlar yoki podval. Yo'q bo'lsa faqat ustamasiz ko'rsatiladi (qurilmada izoh bilan). */
export const ustamaBor = (u: UstamaKirish | null | undefined): boolean => !!u && (u.podval != null || (u.koeffitsientlar != null && Object.keys(u.koeffitsientlar).length > 0));

/** Har RZ/BL tuguni uchun uchlik. Qator tartibi muhim emas; ota_id zanjiri bo'yicha barglar topiladi (rekursiyasiz - chuqur daraxt xavfsiz). */
export function tugunSummalari(qatorlar: readonly TugunQator[], ustama: UstamaKirish | null): Map<number, TugunUchlik> {
  const bolalar = new Map<number, TugunQator[]>();
  for (const q of qatorlar) if (q.ota_id != null) { const b = bolalar.get(q.ota_id); if (b) b.push(q); else bolalar.set(q.ota_id, [q]); }
  const daraxt = qatorlar.map((q) => ({ id: q.id, ota_id: q.ota_id }));
  const svod = ustama?.svodYaxlit ?? null;
  const bor = ustamaBor(ustama);
  const out = new Map<number, TugunUchlik>();
  for (const tugun of qatorlar) {
    if (tugun.tur !== 'rz' && tugun.tur !== 'bl') continue;
    const barglar: TugunQator[] = [];
    const stek = [...(bolalar.get(tugun.id) ?? [])];
    while (stek.length) { const x = stek.pop()!; if (BARG.has(x.tur)) barglar.push(x); else if (x.tur === 'bl' || x.tur === 'rz') stek.push(...(bolalar.get(x.id) ?? [])); else barglar.push(x); }
    const f = (summa: (x: TugunQator) => number | null) => ({ id: (x: TugunQator) => x.id, kat: (x: TugunQator) => x.kat, summa, smeta: (x: TugunQator) => son(x.smeta) });
    const smetaJami = son(tugun.smeta), faktJami = son(tugun.fakt), f2Jami = son(tugun.f2);
    const kesimlar = {
      smeta: svodKorinishKesimi(daraxt, barglar, f((x) => son(x.smeta)), svod, { jami: smetaJami, masshtab: true, f2: false }),
      fakt: svodFaktKesimi(daraxt, barglar, f((x) => son(x.fakt)), svod, { jami: faktJami }),
      f2: svodKorinishKesimi(daraxt, barglar, f((x) => son(x.f2)), svod, { jami: f2Jami, masshtab: false, f2: true }),
    };
    const uchlik = (k: keyof typeof kesimlar, ustamasiz: number | null): QiymatUchlik => qiymatUchligi(bor ? ustamaliHisobla(kesimlar[k], ustama!.koeffitsientlar, ustama!.podval) : null, ustamasiz);
    out.set(tugun.id, { smeta: uchlik('smeta', smetaJami), fakt: uchlik('fakt', faktJami), f2: uchlik('f2', f2Jami) });
  }
  return out;
}
