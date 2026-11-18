/**
 * Kirim narxi: omborchi odatda narxni QQS BILAN biladi. Kanonik saqlash — QQS SIZ (tizim qoidasi); QQS stavkasi yagona konstantadan (nds.ts).
 * Sof funksiyalar: web, Android, Telegram, Jarvis va server bir xil hisoblaydi. Matndan: «50 ming QQS bilan», «ndssiz 45 ming», «цена 1200 с НДС».
 */
import { NDS_SUKUT_FOIZ, qqsBilan } from '../hisob-yadro/nds';
import { yaxlit2 } from '../hisob-yadro/yaxlit';

export type NarxRejim = 'bilan' | 'siz';


/** Kiritilgan narx (rejim bo'yicha) -> kanonik QQS siz narx. Yaroqsiz -> null. */
export function narxSizga(qiymat: number | null | undefined, rejim: NarxRejim, foiz: number = NDS_SUKUT_FOIZ): number | null {
  if (qiymat == null || !Number.isFinite(qiymat) || qiymat <= 0) return null;
  return yaxlit2(rejim === 'bilan' ? qiymat / (1 + foiz / 100) : qiymat);
}
/** Kanonik QQS siz narx -> QQS bilan. */
export const narxBilanga = (siz: number | null | undefined, foiz: number = NDS_SUKUT_FOIZ): number | null => (siz == null ? null : qqsBilan(siz, foiz));
export const narxRejimTekshir = (v: unknown): NarxRejim | null => (v === 'bilan' || v === 'siz' ? v : null);

const L = '(?<![\\p{L}])', R = '(?![\\p{L}])';
const BILAN = new RegExp(`${L}(?:(?:qqs|nds|ндс)\\s*(?:bilan|билан)|(?:с|c)\\s*(?:ндс|qqs|nds)|ндс\\s*включ[\\p{L}]*|qqs\\s*ichida)${R}`, 'iu');
const SIZ = new RegExp(`${L}(?:(?:qqs|nds|ндс)\\s*-?\\s*(?:siz|сиз)|(?:без|bez)\\s*(?:ндс|qqs|nds)|ndssiz|qqssiz|qqs\\s*qo['ʻ’\`]?shilmagan)${R}`, 'iu');

/** Matnda QQS rejimi aniq aytilganmi: «bilan»/«siz»/null (aytilmagan). */
export function narxRejimMatndan(matn: string): { rejim: NarxRejim | null; qolgan: string } {
  const s = String(matn ?? '');
  const z = SIZ.exec(s); if (z) return { rejim: 'siz', qolgan: s.replace(z[0], ' ') };
  const b = BILAN.exec(s); if (b) return { rejim: 'bilan', qolgan: s.replace(b[0], ' ') };
  return { rejim: null, qolgan: s };
}

const KO_PAYTIRGICH: [RegExp, number][] = [[/^(?:mln|million\p{L}*|млн|миллион\p{L}*)$/iu, 1_000_000], [/^(?:ming\p{L}*|тыс\p{L}*|k)$/iu, 1000]];
/** «50 ming», «1,2 mln», «1 200 000», «45000» -> son (ko'paytiruvchi bilan). */
export function narxSoni(raqam: string, soz?: string | null): number | null {
  const n = Number(String(raqam).replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  const k = soz ? KO_PAYTIRGICH.find(([re]) => re.test(soz))?.[1] ?? 1 : 1;
  return yaxlit2(n * k);
}
