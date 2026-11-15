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
import { yaxlit2, type Podval } from './hisob-yadro';
import { tiyin } from './nakopitelniy-svod';

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
function tugunHisob(qatorlar: readonly TugunQator[], ustama: UstamaKirish | null): { obyekt: TugunUchlik; nodes: Map<number, TugunUchlik>; bolalar: Map<number, TugunQator[]> } {
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
  // OBYEKT jami: butun daraxt barglari bo'yicha BIR marta (jami = razdellar summasi) - veb obyekt kartasi bilan bir xil yadro.
  const barglarJami = qatorlar.filter((x) => x.tur !== 'rz' && x.tur !== 'bl');
  const rzlar = qatorlar.filter((x) => x.tur === 'rz');
  const yig = (k: 'smeta' | 'fakt' | 'f2'): number | null => (rzlar.some((x) => son(x[k]) != null) ? rzlar.reduce((t, x) => t + (son(x[k]) ?? 0), 0) : null);
  const fo = (summa: (x: TugunQator) => number | null) => ({ id: (x: TugunQator) => x.id, kat: (x: TugunQator) => x.kat, summa, smeta: (x: TugunQator) => son(x.smeta) });
  const jS = yig('smeta'), jF = yig('fakt'), jA = yig('f2');
  const ks = {
    smeta: svodKorinishKesimi(daraxt, barglarJami, fo((x) => son(x.smeta)), svod, { jami: jS, masshtab: true, f2: false }),
    fakt: svodFaktKesimi(daraxt, barglarJami, fo((x) => son(x.fakt)), svod, { jami: jF }),
    f2: svodKorinishKesimi(daraxt, barglarJami, fo((x) => son(x.f2)), svod, { jami: jA, masshtab: false, f2: true }),
  };
  const ou = (k: keyof typeof ks, j: number | null): QiymatUchlik => qiymatUchligi(bor ? ustamaliHisobla(ks[k], ustama!.koeffitsientlar, ustama!.podval) : null, j);
  return { obyekt: { smeta: ou('smeta', jS), fakt: ou('fakt', jF), f2: ou('f2', jA) }, nodes: out, bolalar };
}

/**
 * TIYINGACHA TAQSIMLASH (egasi qoidasi: "summa tiyinigacha"). Ustamali va QQS bilan shakllari har tugunda alohida yaxlitlanadi (ROUND 2),
 * shuning uchun bolalar yig'indisi ota qiymatidan bir necha tiyinga farq qilishi mumkin. Bu yerda ota qiymati BIR marta yaxlitlanadi
 * (obyekt: butun daraxt yadro natijasi), so'ng tiyinlar bolalarga eng katta kasr qoldig'i (Hamilton) usulida taqsimlanadi:
 * obyekt -> RZ -> BL, rekursiv. Ota o'z barg qatorlariga ega bo'lsa, ularning ulushi alohida "qoldiq" o'rnida turadi (bolalar yig'indisi + qoldiq = ota).
 * Ishora hech qachon almashmaydi (musbat kasr taxmin pastga yaxlitlanganda >= 0, manfiy <= 0 qoladi); ma'lum bo'lmagan (null) qiymat yoki
 * nolga teng og'irlik yig'indisi bo'lsa taqsimlanmaydi - tugun o'z qiymatida qoladi.
 */
export function hamilton(jami: number, ogirliklar: readonly number[]): number[] | null {
  const T = tiyin(jami), w = ogirliklar.map((x) => tiyin(x)), n = w.length;
  const W = w.reduce((a, b) => a + b, 0);
  if (!n || W === 0) return null;
  const ideal = w.map((x) => (T * x) / W);
  const baza = ideal.map((x) => Math.floor(x));
  const qoldiq = T - baza.reduce((a, b) => a + b, 0);
  if (qoldiq < 0 || qoldiq > n) return null;
  const tartib = ideal.map((x, i) => ({ i, r: x - baza[i] })).sort((a, b) => b.r - a.r || a.i - b.i);
  for (let k = 0; k < qoldiq; k++) baza[tartib[k].i] += 1;
  // Ota va bolalar yig'indisi orasidagi farq yaxlitlash darajasidan (har bola uchun bir necha tiyin) katta bo'lsa - bu yaxlitlash emas, haqiqiy farq: yashirilmaydi, taqsimlanmaydi.
  if (Math.abs(T - W) > 5 * n + 5) return null;
  return baza;
}

type Shakl = 'qqsBilan' | 'ustamali';
const KOR = ['smeta', 'fakt', 'f2'] as const;

function taqsimla(obyekt: TugunUchlik, nodes: Map<number, TugunUchlik>, qatorlar: readonly TugunQator[], bolalar: Map<number, TugunQator[]>): void {
  const tugunBolalar = (id: number | null): number[] => (id == null ? qatorlar.filter((q) => q.ota_id == null && q.tur === 'rz') : bolalar.get(id) ?? []).filter((q) => q.tur === 'rz' || q.tur === 'bl').map((q) => q.id);
  for (const k of KOR) for (const sh of ['qqsBilan', 'ustamali'] as Shakl[]) {
    const stek: Array<{ ota: number | null; qiymat: number | null }> = [{ ota: null, qiymat: obyekt[k][sh] }];
    while (stek.length) {
      const { ota, qiymat } = stek.pop()!;
      const ids = tugunBolalar(ota).filter((id) => nodes.has(id));
      if (qiymat == null || !ids.length) continue;
      const own = ids.map((id) => nodes.get(id)![k][sh]);
      if (own.some((x) => x == null)) { for (const id of ids) stek.push({ ota: id, qiymat: nodes.get(id)![k][sh] }); continue; }
      const ownN = own as number[];
      const sum = ownN.reduce((a: number, b: number) => a + b, 0);
      // Ota o'z barg qatorlariga ega bo'lsa (razdel ostida bevosita resurslar) - ularning ulushi alohida qoldiq o'rnida; yo'q bo'lsa bolalar yig'indisi = ota.
      const ozBarg = (ota == null ? qatorlar.filter((q) => q.ota_id == null) : bolalar.get(ota) ?? []).some((q) => q.tur !== 'rz' && q.tur !== 'bl');
      const w = ozBarg ? [...ownN, yaxlit2(qiymat - sum)] : ownN;
      const r = hamilton(qiymat, w);
      if (r) ids.forEach((id, i) => { const t = nodes.get(id)!; nodes.set(id, { ...t, [k]: { ...t[k], [sh]: yaxlit2(r[i] / 100) } }); });
      for (const id of ids) stek.push({ ota: id, qiymat: nodes.get(id)![k][sh] });
    }
  }
}

export type TugunDaraxti = { obyekt: TugunUchlik; tugunlar: Map<number, TugunUchlik> };

/** Obyekt jami + har RZ/BL tuguni; ustamali va QQS bilan shakllari tiyingacha taqsimlangan (ota = bolalar yig'indisi). */
export function tugunDaraxti(qatorlar: readonly TugunQator[], ustama: UstamaKirish | null): TugunDaraxti {
  const { obyekt, nodes, bolalar } = tugunHisob(qatorlar, ustama);
  taqsimla(obyekt, nodes, qatorlar, bolalar);
  return { obyekt, tugunlar: nodes };
}

export const tugunSummalari = (qatorlar: readonly TugunQator[], ustama: UstamaKirish | null): Map<number, TugunUchlik> => tugunDaraxti(qatorlar, ustama).tugunlar;

/** Taqsimlashdan OLDINGI (har tugun alohida yaxlitlangan) qiymatlar - faqat solishtirish/test uchun. */
export const tugunSummalariXom = (qatorlar: readonly TugunQator[], ustama: UstamaKirish | null): Map<number, TugunUchlik> => tugunHisob(qatorlar, ustama).nodes;
