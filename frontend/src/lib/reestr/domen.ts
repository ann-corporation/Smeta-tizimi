/**
 * DOMEN EGALIK REESTRI (egasi: "ekotizim bir butun bo'lsin, avtomatik majburlansin" - 2026-11-12).
 * Hujjat: docs/architecture/DOMEN_SHARTNOMALARI.md. Sof ma'lumot (React yo'q): har jadval va har funksiya
 * AYNAN BITTA domenga tegishli. Fayl ko'chirilmaydi, jadval nomi o'zgartirilmaydi - faqat egalik e'lon qilinadi.
 *
 * Qoida: nom (boshidagi "_" va "trg_" olib tashlanadi) bo'yicha ENG UZUN prefiks (token chegarasida) yutadi;
 * undan ham ustun - ISTISNO ro'yxati (aniq nom). Yangi t2_* jadval/funksiya prefiksi bo'lmasa -
 * `domen.arxitektura.test.ts` yiqiladi: PREFIKS ga qator qo'shing yoki ISTISNO ga sabab bilan yozing.
 */

export type Domen =
  | 'loyiha' | 'smeta' | 'ijro' | 'resurs' | 'moliya' | 'kadr' | 'tomonlar' | 'hujjat'
  | 'bozor' | 'tender' | 'logistika' | 'sotuv' | 'platforma' | 'ai';

export const DOMENLAR: Readonly<Record<Domen, { nom: string; vazifa: string }>> = {
  loyiha: { nom: 'Loyiha / Obyekt', vazifa: 'obyekt, loyiha, ishtirokchilar, hudud, mindmap xaritasi, yakunlash' },
  smeta: { nom: 'Smeta', vazifa: 'asl smeta qatorlari, versiya, podval/nakrutka, norma, narx, summa yadrosi' },
  ijro: { nom: 'Ijro', vazifa: 'fakt, F2 akt, Forma 3, nakopitelniy, AOSR, laboratoriya, chizma, nazorat, subpudrat akt' },
  resurs: { nom: 'Resurs', vazifa: 'zayavka/buyurtma, sklad, M-29, texnika, viborka' },
  moliya: { nom: 'Moliya / Buxgalteriya', vazifa: 'shartnoma, to\'lov, xarajat, provodka, qarz, 1C sverka' },
  kadr: { nom: 'Kadr', vazifa: 'xodim, tabel, oylik, KPI, naryad' },
  tomonlar: { nom: 'Tomonlar', vazifa: 'kompaniyalararo aloqa, grant, taqdim, murojaat, xat, topshiriq, tomon kabinetlari' },
  hujjat: { nom: 'Hujjat', vazifa: 'registry, R2 kanonik saqlash, papka/fayl, arxiv, hujjat zanjiri, hujjat dvigateli' },
  bozor: { nom: 'Bozor', vazifa: 'e\'lon, taklif, yuk birjasi (RFQ), mutaxassis profili' },
  tender: { nom: 'Tender', vazifa: 'tender, raund, baholash, ochiq lot' },
  logistika: { nom: 'Logistika', vazifa: 'yuk berish (yb), transport parki, reys, tarif, yo\'l puli' },
  sotuv: { nom: 'Uy sotish', vazifa: 'birlik, bron, bitim, to\'lov grafigi, shaxmatka (qurilish puli bilan aralashmaydi)' },
  platforma: { nom: 'Platforma', vazifa: 'kompaniya, a\'zolik, rol/capability, audit, outbox, signal, token, obuna, telegram, desktop' },
  ai: { nom: 'AI (Jarvis)', vazifa: 'agent, buyruq, harakat, xotira, kasb, byudjet; AI faqat nomli amal orqali yozadi' },
};

/** Token chegarasida ENG UZUN prefiks yutadi. Boshidagi "_" va "trg_" prefiksi olib tashlangandan keyin solishtiriladi. */
export const PREFIKS: Readonly<Record<Domen, readonly string[]>> = {
  ai: ['t2_agent', 't2_ai', 't2_addrepl'],
  loyiha: [
    't2_loyiha', 't2_obyekt', 't2_object', 't2_tuzilma', 't2_daraxt', 't2_lm', 't2_yakunlash', 't2_hudud', 't2_mindmap',
    't2_obyekt_yangila', 't2_hodisa_obyekt',
  ],
  smeta: [
    't2_qator', 't2_smeta', 't2_nakrutka', 't2_narx', 't2_narxla', 't2_price', 't2_platforma_narx', 't2_normativ', 't2_norma',
    't2_norm', 't2_lrv', 't2_svod', 't2_shaxsiy_smeta', 't2_xom', 't2_resurs', 't2_material_alias', 't2_zamena',
    't2_almashtirilgan', 't2_qoshimcha_ish', 't2_resource_observation', 't2_work', 't2_ish_turi', 't2_ish_abc',
    't2_ish_kartasi', 't2_ish_resurslar', 't2_ish_tajriba', 't2_catalog', 't2_katalog', 't2_bosqich_katalog', 't2_birlik',
    't2_kat', 't2_nom', 't2_tasnif', 't2_markirovka', 't2_soxta_rz', 't2_versiya', 't2_summa', 't2_kesh', 't2_obyekt_kesh',
    't2_obyekt_jami', 't2_obyekt_nakrutka', 't2_obyekt_nk', 't2_obyekt_paket', 't2_manba', 't2_hisob', 't2_ustamasiz',
    't2_rollup', 't2_kaskad', 't2_f2_ustamali', 't2_ilk_matn', 't2_qator_muhr', 't2_topilmaganlar',
  ],
  ijro: [
    't2_akt', 't2_f2', 't2_forma3', 't2_aosr', 't2_nakopitelniy', 't2_fakt', 't2_foto', 't2_usta', 't2_lab', 't2_chizma',
    't2_sub', 't2_nazorat', 't2_imzochi', 't2_obyekt_imzochi', 't2_obyekt_imzochilar', 't2_kozgu', 't2_grafik', 't2_bajarilmadi',
    't2_qator_bajarilmadi', 't2_qator_holat', 't2_tekshiruv', 't2_primitiv', 't2_erp_sifat', 't2_ortiqcha', 't2_workbench', 't2_viborka_qabul_yoz',
    't2_qator_f2da', 't2_qoshilgan_tarixda',
  ],
  resurs: [
    't2_buyurtma', 't2_buyurtmalar', 't2_procurement', 't2_sklad', 't2_skladga', 't2_m29', 't2_texnika', 't2_zayavka', 't2_erp_taminot',
    't2_erp_texnika', 't2_viborka', 't2_bez_sklad', 't2_qator_bez_sklad', 't2_usta_zayavka',
  ],
  moliya: [
    't2_bux', 't2_shartnoma', 't2_tolov', 't2_xarajat', 't2_faktura', 't2_qarz', 't2_qarzdorlik', 't2_debitor', 't2_overbilling',
    't2_moliya', 't2_pul', 't2_kontragent', 't2_sverka', 't2_contract', 't2_obyekt_shartnoma', 't2_object_financials', 't2_oy',
    't2_f2_reestr', 't2_hr_oylik_buxgalteriya',
  ],
  kadr: ['t2_hr', 't2_naryad', 't2_kadr', 't2_erp_kadr'],
  tomonlar: [
    't2_tomon', 't2_yonalish', 't2_shaxs_yonalish', 't2_ish_joyi', 't2_ish_joylarim', 't2_xizmat', 't2_xat', 't2_izoh', 't2_izohlar', 't2_topshiriqlar',
    't2_topshiriq', 't2_zakazchik', 't2_yet', 't2_loyihachi', 't2_kontragent_tomon',
  ],
  hujjat: [
    't2_document', 't2_fayl', 't2_papka', 't2_arxiv', 't2_arxivla', 't2_arxivdan', 't2_r2', 't2_hujjat', 't2_replica', 't2_sheets_writeback',
    't2_project_storage', 't2_object_storage', 't2_company_storage', 't2_storage', 't2_obyekt_hujjat',
    't2_boss_documents',
  ],
  bozor: ['t2_bz', 't2_birja', 't2_mutaxassis', 't2_mutaxassislar', 't2_baho', 't2_reyting'],
  tender: ['t2_tender', 't2_tenderlar', 't2_tn'],
  logistika: ['t2_yb', 't2_tr', 't2_transport'],
  sotuv: ['t2_sotuv'],
  platforma: [
    't2_kompaniya', 't2_azolik', 't2_azo', 't2_foydalanuvchi', 't2_capability', 't2_role', 't2_permission', 't2_require_permission',
    't2_effective', 't2_audit', 't2_outbox', 't2_signal', 't2_job', 't2_obuna', 't2_tarif', 't2_token', 't2_boshqaruv', 't2_desktop',
    't2_telegram', 't2_bildirishnoma', 't2_bildirishnomalar', 't2_royxat', 't2_ozi_royxat', 't2_sozlama', 't2_deploy',
    't2_integration', 't2_google', 't2_email_kod', 't2_parol', 't2_sessiya', 't2_system_control', 't2_control', 't2_onboarding',
    't2_hodisa', 't2_ozgarish', 't2_db', 't2_dieta', 't2_benchmark', 't2_tizim', 't2_boss', 't2_rahbar', 't2_demo', 't2_tmp', 't2_modul',
    't2_ztr', 't2_kirish', 't2_membership', 't2_actor', 't2_asosiy_rol', 't2_platforma', 't2_men', 't2_profil', 't2_korzinka',
    't2_korzinkadan', 't2_korzinkaga', 't2_invariant', 't2_json', 't2_son', 't2_yashirin', 't2_butunmi', 't2_kasrmi', 't2_kopruk',
    't2_butunlay', 't2_qidiruv', 't2_lugat', 'rls_auto_enable', 't2_erp_amal',
    'v_boss', 't2_ozi', 't2_tahrir',
  ],
};

/** Aniq nom -> domen (prefiksdan ustun). `noaniq` - egasi aniq emas, vaqtincha shu yerga qo'yilgan (hujjatdagi 'noaniq' soni). */
export const ISTISNO: Readonly<Record<string, { domen: Domen; izoh: string; noaniq?: true }>> = {
  // bir-biriga o'xshash prefiksli, lekin boshqa domenga tegishli (prefiks qoidasi noto'g'ri tushadigan joylar)
  t2_qator_bez_sklad_trg: { domen: 'resurs', izoh: 'qator o\'chishi/o\'zgarishi sklad qoidasiga tegadi' },
  t2_akt_qator_sklad: { domen: 'resurs', izoh: 'F2 akt qatori -> sklad chiqimi (trigger funksiyasi nomi trg_ prefiksli)' },
  t2_akt_qator_sklad_bekor: { domen: 'resurs', izoh: 'F2 bekor -> sklad qaytarish' },
  v_erp_kadrlar_dashboard: { domen: 'kadr', izoh: 'ERP kadr paneli' },
  v_erp_sifat_dashboard: { domen: 'ijro', izoh: 'ERP sifat paneli' },
  v_erp_taminot_dashboard: { domen: 'resurs', izoh: 'ERP ta\'minot paneli' },
  v_erp_texnika_dashboard: { domen: 'resurs', izoh: 'ERP texnika paneli' },
  v_sklad_nomlar: { domen: 'resurs', izoh: 'sklad nomlari ko\'rinishi' },
  calculate_smeta_prices: { domen: 'smeta', izoh: 'eski narx hisoblash (prefikssiz)' },
  find_exact_price: { domen: 'smeta', izoh: 'aniq narx qidirish (prefikssiz)' },
  hisob_nakrutka: { domen: 'smeta', izoh: 'nakrutka hisobi (prefikssiz, yadro)' },
  refine_category: { domen: 'smeta', izoh: 'resurs kategoriyasi aniqlash' },
  cat_birlik: { domen: 'smeta', izoh: 'birlik katalogi' },
  cat_birlik_latin: { domen: 'smeta', izoh: 'birlik katalogi (lotin)' },
  norm_birlik: { domen: 'smeta', izoh: 'birlik normallashtirish' },
  norm_text: { domen: 'smeta', izoh: 'matn normallashtirish (katalog kaliti)' },
  t2_obyekt_nk_v1: { domen: 'smeta', izoh: 'obyekt nakrutkasi (smeta podvalidan)' },
  t2_obyekt_doira_ok: { domen: 'loyiha', izoh: 'obyekt doirasi ruxsati - loyiha tekshiruvi' },
  t2_obyekt_kompaniya_azo: { domen: 'platforma', izoh: 'a\'zolik tekshiruvi (kompaniya doirasi)' },
  t2_obyekt_loyihaga_biriktir: { domen: 'loyiha', izoh: 'obyektni loyihaga bog\'lash' },
  t2_obyekt_ulash_v1: { domen: 'tomonlar', izoh: 'obyektni tomonga ulash (kompaniyalararo)' },
  t2_obyekt_ulashlar_v1: { domen: 'tomonlar', izoh: 'obyekt ulashlari (kompaniyalararo)' },
  t2_obyekt_yakunlash_v1: { domen: 'loyiha', izoh: 'obyektni yakunlash' },
  t2_obyekt_hudud_belgila_v1: { domen: 'loyiha', izoh: 'obyekt hududi' },
  t2_obyekt_kesh_yangila_v1: { domen: 'smeta', izoh: 'summa keshi yangilash' },
  t2_hodisa_lenta: { domen: 'platforma', izoh: 'hodisa lentasi (read model)' },
  t2_hodisa_obyekt_lenta: { domen: 'platforma', izoh: 'obyekt hodisa lentasi' },
  t2_ish_joyi_qoshil_v1: { domen: 'tomonlar', izoh: 'ish joyiga qo\'shilish (taklif oqimi)' },
  t2_f2_reestr_yoz_v1: { domen: 'moliya', izoh: 'F2 reestr SUMMASI (qo\'lda, solishtirish signali) - moliya yozadi' },
  t2_f2_reestr_jami: { domen: 'moliya', izoh: 'F2 reestr summasi jadvali (solishtirish signali, manba EMAS)' },
  t2_hr_oylik_buxgalteriya_v1: { domen: 'kadr', izoh: 'HR oylikni buxgalteriyaga uzatadi (kadr egasi, moliyaga yozish allow-list da)' },
  t2_naryad_narx_smeta: { domen: 'kadr', izoh: 'naryad narxi smetadan O\'QIydi' },
  t2_usta_fakt_qaror_v1: { domen: 'ijro', izoh: 'usta fakt qarori' },
  t2_usta_fakt_qoralama: { domen: 'ijro', izoh: 'usta fakt qoralamasi' },
  t2_usta_fakt_qoralama_v1: { domen: 'ijro', izoh: 'usta fakt qoralamasi' },
  t2_kontragent_tomon_bog_v1: { domen: 'tomonlar', izoh: 'kontragentni tomon aloqasiga bog\'laydi' },
  t2_loyiha_qatnashchi_canonical: { domen: 'loyiha', izoh: 'loyiha ishtirokchisi kanonik ko\'rinishi' },
  t2_hujjat_kiruvchi_v1: { domen: 'tomonlar', izoh: 'Bugun -> Kiruvchi read-model (tomon taqdimlari)' },
  t2_hujjat_eslatma_v1: { domen: 'hujjat', izoh: 'hujjat eslatmalari' },
  t2_boss_dashboard_v1: { domen: 'platforma', izoh: 'rahbar paneli (read model, hammasidan o\'qiydi)' },
  t2_boss_decision_v1: { domen: 'platforma', izoh: 'rahbar qarori paneli' },
  t2_mutaxassis_karta: { domen: 'bozor', izoh: 'mutaxassis kartasi' },
  t2_nazorat_uy_v1: { domen: 'ijro', izoh: 'nazorat "uy" ko\'rinishi' },
  t2_zamena_reja_hajm: { domen: 'smeta', izoh: 'zamena rejasi hajmi' },
  t2_tn_flaglar: { domen: 'tender', izoh: 'tender bayroqlari' },
  t2_xat_keyingi_raqam: { domen: 'tomonlar', izoh: 'xat raqamlash' },
  t2_izoh_manba: { domen: 'tomonlar', izoh: 'izoh manbasi' },
  t2_pul_cats_v1: { domen: 'moliya', izoh: 'pul kategoriyalari' },
  t2_pul_jadd_v1: { domen: 'moliya', izoh: 'pul jadvali' },
  t2_qarz_asos: { domen: 'moliya', izoh: 'qarz asoslari' },
  t2_kadr_yarat: { domen: 'kadr', izoh: 'eski kadr yaratish' },
  t2_sub_gc_fakt: { domen: 'ijro', izoh: 'subpudrat GC fakti' },
  t2_signal_obyekt_yengil: { domen: 'platforma', izoh: 'signal (obyekt, yengil)' },
  t2_birlik_baza: { domen: 'smeta', izoh: 'birlik bazasi' },
  t2_nakrutka_kaskad_v1: { domen: 'smeta', izoh: 'kaskad (yadro)' },
  t2_fakt_olchov_v1: { domen: 'ijro', izoh: 'fakt o\'lchov' },
  t2_tr_xarajat_otkaz_v1: { domen: 'logistika', izoh: 'reys xarajati -> obyekt xarajati (moliyaga yozish allow-list da)' },
  t2_tmp_eq_lot1: { domen: 'platforma', izoh: 'NOANIQ vaqtinchalik jadval (tmp_) - o\'chirish kerak', noaniq: true },
  t2_document_registry_f2slot_bak: { domen: 'hujjat', izoh: 'zaxira nusxa jadvali' },
  t2_qator_kat_bak_20261024: { domen: 'smeta', izoh: 'zaxira nusxa (bak) - o\'chirish kerak' },
  t2_qator_zaxira_suniy_kol_84: { domen: 'smeta', izoh: 'zaxira nusxa - o\'chirish kerak' },
  t2_smeta_ierarxiya_zaxira: { domen: 'smeta', izoh: 'zaxira nusxa' },
  t2_qator_ota_jami_tuzatish_v1: { domen: 'smeta', izoh: 'ota jami tuzatish jurnali' },
  t2_qator_muhr_farq: { domen: 'smeta', izoh: 'muhr farqi ko\'rinishi' },
  t2_kozgu_eskirt_akt: { domen: 'ijro', izoh: 'ko\'zgu eskirishi (F2 akt)' },
  t2_grafik_json_v1: { domen: 'ijro', izoh: 'grafik JSON' },
  t2_chizma_obyekt_ok: { domen: 'ijro', izoh: 'chizma obyekt tekshiruvi' },
  t2_katalog_zavod: { domen: 'smeta', izoh: 'zavod katalogi' },
  t2_sinov_bonus: { domen: 'platforma', izoh: 'NOANIQ sinov bonus (token?)', noaniq: true },
  t2_oy_iz_v1: { domen: 'moliya', izoh: 'oylik iz (paket/shartnoma oy kesimi)' },
  t2_tr_matn: { domen: 'logistika', izoh: 'matn yordamchisi' },
  t2_son_tez: { domen: 'platforma', izoh: 'son yordamchisi' },
};

/** Boshqa domenlar yoza OLADIGAN umumiy "chiqish quvurlari" (sink): ular domen emas, platforma xizmati. Yozish ruxsati: faqat shu funksiyalar orqali. */
export const PLATFORMA_SINKLAR: readonly string[] = [
  't2_audit_log', 't2_outbox', 't2_signal', 't2_hodisa_lenta', 't2_bildirishnoma', 't2_bildirishnoma_tg', 't2_ozgarish',
  't2_token_harakat', 't2_token_saga', 't2_job', 't2_arxiv_yozuv',
  // operation_id idempotentlik jurnallari (har domen RPC si yozadi)
  't2_onboarding_command_log', 't2_kompaniya_command_log', 't2_control_command_log',
];

/** Manba-zanjir: qaysi FAKT uchun qaysi o'qish funksiyasi YAGONA haqiqat. Boshqa agent bu raqamni qayta hisoblamaydi. */
export type Otoritet = { fakt: string; domen: Domen; funksiya: string; izoh: string };
export const OTORITET: readonly Otoritet[] = [
  { fakt: 'Summalar (ustamali/ustamasiz/QQS)', domen: 'smeta', funksiya: '_t2_summa_paket_v1', izoh: 'SQL hisob yadrosi; frontendda lib/hisob-yadro' },
  { fakt: 'Summa yig\'indisi (agregat)', domen: 'smeta', funksiya: '_t2_summa_agg_v1', izoh: 'paket yig\'indisini shu yig\'adi' },
  { fakt: 'Nakrutka foizlari', domen: 'smeta', funksiya: 't2_nakrutka_podval_smeta_nk_v1', izoh: 'faqat smeta podvalidan; shartnomadan ustun' },
  { fakt: 'Nakrutka kaskadi', domen: 'smeta', funksiya: '_t2_kaskad_yakun_v1', izoh: 'kaskad arifmetikasi shu yerda' },
  { fakt: 'Narx manbasi tanlash', domen: 'smeta', funksiya: 't2_price_basis_resolve_v1', izoh: 'F2 narxi = max(smeta, xarid) QQS siz' },
  { fakt: 'Rol imkoniyatlari (capability)', domen: 'platforma', funksiya: 't2_role_permissions_v2', izoh: 'ikkinchi ro\'yxat YO\'Q (when rol then array taqiqlangan)' },
  { fakt: 'Foydalanuvchi samarali ruxsati', domen: 'platforma', funksiya: 't2_effective_authorization_v1', izoh: 'rol + qo\'shimcha + kill-switch' },
  { fakt: 'Ruxsat tekshiruvi (RPC ichida)', domen: 'platforma', funksiya: 't2_require_permission_v2', izoh: 'RPC ruxsatni faqat shu bilan tekshiradi' },
  { fakt: 'Kompaniya a\'zoligi', domen: 'platforma', funksiya: 't2_actor_kompaniya_azo_tekshir', izoh: 'tenant + actor tekshiruvi' },
  { fakt: 'Fakt holati (qator bo\'yicha)', domen: 'ijro', funksiya: '_t2_qator_holat_v2', izoh: 'bitta ish - bitta fakt; ko\'rinish t2_qator_holat' },
  { fakt: 'F2 paket ro\'yxati', domen: 'ijro', funksiya: '_t2_f2_akt_paket_v1', izoh: 'tasdiqlangan F2 muzlagan, aynan ko\'chiriladi' },
  { fakt: 'Nakopitelniy', domen: 'ijro', funksiya: 't2_nakopitelniy_v2', izoh: 'F2 = nakopitelniy = F3 zanjiri' },
  { fakt: 'Forma 3 yaratish', domen: 'ijro', funksiya: 't2_forma3_yarat_v1', izoh: 'F2 dan, qo\'lda emas' },
  { fakt: 'Smeta versiyasi faollashtirish', domen: 'smeta', funksiya: 't2_smeta_versiya_faollashtir_v1', izoh: 'faqat faol versiya smeta asosi' },
  { fakt: 'Tomon ko\'rinishi (kim nimani ko\'radi)', domen: 'tomonlar', funksiya: 't2_tomon_ruxsat_bor', izoh: 'kompaniyalararo ko\'rinish faqat aloqa+grant orqali' },
  { fakt: 'Hujjat registry (kanonik fayl)', domen: 'hujjat', funksiya: 't2_document_registry_v1', izoh: 'R2 kanonik; Drive faqat replika' },
  { fakt: 'Token yechish', domen: 'platforma', funksiya: 't2_token_sarfla_v1', izoh: 'har natijali ish shu orqali; qayta yuklash takror yechmaydi' },
  { fakt: 'Xodim oylik hisobi', domen: 'kadr', funksiya: '_t2_hr_hisob_v1', izoh: 'tabel + naryad + KPI; buxgalteriyaga faqat t2_hr_oylik_buxgalteriya_v1' },
  { fakt: 'Buxgalteriya jurnali', domen: 'moliya', funksiya: 't2_bux_jurnal_v1', izoh: 'provodka o\'zgarmas (storno bilan)' },
  { fakt: 'Obyekt moliyaviy ko\'rsatkichi', domen: 'moliya', funksiya: 't2_object_financials_v1', izoh: 'summalar smetadan, to\'lov/xarajat moliyadan' },
  { fakt: 'Sklad qoldig\'i', domen: 'resurs', funksiya: 't2_sklad_ombor_qoldiq_v1', izoh: 'bitta qoldiq manbasi (ko\'rinish)' },
  { fakt: 'Signal (ogohlantirish) yaratish', domen: 'platforma', funksiya: 't2_signal_emit', izoh: 'domenlar signalni faqat shu orqali chiqaradi' },
  { fakt: 'Outbox (hodisa chiqarish)', domen: 'platforma', funksiya: 't2_outbox_yoz', izoh: 'tashqi tizimga hodisa faqat shu orqali' },
  { fakt: 'Audit yozuvi', domen: 'platforma', funksiya: 't2_audit_yoz', izoh: 'audit faqat shu orqali' },
];

/** O'xshash tushunchalar (ogohlantirish ro'yxati, qattiq xato emas): qaysi biri KANONIK. Test jadval nomlari mavjudligini tekshiradi. */
export type Oxshash = { tushuncha: string; nomlar: readonly string[]; kanonik: string; tavsiya: string };
export const OXSHASHLAR: readonly Oxshash[] = [
  { tushuncha: 'Baho / reyting', nomlar: ['t2_baho', 't2_yb_baho', 't2_reyting_baho', 't2_tender_baho'],
    kanonik: 't2_reyting_baho', tavsiya: 'yangi baho jadvali yaratmang; t2_reyting_baho ga (tur ustuni bilan) yozing, yb/tender o\'z jadvalini view ga aylantiring' },
  { tushuncha: 'Xodimlar ro\'yxati', nomlar: ['t2_hr_xodim', 't2_kadr_mustaqil', 't2_kadr_bog', 't2_erp_kadr', 't2_foydalanuvchi', 't2_azolik'],
    kanonik: 't2_hr_xodim', tavsiya: 'ish haqi/tabel faqat t2_hr_xodim; kirish huquqi t2_azolik; t2_kadr_* va t2_erp_kadr eski - o\'qish ko\'rinishiga o\'tkazing' },
  { tushuncha: 'Texnika / mashina', nomlar: ['t2_texnika_mustaqil', 't2_texnika_bog', 't2_erp_texnika', 't2_tr_mashina', 't2_yb_mashina'],
    kanonik: 't2_tr_mashina', tavsiya: 'park mashinasi t2_tr_mashina (logistika); t2_texnika_* resurs hisobi eski; t2_yb_mashina - tashuvchi mashinasi (bozor tomoni), park emas' },
  { tushuncha: 'Haydovchi', nomlar: ['t2_tr_haydovchi', 't2_yb_haydovchi'],
    kanonik: 't2_tr_haydovchi', tavsiya: 'ikki haydovchi ro\'yxatini birlashtiring (rol ustuni: park / tashuvchi)' },
  { tushuncha: 'Akt (F2 / subpudrat / lab / korreksiya)', nomlar: ['t2_akt', 't2_sub_akt', 't2_akt_podval', 't2_akt_correction_link', 't2_lab_protokol', 't2_aosr'],
    kanonik: 't2_akt', tavsiya: 'pul akti = t2_akt (F2). t2_sub_akt - subpudratchi taqdim qoralamasi, tasdiqlangach t2_akt ga aylanadi; AOSR/lab - texnik hujjat, pul emas' },
  { tushuncha: 'Narx manbasi', nomlar: ['t2_narx', 't2_narx_manba', 't2_narx_manba_qator', 't2_price_basis', 't2_price_basis_line', 't2_platforma_narx_manba', 't2_narx_dalil', 't2_smeta_paket_res_manba', 't2_narx_internet_kesh'],
    kanonik: 't2_price_basis', tavsiya: 'yangi narx tanlash mexanizmi yaratmang: manba = t2_narx_manba(+qator), tanlov = t2_price_basis_resolve_v1; t2_platforma_narx_manba faqat platforma darajasi' },
  { tushuncha: 'Hodisa / jurnal / audit', nomlar: ['t2_audit_log', 't2_tomon_hodisa', 't2_yb_hodisa', 't2_telegram_hodisa', 't2_tender_jurnal', 't2_agent_jurnal', 't2_hodisa_lenta', 't2_ozgarish'],
    kanonik: 't2_audit_log', tavsiya: 'biznes jurnali domenida qoladi (append-only), lekin audit = t2_audit_log; lenta = faqat o\'qish view' },
  { tushuncha: 'To\'lov', nomlar: ['t2_tolov', 't2_tomon_tolov', 't2_yb_tolov', 't2_sotuv_tolov', 't2_tolov_sorov', 't2_bux_kassa_order', 't2_bux_bank_qator'],
    kanonik: 't2_tolov', tavsiya: 'qurilma shartnoma to\'lovi = t2_tolov; tomon/yb/sotuv to\'lovlari o\'z domenida, lekin buxgalteriyaga faqat bux_* funksiyalari orqali o\'tadi' },
  { tushuncha: 'Sklad', nomlar: ['t2_sklad_harakat', 't2_sklad_qoldiq', 't2_sklad_mustaqil', 't2_sklad_bog', 't2_erp_taminot'],
    kanonik: 't2_sklad_harakat', tavsiya: 'qoldiq = harakatlardan hosila; t2_sklad_qoldiq/mustaqil/bog\' alohida haqiqat emas' },
  { tushuncha: 'Foto / dalil', nomlar: ['t2_foto_dalil', 't2_aosr_foto', 't2_narx_dalil', 't2_yb_dalil', 't2_primitiv_dalil'],
    kanonik: 't2_foto_dalil', tavsiya: 'fayl R2 da bitta (t2_document_registry); dalil jadvallari faqat bog\'lanish' },
  { tushuncha: 'Shartnoma tomoni / kontragent', nomlar: ['t2_kontragent', 't2_shartnoma_tomon', 't2_tomon_aloqa', 't2_kompaniya', 't2_bz_profil'],
    kanonik: 't2_tomon_aloqa', tavsiya: 'kompaniyalararo = t2_tomon_aloqa; t2_kontragent - 1C kontragenti (moliya), t2_kontragent_tomon_bog_v1 orqali bog\'lanadi' },
];

/* ---- ichki: nomni normallashtirish va egani topish (sof funksiyalar) ---- */
export function normNom(nom: string): string {
  let s = nom.toLowerCase();
  if (s.startsWith('trg_')) s = s.slice(4);
  while (s.startsWith('_')) s = s.slice(1);
  return s;
}

let _tartib: Array<[string, Domen]> | null = null;
function prefikslar(): Array<[string, Domen]> {
  if (!_tartib) {
    const a: Array<[string, Domen]> = [];
    for (const d of Object.keys(PREFIKS) as Domen[]) for (const p of PREFIKS[d]) a.push([p, d]);
    a.sort((x, y) => y[0].length - x[0].length);
    _tartib = a;
  }
  return _tartib;
}

export type Ega = { domen: Domen; manba: 'istisno' | 'prefiks'; noaniq?: true; qoida: string } | null;

/** Jadval/funksiya egasi: ISTISNO (aniq nom) > eng uzun prefiks (token chegarasida). Topilmasa null. */
export function egasi(nom: string): Ega {
  const low = nom.toLowerCase();
  const ist = ISTISNO[low] ?? ISTISNO[normNom(nom)];
  if (ist) return { domen: ist.domen, manba: 'istisno', noaniq: ist.noaniq, qoida: nom };
  const n = normNom(nom);
  for (const [p, d] of prefikslar()) {
    if (n === p || n.startsWith(p + '_')) return { domen: d, manba: 'prefiks', qoida: p };
  }
  return null;
}

/** "_pre_<14 raqam>" - migratsiya zaxira nusxalari: asl funksiya egasiga tegishli. */
export function asosNom(nom: string): string {
  return nom.replace(/_pre_\d{10,}$/, '').replace(/_v\d+$/, (m) => m);
}

/** SQL hisob yadrosi: pul/QQS arifmetikasi FAQAT shu funksiyalarda yoziladi (frontendda lib/hisob-yadro). Boshqalari - meros ro'yxatida. */
export const HISOB_YADRO_SQL: readonly string[] = [
  '_t2_summa_paket_hisob_v1', '_t2_summa_paket_jam_v1', '_t2_summa_agg_v1', '_t2_summa_paket_v1', '_t2_kaskad_yakun_v1',
  't2_nakrutka_yaxlit_qosh_v1', 't2_nakrutka_yaxlit_qosh_v2', 't2_svod_yaxlit_obyekt_v1', 't2_narxla',
];

/** Ruxsat (capability) manbalari: rol -> massiv FAQAT shu funksiyalarda. */
export const RUXSAT_MANBA_SQL: readonly string[] = ['t2_role_permissions_v2'];

/** Domenlararo yozishning sababli juftlari (kim -> kimning jadvaliga). Meros ro'yxatdagi har yozuv shu sababni oladi. */
export const YOZISH_SABAB: Readonly<Record<string, string>> = {
  'moliya>platforma': 'operation_id/command-log va rol tekshiruvi: platforma jadvallariga idempotentlik yozuvi',
  'tender>bozor': 'tender e\'loni yuk birjasi (RFQ) jadvaliga yoziladi - ikki modul bitta e\'lon mexanizmini bo\'lishadi (birlashtirish tavsiya)',
  'smeta>platforma': 'idempotentlik jurnali (command_log) va audit',
  'ijro>tomonlar': 'nazorat/akt natijasi tomon murojaatiga yoziladi (taqdim oqimi)',
  'ijro>platforma': 'idempotentlik jurnali (command_log)',
  'smeta>resurs': 'resurs yaratish ishlari sklad/texnika/kadr "mustaqil" jadvallarini ham to\'ldiradi (resurs katalogi kengayishi)',
  'smeta>kadr': 'resurs yaratish ishlari kadr "mustaqil" jadvalini ham to\'ldiradi',
  'hujjat>ijro': 'arxivlash/o\'chirish: hujjat ko\'rsatkichini akt jadvallariga yozadi',
  'hujjat>moliya': 'arxivlash: shartnoma/kontragent hujjat ko\'rsatkichlari',
  'hujjat>loyiha': 'saqlash ulanishi obyekt jadvaliga yoziladi (storage binding)',
  'tomonlar>platforma': 'ish joyi/kompaniya yaratish (a\'zolik oqimi)',
  'ijro>moliya': 'F3/sverka: F2 reestr summasi (solishtirish signali) moliya jadvaliga',
  'loyiha>moliya': 'mindmap tuguni o\'chirilganda bog\'liq yozuvlar tozalanadi',
  'loyiha>resurs': 'mindmap tuguni o\'chirilganda bog\'liq yozuvlar tozalanadi',
  'loyiha>kadr': 'mindmap tuguni o\'chirilganda bog\'liq yozuvlar tozalanadi',
  'ai>smeta': 'AI faqat nomli amal (addrepl) orqali yozadi, dry_run majburiy',
  'smeta>ai': 'smeta xotirasi AI xotirasiga yoziladi',
  'ijro>smeta': 'fakt kiritishda smetasiz ish turi/qator yaratiladi',
  'platforma>loyiha': 'demo nusxa yaratish',
  'platforma>smeta': 'demo nusxa yaratish',
  'tomonlar>ijro': 'tomon qarori AOSR/akt holatiga ta\'sir qiladi',
  'moliya>ijro': 'sverka: F3/F2 bog\'lanishlari',
  'tomonlar>moliya': 'kontragent <-> tomon bog\'lash',
  'kadr>platforma': 'idempotentlik jurnali (command_log)',
  'moliya>loyiha': 'shartnoma bog\'i obyekt jadvalini izchillaydi (trigger)',
  'resurs>moliya': 'buyurtma qabuli qarz asosini yozadi',
  'resurs>platforma': 'idempotentlik jurnali (command_log)',
  'bozor>tomonlar': 'g\'olib tanlash tomon aloqasini yaratadi',
  'tender>tomonlar': 'tender aloqasi tomon aloqasini yaratadi',
  'loyiha>platforma': 'obyekt yaratish: idempotentlik jurnali',
  'ai>platforma': 'AI token sozlamalari/sarf',
};