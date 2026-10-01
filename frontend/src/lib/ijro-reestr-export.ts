import {
  RasmiyVaraq, bugunSana, hujjatFaylNomi, imzoTomonlari, rasmiyKitob, sumFormula, yaxlit2,
  type ImzoNomlar, type RasmiyUstun,
} from './hujjat-yozuvchi';
import { SINOV_NATIJA_NOM, SINOV_TURI_NOM, type AosrHolat, type AosrTur, type AosrV2, type LabProtokol } from '../api/t2-ijro';

/**
 * Ijro hujjatlari reestrlari (egasi, 2026-10-01): «РЕЕСТР АКТОВ ОСВИДЕТЕЛЬСТВОВАНИЯ
 * СКРЫТЫХ РАБОТ» va «РЕЕСТР ПРОТОКОЛОВ ЛАБОРАТОРНЫХ ИСПЫТАНИЙ». Hujjat standarti
 * H1–H9 (RasmiyVaraq): A4, imzolar, fayl nomi <Obyekt>_<Hujjat>_<sana>.xlsx.
 * Bekor qilingan yozuvlar chiqmaydi; qiymat yo'q — bo'sh (o'ylab topilmaydi).
 */
export type ReestrOpsiya = { obyektNomi: string; sana?: string; imzo?: ImzoNomlar };

const sanaRu = (s: string | null | undefined) => (s ? s.slice(0, 10).split('-').reverse().join('.') : null);

export const AOSR_TUR_NOM: Record<AosrTur, string> = {
  aosr: 'АОСР', oraliq_qabul: 'Акт промежуточной приемки', sinov: 'Акт испытаний',
};
export const AOSR_HOLAT_NOM: Record<AosrHolat, string> = {
  yangi: 'черновик', tasdiqlangan: 'подписан', qogoz: 'на бумаге', bekor: 'аннулирован',
};

const AOSR_USTUN: RasmiyUstun[] = [
  { sarlavha: '№ п/п', kenglik: 6, tur: 'tartib' },
  { sarlavha: '№ акта', kenglik: 10, tur: 'kod' },
  { sarlavha: 'Дата акта', kenglik: 11, tur: 'birlik' },
  { sarlavha: 'Вид акта', kenglik: 14, tur: 'matn' },
  { sarlavha: 'Наименование скрытых работ', kenglik: 44, tur: 'matn' },
  { sarlavha: 'начало', kenglik: 11, tur: 'birlik', guruh: 'СРОКИ РАБОТ' },
  { sarlavha: 'окончание', kenglik: 11, tur: 'birlik', guruh: 'СРОКИ РАБОТ' },
  { sarlavha: 'Протоколы испытаний, шт.', kenglik: 11, tur: 'birlik' },
  { sarlavha: 'Статус', kenglik: 12, tur: 'birlik' },
];

export function aosrReestrXlsx(aktlar: readonly AosrV2[], o: ReestrOpsiya): { bytes: Uint8Array; faylNomi: string } {
  const sana = o.sana ?? bugunSana();
  const faol = aktlar.filter((a) => a.holat !== 'bekor')
    .slice().sort((a, b) => (a.sana ?? '9999').localeCompare(b.sana ?? '9999') || a.id - b.id);
  const v = new RasmiyVaraq({
    nom: 'Реестр АОСР',
    sarlavha: 'РЕЕСТР АКТОВ ОСВИДЕТЕЛЬСТВОВАНИЯ СКРЫТЫХ РАБОТ',
    ostSarlavha: [`по состоянию на ${sanaRu(sana)}`],
    titul: [['Объект:', o.obyektNomi], ['Заказчик:', o.imzo?.zakazchik], ['Подрядчик:', o.imzo?.pudratchi]],
    ustunlar: AOSR_USTUN,
    yonalish: 'landscape',
  });
  let no = 0;
  for (const a of faol) {
    v.qator('oddiy', [
      ++no, a.raqam, sanaRu(a.sana), AOSR_TUR_NOM[a.tur] ?? a.tur, a.ish_nomi,
      sanaRu(a.boshlanish_sana), sanaRu(a.tugash_sana), a.protokol_soni || null, AOSR_HOLAT_NOM[a.holat] ?? a.holat,
    ]);
  }
  v.bosh();
  v.izoh(`Всего актов: ${faol.length}; подписано — ${faol.filter((a) => a.holat === 'tasdiqlangan').length}; на бумаге — ${faol.filter((a) => a.holat === 'qogoz').length}; черновиков — ${faol.filter((a) => a.holat === 'yangi').length}.`);
  const diqqat = faol.filter((a) => !a.raqam || !a.sana || !a.ish_nomi)
    .map((a) => ({ nom: a.ish_nomi || `Акт id ${a.id}`, sabab: [!a.raqam && 'нет номера', !a.sana && 'нет даты', !a.ish_nomi && 'не указаны работы'].filter(Boolean).join(', ') }));
  if (diqqat.length) v.diqqat(diqqat);
  v.imzo(imzoTomonlari(['ЗАКАЗЧИК', 'ПОДРЯДЧИК', 'ТЕХНАДЗОР'], o.imzo));
  const { bytes } = rasmiyKitob([v]);
  return { bytes, faylNomi: hujjatFaylNomi({ obyekt: o.obyektNomi, hujjat: 'РЕЕСТР_АОСР', davr: sana }) };
}

const LAB_USTUN: RasmiyUstun[] = [
  { sarlavha: '№ п/п', kenglik: 6, tur: 'tartib' },
  { sarlavha: '№ протокола', kenglik: 12, tur: 'kod' },
  { sarlavha: 'Дата', kenglik: 11, tur: 'birlik' },
  { sarlavha: 'Лаборатория', kenglik: 24, tur: 'matn' },
  { sarlavha: 'Вид испытания', kenglik: 16, tur: 'matn' },
  { sarlavha: 'Конструкция / материал', kenglik: 30, tur: 'matn' },
  { sarlavha: 'Марка', kenglik: 9, tur: 'birlik' },
  { sarlavha: 'Объём', kenglik: 10, tur: 'hajm' },
  { sarlavha: 'Ед. изм.', kenglik: 8, tur: 'birlik' },
  { sarlavha: 'Результат', kenglik: 15, tur: 'birlik' },
  { sarlavha: 'Связанные АОСР, шт.', kenglik: 10, tur: 'birlik' },
  { sarlavha: 'Счёт (инвойс)', kenglik: 16, tur: 'matn' },
  { sarlavha: 'Сумма, сум', kenglik: 15, tur: 'pul' },
];

export function labReestrXlsx(protokollar: readonly LabProtokol[], o: ReestrOpsiya): { bytes: Uint8Array; faylNomi: string } {
  const sana = o.sana ?? bugunSana();
  const faol = protokollar.filter((p) => p.holat !== 'bekor')
    .slice().sort((a, b) => (a.sana ?? '9999').localeCompare(b.sana ?? '9999') || a.id - b.id);
  const v = new RasmiyVaraq({
    nom: 'Реестр протоколов',
    sarlavha: 'РЕЕСТР ПРОТОКОЛОВ ЛАБОРАТОРНЫХ ИСПЫТАНИЙ',
    ostSarlavha: [`по состоянию на ${sanaRu(sana)}`],
    titul: [['Объект:', o.obyektNomi], ['Подрядчик:', o.imzo?.pudratchi]],
    ustunlar: LAB_USTUN,
    yonalish: 'landscape',
  });
  const summaQatorlar: number[] = [];
  let jami = 0;
  let no = 0;
  for (const p of faol) {
    const inv = [p.invoys_raqam && `№ ${p.invoys_raqam}`, sanaRu(p.invoys_sana) && `от ${sanaRu(p.invoys_sana)}`].filter(Boolean).join(' ') || null;
    const r = v.qator('oddiy', [
      ++no, p.raqam, sanaRu(p.sana), p.laboratoriya, SINOV_TURI_NOM[p.sinov_turi] ?? p.sinov_turi, p.konstruksiya,
      p.marka, p.hajm, p.birlik, SINOV_NATIJA_NOM[p.natija] ?? p.natija, p.aosr_ids?.length || null, inv, p.summa,
    ]);
    if (p.summa != null) { summaQatorlar.push(r); jami += p.summa; }
  }
  const f = sumFormula(v.harf(12), summaQatorlar);
  v.qator('jami', ['', '', '', 'ИТОГО', '', '', '', '', '', '', '', '', f ? { f, v: yaxlit2(jami) } : null]);
  v.bosh();
  const mosEmas = faol.filter((p) => p.natija === 'mos_emas');
  v.izoh(`Всего протоколов: ${faol.length}; соответствует — ${faol.filter((p) => p.natija === 'mos').length}; не соответствует — ${mosEmas.length}; ожидается — ${faol.filter((p) => p.natija === 'kutilmoqda').length}.`);
  const diqqat = [
    ...mosEmas.map((p) => ({ nom: `Протокол № ${p.raqam}${p.konstruksiya ? ` (${p.konstruksiya})` : ''}`, sabab: 'результат: не соответствует' })),
    ...faol.filter((p) => !p.aosr_ids?.length).map((p) => ({ nom: `Протокол № ${p.raqam}`, sabab: 'не привязан к АОСР' })),
  ];
  if (diqqat.length) v.diqqat(diqqat);
  v.imzo(imzoTomonlari(['ПОДРЯДЧИК', 'ТЕХНАДЗОР', 'СОСТАВИЛ'], o.imzo));
  const { bytes } = rasmiyKitob([v]);
  return { bytes, faylNomi: hujjatFaylNomi({ obyekt: o.obyektNomi, hujjat: 'РЕЕСТР_ЛАБ_ПРОТОКОЛОВ', davr: sana }) };
}
