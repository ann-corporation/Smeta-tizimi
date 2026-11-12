/**
 * solishtirma-export.ts — «ВЕДОМОСТЬ СОПОСТАВЛЕНИЯ ПРОЕКТА, СМЕТЫ И ФАКТА» (Loyiha–smeta–fakt solishtirma vedomosti).
 * Hujjat dvigateli (lib/hujjat-yozuvchi: RasmiyVaraq, H1–H9): asosiy qatorlar KATTA HARFDA, «с НДС» = «без НДС» × (1 + НДС) formula (kesh bilan),
 * noma'lum miqdor va narx — bo'sh (NULL ≠ 0). Pul qiymatlari lib/hisob-yadro dan (farq.ts) keladi; bu yerda qayta hisoblanmaydi.
 */
import { RasmiyVaraq, bugunSana, hujjatFaylNomi, imzoTomonlari, rasmiyKitob, type ImzoNomlar, type Qiymat, type RasmiyUstun } from '../hujjat-yozuvchi';
import type { FarqJami, FarqQator, FarqTuri } from './farq';

export const FARQ_RU: Record<FarqTuri, string> = {
  loyihada_bor_smetada_yoq: 'ЕСТЬ В ПРОЕКТЕ — НЕТ В СМЕТЕ', smetada_bor_loyihada_yoq: 'ЕСТЬ В СМЕТЕ — НЕТ В ПРОЕКТЕ', hajm_farqi: 'РАЗНИЦА В ОБЪЁМЕ',
  almashgan: 'ПОДМЕНА (КЛАСС/МАРКА)', fakt_oshgan: 'ФАКТ ПРЕВЫСИЛ ПРОЕКТ',
};
const QAROR_RU: Record<string, string> = {
  boglandi: 'ПРИВЯЗАНО К СТРОКЕ СМЕТЫ', zamena: 'ЗАМЕНА', qoshimcha: 'ДОПОЛНИТЕЛЬНАЯ РАБОТА', pereraschet: 'ПЕРЕРАСЧЁТ', etibor_yoq: 'ИГНОРИРОВАТЬ (ОШИБКА ПРОЕКТА)',
};

const USTUNLAR: RasmiyUstun[] = [
  { sarlavha: '№ п/п', kenglik: 6, tur: 'tartib' },
  { sarlavha: 'Лист', kenglik: 9, tur: 'kod' },
  { sarlavha: 'Наименование работ', kenglik: 44, tur: 'matn' },
  { sarlavha: 'Ед. изм.', kenglik: 9, tur: 'birlik' },
  { sarlavha: 'по проекту', kenglik: 12, tur: 'hajm', guruh: 'КОЛИЧЕСТВО' },
  { sarlavha: 'по смете', kenglik: 12, tur: 'hajm', guruh: 'КОЛИЧЕСТВО' },
  { sarlavha: 'по факту', kenglik: 12, tur: 'hajm', guruh: 'КОЛИЧЕСТВО' },
  { sarlavha: 'разница', kenglik: 12, tur: 'hajm', guruh: 'КОЛИЧЕСТВО' },
  { sarlavha: 'без НДС', kenglik: 15, tur: 'pul', guruh: 'ВЛИЯНИЕ НА СТОИМОСТЬ, СУМ' },
  { sarlavha: 'с НДС', kenglik: 15, tur: 'pul', guruh: 'ВЛИЯНИЕ НА СТОИМОСТЬ, СУМ' },
  { sarlavha: 'Решение', kenglik: 30, tur: 'matn' },
];

export type SolishtirmaOpsiya = { obyektNomi: string; sana?: string; imzo?: ImzoNomlar; qqsFoiz?: number; manba?: string };

const q = (x: number | null): Qiymat => (x == null ? null : x);

export function solishtirmaHujjatXlsx(rows: FarqQator[], jami: FarqJami, o: SolishtirmaOpsiya): { bytes: Uint8Array; faylNomi: string } {
  const sana = o.sana ?? bugunSana();
  const qqs = o.qqsFoiz ?? 12;
  const v = new RasmiyVaraq({
    nom: 'Сопоставление',
    sarlavha: 'ВЕДОМОСТЬ СОПОСТАВЛЕНИЯ ПРОЕКТА, СМЕТЫ И ФАКТА',
    ostSarlavha: [`по состоянию на ${sana.split('-').reverse().join('.')}`],
    titul: [['Объект:', o.obyektNomi], ['Основание:', o.manba ?? 'таблицы чертежей, смета (текущая версия), акты факта'], ['Подрядчик:', o.imzo?.pudratchi]],
    ustunlar: USTUNLAR,
    yonalish: 'landscape',
  });
  let no = 0;
  for (const tur of Object.keys(FARQ_RU) as FarqTuri[]) {
    const bandlar = rows.filter((r) => r.tur === tur);
    if (!bandlar.length) continue;
    v.bolim(FARQ_RU[tur]);
    for (const r of bandlar) {
      v.qator('oddiy', (n) => [
        ++no, r.varaq ?? '', r.nom.toUpperCase(), r.birlik, q(r.loyiha), q(r.smeta), q(r.fakt), q(r.farq), q(r.pulQQSsiz),
        r.pulQQSsiz == null ? '' : { f: `ROUND(I${n}*(1+${qqs}/100),2)`, v: r.pulQQSbilan ?? '' },
        r.qaror ? QAROR_RU[r.qaror] + (r.qarorEskirgan ? ' (РЕВИЗИЯ ИЗМЕНИЛАСЬ — ПЕРЕСМОТРЕТЬ)' : '') : '',
      ]);
    }
  }
  v.bosh();
  v.izoh(`Итого не вошло в смету (не решено): ${jami.kirmaganSoni} поз., ${jami.kirmaganQQSbilan.toLocaleString('ru-RU')} сум с НДС (${jami.kirmaganQQSsiz.toLocaleString('ru-RU')} без НДС); оформлено документами: ${jami.hujjatSoni} поз., ${jami.hujjatQQSbilan.toLocaleString('ru-RU')} сум с НДС.`);
  v.izoh('Позиции без цены и непринятые предложения в суммы не включены; неизвестное количество или цена не заменяются нулём. Исходная смета не изменялась.');
  const diqqat = rows.filter((r) => r.narxsiz && !r.qaror).map((r) => ({ nom: `${r.nom.toUpperCase()}${r.birlik ? `, ${r.birlik}` : ''}`, sabab: `${FARQ_RU[r.tur]}: ЦЕНА НЕ ОПРЕДЕЛЕНА` }));
  if (diqqat.length) v.diqqat(diqqat, 'ПОЗИЦИИ БЕЗ ЦЕНЫ');
  v.imzo(imzoTomonlari(['ПОДРЯДЧИК', 'СОСТАВИЛ'], o.imzo));
  const { bytes } = rasmiyKitob([v]);
  return { bytes, faylNomi: hujjatFaylNomi({ obyekt: o.obyektNomi, hujjat: 'СОПОСТАВЛЕНИЕ_ПРОЕКТ_СМЕТА_ФАКТ', davr: sana }) };
}
