import {
  RasmiyVaraq, bugunSana, hujjatFaylNomi, imzoTomonlari, rasmiyKitob,
  type ImzoNomlar, type Qiymat, type RasmiyUstun,
} from './hujjat-yozuvchi';
import { SVERKA_KAT_NOMI, type SverkaHolat, type SverkaKat, type SverkaNatija } from './smeta-anatomiya/sverka';

/**
 * «СВЕРКА ЛРВ И РС» — smeta yuklanganda LRV va resurs vedomosti (РС) farqlari
 * hujjati (egasi, C5). Hujjat standarti H1–H9: formulalar tirik (farq = РС − ЛРВ),
 * `$` siz, imzolar, fayl nomi <Obyekt>_<Hujjat>_<sana>.xlsx.
 * Manba qiymatlari o'zgartirilmaydi; noma'lum miqdor — bo'sh (NULL ≠ 0).
 */
export type SverkaOpsiya = {
  obyektNomi: string;
  /** Manbalar: LRV va RES fayl/varaq nomlari (Основание qatori uchun). */
  lrvManba: string;
  resManba: string;
  sana?: string;
  imzo?: ImzoNomlar;
  /** Faqat farqi bor pozitsiyalar (sukut: hammasi — mos kelganlari ham). */
  faqatFarq?: boolean;
};

const USTUNLAR: RasmiyUstun[] = [
  { sarlavha: '№ п/п', kenglik: 6, tur: 'tartib' },
  { sarlavha: 'Код ресурса', kenglik: 12, tur: 'kod' },
  { sarlavha: 'Наименование ресурса', kenglik: 42, tur: 'matn' },
  { sarlavha: 'Ед. изм.', kenglik: 9, tur: 'birlik' },
  { sarlavha: 'по ЛРВ', kenglik: 13, tur: 'hajm', guruh: 'КОЛИЧЕСТВО' },
  { sarlavha: 'по РС', kenglik: 13, tur: 'hajm', guruh: 'КОЛИЧЕСТВО' },
  { sarlavha: 'отклонение (РС − ЛРВ)', kenglik: 13, tur: 'hajm', guruh: 'КОЛИЧЕСТВО' },
  { sarlavha: 'по ЛРВ', kenglik: 15, tur: 'pul', guruh: 'СТОИМОСТЬ, СУМ' },
  { sarlavha: 'по РС', kenglik: 15, tur: 'pul', guruh: 'СТОИМОСТЬ, СУМ' },
  { sarlavha: 'отклонение (РС − ЛРВ)', kenglik: 15, tur: 'pul', guruh: 'СТОИМОСТЬ, СУМ' },
  { sarlavha: 'Результат сверки', kenglik: 30, tur: 'matn' },
];

export const SVERKA_HOLAT_NOMI: Record<SverkaHolat, string> = {
  mos: 'совпадает',
  farq: 'расхождение',
  faqat_lrv: 'только в ЛРВ',
  faqat_res: 'только в РС',
  noaniq: 'количество не указано',
  mashinist: 'справочно',
};

export function sverkaHujjatXlsx(s: SverkaNatija, o: SverkaOpsiya): { bytes: Uint8Array; faylNomi: string } {
  const sana = o.sana ?? bugunSana();
  const v = new RasmiyVaraq({
    nom: 'Сверка ЛРВ и РС',
    sarlavha: 'СВЕРКА ЛОКАЛЬНОЙ РЕСУРСНОЙ ВЕДОМОСТИ (ЛРВ) И РЕСУРСНОЙ ВЕДОМОСТИ (РС)',
    ostSarlavha: [`по состоянию на ${sana.split('-').reverse().join('.')}${o.faqatFarq ? ' (позиции с расхождениями)' : ''}`],
    titul: [
      ['Объект:', o.obyektNomi],
      ['ЛРВ:', o.lrvManba],
      ['РС:', o.resManba],
      ['Подрядчик:', o.imzo?.pudratchi],
    ],
    ustunlar: USTUNLAR,
    yonalish: 'landscape',
  });
  const q = (x: number | null): Qiymat => (x == null ? null : x);
  let no = 0;
  for (const kat of Object.keys(SVERKA_KAT_NOMI) as SverkaKat[]) {
    const bandlar = s.pozitsiyalar.filter((p) => p.kat === kat && (!o.faqatFarq || (p.holat !== 'mos' && p.holat !== 'mashinist')));
    if (!bandlar.length) continue;
    v.bolim(SVERKA_KAT_NOMI[kat]);
    for (const p of bandlar) {
      v.qator('oddiy', (n) => [
        ++no, p.kod, p.nom, p.birlik, q(p.lrvHajm), q(p.resHajm),
        { f: `IF(OR(E${n}="",F${n}=""),"",F${n}-E${n})`, v: p.farqHajm ?? '' },
        q(p.lrvSumma), q(p.resSumma),
        { f: `IF(OR(H${n}="",I${n}=""),"",ROUND(I${n}-H${n},2))`, v: p.farqSumma ?? '' },
        [SVERKA_HOLAT_NOMI[p.holat], p.izoh].filter(Boolean).join(': '),
      ]);
    }
  }
  v.bosh();
  const c = s.soni;
  v.izoh(`Итого позиций: ${s.pozitsiyalar.length}; совпадает — ${c.mos}; расхождение по количеству или стоимости — ${c.farq}; только в ЛРВ — ${c.faqat_lrv}; только в РС — ${c.faqat_res}; количество не указано — ${c.noaniq}; справочно (труд машинистов) — ${c.mashinist}.`);
  v.izoh('Сопоставление выполнено по наименованию и единице измерения ресурса; код ресурса самостоятельным ключом не является. Отклонение = РС − ЛРВ. Ведомость фиксирует расхождения и не изменяет данные ЛРВ и РС.');
  if (s.resYoq) v.izoh('Ресурсная ведомость (РС) не приложена — сверка не выполнена, все позиции ЛРВ показаны без сопоставления.');
  const diqqat = s.pozitsiyalar.filter((p) => p.holat === 'farq' || p.holat === 'faqat_lrv' || p.holat === 'faqat_res' || p.holat === 'noaniq')
    .map((p) => ({ nom: `${p.nom}${p.birlik ? `, ${p.birlik}` : ''}`, sabab: [SVERKA_HOLAT_NOMI[p.holat], p.izoh].filter(Boolean).join(': ') }));
  if (diqqat.length) v.diqqat(diqqat, 'ПОЗИЦИИ С РАСХОЖДЕНИЯМИ');
  v.imzo(imzoTomonlari(['ПОДРЯДЧИК', 'СОСТАВИЛ'], o.imzo));
  const { bytes } = rasmiyKitob([v]);
  return { bytes, faylNomi: hujjatFaylNomi({ obyekt: o.obyektNomi, hujjat: 'СВЕРКА_ЛРВ_И_РС', davr: sana }) };
}
