/**
 * Kundalik ish jurnali — rasmiy hujjat (.xlsx) mavjud hujjat yozuvchisi (RasmiyVaraq) orqali; token yo'li (`hujjatTokenBilan`)
 * UI da. Asosiy qatorlar (ish, material, АОСР, murojaat nomlari) TO'LIQ KATTA HARFDA — RasmiyVaraq qoidasi (`kattaHarf`).
 *
 * ⚠️ «T» (tasdiqlanmagan): «Общий журнал работ» ning me'yoriy shakli (ustunlar, bo'limlar, rekvizitlar) hali rasmiy matn
 * bilan tasdiqlanmagan. Shuning uchun shakl SOZLANADIGAN: `JurnalSablon` (sarlavha, bo'limlar yoqish/o'chirish, imzo rollari,
 * qo'shimcha izoh). Normativ tasdiqlangach faqat shablon sukut qiymatlari o'zgaradi — kod emas.
 */
import {
  RasmiyVaraq, bugunSana, hujjatFaylNomi, imzoTomonlari, rasmiyKitob, type ImzoNomlar, type RasmiyUstun,
} from '../hujjat-yozuvchi';
import { obHavoMatni, type KunJurnali } from './model';

export type JurnalSablon = {
  sarlavha: string;
  ostSarlavha: string;
  /** Bo'limlar yoqish/o'chirish. */
  bolimlar: { ishlar: boolean; kirim: boolean; aosr: boolean; murojaat: boolean; obHavo: boolean; odamlar: boolean };
  /** Imzo rollari (hujjat yozuvchisi ImzoRol qiymatlari). */
  imzo: ReadonlyArray<'ЗАКАЗЧИК' | 'ПОДРЯДЧИК' | 'СУБПОДРЯДЧИК' | 'ТЕХНАДЗОР' | 'СОСТАВИЛ'>;
  /** Pastki izoh (ixtiyoriy) — masalan «Журнал ведется в соответствии с …» (me'yor tasdiqlangach to'ldiriladi). */
  izoh: string;
};

export const JURNAL_SABLON_SUKUT: JurnalSablon = {
  sarlavha: 'ОБЩИЙ ЖУРНАЛ РАБОТ',
  ostSarlavha: 'ежедневные записи о ходе производства работ',
  bolimlar: { ishlar: true, kirim: true, aosr: true, murojaat: true, obHavo: true, odamlar: true },
  imzo: ['ПОДРЯДЧИК', 'ТЕХНАДЗОР'],
  izoh: '',
};

const KALIT = 'ish-jurnal-sablon:';
/** Kompaniya sozlamasi (brauzerda saqlanadi, hujjat dizayni kabi); buzilgan/yo'q — sukut. */
export function jurnalSablonOl(kompaniyaId: number | null): JurnalSablon {
  try {
    const x = JSON.parse(globalThis.localStorage?.getItem(KALIT + (kompaniyaId ?? 0)) ?? 'null') as Partial<JurnalSablon> | null;
    if (!x || typeof x !== 'object') return JURNAL_SABLON_SUKUT;
    return {
      sarlavha: typeof x.sarlavha === 'string' && x.sarlavha.trim() ? x.sarlavha.slice(0, 120) : JURNAL_SABLON_SUKUT.sarlavha,
      ostSarlavha: typeof x.ostSarlavha === 'string' ? x.ostSarlavha.slice(0, 200) : JURNAL_SABLON_SUKUT.ostSarlavha,
      bolimlar: { ...JURNAL_SABLON_SUKUT.bolimlar, ...(x.bolimlar && typeof x.bolimlar === 'object' ? x.bolimlar : {}) },
      imzo: Array.isArray(x.imzo) && x.imzo.length ? x.imzo.slice(0, 4) : JURNAL_SABLON_SUKUT.imzo,
      izoh: typeof x.izoh === 'string' ? x.izoh.slice(0, 500) : '',
    };
  } catch { return JURNAL_SABLON_SUKUT; }
}
export function jurnalSablonSaqla(kompaniyaId: number | null, s: JurnalSablon): void {
  try { globalThis.localStorage?.setItem(KALIT + (kompaniyaId ?? 0), JSON.stringify(s)); } catch { /* saqlab bo'lmasa — sukut */ }
}

const BO_LIM_RU: Record<KunJurnali['olinmagan'][number], string> = { ishlar: 'выполненные работы', kirim: 'поступление материалов', aosr: 'АОСР', murojaat: 'предписания', izoh: 'запись прораба' };
const sanaRu = (iso: string) => iso.split('-').reverse().join('.');
const MURO_TUR: Record<string, string> = { predpisaniya: 'предписание', remark: 'замечание', savol: 'вопрос', sorov: 'запрос' };
const HOLAT_RU: Record<string, string> = { ochiq: 'открыто', bajarildi: 'выполнено', yopildi: 'закрыто' };

const USTUN: RasmiyUstun[] = [
  { sarlavha: '№ п/п', kenglik: 6, tur: 'tartib' },
  { sarlavha: 'Раздел / шифр', kenglik: 16, tur: 'kod' },
  { sarlavha: 'Наименование', kenglik: 60, tur: 'matn' },
  { sarlavha: 'Ед. изм.', kenglik: 9, tur: 'birlik' },
  { sarlavha: 'Количество', kenglik: 13, tur: 'hajm' },
  { sarlavha: 'Примечание', kenglik: 34, tur: 'matn' },
];

/** Bir yoki bir nechta kun — bitta varaq: har kun «ДАТА» bo'limi + 4 blok; oxirida izoh va imzolar. */
export function ishJurnaliXlsx(kunlar: readonly KunJurnali[], o: { obyektNomi: string; imzo?: ImzoNomlar; sablon?: JurnalSablon; sana?: string }): { bytes: Uint8Array; faylNomi: string } {
  const sb = o.sablon ?? JURNAL_SABLON_SUKUT;
  const tartib = [...kunlar].sort((a, b) => a.sana.localeCompare(b.sana));
  const davr = tartib.length === 0 ? (o.sana ?? bugunSana()) : tartib.length === 1 ? tartib[0].sana : `${tartib[0].sana}_${tartib[tartib.length - 1].sana}`;
  const v = new RasmiyVaraq({
    nom: 'Журнал работ',
    sarlavha: sb.sarlavha,
    ostSarlavha: [sb.ostSarlavha].filter(Boolean),
    titul: [['Объект:', o.obyektNomi], ['Подрядчик:', o.imzo?.pudratchi], ['Заказчик:', o.imzo?.zakazchik], ['Период:', tartib.length === 1 ? sanaRu(tartib[0].sana) : tartib.length ? `${sanaRu(tartib[0].sana)} — ${sanaRu(tartib[tartib.length - 1].sana)}` : sanaRu(davr)]],
    ustunlar: USTUN,
    yonalish: 'landscape',
  });
  const diqqat: Array<{ nom: string; sabab: string }> = [];
  for (const k of tartib) {
    v.bolim(`ДАТА: ${sanaRu(k.sana)}${k.izoh?.tasdiqlandi ? '' : ' (запись не подтверждена прорабом)'}`, { daraja: 0 });
    if (sb.bolimlar.obHavo) {
      const t = obHavoMatni(k.obHavo);
      v.qator('oddiy', ['', 'ПОГОДА', t ?? 'данные не получены', '', null, k.obHavo?.manba ? `источник: ${k.obHavo.manba}` : '']);
    }
    if (sb.bolimlar.odamlar && k.izoh?.odamlar) v.qator('oddiy', ['', 'ЛЮДИ', k.izoh.odamlar, '', null, '']);
    if (sb.bolimlar.ishlar) {
      v.qator('ish', ['', 'ВЫПОЛНЕНО', 'Выполненные работы (по актам факта за день)', '', null, '']);
      k.ishlar.forEach((i, n) => v.qator('oddiy', [n + 1, i.kod, i.nom, i.birlik, i.hajm, i.aktlar > 1 ? `актов факта: ${i.aktlar}` : '']));
      if (!k.ishlar.length) v.qator('oddiy', ['', '', 'записей о выполнении за день нет', '', null, '']);
    }
    if (sb.bolimlar.kirim) {
      v.qator('ish', ['', 'ПОСТУПЛЕНИЕ', 'Поступление материалов на склад объекта', '', null, '']);
      k.kirimlar.forEach((i, n) => v.qator('oddiy', [n + 1, '', i.nomi, i.birligi, i.hajm, i.postavshik ? `поставщик: ${i.postavshik}` : '']));
      if (!k.kirimlar.length) v.qator('oddiy', ['', '', 'поступлений за день нет', '', null, '']);
    }
    if (sb.bolimlar.aosr) {
      v.qator('ish', ['', 'АОСР', 'Акты освидетельствования скрытых работ за день', '', null, '']);
      k.aosr.forEach((i, n) => v.qator('oddiy', [n + 1, i.raqam ? `№ ${i.raqam}` : '', i.ishNomi, '', null, i.holat === 'tasdiqlangan' ? 'подписан' : 'на бумаге']));
      if (!k.aosr.length) v.qator('oddiy', ['', '', 'актов за день нет', '', null, '']);
    }
    if (sb.bolimlar.murojaat) {
      v.qator('ish', ['', 'ПРЕДПИСАНИЯ', 'Предписания, замечания и запросы за день', '', null, '']);
      k.murojaatlar.forEach((i, n) => v.qator('oddiy', [n + 1, MURO_TUR[i.turi] ?? i.turi, i.sarlavha, '', null, [HOLAT_RU[i.holat] ?? i.holat, i.muddat ? `срок ${sanaRu(i.muddat)}` : ''].filter(Boolean).join(', ')]));
      if (!k.murojaatlar.length) v.qator('oddiy', ['', '', 'предписаний за день нет', '', null, '']);
    }
    v.qator('ish', ['', 'ЗАПИСЬ ПРОРАБА', k.izoh?.izoh || '—', '', null, '']);
    for (const q of k.olinmagan) diqqat.push({ nom: sanaRu(k.sana), sabab: `данные раздела «${BO_LIM_RU[q]}» не получены — запись неполная` });
  }
  if (sb.izoh) { v.bosh(); v.izoh(sb.izoh); }
  if (diqqat.length) v.diqqat(diqqat);
  v.imzo(imzoTomonlari(sb.imzo, o.imzo));
  const { bytes } = rasmiyKitob([v], { tur: 'ish_jurnal' });
  return { bytes, faylNomi: hujjatFaylNomi({ obyekt: o.obyektNomi, hujjat: 'ЖУРНАЛ_РАБОТ', davr }) };
}
