/**
 * TENDER puli: egasi qoidasi — asosiy raqam QQS BILAN (12 %), yonida QQS siz; noma'lum — null («kiritilmagan»), 0 emas.
 * Narxlar bazada NDS siz saqlanadi. Hisob-kitob YAGONA yadrodan (`hisob-yadro`): yangi yaxlitlash/QQS formulasi yozilmaydi.
 */
import { NDS_SUKUT_FOIZ, ndsFoizTozala, qatorSumma, qqsBilan, qqsSumma, yaxlit2, yaxlit2N } from '../hisob-yadro';

export const TENDER_QQS_SUKUT = NDS_SUKUT_FOIZ;
/** Qator summasi (NDS siz) = ROUND(miqdor × narx, 2); biri noma'lum — null. Yagona yadrodan. */
export { qatorSumma };

export type PulJuft = { qqsBilan: number | null; qqsSiz: number | null; qqs: number | null; foiz: number | null };

/** NDS siz summa + stavkadan [QQS bilan (asosiy), QQS siz, QQS summasi]. Stavka berilmasa tender sukuti (12) EMAS — noma'lum. */
export function pulJuft(qqsSizSumma: number | null | undefined, foiz: number | null | undefined): PulJuft {
  const f = ndsFoizTozala(foiz);
  const siz = yaxlit2N(qqsSizSumma);
  return { qqsBilan: f == null ? null : qqsBilan(siz, f), qqsSiz: siz, qqs: f == null ? null : qqsSumma(siz, f), foiz: f };
}

/** Byudjetga nisbatan tejam, ikkalasi QQS bilan. Biri noma'lum — null (0 emas). Musbat = tejam, manfiy = oshib ketdi. */
export function tejam(byudjetQqsBilan: number | null | undefined, golibQqsBilan: number | null | undefined): { summa: number; foiz: number | null } | null {
  if (byudjetQqsBilan == null || golibQqsBilan == null || !Number.isFinite(byudjetQqsBilan) || !Number.isFinite(golibQqsBilan)) return null;
  const summa = yaxlit2(byudjetQqsBilan - golibQqsBilan);
  return { summa, foiz: byudjetQqsBilan > 0 ? yaxlit2((summa / byudjetQqsBilan) * 100) : null };
}
