/**
 * hujjat-aylanish/shablon.ts — qurilish hujjatlarining 4 ta yangi shabloni (MVP v1), markaziy `hujjat-yozuvchi` uslubida:
 *   lab_protokol            — ЛАБОРАТОРНЫЙ ПРОТОКОЛ ИСПЫТАНИЙ (ШНК 3.01.01-22 bo'yicha laboratoriya dalili),
 *   akt_osvidetelstvovaniya — АКТ ОСВИДЕТЕЛЬСТВОВАНИЯ (ответственных конструкций / выполненных работ),
 *   predpisaniya            — ПРЕДПИСАНИЕ технического надзора (muddat, nuqsonlar, norma bandi),
 *   soprovod_xat            — СОПРОВОДИТЕЛЬНОЕ ПИСЬМО (ilovalar ro'yxati bilan).
 * АОСР allaqachon `aosr-export.ts` da. Hujjat matni RUS tilida (rasmiy hujjat qoidasi); qiymat yo'q bo'lsa — to'ldirish chizig'i,
 * o'ylab topilmaydi. To'liqlik tekshiruvi (`toliqlik.ts`) yetishmaganlarni «ПОЗИЦИИ, ТРЕБУЮЩИЕ ВНИМАНИЯ» sifatida hujjat ichida ko'rsatadi.
 * Smeta hujjati emas — matnlar katta harfga majburlanmaydi (kattaHarf: false). Rang yo'q, barcha qatorlar ramkali (RasmiyVaraq).
 */
import { RasmiyVaraq, hujjatFaylNomi, imzoTomonlari, rasmiyKitob, type ImzoNomlar, type ImzoRol, type RasmiyUstun } from '../hujjat-yozuvchi';
import { bugunSana } from '../hujjat-yozuvchi/fayl-nomi';
import { shablonToliqligi, type ShablonKirish, type ShablonTuri } from './toliqlik';

export type { ShablonKirish, ShablonTuri } from './toliqlik';

export type ShablonNatija = { bytes: Uint8Array; faylNomi: string; yetishmaydi: number };

const sanaRu = (iso?: string | null) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10).split('-').reverse().join('.') : null);
const bosh = (v?: string | null) => (v && v.trim() ? v.trim() : null);

const NOM: Record<ShablonTuri, { sarlavha: string; fayl: string; varaq: string }> = {
  lab_protokol: { sarlavha: 'ПРОТОКОЛ ЛАБОРАТОРНЫХ ИСПЫТАНИЙ', fayl: 'ПРОТОКОЛ_ИСПЫТАНИЙ', varaq: 'Протокол' },
  akt_osvidetelstvovaniya: { sarlavha: 'АКТ ОСВИДЕТЕЛЬСТВОВАНИЯ', fayl: 'АКТ_ОСВИДЕТЕЛЬСТВОВАНИЯ', varaq: 'Акт' },
  predpisaniya: { sarlavha: 'ПРЕДПИСАНИЕ ТЕХНИЧЕСКОГО НАДЗОРА', fayl: 'ПРЕДПИСАНИЕ', varaq: 'Предписание' },
  soprovod_xat: { sarlavha: 'СОПРОВОДИТЕЛЬНОЕ ПИСЬМО', fayl: 'ПИСЬМО', varaq: 'Письмо' },
};

const ustun = (sarlavha: string, kenglik: number, tur: RasmiyUstun['tur'] = 'matn'): RasmiyUstun => ({ sarlavha, kenglik, tur });

function umumiyTitul(k: ShablonKirish, qoshimcha: ReadonlyArray<readonly [string, string | null | undefined]>) {
  return [
    ['№:', bosh(k.raqam)],
    ['Дата:', sanaRu(k.sana)],
    ['Объект:', bosh(k.obyekt)],
    ...qoshimcha,
  ] as ReadonlyArray<readonly [string, string | null | undefined]>;
}

function varaqYasa(tur: ShablonTuri, k: ShablonKirish): RasmiyVaraq {
  const n = NOM[tur];
  const sarlavha = n.sarlavha;
  if (tur === 'lab_protokol') {
    const v = new RasmiyVaraq({
      nom: n.varaq, kattaHarf: false, sarlavha, yonalish: 'portrait',
      ostSarlavha: ['(на основании ШНК 3.01.01-22 и нормативных документов на испытание)'],
      titul: umumiyTitul(k, [
        ['Лаборатория:', bosh(k.laboratoriya)], ['Заказчик:', bosh(k.zakazchik)], ['Подрядчик:', bosh(k.pudratchi)],
        ['Вид испытания:', bosh(k.sinovTuri)], ['Конструкция / место отбора:', bosh(k.konstruksiya)], ['Марка / класс:', bosh(k.marka)],
        ['Нормативный документ:', bosh(k.normativ)],
      ]),
      ustunlar: [ustun('№ п/п', 6, 'tartib'), ustun('Показатель', 36), ustun('Ед. изм.', 10, 'birlik'), ustun('Требование НД', 22), ustun('Результат', 18), ustun('Заключение', 18)],
    });
    for (const q of k.korsatkichlar ?? []) v.qator('oddiy', [null, q.nom, q.birlik ?? null, q.talab ?? null, q.natija ?? null, q.xulosa ?? null]);
    if (!(k.korsatkichlar ?? []).length) v.qator('oddiy', [null, null, null, null, null, null]);
    v.bosh();
    v.blok([{ c1: 0, c2: 5, matn: `Заключение: ${bosh(k.xulosa) ?? 'соответствует / не соответствует требованиям (нужное указать) ____________________'}`, tur: 'qalin' }]);
    return v;
  }
  if (tur === 'akt_osvidetelstvovaniya') {
    const v = new RasmiyVaraq({
      nom: n.varaq, kattaHarf: false, sarlavha, yonalish: 'portrait',
      ostSarlavha: ['(освидетельствование выполненных работ, конструкций и участков сетей)'],
      titul: umumiyTitul(k, [
        ['Заказчик:', bosh(k.zakazchik)], ['Подрядчик:', bosh(k.pudratchi)], ['Технический надзор:', bosh(k.texnadzor)],
        ['Предъявлено к освидетельствованию:', bosh(k.ishNomi)], ['Проектная документация:', bosh(k.loyiha)],
      ]),
      ustunlar: [ustun('№ п/п', 6, 'tartib'), ustun('Наименование', 34), ustun('Содержание', 58)],
    });
    const bandlar: ReadonlyArray<readonly [string, string | null]> = [
      ['Выполненные работы, конструкции', bosh(k.ishTavsifi)],
      ['Применённые материалы (сертификаты, паспорта)', bosh(k.materiallar)],
      ['Отступления от проекта', bosh(k.chetlanishlar)],
      ['Результаты замеров / испытаний', bosh(k.natijalar)],
    ];
    bandlar.forEach(([nom, qiy]) => v.qator('oddiy', [null, nom, qiy]));
    v.bosh();
    v.blok([{ c1: 0, c2: 2, matn: `Решение комиссии: ${bosh(k.xulosa) ?? 'работы выполнены в соответствии с проектом; разрешается производство последующих работ ____________________'}`, tur: 'qalin' }]);
    return v;
  }
  if (tur === 'predpisaniya') {
    const v = new RasmiyVaraq({
      nom: n.varaq, kattaHarf: false, sarlavha, yonalish: 'portrait',
      ostSarlavha: ['(выдаётся при выявлении нарушений проектных решений и требований норм)'],
      titul: umumiyTitul(k, [
        ['Кому (подрядчик):', bosh(k.pudratchi)], ['От кого:', bosh(k.texnadzor)], ['Заказчик:', bosh(k.zakazchik)],
        ['Срок устранения:', sanaRu(k.muddat)], ['Основание (норма, п.):', bosh(k.normativ)],
      ]),
      ustunlar: [ustun('№ п/п', 6, 'tartib'), ustun('Выявленное нарушение', 46), ustun('Место (ось, отметка)', 22), ustun('Срок устранения', 14), ustun('Отметка об устранении', 18)],
    });
    for (const q of k.nuqsonlar ?? []) v.qator('oddiy', [null, q.matn, q.joy ?? null, sanaRu(q.muddat) ?? sanaRu(k.muddat), null]);
    if (!(k.nuqsonlar ?? []).length) v.qator('oddiy', [null, null, null, null, null]);
    v.bosh();
    v.blok([{ c1: 0, c2: 4, matn: 'О выполнении предписания письменно уведомить технический надзор в указанный срок. Невыполнение влечёт приостановку работ на участке.', tur: 'izoh' }]);
    return v;
  }
  const v = new RasmiyVaraq({
    nom: n.varaq, kattaHarf: false, sarlavha, yonalish: 'portrait',
    titul: umumiyTitul(k, [['Кому:', bosh(k.qabulQiluvchi)], ['От кого:', bosh(k.yuboruvchi)], ['Тема:', bosh(k.mavzu)], ['Просим ответить до:', sanaRu(k.muddat)]]),
    ustunlar: [ustun('№ п/п', 6, 'tartib'), ustun('Наименование документа (приложения)', 60), ustun('Листов', 10, 'hajm'), ustun('Примечание', 24)],
  });
  for (const q of k.ilovalar ?? []) v.qator('oddiy', [null, q.nom, q.varaqlar ?? null, q.izoh ?? null]);
  if (!(k.ilovalar ?? []).length) v.qator('oddiy', [null, null, null, null]);
  v.bosh();
  v.blok([{ c1: 0, c2: 3, matn: bosh(k.matn) ?? 'Направляем Вам документы согласно приложению для рассмотрения и согласования.', tur: 'qiymat' }]);
  return v;
}

const IMZO_ROLLAR: Record<ShablonTuri, readonly ImzoRol[]> = {
  lab_protokol: ['СОСТАВИЛ', 'ПРОВЕРИЛ'],
  akt_osvidetelstvovaniya: ['ЗАКАЗЧИК', 'ТЕХНАДЗОР', 'ПОДРЯДЧИК'],
  predpisaniya: ['ТЕХНАДЗОР', 'ПОДРЯДЧИК'],
  soprovod_xat: ['СОСТАВИЛ'],
};

/** Shablonni .xlsx ga yozadi. Yetishmagan maydonlar hujjat ichida «ПОЗИЦИИ, ТРЕБУЮЩИЕ ВНИМАНИЯ» sifatida ko'rinadi. */
export function shablonYoz(tur: ShablonTuri, k: ShablonKirish): ShablonNatija {
  const v = varaqYasa(tur, k);
  const yetishmaydi = shablonToliqligi(tur, k);
  v.diqqat(yetishmaydi.map((y) => ({ nom: y.nom, sabab: y.sabab })));
  const nomlar: ImzoNomlar = { zakazchik: k.zakazchik ?? undefined, pudratchi: k.pudratchi ?? undefined, texnadzor: k.texnadzor ?? undefined, tuzuvchi: k.tuzuvchi ?? undefined, tekshiruvchi: k.tekshiruvchi ?? undefined };
  v.imzo(imzoTomonlari(IMZO_ROLLAR[tur], nomlar));
  const { bytes } = rasmiyKitob([v]);
  return { bytes, faylNomi: hujjatFaylNomi({ obyekt: k.obyekt ?? undefined, hujjat: NOM[tur].fayl, davr: k.sana ?? bugunSana() }), yetishmaydi: yetishmaydi.length };
}
