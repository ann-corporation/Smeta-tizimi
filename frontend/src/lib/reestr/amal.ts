/**
 * AMAL REESTRI (ekotizim V2, 3-qadam): yagona amal = nom + sinonim (uz/ru/en) + ruxsat + parametrlar + tasdiq darajasi (+ ijrochi,
 * lib/reestr/amal-ijro.ts). BIR reestr — uch yuz: Jarvis (Ctrl+K), mindmap kartasi, sahifa tugmalari. Ijrochi YANGI server mantiqi
 * emas: faqat mavjud API klientlari (sbZayavkaYoz, tolovYoz, ...). Sof ma'lumot — API importi yo'q (qidiruv, guard testlar shuni o'qiydi).
 *
 * Qamrov qoidasi (amal.qoplam.test.ts): gateway'dagi HAR yozuv RPC/amali (`sb-yoz` WRITE_COMMAND_POLICY va `yozishYuki` eksport qilgan
 * maxsus gateway'lar) yo bu yerda `qoplaydi` ro'yxatida, yo `amal-hali-yoq.ts` jadvalida SABAB bilan. Yangi yozuv amali ikkalasida ham
 * bo'lmasa test yiqiladi — AI yuzasiz funksiya chiqmaydi.
 */
import type { IlovaKod } from '../ilova/ilovalar';

export type AmalTuri = 'oqish' | 'yozish';
/** yoq — o'qish; karta — oldindan ko'rish + «Tasdiqlash»; ikkiTasdiq — pul/qaytarib bo'lmas amal: karta + ikkinchi «Tasdiqlayman». */
export type AmalTasdiq = 'yoq' | 'karta' | 'ikkiTasdiq';
export type AmalParamTur = 'son' | 'matn' | 'sana' | 'obyekt' | 'shartnoma' | 'qator' | 'tanlov';
/** Parametr qiymati qayerdan: matndan ajratiladi → kontekstdan (joriy obyekt/shartnoma/sana) → bo'lmasa BITTA savol. Pul va hajm HECH QACHON taxmin qilinmaydi. */
export type AmalParam = {
  nom: string;
  tur: AmalParamTur;
  majburiy: boolean;
  /** Kontekstdan olish mumkin bo'lsa: joriy obyekt / shartnoma / bugungi sana. */
  kontekst?: 'obyekt' | 'shartnoma' | 'bugun';
  /** Foydalanuvchiga beriladigan savol (o'zbekcha). */
  savol: string;
  variantlar?: readonly string[];
};
/** Mindmap/entity turlari (amal qaysi tugun/obyekt turida ko'rinadi). */
export type AmalMavzu = 'obyekt' | 'loyiha' | 'shartnoma' | 'kontragent' | 'hujjat' | 'f2' | 'aosr' | 'zayavka' | 'tomon' | 'kompaniya';

export type Amal = {
  kalit: string;
  turi: AmalTuri;
  /** Server RPC nomi (ixtiyoriy; ijrochi API klienti orqali boradi). */
  rpc?: string;
  capability: string;
  ilova: IlovaKod;
  sahifa?: string;
  nom?: string;
  /** Uzbek/rus sinonimlar va inglizcha ('en'). */
  sinonimlar?: readonly string[];
  en?: readonly string[];
  /** Amal bajariladigan/ochiladigan yo'l (ijrochi bo'lmasa — navigatsiya). */
  yol?: string;
  /** Qamrov: `sb-yoz` amal nomlari (oddiy) va maxsus gateway amallari (`gateway:amal`, masalan `tomon:taqdim_yarat`). */
  qoplaydi?: readonly string[];
  tasdiq?: AmalTasdiq;
  parametrlar?: readonly AmalParam[];
  mavzu?: readonly AmalMavzu[];
  /** Natijadan keyingi havola (yol shabloni; {obyekt} almashtiriladi). */
  natijaHavola?: string;
  /** 'model' — qator/hujjat topish naqshlar bilan hal bo'lmaydi: mavjud (hisoblanadigan) model oqimiga yo'naltiriladi. */
  ijro?: 'model';
  ai?: { tavsif: string; kirish: string; xavf: 'past' | 'orta' | 'yuqori'; dryRun: boolean };
  tokenNarx?: number;
  mindmapAmal?: string;
};

const HAJM = { nom: 'hajm', tur: 'son', majburiy: true, savol: 'Qancha hajm? (raqam bilan)' } as const;
const OBYEKT = { nom: 'obyekt', tur: 'obyekt', majburiy: true, kontekst: 'obyekt', savol: 'Qaysi obyekt?' } as const;
const SHARTNOMA = { nom: 'shartnoma', tur: 'shartnoma', majburiy: true, kontekst: 'shartnoma', savol: 'Qaysi shartnoma? (raqami yoki nomi)' } as const;

export const AMALLAR: readonly Amal[] = [
  /* ── Obyekt / smeta / fakt / F2 ───────────────────────────────────────────────────────────────────────────── */
  { kalit: 'obyekt.yangi', turi: 'yozish', capability: 'smeta.write', ilova: 'pto', sahifa: 'obyektlar', yol: '/admin/obyektlar', nom: 'Yangi obyekt / smeta yuklash', sinonimlar: ['yangi obyekt', 'obyekt qo‘shish', 'smeta yuklash', 'новый объект', 'загрузить смету'], en: ['new site', 'upload estimate'], qoplaydi: ['obyekt_yarat', 'obyekt_yangila', 'loyiha_yarat', 'loyiha_yangila', 'loyiha_ochir', 'obyekt_loyihaga_biriktir', 'obyekt_hudud_belgila'], tasdiq: 'karta', mavzu: ['obyekt', 'loyiha'] },
  { kalit: 'smeta.narxlash', turi: 'yozish', capability: 'narx.write', ilova: 'pto', sahifa: 'smeta-narxlash', yol: '/admin/smeta-narxlash', nom: 'Smetani narxlash', sinonimlar: ['narxlash', 'narx qo‘yish', 'расценить смету'], en: ['price the estimate'], qoplaydi: ['smeta_narxla_res', 'smeta_narxla_res_v3', 'narx_belgila', 'narx_sana_qosh', 'narx_protokol_yarat', 'narx_protokol_tasdiqla', 'narx_protokol_bekor', 'price_basis_yarat', 'narx_manba_yoz', 'narx_manba_bekor', 'narx_dalil_bogla', 'narx_dalil_ochir'], tasdiq: 'ikkiTasdiq', mavzu: ['obyekt'] },
  { kalit: 'fakt.kiritish', turi: 'yozish', capability: 'fakt.write', ilova: 'ff', sahifa: 'fakt', yol: '/admin/fakt', nom: 'Fakt kiritish', sinonimlar: ['fakt yozish', 'fakt yoz', 'fakt kirit', 'bajarilgan ish', 'факт записать', 'внести факт'], en: ['enter actuals', 'record work done'], qoplaydi: ['fakt_yoz_v2', 'fakt_belgila_v2', 'fakt_belgila', 'fakt_smetadan_tashqari_v1', 'usta_fakt_qoralama_v1', 'usta_fakt_qaror_v1', 'bajarilmadi_belgila', 'bajarilmadi_bekor'], tasdiq: 'karta', parametrlar: [OBYEKT, { nom: 'qator', tur: 'qator', majburiy: true, savol: 'Qaysi qator? (raqami, shifri yoki nomi)' }, HAJM], mavzu: ['obyekt'] },
  { kalit: 'f2.tayyorlash', turi: 'yozish', capability: 'f2.prepare', ilova: 'ff', sahifa: 'f2-tayyorlash', yol: '/admin/f2-tayyorlash', nom: 'F2 tayyorlash', sinonimlar: ['f2 yaratish', 'yangi f2', 'подготовить ф2'], en: ['prepare F2'], qoplaydi: ['f2_qoralama_yangila_v1', 'akt_yarat_v2', 'akt_podval_yoz_v1', 'akt_correction_create_v1', 'akt_bekor', 'f2_reestr_yoz_v1'], tasdiq: 'karta', mavzu: ['obyekt', 'f2'] },
  { kalit: 'f2.tasdiqlash', turi: 'yozish', capability: 'f2.approve', ilova: 'ff', sahifa: 'f2-tarix', yol: '/admin/f2-tarix', nom: 'F2 ni tasdiqlash', sinonimlar: ['f2 tasdiqla', 'утвердить ф2'], en: ['approve F2'], qoplaydi: ['akt_tasdiqlash', 'akt_lifecycle_transition_v1'], tasdiq: 'ikkiTasdiq', mavzu: ['f2'] },
  { kalit: 'f2.import', turi: 'yozish', capability: 'f2.import', ilova: 'ff', sahifa: 'f2', yol: '/admin/f2', nom: 'F2 faylini yuklash (Excel)', sinonimlar: ['f2 import', 'f2 yuklash', 'импорт ф2'], en: ['import F2 file'], qoplaydi: ['f2_import_job_yarat', 'f2_import_job_ilgarilash', 'f2_import_job_recover', 'f2_import_job_cancel', 'f2_import_draft_saqla'], tasdiq: 'karta', mavzu: ['f2'] },
  { kalit: 'f3.nakopitelniy', turi: 'oqish', capability: 'f2.read', ilova: 'ff', sahifa: 'nakopitelniy', yol: '/admin/nakopitelniy', nom: 'Forma 3 va nakopitelniy', sinonimlar: ['forma 3', 'f3', 'nakopitelniy', 'накопительная', 'счет-фактура'], en: ['form 3', 'cumulative statement'], qoplaydi: ['forma3_f2_bog_v1'], tasdiq: 'yoq', mavzu: ['obyekt', 'f2'] },
  { kalit: 'm29.bajar', turi: 'yozish', capability: 'warehouse.write', ilova: 'ff', sahifa: 'm29', yol: '/admin/m29', nom: 'M-29 (material sarfi)', sinonimlar: ['m29', 'material sarfi', 'м-29'], en: ['M-29 material usage'], qoplaydi: ['m29_bajar_v1', 'm29_bekor_v1'], tasdiq: 'karta', mavzu: ['obyekt'] },
  /* ── Hujjatlar ─────────────────────────────────────────────────────────────────────────────────────────────── */
  { kalit: 'aosr.yaratish', turi: 'yozish', capability: 'document.write', ilova: 'hujjat', sahifa: 'aosr', yol: '/admin/aosr', nom: 'АОСР (yashirin ish akti) tayyorlash', sinonimlar: ['aosr', 'yashirin ish akti', 'акт скрытых работ'], en: ['hidden works act'], qoplaydi: ['aosr_yoz', 'aosr_yoz_v2', 'aosr_bekor', 'aosr_bog_saqla', 'aosr_bog_ochir'], tasdiq: 'karta', mavzu: ['aosr', 'obyekt'] },
  { kalit: 'lab.sorov', turi: 'yozish', capability: 'document.write', ilova: 'hujjat', sahifa: 'laboratoriya', yol: '/admin/laboratoriya', nom: 'Laboratoriyaga sinov so‘rovi', sinonimlar: ['sinov so‘rovi yubor', 'laboratoriyaga so‘rov', 'запрос на испытание'], en: ['lab test request'], qoplaydi: ['lab_protokol_yoz', 'lab_protokol_bekor', 'lab_protokol_bog_saqla', 'laboratoriya:sorov_yarat', 'laboratoriya:natija'], tasdiq: 'karta', mavzu: ['aosr'], natijaHavola: '/admin/laboratoriya', parametrlar: [{ nom: 'aloqa', tur: 'tanlov', majburiy: true, savol: 'Qaysi laboratoriyaga?' }, { nom: 'sinovTuri', tur: 'matn', majburiy: true, savol: 'Qanday sinov? (masalan: beton kub)' }, OBYEKT] },
  { kalit: 'hujjat.yuklash', turi: 'yozish', capability: 'document.write', ilova: 'hujjat', sahifa: 'documents', yol: '/admin/documents', nom: 'Hujjat yuklash', sinonimlar: ['fayl yuklash', 'hujjat qo‘shish', 'загрузить документ'], en: ['upload document'], qoplaydi: ['hujjat_yoz', 'hujjat_ochir', 'fayl_amal_v1'], tasdiq: 'karta', mavzu: ['hujjat'] },
  { kalit: 'chizma.chiqar', turi: 'yozish', capability: 'design.issue', ilova: 'hujjat', sahifa: 'loyihachi', yol: '/admin/chizmalar', nom: 'Chizma revizyasini chiqarish', sinonimlar: ['chizma chiqarish', 'yangi revizya', 'выпустить чертеж'], en: ['issue drawing revision'], qoplaydi: ['loyihachi:toplam_saqla', 'loyihachi:revizya_yarat', 'loyihachi:revizya_tahrir', 'loyihachi:chiqar', 'loyihachi:bekor', 'loyihachi:qaror', 'loyihachi:boglash', 'loyihachi:taklif_yoz', 'loyihachi:taklif_pto'], tasdiq: 'ikkiTasdiq', mavzu: ['loyiha', 'hujjat'] },
  /* ── Tomonlar (hujjat oqimi) ───────────────────────────────────────────────────────────────────────────────── */
  { kalit: 'tomon.aloqa', turi: 'yozish', capability: 'company.member.manage', ilova: 'hujjat', sahifa: 'kontragentlar', yol: '/admin/kontragentlar', nom: 'Tomon bilan aloqa (taklif, qabul, ruxsat berish)', sinonimlar: ['tomon taklif', 'aloqa o‘rnatish', 'пригласить сторону'], en: ['invite party'], qoplaydi: ['tomon:taklif', 'tomon:javob', 'tomon:kod_qabul', 'tomon:holat', 'tomon:grant_saqla', 'tomon:grant_bekor', 'tomon:imzochi_saqla', 'tomon:loyiha_umumiy', 'tomon:ulash', 'taklif_yubor', 'taklif_qabul'], tasdiq: 'karta', mavzu: ['tomon', 'kontragent', 'kompaniya'] },
  { kalit: 'tomon.taqdim', turi: 'yozish', capability: 'document.write', ilova: 'hujjat', sahifa: 'taqdimlar', yol: '/admin/taqdimlar', nom: 'Hujjatni tomonga tasdiqqa yuborish', sinonimlar: ['buyurtmachiga yubor', 'tomonga yubor', 'tasdiqqa yubor', 'texnadzorga yubor', 'отправить на согласование', 'отправить заказчику'], en: ['send for approval'], qoplaydi: ['tomon:taqdim_yarat', 'tomon:taqdim_qaytar'], tasdiq: 'karta', mavzu: ['f2', 'hujjat', 'tomon'], natijaHavola: '/admin/taqdimlar', parametrlar: [{ nom: 'aloqa', tur: 'tanlov', majburiy: true, savol: 'Qaysi tomonga yuboramiz?' }, { nom: 'manba', tur: 'tanlov', majburiy: true, savol: 'Qaysi hujjatni yuboramiz?' }] },
  { kalit: 'tomon.qaror', turi: 'yozish', capability: 'project.read', ilova: 'hujjat', sahifa: 'taqdimlar', yol: '/admin/taqdimlar', nom: 'Kelgan hujjatga qaror (qabul / rad / tuzatish)', sinonimlar: ['hujjatga qaror', 'qabul qil', 'rad et', 'tuzatishga qaytar', 'принять документ', 'отклонить документ'], en: ['decide on submission'], qoplaydi: ['tomon:qaror'], tasdiq: 'ikkiTasdiq', mavzu: ['hujjat', 'tomon'], natijaHavola: '/admin/taqdimlar', parametrlar: [{ nom: 'taqdim', tur: 'tanlov', majburiy: true, savol: 'Qaysi kelgan hujjatga qaror?' }, { nom: 'qaror', tur: 'tanlov', majburiy: true, variantlar: ['qabul', 'tuzatish', 'rad'], savol: 'Qaror qaysi: qabul, tuzatish yoki rad?' }, { nom: 'izoh', tur: 'matn', majburiy: false, savol: 'Sababini qisqa yozing.' }] },
  { kalit: 'tomon.murojaat', turi: 'yozish', capability: 'project.read', ilova: 'hujjat', sahifa: 'murojaatlar', yol: '/admin/murojaatlar', nom: 'Murojaat / remark / predpisaniya yozish', sinonimlar: ['murojaat yoz', 'murojaat yarat', 'remark yoz', 'predpisaniya yoz', 'создать обращение', 'выдать предписание'], en: ['raise remark'], qoplaydi: ['tomon:murojaat_yarat', 'tomon:murojaat_javob', 'tomon:murojaat_hujjat', 'tomon:murojaat_qaror', 'tomon:murojaat_bekor', 'tomon:izoh', 'tomon:qator_izoh', 'tomon:qator_izoh_hal'], tasdiq: 'karta', mavzu: ['tomon', 'hujjat'], natijaHavola: '/admin/murojaatlar', parametrlar: [{ nom: 'aloqa', tur: 'tanlov', majburiy: true, savol: 'Qaysi tomonga murojaat?' }, { nom: 'turi', tur: 'tanlov', majburiy: true, savol: 'Murojaat turi qaysi?' }, { nom: 'sarlavha', tur: 'matn', majburiy: true, savol: 'Murojaat mazmuni (qisqa sarlavha)?' }] },
  /* ── Ta'minot / xarid / logistika ──────────────────────────────────────────────────────────────────────────── */
  { kalit: 'zayavka.yaratish', turi: 'yozish', capability: 'warehouse.write', ilova: 'xarid', sahifa: 'zayavka', yol: '/admin/zayavka', nom: 'Zayavka yaratish', sinonimlar: ['yangi zayavka', 'zayavka och', 'material so‘rash', 'заявка'], en: ['create purchase request'], qoplaydi: ['erp_amal', 'usta_zayavka_v1'], tasdiq: 'karta', mavzu: ['obyekt', 'zayavka'], natijaHavola: '/admin/zayavka', parametrlar: [OBYEKT, { nom: 'material', tur: 'matn', majburiy: true, savol: 'Qaysi material yoki ish uchun?' }, { nom: 'miqdor', tur: 'son', majburiy: true, savol: 'Qancha miqdor kerak?' }] },
  { kalit: 'tender.boshqar', turi: 'yozish', capability: 'procurement.read', ilova: 'xarid', sahifa: 'tender', yol: '/admin/tender', nom: 'Tender: yaratish, taklif, baholash', sinonimlar: ['tender ochish', 'taklif berish', 'тендер'], en: ['tender actions'], qoplaydi: ['tender_saqla_v1', 'tender_otish_v1', 'tender_raund_v1', 'tender_taklif_v2', 'tender_taklif_qaytar_v2', 'tender_savol_ber_v1', 'tender_javob_v1', 'tender_baholash_saqla_v1', 'tender_golib_v2', 'tender_baho_ber_v1', 'tender_fayl_bogla_v1', 'tender_taklif_fayl_bogla_v1', 'birja_rfq_yarat', 'birja_taklif_ber'], tasdiq: 'ikkiTasdiq', mavzu: ['zayavka'] },
  { kalit: 'buyurtma.qabul', turi: 'yozish', capability: 'warehouse.receive', ilova: 'logistika', sahifa: 'logistika', yol: '/admin/logistika', nom: 'Buyurtma va yuk qabuli (yetkazuvchi, ombor)', sinonimlar: ['yuk qabul', 'buyurtma qabul', 'принять груз'], en: ['receive order'], qoplaydi: ['buyurtma_yarat_v1', 'buyurtma_olish_yoz_v1', 'buyurtma_qabul_v1', 'buyurtma_qabul_yakunla_v1', 'buyurtma_otish_v1', 'sklad_kirim_import_v1', 'sklad_kirim_storno_v1', 'sklad_berdim_v1', 'skladga_yozish', 'faktura_yoz', 'sklad_mustaqil_yarat'], tasdiq: 'karta', mavzu: ['zayavka', 'obyekt'] },
  { kalit: 'yuk.birja', turi: 'yozish', capability: 'procurement.read', ilova: 'logistika', sahifa: 'yuk-birjasi', yol: '/admin/yuk-birjasi', nom: 'Yuk birjasi: yuk e‘lon qilish, qabul qilish, reys', sinonimlar: ['yuk e‘lon', 'reys', 'груз', 'рейс'], en: ['publish freight load'], qoplaydi: ['yb_yuk_saqla_v1', 'yb_yuk_javob_v1', 'transport_mashina_saqla_v1', 'transport_haydovchi_saqla_v1', 'transport_hujjat_saqla_v1', 'transport_yoqilgi_narx_saqla_v1', 'transport_tarif_saqla_v1', 'transport_reys_saqla_v1', 'transport_reys_yurish_v1', 'transport_reys_yop_v1', 'transport_reys_bekor_v1', 'transport_xarajat_otkaz_v1'], tasdiq: 'karta', mavzu: ['zayavka'] },
  /* ── Moliya / buxgalteriya / shartnoma ─────────────────────────────────────────────────────────────────────── */
  { kalit: 'moliya.tolov', turi: 'yozish', capability: 'financial.write', ilova: 'moliya', sahifa: 'moliya', yol: '/admin/moliya', nom: 'To‘lov kiritish', sinonimlar: ['tolov kiritish', 'tolov yoz', 'оплата', 'внести оплату'], en: ['enter payment'], qoplaydi: ['tolov_yoz', 'tolov_tahrir', 'tolov_ochir', 'tolov_taqsimot_saqla_v1', 'moliya_qolda_yoz_v1'], tasdiq: 'ikkiTasdiq', mavzu: ['shartnoma'], natijaHavola: '/admin/nakopitelniy', parametrlar: [SHARTNOMA, { nom: 'summa', tur: 'son', majburiy: true, savol: 'To‘lov summasi qancha? (so‘mda, raqam bilan)' }, { nom: 'sana', tur: 'sana', majburiy: true, kontekst: 'bugun', savol: 'Qaysi sana?' }] },
  { kalit: 'moliya.xarajat', turi: 'yozish', capability: 'financial.write', ilova: 'moliya', sahifa: 'moliya', yol: '/admin/moliya', nom: 'Xarajat kiritish', sinonimlar: ['xarajat yoz', 'расход'], en: ['enter expense'], qoplaydi: ['xarajat_yoz', 'xarajat_tahrir', 'xarajat_ochir', 'xarajat_kirit_v1', 'xarajat_bekor_v1'], tasdiq: 'ikkiTasdiq', mavzu: ['shartnoma', 'obyekt'] },
  { kalit: 'shartnoma.qosh', turi: 'yozish', capability: 'financial.write', ilova: 'moliya', sahifa: 'shartnoma-liniya', yol: '/admin/shartnoma-liniya', nom: 'Shartnoma qo‘shish', sinonimlar: ['yangi shartnoma', 'договор', 'новый договор'], en: ['add contract'], qoplaydi: ['shartnoma_saqla', 'shartnoma_saqla_v2', 'shartnoma_ochir', 'shartnoma_bog_saqla', 'shartnoma_qamrov_saqla', 'shartnoma_oylik_paket_saqla_v1', 'shartnoma_hujjat_bogla_v1', 'shartnoma_hujjat_ajrat_v1', 'kontragent_saqla', 'kontragent_ochir', 'nakrutka_saqla', 'nakrutka_podval_saqla', 'nakrutka_podval_ochir', 'nakrutka_koef_saqla'], tasdiq: 'ikkiTasdiq', mavzu: ['shartnoma', 'kontragent', 'obyekt'] },
  { kalit: 'qarz.yoz', turi: 'yozish', capability: 'financial.write', ilova: 'moliya', sahifa: 'qarzdorlik', yol: '/admin/qarzdorlik', nom: 'Qarzdorlik va akt sverkasi', sinonimlar: ['qarzdorlik', 'akt sverka', 'акт сверки', 'задолженность'], en: ['debts and reconciliation'], qoplaydi: ['qarzdorlik_saqla_v1', 'qarzdorlik_import_v1', 'sverka_yozuv_v1', 'sverka_import_v1'], tasdiq: 'ikkiTasdiq', mavzu: ['shartnoma', 'kontragent'] },
  { kalit: 'bux.provodka', turi: 'yozish', capability: 'accounting.write', ilova: 'moliya', sahifa: 'buxgalteriya', yol: '/admin/buxgalteriya', nom: 'Buxgalteriya: provodka, davrni yopish', sinonimlar: ['provodka', 'davrni yopish', 'проводка', 'закрыть период'], en: ['post entry', 'close period'], qoplaydi: ['bux_boshlash_v1', 'bux_hisob_saqla_v1', 'bux_moslik_saqla_v1', 'bux_avto_v1', 'bux_qolda_v1', 'bux_storno_v1', 'bux_shablon_tanla_v1', 'bux_davr_blok_v1', 'bux_hisob_tasdiq_v1', 'bux_bank_import_v1', 'bux_tashqi_v1'], tasdiq: 'ikkiTasdiq', mavzu: ['kompaniya'] },
  { kalit: 'bux.davr', turi: 'yozish', capability: 'accounting.write', ilova: 'moliya', sahifa: 'buxgalteriya', yol: '/admin/buxgalteriya', nom: 'Buxgalteriya davrini yopish', sinonimlar: ['davrni yop', 'oyni yop', 'закрыть период', 'закрыть месяц'], en: ['close accounting period'], qoplaydi: ['bux_davr_v1'], tasdiq: 'ikkiTasdiq', mavzu: ['kompaniya'], natijaHavola: '/admin/buxgalteriya', parametrlar: [{ nom: 'oy', tur: 'matn', majburiy: true, savol: 'Qaysi oy yopiladi? (YYYY-OO, masalan 2026-10)' }] },
  /* ── HR / kompaniya / arxiv ────────────────────────────────────────────────────────────────────────────────── */
  { kalit: 'hr.tabel', turi: 'yozish', capability: 'hr.tabel.write', ilova: 'hr', sahifa: 'hr', yol: '/admin/hr', nom: 'Tabel va oylik', sinonimlar: ['tabel', 'davomat', 'табель', 'зарплата'], en: ['timesheet'], qoplaydi: ['hr_xodim_saqla_v1', 'hr_sxema_saqla_v1', 'hr_kalendar_saqla_v1', 'hr_tabel_saqla_v1', 'hr_tuzatma_saqla_v1', 'hr_tuzatma_qaror_v1', 'hr_oylik_v1', 'kadr_mustaqil_yarat', 'texnika_mustaqil_yarat'], tasdiq: 'karta', mavzu: ['kompaniya'] },
  { kalit: 'azo.taklif', turi: 'yozish', capability: 'company.member.manage', ilova: 'yadro', sahifa: 'kompaniya', yol: '/admin/kompaniya', nom: 'A‘zo taklif qilish va rol berish', sinonimlar: ['xodim qo‘shish', 'yangi a‘zo', 'пригласить сотрудника'], en: ['invite member'], qoplaydi: ['azolik_qosh', 'azolik_rol_ozgartir', 'azolik_ochir', 'kompaniya_yangila', 'loyiha_qatnashchi_biriktir', 'loyiha_qatnashchi_ochir'], tasdiq: 'ikkiTasdiq', mavzu: ['kompaniya'] },
  { kalit: 'arxiv.obyekt', turi: 'yozish', capability: 'smeta.write', ilova: 'pto', sahifa: 'obyektlar', yol: '/admin/korzinka', nom: 'Obyektni arxivga (Korzinkaga) yuborish', sinonimlar: ['obyektni arxivla', 'obyektni korzinkaga yubor', 'arxivga yubor', 'отправить в архив', 'в корзину объект'], en: ['archive site'], qoplaydi: ['arxivla_v1', 'arxivdan_tiklash_v1', 'arxiv_butunlay_v1', 'korzinkaga_tashlash', 'korzinkadan_tiklash', 'butunlay_ochirish'], tasdiq: 'ikkiTasdiq', mavzu: ['obyekt', 'loyiha', 'shartnoma'], parametrlar: [OBYEKT] },
  { kalit: 'ruxsat.korish', turi: 'oqish', capability: 'control.company.read', ilova: 'yadro', sahifa: 'ruxsatlar-jadvali', yol: '/admin/ruxsatlar-jadvali', nom: 'Kim nimani ko‘radi (ruxsatlar jadvali)', sinonimlar: ['ruxsatlar', 'rollar jadvali', 'права доступа'], en: ['permissions matrix'], tasdiq: 'yoq' },
];

export const AMAL_MAP: ReadonlyMap<string, Amal> = new Map(AMALLAR.map((a) => [a.kalit, a]));