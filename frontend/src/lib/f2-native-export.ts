import type { ProgressLineResult } from './construction-document-control';
import type { F2NativePayloadRow } from './f2-native-preparation';
import type { QatorHolat } from '../api/t2-fakt';
import { RasmiyVaraq, hujjatFaylNomi, imzoTomonlari, rasmiyKitob, yaxlit2, type ImzoNomlar, type RasmiyUstun } from './hujjat-yozuvchi';
import { davrMatni } from './nakopitelniy-vedomost-export';
import type { NakrutkaKoeffitsientlar } from '../api/t2-nakrutka';
import { NAKRUTKA_KATLAR, kOplate, kategoriyaKf, nakrutkaKat, nakrutkaPodvaliYoz, podvalKfQatorlari, type KatSummalar } from './nakrutka-podval';
import { podvalgaKoefQoy, type Podval } from './nakrutka-konstruktor';

/**
 * Native F2 qoralamasini mavjud rasmiy Excel proyeksiyasiga o‘giradi.
 * Bu adapter hisob-kitob manbai emas: u certifiedAmount ni qayta
 * hisoblamaydi va smeta narxini source F2 narxi o‘rniga qo‘ymaydi.
 */
export function f2NativeExportRowsQur(qatorlar: readonly QatorHolat[], certified: readonly F2NativePayloadRow[]): ProgressLineResult[] {
  const holat = new Map(qatorlar.map((row) => [row.qator_id, row]));
  const nullableNumber = (value: unknown): number | null => {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  return certified.flatMap((current) => {
    const row = holat.get(current.qatorId);
    if (!row) return [];
    const baselineQuantity = nullableNumber(row.smeta_hajm);
    const baselineReferencePrice = nullableNumber(row.smeta_narx);
    const previousQuantity = Number(row.f2_hajm) || 0;
    const previousCertifiedValue = Number.isFinite(Number(row.f2_summa)) ? Number(row.f2_summa) : null;
    const currentCertifiedValue = current.certifiedAmount ?? null;
    const calculated = current.certifiedUnitPrice == null ? null : current.certifiedQuantity * current.certifiedUnitPrice;
    const approvedEntitlementQuantity = baselineQuantity === null ? null : baselineQuantity;
    const cumulativeQuantity = previousQuantity + current.certifiedQuantity;
    const remainingQuantity = nullableNumber(row.qoldiq_hajm);
    const cumulativeValue = previousCertifiedValue == null || currentCertifiedValue == null ? null : previousCertifiedValue + currentCertifiedValue;
    const remainingValue = nullableNumber(row.qoldiq_summa);
    const warnings = [
      ...(calculated != null && currentCertifiedValue != null && Math.abs(calculated - currentCertifiedValue) > 0.005 ? ['PRICE_VARIANCE' as const] : []),
      ...(baselineQuantity === null ? ['MISSING_BASELINE_QUANTITY' as const] : []),
      ...(baselineReferencePrice === null ? ['MISSING_BASELINE_PRICE' as const] : []),
    ];
    return [{
      lineId: String(current.qatorId), sectionId: String(row.obyekt_id), description: row.nom, unit: row.birlik || '',
      baselineQuantity, baselineReferencePrice,
      approvedChangeQuantity: 0, approvedEntitlementQuantity,
      previousQuantity, currentQuantity: current.certifiedQuantity, cumulativeQuantity,
      remainingQuantity,
      previousValue: previousCertifiedValue, currentValue: currentCertifiedValue,
      cumulativeValue,
      remainingValue,
      previousCertifiedValue, currentCertifiedValue,
      cumulativeCertifiedValue: previousCertifiedValue == null || currentCertifiedValue == null ? null : previousCertifiedValue + currentCertifiedValue,
      currentF2ValuationPrice: current.certifiedUnitPrice ?? null, f2ValuationValue: calculated,
      actualValue: null, variance: calculated == null || currentCertifiedValue == null ? null : currentCertifiedValue - calculated,
      changeKinds: [], revisionIds: [], warnings,
    }];
  });
}

// ═══════════ Проект акта формы № 2 — rasmiy hujjat (P3, H1–H9) ═══════════

export type F2QoralamaOpsiya = {
  obyektNom: string;
  /** Hisobot davri "2026-09-01" yoki "2026-09". */
  davr: string;
  imzo?: ImzoNomlar;
  shartnoma?: string | null;
  ndsFoiz?: number | null;
  /** Obyekt nakrutka foizlari — к оплате = прямые × Kf. Berilmasa 0 %. */
  nakrutka?: Partial<NakrutkaKoeffitsientlar> | null;
  /** Maxsus nakrutka podvali (konstruktor) — null: standart kaskad. */
  podval?: Podval | null;
};

/** Yashirin "Кат." ustunida ish (sarlavha) qatori belgisi — ИТОГО tekshiruvidan chiqariladi. */
const ISH_BELGI = 'РАБ';

const QORALAMA_USTUNLAR: RasmiyUstun[] = [
  { sarlavha: '№ п/п', kenglik: 6, tur: 'tartib' },
  { sarlavha: 'Шифр, код', kenglik: 13, tur: 'kod' },
  { sarlavha: 'Наименование работ и затрат', kenglik: 46, tur: 'matn' },
  { sarlavha: 'Ед. изм.', kenglik: 8, tur: 'birlik' },
  { sarlavha: 'кол-во', kenglik: 12, tur: 'hajm', guruh: 'ЗА ОТЧЕТНЫЙ ПЕРИОД (по документу)' },
  { sarlavha: 'цена за ед., сум', kenglik: 14, tur: 'narx', guruh: 'ЗА ОТЧЕТНЫЙ ПЕРИОД (по документу)' },
  { sarlavha: 'сумма, сум', kenglik: 16, tur: 'pul', guruh: 'ЗА ОТЧЕТНЫЙ ПЕРИОД (по документу)' },
  { sarlavha: 'Расчет: кол-во × цена, сум', kenglik: 16, tur: 'pul' },
  { sarlavha: 'Отклонение документа от расчета, сум', kenglik: 14, tur: 'pul' },
  { sarlavha: 'принято ранее', kenglik: 12, tur: 'hajm', guruh: 'КОЛИЧЕСТВО НАРАСТАЮЩИМ ИТОГОМ' },
  { sarlavha: 'с начала строительства', kenglik: 13, tur: 'hajm', guruh: 'КОЛИЧЕСТВО НАРАСТАЮЩИМ ИТОГОМ' },
  { sarlavha: 'Основание (документ, стр.)', kenglik: 18, tur: 'matn' },
  { sarlavha: 'К оплате (с накладными расходами и НДС), сум', kenglik: 17, tur: 'pul' },
  { sarlavha: 'Кат.', kenglik: 6, tur: 'texnik', yashirin: true },
];

/**
 * Проект акта приемки выполненных работ (Ф-2) — F2 tayyorlash sahifasidan.
 * Hujjat summasi — F2 manbasidagi aniq summa (qayta hisoblanmaydi, smeta narxi
 * bilan to'ldirilmaydi); "Расчет" va "Отклонение" — faqat nazorat ustunlari.
 * Narx/summa manbada ataylab yo'q bo'lsa — katak bo'sh, jami bo'sh (H7).
 */
export function f2QoralamaHujjat(qatorlar: readonly QatorHolat[], certified: readonly F2NativePayloadRow[], o: F2QoralamaOpsiya): { bytes: Uint8Array; faylNomi: string; jami: number | null; kOplata: number | null; jamiNds: number | null } {
  const rows = f2NativeExportRowsQur(qatorlar, certified);
  if (!rows.length) throw new Error('F2_QORALAMA_BOSH');
  const holat = new Map(qatorlar.map((q) => [q.qator_id, q]));
  const manba = new Map(certified.map((c) => [c.qatorId, c.rawSnapshot.sourceReference]));
  const v = new RasmiyVaraq({
    nom: 'Проект акта Ф-2',
    sarlavha: 'ПРОЕКТ АКТА ПРИЕМКИ ВЫПОЛНЕННЫХ РАБОТ (ФОРМА № 2)',
    ostSarlavha: [`за отчетный период: ${davrMatni(o.davr)}`],
    titul: [['Объект:', o.obyektNom], ['Заказчик:', o.imzo?.zakazchik], ['Подрядчик:', o.imzo?.pudratchi], ['Договор:', o.shartnoma]],
    ustunlar: QORALAMA_USTUNLAR,
    yonalish: 'landscape',
  });
  const diqqat: Array<{ nom: string; sabab: string }> = [];
  const dataRows: number[] = [];
  // Ikki narx: M = ROUND(G × Kf[kat], 2); podval ИТОГО dan keyin bitta bo'sh qatordan so'ng.
  const nk: Partial<NakrutkaKoeffitsientlar> = { ...(o.nakrutka ?? {}) };
  if (o.ndsFoiz != null && Number.isFinite(o.ndsFoiz) && o.ndsFoiz >= 0) nk.НДС = o.ndsFoiz;
  const podval = o.podval ? podvalgaKoefQoy(o.podval, nk) : null;
  const kfJS = kategoriyaKf(nk, podval);
  const bosh0 = v.malumotBoshi;
  const kfQ = podvalKfQatorlari(bosh0 + rows.length + 2, podval);
  const ks = Object.fromEntries(NAKRUTKA_KATLAR.map((k) => [k, 0])) as KatSummalar;
  let kOplata: number | null = 0;
  let jami: number | null = 0;
  const ishMi = new Set(certified.filter((c) => c.priceIntentionallyAbsent && holat.get(c.qatorId)?.tur === 'bl').map((c) => c.qatorId));
  rows.forEach((row, i) => {
    const kod = holat.get(Number(row.lineId))?.kod ?? '';
    /* Resursli F2 (egasi, 2026-10-01): ish (bl) — faqat hajm, narxi resurslarida. Bu sarlavha qatori:
       ИТОГО ga kirmaydi, "нет цены" ogohlantirishi yozilmaydi. */
    if (ishMi.has(Number(row.lineId))) {
      dataRows.push(v.qator('ish', (r) => [i + 1, kod, row.description, row.unit, row.currentQuantity, null, null, null, null,
        row.previousQuantity, { f: `J${r}+E${r}`, v: row.previousQuantity + row.currentQuantity }, manba.get(Number(row.lineId)) ?? '', null, ISH_BELGI]));
      return;
    }
    const summa = row.currentCertifiedValue;
    const narx = row.currentF2ValuationPrice;
    const hisob = narx == null ? null : yaxlit2(row.currentQuantity * narx);
    jami = jami == null || summa == null ? null : jami + summa;
    const nom = `${row.description}${row.unit ? `, ${row.unit}` : ''}`;
    if (summa == null) diqqat.push({ nom, sabab: 'в документе нет цены/суммы — итог не определен' });
    else if (hisob != null && Math.abs(hisob - summa) > 0.005) diqqat.push({ nom, sabab: `сумма документа отличается от расчета кол-во × цена на ${(summa - hisob).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} сум — принята сумма документа` });
    const kat = nakrutkaKat(holat.get(Number(row.lineId))?.kat);
    const ko = kOplate(summa, kat, kfJS);
    kOplata = kOplata == null || ko == null ? null : kOplata + ko;
    if (kat && summa != null) ks[kat] += summa;
    if (!kat) diqqat.push({ nom, sabab: 'не указан вид затрат — стоимость к оплате не определена' });
    dataRows.push(v.qator('oddiy', (r) => [
      i + 1, kod, row.description, row.unit, row.currentQuantity, narx, summa,
      { f: `IF(F${r}="","",ROUND(E${r}*F${r},2))`, v: hisob ?? '' },
      { f: `IF(OR(G${r}="",H${r}=""),"",G${r}-H${r})`, v: summa == null || hisob == null ? '' : summa - hisob },
      row.previousQuantity,
      { f: `J${r}+E${r}`, v: row.previousQuantity + row.currentQuantity },
      manba.get(Number(row.lineId)) ?? '',
      kat ? { f: `IF(G${r}="","",ROUND(G${r}*F${kfQ[kat]},2))`, v: ko ?? '' } : null,
      kat,
    ]));
  });
  const a = dataRows[0], b = dataRows[dataRows.length - 1];
  const kJami = kOplata as number | null;
  v.qator('vsego', () => [null, null, 'ИТОГО ПО АКТУ (прямые затраты)', null, null, null,
    { f: `IF(COUNTIFS(N${a}:N${b},"<>${ISH_BELGI}",G${a}:G${b},"")>0,"",SUM(G${a}:G${b}))`, v: jami ?? '' }, null, null, null, null, null,
    { f: `IF(COUNTIFS(N${a}:N${b},"<>${ISH_BELGI}",M${a}:M${b},"")>0,"",SUM(M${a}:M${b}))`, v: kJami == null ? '' : yaxlit2(kJami) }, null]);
  const jamiQ = jami as number | null;
  v.bosh();
  const p = nakrutkaPodvaliYoz(v, { podval, katUstun: 'N', oraliq: [a, b], pulUstunlar: ['G'], foizUstun: 'F', nk, katSummalar: { G: ks } });
  if (p.kfQator.ЧЕЛ !== kfQ.ЧЕЛ) throw new Error('F2_QORALAMA_PODVAL_SILJIDI');
  if (!o.nakrutka || !Object.keys(o.nakrutka).length) diqqat.push({ nom: 'Проценты накладных и прочих расходов', sabab: 'не заданы для объекта (договора) — в расчете приняты 0 %' });
  v.bosh();
  v.izoh('Проект акта сформирован по данным документов формы № 2 за период. Сумма по позиции — сумма документа (прямые затраты); графа «Расчет» приведена для контроля и не заменяет сумму документа.');
  v.izoh('Графа 13 — стоимость к оплате: прямые затраты × коэффициент по виду затрат (раздел «Расчет стоимости к оплате»); расхождение с итогом расчета — только округление.');
  v.diqqat(diqqat);
  v.imzo(imzoTomonlari(['ЗАКАЗЧИК', 'ПОДРЯДЧИК', 'ТЕХНАДЗОР'], o.imzo));
  const { bytes } = rasmiyKitob([v], { tur: 'f2_qoralama' });
  return { bytes, faylNomi: hujjatFaylNomi({ obyekt: o.obyektNom, hujjat: 'ПРОЕКТ_АКТА_Ф-2', davr: o.davr.slice(0, 7) }), jami: jamiQ, kOplata: kJami == null ? null : yaxlit2(kJami), jamiNds: jamiQ == null ? null : p.kaskad.G.vsego };
}
