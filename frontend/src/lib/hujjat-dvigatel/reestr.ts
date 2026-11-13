/**
 * hujjat-dvigatel/reestr.ts — hujjat turlari reestri (V3 «yagona hujjat dvigateli» poydevori).
 *
 * YANGI hujjat turi qo'shish = shu yerga BITTA yozuv (+ eksportyor kodi). Taqdim resursi, token narxi kaliti,
 * eksportdan oldingi tekshiruv va imzo tomonlari boshqa joyda qayta yozilmaydi — shu reestrdan olinadi.
 * Guard testlar (reestr.test.ts): har taqdim resursining reestrda turi bor; har eksportyorli turda tekshiruv bor;
 * kodda ishlatilgan har token kaliti (hujjatTokenBilan parametri) shu yerda ro'yxatdan o'tgan.
 */
import type { HujjatKalit, HujjatTuri, TekshiruvQadam } from './turlar';

/**
 * Eksportdan oldingi tekshiruv qadamlari («Tayyorgarlik» jadvali ustunlari). TARTIB muhim: UI ustunlari shu tartibda.
 * Hech biri hujjatni bloklamaydi — faqat ✓ / ✗ / ⚠ holat (tayyorgarlikHisobla — lib/f2-oylik-paket/shartnoma.ts).
 */
export const TAYYORGARLIK_QADAMLARI = [
  { kalit: 'fakt', nom: 'Fakt kiritilgan', daraja: 'obyekt', hujjat: null },
  { kalit: 'f2', nom: 'F2 holati', daraja: 'obyekt', hujjat: 'f2' },
  { kalit: 'forma3', nom: 'Forma-3', daraja: 'shartnoma', hujjat: 'forma3' },
  { kalit: 'nakopitelniy', nom: 'Nakopitelniy', daraja: 'obyekt', hujjat: 'nakopitelniy' },
  { kalit: 'm29', nom: 'M-29', daraja: 'obyekt', hujjat: 'm29' },
  { kalit: 'ostatka', nom: 'Ostatka', daraja: 'obyekt', hujjat: 'ostatka' },
  { kalit: 'slichitelniy', nom: 'Slichitelniy', daraja: 'obyekt', hujjat: 'slichitelniy' },
  { kalit: 'summa', nom: 'Summa / narx', daraja: 'obyekt', hujjat: null },
] as const satisfies readonly TekshiruvQadam[];

export type TekshiruvKalit = (typeof TAYYORGARLIK_QADAMLARI)[number]['kalit'];

const IMZO_KUZATUV = ['texnadzor', 'buyurtmachi'] as const;

export const HUJJAT_TURLARI = {
  f2: {
    kalit: 'f2', nom: 'Forma-2 (bajarilgan ishlar akti)', nomRu: 'Форма № 2', holat: 'ishlaydi',
    eksport: { modul: 'lib/f2-akt-hujjat.ts', izoh: 'F2 akt xlsx (hujjat-yozuvchi)' },
    majburiy: [
      { kalit: 'obyekt', nom: 'Obyekt', manba: 'obyekt' },
      { kalit: 'shartnoma', nom: 'Shartnoma', manba: 'shartnoma' },
      { kalit: 'oy', nom: 'Hisobot oyi', manba: 'qolda' },
      { kalit: 'qatorlar', nom: 'Bajarilgan ish qatorlari (hajm)', manba: 'fakt' },
      { kalit: 'summa', nom: 'Summa (QQS bilan / ustamali)', manba: 'hisob-yadro' },
    ],
    tekshiruv: ['fakt', 'f2', 'summa'],
    bosqichlar: ['qoralama', 'tekshiruv', 'yuborildi', 'qaror', 'arxiv'],
    imzo: { tayyorlaydi: 'pudratchi', tasdiqlaydi: ['buyurtmachi'] },
    taqdim: { resurs: 'f2', manbaJadval: 't2_akt', qabulRollar: ['zakazchik', 'texnadzor'] },
    tokenKalit: 'F2',
  },
  forma3: {
    kalit: 'forma3', nom: 'Forma-3 (schet-faktura / to\'lov spravkasi)', nomRu: 'Форма № 3', holat: 'ishlaydi',
    eksport: { modul: 'lib/oylik-hujjat/forma3-shartnoma.ts', izoh: 'Shartnoma darajasida bitta F3' },
    majburiy: [
      { kalit: 'shartnoma', nom: 'Shartnoma', manba: 'shartnoma' },
      { kalit: 'f2', nom: 'Tasdiqlangan F2 lar', manba: 'f2' },
      { kalit: 'summa', nom: 'Summa va QQS', manba: 'hisob-yadro' },
    ],
    tekshiruv: ['f2', 'forma3', 'summa'],
    bosqichlar: ['qoralama', 'tekshiruv', 'yuborildi', 'qaror', 'arxiv'],
    imzo: { tayyorlaydi: 'pudratchi', tasdiqlaydi: ['buyurtmachi'] },
    taqdim: { resurs: 'hujjat', manbaJadval: null },
    tokenKalit: 'F3',
  },
  aosr: {
    kalit: 'aosr', nom: 'АОСР (yashirin ishlar dalolatnomasi)', nomRu: 'АОСР (акт освидетельствования скрытых работ)', holat: 'ishlaydi',
    eksport: { modul: 'lib/aosr-export.ts', izoh: 'АОСР xlsx; qoralama lib/aosr-qoralama.ts' },
    majburiy: [
      { kalit: 'obyekt', nom: 'Obyekt', manba: 'obyekt' },
      { kalit: 'ish', nom: 'Yashirin ish nomi', manba: 'qolda' },
      { kalit: 'materiallar', nom: 'Materiallar va sertifikatlar', manba: 'qolda' },
      { kalit: 'texnadzor', nom: 'Texnik nazorat vakili', manba: 'tomon' },
    ],
    tekshiruv: ['fakt'],
    bosqichlar: ['qoralama', 'tekshiruv', 'yuborildi', 'qaror', 'arxiv'],
    imzo: { tayyorlaydi: 'pudratchi', tasdiqlaydi: IMZO_KUZATUV },
    taqdim: { resurs: 'aosr', manbaJadval: 't2_aosr', qabulRollar: ['zakazchik', 'texnadzor', 'loyihachi'] },
    tokenKalit: 'AOSR',
  },
  m29: {
    kalit: 'm29', nom: 'M-29 (material sarfi hisoboti)', nomRu: 'М-29', holat: 'ishlaydi',
    eksport: { modul: 'lib/oylik-hujjat/m29.ts', izoh: 'Oylik M-29' },
    majburiy: [
      { kalit: 'obyekt', nom: 'Obyekt', manba: 'obyekt' },
      { kalit: 'oy', nom: 'Hisobot oyi', manba: 'qolda' },
      { kalit: 'sarf', nom: 'Material sarfi', manba: 'fakt' },
    ],
    tekshiruv: ['m29'],
    bosqichlar: ['qoralama', 'tekshiruv', 'arxiv'],
    imzo: { tayyorlaydi: 'pudratchi', tasdiqlaydi: [] },
    taqdim: { resurs: 'hujjat', manbaJadval: null },
    tokenKalit: 'M-29',
  },
  nakopitelniy: {
    kalit: 'nakopitelniy', nom: 'Nakopitelniy vedomost', nomRu: 'Накопительная ведомость', holat: 'ishlaydi',
    eksport: { modul: 'lib/oylik-hujjat/nakopitelniy.ts', izoh: 'Faqat TASDIQLANGAN F2 lardan' },
    majburiy: [
      { kalit: 'obyekt', nom: 'Obyekt', manba: 'obyekt' },
      { kalit: 'f2', nom: 'Tasdiqlangan F2 lar', manba: 'f2' },
    ],
    tekshiruv: ['f2', 'nakopitelniy'],
    bosqichlar: ['qoralama', 'tekshiruv', 'yuborildi', 'qaror', 'arxiv'],
    imzo: { tayyorlaydi: 'pudratchi', tasdiqlaydi: ['buyurtmachi'] },
    taqdim: { resurs: 'hujjat', manbaJadval: null },
    tokenKalit: 'NAKOPITELNIY',
  },
  ostatka: {
    kalit: 'ostatka', nom: 'Ostatka vedomosti', nomRu: 'Ведомость остатка', holat: 'ishlaydi',
    eksport: { modul: 'lib/oylik-hujjat/ostatka-slichitelniy.ts', izoh: 'Qolgan hajm' },
    majburiy: [
      { kalit: 'obyekt', nom: 'Obyekt', manba: 'obyekt' },
      { kalit: 'smeta', nom: 'Smeta hajmi', manba: 'smeta' },
      { kalit: 'f2', nom: 'F2 bajarilgan hajm', manba: 'f2' },
    ],
    tekshiruv: ['ostatka'],
    bosqichlar: ['qoralama', 'tekshiruv', 'arxiv'],
    imzo: { tayyorlaydi: 'pudratchi', tasdiqlaydi: [] },
    taqdim: { resurs: 'hujjat', manbaJadval: null },
    tokenKalit: 'OSTATKA',
  },
  slichitelniy: {
    kalit: 'slichitelniy', nom: 'Slichitelniy vedomost', nomRu: 'Сличительная ведомость', holat: 'ishlaydi',
    eksport: { modul: 'lib/oylik-hujjat/ostatka-slichitelniy.ts', izoh: 'Smeta va fakt solishtirish' },
    majburiy: [
      { kalit: 'obyekt', nom: 'Obyekt', manba: 'obyekt' },
      { kalit: 'smeta', nom: 'Smeta qatorlari', manba: 'smeta' },
      { kalit: 'fakt', nom: 'Fakt hajmi', manba: 'fakt' },
    ],
    tekshiruv: ['slichitelniy'],
    bosqichlar: ['qoralama', 'tekshiruv', 'arxiv'],
    imzo: { tayyorlaydi: 'pudratchi', tasdiqlaydi: [] },
    taqdim: { resurs: 'hujjat', manbaJadval: null },
    tokenKalit: 'SLICHITELNIY',
  },
  loyiha_smeta_fakt: {
    kalit: 'loyiha_smeta_fakt', nom: 'Loyiha–smeta–fakt solishtirma vedomosti', nomRu: 'Ведомость сопоставления проекта, сметы и факта', holat: 'ishlaydi',
    eksport: { modul: 'lib/loyiha-smeta/solishtirma-export.ts', izoh: 'Loyiha miqdori, smeta va fakt farqlari, pul ta\'siri (hisob-yadro), qarorlar' },
    majburiy: [
      { kalit: 'obyekt', nom: 'Obyekt', manba: 'obyekt' },
      { kalit: 'smeta', nom: 'Smeta qatorlari (joriy versiya)', manba: 'smeta' },
      { kalit: 'fakt', nom: 'Fakt hajmi', manba: 'fakt' },
      { kalit: 'summa', nom: 'Summa (QQS bilan / ustamali)', manba: 'hisob-yadro' },
    ],
    tekshiruv: ['fakt', 'summa'],
    bosqichlar: ['qoralama', 'tekshiruv', 'arxiv'],
    imzo: { tayyorlaydi: 'pudratchi', tasdiqlaydi: [] },
    taqdim: { resurs: 'hujjat', manbaJadval: null },
    tokenKalit: 'LOYIHA_SMETA_FAKT',
  },
  lab_protokol: {
    kalit: 'lab_protokol', nom: 'Laboratoriya sinov protokoli', nomRu: 'Протокол лабораторных испытаний', holat: 'ishlaydi',
    eksport: { modul: 'lib/hujjat-aylanish/shablon.ts', izoh: 'ShNK 3.01.01-22 bo\'yicha dalil; to\'liqlik — toliqlik.ts' },
    majburiy: [
      { kalit: 'obyekt', nom: 'Obyekt', manba: 'obyekt' },
      { kalit: 'laboratoriya', nom: 'Laboratoriya', manba: 'laboratoriya' },
      { kalit: 'sinovTuri', nom: 'Sinov turi', manba: 'laboratoriya' },
      { kalit: 'normativ', nom: 'Normativ', manba: 'qolda' },
      { kalit: 'korsatkichlar', nom: 'Ko\'rsatkichlar va natijalar', manba: 'laboratoriya' },
    ],
    tekshiruv: ['fakt'],
    bosqichlar: ['qoralama', 'tekshiruv', 'yuborildi', 'qaror', 'arxiv'],
    imzo: { tayyorlaydi: 'laboratoriya', tasdiqlaydi: ['texnadzor'] },
    taqdim: { resurs: 'hujjat', manbaJadval: null },
    tokenKalit: null, tokenYoq: 'Shablon hujjatlari hozircha tokensiz (egasi qarori kerak)',
  },
  akt_osvidetelstvovaniya: {
    kalit: 'akt_osvidetelstvovaniya', nom: 'Dalolatnoma (guvohlik)', nomRu: 'Акт освидетельствования', holat: 'ishlaydi',
    eksport: { modul: 'lib/hujjat-aylanish/shablon.ts', izoh: 'Mas\'ul konstruksiya / bajarilgan ish' },
    majburiy: [
      { kalit: 'obyekt', nom: 'Obyekt', manba: 'obyekt' },
      { kalit: 'ishNomi', nom: 'Ish nomi', manba: 'qolda' },
      { kalit: 'ishTavsifi', nom: 'Ish tavsifi', manba: 'qolda' },
    ],
    tekshiruv: ['fakt'],
    bosqichlar: ['qoralama', 'tekshiruv', 'yuborildi', 'qaror', 'arxiv'],
    imzo: { tayyorlaydi: 'pudratchi', tasdiqlaydi: IMZO_KUZATUV },
    taqdim: { resurs: 'hujjat', manbaJadval: null },
    tokenKalit: null, tokenYoq: 'Shablon hujjatlari hozircha tokensiz (egasi qarori kerak)',
  },
  predpisaniya: {
    kalit: 'predpisaniya', nom: 'Predpisaniya (texnik nazorat)', nomRu: 'Предписание технического надзора', holat: 'ishlaydi',
    eksport: { modul: 'lib/hujjat-aylanish/shablon.ts', izoh: 'Muddat va nuqsonlar ro\'yxati' },
    majburiy: [
      { kalit: 'obyekt', nom: 'Obyekt', manba: 'obyekt' },
      { kalit: 'muddat', nom: 'Bartaraf etish muddati', manba: 'qolda' },
      { kalit: 'nuqsonlar', nom: 'Nuqsonlar', manba: 'qolda' },
    ],
    tekshiruv: ['fakt'],
    bosqichlar: ['qoralama', 'tekshiruv', 'yuborildi', 'qaror', 'arxiv'],
    imzo: { tayyorlaydi: 'texnadzor', tasdiqlaydi: ['pudratchi'] },
    taqdim: { resurs: 'hujjat', manbaJadval: null },
    tokenKalit: null, tokenYoq: 'Shablon hujjatlari hozircha tokensiz (egasi qarori kerak)',
  },
  soprovod_xat: {
    kalit: 'soprovod_xat', nom: 'Kuzatuv xati', nomRu: 'Сопроводительное письмо', holat: 'ishlaydi',
    eksport: { modul: 'lib/hujjat-aylanish/shablon.ts', izoh: 'Ilovalar ro\'yxati bilan' },
    majburiy: [
      { kalit: 'qabulQiluvchi', nom: 'Qabul qiluvchi', manba: 'tomon' },
      { kalit: 'yuboruvchi', nom: 'Yuboruvchi', manba: 'kompaniya' },
      { kalit: 'ilovalar', nom: 'Ilovalar', manba: 'qolda' },
    ],
    tekshiruv: ['fakt'],
    bosqichlar: ['qoralama', 'tekshiruv', 'arxiv'],
    imzo: { tayyorlaydi: 'pudratchi', tasdiqlaydi: [] },
    taqdim: null,
    tokenKalit: null, tokenYoq: 'Shablon hujjatlari hozircha tokensiz (egasi qarori kerak)',
  },
  zayavka: {
    kalit: 'zayavka', nom: 'Material zayavkasi', nomRu: 'Заявка на материалы', holat: 'rejada',
    eksport: null,
    majburiy: [
      { kalit: 'obyekt', nom: 'Obyekt', manba: 'obyekt' },
      { kalit: 'material', nom: 'Material va miqdor', manba: 'smeta' },
      { kalit: 'yetkazuvchi', nom: 'Yetkazuvchi', manba: 'tomon' },
    ],
    tekshiruv: [],
    bosqichlar: ['qoralama', 'arxiv'], // taqdim resursi (t2_tomon_resurs) paydo bo'lgach yuborildi/qaror qo'shiladi
    imzo: { tayyorlaydi: 'pudratchi', tasdiqlaydi: ['yetkazuvchi'] },
    taqdim: null,
    tokenKalit: null, tokenYoq: 'Reja: eksportyor hali yo\'q',
  },
  sub_akt: {
    kalit: 'sub_akt', nom: 'Subpudratchi akti (bajarilgan ish)', nomRu: 'Акт выполненных работ субподрядчика', holat: 'ishlaydi',
    eksport: { modul: 'lib/subpudratchi/eksport.ts', izoh: 'Subpudratchi akti xlsx (kelishilgan narx, QQS siz / QQS bilan)' },
    majburiy: [
      { kalit: 'obyekt', nom: 'Obyekt (bosh pudratchi)', manba: 'obyekt' },
      { kalit: 'oy', nom: 'Hisobot oyi', manba: 'qolda' },
      { kalit: 'qatorlar', nom: 'Bajarilgan hajm (topshirilgan qatorlar)', manba: 'fakt' },
      { kalit: 'summa', nom: 'Summa (kelishilgan narx, QQS siz / QQS bilan)', manba: 'hisob-yadro' },
    ],
    tekshiruv: ['fakt', 'summa'],
    bosqichlar: ['qoralama', 'tekshiruv', 'yuborildi', 'qaror', 'arxiv'],
    imzo: { tayyorlaydi: 'subpudratchi', tasdiqlaydi: ['pudratchi'] },
    taqdim: { resurs: 'sub_akt', manbaJadval: 't2_sub_akt' },
    tokenKalit: 'SUB_AKT',
  },
} as const satisfies Record<HujjatKalit, HujjatTuri>;

export const HUJJAT_KALITLARI = Object.keys(HUJJAT_TURLARI) as HujjatKalit[];

export function hujjatTuri(kalit: HujjatKalit): HujjatTuri { return HUJJAT_TURLARI[kalit]; }

/**
 * Hujjat TURLARIga tegishli token narxi kalitlari (HUJJAT_TURLARI[*].tokenKalit). Hujjat bo'lmagan hisobot/paket/ma'lumotnomalar
 * (hujjatTokenBilan({ hujjat: 'XXX' })) ro'yxatga YOZILMAYDI: reestr.test.ts ularni kod ichidan avtomatik yig'adi,
 * shuning uchun yangi eksport kaliti qo'shish boshqa PR larni yiqitmaydi.
 */
export function royxatdagiTokenKalitlari(): Set<string> {
  const s = new Set<string>();
  for (const t of Object.values(HUJJAT_TURLARI) as readonly HujjatTuri[]) if (t.tokenKalit) s.add(t.tokenKalit);
  return s;
}

/** Taqdim resursi → manba jadvali (faqat manba jadvali bor turlar: F2 → t2_akt, АОСР → t2_aosr). */
export const TAQDIM_MANBA_JADVAL = {
  f2: HUJJAT_TURLARI.f2.taqdim.manbaJadval,
  aosr: HUJJAT_TURLARI.aosr.taqdim.manbaJadval,
} as const;

/** Resurs (f2 / aosr) ni qabul qila oladigan tomon rollari — reestrdan; reestrda ko'rsatilmasa null (filtr yo'q). */
export function taqdimQabulRollari(resurs: string): readonly string[] | null {
  for (const k of HUJJAT_KALITLARI) { const q = (HUJJAT_TURLARI[k] as HujjatTuri).taqdim; if (q?.resurs === resurs && q.qabulRollar) return q.qabulRollar; }
  return null;
}

/** Reestrdagi turga taqdim resursi bo'yicha qaytadi (resurs bir nechta turga umumiy bo'lishi mumkin — masalan «hujjat»). */
export function taqdimResursiTurlari(resurs: string): HujjatKalit[] {
  return HUJJAT_KALITLARI.filter((k) => (HUJJAT_TURLARI[k] as HujjatTuri).taqdim?.resurs === resurs);
}
