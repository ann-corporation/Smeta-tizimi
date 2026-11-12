/**
 * YAGONA VOSITALAR REESTRI — yordamchi (Jarvis) nima qila olishining BITTA manbasi (egasi 2026-11-11: «tizimning eng katta
 * ustunligi — HAR ISHNI AI orqali oson bajarish»). Uch guruh:
 *   navigatsiya — navReestr dagi HAR sahifa (avtomatik; yangi sahifa o'zi qo'shiladi);
 *   oqish       — obyekt ma'lumotini o'qish (sahifalar ishlatadigan hisob yadrosi funksiyalari orqali, qayta hisoblamaydi);
 *   yozuv       — faqat mavjud xavfsiz yo'llar, DOIM taklif kartasi («Tasdiqlash») bilan; pul/huquqiy amal — ikkinchi tasdiq.
 * Yangi sahifa yoki yangi RPC qo'shgan kishi: docs/architecture/AI_YORDAMCHI.md qoidasi — shu reestrga ham yozadi
 * (`vositalar-reestr.test.ts` bo'lmasa yiqiladi).
 */
import { NAV_SAHIFALAR } from '../nav/navReestr';
import { SAHIFA_VOSITALARI } from '../ai-yordamchi/protokol';
import { pultAsboblar } from '../mindmap-pult';
import type { YordamchiSahifa } from './sahifa-qidiruv';

export type VositaTur = 'navigatsiya' | 'oqish' | 'yozuv';
/** yoq — hech narsa yozilmaydi; karta — taklif kartasi + «Tasdiqlash»; kartaPul — kartadan keyin ikkinchi «Tasdiqlayman». */
export type VositaTasdiq = 'yoq' | 'karta' | 'kartaPul';

export type YordamchiVosita = {
  id: string; tur: VositaTur; nom: string; misol: readonly string[]; tasdiq: VositaTasdiq;
  /** Yozuv/o'qish qaysi mavjud yo'ldan o'tadi (yangi RPC yaratilmaydi). */
  manba: string;
  /** Model sxemasidagi nom (SAHIFA_VOSITALARI.buyruq oqish/amal), bo'lsa. */
  modelNomi?: string;
};

/** O'qish va yozish vositalari (qo'lda yoziladi: har biri mavjud yo'lga bog'langan). */
export const STATIK_VOSITALAR: readonly YordamchiVosita[] = [
  { id: 'oqish.holat', tur: 'oqish', nom: 'Obyekt holati (smeta, fakt, F2, qoldiq)', misol: ['Yevropa 1 holati qanday?'], tasdiq: 'yoq', manba: 'buyruq-vositalar.buyruqOqi(holat) -> fakt-jurnal.bolimSummalari', modelNomi: 'holat' },
  { id: 'oqish.narxsiz', tur: 'oqish', nom: 'Narxsiz qatorlar', misol: ['narxsiz qatorlarni ko‘rsat'], tasdiq: 'yoq', manba: 'buyruq-vositalar.buyruqNarxsiz', modelNomi: 'narxsiz' },
  { id: 'oqish.qoldiq', tur: 'oqish', nom: 'Qoldiq (smeta − F2) va fakt qoldig‘i', misol: ['qoldiq eng katta ishlar qaysi?'], tasdiq: 'yoq', manba: 'buyruq-vositalar.buyruqQoldiq', modelNomi: 'qoldiq' },
  { id: 'oqish.qidir', tur: 'oqish', nom: 'Smeta qatorlarini qidirish', misol: ['qidir beton B25'], tasdiq: 'yoq', manba: 'fakt-vositalar.faktQidir', modelNomi: 'qidir' },
  { id: 'yozuv.fakt_hajm', tur: 'yozuv', nom: 'Fakt hajmi (+x bugun / =x jami)', misol: ['beton +5 kirit'], tasdiq: 'karta', manba: 'sbFaktYoz -> fakt_yoz_v2 (operation_id bilan)', modelNomi: 'fakt_hajm' },
  { id: 'yozuv.narx_tuzat', tur: 'yozuv', nom: 'Narx tuzatish (protokol qoralamasi)', misol: ['bu qator narxini 120000 qil'], tasdiq: 'kartaPul', manba: 'narxProtokolYarat -> narx_protokol_yarat', modelNomi: 'narx_tuzat' },
  { id: 'yozuv.arxivla', tur: 'yozuv', nom: 'Joriy obyektni Korzinkaga yuborish (tiklanadi; tasdiqlangan hujjat bo‘lsa rad)', misol: ['bu obyektni arxivla'], tasdiq: 'kartaPul', manba: 'sbArxivla -> arxivla_v1 (t2_arxivla_v1; loyiha/shartnoma/kontragent/АОСР/F2 qoralama — o‘z sahifasida «Korzinkaga»)', modelNomi: 'arxivla' },
  { id: 'yozuv.korsat', tur: 'oqish', nom: 'Qatorni ko‘rsatish', misol: ['shu qatorni ko‘rsat'], tasdiq: 'yoq', manba: 'AI buyruq: korsat (hech narsa yozilmaydi)', modelNomi: 'korsat' },
  { id: 'yozuv.lab_sorov', tur: 'yozuv', nom: 'Sinov so‘rovi yuborish (laboratoriyaga; АОСР / ish qatori kontekstida)', misol: ['АОСР 12 uchun beton kub sinov so‘rovi yubor', 'отправь запрос на испытание бетона'], tasdiq: 'karta', manba: 'sorovYubor -> /api/laboratoriya sorov_yarat -> t2_lab_sorov_yarat_v1 (operation_id bilan; «So‘rov yuborish» tugmasi = tasdiq kartasi, /admin/aosr yoki /admin/laboratoriya)' },
  { id: 'qoralama.aosr_sinov', tur: 'navigatsiya', nom: 'Laboratoriya kabineti: kelgan sinov so‘rovlari va protokol to‘ldirish', misol: ['sinov so‘rovlarini och'], tasdiq: 'yoq', manba: '/admin/laboratoriya — natijani laboratoriya mas‘uli o‘zi tanlaydi' },
  { id: 'qoralama.f2', tur: 'navigatsiya', nom: 'F2 qoralamasi (oy uchun): F2 tayyorlash sahifasini obyekt va oy bilan ochadi', misol: ['Amfiteatr oktabr F2 tayyorla'], tasdiq: 'yoq', manba: '/admin/f2-tayyorlash?obyekt&oy — tasdiqlash faqat sahifada, qo‘lda' },
  /* Loyihachi / mualliflik nazorati (lib/loyihachi/amallar.ts: capability + RPC + dryRun). Yozuvlar avval /admin/chizmalar sahifasida ko'rsatiladi; AI faqat sahifani obyekt bilan ochadi. */
  { id: 'oqish.chizma', tur: 'navigatsiya', nom: 'Chizmalar va revizyalar: joriy/eskirgan, qaror holati, tayangan smeta qatori va АОСР', misol: ['chizmalar holati', 'eskirgan chizmaga tayangan ishlar'], tasdiq: 'yoq', manba: '/admin/chizmalar -> t2_chizma_royxat_v1, t2_chizma_taasir_v1' },
  { id: 'oqish.loyihachi_bugun', tur: 'navigatsiya', nom: 'Loyihachi: bugungi ishlar (qoralama revizya, savol, remark, taklif)', misol: ['loyihachi bugun'], tasdiq: 'yoq', manba: '/admin/loyihachi -> t2_loyihachi_bugun_v1' },
  { id: 'yozuv.chizma_chiqar', tur: 'navigatsiya', nom: 'Chizma revizyasini chiqarish va qabul qilish: Chizmalar sahifasini ochadi (chiqarish/qaror faqat sahifada, qo‘lda)', misol: ['yangi chizma revizyasini chiqar'], tasdiq: 'yoq', manba: '/admin/chizmalar -> t2_chizma_chiqar_v1 (design.issue), t2_chizma_qaror_v1' },
  { id: 'yozuv.mualliflik_remark', tur: 'navigatsiya', nom: 'Savol (RFI) va mualliflik remarki: Murojaatlar sahifasini tur bilan ochadi', misol: ['loyihachiga savol yoz', 'mualliflik remarki'], tasdiq: 'yoq', manba: '/admin/murojaatlar?turi=savol|mualliflik_remark -> t2_tomon_murojaat_yarat_v1' },
  { id: 'qoralama.zayavka', tur: 'navigatsiya', nom: 'Zayavka yaratish: zayavka sahifasi yangi zayavka formasi ochiq holda keladi', misol: ['zayavka yarat', 'yangi zayavka'], tasdiq: 'yoq', manba: '/admin/zayavka?yarat=1&obyekt — yuborish (zayavka_yarat) faqat formada, qo‘lda' },
  { id: 'qoralama.yetkazuvchi', tur: 'navigatsiya', nom: 'Yetkazuvchi: bugun — kelgan so‘rovlar, buyurtmalar, transport', misol: ['yetkazuvchi bugun', 'menga kelgan so‘rovlar'], tasdiq: 'yoq', manba: '/admin/yetkazuvchi' },
  /* HR «Mening oyligim va KPI» (2026-11-12): faqat o'z qatori (RPC t2_hr_men_v1), hech narsa yozilmaydi. Ruxsatsiz xodim uchun /admin/hr o'zi shu tabni ochadi. */
  { id: 'oqish.mening_oyligim', tur: 'navigatsiya', nom: 'Mening oyligim va KPI: ish haqi, naryad (donabay), ushlanmalar, KPI ko‘rsatkichlari manbasi bilan', misol: ['mening oyligim', 'mening kpi', 'моя зарплата', 'my salary'], tasdiq: 'yoq', manba: '/admin/hr?tab=men -> t2_hr_men_v1 (faqat o‘z qatori)' },
  { id: 'qoralama.aosr', tur: 'navigatsiya', nom: 'АОСР qoralamasi: АОСР sahifasini ochadi', misol: ['АОСР tayyorla'], tasdiq: 'yoq', manba: '/admin/aosr — tasdiqlash faqat sahifada, qo‘lda' },
];

const slug = (yol: string) => yol.replace(/^\/admin\//, '').replace(/[^a-z0-9]+/gi, '_');

/** Navigatsiya vositalari: ro'yxatdagi (yoki berilgan ruxsatli) HAR sahifa uchun bittadan. */
export function navVositalar(sahifalar: readonly YordamchiSahifa[] = NAV_SAHIFALAR.map((s) => ({ yol: s.yol, nom: s.nom }))): YordamchiVosita[] {
  return sahifalar.map((s) => ({ id: `nav.${slug(s.yol)}`, tur: 'navigatsiya' as const, nom: s.nom, misol: [`${s.nom} sahifasini och`], tasdiq: 'yoq' as const, manba: s.yol }));
}

/**
 * Mindmap «Boshqaruv pulti» amallari (lib/mindmap-pult.ts pultAsboblar() — UI va yordamchi uchun yagona modul): har biri yozuv vositasi,
 * DOIM oldindan ko'rish (PultReja) + tasdiq bilan; 	ayyorla hech narsa yozmaydi. Yangi pult amali qo'shilsa shu yerga o'zi tushadi.
 */
export function pultVositalar(): YordamchiVosita[] {
  return pultAsboblar().map((a) => ({ id: a.nom, tur: 'yozuv' as const, nom: a.tavsif, misol: [a.tavsif.split(' — ')[0]], tasdiq: 'karta' as const, manba: 'lib/mindmap-pult.ts (' + a.nishonTuri + ') -> mindmap_* /api/sb-yoz' }));
}

/** Hamma vositalar: berilgan sahifalar uchun navigatsiya + statik o'qish/yozuv + mindmap pult amallari. */
export const barchaVositalar = (sahifalar?: readonly YordamchiSahifa[]): YordamchiVosita[] => [...navVositalar(sahifalar), ...STATIK_VOSITALAR, ...pultVositalar()];

/** «Nima qila olasan?» javobi — reestrdan (qo'lda matn emas, shuning uchun eskirmaydi). */
export function yordamMatni(sahifalar: readonly YordamchiSahifa[]): string {
  const yozuv = STATIK_VOSITALAR.filter((v) => v.tur === 'yozuv').map((v) => `- ${v.nom}${v.tasdiq === 'kartaPul' ? ' (pul: ikki marta tasdiq)' : ''}`);
  const oqish = STATIK_VOSITALAR.filter((v) => v.tur === 'oqish' && v.id !== 'yozuv.korsat').map((v) => `- ${v.nom}`);
  return [
    `**Sahifalarni ochaman** (${sahifalar.length} ta bo‘lim): «mindmapni och», «Yevropa 1 ning F2 sini och», «АОСР sahifasi», «qarzdorlik».`,
    '**Ma’lumotni aytaman** (obyekt tanlangan bo‘lsa):', ...oqish,
    '**Yozishni taklif qilaman** — avval ko‘rsataman, siz «Tasdiqlash» bosganingizdagina yoziladi:', ...yozuv,
    '- F2 va АОСР qoralamasini tayyorlab ko‘rsataman («Bajarish» dan keyin yoziladi); tasdiqlashni o‘zingiz qilasiz.',
    '- Mindmapda tuzilma qurish (loyiha, obyekt, shartnoma, bog‘lash) — xarita sahifasida, har amal oldindan ko‘rsatiladi.',
    'Tushunmasam — rad etmayman, eng yaqin sahifa va amallarni taklif qilaman. Ovoz bilan ham gapirishingiz mumkin (mikrofon tugmasi).',
  ].join('\n');
}

/** Model sxemasi (SAHIFA_VOSITALARI.buyruq) bilan reestr mosligi: sxemada bor, reestrda yo'q vosita/amal — xato (test). */
export function modelSxemasidaYoqlari(): string[] {
  const bor = new Set(STATIK_VOSITALAR.map((v) => v.modelNomi).filter(Boolean));
  const b = SAHIFA_VOSITALARI.buyruq;
  return [...b.oqish, ...b.amal.filter((a) => a !== 'och')].filter((n) => !bor.has(n));
}
