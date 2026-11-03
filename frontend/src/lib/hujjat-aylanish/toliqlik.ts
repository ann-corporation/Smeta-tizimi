/**
 * hujjat-aylanish/toliqlik.ts — shablon to'liqligi tekshiruvi (sof funksiya, AI yo'q, tarmoq yo'q).
 * Majburiy maydon yetishmasa — nima va nega yetishmasligi qaytadi; hujjat o'zida «ПОЗИЦИИ, ТРЕБУЮЩИЕ ВНИМАНИЯ» sifatida chiqadi.
 * AI yordamchi (qoralama yozish) shu tekshiruvdan keyin ishlaydi: avval qoida, keyin ma'no (docs §6).
 */
export type ShablonTuri = 'lab_protokol' | 'akt_osvidetelstvovaniya' | 'predpisaniya' | 'soprovod_xat';
export const SHABLON_TURLARI: readonly ShablonTuri[] = ['lab_protokol', 'akt_osvidetelstvovaniya', 'predpisaniya', 'soprovod_xat'];

export type ShablonKirish = {
  obyekt?: string | null; raqam?: string | null; sana?: string | null;
  zakazchik?: string | null; pudratchi?: string | null; texnadzor?: string | null; tuzuvchi?: string | null; tekshiruvchi?: string | null;
  /** lab_protokol */
  laboratoriya?: string | null; sinovTuri?: string | null; konstruksiya?: string | null; marka?: string | null; normativ?: string | null;
  korsatkichlar?: ReadonlyArray<{ nom: string; birlik?: string | null; talab?: string | null; natija?: string | null; xulosa?: string | null }>;
  /** akt_osvidetelstvovaniya */
  ishNomi?: string | null; loyiha?: string | null; ishTavsifi?: string | null; materiallar?: string | null; chetlanishlar?: string | null; natijalar?: string | null;
  /** predpisaniya */
  muddat?: string | null;
  nuqsonlar?: ReadonlyArray<{ matn: string; joy?: string | null; muddat?: string | null }>;
  /** soprovod_xat */
  qabulQiluvchi?: string | null; yuboruvchi?: string | null; mavzu?: string | null; matn?: string | null;
  ilovalar?: ReadonlyArray<{ nom: string; varaqlar?: number | null; izoh?: string | null }>;
  /** Umumiy xulosa / qaror matni. */
  xulosa?: string | null;
};

export type Yetishmaydi = { nom: string; sabab: string };

const yoq = (v: unknown) => v == null || String(v).trim() === '';
type Qoida = { nom: string; sabab: string; yetishmaydi: (k: ShablonKirish) => boolean };

const UMUMIY: Qoida[] = [
  { nom: 'Номер документа', sabab: 'не указан номер', yetishmaydi: (k) => yoq(k.raqam) },
  { nom: 'Дата', sabab: 'не указана дата', yetishmaydi: (k) => yoq(k.sana) },
  { nom: 'Объект', sabab: 'не указан объект', yetishmaydi: (k) => yoq(k.obyekt) },
];

const QOIDALAR: Record<ShablonTuri, Qoida[]> = {
  lab_protokol: [
    ...UMUMIY,
    { nom: 'Лаборатория', sabab: 'не указана испытательная лаборатория', yetishmaydi: (k) => yoq(k.laboratoriya) },
    { nom: 'Вид испытания', sabab: 'не указан вид испытания', yetishmaydi: (k) => yoq(k.sinovTuri) },
    { nom: 'Нормативный документ', sabab: 'не указан НД, по которому проведено испытание', yetishmaydi: (k) => yoq(k.normativ) },
    { nom: 'Показатели испытания', sabab: 'нет ни одного показателя с результатом', yetishmaydi: (k) => !(k.korsatkichlar ?? []).some((q) => !yoq(q.nom) && !yoq(q.natija)) },
    { nom: 'Заключение', sabab: 'не указано заключение (соответствует / не соответствует)', yetishmaydi: (k) => yoq(k.xulosa) },
  ],
  akt_osvidetelstvovaniya: [
    ...UMUMIY,
    { nom: 'Предъявленные работы', sabab: 'не указано, что освидетельствуется', yetishmaydi: (k) => yoq(k.ishNomi) },
    { nom: 'Описание работ', sabab: 'нет описания выполненных работ', yetishmaydi: (k) => yoq(k.ishTavsifi) },
    { nom: 'Проектная документация', sabab: 'не указан шифр проекта / чертежи', yetishmaydi: (k) => yoq(k.loyiha) },
    { nom: 'Решение комиссии', sabab: 'не указано решение', yetishmaydi: (k) => yoq(k.xulosa) },
  ],
  predpisaniya: [
    ...UMUMIY,
    { nom: 'Подрядчик', sabab: 'не указан адресат предписания', yetishmaydi: (k) => yoq(k.pudratchi) },
    { nom: 'Срок устранения', sabab: 'не указан срок', yetishmaydi: (k) => yoq(k.muddat) && !((k.nuqsonlar ?? []).length > 0 && (k.nuqsonlar ?? []).every((q) => !yoq(q.muddat))) },
    { nom: 'Нарушения', sabab: 'не перечислено ни одного нарушения', yetishmaydi: (k) => !(k.nuqsonlar ?? []).some((q) => !yoq(q.matn)) },
    { nom: 'Основание', sabab: 'не указана норма (пункт ШНК/КМК)', yetishmaydi: (k) => yoq(k.normativ) },
  ],
  soprovod_xat: [
    { nom: 'Номер документа', sabab: 'не указан номер', yetishmaydi: (k) => yoq(k.raqam) },
    { nom: 'Дата', sabab: 'не указана дата', yetishmaydi: (k) => yoq(k.sana) },
    { nom: 'Адресат', sabab: 'не указан получатель', yetishmaydi: (k) => yoq(k.qabulQiluvchi) },
    { nom: 'Тема', sabab: 'не указана тема', yetishmaydi: (k) => yoq(k.mavzu) },
    { nom: 'Приложения', sabab: 'не перечислены прилагаемые документы', yetishmaydi: (k) => !(k.ilovalar ?? []).some((q) => !yoq(q.nom)) },
  ],
};

export function shablonToliqligi(tur: ShablonTuri, k: ShablonKirish): Yetishmaydi[] {
  return QOIDALAR[tur].filter((q) => q.yetishmaydi(k)).map(({ nom, sabab }) => ({ nom, sabab }));
}
