/**
 * М-29 Excel hujjati (H1–H9 hujjat standarti, `RasmiyVaraq`).
 *
 * Ierarxiya (egasi: "har qavatni o'zini hisoblari bo'lishi kerak"):
 *   GURUH (МАТЕРИАЛЫ / КАБЕЛИ … ) — bo'lim sarlavhasi
 *     MATERIAL — jami qator (G/J = ishlari yig'indisi, formula)
 *       ish (Excel outline 2-daraja, yig'iladi) — norma × hajm
 *     ИТОГО ПО ГРУППЕ — pul farqi (N) yig'indisi
 *   ВСЕГО — tejash / ortiqcha sarf pulda (foydaga ta'sir)
 * Formulalar jonli, `$` siz; bo'sh (noma'lum) qiymat nol emas.
 */
import {
  RasmiyVaraq, bugunSana, hujjatFaylNomi, imzoTomonlari, rasmiyKitob,
  type ImzoNomlar, type Qiymat, type RasmiyUstun,
} from '../hujjat-yozuvchi';
import type { M29Natija } from './index';

const USTUNLAR: RasmiyUstun[] = [
  { sarlavha: '№ п/п', kenglik: 6, tur: 'tartib' },
  { sarlavha: 'Шифр, код', kenglik: 12, tur: 'kod' },
  { sarlavha: 'Наименование материала / работы', kenglik: 58, tur: 'matn' },
  { sarlavha: 'Ед. изм.', kenglik: 8, tur: 'birlik' },
  { sarlavha: 'Норма на ед. работ', kenglik: 11, tur: 'norma' },
  { sarlavha: 'Объём работ', kenglik: 11, tur: 'hajm', guruh: 'ЗА ОТЧЁТНЫЙ МЕСЯЦ' },
  { sarlavha: 'Расход по норме', kenglik: 12, tur: 'hajm', guruh: 'ЗА ОТЧЁТНЫЙ МЕСЯЦ' },
  { sarlavha: 'Фактически', kenglik: 12, tur: 'hajm', guruh: 'ЗА ОТЧЁТНЫЙ МЕСЯЦ' },
  { sarlavha: 'Отклонение (+ перерасход, − экономия)', kenglik: 13, tur: 'hajm', guruh: 'ЗА ОТЧЁТНЫЙ МЕСЯЦ' },
  { sarlavha: 'Объём работ', kenglik: 11, tur: 'hajm', guruh: 'С НАЧАЛА СТРОИТЕЛЬСТВА' },
  { sarlavha: 'Расход по норме', kenglik: 12, tur: 'hajm', guruh: 'С НАЧАЛА СТРОИТЕЛЬСТВА' },
  { sarlavha: 'Фактически', kenglik: 12, tur: 'hajm', guruh: 'С НАЧАЛА СТРОИТЕЛЬСТВА' },
  { sarlavha: 'Отклонение (+ перерасход, − экономия)', kenglik: 13, tur: 'hajm', guruh: 'С НАЧАЛА СТРОИТЕЛЬСТВА' },
  { sarlavha: 'Цена по смете, сум', kenglik: 13, tur: 'narx' },
  { sarlavha: 'Сумма отклонения, сум', kenglik: 15, tur: 'pul' },
  { sarlavha: 'Поступило на объект', kenglik: 12, tur: 'hajm', guruh: 'СКЛАД ОБЪЕКТА' },
  { sarlavha: 'Остаток на складе', kenglik: 12, tur: 'hajm', guruh: 'СКЛАД ОБЪЕКТА' },
];
// Ustun harflari: A№ B kod C nom D birlik E norma | F G H I (oy) | J K L M (jami) | N narx O summa | P kirim Q qoldiq

export interface M29ExportOpsiya {
  obyektNom: string;
  pudratchi?: string | null;
  imzo?: ImzoNomlar;
  raqam?: string | null;
}

export interface M29HujjatNatija { bytes: Uint8Array; faylNomi: string }

const OYLAR = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
export function m29DavrMatni(davr: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(davr);
  return m ? `${OYLAR[Number(m[2]) - 1]} ${m[1]} г.` : davr;
}

export function m29Hujjat(n: M29Natija, o: M29ExportOpsiya): M29HujjatNatija {
  const v = new RasmiyVaraq({
    nom: 'М-29',
    sarlavha: 'ОТЧЁТ О РАСХОДЕ ОСНОВНЫХ МАТЕРИАЛОВ В СТРОИТЕЛЬСТВЕ В СОПОСТАВЛЕНИИ С РАСХОДОМ, ОПРЕДЕЛЁННЫМ ПО ПРОИЗВОДСТВЕННЫМ НОРМАМ (ФОРМА № М-29)',
    ostSarlavha: [
      `за ${m29DavrMatni(n.davr)} и с начала строительства`,
      'Расход по норме — по УТВЕРЖДЁННЫМ актам формы № 2 (объём работ × производственная норма); фактически — списание со склада объекта',
    ],
    titul: [
      ['Объект:', o.obyektNom],
      ['Подрядчик:', o.pudratchi ?? null],
      ['Отчёт №:', o.raqam ?? null],
      ['Дата составления:', bugunSana().split('-').reverse().join('.')],
    ],
    ustunlar: USTUNLAR,
    yonalish: 'landscape',
  });

  const n0 = (x: number | null | undefined): Qiymat => (x == null ? null : x);
  let no = 0;
  const guruhJamiQatorlari: number[] = [];

  for (const g of n.guruhlar) {
    v.bolim(g.nom);
    const matQatorlar: number[] = [];
    for (const m of g.materiallar) {
      no++;
      const bosh = v.r;
      const oxir = bosh + m.ishlar.length; // bola qatorlari: bosh+1 … oxir
      const bolaSum = (c: string, qiymat: number): Qiymat => (m.ishlar.length ? { f: `SUM(${c}${bosh + 1}:${c}${oxir})`, v: qiymat } : qiymat);
      const r = v.qator('ish', (rr) => [
        no, kodKor(m.kod), m.nom, m.birlik, null,
        null, bolaSum('G', m.normaOy), n0(m.faktOy), { f: `IF(H${rr}="","",H${rr}-G${rr})`, v: m.farqOy ?? '' },
        null, bolaSum('K', m.normaJami), n0(m.faktJami), { f: `IF(L${rr}="","",L${rr}-K${rr})`, v: m.farqJami ?? '' },
        n0(m.narx), { f: `IF(OR(M${rr}="",N${rr}=""),"",ROUND(M${rr}*N${rr},2))`, v: m.farqSummaJami ?? '' },
        n0(m.kirimJami), { f: `IF(P${rr}="","",P${rr}-L${rr})`, v: m.skladQoldiq ?? '' },
      ], { daraja: 1 });
      matQatorlar.push(r);
      for (const ish of m.ishlar) {
        v.qator('oddiy', (rr) => [
          null, kodKor(ish.kod), `   ${ish.nom}${ish.toGridan ? ' (расход по акту Ф-2)' : ''}`, ish.birlik,
          ish.norma == null ? null : { n: ish.norma, uslub: 'norma' },
          ish.hajmOy, ish.toGridan || ish.norma == null ? ish.normaOy : { f: `ROUND(E${rr}*F${rr},6)`, v: ish.normaOy }, null, null,
          ish.hajmJami, ish.toGridan || ish.norma == null ? ish.normaJami : { f: `ROUND(E${rr}*J${rr},6)`, v: ish.normaJami }, null, null,
          null, null, null, null,
        ], { daraja: 2 });
      }
    }
    const jr = v.qator('jami', () => [
      null, null, `ИТОГО ПО ГРУППЕ «${g.nom}» — сумма отклонения`, null, null,
      null, null, null, null, null, null, null, null, null,
      matQatorlar.length ? { f: `SUM(${matQatorlar.map((x) => `O${x}`).join(',')})`, v: g.farqSummaJami ?? '' } : 0,
      null, null,
    ]);
    guruhJamiQatorlari.push(jr);
  }
  v.qator('vsego', () => [
    null, null, 'ВСЕГО: СУММА ОТКЛОНЕНИЯ (+ перерасход — убыток, − экономия — прибыль)', null, null,
    null, null, null, null, null, null, null, null, null,
    guruhJamiQatorlari.length ? { f: `SUM(${guruhJamiQatorlari.map((x) => `O${x}`).join(',')})`, v: n.jami.farqSummaJami ?? '' } : 0,
    null, null,
  ]);
  v.izoh(`Экономия по нормам: ${fmt2(n.jami.tejashSumma)} сум; перерасход сверх норм: ${fmt2(n.jami.ortiqchaSumma)} сум (по ценам сметы, без накладных и НДС).`);

  if (n.smetadaYoq.length) {
    v.bosh();
    v.sarlavhaMatn(`МАТЕРИАЛЫ, СПИСАННЫЕ СО СКЛАДА, КОТОРЫХ НЕТ В СМЕТЕ (${n.smetadaYoq.length})`);
    n.smetadaYoq.forEach((s, i) => v.izoh(`${i + 1}. ${s.nomi} (${s.birligi ?? '—'}): поступило ${fmt3(s.kirimJami)}, списано за месяц ${fmt3(s.chiqimOy)}, с начала ${fmt3(s.chiqimJami)} — укажите, где использовано.`));
  }
  v.diqqat(n.diqqat.map((d) => ({ nom: d.nom, sabab: d.sabab + (d.summa != null ? ` (${fmt2(d.summa)} сум)` : '') })));
  v.imzo(imzoTomonlari(['ПОДРЯДЧИК', 'СОСТАВИЛ', 'ПРОВЕРИЛ'], o.imzo));
  const { bytes } = rasmiyKitob([v]);
  return { bytes, faylNomi: hujjatFaylNomi({ obyekt: o.obyektNom, hujjat: 'М-29', davr: n.davr }) };
}

/** 1–2 belgili kod (masalan «С») — ma'nosiz, hujjatda ko'rsatilmaydi. */
const kodKor = (k: string | null) => (k && k.trim().length > 2 ? k : null);
const fmt2 = (x: number) => x.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt3 = (x: number) => x.toLocaleString('ru-RU', { maximumFractionDigits: 3 });
