/**
 * Oylik F2 paketi uchun faqat o'qish: obyektning smeta daraxti, shu oyning F2 tafsilot qatorlari va hujjat konteksti
 * (ustama koeffitsientlari, podval, imzo). Hech narsa yozilmaydi; mavjud o'qishlar (F2 tarixi bilan bir xil) chaqiriladi.
 */
import { sbOqi, sbT2DaraxtOl, type T2Qator } from './supabase';
import { aktPodvallariniOl } from './t2-akt-podval';
import { aktPodvalXaritasi, type AktPodvalQator } from '../lib/akt-podval';
import type { PereraschetAktQator } from '../lib/f2-pereraschet';
import { sbT2F2TafsilotOl, type F2Tafsilot } from './t2-narx';
import { T2_DARAXT_USTUNLARI } from './t2-daraxt-ustunlar';
import { f2HujjatKonteksti, type F2HujjatKonteksti } from './f2-hujjat-kontekst';
import { shartnomaSvodOl } from './t2-nakopitelniy';
import type { SvodShartnoma } from '../lib/nakopitelniy-svod';

export type OyObyektMalumot = { smeta: T2Qator[]; tafsilot: F2Tafsilot[]; kontekst: F2HujjatKonteksti };

/* ───────────── F2 portfeli (egasi 2026-11-05): obyektning BARCHA oylari, F2 tarixi bilan bir xil o'qishlar ───────────── */

export type PortfelObyektMalumot = OyObyektMalumot & {
  /** Akt id → `t2_akt_qator` qatorlari (raw_snapshot bilan — storno bloklari). */
  aktQatorlar: Map<number, PereraschetAktQator[]>;
  /** `akt:blok` → hujjat podvali (`t2_akt_podval`). */
  podvallar: Map<string, AktPodvalQator>;
};

/**
 * Bir obyekt: smeta + barcha F2 tafsilot + kontekst + akt podvallari + akt qatorlari (faqat berilgan aktlar). Faqat o'qish.
 * Biror o'qish xato/to'liq emas bo'lsa — throw (yarim ma'lumotdan summa hisoblanmaydi; podval o'qilmasa jim smeta podvaliga o'tilmaydi).
 */
export async function portfelObyektOl(kompaniyaId: number, obyektId: number, aktIdlar: readonly number[]): Promise<PortfelObyektMalumot> {
  const ids = [...new Set(aktIdlar)].filter((x) => Number.isSafeInteger(x) && x > 0);
  const bolaklar: number[][] = [];
  for (let i = 0; i < ids.length; i += 100) bolaklar.push(ids.slice(i, i + 100));
  const [daraxt, kontekst, tafsilot, pv, ...aq] = await Promise.all([
    sbT2DaraxtOl(obyektId, T2_DARAXT_USTUNLARI),
    f2HujjatKonteksti(kompaniyaId, obyektId),
    sbT2F2TafsilotOl({ obyektId, tur: 'f2' }),
    aktPodvallariniOl(obyektId),
    ...bolaklar.map((b) => sbOqi<PereraschetAktQator & { akt_id: number }>({
      jadval: 't2_akt_qator', filtr: `obyekt_id=eq.${obyektId}&akt_id=in.(${b.join(',')})`,
      ustunlar: 'akt_id,qator_id,hajm,certified_quantity,certified_unit_price,certified_amount,raw_snapshot', limit: 100000,
    })),
  ]);
  if (!daraxt.ok || daraxt.toliq === false) throw new Error('SMETA_OQILMADI');
  if (!tafsilot.ok || tafsilot.toliq === false) throw new Error('F2_TAFSILOT_OQILMADI');
  if (kontekst.xato) throw new Error(`USTAMA_OQILMADI: ${kontekst.xato}`);
  if (!pv.ok) throw new Error('PODVAL_OQILMADI');
  if (aq.some((r) => !r.ok || r.toliq === false)) throw new Error('AKT_QATOR_OQILMADI');
  const aktQatorlar = new Map<number, PereraschetAktQator[]>();
  for (const r of aq) for (const q of r.qatorlar ?? []) {
    const l = aktQatorlar.get(q.akt_id);
    if (l) l.push(q); else aktQatorlar.set(q.akt_id, [q]);
  }
  return {
    smeta: (daraxt.qatorlar ?? []) as unknown as T2Qator[], tafsilot: (tafsilot.qatorlar ?? []) as F2Tafsilot[], kontekst,
    aktQatorlar, podvallar: aktPodvalXaritasi(pv.podvallar),
  };
}

/** Bir obyekt: smeta + F2 tafsilot (barcha oylar — `oy` filtri har aktning o'z oyi bilan chaqiriladi) + kontekst. Xato — throw. */
export async function oyObyektOl(kompaniyaId: number, obyektId: number, oylar: readonly string[]): Promise<OyObyektMalumot> {
  const [daraxt, kontekst, ...tafsilotlar] = await Promise.all([
    sbT2DaraxtOl(obyektId, T2_DARAXT_USTUNLARI),
    f2HujjatKonteksti(kompaniyaId, obyektId),
    ...oylar.map((oy) => sbT2F2TafsilotOl({ obyektId, tur: 'f2', oy })),
  ]);
  if (!daraxt.ok) throw new Error('SMETA_OQILMADI');
  if (tafsilotlar.some((d) => !d.ok)) throw new Error('F2_TAFSILOT_OQILMADI');
  // Ustama/podval o'qilmasa paket jimgina standart podval yoki ustamasiz hisoblanmaydi — sabab bilan to'xtaydi.
  if (kontekst.xato) throw new Error(`USTAMA_OQILMADI: ${kontekst.xato}`);
  const tafsilot = tafsilotlar.flatMap((d) => (d.qatorlar ?? []) as F2Tafsilot[]);
  return { smeta: (daraxt.qatorlar ?? []) as unknown as T2Qator[], tafsilot, kontekst };
}

/** Forma-3 (akt-sverkadagi «Продажа» asosida) uchun shartnoma svodi. Xato — null (paket F3 siz yig'iladi, foydalanuvchiga aytiladi). */
export async function f3SvodOl(kompaniyaId: number): Promise<SvodShartnoma[] | null> {
  const r = await shartnomaSvodOl(kompaniyaId);
  return r.ok ? r.natija.shartnomalar : null;
}
