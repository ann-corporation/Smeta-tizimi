import { qqsBilan, qqsFormulasi, qqsSumma, yaxlit2 } from '../hisob-yadro';
/**
 * «ВЕДОМОСТЬ ВЫПОЛНЕННЫХ РАБОТ, ИСКЛЮЧЁННЫХ (СОКРАЩЁННЫХ) ЭКСПЕРТИЗОЙ» — da'vo ro'yxati rasmiy hujjati (egasi 2026-10-26:
 * ekspertiza kesgan, lekin qurilgan hajm — fakt, himoya qilinadi). Hujjat standarti (RasmiyVaraq): rus tilida, narx NDS SIZ,
 * summa formulada (hajm × narx), ustamali (obyekt kaskadi) alohida qatorda, NDS faqat OXIRIDA bir marta. Hisoblab bo'lmagan
 * (birlik farq / narx noma'lum) pozitsiyalar summaga KIRMAYDI — «требуют уточнения» ro'yxatida sababi bilan.
 */
import {
  RasmiyVaraq, bugunSana, hujjatFaylNomi, imzoTomonlari, rasmiyKitob, sumRefs,
  type ImzoNomlar, type Qiymat, type RasmiyUstun,
} from '../hujjat-yozuvchi';
import type { MoslikHolat } from './turlar';

export type DavaEksportQator = {
  lsKod: string | null; lsNom: string | null; kod: string | null; nom: string; birlik: string | null;
  eskiHajm: number | null; joriyHajm: number | null; qurilganHajm: number | null;
  davaHajm: number | null; dava: number | null; holat: MoslikHolat; izoh: string | null;
};

export type DavaEksportOpsiya = {
  obyektNomi: string; versiyaNomi: string; versiyaSanasi: string | null;
  sana?: string; imzo?: ImzoNomlar; ndsFoiz: number | null;
  /** ИТОГО-4 (NDS siz) obyekt kaskadi bo'yicha; null — hisoblanmadi. */
  ustamali: number | null;
};

const HOLAT_RU: Record<MoslikHolat, string> = {
  ozgarmagan: 'без изменений', kamaygan: 'объём сокращён экспертизой', oshgan: 'объём увеличен', almashtirilgan: 'работа заменена экспертизой',
  ochirilgan: 'исключено экспертизой', yangi: 'новая позиция', noaniq: 'соответствие уточнено вручную',
};

const USTUNLAR: RasmiyUstun[] = [
  { sarlavha: '№ п/п', kenglik: 6, tur: 'tartib' },
  { sarlavha: 'Шифр', kenglik: 14, tur: 'kod' },
  { sarlavha: 'Наименование работ', kenglik: 48, tur: 'matn' },
  { sarlavha: 'Ед. изм.', kenglik: 9, tur: 'birlik' },
  { sarlavha: 'по смете до экспертизы', kenglik: 13, tur: 'hajm', guruh: 'ОБЪЁМ' },
  { sarlavha: 'по действующей смете', kenglik: 13, tur: 'hajm', guruh: 'ОБЪЁМ' },
  { sarlavha: 'выполнено', kenglik: 13, tur: 'hajm', guruh: 'ОБЪЁМ' },
  { sarlavha: 'к предъявлению', kenglik: 13, tur: 'hajm', guruh: 'ОБЪЁМ' },
  { sarlavha: 'цена за ед.', kenglik: 15, tur: 'narx', guruh: 'БЕЗ НДС' },
  { sarlavha: 'сумма (прямые затраты)', kenglik: 17, tur: 'pul', guruh: 'БЕЗ НДС' },
  { sarlavha: 'Основание', kenglik: 30, tur: 'matn' },
];
// Ustun harflari: E eski, F joriy, G bajarilgan, H da'vo hajmi, I narx, J summa.

const lsNomi = (q: DavaEksportQator) => [q.lsKod ? `Смета № ${q.lsKod}` : null, q.lsNom].filter(Boolean).join(' — ') || 'Без раздела';

export function davaXlsx(qatorlar: readonly DavaEksportQator[], o: DavaEksportOpsiya): { bytes: Uint8Array; faylNomi: string; yacheykalar: number } {
  const sana = o.sana ?? bugunSana();
  const v = new RasmiyVaraq({
    nom: 'Претензия',
    sarlavha: 'ВЕДОМОСТЬ ВЫПОЛНЕННЫХ РАБОТ, ИСКЛЮЧЁННЫХ (СОКРАЩЁННЫХ) ЭКСПЕРТИЗОЙ',
    ostSarlavha: [`по состоянию на ${sana.split('-').reverse().join('.')} (к предъявлению сверх действующей сметы)`],
    titul: [
      ['Объект:', o.obyektNomi],
      ['Сравниваемая редакция сметы:', `${o.versiyaNomi}${o.versiyaSanasi ? ` от ${o.versiyaSanasi.split('-').reverse().join('.')}` : ''}`],
      ['Подрядчик:', o.imzo?.pudratchi],
      ['Заказчик:', o.imzo?.zakazchik],
    ],
    ustunlar: USTUNLAR,
    yonalish: 'landscape',
    muzlatUstun: 3,
  });
  const hisobda = qatorlar.filter((q) => q.dava != null && q.davaHajm != null && q.davaHajm !== 0);
  const aniqlanmagan = qatorlar.filter((q) => q.dava == null || q.davaHajm == null);
  const guruh = new Map<string, DavaEksportQator[]>();
  for (const q of hisobda) { const k = lsNomi(q); const a = guruh.get(k); if (a) a.push(q); else guruh.set(k, [q]); }
  let no = 0;
  const bolimJami: number[] = [];
  let jami = 0;
  for (const [nom, qs] of guruh) {
    v.bolim(nom);
    const rr: number[] = [];
    for (const q of qs) {
      const narx = q.dava! / q.davaHajm!;
      const q2 = (x: number | null): Qiymat => (x == null ? null : x);
      rr.push(v.qator('oddiy', (n) => [++no, q.kod, q.nom, q.birlik, q2(q.eskiHajm), q2(q.joriyHajm), q2(q.qurilganHajm), q.davaHajm,
        yaxlit2(narx), { f: `ROUND(H${n}*I${n},2)`, v: yaxlit2(q.davaHajm! * yaxlit2(narx)) },
        [HOLAT_RU[q.holat], q.izoh].filter(Boolean).join('; ')]));
    }
    const s = qs.reduce((t, q) => t + yaxlit2(q.davaHajm! * yaxlit2(q.dava! / q.davaHajm!)), 0);
    jami += s;
    bolimJami.push(v.qator('jami', [null, null, 'Итого по разделу', null, null, null, null, null, null, { f: sumRefs('J', rr), v: s }, null]));
  }
  const tJ = v.qator('vsego', [null, null, 'ИТОГО прямые затраты (без НДС)', null, null, null, null, null, null, { f: sumRefs('J', bolimJami), v: jami }, null]);
  let asos = tJ; let asosQiymat = jami;
  if (o.ustamali != null) {
    asos = v.qator('vsego', [null, null, 'ИТОГО с начислениями по объекту (накладные, транспорт, прочие — без НДС)', null, null, null, null, null, null, o.ustamali, null]);
    asosQiymat = o.ustamali;
  }
  if (o.ndsFoiz != null) {
    const nds = v.qator('jami', [null, null, `НДС ${o.ndsFoiz}%`, null, null, null, null, null, null,
      { f: qqsFormulasi(`J${asos}`, o.ndsFoiz), v: qqsSumma(asosQiymat, o.ndsFoiz) }, null]);
    v.qator('vsego', [null, null, 'ВСЕГО К ПРЕДЪЯВЛЕНИЮ С НДС', null, null, null, null, null, null,
      { f: `J${asos}+J${nds}`, v: qqsBilan(asosQiymat, o.ndsFoiz) }, null]);
  }
  v.filtrOxiri(tJ);
  v.bosh();
  v.izoh('Объём к предъявлению = выполненный объём − объём по действующей (утверждённой экспертизой) смете; для работ, исключённых или заменённых экспертизой, — весь выполненный объём. Цены — по действующей смете объекта (без НДС); НДС начислен один раз в конце.');
  if (o.ustamali == null) v.izoh('Начисления по объекту (коэффициенты) не прочитаны — НДС начислен на прямые затраты.');
  v.diqqat(aniqlanmagan.map((q) => ({
    nom: `${q.kod ? `${q.kod} ` : ''}${q.nom}${q.birlik ? `, ${q.birlik}` : ''}`,
    joy: lsNomi(q),
    sabab: q.davaHajm == null ? 'единица измерения изменена или объём по действующей смете неизвестен — объём к предъявлению не определён' : 'цена не определена (нет цены ресурсов в смете)',
  })), 'ПОЗИЦИИ, ТРЕБУЮЩИЕ УТОЧНЕНИЯ (в итог не включены)');
  v.imzo(imzoTomonlari(['ПОДРЯДЧИК', 'ЗАКАЗЧИК', 'СОСТАВИЛ'], o.imzo));
  const k = rasmiyKitob([v]);
  return { bytes: k.bytes, yacheykalar: k.yacheykalar, faylNomi: hujjatFaylNomi({ obyekt: o.obyektNomi, hujjat: 'ПРЕТЕНЗИЯ_ЭКСПЕРТИЗА', davr: sana }) };
}
