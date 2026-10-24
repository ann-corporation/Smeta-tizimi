import { f2AggregatsiyaQator, type F2ExactManbaTugun, type F2ExactPayloadQatori, type F2ExactQator } from '../test02/f2-exact-payload';

/**
 * F2 importning aktga yozish payloadi — HUJJATDAGI SONLAR AYNAN.
 *
 * Egasi qoidasi (2026-10-24): «hujjatdagi sonlar aynan smetaga birikishi kerak; summa chiqmasa
 * aktni yozmaslik — mumkin emas». Shuning uchun bu funksiya endi hech bir qator tufayli
 * butun aktni RAD ETMAYDI. Har holat hujjatning o'z sonlari bilan hal qilinadi, pul hech
 * qachon hajm × narx dan to'qilmaydi:
 *
 *  - summa bor, narx bitta            → hajm, narx, summa — hujjatdagidek;
 *  - summa bor, narx yo'q             → narx = summa / hajm (hujjatning o'z sonlari), summa saqlanadi
 *                                       (aks holda RPC priceIntentionallyAbsent bilan pulni yo'qotardi);
 *  - bir smeta qatoriga turli narxlar → hajm va summa yig'iladi, narx = summa / hajm (o'rtacha);
 *  - summa faqat bo'laklarning bir qismida → summa = hujjatdagi summalar yig'indisi;
 *  - hujjatda summa umuman yo'q       → hajm yoziladi, summa bo'sh (priceIntentionallyAbsent).
 *
 * Ko'rsatish uchun izohlar `exactWriteIzohlar` da. Yagona qolgan himoya — moslashmagan qator
 * (dastur xatosi) va hajmi 0 bo'lib summasi bor qator (narxni hujjatdan chiqarib bo'lmaydi).
 */
export function exactWrite(nodes: F2ExactManbaTugun[], mapping: Map<string, number>): F2ExactPayloadQatori[] {
  if (!nodes.length || nodes.some(n => !mapping.has(n.uid))) throw new Error('Barcha manba qatorlari moslashtirilishi kerak.');
  const rows = f2AggregatsiyaQator(nodes, uid => mapping.get(uid));
  const nolHajm = rows.filter((r) => r.summaBor && r.summa !== 0 && r.hajm === 0 && (r.narx == null || r.barchaNarxlar.length > 1));
  if (nolHajm.length) throw new Error(`${nolHajm.length} ta smeta qatorida hajm 0, lekin summa bor va narx aniq emas — hujjatdagi hajmni tekshiring.`);
  return rows.map(hujjatdagidek);
}

function hujjatdagidek(r: F2ExactQator): F2ExactPayloadQatori {
  if (!r.summaBor) {
    return { qatorId: r.qator_id, certifiedQuantity: r.hajm, certifiedUnitPrice: undefined, certifiedAmount: undefined, priceIntentionallyAbsent: true };
  }
  const narx = r.barchaNarxlar.length === 1 && r.narx != null ? r.narx
    : r.hajm !== 0 ? r.summa / r.hajm
    : r.narx;
  return { qatorId: r.qator_id, certifiedQuantity: r.hajm, certifiedUnitPrice: narx, certifiedAmount: r.summa, priceIntentionallyAbsent: narx == null };
}

/** Yozishni to'xtatmaydigan izohlar: hujjatning o'zidagi noaniqliklar qanday hal qilinganini ko'rsatadi. */
export function exactWriteIzohlar(nodes: F2ExactManbaTugun[], mapping: Map<string, number>): string[] {
  const rows = f2AggregatsiyaQator(nodes.filter((n) => mapping.has(n.uid)), uid => mapping.get(uid));
  const out: string[] = [];
  const turli = rows.filter((r) => r.summaBor && r.barchaNarxlar.length > 1).length;
  const narxsiz = rows.filter((r) => r.summaBor && r.narx == null && r.hajm !== 0).length;
  const qisman = rows.filter((r) => r.summaBor && (r.summasizBolak ?? 0) > 0).length;
  const summasiz = rows.filter((r) => !r.summaBor && r.narx != null).length;
  if (turli) out.push(`${turli} ta smeta qatoriga hujjatda turli narxlar tushdi — hajm va summa yig'ildi, narx = summa / hajm.`);
  if (narxsiz) out.push(`${narxsiz} ta qatorda hujjatda summa bor, narx yo'q — narx = summa / hajm, summa hujjatdagidek.`);
  if (qisman) out.push(`${qisman} ta smeta qatorida summa hujjatda faqat bo'laklarning bir qismida bor — summa hujjatdagi summalar yig'indisi.`);
  if (summasiz) out.push(`${summasiz} ta smeta qatorida hujjatda summa yo'q — hajm yoziladi, summa bo'sh qoladi.`);
  return out;
}
