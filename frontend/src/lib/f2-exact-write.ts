import { f2AggregatsiyaQator, f2ExactPayloadQur, type F2ExactManbaTugun } from '../test02/f2-exact-payload';

/**
 * T2-F2-IMPORT-NARXSIZ-BLOK-001 — bu funksiya avval HAR QANDAY narxi
 * nol/yo'q qator uchraganda BUTUN faylni rad etardi:
 *
 *   if (nodes.some(n => n.narx == null || n.narx <= 0 || ...)) throw ...
 *
 * Amalda bu F2 importini butunlay o'lik qilgan edi. Haqiqiy Amfiteatr
 * faylida 1054 qatordan 164 tasi aynan shunday: `000003` ЗАТРАТЫ ТРУДА
 * МАШИНИСТОВ (782/782 = 100% narxsiz -- mashinist soatlari mashina
 * narxi ichida, alohida puli yo'q), `009219` ВОДА, `035567` ОЧЕС
 * ЛЬНЯНОЙ. Ular SMETAning o'zida ham narxsiz -- ya'ni bu buzuq
 * ma'lumot emas, tuzilmaning normal qismi. Natijada 2 ta import
 * (06.09 va 08.09) "review" bosqichida qotib qolgan, `t2_akt_qator`
 * butun bazada 0 qator -- shuning uchun FAKT/F2 hamma joyda nol.
 *
 * Narxsiz qator uchun to'g'ri yo'l ALLAQACHON qurilgan va testlar bilan
 * qoplangan: `f2AggregatsiyaQator` narxni `undefined` qiladi,
 * `f2ExactPayloadQur` `priceIntentionallyAbsent: true` qo'yadi,
 * `t2_akt_yarat_v2` esa uni `provenance_status='price_intentionally_
 * absent'` bilan yozadi (hajm yoziladi, pul yozilmaydi). Ya'ni bu
 * to'siq o'zi chaqiradigan kontraktga zid edi.
 *
 * Haqiqiy himoyalar SAQLANADI: moslashmagan qator, bir qatorga ikki xil
 * narx, narxi bor-u summasi yo'q (NEEDS_REVIEW) va summasi bor-u narxi
 * yo'q (AMOUNT_WITHOUT_PRICE -- RPC uni null qilib pulni yo'qotardi).
 */
export function exactWrite(nodes: F2ExactManbaTugun[], mapping: Map<string, number>) {
  if (!nodes.length || nodes.some(n => !mapping.has(n.uid))) throw new Error('Barcha manba qatorlari moslashtirilishi kerak.');
  const rows = f2AggregatsiyaQator(nodes, uid => mapping.get(uid));
  if (rows.some(r => r.barchaNarxlar.length > 1)) throw new Error('Bir smeta qatoriga turli narxlar tushdi. Bog‘lanishni tekshiring.');
  const result = f2ExactPayloadQur(rows);
  if (!result.ok) {
    if (result.sabab === 'CONFLICTING_PRICES') {
      throw new Error(`${result.qatorIdlar.length} ta smeta qatoriga turli F2 narxlari tushdi. Bog‘lanish yoki hujjat davrlarini tekshiring.`);
    }
    throw new Error(result.sabab === 'AMOUNT_WITHOUT_PRICE'
      ? `${result.noaniqSoni} qatorda summa bor, lekin birlik narxi yo‘q — bunday qator yozilsa summa yo‘qoladi. Narxni to‘ldiring yoki manbani tekshiring.`
      : `${result.noaniqSoni} ta smeta qatorida narx bor, lekin F2 summasi yo‘q yoki bo‘laklarning faqat bir qismida bor — summa to‘qilmaydi. Yozish to‘xtatildi.`);
  }
  return result.qatorlar;
}
