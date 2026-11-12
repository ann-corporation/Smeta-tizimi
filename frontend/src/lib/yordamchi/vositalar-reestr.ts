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
import { AI_ISHCHI_VOSITALARI } from './vositalar-ai-ishchi';

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
  { id: 'oqish.lugat', tur: 'oqish', nom: 'Qurilish lug‘ati: oddiy so‘z (g‘isht, pol quyish) ↔ smeta tili', misol: ['g‘isht degani smetada nima?'], tasdiq: 'yoq', manba: 'qurilish-lugat.lugatTushuntir + fakt-vositalar.faktQidir (qidiruv lug‘ati)', modelNomi: 'lugat' },
  { id: 'oqish.kelishuv', tur: 'oqish', nom: 'Usta narxi (o‘z birligida) smetaga sig‘adimi: oltin o‘rtalik', misol: ['rigelni metriga 250 mingdan quysa smetaga sig‘adimi?'], tasdiq: 'yoq', manba: 'naryad/kelishuv.kelishuvHisob + naryad/jarvis.kelishuvMatni (smeta resurslaridan, hisob-yadro)', modelNomi: 'kelishuv' },
  { id: 'oqish.naryad', tur: 'oqish', nom: 'Naryadlar (brigada topshirig‘i): holat, usta, to‘lov', misol: ['qabul qilingan naryadlar qaysilar?'], tasdiq: 'yoq', manba: 'naryad_ol_v1 -> naryad/jarvis.naryadMatni (yozuv — «Naryad» sahifasida)', modelNomi: 'naryad' },
  { id: 'yozuv.fakt_hajm', tur: 'yozuv', nom: 'Fakt hajmi (+x bugun / =x jami)', misol: ['beton +5 kirit'], tasdiq: 'karta', manba: 'sbFaktYoz -> fakt_yoz_v2 (operation_id bilan)', modelNomi: 'fakt_hajm' },
  { id: 'yozuv.narx_tuzat', tur: 'yozuv', nom: 'Narx tuzatish (protokol qoralamasi)', misol: ['bu qator narxini 120000 qil'], tasdiq: 'kartaPul', manba: 'narxProtokolYarat -> narx_protokol_yarat', modelNomi: 'narx_tuzat' },
  { id: 'yozuv.arxivla', tur: 'yozuv', nom: 'Joriy obyektni Korzinkaga yuborish (tiklanadi; tasdiqlangan hujjat bo‘lsa rad)', misol: ['bu obyektni arxivla'], tasdiq: 'kartaPul', manba: 'sbArxivla -> arxivla_v1 (t2_arxivla_v1; loyiha/shartnoma/kontragent/АОСР/F2 qoralama — o‘z sahifasida «Korzinkaga»)', modelNomi: 'arxivla' },
  { id: 'yozuv.korsat', tur: 'oqish', nom: 'Qatorni ko‘rsatish', misol: ['shu qatorni ko‘rsat'], tasdiq: 'yoq', manba: 'AI buyruq: korsat (hech narsa yozilmaydi)', modelNomi: 'korsat' },
  { id: 'yozuv.lab_sorov', tur: 'yozuv', nom: 'Sinov so‘rovi yuborish (laboratoriyaga; АОСР / ish qatori kontekstida)', misol: ['АОСР 12 uchun beton kub sinov so‘rovi yubor', 'отправь запрос на испытание бетона'], tasdiq: 'karta', manba: 'sorovYubor -> /api/laboratoriya sorov_yarat -> t2_lab_sorov_yarat_v1 (operation_id bilan; «So‘rov yuborish» tugmasi = tasdiq kartasi, /admin/aosr yoki /admin/laboratoriya)' },
  { id: 'qoralama.aosr_sinov', tur: 'navigatsiya', nom: 'Laboratoriya kabineti: kelgan sinov so‘rovlari va protokol to‘ldirish', misol: ['sinov so‘rovlarini och'], tasdiq: 'yoq', manba: '/admin/laboratoriya — natijani laboratoriya mas‘uli o‘zi tanlaydi' },
  { id: 'qoralama.f2', tur: 'navigatsiya', nom: 'F2 qoralamasi (oy uchun): F2 tayyorlash sahifasini obyekt va oy bilan ochadi', misol: ['Amfiteatr oktabr F2 tayyorla'], tasdiq: 'yoq', manba: '/admin/f2-tayyorlash?obyekt&oy — tasdiqlash faqat sahifada, qo‘lda' },
  { id: 'navigatsiya.grafik', tur: 'navigatsiya', nom: 'Ish grafigi (reja va fakt, kechikayotgan razdellar) va oylik hisob prognozi: grafik sahifasini obyekt bilan ochadi', misol: ['Amfiteatr grafigi', 'kechikayotgan ishlar', 'pul oqimi prognozi'], tasdiq: 'yoq', manba: '/admin/grafik?obyekt&tab - hisob sahifada (hisob yadrosi), yozuvsiz' },
  { id: 'nazorat.tekshiruv', tur: 'navigatsiya', nom: 'Texnik nazorat: yangi tekshiruv (sayt) sahifasini ochadi; yakunlash va predpisaniya berish faqat sahifada, qo‘lda', misol: ['yangi tekshiruv boshla', 'beton ishini tekshir'], tasdiq: 'yoq', manba: '/admin/nazorat/tekshiruv' },
  { id: 'nazorat.predpisaniya', tur: 'oqish', nom: 'Muddati o‘tgan predpisaniyalar va qayta tekshiruv kutayotganlari', misol: ['qaysi predpisaniya kechikdi?'], tasdiq: 'yoq', manba: '/api/tomon?bolim=nazorat_uy va murojaatlar (mavjud RPC; yangi yozuv yo‘q)' },
  { id: 'nazorat.qaror', tur: 'oqish', nom: 'АОСР va F2 qaror kutayotganlari (dalil va tekshiruv bilan)', misol: ['АОСР qarori kutayotganlar'], tasdiq: 'yoq', manba: '/admin/taqdimlar?tur=aosr | f2 — qaror faqat sahifada, qo‘lda' },
  /* Loyihachi / mualliflik nazorati (lib/loyihachi/amallar.ts: capability + RPC + dryRun). Yozuvlar avval /admin/chizmalar sahifasida ko'rsatiladi; AI faqat sahifani obyekt bilan ochadi. */
  { id: 'oqish.chizma', tur: 'navigatsiya', nom: 'Chizmalar va revizyalar: joriy/eskirgan, qaror holati, tayangan smeta qatori va АОСР', misol: ['chizmalar holati', 'eskirgan chizmaga tayangan ishlar'], tasdiq: 'yoq', manba: '/admin/chizmalar -> t2_chizma_royxat_v1, t2_chizma_taasir_v1' },
  /* Loyiha <-> Smeta <-> Fakt (2026-11-12): chizma hajmlari, smeta va fakt farqlari pul ta'siri bilan. AI sahifani obyekt bilan ochadi; tasdiq va qarorlar faqat sahifada, qo'lda. */
  { id: 'oqish.loyiha_tahrir', tur: 'oqish', nom: 'Chizma tahrirlari farqi: loyihada nima o‘zgardi, smeta qaysi joyda eskirgan (pul ta‘siri QQS bilan, QQS siz)', misol: ['loyihada nima o‘zgardi', 'smeta qaysi joyda eskirgan', 'что изменилось в проекте'], tasdiq: 'yoq', manba: 'buyruq-vositalar.buyruqOqi(loyiha_tahrir) -> lib/loyiha-smeta/tahrir-jarvis.tahrirMatni (t2_loyiha_tahrir_farq_v1)', modelNomi: 'loyiha_tahrir' },
  { id: 'oqish.loyiha_smeta_farq', tur: 'oqish', nom: 'Loyiha bilan smetani solishtirish: КР-5 da nima farq, smetaga kirmagan ishlar qancha (QQS bilan, QQS siz)', misol: ['loyiha bilan smetani solishtir', 'КР-5 da nima farq', 'smetaga kirmagan ishlar qancha'], tasdiq: 'yoq', manba: 'buyruq-vositalar.buyruqOqi(loyiha_farq) -> lib/loyiha-smeta/jarvis.loyihaFarqMatni (t2_loyiha_farq_v1)', modelNomi: 'loyiha_farq' },
  { id: 'oqish.loyihachi_bugun', tur: 'navigatsiya', nom: 'Loyihachi: bugungi ishlar (qoralama revizya, savol, remark, taklif)', misol: ['loyihachi bugun'], tasdiq: 'yoq', manba: '/admin/loyihachi -> t2_loyihachi_bugun_v1' },
  { id: 'yozuv.chizma_chiqar', tur: 'navigatsiya', nom: 'Chizma revizyasini chiqarish va qabul qilish: Chizmalar sahifasini ochadi (chiqarish/qaror faqat sahifada, qo‘lda)', misol: ['yangi chizma revizyasini chiqar'], tasdiq: 'yoq', manba: '/admin/chizmalar -> t2_chizma_chiqar_v1 (design.issue), t2_chizma_qaror_v1' },
  { id: 'yozuv.mualliflik_remark', tur: 'navigatsiya', nom: 'Savol (RFI) va mualliflik remarki: Murojaatlar sahifasini tur bilan ochadi', misol: ['loyihachiga savol yoz', 'mualliflik remarki'], tasdiq: 'yoq', manba: '/admin/murojaatlar?turi=savol|mualliflik_remark -> t2_tomon_murojaat_yarat_v1' },
  { id: 'qoralama.zayavka', tur: 'navigatsiya', nom: 'Zayavka yaratish: zayavka sahifasi yangi zayavka formasi ochiq holda keladi', misol: ['zayavka yarat', 'yangi zayavka'], tasdiq: 'yoq', manba: '/admin/zayavka?yarat=1&obyekt — yuborish (zayavka_yarat) faqat formada, qo‘lda' },
  { id: 'qoralama.yuk_chaqirish', tur: 'navigatsiya', nom: 'Yuk chaqirish: 3 qadamli forma (nima, qayerdan qayerga, qachon) va narx bahosi', misol: ['5 tonna sement uchun mashina top', 'yuk e‘lon qil'], tasdiq: 'yoq', manba: '/admin/yuk-chaqirish?nom&tonna&a_nom&b_nom — e‘lon (yuk chaqirish) faqat formada, qo‘lda; AI parametrni to‘ldirishi keyingi qadam' },
  { id: 'qoralama.haydovchi', tur: 'navigatsiya', nom: 'Haydovchi rejimi: liniyaga chiqish, yaqin yuklar, reys qadamlari', misol: ['haydovchi rejimi', 'yaqin yuklarni ko‘rsat'], tasdiq: 'yoq', manba: '/admin/haydovchi -> t2_yb_p1_yaqin_v1, t2_yb_p1_qadam_v1' },
  { id: 'qoralama.yetkazuvchi', tur: 'navigatsiya', nom: 'Yetkazuvchi: bugun — kelgan so‘rovlar, buyurtmalar, transport', misol: ['yetkazuvchi bugun', 'menga kelgan so‘rovlar'], tasdiq: 'yoq', manba: '/admin/yetkazuvchi' },
  { id: 'qoralama.subpudratchi', tur: 'navigatsiya', nom: 'Subpudratchi: bugun — menga topshirilgan ishlar, hajm kiritish, akt, to‘lov holati', misol: ['subpudratchi bugun', 'sub aktim'], tasdiq: 'yoq', manba: '/admin/subpudratchi' },
  { id: 'yozuv.sub_akt_qabul', tur: 'navigatsiya', nom: 'Subpudratchi aktini qabul qilish yoki qaytarish, ishni subpudratchiga topshirish: Subpudrat boshqaruvi sahifasini ochadi (qaror faqat sahifada, qo‘lda)', misol: ['subpudratchi aktini qabul qil', 'subpudratga ish topshir'], tasdiq: 'yoq', manba: '/admin/subpudrat -> t2_sub_akt_qaror_v1, t2_sub_topshir_v1' },
  /* HR «Mening oyligim va KPI» (2026-11-12): faqat o'z qatori (RPC t2_hr_men_v1), hech narsa yozilmaydi. Ruxsatsiz xodim uchun /admin/hr o'zi shu tabni ochadi. */
  { id: 'oqish.usta_bugun', tur: 'oqish', nom: 'Bugungi ishlarim va naryadlarim (usta o‘z birligida), holat va bu oy ishlab topganim', misol: ['bugungi ishlarim', 'naryadim', 'qancha ishlab topdim', 'мои работы на сегодня', 'сколько я заработал', 'my work orders'], tasdiq: 'yoq', manba: '/admin/bugun -> naryad_ol_v1 (o‘z naryadlari) + t2_hr_men_v1 (donabay qism); matn: lib/usta/naryad-ish.ustaJarvisMatni (Jarvis vositasi mening_naryadim)', modelNomi: 'mening_naryadim' },
  { id: 'oqish.mening_oyligim', tur: 'navigatsiya', nom: 'Mening oyligim va KPI: ish haqi, naryad (donabay), ushlanmalar, KPI ko‘rsatkichlari manbasi bilan', misol: ['mening oyligim', 'mening kpi', 'моя зарплата', 'my salary'], tasdiq: 'yoq', manba: '/admin/hr?tab=men -> t2_hr_men_v1 (faqat o‘z qatori)' },
  { id: 'oqish.foyda_zarar', tur: 'navigatsiya', nom: 'Foyda / zarar: loyiha, shartnoma, obyekt va kompaniya plyusdami yoki minusdami (bajarilgan ish − xarajat; kiritilmagan xarajat «—»)', misol: ['loyiha plyusdami minusdami', 'foyda zarar', 'прибыль убыток'], tasdiq: 'yoq', manba: '/admin/moliya?tab=foyda -> rahbar_panel_v1 + t2_xarajat + t2_tolov (yangi RPC yo‘q; hisob lib/foyda-zarar -> hisob-yadro)' },
  { id: 'qoralama.aosr', tur: 'navigatsiya', nom: 'АОСР qoralamasi: АОСР sahifasini ochadi', misol: ['АОСР tayyorla'], tasdiq: 'yoq', manba: '/admin/aosr — tasdiqlash faqat sahifada, qo‘lda' },
  { id: 'foto.hisobot', tur: 'navigatsiya', nom: 'Foto-dalil va foto-hisobot: foto sahifasini obyekt bilan ochadi (yuklash, lenta, Excel/PDF hisobot)', misol: ['Amfiteatr foto hisobot', 'foto yukla'], tasdiq: 'yoq', manba: '/admin/foto?obyekt — yuklash va AI tavsifi sahifada (AI faqat taklif, token yechadi)' },
  // Buyurtmachi («Bugun»): hammasi mavjud /api/tomon yo'llari orqali; pul amallari — ikkinchi tasdiq bilan.
  { id: 'oqish.buyurtmachi_bugun', tur: 'oqish', nom: 'Buyurtmachi portfeli: sizdan kutilayotganlar, obyektlar bo‘yicha shartnoma, smeta, fakt, F2, Forma-3, to‘langan, qarz', misol: ['qaror kutayotgan hujjatlarim', 'qaysi obyektda qarz bor?'], tasdiq: 'yoq', manba: '/api/tomon?bolim=bugun -> t2_zakazchik_bugun_v1 (grant bo‘yicha qirqilgan; hisob yadrosi paketi)' },
  { id: 'qoralama.predpisaniya', tur: 'navigatsiya', nom: 'Predpisaniya / remark berish: murojaat shaklini turi oldindan tanlab ochadi (muddat va foto bilan)', misol: ['pudratchiga predpisaniya yoz'], tasdiq: 'yoq', manba: '/admin/murojaatlar?yangi=predpisaniya — yuborish faqat sahifada, qo‘lda' },
  { id: 'yozuv.tolov_xabar', tur: 'yozuv', nom: 'Forma-3 bo‘yicha to‘lov xabari (buyurtmachi, QQS bilan); pudratchi tasdiqlamaguncha qarzdan ayirilmaydi', misol: ['Fast Food uchun 50 mln to‘lov xabari yoz'], tasdiq: 'kartaPul', manba: 'tomonYoz(tolov_xabar) -> /api/tomon -> t2_zakazchik_tolov_yoz_v1 (operation_id bilan)' },
  { id: 'yozuv.tolov_qaror', tur: 'yozuv', nom: 'Kelgan to‘lov xabarini tasdiqlash yoki sabab bilan rad etish (pudratchi rahbari)', misol: ['to‘lov xabarini tasdiqla'], tasdiq: 'kartaPul', manba: 'tomonYoz(tolov_qaror) -> /api/tomon -> t2_tomon_tolov_qaror_v1' },
  { id: 'qoralama.bozor_narx_solishtir', tur: 'navigatsiya', nom: 'Bozor narxlarini solishtirish (masalan g‘isht): vitrinani qidiruv bilan ochadi; narxlar QQS siz, bir nechta sotuvchi bo‘lsa o‘rtacha ko‘rsatiladi', misol: ['g‘isht narxlarini solishtir', 'сравни цены на кирпич', 'compare brick prices'], tasdiq: 'yoq', manba: '/bozor — ochiq vitrina (t2_bz_ochiq_qidir_v1)' },
  { id: 'qoralama.bozor_narx_sora', tur: 'navigatsiya', nom: 'Bozordan narx so‘rash: nom, birlik va hajm bilan to‘ldirilgan so‘rov formasini ochadi (zayavka/smeta qatoridan)', misol: ['bozordan narx so‘ra', 'sement uchun bozordan narx so‘ra', 'запроси цену на рынке'], tasdiq: 'yoq', manba: '/admin/bozor-sorov?yarat=1&nom&birlik&hajm — so‘rovni yuborish formada, qo‘lda (t2_bz_sorov_yarat_v1)' },
  { id: 'qoralama.bozor_elon_ber', tur: 'navigatsiya', nom: 'E‘lon berish: sotuvchi kabinetidagi tez e‘lon formasini ochadi (nom, narx, birlik, rasm)', misol: ['e‘lon ber', 'sement sotaman e‘lon ber', 'подать объявление'], tasdiq: 'yoq', manba: '/admin/bozor-kabinet — e‘lon formada, qo‘lda (t2_bz_elon_saqla_v1)' },
  { id: 'qoralama.tender_elon', tur: 'navigatsiya', nom: 'Shu zayavkaga tender e‘lon qilish: zayavka qatori bilan to‘ldirilgan ochiq tender lot formasini ochadi (e‘lon formada, qo‘lda)', misol: ['shu zayavkaga tender e‘lon qil', 'объяви тендер по этой заявке', 'announce a tender for this request'], tasdiq: 'yoq', manba: '/admin/tender-ochiq?yarat=1&nom&birlik&hajm&zayavka_id — lot yaratish formada (t2_tender_saqla_v1 / t2_tn_lot_smetadan_v1)' },
  { id: 'qoralama.tender_natija', tur: 'navigatsiya', nom: 'Tender natijasi: ochiq tenderlar sahifasini ochadi (muhr, ochilgach taqqos, g‘olib, bayonnoma)', misol: ['tender natijasini ko‘rsat', 'покажи результат тендера', 'show the tender result'], tasdiq: 'yoq', manba: '/admin/tender-ochiq — t2_tender_tafsilot_v2, t2_tn_bayonnoma_v1 (faqat ochilgandan keyin)' },
  { id: 'qoralama.buyurtmachi_hisobot', tur: 'navigatsiya', nom: 'Buyurtmachi oylik hisoboti (Excel): Buyurtmachi kabineti sahifasini ochadi', misol: ['oylik hisobotni yukla'], tasdiq: 'yoq', manba: '/admin/zakazchik — yuklash tugmasi sahifada (token bilan)' },];

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
export const barchaVositalar = (sahifalar?: readonly YordamchiSahifa[]): YordamchiVosita[] => [...navVositalar(sahifalar), ...STATIK_VOSITALAR, ...AI_ISHCHI_VOSITALARI, ...pultVositalar()];

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
