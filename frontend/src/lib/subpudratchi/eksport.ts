/**
 * Subpudratchi akti (bajarilgan ish) - rasmiy Excel hujjat (RUS shakl, tizim hujjat yozuvchisi orqali).
 * Pul FAQAT lib/hisob-yadro: qator summasi qatorSumma, jami yigindi2Qatiy, QQS qqsBilan; noma'lum narx -> katak bo'sh va jami bo'sh (0 emas).
 * Narxlar - kelishilgan, QQS siz. Yuklab olish tokenga (hujjat: 'SUB_AKT'), qayta yuklash tekin (hujjatTokenBilan).
 */
import { RasmiyVaraq, bugunSana, hujjatFaylNomi, rasmiyKitob, ustunHarfi, type Qiymat } from '../hujjat-yozuvchi';
import { qatorSumma, qqsBilan, yigindi2Qatiy } from '../hisob-yadro';

export type SubAktEksportKirish = {
  subNom: string; gcNom: string; obyektNom: string; oy: string; raqam: string | null; qqsFoiz: number | null;
  qatorlar: ReadonlyArray<{ kod: string | null; nom: string | null; birlik: string | null; hajm: number; narx: number | null }>;
};

export function subAktHujjat(k: SubAktEksportKirish): { bytes: Uint8Array; faylNomi: string } {
  const v = new RasmiyVaraq({
    nom: 'Акт субподрядчика',
    kattaHarf: false,
    sarlavha: 'АКТ О ВЫПОЛНЕННЫХ РАБОТАХ СУБПОДРЯДЧИКА',
    ostSarlavha: [`за ${k.oy.slice(0, 7)}`, 'Цены согласованные, без НДС.'],
    titul: [
      ['Субподрядчик:', k.subNom],
      ['Генподрядчик:', k.gcNom],
      ['Объект:', k.obyektNom],
      ['№ акта:', k.raqam ?? null],
      ['Дата составления:', bugunSana()],
    ],
    ustunlar: [
      { sarlavha: '№ п/п', kenglik: 6, tur: 'tartib' },
      { sarlavha: 'Код', kenglik: 14, tur: 'kod' },
      { sarlavha: 'Наименование работ', kenglik: 46, tur: 'matn' },
      { sarlavha: 'Ед. изм.', kenglik: 9, tur: 'birlik' },
      { sarlavha: 'Объём', kenglik: 12, tur: 'hajm' },
      { sarlavha: 'Цена (без НДС)', kenglik: 16, tur: 'narx' },
      { sarlavha: 'Сумма (без НДС)', kenglik: 18, tur: 'pul' },
    ],
    yonalish: 'portrait',
  });
  const H = ustunHarfi;
  const bosh = v.r;
  k.qatorlar.forEach((q, i) => {
    v.qator('ish', (rr) => [
      i + 1, q.kod ?? null, q.nom ?? null, q.birlik ?? null, q.hajm, q.narx,
      q.narx == null ? null : { f: `${H(4)}${rr}*${H(5)}${rr}`, v: qatorSumma(q.hajm, q.narx) },
    ] as Qiymat[]);
  });
  const oxir = v.r - 1;
  const jami = k.qatorlar.length ? yigindi2Qatiy(k.qatorlar.map((q) => qatorSumma(q.hajm, q.narx))) : null;
  v.qator('jami', () => [null, null, 'ИТОГО без НДС', null, null, null, jami == null ? null : { f: `SUM(${H(6)}${bosh}:${H(6)}${oxir})`, v: jami }] as Qiymat[]);
  v.qator('vsego', () => [null, null, 'ВСЕГО с НДС', null, null, null, qqsBilan(jami, k.qqsFoiz)] as Qiymat[]);
  const { bytes } = rasmiyKitob([v]);
  return { bytes, faylNomi: hujjatFaylNomi({ obyekt: k.obyektNom, hujjat: 'АКТ_СУБПОДРЯДЧИКА', davr: k.oy.slice(0, 7) }) };
}
