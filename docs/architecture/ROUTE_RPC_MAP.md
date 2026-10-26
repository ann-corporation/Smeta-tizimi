# Маршруты → модели чтения → именованные команды

generated_at: 2026-10-26T05:48:29.354146+00:00  
git_commit: 69db8d45050cc82dfd67baae6dec7153b727a219  
db_migration_head: 20261106510000 (t2_agent_qidiruv_v1)

Источник: существующий pageCatalog.ts (семантика экранов) + generated.ts (статическая карта). Не создавать параллельный реестр runtime. Ни совпадение имени, ни наличие routine не доказывают правильные grants/actor/tenant. Полный callgraph React→API автоматически не установлен; ниже точная allowlist, а не выдуманные связи.

Инвентарь: меню 45; сегментов App 91; allowlist read relations 85; именованных write actions 141.

## Семантические связи экранов (существующий pageCatalog)

- `/admin/kompaniya` (GLOBAL, kompaniya): читает `t2_men_v1`, `t2_kompaniya`; команды `kompaniya_yangila` → `t2_kompaniya_yangila`; `azolik_qosh` → `t2_azolik_qosh_v1`; `azolik_rol_ozgartir` → `t2_azolik_rol_ozgartir_v1`; `azolik_ochir` → `t2_azolik_ochir_v1`.

- `/admin/system-control` (GLOBAL, system-control): читает `t2_system_control_v1`, `t2_capability_registry`; команды `tizim_amal` → `t2_tizim_amal`; `sozlama_saqla` → `t2_sozlama_saqla`.

- `/admin/dashboard` (COMPANY, dashboard): читает `t2_boss_dashboard_v1`, `t2_bux_umumiy`; команды —.

- `/admin/loyiha` (COMPANY, loyiha): читает `t2_loyiha_royxat`, `t2_kompaniya`; команды `loyiha_yarat` → `t2_loyiha_yarat`; `loyiha_yangila` → `t2_loyiha_yangila`; `loyiha_ochir` → `t2_loyiha_ochir`.

- `/admin/obyektlar` (PROJECT, obyektlar): читает `t2_obyekt`, `t2_obyekt_jami`; команды `obyekt_yarat` → `t2_obyekt_yarat_v1`; `obyekt_yangila` → `t2_obyekt_yangila`; `obyekt_loyihaga_biriktir` → `t2_obyekt_loyihaga_biriktir`.

- `/admin/smeta-studio` (COMPANY, smeta-studio): читает `/api/norm-katalog (R2 normativ katalog)`; команды —.

- `/admin/participants` (PROJECT, participants): читает `t2_loyiha_qatnashchilar_royxat`; команды `loyiha_qatnashchi_biriktir` → `t2_loyiha_qatnashchi_biriktir`; `loyiha_qatnashchi_ochir` → `t2_loyiha_qatnashchi_ochir`.

- `/admin/zakazchik` (COMPANY, zakazchik): читает `t2_zakazchik_obyektlar_v1`, `t2_tomon_aloqalar_v1`, `t2_tomon_taqdimlar_v1`; команды —.

- `/admin/taqdimlar` (COMPANY, taqdimlar): читает `t2_tomon_taqdimlar_v1`, `t2_tomon_taqdim_tafsilot_v1`; команды `t2_tomon_qaror_v1` (не найдено в статической write allowlist; проверить отдельный API); `t2_tomon_izoh_v1` (не найдено в статической write allowlist; проверить отдельный API); `t2_tomon_taqdim_qaytar_v1` (не найдено в статической write allowlist; проверить отдельный API).

- `/admin/murojaatlar` (COMPANY, murojaatlar): читает `t2_tomon_murojaat_royxat_v1`, `t2_tomon_murojaat_tafsilot_v1`, `t2_tomon_murojaat_turlari_v1`; команды `t2_tomon_murojaat_yarat_v1` (не найдено в статической write allowlist; проверить отдельный API); `t2_tomon_murojaat_javob_v1` (не найдено в статической write allowlist; проверить отдельный API); `t2_tomon_murojaat_hujjat_v1` (не найдено в статической write allowlist; проверить отдельный API); `t2_tomon_murojaat_qaror_v1` (не найдено в статической write allowlist; проверить отдельный API); `t2_tomon_murojaat_bekor_v1` (не найдено в статической write allowlist; проверить отдельный API).

- `/admin/aloqalar` (COMPANY, aloqalar): читает `t2_tomon_aloqalar_v1`, `t2_tomon_aloqa_tafsilot_v1`, `t2_tomon_resurslar_v1`; команды `t2_tomon_taklif_v1` (не найдено в статической write allowlist; проверить отдельный API); `t2_tomon_javob_v1` (не найдено в статической write allowlist; проверить отдельный API); `t2_tomon_kod_qabul_v1` (не найдено в статической write allowlist; проверить отдельный API); `t2_tomon_holat_v1` (не найдено в статической write allowlist; проверить отдельный API); `t2_tomon_grant_saqla_v1` (не найдено в статической write allowlist; проверить отдельный API); `t2_tomon_grant_bekor_v1` (не найдено в статической write allowlist; проверить отдельный API).

- `/admin/documents` (OBJECT, documents): читает `t2_obyekt_hujjat_royxat`, `t2_document_registry`; команды `hujjat_yoz` → `t2_obyekt_hujjat_yoz`; `hujjat_ochir` → `t2_obyekt_hujjat_ochir`.

- `/admin/hujjat-nazorat` (OBJECT, hujjat-nazorat): читает `t2_document_registry`, `t2_akt_reestr`; команды —.

- `/admin/f2-reestr` (COMPANY, f2-reestr): читает `t2_obyekt_jami`, `t2_akt_reestr`, `t2_akt_qator`, `t2_shartnoma`, `t2_shartnoma_bog`, `t2_document_registry`; команды —.

- `/admin/f2-tarix` (OBJECT, f2-tarix): читает `t2_akt`, `t2_akt_qator`, `t2_akt_reestr`; команды `akt_tasdiqlash` → `t2_akt_tasdiqlash`; `akt_bekor` → `t2_akt_bekor`; `akt_correction_create_v1` → `t2_akt_correction_create_v1`.

- `/admin/mindmap` (COMPANY, mindmap): читает `t2_daraxt`, `t2_mindmap_bog`; команды `mindmap_bog` → `t2_mindmap_bog_v2`; `mindmap_bog_ochir` → `t2_mindmap_bog_ochir_v2`; `mindmap_joylashuv_saqla` → `t2_mindmap_joylashuv_saqla_v2`; `mindmap_tugun_ochir` → `t2_mindmap_tugun_ochir_v2`.

- `/admin/crm` (COMPANY, crm): читает `t2_kontragent_royxat`; команды `kontragent_saqla` → `t2_kontragent_saqla`; `kontragent_ochir` → `t2_kontragent_ochir`.

- `/admin/holat` (OBJECT, holat): читает `t2_daraxt`, `t2_qator`, `t2_qator_holat`, `t2_akt`; команды `fakt_belgila_v2` → `t2_fakt_belgila_v2`; `fakt_yoz_v2` → `t2_fakt_yoz_v2`; `bajarilmadi_belgila` → `t2_bajarilmadi_belgila_v1`; `bajarilmadi_bekor` → `t2_bajarilmadi_bekor_v1`.

- `/admin/f2` (OBJECT, f2): читает `t2_daraxt`, `t2_akt_reestr`, `t2_qator_holat`; команды `f2_import_job_yarat` → `t2_f2_import_job_yarat_v1`; `f2_import_draft_saqla` → `t2_f2_import_draft_saqla_v1`; `akt_yarat_v2` → `t2_akt_yarat_v2`.

- `/admin/f2-tayyorlash` (OBJECT, f2-tayyorlash): читает `t2_daraxt`, `t2_qator_holat`, `t2_akt`; команды `akt_yarat_v2` → `t2_akt_yarat_v2`; `akt_lifecycle_transition_v1` → `t2_akt_lifecycle_transition_v1`.

- `/admin/nakopitelniy` (OBJECT, nakopitelniy): читает `t2_f2_kat_oy`, `t2_akt`, `t2_qator_holat`, `t2_shartnoma_svod_v1`; команды `sverka_yozuv_v1` → `t2_sverka_yozuv_v1`; `tolov_yoz` → `t2_tolov_yoz`.

- `/admin/m29` (OBJECT, m29): читает `t2_f2_kat_oy`, `t2_daraxt`, `t2_qator_holat`; команды —.

- `/admin/smeta-narxlash` (OBJECT, smeta-narxlash): читает `t2_daraxt`, `t2_narx`, `t2_material_alias_royxat`; команды `smeta_narxla_res` → `t2_smeta_narxla_res_v2`; `smeta_narxla_res_v3` → `t2_smeta_narxla_res_v3`; `price_basis_yarat` → `t2_price_basis_yarat_v1`.

- `/admin/oferta` (OBJECT, oferta): читает `t2_daraxt`, `t2_narx`; команды `catalog_observation_yoz_v1` → `t2_catalog_observation_yoz_v1`.

- `/admin/narxlar` (COMPANY, narxlar): читает `t2_narx_markaz`, `t2_narx_qol_xavf`, `t2_narx_sana`; команды `narx_belgila` → `t2_narx_belgila`; `narx_sana_qosh` → `t2_narx_sana_qosh`.

- `/admin/nakrutka` (OBJECT, nakrutka): читает `t2_nakrutka`, `t2_obyekt_nakrutka`; команды `nakrutka_saqla` → `t2_nakrutka_saqla`; `nakrutka_koef_saqla` → `t2_nakrutka_koef_saqla_v1`.

- `/admin/boshqaruv` (GLOBAL, boshqaruv): читает `t2_boshqaruv_umumiy_v1`, `t2_boshqaruv_foydalanuvchilar_v1`, `t2_boshqaruv_kompaniyalar_v1`, `t2_boshqaruv_token_daftar_v1`, `t2_boshqaruv_audit_v1`; команды `t2_boshqaruv_foydalanuvchi_holat_v1` (не найдено в статической write allowlist; проверить отдельный API); `t2_boshqaruv_azolik_v1` (не найдено в статической write allowlist; проверить отдельный API); `t2_boshqaruv_narx_saqla_v1` (не найдено в статической write allowlist; проверить отдельный API); `t2_boshqaruv_tarif_saqla_v1` (не найдено в статической write allowlist; проверить отдельный API); `token_toldir_v1` → `t2_token_toldir_v1`; `obuna_belgila_v1` → `t2_obuna_belgila_v1`; `demo_manba_belgila_v1` → `t2_demo_manba_belgila_v1`.

- `/admin/ish-joylarim` (COMPANY, ish-joylarim): читает `t2_ish_joylarim_v1`; команды `t2_ish_joyi_yarat_v1` (не найдено в статической write allowlist; проверить отдельный API); `t2_ish_joyi_qoshil_v1` (не найдено в статической write allowlist; проверить отдельный API).

- `/admin/mutaxassis` (COMPANY, mutaxassis): читает `t2_mutaxassis_profil_ol_v1`, `t2_xizmat_takliflarim_v1`, `t2_xizmat_kompaniya_qidir_v1`; команды `t2_mutaxassis_profil_saqla_v1` (не найдено в статической write allowlist; проверить отдельный API); `t2_xizmat_taklif_yubor_v1` (не найдено в статической write allowlist; проверить отдельный API); `t2_xizmat_taklif_bekor_v1` (не найдено в статической write allowlist; проверить отдельный API).

- `/admin/tokenlar` (COMPANY, tokenlar): читает `t2_token_holat_v1`; команды `token_toldir_v1` → `t2_token_toldir_v1`; `obuna_belgila_v1` → `t2_obuna_belgila_v1`; `demo_manba_belgila_v1` → `t2_demo_manba_belgila_v1`.

- `/admin/hujjat-dizayn` (COMPANY, hujjat-dizayn): читает —; команды —.

- `/admin/shartnoma-liniya` (COMPANY, shartnoma-liniya): читает `t2_shartnoma_liniya_v1`; команды `shartnoma_saqla_v2` → `t2_shartnoma_saqla_v2`.

- `/admin/moliya` (COMPANY, moliya): читает `t2_shartnoma`, `t2_shartnoma_bog`, `t2_bux_dashboard`, `t2_tolov`, `t2_xarajat`; команды `shartnoma_saqla` → `t2_shartnoma_saqla`; `shartnoma_bog_saqla` → `t2_shartnoma_bog_saqla`; `tolov_yoz` → `t2_tolov_yoz`; `xarajat_yoz` → `t2_xarajat_yoz`.

- `/admin/logistika` (COMPANY, logistika): читает `t2_zayavka_royxat`, `t2_sklad_qoldiq`, `t2_sklad_harakat`; команды `erp_amal` → `t2_erp_amal`; `skladga_yozish` → `t2_skladga_yozish`.

- `/admin/zayavka` (PROJECT, zayavka): читает `t2_zayavka_royxat`; команды `erp_amal` → `t2_erp_amal`.

- `/admin/aosr` (OBJECT, aosr): читает `t2_aosr_reestr_v2`, `t2_lab_protokol_reestr`; команды `aosr_yoz_v2` → `t2_aosr_yoz_v2`; `lab_protokol_yoz` → `t2_lab_protokol_yoz_v1`.

- `/admin/erp` (COMPANY, erp): читает `v_erp_kadrlar_dashboard`, `v_erp_texnika_dashboard`, `v_erp_taminot_dashboard`; команды `erp_amal` → `t2_erp_amal`.

- `/admin/tizim-sozlama` (COMPANY, sozlamalar): читает `t2_sozlama`, `t2_resurs_kategoriya`; команды `sozlama_saqla` → `t2_sozlama_saqla`; `resurs_kategoriya_belgila` → `t2_resurs_kategoriya_belgila_v1`.

- `/admin/storage` (COMPANY, storage): читает `t2_papka_daraxt`, `t2_obyekt_hujjat_royxat`; команды —.

- `/admin/fayl-boglash` (COMPANY, fayl-boglash): читает `t2_manba`, `t2_obyekt_hujjat_royxat`; команды —.

- `/admin/korzinka` (COMPANY, korzinka): читает `t2_korzinka`; команды `korzinkaga_tashlash` → `t2_korzinkaga_tashlash`; `korzinkadan_tiklash` → `t2_korzinkadan_tiklash`.

- `/admin/sayt-xaritasi` (GLOBAL, site-map): читает `koddan yig‘ilgan manifest`; команды —.

- `/admin/narx-manbalari` (COMPANY, narx-manbalari): читает `t2_narx_manba_royxat`; команды `narx_manba_yoz` → `t2_narx_manba_yoz_v1`; `narx_manba_bekor` → `t2_narx_manba_bekor_v1`.

- `/admin/narx-dalil` (COMPANY, narx-dalil): читает `t2_narx_taklif`, `t2_narx_dalil_holat`, `t2_daraxt`; команды `narx_dalil_bogla` → `t2_narx_dalil_bogla_v1`; `narx_dalil_ochir` → `t2_narx_dalil_ochir_v1`.

- `/admin/ai-agentlar` (COMPANY, ai-agentlar): читает `t2_agent_control_v1`; команды `agent run_transition` (не найдено в статической write allowlist; проверить отдельный API); `agent approval_decide` (не найдено в статической write allowlist; проверить отдельный API).

## Полная write allowlist sb-yoz.ts

- `qoshimcha_ish_yarat_v1` → `t2_qoshimcha_ish_yarat_v1`; live routine: PRESENT

- `fakt_smetadan_tashqari_v1` → `t2_fakt_smetadan_tashqari_v1`; live routine: PRESENT

- `ish_turi_saqla_v1` → `t2_ish_turi_saqla_v1`; live routine: PRESENT

- `ish_abc_saqla_v1` → `t2_ish_abc_saqla_v1`; live routine: PRESENT

- `ish_abc_ochir_v1` → `t2_ish_abc_ochir_v1`; live routine: PRESENT

- `qator_ish_abc_ochir_v1` → `t2_ish_abc_ochir_v1`; live routine: PRESENT

- `qator_ish_abc_ochir_v2` → `t2_ish_abc_ochir_v2`; live routine: PRESENT

- `ish_abc_tahrir_v1` → `t2_ish_abc_tahrir_v1`; live routine: PRESENT

- `qator_ish_abc_tahrir_v1` → `t2_ish_abc_tahrir_v1`; live routine: PRESENT

- `qator_ish_abc_tahrir_v2` → `t2_ish_abc_tahrir_v2`; live routine: PRESENT

- `qator_resurs_ish_zamena_v1` → `t2_resurs_ish_zamena_v1`; live routine: PRESENT

- `smeta_bolim_yarat_v1` → `t2_smeta_bolim_yarat_v1`; live routine: PRESENT

- `shartnoma_saqla_v2` → `t2_shartnoma_saqla_v2`; live routine: PRESENT

- `sverka_yozuv_v1` → `t2_sverka_yozuv_v1`; live routine: PRESENT

- `fayl_amal_v1` → `t2_fayl_amal_v1`; live routine: PRESENT

- `m29_bajar_v1` → `t2_m29_bajar_v1`; live routine: PRESENT

- `m29_bekor_v1` → `t2_m29_bekor_v1`; live routine: PRESENT

- `token_sarfla_v1` → `t2_token_sarfla_v1`; live routine: PRESENT

- `token_qaytar_v1` → `t2_token_qaytar_v1`; live routine: PRESENT

- `token_yakunla_v1` → `t2_token_yakunla_v1`; live routine: PRESENT

- `tolov_sorov_yarat_v1` → `t2_tolov_sorov_yarat_v1`; live routine: PRESENT

- `token_toldir_v1` → `t2_token_toldir_v1`; live routine: PRESENT

- `obuna_belgila_v1` → `t2_obuna_belgila_v1`; live routine: PRESENT

- `demo_manba_belgila_v1` → `t2_demo_manba_belgila_v1`; live routine: PRESENT

- `zamena_ish_yarat_v1` → `t2_zamena_ish_yarat_v1`; live routine: PRESENT

- `zamena_almashtirish_belgila_v1` → `t2_zamena_almashtirish_belgila_v1`; live routine: PRESENT

- `resurs_bola_qosh_v1` → `t2_resurs_bola_qosh_v1`; live routine: PRESENT

- `ish_resurslar_bilan_yarat_v1` → `t2_ish_resurslar_bilan_yarat_v1`; live routine: PRESENT

- `catalog_observation_yoz_v1` → `t2_catalog_observation_yoz_v1`; live routine: PRESENT

- `smeta_narxla_res` → `t2_smeta_narxla_res_v2`; live routine: PRESENT

- `smeta_narxla_res_v3` → `t2_smeta_narxla_res_v3`; live routine: PRESENT

- `qator_tahrir` → `t2_qator_tahrir`; live routine: PRESENT

- `qator_qosh` → `t2_qator_qosh`; live routine: PRESENT

- `akt_yarat` → `t2_akt_yarat`; live routine: PRESENT

- `akt_yarat_v2` → `t2_akt_yarat_v2`; live routine: PRESENT

- `f2_qoralama_yangila_v1` → `t2_f2_qoralama_yangila_v1`; live routine: PRESENT

- `price_basis_yarat` → `t2_price_basis_yarat_v1`; live routine: PRESENT

- `f2_import_job_yarat` → `t2_f2_import_job_yarat_v1`; live routine: PRESENT

- `f2_import_job_ilgarilash` → `t2_f2_import_job_ilgarilash_v1`; live routine: PRESENT

- `f2_import_job_recover` → `t2_f2_import_job_recover_v1`; live routine: PRESENT

- `f2_import_job_cancel` → `t2_f2_import_job_cancel_v1`; live routine: PRESENT

- `f2_import_draft_saqla` → `t2_f2_import_draft_saqla_v1`; live routine: PRESENT

- `akt_lifecycle_transition_v1` → `t2_akt_lifecycle_transition_v1`; live routine: PRESENT

- `akt_correction_create_v1` → `t2_akt_correction_create_v1`; live routine: PRESENT

- `akt_tasdiqlash` → `t2_akt_tasdiqlash`; live routine: PRESENT

- `akt_bekor` → `t2_akt_bekor`; live routine: PRESENT

- `narx_belgila` → `t2_narx_belgila`; live routine: PRESENT

- `narx_sana_qosh` → `t2_narx_sana_qosh`; live routine: PRESENT

- `skladga_yozish` → `t2_skladga_yozish`; live routine: PRESENT

- `faktura_yoz` → `t2_faktura_yoz`; live routine: PRESENT

- `ish_turi_yoz` → `t2_ish_turi_yoz`; live routine: PRESENT

- `shaxsiy_smeta_yarat` → `t2_shaxsiy_smeta_yarat`; live routine: PRESENT

- `erp_amal` → `t2_erp_amal`; live routine: PRESENT

- `grafik_yangilash` → `t2_grafik_yangilash`; live routine: PRESENT

- `grafik_sozlama_saqla` → `t2_grafik_sozlama_saqla`; live routine: PRESENT

- `boss_tahlil_boshla` → `t2_boss_tahlil_boshla`; live routine: NOT_OBSERVED

- `sozlama_saqla` → `t2_sozlama_saqla`; live routine: NOT_OBSERVED

- `tizim_amal` → `t2_tizim_amal`; live routine: NOT_OBSERVED

- `xato_yoz` → `t2_xato_yoz`; live routine: NOT_OBSERVED

- `kirish_amal` → `t2_kirish_amal`; live routine: NOT_OBSERVED

- `taklif_yubor` → `t2_taklif_yubor`; live routine: NOT_OBSERVED

- `taklif_qabul` → `t2_taklif_qabul`; live routine: NOT_OBSERVED

- `birja_rfq_yarat` → `t2_birja_rfq_yarat`; live routine: PRESENT

- `birja_taklif_ber` → `t2_birja_taklif_ber`; live routine: PRESENT

- `viborka_smetadan_toldir` → `t2_viborka_smetadan_toldir`; live routine: PRESENT

- `viborka_qabul_yoz` → `t2_viborka_qabul_yoz`; live routine: PRESENT

- `shartnoma_saqla` → `t2_shartnoma_saqla`; live routine: PRESENT

- `shartnoma_ochir` → `t2_shartnoma_ochir`; live routine: PRESENT

- `shartnoma_bog_saqla` → `t2_shartnoma_bog_saqla`; live routine: PRESENT

- `nakrutka_saqla` → `t2_nakrutka_saqla`; live routine: PRESENT

- `tolov_yoz` → `t2_tolov_yoz`; live routine: PRESENT

- `tolov_tahrir` → `t2_tolov_tahrir`; live routine: PRESENT

- `tolov_ochir` → `t2_tolov_ochir`; live routine: PRESENT

- `xarajat_yoz` → `t2_xarajat_yoz`; live routine: PRESENT

- `xarajat_tahrir` → `t2_xarajat_tahrir`; live routine: PRESENT

- `xarajat_ochir` → `t2_xarajat_ochir`; live routine: PRESENT

- `korzinkaga_tashlash` → `t2_korzinkaga_tashlash`; live routine: PRESENT

- `korzinkadan_tiklash` → `t2_korzinkadan_tiklash`; live routine: PRESENT

- `butunlay_ochirish` → `t2_butunlay_ochirish`; live routine: PRESENT

- `obyekt_yangila` → `t2_obyekt_yangila`; live routine: PRESENT

- `aosr_yoz` → `t2_aosr_yoz`; live routine: PRESENT

- `aosr_bekor` → `t2_aosr_bekor`; live routine: PRESENT

- `aosr_bog_saqla` → `t2_aosr_bog_saqla`; live routine: PRESENT

- `aosr_bog_ochir` → `t2_aosr_bog_ochir`; live routine: PRESENT

- `aosr_yoz_v2` → `t2_aosr_yoz_v2`; live routine: PRESENT

- `lab_protokol_yoz` → `t2_lab_protokol_yoz_v1`; live routine: PRESENT

- `lab_protokol_bekor` → `t2_lab_protokol_bekor_v1`; live routine: PRESENT

- `lab_protokol_bog_saqla` → `t2_lab_protokol_bog_saqla_v1`; live routine: PRESENT

- `kompaniya_logo_saqla` → `t2_kompaniya_logo_saqla_v1`; live routine: PRESENT

- `nakrutka_podval_saqla` → `t2_nakrutka_podval_saqla_v1`; live routine: PRESENT

- `nakrutka_podval_ochir` → `t2_nakrutka_podval_ochir_v1`; live routine: PRESENT

- `narx_manba_yoz` → `t2_narx_manba_yoz_v1`; live routine: PRESENT

- `narx_manba_bekor` → `t2_narx_manba_bekor_v1`; live routine: PRESENT

- `platforma_narx_manba_yoz` → `t2_platforma_narx_manba_yoz_v1`; live routine: PRESENT

- `platforma_narx_manba_bekor` → `t2_platforma_narx_manba_bekor_v1`; live routine: PRESENT

- `obyekt_hudud_belgila` → `t2_obyekt_hudud_belgila_v1`; live routine: PRESENT

- `narx_protokol_yarat` → `t2_narx_protokol_yarat_v1`; live routine: PRESENT

- `narx_protokol_tasdiqla` → `t2_narx_protokol_tasdiqla_v1`; live routine: PRESENT

- `narx_protokol_bekor` → `t2_narx_protokol_bekor_v1`; live routine: PRESENT

- `narx_dalil_bogla` → `t2_narx_dalil_bogla_v1`; live routine: PRESENT

- `narx_dalil_ochir` → `t2_narx_dalil_ochir_v1`; live routine: PRESENT

- `audit_yoz` → `t2_audit_yoz`; live routine: PRESENT

- `hujjat_yoz` → `t2_obyekt_hujjat_yoz`; live routine: PRESENT

- `hujjat_ochir` → `t2_obyekt_hujjat_ochir`; live routine: PRESENT

- `sklad_mustaqil_yarat` → `t2_sklad_yarat`; live routine: PRESENT

- `kadr_mustaqil_yarat` → `t2_kadr_yarat`; live routine: PRESENT

- `texnika_mustaqil_yarat` → `t2_texnika_yarat`; live routine: PRESENT

- `resurs_yarat_v2` → `t2_resurs_yarat_v2`; live routine: NOT_OBSERVED

- `resurs_yangila_v2` → `t2_resurs_yangila_v2`; live routine: NOT_OBSERVED

- `resurs_bekor_v2` → `t2_resurs_bekor_v2`; live routine: NOT_OBSERVED

- `resurs_bog_saqla` → `t2_resurs_bog_saqla`; live routine: PRESENT

- `resurs_bog_ochir` → `t2_resurs_bog_ochir`; live routine: PRESENT

- `loyiha_yarat` → `t2_loyiha_yarat`; live routine: PRESENT

- `loyiha_yangila` → `t2_loyiha_yangila`; live routine: PRESENT

- `loyiha_ochir` → `t2_loyiha_ochir`; live routine: PRESENT

- `obyekt_loyihaga_biriktir` → `t2_obyekt_loyihaga_biriktir`; live routine: PRESENT

- `obyekt_yarat` → `t2_obyekt_yarat_v1`; live routine: PRESENT

- `resurs_kategoriya_belgila` → `t2_resurs_kategoriya_belgila_v1`; live routine: PRESENT

- `nakrutka_koef_saqla` → `t2_nakrutka_koef_saqla_v1`; live routine: PRESENT

- `shartnoma_qamrov_saqla` → `t2_shartnoma_qamrov_saqla_v1`; live routine: NOT_OBSERVED

- `loyiha_qatnashchi_biriktir` → `t2_loyiha_qatnashchi_biriktir`; live routine: PRESENT

- `loyiha_qatnashchi_ochir` → `t2_loyiha_qatnashchi_ochir`; live routine: PRESENT

- `kontragent_saqla` → `t2_kontragent_saqla`; live routine: PRESENT

- `kontragent_ochir` → `t2_kontragent_ochir`; live routine: PRESENT

- `bajarilmadi_belgila` → `t2_bajarilmadi_belgila_v1`; live routine: PRESENT

- `bajarilmadi_bekor` → `t2_bajarilmadi_bekor_v1`; live routine: PRESENT

- `xarajat_kirit_v1` → `t2_xarajat_kirit_v1`; live routine: PRESENT

- `xarajat_bekor_v1` → `t2_xarajat_bekor_v1`; live routine: PRESENT

- `fakt_yoz_v2` → `t2_fakt_yoz_v2`; live routine: PRESENT

- `fakt_belgila_v2` → `t2_fakt_belgila_v2`; live routine: PRESENT

- `fakt_belgila` → `t2_fakt_belgila`; live routine: PRESENT

- `azolik_qosh` → `t2_azolik_qosh_v1`; live routine: PRESENT

- `azolik_rol_ozgartir` → `t2_azolik_rol_ozgartir_v1`; live routine: PRESENT

- `azolik_ochir` → `t2_azolik_ochir_v1`; live routine: PRESENT

- `kompaniya_yangila` → `t2_kompaniya_yangila`; live routine: PRESENT

- `material_alias_yoz` → `t2_material_alias_yoz`; live routine: PRESENT

- `material_alias_ochir` → `t2_material_alias_ochir`; live routine: PRESENT

- `mindmap_bog` → `t2_mindmap_bog_v2`; live routine: PRESENT

- `mindmap_bog_ochir` → `t2_mindmap_bog_ochir_v2`; live routine: PRESENT

- `mindmap_joylashuv_saqla` → `t2_mindmap_joylashuv_saqla_v2`; live routine: PRESENT

- `mindmap_tugun_ochir` → `t2_mindmap_tugun_ochir_v2`; live routine: PRESENT

## Маршруты меню

- `/admin/ish-joylarim`

- `/admin/mutaxassis`

- `/admin/obyektlar`

- `/admin/smeta-studio`

- `/admin/holat`

- `/admin/f2-tayyorlash`

- `/admin/f2`

- `/admin/f2-tarix`

- `/admin/f2-reestr`

- `/admin/nakopitelniy`

- `/admin/m29`

- `/admin/aosr`

- `/admin/smeta-narxlash`

- `/admin/oferta`

- `/admin/narx-manbalari`

- `/admin/narx-dalil`

- `/admin/nakrutka`

- `/admin/narxlar`

- `/admin/loyiha`

- `/admin/shartnoma-liniya`

- `/admin/documents`

- `/admin/hujjat-nazorat`

- `/admin/participants`

- `/admin/crm`

- `/admin/zakazchik`

- `/admin/taqdimlar`

- `/admin/murojaatlar`

- `/admin/aloqalar`

- `/admin/dashboard`

- `/admin/moliya`

- `/admin/logistika`

- `/admin/zayavka`

- `/admin/erp`

- `/admin/mindmap`

- `/admin/kompaniya`

- `/admin/tokenlar`

- `/admin/hujjat-dizayn`

- `/admin/tizim-sozlama`

- `/admin/boshqaruv`

- `/admin/system-control`

- `/admin/ai-agentlar`

- `/admin/sayt-xaritasi`

- `/admin/storage`

- `/admin/fayl-boglash`

- `/admin/korzinka`

## Сегменты App.tsx (включая aliases/redirects)

- `/`

- `/qoshil/:kod`

- `/ulash/:kod`

- `/admin`

- `dashboard`

- `obyektlar`

- `loyiha`

- `holat`

- `holat/:id`

- `fakt`

- `f2-tayyorlash`

- `f2`

- `f2-tarix`

- `f2-reestr`

- `nakopitelniy`

- `f2-eski`

- `tokenlar`

- `topshiriqlar`

- `ish-joylarim`

- `mutaxassis`

- `boshqaruv`

- `hujjat-dizayn`

- `smeta-studio`

- `shartnoma-liniya`

- `m29`

- `nakrutka`

- `narx-manbalari`

- `narx-dalil`

- `smeta-narxlash`

- `oferta`

- `buxgalteriya`

- `shartnomalar`

- `fakturalar`

- `sklad`

- `narxlar`

- `ierarxiya`

- `monitoring`

- `sozlamalar`

- `fayl-boglash`

- `hujjatlar`

- `shaxsiy-smeta`

- `supabase`

- `tezlik`

- `storage`

- `mindmap`

- `documents`

- `hujjat-nazorat`

- `participants`

- `zakazchik`

- `zakazchik/obyekt/:aloqaId/:obyektId`

- `aloqalar`

- `taqdimlar`

- `murojaatlar`

- `system-control`

- `sayt-xaritasi`

- `ai-agentlar`

- `kompaniya`

- `_demo/documents`

- `_demo/participants`

- `_demo/system-control`

- `test`

- `portfel`

- `moliya`

- `logistika`

- `crm`

- `sozlama`

- `xodimlar`

- `korzinka`

- `xarita`

- `kontragent`

- `saqlash`

- `smeta`

- `daraxt`

- `tolov`

- `zayavka`

- `f2native`

- `faktura`

- `erp`

- `hisobot`

- `tizim`

- `aosr`

- `kadrlar`

- `texnika`

- `taminot`

- `sifat`

- `tizim-sozlama`

- `shartnoma`

- `kalkulyator`

- `*`

- `/boss`

- `eski`

## Read allowlist sb.ts (таблицы и views)

- `v_sklad_nomlar`

- `zgusi) 2026-10-06 bazadan o`

- `t2_kompaniya`

- `t2_obyekt`

- `t2_obyekt_jami`

- `t2_daraxt`

- `t2_qator`

- `t2_narx`

- `t2_manba`

- `t2_xom`

- `t2_lrv`

- `t2_kozgu`

- `t2_ozgarish`

- `t2_sozlama`

- `t2_akt`

- `t2_akt_qator`

- `t2_akt_reestr`

- `t2_shartnoma_bog_kompaniya`

- `t2_qator_holat`

- `t2_faktura`

- `t2_ish_turi`

- `t2_shaxsiy_smeta`

- `v_erp_kadrlar_dashboard`

- `v_erp_texnika_dashboard`

- `v_erp_taminot_dashboard`

- `v_erp_sifat_dashboard`

- `t2_grafik_holat`

- `v_boss_init`

- `v_boss_data`

- `t2_birja_rfq`

- `t2_birja_taklif`

- `t2_sklad_qoldiq`

- `t2_sklad_harakat`

- `t2_m29_hujjat`

- `t2_narx_markaz`

- `t2_topilmaganlar`

- `t2_narx_sana`

- `t2_narx_qol_xavf`

- `t2_f2_kat_oy`

- `t2_f2_tafsilot`

- `t2_viborka`

- `t2_viborka_qabul`

- `t2_viborka_holat`

- `t2_shartnoma`

- `t2_shartnoma_bog`

- `t2_nakrutka`

- `t2_qoshimcha_ish`

- `t2_obyekt_nakrutka`

- `t2_tolov`

- `t2_xarajat`

- `t2_bux_dashboard`

- `t2_debitor_aging`

- `t2_bux_umumiy`

- `t2_aosr_reestr`

- `t2_aosr_coverage`

- `t2_aosr_qator_holat`

- `t2_aosr_reestr_v2`

- `t2_lab_protokol_reestr`

- `t2_kompaniya_logo`

- `t2_nakrutka_podval_royxat`

- `t2_narx_manba_royxat`

- `t2_narx_manba_qator`

- `t2_narx_taklif`

- `t2_narx_dalil_holat`

- `t2_platforma_narx_manba`

- `t2_platforma_narx_manba_qator`

- `t2_narx_protokol_royxat`

- `t2_narx_protokol_qator`

- `t2_korzinka`

- `t2_audit_reestr`

- `t2_obyekt_hujjat_royxat`

- `t2_sklad_royxat`

- `t2_kadr_royxat`

- `t2_texnika_royxat`

- `t2_loyiha_royxat`

- `t2_loyiha_qatnashchilar_royxat`

- `t2_kontragent_royxat`

- `t2_azolik_royxat`

- `t2_material_alias_royxat`

- `t2_zayavka_royxat`

- `t2_hodisa_lenta`

- `t2_papka_daraxt`

- `t2_hujjat_turi`

- `t2_overbilling_radar`

- `t2_sklad_konsolidatsiya`

## Граница автоматизации

Связи конкретного экрана перечислены в существующем frontend/src/lib/sayt-xaritasi/pageCatalog.ts. Allowlist не является сквозным разрешением: gateway и RPC проверяют компанию/акт/actor. MCP — отдельный локальный privileged путь, его sql_yozish не проходит web allowlist. Не добавлять новый маршрут/таблицу без проверки эквивалента в CODEMAP.
