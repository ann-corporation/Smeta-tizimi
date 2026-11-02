/**
 * Oylik F2 paketi uchun faqat o'qish: obyektning smeta daraxti, shu oyning F2 tafsilot qatorlari va hujjat konteksti
 * (ustama koeffitsientlari, podval, imzo). Hech narsa yozilmaydi; mavjud o'qishlar (F2 tarixi bilan bir xil) chaqiriladi.
 */
import { sbT2DaraxtOl, type T2Qator } from './supabase';
import { sbT2F2TafsilotOl, type F2Tafsilot } from './t2-narx';
import { T2_DARAXT_USTUNLARI } from './t2-daraxt-ustunlar';
import { f2HujjatKonteksti, type F2HujjatKonteksti } from './f2-hujjat-kontekst';
import { shartnomaSvodOl } from './t2-nakopitelniy';
import type { SvodShartnoma } from '../lib/nakopitelniy-svod';

export type OyObyektMalumot = { smeta: T2Qator[]; tafsilot: F2Tafsilot[]; kontekst: F2HujjatKonteksti };

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
