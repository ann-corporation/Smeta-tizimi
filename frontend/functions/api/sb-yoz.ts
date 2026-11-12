/**
 * sb-yoz.ts — TIZIM_02 GA YOZISH (ataylab ЖУДА tor eshik)
 * ═══════════════════════════════════════════════════════════════════
 *
 * `/api/sb` FAQAT O'QIYDI va shunday qolishi kerak. Yozish alohida,
 * o'ta cheklangan eshikdan o'tadi.
 *
 * QOIDALAR:
 *   1) FAQAT quyidagi NOMLANGAN amallar. Ixtiyoriy SQL, ixtiyoriy
 *      jadval, ixtiyoriy RPC — YO'Q. Yangi amal qo'shish = shu faylga
 *      ataylab kod yozish, ya'ni ko'rib chiqiladigan qaror.
 *   2) Har amalning O'Z validatsiyasi bor. «Universal» tekshiruv yo'q.
 *   3) Versiya/idempotentlik majburiy — «oxirgi yozgan yutadi» va
 *      takroriy hujjat moliyaviy ma'lumotda qabul qilinmaydi.
 *   4) Rahbar roli YOZA OLMAYDI — `/api/gas` dagi bilan bir xil qoida.
 *   5) Kim yozgani jurnalga tushadi (`kim` = sessiya email).
 *
 * NIMA UCHUN alohida fayl: o'qish eshigining oq ro'yxati kengayib
 * ketishi mumkin, lekin yozish eshigi HECH QACHON kengaymasligi kerak.
 * Ikkisini bir faylda saqlash — kelajakda tasodifan yozishga ruxsat
 * berib qo'yishning eng qisqa yo'li.
 */
import { tokenJavobTozala } from '../_shared/tizim-maxfiy';
import { cachedAuthority, dataPermission } from '../_shared/permission-policy';
import { ilovaDarvozasi } from '../_shared/ilova-darvoza';
import { amalIlovasi } from '../../src/lib/ilova/ilovalar';
import { tekshir } from '../_shared/auth';
import { supabaseBaseUrl } from '../_shared/supabase-url';
import { bazaBiznesKodi, xavfsizUpstream, xavfsizXato } from '../_shared/xato';
import { azoKompaniyalar } from '../_shared/tenant-oqish';
import { roleAuthority, sessiyaYaroqsizmi, yaroqsizSessiyaJavob, mayWriteCompanies } from '../_shared/role-authority';
import { egaQarori, egalarniOqi, yozishTalablari } from '../_shared/tenant-yozish';
import { katalogSnapshotlari } from '../_shared/narx-katalog-snapshot';
import { sotuvAmalmi, sotuvYuk } from '../_shared/sotuv-yuk';
import { ybAmalmi, ybYuk } from '../_shared/yuk-birjasi-yuk';
import { TENDER_AMALLAR, tenderYuk } from '../_shared/tender-yuk';
import { BUYURTMA_AMALLAR, buyurtmaYuk } from '../_shared/buyurtma-yuk';

/** HR: jsonb obyektidan oq ro'yxatdagi skalyar maydonlarni oladi (matn ≤500); noto'g'ri tur yoki obyekt emas - null. */
function hrPick(src: unknown, kalitlar: readonly string[]): Record<string, unknown> | null {
  if (src == null || typeof src !== 'object' || Array.isArray(src)) return null;
  const r: Record<string, unknown> = {};
  for (const k of kalitlar) {
    const x = (src as Record<string, unknown>)[k];
    if (x === undefined) continue;
    if (x !== null && typeof x !== 'string' && typeof x !== 'number' && typeof x !== 'boolean') return null;
    r[k] = typeof x === 'string' ? x.slice(0, 500) : x;
  }
  return r;
}

/** Har amal → qaysi RPC va uni kim chaqira oladi. */
const AMALLAR = {
  qoshimcha_ish_yarat_v1: { rpc: 't2_qoshimcha_ish_yarat_v1' },
  /* Egasi 2026-10-01: fakt kiritishda qo'shimcha ish/zamena, smetasiz obyekt (qator + resurslar + fakt bitta tranzaksiya). */
  fakt_smetadan_tashqari_v1: { rpc: 't2_fakt_smetadan_tashqari_v1' },
  ish_turi_saqla_v1: { rpc: 't2_ish_turi_saqla_v1' },
  /* Egasi 2026-10-01 — kichik ABC: ШНК tuzilishida qo'shimcha ish / ish zamenasi / resurs zamenasi. */
  ish_abc_saqla_v1: { rpc: 't2_ish_abc_saqla_v1' },
  /* Qo'shilgan qatorlarni o'chirish/asliga qaytarish va tahrirlash — smeta qatorlari o'zgarmas (server tekshiradi). */
  ish_abc_ochir_v1: { rpc: 't2_ish_abc_ochir_v1' },
  qator_ish_abc_ochir_v1: { rpc: 't2_ish_abc_ochir_v1' },
  qator_ish_abc_ochir_v2: { rpc: 't2_ish_abc_ochir_v2' },
  ish_abc_tahrir_v1: { rpc: 't2_ish_abc_tahrir_v1' },
  qator_ish_abc_tahrir_v1: { rpc: 't2_ish_abc_tahrir_v1' },
  qator_ish_abc_tahrir_v2: { rpc: 't2_ish_abc_tahrir_v2' },
  /* Egasi 2026-10-18: smeta resursi o'rniga ish(lar) (ГПС → qazib olish + tashish) — asl resurs o‘zgarmaydi. */
  qator_resurs_ish_zamena_v1: { rpc: 't2_resurs_ish_zamena_v1' },
  /* Egasi 2026-10-21: smetaga bo'lim (razdel) yaratish; o'chirish — qator_ish_abc_ochir_v2 (qo'shilgan qator). */
  smeta_bolim_yarat_v1: { rpc: 't2_smeta_bolim_yarat_v1' },
  /* Egasi 2026-11-05: ish kartasi (amaliy ish birligi ↔ smeta qatorlari, ishora va koef bilan) + bosqich ulushlari.
     RPC a'zolik + smeta.write ni o'zi tekshiradi; idempotent (operation_id), CAS (kutilgan_versiya). */
  ish_kartasi_saqla_v1: { rpc: 't2_ish_kartasi_saqla_v1' },
  ish_kartasi_arxiv_v1: { rpc: 't2_ish_kartasi_arxiv_v1' },
  ish_kartasi_ulush_saqla_v1: { rpc: 't2_ish_kartasi_ulush_saqla_v1' },
  /* Naryad (brigada/usta topshirig'i) + kompaniya lug'ati (20261214800000): bitta yozuvchi RPC, ichki amal (yarat/bajarildi/qabul/fakt_yozildi/hisobla/bekor/lugat_saqla).
     RPC a'zolik + smeta.write (hisobla — yana financial.write) ni o'zi tekshiradi; idempotent (operation_id), CAS (kutilgan_versiya). */
  naryad_yoz_v1: { rpc: 't2_naryad_yoz_v1' },
  /* Egasi 2026-10-01: shartnoma kartasi — loyiha, erkin turdagi tomonlar, obyektlar to'plami (asosiy: obyektda bitta). */
  shartnoma_saqla_v2: { rpc: 't2_shartnoma_saqla_v2' },
  /* Egasi 2026-11-02: qarzdorlik - asoslar saqlash (CAS) va Excel importi (idempotent operation_id). RPC a'zolik + financial.write ni o'zi tekshiradi. */
  qarzdorlik_saqla_v1: { rpc: 't2_qarzdorlik_saqla_v1' },
  qarzdorlik_import_v1: { rpc: 't2_qarzdorlik_import_v1' },
  /* Egasi 2026-11-04: HR + KPI (xodim kartasi, sxema/stavka, kalendar/tatil, tabel, jarima/bonus, ish haqi qoralamasi).
     RPC lar a'zolik + aniq ruxsatni (hr.write, hr.pii.write, hr.tabel.write, payroll.write) o'zi tekshiradi; idempotent (operation_id). */
  hr_xodim_saqla_v1: { rpc: 't2_hr_xodim_saqla_v1' },
  hr_sxema_saqla_v1: { rpc: 't2_hr_sxema_saqla_v1' },
  hr_kalendar_saqla_v1: { rpc: 't2_hr_kalendar_saqla_v1' },
  hr_tabel_saqla_v1: { rpc: 't2_hr_tabel_saqla_v1' },
  hr_tuzatma_saqla_v1: { rpc: 't2_hr_tuzatma_saqla_v1' },
  hr_tuzatma_qaror_v1: { rpc: 't2_hr_tuzatma_qaror_v1' },
  hr_oylik_v1: { rpc: 't2_hr_oylik_hisobla_v1' },
  hr_kpi_qoida_saqla_v1: { rpc: 't2_hr_kpi_qoida_saqla_v1' },
  /* Egasi 2026-11-04: buxgalteriya (reja, o'zgarmas jurnal, avto-provodka, davr, bank importi, HR ilgagi). RPC a'zolik + accounting.* ni o'zi tekshiradi; idempotent (operation_id). */
  bux_boshlash_v1: { rpc: 't2_bux_boshlash_v1' },
  bux_hisob_saqla_v1: { rpc: 't2_bux_hisob_saqla_v1' },
  bux_moslik_saqla_v1: { rpc: 't2_bux_moslik_saqla_v1' },
  bux_avto_v1: { rpc: 't2_bux_avto_provodka_v1' },
  bux_qolda_v1: { rpc: 't2_bux_qolda_provodka_v1' },
  bux_storno_v1: { rpc: 't2_bux_storno_v1' },
  bux_davr_v1: { rpc: 't2_bux_davr_v1' },
  bux_shablon_tanla_v1: { rpc: 't2_bux_shablon_tanla_v1' },
  bux_davr_blok_v1: { rpc: 't2_bux_davr_blok_v1' },
  bux_hisob_tasdiq_v1: { rpc: 't2_bux_hisob_tasdiq_v1' },
  bux_saldo_import_v1: { rpc: 't2_bux_saldo_import_v1' },
  bux_saldo_bekor_v1: { rpc: 't2_bux_saldo_bekor_v1' },
  bux_tannarx_v1: { rpc: 't2_bux_tannarx_v1' },
  bux_hisobot_saqla_v1: { rpc: 't2_bux_hisobot_saqla_v1' },
  bux_bank_yuklash_v1: { rpc: 't2_bux_bank_yuklash_v1' },
  bux_bank_qabul_v1: { rpc: 't2_bux_bank_qabul_v1' },
  bux_kassa_yoz_v1: { rpc: 't2_bux_kassa_yoz_v1' },
  bux_kassa_bekor_v1: { rpc: 't2_bux_kassa_bekor_v1' },
  bux_taqsim_saqla_v1: { rpc: 't2_bux_taqsim_saqla_v1' },
  bux_bank_import_v1: { rpc: 't2_bux_bank_import_v1' },
  bux_tashqi_v1: { rpc: 't2_bux_tashqi_sync_v1' },
  /* Egasi 2026-11-03: shartnoma oylik paketi - «Topshirildi» (versiya, manifest, ZIP kanonik saqlashda). RPC a'zolik + document.write ni o'zi tekshiradi; idempotent (operation_id). */
  shartnoma_oylik_paket_saqla_v1: { rpc: 't2_shartnoma_oylik_paket_saqla_v1' },
  /* Egasi 2026-11-05: shartnoma / DS asl fayli (kanonik R2, /api/hujjat-yukla) ↔ shartnoma bog'i. RPC a'zolik + document.write ni o'zi tekshiradi; idempotent. */
  shartnoma_hujjat_bogla_v1: { rpc: 't2_shartnoma_hujjat_bogla_v1' },
  shartnoma_hujjat_ajrat_v1: { rpc: 't2_shartnoma_hujjat_ajrat_v1' },
  /* Egasi 2026-11-03: UY SOTISH (20261124000000) — inventar, narx, bitim, bron, grafik, to'lov. Yuk: _shared/sotuv-yuk.ts (oq ro'yxat);
     RPC a'zolik + sales.* ni o'zi tekshiradi; idempotent (operation_id). */
  sotuv_loyiha_saqla_v1: { rpc: 't2_sotuv_loyiha_saqla_v1' },
  sotuv_birlik_saqla_v1: { rpc: 't2_sotuv_birlik_saqla_v1' },
  sotuv_narx_ozgartir_v1: { rpc: 't2_sotuv_narx_ozgartir_v1' },
  sotuv_birlik_holat_v1: { rpc: 't2_sotuv_birlik_holat_v1' },
  sotuv_bitim_saqla_v1: { rpc: 't2_sotuv_bitim_saqla_v1' },
  sotuv_bron_v1: { rpc: 't2_sotuv_bron_v1' },
  sotuv_bron_bekor_v1: { rpc: 't2_sotuv_bron_bekor_v1' },
  sotuv_grafik_saqla_v1: { rpc: 't2_sotuv_grafik_saqla_v1' },
  sotuv_tolov_yoz_v1: { rpc: 't2_sotuv_tolov_yoz_v1' },
  sotuv_tolov_bekor_v1: { rpc: 't2_sotuv_tolov_bekor_v1' },
  /* Egasi 2026-10-23: shartnoma svodi/akt-sverka yozuvlari — DS, F2 reestri, sotuv (F3 summasi). RPC a'zolik + financial.write ni o'zi tekshiradi. */
  sverka_yozuv_v1: { rpc: 't2_sverka_yozuv_v1' },
  /* Egasi 2026-10-26: 1C akt-sverka importi (partiya ≤ 200: to'lov + F3 sotuv + F2 to'plami), to'lov taqsimoti, Продажа ↔ F2.
     RPC a'zolik + financial.write ni o'zi tekshiradi; idempotent (operation_id). */
  sverka_import_v1: { rpc: 't2_sverka_import_v1' },
  tolov_taqsimot_saqla_v1: { rpc: 't2_tolov_taqsimot_saqla_v1' },
  forma3_f2_bog_v1: { rpc: 't2_forma3_f2_bog_v1' },
  /* Rasmiy F2 reestri jamilari (QQSsiz / QQS / QQS bilan): t2_akt.hujjat_jami — bog'langan qatorlar pryamye, hujjat jami emas. */
  f2_reestr_yoz_v1: { rpc: 't2_f2_reestr_yoz_v1' },
  /* Egasi 2026-10-20: fayl menejeri — o'z papkalari, ko'rinadigan nom, ko'chirish, savat (kanonik hujjat o'zgarmaydi). */
  fayl_amal_v1: { rpc: 't2_fayl_amal_v1' },
  /* Egasi 2026-10-21 (ADR-3): ombor Fakt orqali emas — bajarilgan M-29 orqali kamayadi. */
  m29_bajar_v1: { rpc: 't2_m29_bajar_v1' },
  m29_bekor_v1: { rpc: 't2_m29_bekor_v1' },
  /* C11 PR-B (2026-10-29): markaziy ombor kirimi — «Приход» varag'idan ≤1000 qatorlik bo'lak (R2 da tasdiqlangan
     hujjat, idempotent operation_id) va 24 soat ichida storno (sabab majburiy). RPC a'zolik + document.write. */
  sklad_kirim_import_v1: { rpc: 't2_sklad_markaziy_prixod_import_v1' },
  sklad_kirim_storno_v1: { rpc: 't2_sklad_markaziy_prixod_storno_v1' },
  /* C11 BERDIM (20261211110000): markaziy ombor -> obyekt qoldig'i (t2_skladga_yozish orqali), bitta tranzaksiya, operation_id idempotent. */
  sklad_berdim_v1: { rpc: 't2_sklad_markaziy_berdim_v1' },
  /* Egasi 2026-10-02: token daftari (o'zgarmas): sarf/qaytarish — a'zo; to'ldirish/obuna/demo — faqat superadmin (RPC ichida). */
  token_sarfla_v1: { rpc: 't2_token_sarfla_v1' },
  token_qaytar_v1: { rpc: 't2_token_qaytar_v1' },
  token_yakunla_v1: { rpc: 't2_token_yakunla_v1' },
  /* Egasi 2026-10-02: token sotib olish so'rovi (o'tkazma; superadmin tasdiqlaydi — /api/boshqaruv). */
  tolov_sorov_yarat_v1: { rpc: 't2_tolov_sorov_yarat_v1' },
  token_toldir_v1: { rpc: 't2_token_toldir_v1' },
  obuna_belgila_v1: { rpc: 't2_obuna_belgila_v1' },
  demo_manba_belgila_v1: { rpc: 't2_demo_manba_belgila_v1' },
  zamena_ish_yarat_v1: { rpc: 't2_zamena_ish_yarat_v1' },
  /* Zamena «aslning qancha hajmini almashtiradi» (birlik farqli) -- t2_qator.almashtirish_hajm, faqat shu ustun. */
  zamena_almashtirish_belgila_v1: { rpc: 't2_zamena_almashtirish_belgila_v1' },
  resurs_bola_qosh_v1: { rpc: 't2_resurs_bola_qosh_v1' },
  /* Egasi 2026-09-28: zamena/qo'shimcha ish RESURSLARI BILAN bitta so'rov, bitta tranzaksiya. */
  ish_resurslar_bilan_yarat_v1: { rpc: 't2_ish_resurslar_bilan_yarat_v1' },
  catalog_observation_yoz_v1: { rpc: 't2_catalog_observation_yoz_v1' },
  smeta_narxla_res: { rpc: 't2_smeta_narxla_res_v2' },
  /* JONLI_SINOV_TOPILMALARI #14 (2026-10-23): foydalanuvchi tanlovi bilan 0 narxli RS/MAT/OB ham to'ldiriladi. */
  smeta_narxla_res_v3: { rpc: 't2_smeta_narxla_res_v3' },
  qator_tahrir:   { rpc: 't2_qator_tahrir' },
  qator_qosh:     { rpc: 't2_qator_qosh' },
  akt_yarat:      { rpc: 't2_akt_yarat' },
  /* T2-REAL-PARK-LRV-VERTICAL-SLICE-004: exact-source F2 write path.
     No smeta-price fallback exists anywhere in t2_akt_yarat_v2 -- a
     missing certified_unit_price/certified_amount REJECTS the batch
     (MISSING_CERTIFIED_PRICE/MISSING_CERTIFIED_AMOUNT) instead of
     silently substituting the smeta price like legacy akt_yarat can.
     Legacy akt_yarat above is UNCHANGED -- GAS (Smeta tizimi/
     T2_F2Import.js) still uses it directly, not through this gateway. */
  akt_yarat_v2:   { rpc: 't2_akt_yarat_v2' },
  // F2 import: mavjud QORALAMA aktning qatorlarini yangilash (tasdiqlangan akt rad etiladi; 2026-10-20).
  f2_qoralama_yangila_v1: { rpc: 't2_f2_qoralama_yangila_v1' },
  // F2 hujjat podvali (egasi 2026-11-03): import / storno nusxasi / backfill (tasdiqlangan uchun faqat backfill - RPC ichida).
  akt_podval_yoz_v1: { rpc: 't2_akt_podval_yoz_v1' },
  price_basis_yarat: { rpc: 't2_price_basis_yarat_v1' },
  /* T2-GAS-EXIT-001 §5/§6: resumable F2 import job + durable draft mapping.
     Read-only counterparts (f2_import_job_holat_v1/f2_import_draft_royxat_v1)
     live in /api/sb (they are `stable`, GET-safe). These three are volatile
     writes: create/advance the job, upsert draft rows. p_actor_id ALWAYS
     from the verified session, exactly like every other v1 RPC here. */
  f2_import_job_yarat: { rpc: 't2_f2_import_job_yarat_v1' },
  f2_import_job_ilgarilash: { rpc: 't2_f2_import_job_ilgarilash_v1' },
  f2_import_job_recover: { rpc: 't2_f2_import_job_recover_v1' },
  f2_import_job_cancel: { rpc: 't2_f2_import_job_cancel_v1' },
  f2_import_draft_saqla: { rpc: 't2_f2_import_draft_saqla_v1' },
  akt_lifecycle_transition_v1: { rpc: 't2_akt_lifecycle_transition_v1' },
  akt_correction_create_v1: { rpc: 't2_akt_correction_create_v1' },
  akt_tasdiqlash: { rpc: 't2_akt_tasdiqlash' },
  akt_bekor:      { rpc: 't2_akt_bekor' },
  narx_belgila:   { rpc: 't2_narx_belgila' },
  narx_sana_qosh: { rpc: 't2_narx_sana_qosh' },
  skladga_yozish: { rpc: 't2_skladga_yozish' },
  faktura_yoz:    { rpc: 't2_faktura_yoz' },
  ish_turi_yoz:   { rpc: 't2_ish_turi_yoz' },
  shaxsiy_smeta_yarat: { rpc: 't2_shaxsiy_smeta_yarat' },
  erp_amal:       { rpc: 't2_erp_amal' },
  grafik_yangilash: { rpc: 't2_grafik_yangilash' },
  grafik_sozlama_saqla: { rpc: 't2_grafik_sozlama_saqla' },
  boss_tahlil_boshla: { rpc: 't2_boss_tahlil_boshla' },
  sozlama_saqla: { rpc: 't2_sozlama_saqla' },
  tizim_amal: { rpc: 't2_tizim_amal' },
  xato_yoz: { rpc: 't2_xato_yoz' },
  kirish_amal: { rpc: 't2_kirish_amal' },
  taklif_yubor: { rpc: 't2_taklif_yubor' },
  taklif_qabul: { rpc: 't2_taklif_qabul' },
  birja_rfq_yarat: { rpc: 't2_birja_rfq_yarat' },
  birja_taklif_ber: { rpc: 't2_birja_taklif_ber' },
  /* BUYURTMA (zayavka -> yetkazuvchi, 20261108410000_t2_buyurtma_p3_v1): yaratish, holat o'tishi, olib ketish joyi, qabul. Argumentlar `_shared/buyurtma-yuk.ts` da.
     royxat/tafsilot - FAQAT O'QIYDI, lekin RPC prodda VOLATILE bo'lgani uchun /api/sb (GET) emas, shu yerda (POST). */
  buyurtma_yarat_v1: { rpc: 't2_buyurtma_yarat_v1' },
  buyurtma_otish_v1: { rpc: 't2_buyurtma_otish_v1' },
  buyurtma_olish_yoz_v1: { rpc: 't2_buyurtma_olish_yoz_v1' },
  buyurtma_qabul_v1: { rpc: 't2_buyurtma_qabul_v1' },
  buyurtma_qabul_yakunla_v1: { rpc: 't2_buyurtma_qabul_yakunla_v1' },
  buyurtma_royxat_v1: { rpc: 't2_buyurtmalar_v1' },
  buyurtma_tafsilot_v1: { rpc: 't2_buyurtma_tafsilot_v1' },
  buyurtma_tolov_holati_v1: { rpc: 't2_yet_tolov_holati_v1' },
  /* TENDER protsessi (2026-11-03, 20261122000200_t2_tender_protsess_v1): qoralama → tasdiq → e'lon → ochish → baholash → g'olib. Argumentlar `_shared/tender-yuk.ts` da. */
  tender_saqla_v1: { rpc: 't2_tender_saqla_v1' },
  tender_otish_v1: { rpc: 't2_tender_otish_v1' },
  tender_raund_v1: { rpc: 't2_tender_raund_v1' },
  tender_taklif_v2: { rpc: 't2_tender_taklif_v2' },
  tender_taklif_qaytar_v2: { rpc: 't2_tender_taklif_qaytar_v2' },
  tender_savol_ber_v1: { rpc: 't2_tender_savol_ber_v1' },
  tender_javob_v1: { rpc: 't2_tender_javob_v1' },
  tender_baholash_saqla_v1: { rpc: 't2_tender_baholash_saqla_v1' },
  tender_golib_v2: { rpc: 't2_tender_golib_v2' },
  tender_baho_ber_v1: { rpc: 't2_tender_baho_ber_v1' },
  /* Fayl R2 da (hujjat-yukla); bu yerda faqat hujjat havolasi (metadata). */
  tender_fayl_bogla_v1: { rpc: 't2_tender_fayl_bogla_v1' },
  tender_taklif_fayl_bogla_v1: { rpc: 't2_tender_taklif_fayl_bogla_v1' },
  viborka_smetadan_toldir: { rpc: 't2_viborka_smetadan_toldir' },
  viborka_qabul_yoz: { rpc: 't2_viborka_qabul_yoz' },
  shartnoma_saqla: { rpc: 't2_shartnoma_saqla' },
  shartnoma_ochir: { rpc: 't2_shartnoma_ochir' },
  shartnoma_bog_saqla: { rpc: 't2_shartnoma_bog_saqla' },
  nakrutka_saqla: { rpc: 't2_nakrutka_saqla' },
  tolov_yoz: { rpc: 't2_tolov_yoz' },
  tolov_tahrir: { rpc: 't2_tolov_tahrir' },
  tolov_ochir: { rpc: 't2_tolov_ochir' },
  xarajat_yoz: { rpc: 't2_xarajat_yoz' },
  xarajat_tahrir: { rpc: 't2_xarajat_tahrir' },
  xarajat_ochir: { rpc: 't2_xarajat_ochir' },
  korzinkaga_tashlash: { rpc: 't2_korzinkaga_tashlash' },
  korzinkadan_tiklash: { rpc: 't2_korzinkadan_tiklash' },
  butunlay_ochirish: { rpc: 't2_butunlay_ochirish' },
  arxivla_v1: { rpc: 't2_arxivla_v1' },
  arxivdan_tiklash_v1: { rpc: 't2_arxivdan_tiklash_v1' },
  arxiv_butunlay_v1: { rpc: 't2_arxiv_butunlay_v1' },
  obyekt_yangila: { rpc: 't2_obyekt_yangila' },
  aosr_yoz: { rpc: 't2_aosr_yoz' },
  aosr_bekor: { rpc: 't2_aosr_bekor' },
  aosr_bog_saqla: { rpc: 't2_aosr_bog_saqla' },
  aosr_bog_ochir: { rpc: 't2_aosr_bog_ochir' },
  /* Ijro hujjatlari v2 (2026-10-01): АОСР to'liq blank maydonlari, laboratoriya
     protokollari (laboratoriya — kontragent), kompaniya logosi. */
  aosr_yoz_v2: { rpc: 't2_aosr_yoz_v2' },
  lab_protokol_yoz: { rpc: 't2_lab_protokol_yoz_v1' },
  lab_protokol_bekor: { rpc: 't2_lab_protokol_bekor_v1' },
  lab_protokol_bog_saqla: { rpc: 't2_lab_protokol_bog_saqla_v1' },
  kompaniya_logo_saqla: { rpc: 't2_kompaniya_logo_saqla_v1' },
  /* Nakrutka podval konstruktori (2026-10-01, egasi Q6). */
  nakrutka_podval_saqla: { rpc: 't2_nakrutka_podval_saqla_v1' },
  nakrutka_podval_ochir: { rpc: 't2_nakrutka_podval_ochir_v1' },
  /* Narx manbalari va narx dalili (2026-10-01, egasi Q4/Q5). */
  narx_manba_yoz: { rpc: 't2_narx_manba_yoz_v1' },
  narx_manba_bekor: { rpc: 't2_narx_manba_bekor_v1' },
  /* Egasi 2026-10-02: katalog platformada BIR MARTA (har kompaniya alohida yuklamaydi) — faqat superadmin (RPC tekshiradi). */
  platforma_narx_manba_yoz: { rpc: 't2_platforma_narx_manba_yoz_v1' },
  platforma_narx_manba_bekor: { rpc: 't2_platforma_narx_manba_bekor_v1' },
  /* Egasi 2026-10-03: obyekt hududi (chel.-soat narxi shu hududdan) — xaritadan taklif yoki qo'lda. */
  obyekt_hudud_belgila: { rpc: 't2_obyekt_hudud_belgila_v1' },
  /* Протокол согласования цен (2026-10-03): qoralama → imzolangan nusxa bilan tasdiqlash → bekor. */
  narx_protokol_yarat: { rpc: 't2_narx_protokol_yarat_v1' },
  narx_protokol_tasdiqla: { rpc: 't2_narx_protokol_tasdiqla_v1' },
  narx_protokol_bekor: { rpc: 't2_narx_protokol_bekor_v1' },
  narx_dalil_bogla: { rpc: 't2_narx_dalil_bogla_v1' },
  narx_dalil_ochir: { rpc: 't2_narx_dalil_ochir_v1' },
  audit_yoz: { rpc: 't2_audit_yoz' },
  hujjat_yoz: { rpc: 't2_obyekt_hujjat_yoz' },
  hujjat_ochir: { rpc: 't2_obyekt_hujjat_ochir' },
  sklad_mustaqil_yarat: { rpc: 't2_sklad_yarat' },
  kadr_mustaqil_yarat: { rpc: 't2_kadr_yarat' },
  texnika_mustaqil_yarat: { rpc: 't2_texnika_yarat' },
  resurs_yarat_v2: { rpc: 't2_resurs_yarat_v2' },
  resurs_yangila_v2: { rpc: 't2_resurs_yangila_v2' },
  resurs_bekor_v2: { rpc: 't2_resurs_bekor_v2' },
  resurs_bog_saqla: { rpc: 't2_resurs_bog_saqla' },
  resurs_bog_ochir: { rpc: 't2_resurs_bog_ochir' },
  loyiha_yarat: { rpc: 't2_loyiha_yarat' },
  loyiha_yangila: { rpc: 't2_loyiha_yangila' },
  loyiha_ochir: { rpc: 't2_loyiha_ochir' },
  obyekt_loyihaga_biriktir: { rpc: 't2_obyekt_loyihaga_biriktir' },
  obyekt_yarat: { rpc: 't2_obyekt_yarat_v1' },
  resurs_kategoriya_belgila: { rpc: 't2_resurs_kategoriya_belgila_v1' },
  nakrutka_koef_saqla: { rpc: 't2_nakrutka_koef_saqla_v1' },
  shartnoma_qamrov_saqla: { rpc: 't2_shartnoma_qamrov_saqla_v1' },
  loyiha_qatnashchi_biriktir: { rpc: 't2_loyiha_qatnashchi_biriktir' },
  loyiha_qatnashchi_ochir: { rpc: 't2_loyiha_qatnashchi_ochir' },
  kontragent_saqla: { rpc: 't2_kontragent_saqla' },
  kontragent_ochir: { rpc: 't2_kontragent_ochir' },
  bajarilmadi_belgila: { rpc: 't2_bajarilmadi_belgila_v1' },
  bajarilmadi_bekor: { rpc: 't2_bajarilmadi_bekor_v1' },
  /* PTO-CORE-001 (egasi 2026-10-26): smeta versiyasi → farq → da'vo — t2_qator ga TEGMAYDI; a'zolik + smeta.write RPC ichida. */
  smeta_versiya_yarat_v1: { rpc: 't2_smeta_versiya_yarat_v1' },
  smeta_versiya_pozitsiya_yoz_v1: { rpc: 't2_smeta_versiya_pozitsiya_yoz_v1' },
  smeta_versiya_moslik_yoz_v1: { rpc: 't2_smeta_versiya_moslik_yoz_v1' },
  smeta_versiya_qaror_v1: { rpc: 't2_smeta_versiya_qaror_v1' },
  smeta_versiya_bekor_v1: { rpc: 't2_smeta_versiya_bekor_v1' },
  /* Egasi 2026-10-24 (pul tahlili P1): haqiqiy xarajatni kategoriya/obyekt bilan qo'lda kiritish (idempotent) va bekor qilish. */
  xarajat_kirit_v1: { rpc: 't2_xarajat_kirit_v1' },
  xarajat_bekor_v1: { rpc: 't2_xarajat_bekor_v1' },
  /* TRANSPORT v1 (20261123000000): park/reys/tarif yozuvlari. Hammasi (kompaniya, actor, operation_id, data) — a'zolik + ruxsat RPC ichida. */
  transport_mashina_saqla_v1: { rpc: 't2_tr_mashina_saqla_v1' },
  transport_haydovchi_saqla_v1: { rpc: 't2_tr_haydovchi_saqla_v1' },
  transport_hujjat_saqla_v1: { rpc: 't2_tr_hujjat_saqla_v1' },
  transport_yoqilgi_narx_saqla_v1: { rpc: 't2_tr_yoqilgi_narx_saqla_v1' },
  transport_tarif_saqla_v1: { rpc: 't2_tr_tarif_saqla_v1' },
  transport_reys_saqla_v1: { rpc: 't2_tr_reys_saqla_v1' },
  transport_reys_yurish_v1: { rpc: 't2_tr_reys_yurish_v1' },
  transport_reys_yop_v1: { rpc: 't2_tr_reys_yop_v1' },
  transport_reys_bekor_v1: { rpc: 't2_tr_reys_bekor_v1' },
  transport_xarajat_otkaz_v1: { rpc: 't2_tr_xarajat_otkaz_v1' },
  /* Egasi 2026-10-27: moliyaviy tahlil — tizimda yo'q ko'rsatkichni qo'lda kiritish/almashtirish/bekor (append-only, idempotent). */
  /* YUK BIRJASI v1 (20261201000000): egasi tomoni. Yuk: _shared/yuk-birjasi-yuk.ts (oq ro'yxat). Tashuvchi/haydovchi amallari BU YERDA YO'Q (service_role, bot). */
  yb_yuk_saqla_v1: { rpc: 't2_yb_yuk_saqla_v1' },
  yb_yuk_elon_v1: { rpc: 't2_yb_yuk_elon_v1' },
  yb_yuk_javob_v1: { rpc: 't2_yb_yuk_javob_v1' },
  yb_yuk_bekor_v1: { rpc: 't2_yb_yuk_bekor_v1' },
  yb_yuk_tasdiq_v1: { rpc: 't2_yb_yuk_tasdiq_v1' },
  yb_yuk_baho_v1: { rpc: 't2_yb_yuk_baho_v1' },
  yb_yuk_nizo_v1: { rpc: 't2_yb_yuk_nizo_v1' },
  moliya_qolda_yoz_v1: { rpc: 't2_moliya_qolda_yoz_v1' },
  fakt_yoz_v2: { rpc: 't2_fakt_yoz_v2' },
  /* USTA «Bugun» (20261214300000): qoralama fakt / qaror / material zayavkasi. */
  usta_fakt_qoralama_v1: { rpc: 't2_usta_fakt_qoralama_v1' },
  usta_fakt_qaror_v1: { rpc: 't2_usta_fakt_qaror_v1' },
  usta_zayavka_v1: { rpc: 't2_usta_zayavka_v1' },
  fakt_belgila_v2: { rpc: 't2_fakt_belgila_v2' },
  fakt_belgila: { rpc: 't2_fakt_belgila' },
  /* ⚠️ P0 SECURITY (2026-09-03): bu uchtasi avval to'g'ridan-to'g'ri
   * un-versioned RPC'ga (t2_azolik_qosh/_rol_ozgartir/_ochir) borardi —
   * o'sha RPC'lar bazada HECH QANDAY actor/direktor tekshiruvisiz edi
   * va bu blokning o'zi ham faqat shakl (rol nomi to'g'rimi) tekshirardi,
   * kim so'rayotganini emas. Har qanday tizimga kirgan foydalanuvchi
   * o'zini istalgan kompaniyaga 'boss' qilib qo'sha olardi. Endi
   * to'g'ri, direktor-tekshiruvli _v1 RPC'larga o'tkazildi (p_actor_id
   * SESSIYADAN, hech qachon so'rov tanasidan). Eski un-versioned
   * RPC'lar bazada anon/authenticated/public'dan revoke qilindi. */
  azolik_qosh: { rpc: 't2_azolik_qosh_v1' },
  azolik_rol_ozgartir: { rpc: 't2_azolik_rol_ozgartir_v1' },
  azolik_ochir: { rpc: 't2_azolik_ochir_v1' },
  /* ⚠️ 2026-08-28: `kompaniya_yangila` bir marta (2026-08-27) qo'shilgan
   * edi, lekin keyingi merge'da (`f9a9d04`) YO'QOLIB QOLGAN — DB
   * funksiyasi (`t2_kompaniya_yangila`) va frontend chaqiruvi
   * (`sbKompaniyaYangila`, `supabase.ts`) omon qolgan, faqat shu
   * ko'prik yo'qolgan edi. Tiklandi. Bu — parallel ish paytida
   * merge silliq o'chirib yuborishi mumkinligiga JONLI misol; shuning
   * uchun har muhim o'zgarishdan keyin push'dan OLDIN diffni ko'rish
   * kerak. */
  kompaniya_yangila: { rpc: 't2_kompaniya_yangila' },
  /* MATERIAL ALIASLARI — AI semantik qidiruv (2026-08-28). */
  material_alias_yoz: { rpc: 't2_material_alias_yoz' },
  material_alias_ochir: { rpc: 't2_material_alias_ochir' },
  /* MINDMAP — chiziq tortib bog'lash/uzish (2026-08-28) */
  mindmap_bog: { rpc: 't2_mindmap_bog_v2' },
  mindmap_bog_ochir: { rpc: 't2_mindmap_bog_ochir_v2' },
  mindmap_joylashuv_saqla: { rpc: 't2_mindmap_joylashuv_saqla_v2' },
  mindmap_tugun_ochir: { rpc: 't2_mindmap_tugun_ochir_v2' },
  /* 2026-11-11: odamni obyekt/loyihaga mas'ul qilib biriktirish/olib tashlash (company.member.manage yoki control.company.write). */
  mindmap_masul: { rpc: 't2_mindmap_masul_v1' }
} as const;

type Amal = keyof typeof AMALLAR;

/** Tasdiqlashda qaysi tenantga tegishli ekanini klient yuborgan qiymatdan
 * emas, kanonik aktdan aniqlaymiz. Bu oldingi `akt_id`ni bilgan boshqa
 * kompaniya a’zosi hujjatni tasdiqlab yuborishi mumkin bo‘lgan bo‘shliqni
 * yopadi. `foydalanuvchi_id` faqat tekshirilgan sessiyadan keladi. */
async function aktTasdiqlashRuxsati(
  env: { SUPABASE_URL: string; SUPABASE_KEY: string }, aktId: number, actorId: number,
): Promise<{ ok: true; kompaniyaId: number; rol: string } | { ok: false; status: number }> {
  const headers = {
    apikey: env.SUPABASE_KEY,
    Authorization: 'Bearer ' + env.SUPABASE_KEY,
    'Content-Type': 'application/json',
  };
  try {
    const aktResponse = await fetch(
      supabaseBaseUrl(env.SUPABASE_URL) + `/rest/v1/t2_akt?id=eq.${aktId}&select=id,kompaniya_id&limit=1`,
      { headers },
    );
    if (!aktResponse.ok) return { ok: false, status: 403 };
    const aktlar = await aktResponse.json() as unknown;
    const akt = Array.isArray(aktlar) ? aktlar[0] as { id?: unknown; kompaniya_id?: unknown } | undefined : undefined;
    const kompaniyaId = Number(akt?.kompaniya_id);
    if (!akt || !Number.isSafeInteger(kompaniyaId) || kompaniyaId <= 0) return { ok: false, status: 403 };

    const memberResponse = await fetch(
      supabaseBaseUrl(env.SUPABASE_URL) + '/rest/v1/rpc/t2_actor_kompaniya_azo_tekshir',
      { method: 'POST', headers, body: JSON.stringify({ p_kompaniya_id: kompaniyaId, p_actor_id: actorId }) },
    );
    if (!memberResponse.ok) return { ok: false, status: 403 };
    const rolePayload = await memberResponse.json() as unknown;
    const rol = typeof rolePayload === 'string' ? rolePayload : '';
    if (!['superadmin','admin','boss','pto','prorab','bugalter'].includes(rol)) return { ok: false, status: 403 };
    return { ok: true, kompaniyaId, rol };
  } catch {
    return { ok: false, status: 503 };
  }
}

export const onRequestPost: PagesFunction<{
  SUPABASE_URL: string; SUPABASE_KEY: string; SESSIYA_KALIT: string; R2_CANONICAL?: R2Bucket;
}> = async (ctx) => {
  const t0 = Date.now();
  try {
    const secret = ctx.env.SESSIYA_KALIT;
    let sess = cachedAuthority(ctx) ?? await tekshir(ctx.request.headers.get('Cookie'), secret);
    if (!sess) {
      return Response.json({ ok: false, error: 'Кириш талаб қилинади' }, { status: 401 });
    }
    /* ⚠️ 2026-09-07 (Claude, P0 — T2-PRODUCT-RECOVERY): AVVAL bu yerda
     * `boss` ham bloklangan edi. `sess.rol` — LOGIN vaqtida hisoblangan
     * GLOBAL rol (foydalanuvchining ENG BIRINCHI faol a'zoligidan,
     * qaysi kompaniya tanlanganidan MUSTAQIL — `t2_parol_tekshir_v1`ga
     * qarang). Haqiqiy qonun: RUXSAT — FAOL KOMPANIYA A'ZOLIGI + SERVER
     * EFFECTIVE AUTHORIZATION (`t2_effective_authorization_v1`ning
     * o'z jadvaliga ko'ra `boss` TO'LIQ yozish huquqiga ega — faqat
     * `rahbar` haqiqatan o'quvchi-nazoratchi). Bu global tekshiruv
     * ENDI faqat `rahbar`ni to'sadi; kompaniyaga xos aniq tekshiruv
     * pastda (`azolik.rol`) davom etadi. */
    if (!ctx.env.SUPABASE_URL || !ctx.env.SUPABASE_KEY) {
      return Response.json({ ok: false, sozlanmagan: true,
        error: 'Supabase sozlanmagan (SUPABASE_URL / SUPABASE_KEY)' });
    }

    const tekshirilgan = sess;
    sess = cachedAuthority(ctx) ?? await roleAuthority(sess, ctx.env);
    if (!sess && sessiyaYaroqsizmi(tekshirilgan)) return yaroqsizSessiyaJavob();
    if (!sess) return Response.json({ ok: false, code: 'AUTHORITY_UNAVAILABLE', error: 'Joriy ruxsatlarni tekshirib bo‘lmadi. Qayta urinib ko‘ring.' }, { status: 503 });

    const so = await ctx.request.json<any>();
    /* Eski klientlar `amal` yubormaydi — ular qator tahriri qiladi. */
    const amal: Amal = (so.amal || 'qator_tahrir') as Amal;
    if (!Object.prototype.hasOwnProperty.call(AMALLAR, amal)) {
      return Response.json({ ok: false, error: 'Noma\'lum amal: ' + String(so.amal) });
    }

    /* Ilova darvozasi (ekotizim P1): o'chirilgan ilova amali serverda rad etiladi (menyu faqat ko'rinish edi). */
    const ilovaRad = await ilovaDarvozasi(ctx.env, sess, amalIlovasi(amal), so.kompaniya_id ?? so.tenant_id);
    if (ilovaRad) return ilovaRad;

    const MINDMAP_V2 = amal.startsWith('mindmap_');
    const RESURS_V2 = amal === 'resurs_yarat_v2' || amal === 'resurs_yangila_v2' || amal === 'resurs_bekor_v2';
    const operationId = String(so.operation_id || '');
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (MINDMAP_V2 || RESURS_V2) {
      if (!Number.isInteger(sess.foydalanuvchi_id) || (sess.foydalanuvchi_id as number) <= 0) {
        return Response.json({ ok: false, error: 'V2 buyruq uchun actor/session identifikatori talab qilinadi' }, { status: 401 });
      }
      const kid = Number(so.tenant_id ?? so.kompaniya_id);
      if (!Number.isInteger(kid) || kid <= 0 || !Array.isArray(sess.kompaniyalar) ||
          !sess.kompaniyalar.some((a) => a.kompaniya_id === kid)) {
        return Response.json({ ok: false, error: 'Bu kompaniyaga ruxsat yo\'q' }, { status: 403 });
      }
      if (!uuidRe.test(operationId)) {
        return Response.json({ ok: false, error: 'operation_id UUID bo\'lishi shart' });
      }
      if (amal !== 'mindmap_joylashuv_saqla' && amal !== 'mindmap_masul' && amal !== 'resurs_yarat_v2' &&
          (!Number.isInteger(Number(so.expected_version)) || Number(so.expected_version) < 0)) {
        return Response.json({ ok: false, error: 'expected_version noto\'g\'ri' });
      }
    }

    /* RES narxlash — yuk shakli shu yerda ham tekshiriladi (RPC ham qayta
       tekshiradi: tenant, faol a'zolik, rol va 1..10000 chegara). */
    if (amal === 'smeta_narxla_res' || amal === 'smeta_narxla_res_v3') {
      const kompaniyaId = Number(so.kompaniya_id);
      const obyektId = Number(so.obyekt_id);
      if (!Number.isInteger(sess.foydalanuvchi_id) || (sess.foydalanuvchi_id as number) <= 0) {
        return Response.json({ ok: false, error: 'Narxlash uchun tasdiqlangan actor talab qilinadi' }, { status: 401 });
      }
      if (!Number.isInteger(kompaniyaId) || kompaniyaId <= 0 || !Number.isInteger(obyektId) || obyektId <= 0) {
        return Response.json({ ok: false, error: 'kompaniya_id va obyekt_id noto\'g\'ri' });
      }
      if (!uuidRe.test(operationId)) {
        return Response.json({ ok: false, error: 'operation_id UUID bo\'lishi shart' });
      }
      if (!Array.isArray(so.narxlar) || so.narxlar.length === 0 || so.narxlar.length > 10000) {
        return Response.json({ ok: false, error: 'RES narxlari 1..10000 qator bo\'lishi shart' });
      }
    }

    /* ⚡ 2026-08-27 (Claude, foydalanuvchi tasdig'i — "haqiqiy multi-
     * tenant" poydevorining birinchi haqiqiy TEKSHIRUVI): avvalgacha
     * `kompaniya_id` mijoz yuborgan har qanday qiymat bo'lardi va
     * SERVER buni sessiya bilan solishtirmasdi — ya'ni har qanday
     * tizimga kirgan odam so'rov tanasida boshqa kompaniyaning
     * `kompaniya_id`sini yuborib, o'sha kompaniyaga yozishi (nazariy
     * jihatdan) mumkin edi. Endi: sessiya `kompaniyalar` ro'yxatini
     * bilsa (YANGI kirishlardan keyin — `t2_kirish_royxatga_ol` orqali)
     * va so'rov `kompaniya_id` yuborsa, u shu ro'yxatda BO'LISHI SHART.
     *
     * ⚠️ ATAYLAB QISMAN: `sess.kompaniyalar === undefined` (ESKI
     * sessiya, bu o'zgarishdan oldin chiqarilgan) bo'lsa — tekshiruv
     * O'TKAZIB YUBORILADI (eski foydalanuvchilar 12 soat ichida
     * bloklanib qolmasin). Bu vaqtinchalik ko'prik, sessiyalar tabiiy
     * yangilangach hamma yangi tekshiruv ostida bo'ladi. */
    if (Array.isArray(sess.kompaniyalar) && so.kompaniya_id != null) {
      const soraganKompaniya = Number(so.kompaniya_id);
      if (Number.isFinite(soraganKompaniya)) {
        /* ⚡ 2026-08-27: `kompaniyalar` endi {kompaniya_id, rol}
         * juftliklari — a'zolikning O'ZINI (borligini) VA o'sha
         * kompaniyadagi ROLINI birga topamiz. */
        const azolik = sess.kompaniyalar.find((a) => a.kompaniya_id === soraganKompaniya);
        if (!azolik) {
          return Response.json({ ok: false,
            error: 'Bu kompaniyaga a\'zo emassiz (kompaniya_id: ' + soraganKompaniya + ')' },
            { status: 403 });
        }
        /* "POLIMORFIK ROL" — yuqoridagi global `sess.rol` tekshiruvi
         * GAS'dan kelgan BITTA rolga asoslanadi (barcha kompaniya uchun
         * bir xil). Lekin bitta odam bir kompaniyada admin, boshqasida
         * faqat rahbar (ko'ruvchi) bo'lishi mumkin — bu haqiqiy
         * maqsad. ⚠️ 2026-09-07 (Claude, P0): AVVAL bu yerda `boss` ham
         * bloklangan edi — bu XATO edi (real ruxsat jadvaliga qarang:
         * `t2_effective_authorization_v1`da `boss` TO'LIQ yozish
         * huquqiga ega, faqat `rahbar` emas). Shu kompaniyaga xos rol
         * `rahbar` bo'lsa, global rol boshqacha bo'lsa ham bu YOZUV
         * rad etiladi. */
        if (!sess.permissionsByCompany && ['rahbar','buyurtmachi','pudratchi','kuzatuvchi'].includes(azolik.rol)) {
          return Response.json({ ok: false,
            error: 'Bu kompaniyada rahbar rolida yozish mumkin emas' },
            { status: 403 });
        }
      }
    }

    let yuk: Record<string, unknown>;

    /* ══════════ RES NARXLASH ══════════
       Allaqachon import qilingan, narxsiz smetani RES katalogi bilan
       narxlaydi. Matn uzunliklari bu yerda kesiladi; moslashtirish va
       "narxi bor qator ustidan yozilmasin" qoidasi RPC ichida. */
    if (amal === 'smeta_narxla_res' || amal === 'smeta_narxla_res_v3') {
      const narxlar = (so.narxlar as unknown[]).map((raw) => {
        const q = raw as Record<string, unknown>;
        return {
          kod: q.kod == null ? null : String(q.kod).slice(0, 160),
          nom: q.nom == null ? null : String(q.nom).slice(0, 1500),
          birlik: q.birlik == null ? null : String(q.birlik).slice(0, 80),
          narx: typeof q.narx === 'number' || (typeof q.narx === 'string' && q.narx.trim()) ? Number(q.narx) : Number.NaN,
        };
      });
      if (narxlar.some((q) =>
        !String(q.nom ?? '').trim() || !String(q.birlik ?? '').trim() || !Number.isFinite(q.narx) || q.narx < 0)) {
        return Response.json({ ok: false, error: 'Har RES qatorida nom, birlik va aniq nomanfiy narx bo\'lishi shart' });
      }
      yuk = {
        p_kompaniya_id: Number(so.kompaniya_id), p_actor_id: sess.foydalanuvchi_id,
        p_obyekt_id: Number(so.obyekt_id), p_operation_id: operationId, p_narxlar: narxlar,
        ...(amal === 'smeta_narxla_res_v3' ? { p_nol_ham: so.nol_ham === true } : {}),
      };

    /* ══════════ QATOR TAHRIRI ══════════ */
    } else if (amal === 'qator_tahrir') {
      const qatorId = Number(so.qator_id);
      if (!Number.isFinite(qatorId) || qatorId <= 0) {
        return Response.json({ ok: false, error: 'qator_id noto\'g\'ri' });
      }
      /* Maydon oq ro'yxati bu yerda HAM tekshiriladi (baza ham tekshiradi).
         Ikki qatlamli himoya: biri o'zgarsa ikkinchisi ushlab qoladi. */
      const RUXSAT = ['nom', 'hajm', 'narx', 'birlik', 'kat'];
      if (!so.maydon || !RUXSAT.includes(so.maydon)) {
        return Response.json({ ok: false, error: 'Bu maydonni tahrirlash mumkin emas: ' + so.maydon });
      }
      if (so.kutilgan_versiya == null || !Number.isFinite(Number(so.kutilgan_versiya))) {
        /* Versiyasiz yozishga YO'L QO'YMAYMIZ — bu ziddiyat nazoratini
           chetlab o'tish degani. */
        return Response.json({ ok: false,
          error: 'kutilgan_versiya majburiy — usiz ziddiyatni aniqlab bo\'lmaydi' });
      }
      yuk = {
        p_qator_id: qatorId,
        p_maydon: so.maydon,
        p_qiymat: so.qiymat == null ? '' : String(so.qiymat),
        p_kutilgan_versiya: Number(so.kutilgan_versiya),
        p_manba: 'frontend',
        p_kim: sess.email || '',
      };

    /* ══════════ HUJJAT YARATISH (fakt / F2) ══════════ */
    } else if (amal === 'akt_yarat') {
      const obyektId = Number(so.obyekt_id);
      if (!Number.isFinite(obyektId) || obyektId <= 0) {
        return Response.json({ ok: false, error: 'obyekt_id noto\'g\'ri' });
      }
      if (so.tur !== 'fakt' && so.tur !== 'f2') {
        return Response.json({ ok: false, error: 'tur faqat «fakt» yoki «f2»' });
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(so.oy || ''))) {
        return Response.json({ ok: false, error: 'oy YYYY-MM-DD ko\'rinishida bo\'lishi kerak' });
      }
      if (!Array.isArray(so.qatorlar) || so.qatorlar.length === 0) {
        return Response.json({ ok: false, error: 'Hujjatda bironta qator yo\'q' });
      }
      /* ⚠️ IDEMPOTENTLIK MAJBURIY.
         Usiz tarmoq uzilib qayta yuborilsa IKKITA bir xil hujjat
         yaraladi va nakopitelniy ikkalasini qo'shadi — jami ikki
         baravar chiqadi, ogohlantirishsiz. */
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
            .test(String(so.operation_id || ''))) {
        return Response.json({ ok: false,
          error: 'operation_id (UUID) majburiy — usiz takroriy so\'rov ikkinchi hujjat yaratadi' });
      }
      /* Faqat kerakli maydonlar o'tkaziladi — klient qo'shimcha
         kalit yuborsa ham u bazaga bormaydi.
         ⚠️ T2-BRIDGE-CALLER-AUDIT-003 (2026-09-03): `narx_yoq` avval bu
         yerda STRIP qilinardi — hatto chaqiruvchi uni yuborsa ham,
         `t2_akt_yarat`ning "narx yo'q → smeta narxiga qaytma" himoyasi
         HECH QACHON ishlamas edi (faqat GAS `_t2Rpc` to'g'ridan-to'g'ri
         chaqirganda ishlardi, bu gateway orqali EMAS). Endi o'tkaziladi —
         hozircha buni yuboradigan frontend caller yo'q, shu sabab bu
         mavjud xatti-harakatni O'ZGARTIRMAYDI, faqat kelajakdagi xavfsiz
         foydalanishni ochadi. */
      const qatorlar = so.qatorlar.map((q: any) => {
        const chiqish: Record<string, unknown> = {
          qator_id: Number(q.qator_id),
          hajm: q.hajm,
        };
        if (q.narx != null && q.narx !== '') chiqish.narx = q.narx;
        if (q.narx_yoq === true) chiqish.narx_yoq = true;
        if (q.izoh) chiqish.izoh = String(q.izoh).slice(0, 500);
        return chiqish;
      });
      if (qatorlar.some((q: any) => !Number.isFinite(q.qator_id) || q.qator_id <= 0)) {
        return Response.json({ ok: false, error: 'Ba\'zi qatorlarda qator_id noto\'g\'ri' });
      }

      /* ⚠️ `majburiy` — invariantni ATAYLAB chetlab o'tish.
         Faqat admin. Oddiy foydalanuvchi smetadan oshiq fakt yozib
         qo'ymasin; agar haqiqatan kerak bo'lsa mas'ul odam qiladi. */
      const majburiy = so.majburiy === true;
      if (majburiy && !(sess.rol === 'admin' || sess.rol === 'superadmin')) {
        return Response.json({ ok: false, status: 403,
          error: 'Invariantni chetlab o\'tish faqat admin huquqi bilan' }, { status: 403 });
      }

      yuk = {
        p_obyekt_id: obyektId,
        p_tur: so.tur,
        p_oy: so.oy,
        p_qatorlar: qatorlar,
        p_raqam: so.raqam ? String(so.raqam).slice(0, 100) : null,
        p_operation_id: so.operation_id,
        p_manba: 'frontend',
        p_kim: sess.email || '',
        p_majburiy: majburiy,
      };

    /* ══════════ F2 YARATISH — EXACT SOURCE (v2) ══════════
     * T2-REAL-PARK-LRV-VERTICAL-SLICE-004. Har qator certified_quantity
     * MAJBURIY; certified_unit_price/certified_amount ham MAJBURIY,
     * FAQAT price_intentionally_absent=true bo'lsa bo'sh qoldirish
     * mumkin. Bu yerda smeta narxiga HECH QANDAY fallback yo'q -- narx
     * bo'lmasa DB darajasida MISSING_CERTIFIED_PRICE bilan butun partiya
     * rad etiladi. */
    } else if (amal === 'qoshimcha_ish_yarat_v1' || amal === 'zamena_ish_yarat_v1' || amal === 'resurs_bola_qosh_v1') {
      if (!sess.foydalanuvchi_id || !so.operation_id || !Number.isSafeInteger(Number(so.kutilgan_versiya))) {
        return Response.json({ ok: false, error: 'Operatsiya va versiya talab qilinadi.' }, { status: 400 });
      }
      yuk = {
        p_kompaniya_id: so.kompaniya_id, p_actor_id: sess.foydalanuvchi_id,
        p_obyekt_id: so.obyekt_id, p_ota_qator_id: so.ota_qator_id,
        p_nom: so.nom, p_birlik: so.birlik, p_hajm: so.hajm ?? null,
        p_kod: so.kod ?? null, p_keyin_qator_id: so.keyin_qator_id ?? null,
        p_sabab: so.sabab, p_dalil_hujjat_id: so.dalil_hujjat_id ?? null,
        p_operation_id: so.operation_id, p_kutilgan_versiya: so.kutilgan_versiya,
      };
      if (amal === 'zamena_ish_yarat_v1') yuk.p_almashtirilayotgan_qator_id = so.almashtirilayotgan_qator_id;
      if (amal === 'resurs_bola_qosh_v1') yuk.p_tur = so.tur;
    } else if (amal === 'zamena_almashtirish_belgila_v1') {
      const miq = so.hajm === null || so.hajm === undefined ? null : Number(so.hajm);
      if (!sess.foydalanuvchi_id || !Number.isSafeInteger(Number(so.qator_id)) || (miq !== null && (!Number.isFinite(miq) || miq < 0))) {
        return Response.json({ ok: false, error: 'Zamena qatori va manfiy bo‘lmagan hajm talab qilinadi.' }, { status: 400 });
      }
      yuk = { p_actor_id: sess.foydalanuvchi_id, p_kompaniya_id: so.kompaniya_id, p_qator_id: so.qator_id, p_hajm: miq };
    } else if (amal === 'fakt_smetadan_tashqari_v1') {
      const buyruq = String(so.command || '');
      const hajm = Number(so.hajm);
      if (!sess.foydalanuvchi_id || !uuidRe.test(String(so.operation_id || '')) || !Number.isSafeInteger(Number(so.kutilgan_versiya))
          || (buyruq !== 'additional' && buyruq !== 'replacement') || !(hajm > 0) || (so.resurslar != null && !Array.isArray(so.resurslar))
          || !/^\d{4}-\d{2}-\d{2}$/.test(String(so.sana || '')) || !String(so.sabab || '').trim()) {
        return Response.json({ ok: false, error: 'Tur, hajm (>0), sana, sabab, operatsiya va versiya talab qilinadi.' }, { status: 400 });
      }
      yuk = {
        p_actor_id: sess.foydalanuvchi_id, p_kompaniya_id: so.kompaniya_id, p_obyekt_id: so.obyekt_id,
        p_command: buyruq, p_ota_qator_id: so.ota_qator_id, p_almashtirilayotgan_qator_id: so.almashtirilayotgan_qator_id ?? null,
        p_nom: so.nom ?? null, p_birlik: so.birlik ?? null, p_kod: so.kod ?? null, p_hajm: hajm,
        p_sana: so.sana, p_sabab: String(so.sabab).slice(0, 500), p_ish_turi_id: so.ish_turi_id ?? null,
        p_resurslar: Array.isArray(so.resurslar) ? so.resurslar.slice(0, 50) : null,
        p_katalogga_saqla: so.katalogga_saqla === true, p_operation_id: so.operation_id, p_kutilgan_versiya: Number(so.kutilgan_versiya),
      };
    } else if (amal === 'ish_abc_saqla_v1') {
      const buyruq = String(so.command || '');
      if (!sess.foydalanuvchi_id || !uuidRe.test(String(so.operation_id || ''))
          || !['additional', 'replacement', 'resurs_zamena'].includes(buyruq) || !String(so.sabab || '').trim()
          || (so.resurslar != null && (!Array.isArray(so.resurslar) || so.resurslar.length > 60))
          || (so.sana != null && !/^\d{4}-\d{2}-\d{2}$/.test(String(so.sana)))) {
        return Response.json({ ok: false, error: 'Buyruq, sabab, operatsiya va ≤60 resurs talab qilinadi.' }, { status: 400 });
      }
      yuk = {
        p_actor_id: sess.foydalanuvchi_id, p_kompaniya_id: so.kompaniya_id, p_obyekt_id: so.obyekt_id, p_command: buyruq,
        p_ota_qator_id: so.ota_qator_id ?? null, p_almashtirilayotgan_qator_id: so.almashtirilayotgan_qator_id ?? null,
        p_ish: so.ish ?? null, p_resurslar: so.resurslar ?? null,
        p_fakt_hajm: so.fakt_hajm == null || so.fakt_hajm === '' ? null : Number(so.fakt_hajm),
        p_sana: so.sana ?? null, p_sabab: String(so.sabab).slice(0, 500),
        p_operation_id: so.operation_id, p_kutilgan_versiya: so.kutilgan_versiya == null ? null : Number(so.kutilgan_versiya),
      };
    } else if (amal === 'qator_resurs_ish_zamena_v1') {
      if (so.eski_qator_id != null && (!Number.isSafeInteger(so.kutilgan_versiya) || Number(so.kutilgan_versiya)<0)) return Response.json({ok:false,code:'VERSION_REQUIRED',error:'Joriy qator versiyasi talab qilinadi.'},{status:400});
      if (!sess.foydalanuvchi_id || !uuidRe.test(String(so.operation_id || '')) || !Number.isSafeInteger(Number(so.resurs_qator_id))
          || !Array.isArray(so.ishlar) || so.ishlar.length < 1 || so.ishlar.length > 10 || !String(so.sabab || '').trim()
          || (so.eski_qator_id != null && !Number.isSafeInteger(Number(so.eski_qator_id)))) {
        return Response.json({ ok: false, error: 'Resurs, 1–10 ta ish, sabab va operatsiya talab qilinadi.' }, { status: 400 });
      }
      yuk = {
        p_actor_id: sess.foydalanuvchi_id, p_kompaniya_id: so.kompaniya_id, p_obyekt_id: so.obyekt_id,
        p_resurs_qator_id: Number(so.resurs_qator_id), p_ishlar: so.ishlar, p_sabab: String(so.sabab).slice(0, 500),
        p_operation_id: so.operation_id, p_eski_qator_id: so.eski_qator_id == null ? null : Number(so.eski_qator_id),
        p_kutilgan_versiya: so.kutilgan_versiya == null ? null : Number(so.kutilgan_versiya),
      };
    } else if ((amal === 'ish_abc_ochir_v1' || amal === 'qator_ish_abc_ochir_v1' || amal === 'qator_ish_abc_ochir_v2')) {
      if (!sess.foydalanuvchi_id || !uuidRe.test(String(so.operation_id || '')) || !Number.isSafeInteger(Number(so.qator_id))) {
        return Response.json({ ok: false, error: 'Qator va operatsiya talab qilinadi.' }, { status: 400 });
      }
      if (amal.endsWith('_v2') && (!Number.isSafeInteger(so.kutilgan_versiya) || Number(so.kutilgan_versiya) < 0)) return Response.json({ ok:false, code:'VERSION_REQUIRED', error:'Joriy qator versiyasi talab qilinadi.' }, {status:400});
      yuk = {
        p_actor_id: sess.foydalanuvchi_id, p_kompaniya_id: so.kompaniya_id, p_obyekt_id: so.obyekt_id,
        p_qator_id: Number(so.qator_id), p_sabab: so.sabab ? String(so.sabab).slice(0, 500) : null, p_operation_id: so.operation_id,
        ...(amal.endsWith('_v2') ? { p_kutilgan_versiya: Number(so.kutilgan_versiya) } : {}),
      };
    } else if ((amal === 'ish_abc_tahrir_v1' || amal === 'qator_ish_abc_tahrir_v1' || amal === 'qator_ish_abc_tahrir_v2')) {
      if (!sess.foydalanuvchi_id || !uuidRe.test(String(so.operation_id || '')) || !Number.isSafeInteger(Number(so.qator_id))
          || !String(so.sabab || '').trim() || (so.resurslar != null && (!Array.isArray(so.resurslar) || so.resurslar.length > 60))
          || (so.sana != null && !/^\d{4}-\d{2}-\d{2}$/.test(String(so.sana)))) {
        return Response.json({ ok: false, error: 'Qator, sabab, operatsiya va ≤60 resurs talab qilinadi.' }, { status: 400 });
      }
      if (amal.endsWith('_v2') && (!Number.isSafeInteger(so.kutilgan_versiya) || Number(so.kutilgan_versiya) < 0)) return Response.json({ ok:false, code:'VERSION_REQUIRED', error:'Joriy qator versiyasi talab qilinadi.' }, {status:400});
      yuk = {
        p_actor_id: sess.foydalanuvchi_id, p_kompaniya_id: so.kompaniya_id, p_obyekt_id: so.obyekt_id, p_qator_id: Number(so.qator_id),
        p_ish: so.ish ?? null, p_resurslar: so.resurslar ?? null,
        p_fakt_hajm: so.fakt_hajm == null || so.fakt_hajm === '' ? null : Number(so.fakt_hajm),
        p_sana: so.sana ?? null, p_sabab: String(so.sabab).slice(0, 500), p_operation_id: so.operation_id,
        ...(amal.endsWith('_v2') ? { p_kutilgan_versiya: Number(so.kutilgan_versiya) } : {}),
      };
    } else if (amal === 'token_sarfla_v1') {
      const n = so.birlik_soni == null ? 1 : Number(so.birlik_soni);
      if (!sess.foydalanuvchi_id || !uuidRe.test(String(so.operation_id || '')) || !/^[a-z_0-9]{2,40}$/.test(String(so.tur_amal || '')) || !Number.isFinite(n) || n < 0 || n > 10_000_000) {
        return Response.json({ ok: false, error: 'Amal, miqdor va operatsiya talab qilinadi.' }, { status: 400 });
      }
      yuk = { p_actor_id: sess.foydalanuvchi_id, p_kompaniya_id: so.kompaniya_id, p_amal: String(so.tur_amal), p_birlik_soni: n, p_operation_id: so.operation_id,
        p_meta: so.meta && typeof so.meta === 'object' && !Array.isArray(so.meta) ? Object.fromEntries(Object.entries(so.meta).slice(0, 10).map(([k, v]) => [String(k).slice(0, 40), k === 'fayl_yacheykalar' && Array.isArray(v) && v.length >= 1 && v.length <= 2000 && v.every((x) => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 10_000_000) ? v : typeof v === 'number' ? v : String(v).slice(0, 200)])) : {} };
    } else if (amal === 'tolov_sorov_yarat_v1') {
      if (!sess.foydalanuvchi_id || !uuidRe.test(String(so.operation_id || '')) || !/^[a-z0-9_]{2,30}$/.test(String(so.paket_kod || '')) || !['otkazma', 'payme', 'click'].includes(String(so.usul))) {
        return Response.json({ ok: false, error: 'Paket, usul va operatsiya talab qilinadi.' }, { status: 400 });
      }
      yuk = { p_actor_id: sess.foydalanuvchi_id, p_kompaniya_id: so.kompaniya_id, p_paket_kod: String(so.paket_kod), p_usul: String(so.usul), p_tolov_malumot: String(so.tolov_malumot || '').slice(0, 300), p_operation_id: so.operation_id };
    } else if (amal === 'smeta_bolim_yarat_v1') {
      const ixt = (v: unknown) => (v == null || v === '' ? null : Number(v));
      const nom = typeof so.nom === 'string' ? so.nom.replace(/\s+/g, ' ').trim() : '';
      const ota = ixt(so.ota_qator_id), keyin = ixt(so.keyin_qator_id);
      if (!sess.foydalanuvchi_id || !uuidRe.test(String(so.operation_id || '')) || !Number.isSafeInteger(Number(so.obyekt_id))
          || !nom || nom.length > 300 || (ota != null && !Number.isSafeInteger(ota)) || (keyin != null && !Number.isSafeInteger(keyin))) {
        return Response.json({ ok: false, code: 'NOM_REQUIRED', error: 'Bo‘lim: obyekt, nom (1–300 belgi) va operatsiya talab qilinadi.' }, { status: 400 });
      }
      yuk = { p_actor_id: sess.foydalanuvchi_id, p_kompaniya_id: so.kompaniya_id, p_obyekt_id: Number(so.obyekt_id), p_nom: nom,
        p_ota_qator_id: ota, p_keyin_qator_id: keyin, p_sabab: so.sabab ? String(so.sabab).slice(0, 500) : null, p_operation_id: so.operation_id };
    } else if (amal === 'm29_bajar_v1') {
      const q = so.qatorlar;
      if (!sess.foydalanuvchi_id || !uuidRe.test(String(so.operation_id || '')) || !Number.isSafeInteger(Number(so.obyekt_id))
          || !/^\d{4}-\d{2}$/.test(String(so.davr || '')) || !Array.isArray(q) || !q.length || q.length > 3000
          || q.some((x: any) => !x || typeof x.nomi !== 'string' || !x.nomi.trim() || !(Number(x.miqdor) > 0))) {
        return Response.json({ ok: false, error: 'M-29: obyekt, davr (YYYY-MM), material qatorlari (nomi, miqdor > 0) va operatsiya talab qilinadi.' }, { status: 400 });
      }
      yuk = { p_actor_id: sess.foydalanuvchi_id, p_kompaniya_id: so.kompaniya_id, p_obyekt_id: Number(so.obyekt_id), p_davr: String(so.davr),
        p_qatorlar: q.map((x: any) => ({ nomi: String(x.nomi).slice(0, 500), birligi: x.birligi == null ? null : String(x.birligi).slice(0, 50), miqdor: Number(x.miqdor) })),
        p_operation_id: so.operation_id, p_manfiyga_ruxsat: so.manfiyga_ruxsat === true, p_trigger_bekor: so.trigger_bekor === true };
    } else if (amal === 'm29_bekor_v1') {
      if (!sess.foydalanuvchi_id || !Number.isSafeInteger(Number(so.hujjat_id)) || typeof so.sabab !== 'string' || !so.sabab.trim()) {
        return Response.json({ ok: false, error: 'M-29 bekor: hujjat va sabab talab qilinadi.' }, { status: 400 });
      }
      yuk = { p_actor_id: sess.foydalanuvchi_id, p_kompaniya_id: so.kompaniya_id, p_hujjat_id: Number(so.hujjat_id), p_sabab: String(so.sabab).slice(0, 1000) };
    } else if (amal === 'sklad_kirim_import_v1') {
      const q = so.qatorlar;
      const butun = (v: unknown) => Number.isSafeInteger(Number(v)) && Number(v) > 0;
      const matn = (v: unknown, n: number) => (v == null || String(v).trim() === '' ? null : String(v).trim().slice(0, n));
      if (!sess.foydalanuvchi_id || !uuidRe.test(String(so.operation_id || '')) || !butun(so.sklad_id) || !butun(so.document_id)
          || so.varaq !== 'Приход' || !Array.isArray(q) || q.length < 1 || q.length > 1000
          || q.some((x: any) => !x || !butun(x.source_row) || !/^\d{4}-\d{2}-\d{2}$/.test(String(x.sana || ''))
            || typeof x.nomi !== 'string' || !x.nomi.trim() || typeof x.birligi !== 'string' || !x.birligi.trim()
            || !/^[0-9]+(\.[0-9]+)?$/.test(String(x.obyomi || '')) || !(Number(x.obyomi) > 0))) {
        return Response.json({ ok: false, code: 'BATCH_INVALID', error: 'Kirim: ombor, hujjat, «Приход» varag‘i, 1–1000 qator (sana, nom, birlik, miqdor > 0) va operatsiya talab qilinadi.' }, { status: 400 });
      }
      yuk = { p_actor_id: sess.foydalanuvchi_id, p_kompaniya_id: so.kompaniya_id, p_sklad_id: Number(so.sklad_id),
        p_document_id: Number(so.document_id), p_source_sheet: 'Приход',
        /* Faqat ruxsat etilgan maydonlar; narx/summa umuman o'tkazilmaydi. */
        p_qatorlar: q.map((x: any) => ({ source_row: Number(x.source_row), sana: String(x.sana), nomi: String(x.nomi).trim().slice(0, 500),
          birligi: String(x.birligi).trim().slice(0, 100), obyomi: String(x.obyomi), postavshik: matn(x.postavshik, 500),
          manba_turi: matn(x.manba_turi, 200), sf_tasdiq: matn(x.sf_tasdiq, 200) })),
        p_operation_id: so.operation_id };
    } else if (amal === 'sklad_berdim_v1') {
      const butun = (v: unknown) => Number.isSafeInteger(Number(v)) && Number(v) > 0;
      const matn = (v: unknown, n: number) => (v == null || String(v).trim() === '' ? null : String(v).trim().slice(0, n));
      if (!sess.foydalanuvchi_id || !uuidRe.test(String(so.operation_id || '')) || !butun(so.sklad_id) || !butun(so.obyekt_id)
          || typeof so.nomi !== 'string' || !so.nomi.trim() || typeof so.birligi !== 'string' || !so.birligi.trim()
          || !/^[0-9]+(\.[0-9]{1,6})?$/.test(String(so.miqdor ?? '')) || !(Number(so.miqdor) > 0)
          || (so.sana != null && so.sana !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(String(so.sana)))) {
        return Response.json({ ok: false, code: 'BERDIM_INVALID', error: 'Berdim: ombor, obyekt, material, birlik, miqdor > 0 va operatsiya talab qilinadi.' }, { status: 400 });
      }
      yuk = { p_actor_id: sess.foydalanuvchi_id, p_kompaniya_id: so.kompaniya_id, p_sklad_id: Number(so.sklad_id), p_obyekt_id: Number(so.obyekt_id),
        p_nomi: String(so.nomi).trim().slice(0, 500), p_birligi: String(so.birligi).trim().slice(0, 100), p_miqdor: String(so.miqdor),
        p_sana: so.sana ? String(so.sana) : null, p_qabul_qiluvchi: matn(so.qabul_qiluvchi, 300), p_izoh: matn(so.izoh, 1000),
        p_operation_id: so.operation_id };
    } else if (amal === 'sklad_kirim_storno_v1') {
      if (!sess.foydalanuvchi_id || !uuidRe.test(String(so.operation_id || '')) || !Number.isSafeInteger(Number(so.harakat_id)) || Number(so.harakat_id) <= 0
          || typeof so.sabab !== 'string' || !so.sabab.trim()) {
        return Response.json({ ok: false, code: 'REQUIRED_FIELD', error: 'Storno: kirim qatori, sabab va operatsiya talab qilinadi.' }, { status: 400 });
      }
      yuk = { p_actor_id: sess.foydalanuvchi_id, p_kompaniya_id: so.kompaniya_id, p_harakat_id: Number(so.harakat_id),
        p_sabab: String(so.sabab).trim().slice(0, 1000), p_operation_id: so.operation_id };
    } else if (amal === 'fayl_amal_v1') {
      const AMALLAR = ['nomla', 'kochir', 'savat', 'tikla', 'papka_yarat', 'papka_nomla', 'papka_kochir', 'papka_ochir'];
      const ixt = (v: unknown) => (v == null || v === '' ? null : Number(v));
      const [doc, papka, ota] = [ixt(so.document_id), ixt(so.papka_id), ixt(so.ota_papka_id)];
      if (!sess.foydalanuvchi_id || !AMALLAR.includes(String(so.fayl_amal))
          || [doc, papka, ota].some((x) => x != null && (!Number.isSafeInteger(x) || x <= 0))
          || (so.nom != null && typeof so.nom !== 'string')) {
        return Response.json({ ok: false, error: 'Fayl amali, ID lar yoki nom noto‘g‘ri.' }, { status: 400 });
      }
      yuk = { p_actor_id: sess.foydalanuvchi_id, p_kompaniya_id: so.kompaniya_id, p_amal: String(so.fayl_amal),
        p_document_id: doc, p_papka_id: papka, p_nom: so.nom == null ? null : String(so.nom).slice(0, 200), p_ota_papka_id: ota };
    } else if (amal === 'token_qaytar_v1') {
      if (!sess.foydalanuvchi_id || !uuidRe.test(String(so.operation_id || '')) || !uuidRe.test(String(so.sarf_operation_id || ''))) {
        return Response.json({ ok: false, error: 'Sarf va operatsiya talab qilinadi.' }, { status: 400 });
      }
      yuk = { p_actor_id: sess.foydalanuvchi_id, p_kompaniya_id: so.kompaniya_id, p_sarf_operation_id: so.sarf_operation_id, p_operation_id: so.operation_id, p_sabab: so.sabab ? String(so.sabab).slice(0, 300) : null };
    } else if (amal === 'token_yakunla_v1') {
      // Billing saga: amal muvaffaqiyatli tugadi — sarf «yakunlandi» (operator navbatiga tushmaydi, qaytarilmaydi).
      if (!sess.foydalanuvchi_id || !uuidRe.test(String(so.sarf_operation_id || ''))) {
        return Response.json({ ok: false, error: 'Sarf operatsiyasi talab qilinadi.' }, { status: 400 });
      }
      yuk = { p_actor_id: sess.foydalanuvchi_id, p_kompaniya_id: so.kompaniya_id, p_sarf_operation_id: so.sarf_operation_id };
    } else if (amal === 'token_toldir_v1') {
      const m = Number(so.miqdor);
      if (!sess.foydalanuvchi_id || !uuidRe.test(String(so.operation_id || '')) || !Number.isFinite(m) || Math.abs(m) > 10_000_000 || !['toldirish', 'bonus', 'tuzatish'].includes(String(so.tur_harakat))) {
        return Response.json({ ok: false, error: 'Miqdor, tur va operatsiya talab qilinadi.' }, { status: 400 });
      }
      yuk = { p_actor_id: sess.foydalanuvchi_id, p_kompaniya_id: Number(so.maqsad_kompaniya_id), p_miqdor: m, p_tur: String(so.tur_harakat), p_izoh: String(so.izoh || '').slice(0, 500), p_operation_id: so.operation_id };
    } else if (amal === 'obuna_belgila_v1') {
      if (!sess.foydalanuvchi_id || !uuidRe.test(String(so.operation_id || '')) || !/^[a-z_]{2,30}$/.test(String(so.tarif || ''))) {
        return Response.json({ ok: false, error: 'Tarif va operatsiya talab qilinadi.' }, { status: 400 });
      }
      yuk = { p_actor_id: sess.foydalanuvchi_id, p_kompaniya_id: Number(so.maqsad_kompaniya_id), p_tarif_kod: String(so.tarif), p_oylar: Number(so.oylar ?? 1), p_operation_id: so.operation_id };
    } else if (amal === 'demo_manba_belgila_v1') {
      if (!sess.foydalanuvchi_id || (so.obyekt_id != null && !Number.isSafeInteger(Number(so.obyekt_id)))) {
        return Response.json({ ok: false, error: 'Obyekt noto\'g\'ri.' }, { status: 400 });
      }
      yuk = { p_actor_id: sess.foydalanuvchi_id, p_obyekt_id: so.obyekt_id == null ? null : Number(so.obyekt_id) };
    } else if (amal === 'sverka_yozuv_v1') {
      const m = so.malumot;
      const yid = so.yozuv_id == null || so.yozuv_id === '' ? null : Number(so.yozuv_id);
      // 'f3_sotuv' — RPC (20261106820000) aynan shu nomni kutadi; avval BFF uni rad etardi (F3 sotuvdan qo'lda kiritish ishlamasdi).
      if (!sess.foydalanuvchi_id || !uuidRe.test(String(so.operation_id || '')) || !['ds', 'f3_sotuv', 'f2_reestr', 'sotuv'].includes(String(so.tur))
          || !Number.isSafeInteger(Number(so.shartnoma_id)) || Number(so.shartnoma_id) <= 0
          || (yid != null && (!Number.isSafeInteger(yid) || yid <= 0))
          || !m || typeof m !== 'object' || Array.isArray(m)) {
        return Response.json({ ok: false, error: 'Sverka yozuvi: shartnoma, tur (ds | f2_reestr | sotuv), ma\'lumot va operatsiya talab qilinadi.' }, { status: 400 });
      }
      const mk = ['raqam', 'sana', 'jami_nds_bilan', 'izoh', 'holat', 'reestr_raqam', 'oy', 'obyekt_id', 'summa_nds_siz', 'summa_nds_bilan',
        'akt_id', 'nom', 'fayl', 'summa', 'nds_foiz', 'davr_boshi', 'davr_oxiri', 'f3_holat', 'manba', 'sotuv_sana', 'sotuv_summa'];
      const malumot: Record<string, unknown> = {};
      for (const k of mk) {
        const x = m[k];
        if (x === undefined) continue;
        if (x !== null && typeof x !== 'string' && typeof x !== 'number') {
          return Response.json({ ok: false, error: 'Sverka yozuvi: maydon qiymati matn yoki son bo‘lishi kerak.' }, { status: 400 });
        }
        malumot[k] = typeof x === 'string' ? x.slice(0, 1000) : x;
      }
      yuk = {
        p_actor_id: sess.foydalanuvchi_id, p_kompaniya_id: so.kompaniya_id, p_shartnoma_id: Number(so.shartnoma_id), p_tur: String(so.tur),
        p_yozuv_id: yid, p_kutilgan_versiya: so.kutilgan_versiya == null ? null : Number(so.kutilgan_versiya),
        p_malumot: malumot, p_operation_id: so.operation_id,
      };
    } else if (amal === 'sverka_import_v1') {
      /* 1C akt-sverka partiyasi: har qator faqat ruxsat etilgan maydonlar bilan (RPC qolganini tekshiradi). */
      const qs = so.qatorlar;
      if (!sess.foydalanuvchi_id || !uuidRe.test(String(so.operation_id || '')) || !Array.isArray(qs) || qs.length === 0 || qs.length > 200) {
        return Response.json({ ok: false, error: 'Sverka importi: 1–200 qator va operatsiya talab qilinadi.' }, { status: 400 });
      }
      const kalitlar = ['tur', 'shartnoma_id', 'sana', 'summa', 'raqam', 'izoh', 'operation_id', 'obyekt_id', 'f3_holat', 'nds_foiz', 'davr_boshi'];
      const qatorlar: Record<string, unknown>[] = [];
      for (const q of qs) {
        if (!q || typeof q !== 'object' || Array.isArray(q)) return Response.json({ ok: false, error: 'Sverka importi: qator obyekt bo‘lishi kerak.' }, { status: 400 });
        const r: Record<string, unknown> = {};
        for (const k of kalitlar) {
          const x = (q as Record<string, unknown>)[k];
          if (x === undefined) continue;
          if (x !== null && typeof x !== 'string' && typeof x !== 'number') return Response.json({ ok: false, error: 'Sverka importi: maydon matn yoki son bo‘lishi kerak.' }, { status: 400 });
          r[k] = typeof x === 'string' ? x.slice(0, 500) : x;
        }
        const tq = (q as Record<string, unknown>).taqsimot;
        if (tq != null) {
          if (!Array.isArray(tq) || tq.length > 100) return Response.json({ ok: false, error: 'Sverka importi: taqsimot ro‘yxati noto‘g‘ri.' }, { status: 400 });
          r.taqsimot = tq.map((t) => ({ obyekt_id: (t as Record<string, unknown>)?.obyekt_id ?? null, summa: (t as Record<string, unknown>)?.summa ?? null, manba: (t as Record<string, unknown>)?.manba ?? null }));
        }
        for (const k of ['f2_akt_ids', 'f2_reestr_ids'] as const) {
          const ak = (q as Record<string, unknown>)[k];
          if (ak == null) continue;
          if (!Array.isArray(ak) || ak.length > 500 || ak.some((x) => !Number.isSafeInteger(Number(x)))) return Response.json({ ok: false, error: 'Sverka importi: F2 ro‘yxati noto‘g‘ri.' }, { status: 400 });
          r[k] = ak.map(Number);
        }
        qatorlar.push(r);
      }
      yuk = { p_actor_id: sess.foydalanuvchi_id, p_kompaniya_id: so.kompaniya_id, p_qatorlar: qatorlar, p_operation_id: so.operation_id };
    } else if (amal === 'tolov_taqsimot_saqla_v1') {
      const qs = so.qatorlar;
      if (!sess.foydalanuvchi_id || !uuidRe.test(String(so.operation_id || '')) || !Number.isSafeInteger(Number(so.tolov_id)) || Number(so.tolov_id) <= 0
          || !Array.isArray(qs) || qs.length > 100) {
        return Response.json({ ok: false, error: 'Taqsimot: to‘lov, ≤100 qator va operatsiya talab qilinadi.' }, { status: 400 });
      }
      yuk = {
        p_actor_id: sess.foydalanuvchi_id, p_kompaniya_id: so.kompaniya_id, p_tolov_id: Number(so.tolov_id), p_operation_id: so.operation_id,
        p_qatorlar: qs.map((t) => ({ obyekt_id: (t as Record<string, unknown>)?.obyekt_id ?? null, summa: (t as Record<string, unknown>)?.summa ?? null, manba: (t as Record<string, unknown>)?.manba ?? null })),
      };
    } else if (amal === 'forma3_f2_bog_v1') {
      const ak = so.akt_ids;
      const re = so.reestr_ids ?? [];
      const idlar = (x: unknown): x is unknown[] => Array.isArray(x) && x.length <= 500 && x.every((v) => Number.isSafeInteger(Number(v)) && Number(v) > 0);
      if (!sess.foydalanuvchi_id || !uuidRe.test(String(so.operation_id || '')) || !Number.isSafeInteger(Number(so.forma3_id)) || Number(so.forma3_id) <= 0
          || !idlar(ak) || !idlar(re)) {
        return Response.json({ ok: false, error: 'Продажа ↔ F2: F3, ≤500 akt/reestr va operatsiya talab qilinadi.' }, { status: 400 });
      }
      yuk = { p_actor_id: sess.foydalanuvchi_id, p_kompaniya_id: so.kompaniya_id, p_forma3_id: Number(so.forma3_id), p_akt_ids: ak.map(Number), p_reestr_ids: re.map(Number), p_operation_id: so.operation_id };
    } else if (amal === 'f2_reestr_yoz_v1') {
      const qs = so.qatorlar;
      if (!sess.foydalanuvchi_id || !uuidRe.test(String(so.operation_id || '')) || !Array.isArray(qs) || qs.length === 0 || qs.length > 200) {
        return Response.json({ ok: false, error: 'F2 reestri: 1–200 qator va operatsiya talab qilinadi.' }, { status: 400 });
      }
      const kalitlar = ['shartnoma_id', 'akt_id', 'raqam', 'lot', 'obyekt_ish', 'davr', 'oy', 'qqssiz', 'qqs', 'qqs_bilan', 'holat_matn'];
      const qatorlar: Record<string, unknown>[] = [];
      for (const q of qs) {
        if (!q || typeof q !== 'object' || Array.isArray(q)) return Response.json({ ok: false, error: 'F2 reestri: qator obyekt bo‘lishi kerak.' }, { status: 400 });
        const r: Record<string, unknown> = {};
        for (const k of kalitlar) {
          const x = (q as Record<string, unknown>)[k];
          if (x === undefined) continue;
          if (x !== null && typeof x !== 'string' && typeof x !== 'number') return Response.json({ ok: false, error: 'F2 reestri: maydon matn yoki son bo‘lishi kerak.' }, { status: 400 });
          r[k] = typeof x === 'string' ? x.slice(0, 500) : x;
        }
        qatorlar.push(r);
      }
      yuk = { p_actor_id: sess.foydalanuvchi_id, p_kompaniya_id: so.kompaniya_id, p_qatorlar: qatorlar, p_operation_id: so.operation_id };
    } else if (amal === 'shartnoma_saqla_v2') {
      const m = so.malumot;
      if (!sess.foydalanuvchi_id || !uuidRe.test(String(so.operation_id || '')) || !m || typeof m !== 'object' || Array.isArray(m)
          || (so.id != null && !Number.isSafeInteger(Number(so.id)))
          || (so.tomonlar != null && (!Array.isArray(so.tomonlar) || so.tomonlar.length > 30))
          || (so.obyektlar != null && (!Array.isArray(so.obyektlar) || so.obyektlar.length > 500 || so.obyektlar.some((x: unknown) => !Number.isSafeInteger(Number(x)))))) {
        return Response.json({ ok: false, error: 'Shartnoma ma\'lumoti, ≤30 tomon, ≤500 obyekt va operatsiya talab qilinadi.' }, { status: 400 });
      }
      const mk = ['loyiha_id', 'raqam', 'nom', 'turi', 'asosiy', 'taraf', 'summa_bez_nds', 'nds', 'jami_nds_bilan', 'izoh', 'holat'];
      const malumot: Record<string, unknown> = {};
      for (const k of mk) if (m[k] !== undefined) malumot[k] = typeof m[k] === 'string' ? String(m[k]).slice(0, 1000) : m[k];
      yuk = {
        p_actor_id: sess.foydalanuvchi_id, p_kompaniya_id: so.kompaniya_id, p_id: so.id == null ? null : Number(so.id),
        p_kutilgan_versiya: so.kutilgan_versiya == null ? null : Number(so.kutilgan_versiya), p_malumot: malumot,
        p_tomonlar: so.tomonlar == null ? null : so.tomonlar.map((t: any) => ({
          rol: String(t?.rol ?? '').slice(0, 120), nom: String(t?.nom ?? '').slice(0, 300), inn: t?.inn == null ? null : String(t.inn).slice(0, 30),
          kontragent_id: t?.kontragent_id ?? null, tomon_kompaniya_id: t?.tomon_kompaniya_id ?? null,
          rekvizit: t?.rekvizit && typeof t.rekvizit === 'object' && !Array.isArray(t.rekvizit) ? t.rekvizit : {},
        })),
        p_obyektlar: so.obyektlar == null ? null : so.obyektlar.map(Number), p_operation_id: so.operation_id,
      };
    } else if (amal === 'ish_kartasi_saqla_v1' || amal === 'ish_kartasi_arxiv_v1' || amal === 'ish_kartasi_ulush_saqla_v1') {
      /* Ish kartasi: maydonlar oq ro'yxatdan (skalyar / tipli), biznes qoidalari va tenant (har smeta qatori) — RPC da. */
      const xato400 = (x: string) => Response.json({ ok: false, error: 'Ish kartasi: ' + x }, { status: 400 });
      const kv = so.kutilgan_versiya == null ? null : Number(so.kutilgan_versiya);
      if (!sess.foydalanuvchi_id || !uuidRe.test(String(so.operation_id || '')) || (kv != null && !Number.isSafeInteger(kv))) return xato400('operatsiya yoki versiya noto‘g‘ri.');
      const asos = { p_kompaniya_id: so.kompaniya_id, p_actor_id: sess.foydalanuvchi_id, p_operation_id: so.operation_id };
      const ulushOl = (u: unknown): Record<string, number> | null | false => {
        if (u == null) return null;
        if (typeof u !== 'object' || Array.isArray(u)) return false;
        const r: Record<string, number> = {};
        for (const k of ['opalubka', 'armatura', 'beton']) { const x = (u as Record<string, unknown>)[k]; if (typeof x !== 'number' || !Number.isFinite(x)) return false; r[k] = x; }
        return r;
      };
      if (amal === 'ish_kartasi_ulush_saqla_v1') {
        const u = ulushOl(so.ulush);
        if (!u || !['rigel', 'balka', 'kolonna', 'plita', 'devor', 'armatura', 'boshqa'].includes(String(so.tur))) return xato400('tur va ulush talab qilinadi.');
        yuk = { ...asos, p_tur: String(so.tur), p_ulush: u, p_kutilgan_versiya: kv };
      } else {
        const kid = so.karta_id == null ? null : Number(so.karta_id);
        if (kid != null && (!Number.isSafeInteger(kid) || kid <= 0)) return xato400('karta noto‘g‘ri.');
        if (amal === 'ish_kartasi_arxiv_v1') {
          if (kid == null || kv == null) return xato400('karta va versiya talab qilinadi.');
          yuk = { ...asos, p_karta_id: kid, p_kutilgan_versiya: kv };
        } else {
          const k = so.karta; const bog = so.bog;
          if (!k || typeof k !== 'object' || Array.isArray(k) || !Array.isArray(bog) || bog.length > 60) return xato400('karta va ≤60 bog‘ talab qilinadi.');
          const km = k as Record<string, unknown>;
          const matnK = (x: unknown, n: number) => (x == null || x === '' ? null : typeof x === 'string' ? x.slice(0, n) : undefined);
          const sonK = (x: unknown) => (x == null || x === '' ? null : typeof x === 'number' && Number.isFinite(x) ? x : undefined);
          const obj = (x: unknown) => (x == null ? null : typeof x === 'object' && !Array.isArray(x) ? x : undefined);
          const ul = ulushOl(km.bosqich_ulush);
          const karta = {
            nom: matnK(km.nom, 300), tur: matnK(km.tur, 20), birlik: matnK(km.birlik, 20), parametrlar: obj(km.parametrlar) ?? {}, bosqich_ulush: ul,
            qamrov: obj(km.qamrov) ?? {}, naryad_narx: sonK(km.naryad_narx), naryad_sana: matnK(km.naryad_sana, 10), usta_nom: matnK(km.usta_nom, 200),
            usta_kontragent_id: sonK(km.usta_kontragent_id), manba: matnK(km.manba, 20) ?? 'qolda', ishonch: sonK(km.ishonch),
            manba_hujjat_id: sonK(km.manba_hujjat_id), manba_sahifa: sonK(km.manba_sahifa), izoh: matnK(km.izoh, 2000),
          };
          if (ul === false || Object.values(karta).some((v) => v === undefined)) return xato400('karta maydoni noto‘g‘ri turda.');
          if (karta.naryad_sana != null && !/^\d{4}-\d{2}-\d{2}$/.test(karta.naryad_sana)) return xato400('naryad sanasi YYYY-MM-DD.');
          const boglar: Record<string, unknown>[] = [];
          for (const b of bog) {
            if (!b || typeof b !== 'object' || Array.isArray(b)) return xato400('bog‘ obyekt bo‘lishi kerak.');
            const x = b as Record<string, unknown>;
            const qid = Number(x.qator_id);
            if (!Number.isSafeInteger(qid) || qid <= 0 || sonK(x.koef) === undefined || sonK(x.ishonch) === undefined) return xato400('bog‘ maydoni noto‘g‘ri.');
            boglar.push({ qator_id: qid, rol: matnK(x.rol, 30) ?? 'asosiy', koef: sonK(x.koef), koef_usul: matnK(x.koef_usul, 20) ?? 'qolda',
              bosqich: matnK(x.bosqich, 20), material_guruh: matnK(x.material_guruh, 20), manba: matnK(x.manba, 20) ?? 'qolda', ishonch: sonK(x.ishonch) });
          }
          yuk = { ...asos, p_karta_id: kid, p_kutilgan_versiya: kv, p_karta: karta, p_bog: boglar };
        }
      }
    } else if (amal === 'naryad_yoz_v1') {
      /* Naryad: ichki amal va yuk oq ro'yxatdan (faqat tipli maydonlar); biznes qoidalari va tenant (har smeta qatori, obyekt) — RPC da. */
      const xato400 = (x: string) => Response.json({ ok: false, error: 'Naryad: ' + x }, { status: 400 });
      const ichki = String(so.naryad_amal ?? '');
      const kv = so.kutilgan_versiya == null ? null : Number(so.kutilgan_versiya);
      const nid = so.naryad_id == null ? null : Number(so.naryad_id);
      if (!sess.foydalanuvchi_id || !uuidRe.test(String(so.operation_id || '')) || (kv != null && !Number.isSafeInteger(kv)) || (nid != null && (!Number.isSafeInteger(nid) || nid <= 0))) return xato400('operatsiya, versiya yoki naryad noto‘g‘ri.');
      if (!['yarat', 'bajarildi', 'qabul', 'narx', 'fakt_yozildi', 'hisobla', 'bekor', 'lugat_saqla'].includes(ichki)) return xato400('amal noma’lum.');
      if (ichki !== 'yarat' && ichki !== 'lugat_saqla' && (nid == null || kv == null)) return xato400('naryad va versiya talab qilinadi.');
      const yx = so.yuk && typeof so.yuk === 'object' && !Array.isArray(so.yuk) ? so.yuk as Record<string, unknown> : {};
      const sonN = (x: unknown) => (x == null || x === '' ? null : typeof x === 'number' && Number.isFinite(x) ? x : undefined);
      const matnN = (x: unknown, n: number) => (x == null || x === '' ? null : typeof x === 'string' ? x.slice(0, n) : undefined);
      const qs = yx.qatorlar;
      if (qs != null && (!Array.isArray(qs) || qs.length > 200)) return xato400('≤200 qator.');
      const yuk2: Record<string, unknown> = {};
      if (ichki === 'yarat') {
        for (const [k, v] of [['obyekt_id', sonN(yx.obyekt_id)], ['usta_kontragent_id', sonN(yx.usta_kontragent_id)], ['usta_foydalanuvchi_id', sonN(yx.usta_foydalanuvchi_id)], ['usta_nom', matnN(yx.usta_nom, 200)], ['brigada', matnN(yx.brigada, 200)],
          ['izoh', matnN(yx.izoh, 2000)], ['davr_dan', matnN(yx.davr_dan, 10)], ['davr_gacha', matnN(yx.davr_gacha, 10)]] as const) {
          if (v === undefined) return xato400(`${k} noto‘g‘ri turda.`);
          yuk2[k] = v;
        }
        for (const k of ['davr_dan', 'davr_gacha']) if (yuk2[k] != null && !/^\d{4}-\d{2}-\d{2}$/.test(String(yuk2[k]))) return xato400('sana YYYY-MM-DD.');
      }
      if (qs) {
        const kalitlar = ichki === 'yarat' ? ['qator_id', 'hajm', 'usta_narx', 'norma_chel_soat', 'smeta_mehnat_birlik', 'smeta_kat_birlik', 'koef', 'usta_narx_birlik', 'fakt_boshida']
          : ichki === 'bajarildi' ? ['id', 'bajarilgan_hajm'] : ichki === 'narx' ? ['id', 'usta_narx', 'usta_narx_birlik', 'koef'] : ichki === 'qabul' ? ['id', 'qabul_hajm', 'fakt_hozir'] : [];
        const out: Record<string, unknown>[] = [];
        for (const q of qs) {
          if (!q || typeof q !== 'object' || Array.isArray(q)) return xato400('qator obyekt bo‘lishi kerak.');
          const r: Record<string, unknown> = {};
          for (const k of kalitlar) { const v = sonN((q as Record<string, unknown>)[k]); if (v === undefined) return xato400(`${k} son bo‘lishi kerak.`); r[k] = v; }
          if (ichki === 'yarat' || ichki === 'narx') {
            for (const k of ichki === 'yarat' ? ['kat', 'usta_birlik'] : ['usta_birlik']) {
              const v = matnN((q as Record<string, unknown>)[k], 40); if (v === undefined) return xato400(`${k} matn bo‘lishi kerak.`); r[k] = v;
            }
            if (r.kat != null && !['ЧЕЛ', 'МАТ', 'МАШ'].includes(String(r.kat))) return xato400('kat ЧЕЛ, МАТ yoki МАШ bo‘lsin.');
          }
          out.push(r);
        }
        yuk2.qatorlar = out;
      }
      if (ichki === 'fakt_yozildi') { const a = sonN(yx.akt_id); if (a === undefined) return xato400('akt_id son bo‘lishi kerak.'); yuk2.akt_id = a; }
      if (ichki === 'lugat_saqla') {
        const qv = yx.qiymat;
        if (qv !== null && (typeof qv !== 'object' || Array.isArray(qv) || JSON.stringify(qv).length > 20000)) return xato400('lug‘at obyekt va ≤20 KB bo‘lishi kerak.');
        yuk2.qiymat = qv;
      }
      yuk = { p_kompaniya_id: so.kompaniya_id, p_actor_id: sess.foydalanuvchi_id, p_operation_id: so.operation_id, p_amal: ichki, p_naryad_id: nid, p_kutilgan_versiya: kv, p_yuk: yuk2 };
    } else if (amal === 'qarzdorlik_saqla_v1') {
      /* Qarzdorlik: bitta shartnoma asoslari (CAS) - qator maydonlari oq ro'yxatdan, qolganini RPC tekshiradi. */
      const qs = so.qatorlar; const och = so.ochirilgan; const sp = so.spravka;
      const ochXato = och != null && (!Array.isArray(och) || och.length > 2000 || och.some((x: unknown) => !Number.isSafeInteger(Number(x))));
      const spXato = sp != null && (typeof sp !== 'object' || Array.isArray(sp));
      if (!sess.foydalanuvchi_id || !uuidRe.test(String(so.operation_id || '')) || !Number.isSafeInteger(Number(so.shartnoma_id)) || Number(so.shartnoma_id) <= 0
          || !Array.isArray(qs) || qs.length > 2000 || ochXato || spXato) {
        return Response.json({ ok: false, error: 'Qarzdorlik: shartnoma, ≤2000 qator va operatsiya talab qilinadi.' }, { status: 400 });
      }
      const kalitlar = ['id', 'tur', 'hujjat_raqam', 'sana', 'nomi', 'birlik', 'hajm', 'narx', 'summa', 'izoh', 'sklad_harakat_id', 'tolov_id'];
      const qatorlar: Record<string, unknown>[] = [];
      for (const q of qs) {
        if (!q || typeof q !== 'object' || Array.isArray(q)) return Response.json({ ok: false, error: 'Qarzdorlik: qator obyekt bo‘lishi kerak.' }, { status: 400 });
        const r: Record<string, unknown> = {};
        for (const k of kalitlar) {
          const x = (q as Record<string, unknown>)[k];
          if (x === undefined) continue;
          if (x !== null && typeof x !== 'string' && typeof x !== 'number') return Response.json({ ok: false, error: 'Qarzdorlik: maydon matn yoki son bo‘lishi kerak.' }, { status: 400 });
          r[k] = typeof x === 'string' ? x.slice(0, 500) : x;
        }
        qatorlar.push(r);
      }
      const spravka: Record<string, unknown> | null = sp == null ? null : {};
      if (spravka) for (const k of ['qarz', 'tolangan', 'prognoz', 'sana']) { const x = (sp as Record<string, unknown>)[k]; if (x !== undefined && (x === null || typeof x === 'string' || typeof x === 'number')) spravka[k] = x; }
      yuk = {
        p_actor_id: sess.foydalanuvchi_id, p_kompaniya_id: so.kompaniya_id, p_shartnoma_id: Number(so.shartnoma_id),
        p_kutilgan_versiya: so.kutilgan_versiya == null ? null : Number(so.kutilgan_versiya), p_qatorlar: qatorlar,
        p_ochirilgan: och == null ? null : och.map(Number), p_spravka: spravka, p_operation_id: so.operation_id,
      };
    } else if (amal.startsWith('hr_')) {
      /* HR + KPI: maydonlar oq ro'yxatdan (skalyar), ruxsat va biznes qoidalarni RPC tekshiradi. */
      const opXato = !sess.foydalanuvchi_id || !uuidRe.test(String(so.operation_id || ''));
      const yaroqsiz = (x: string) => Response.json({ ok: false, error: x }, { status: 400 });
      const idOrNull = (v: unknown) => (v == null || v === '' ? null : Number(v));
      const kv = so.kutilgan_versiya == null ? null : Number(so.kutilgan_versiya);
      const oyOk = /^\d{4}-(0[1-9]|1[0-2])$/.test(String(so.oy || ''));
      const asos = { p_actor_id: sess.foydalanuvchi_id, p_kompaniya_id: so.kompaniya_id, p_operation_id: so.operation_id };
      if (opXato || (kv != null && !Number.isSafeInteger(kv))) return yaroqsiz('HR: operatsiya noto‘g‘ri.');
      if (amal === 'hr_xodim_saqla_v1') {
        const kid = idOrNull(so.kadr_id);
        const profil = so.profil == null ? null : hrPick(so.profil, ['ism', 'lavozim', 'foydalanuvchi_id', 'rol', 'grafik', 'baza_turi', 'baza_summa', 'sxema_id', 'qabul_sana', 'bosh_sana']);
        const pii = so.pii == null ? null : hrPick(so.pii, ['pinfl', 'pasport', 'telefon', 'manzil']);
        const ob = so.obyektlar;
        const obyektlar = ob == null ? null : (Array.isArray(ob) && ob.length <= 200 ? ob.map((x: unknown) => hrPick(x, ['obyekt_id', 'ulush_foiz', 'rol', 'dan', 'gacha'])) : undefined);
        if ((kid != null && (!Number.isSafeInteger(kid) || kid <= 0)) || (so.profil != null && !profil) || (so.pii != null && !pii)
            || obyektlar === undefined || (obyektlar && obyektlar.some((x: unknown) => !x))) return yaroqsiz('Xodim: kadr, profil, PII yoki obyektlar noto‘g‘ri.');
        yuk = { ...asos, p_kadr_id: kid, p_profil: profil, p_pii: pii, p_obyektlar: obyektlar, p_kutilgan_versiya: kv };
      } else if (amal === 'hr_sxema_saqla_v1') {
        const sx = so.sxema == null ? null : hrPick(so.sxema, ['id', 'nom', 'f2_foiz', 'f2_baza', 'f2_rejim', 'izoh', 'faol']);
        const sz = so.sozlama == null ? null : hrPick(so.sozlama, ['ndfl_foiz', 'inps_foiz', 'kun_soat']);
        if ((so.sxema != null && !sx) || (so.sozlama != null && !sz) || (!sx && !sz)) return yaroqsiz('Sxema yoki stavkalar noto‘g‘ri.');
        yuk = { ...asos, p_sxema: sx, p_sozlama: sz };
      } else if (amal === 'hr_kalendar_saqla_v1') {
        const kn = so.kunlar; const tt = so.tatillar;
        const kunlar = kn == null ? null : (Array.isArray(kn) && kn.length <= 400 ? kn.map((x: unknown) => hrPick(x, ['sana', 'tur', 'nom'])) : undefined);
        const tatillar = tt == null ? null : (Array.isArray(tt) && tt.length <= 200 ? tt.map((x: unknown) => hrPick(x, ['id', 'kadr_id', 'tur', 'dan', 'gacha', 'holat', 'izoh'])) : undefined);
        if (kunlar === undefined || tatillar === undefined || (kunlar && kunlar.some((x: unknown) => !x)) || (tatillar && tatillar.some((x: unknown) => !x))) return yaroqsiz('Kalendar: kunlar (≤400) yoki tatillar (≤200) noto‘g‘ri.');
        yuk = { ...asos, p_kunlar: kunlar, p_tatillar: tatillar };
      } else if (amal === 'hr_tabel_saqla_v1') {
        const qs = so.qatorlar;
        if (!oyOk || !Array.isArray(qs) || qs.length > 500) return yaroqsiz('Tabel: oy (YYYY-MM) va ≤500 qator talab qilinadi.');
        const qatorlar: Record<string, unknown>[] = [];
        for (const q of qs) {
          const b = hrPick(q, ['kadr_id', 'holat']);
          const kun = q && typeof q === 'object' ? (q as Record<string, unknown>).kunlar : undefined;
          if (!b || !Number.isSafeInteger(Number(b.kadr_id)) || Number(b.kadr_id) <= 0 || !kun || typeof kun !== 'object' || Array.isArray(kun) || Object.keys(kun).length > 31) return yaroqsiz('Tabel: qator noto‘g‘ri.');
          const kunlar: Record<string, string> = {};
          for (const [k, v] of Object.entries(kun as Record<string, unknown>)) { if (typeof v !== 'string' || v.length !== 1) return yaroqsiz('Tabel: kun belgisi noto‘g‘ri.'); kunlar[k.slice(0, 2)] = v; }
          qatorlar.push({ ...b, kunlar });
        }
        yuk = { ...asos, p_oy: String(so.oy), p_qatorlar: qatorlar };
      } else if (amal === 'hr_tuzatma_saqla_v1') {
        const tz = hrPick(so.tuzatma, ['id', 'bekor', 'kadr_id', 'oy', 'tur', 'sabab', 'izoh', 'summa', 'foiz', 'obyekt_id', 'akt_id', 'sifat_id', 'fayl_id']);
        if (!tz) return yaroqsiz('Jarima/bonus noto‘g‘ri.');
        yuk = { ...asos, p_tuzatma: tz, p_kutilgan_versiya: kv };
      } else if (amal === 'hr_tuzatma_qaror_v1') {
        const id = Number(so.id);
        if (!Number.isSafeInteger(id) || id <= 0 || !['tasdiqlangan', 'rad'].includes(String(so.qaror))) return yaroqsiz('Qaror: yozuv va qaror (tasdiqlangan | rad) talab qilinadi.');
        yuk = { ...asos, p_id: id, p_qaror: String(so.qaror), p_izoh: so.izoh == null ? null : String(so.izoh).slice(0, 500), p_kutilgan_versiya: kv };
      } else if (amal === 'hr_kpi_qoida_saqla_v1') {
        const qs = so.qoidalar; const pulga = so.kpi_pulga;
        const qoidalar = qs == null ? null : (Array.isArray(qs) && qs.length <= 60 ? qs.map((x: unknown) => hrPick(x, ['rol', 'korsatkich', 'ogirlik', 'maqsad', 'chegara_kun', 'qayta_sukut'])) : undefined);
        if (qoidalar === undefined || (qoidalar && qoidalar.some((x: unknown) => !x)) || (pulga != null && typeof pulga !== 'boolean') || (qoidalar == null && pulga == null)) {
          return yaroqsiz('KPI qoidasi: qoidalar (≤60) yoki kpi_pulga (true | false) noto‘g‘ri.');
        }
        yuk = { ...asos, p_qoidalar: qoidalar, p_kpi_pulga: pulga == null ? null : pulga };
      } else if (amal === 'hr_oylik_v1') {
        const ids = so.kadr_ids;
        if (!oyOk || !['hisobla', 'tasdiqla', 'qaytar'].includes(String(so.oylik_amal))
            || (ids != null && (!Array.isArray(ids) || ids.length > 1000 || ids.some((x: unknown) => !Number.isSafeInteger(Number(x)) || Number(x) <= 0)))) {
          return yaroqsiz('Ish haqi: oy (YYYY-MM), amal (hisobla | tasdiqla | qaytar) va xodimlar noto‘g‘ri.');
        }
        yuk = { ...asos, p_oy: String(so.oy), p_amal: String(so.oylik_amal), p_kadr_ids: ids == null ? null : (ids as unknown[]).map(Number) };
      } else {
        return yaroqsiz('HR amali noma’lum.');
      }
    } else if (amal === 'shartnoma_oylik_paket_saqla_v1') {
      /* Shartnoma oylik paketi: manifest ob'ekt (fayllar massivi bilan), ZIP esa kanonik saqlashda (hujjat_id). Server izni o'zi hisoblaydi. */
      const mf = so.manifest;
      const hid = so.hujjat_id == null ? null : Number(so.hujjat_id);
      if (!sess.foydalanuvchi_id || !uuidRe.test(String(so.operation_id || '')) || !Number.isSafeInteger(Number(so.shartnoma_id)) || Number(so.shartnoma_id) <= 0
          || !/^\d{4}-(0[1-9]|1[0-2])$/.test(String(so.oy || '')) || !mf || typeof mf !== 'object' || Array.isArray(mf)
          || !Array.isArray((mf as Record<string, unknown>).fayllar) || ((mf as { fayllar: unknown[] }).fayllar.length > 5000)
          || JSON.stringify(mf).length > 2_000_000
          || (hid != null && (!Number.isSafeInteger(hid) || hid <= 0))
          || (so.zip_sha256 != null && !/^[0-9a-f]{64}$/.test(String(so.zip_sha256)))
          || (so.zip_olcham != null && (!Number.isSafeInteger(Number(so.zip_olcham)) || Number(so.zip_olcham) <= 0))) {
        return Response.json({ ok: false, error: 'Oylik paket: shartnoma, oy (YYYY-MM), manifest (fayllar bilan) va operatsiya talab qilinadi.' }, { status: 400 });
      }
      yuk = {
        p_actor_id: sess.foydalanuvchi_id, p_kompaniya_id: so.kompaniya_id, p_shartnoma_id: Number(so.shartnoma_id), p_oy: String(so.oy),
        p_manifest: mf, p_hujjat_id: hid, p_zip_sha256: so.zip_sha256 == null ? null : String(so.zip_sha256),
        p_zip_olcham: so.zip_olcham == null ? null : Number(so.zip_olcham), p_operation_id: so.operation_id,
      };
    } else if (amal === 'shartnoma_hujjat_bogla_v1') {
      /* Shartnoma / DS asl fayli: fayl avval kanonik /api/hujjat-yukla bilan saqlanadi (document_id), keyin shu bog'. */
      const dsId = so.ds_id == null || so.ds_id === '' ? null : Number(so.ds_id);
      const tur = so.tur == null || so.tur === '' ? null : String(so.tur);
      if (!sess.foydalanuvchi_id || !uuidRe.test(String(so.operation_id || ''))
          || !Number.isSafeInteger(Number(so.shartnoma_id)) || Number(so.shartnoma_id) <= 0
          || !Number.isSafeInteger(Number(so.document_id)) || Number(so.document_id) <= 0
          || (dsId != null && (!Number.isSafeInteger(dsId) || dsId <= 0))
          || (tur != null && !['asosiy', 'ds', 'ilova', 'boshqa'].includes(tur))
          || (so.izoh != null && (typeof so.izoh !== 'string' || so.izoh.length > 500))) {
        return Response.json({ ok: false, error: 'Shartnoma hujjati: shartnoma, hujjat, tur (asosiy | ds | ilova | boshqa) va operatsiya talab qilinadi.' }, { status: 400 });
      }
      yuk = {
        p_actor_id: sess.foydalanuvchi_id, p_kompaniya_id: so.kompaniya_id, p_shartnoma_id: Number(so.shartnoma_id), p_ds_id: dsId,
        p_document_id: Number(so.document_id), p_tur: tur, p_izoh: so.izoh == null ? null : String(so.izoh), p_operation_id: so.operation_id,
      };
    } else if (amal === 'shartnoma_hujjat_ajrat_v1') {
      if (!sess.foydalanuvchi_id || !uuidRe.test(String(so.operation_id || '')) || !Number.isSafeInteger(Number(so.id)) || Number(so.id) <= 0) {
        return Response.json({ ok: false, error: 'Shartnoma hujjati: bog\' va operatsiya talab qilinadi.' }, { status: 400 });
      }
      yuk = { p_actor_id: sess.foydalanuvchi_id, p_kompaniya_id: so.kompaniya_id, p_id: Number(so.id), p_operation_id: so.operation_id };
    } else if (amal === 'qarzdorlik_import_v1') {
      /* Qarzdorlik Excel importi: ≤300 shartnoma, jami ≤5000 asos qatori; maydonlar oq ro'yxatdan. */
      const shs = so.shartnomalar;
      if (!sess.foydalanuvchi_id || !uuidRe.test(String(so.operation_id || '')) || !Array.isArray(shs) || shs.length === 0 || shs.length > 300
          || (so.obyekt_id != null && (!Number.isSafeInteger(Number(so.obyekt_id)) || Number(so.obyekt_id) <= 0))) {
        return Response.json({ ok: false, error: 'Qarzdorlik importi: 1–300 shartnoma va operatsiya talab qilinadi.' }, { status: 400 });
      }
      const shKalit = ['kontragent', 'inn', 'turi', 'raqam', 'sana', 'nom', 'predmet', 'summa'];
      const qKalit = ['tur', 'hujjat_raqam', 'sana', 'nomi', 'birlik', 'hajm', 'narx', 'summa', 'izoh'];
      const nolik = (x: unknown) => x === null || typeof x === 'string' || typeof x === 'number';
      let jamiQator = 0;
      const shartnomalar: Record<string, unknown>[] = [];
      for (const s of shs) {
        if (!s || typeof s !== 'object' || Array.isArray(s)) return Response.json({ ok: false, error: 'Qarzdorlik importi: shartnoma obyekt bo‘lishi kerak.' }, { status: 400 });
        const r: Record<string, unknown> = {};
        for (const k of shKalit) { const x = (s as Record<string, unknown>)[k]; if (x === undefined) continue; if (!nolik(x)) return Response.json({ ok: false, error: 'Qarzdorlik importi: maydon matn yoki son bo‘lishi kerak.' }, { status: 400 }); r[k] = typeof x === 'string' ? x.slice(0, 500) : x; }
        const sp = (s as Record<string, unknown>).spravka;
        if (sp != null) {
          if (typeof sp !== 'object' || Array.isArray(sp)) return Response.json({ ok: false, error: 'Qarzdorlik importi: spravka obyekt bo‘lishi kerak.' }, { status: 400 });
          const o: Record<string, unknown> = {};
          for (const k of ['qarz', 'tolangan', 'prognoz', 'sana']) { const x = (sp as Record<string, unknown>)[k]; if (x !== undefined && nolik(x)) o[k] = x; }
          r.spravka = o;
        }
        const qq = (s as Record<string, unknown>).qatorlar;
        const arr: Record<string, unknown>[] = [];
        if (qq != null) {
          if (!Array.isArray(qq)) return Response.json({ ok: false, error: 'Qarzdorlik importi: qatorlar massiv bo‘lishi kerak.' }, { status: 400 });
          jamiQator += qq.length;
          if (jamiQator > 5000) return Response.json({ ok: false, error: 'Qarzdorlik importi: jami ≤5000 qator.' }, { status: 400 });
          for (const q of qq) {
            if (!q || typeof q !== 'object' || Array.isArray(q)) return Response.json({ ok: false, error: 'Qarzdorlik importi: qator obyekt bo‘lishi kerak.' }, { status: 400 });
            const rq: Record<string, unknown> = {};
            for (const k of qKalit) { const x = (q as Record<string, unknown>)[k]; if (x === undefined) continue; if (!nolik(x)) return Response.json({ ok: false, error: 'Qarzdorlik importi: maydon matn yoki son bo‘lishi kerak.' }, { status: 400 }); rq[k] = typeof x === 'string' ? x.slice(0, 500) : x; }
            arr.push(rq);
          }
        }
        r.qatorlar = arr;
        shartnomalar.push(r);
      }
      yuk = { p_actor_id: sess.foydalanuvchi_id, p_kompaniya_id: so.kompaniya_id, p_shartnomalar: shartnomalar, p_obyekt_id: so.obyekt_id == null ? null : Number(so.obyekt_id), p_operation_id: so.operation_id };
    } else if (amal.startsWith('bux_')) {
      /* Buxgalteriya (egasi 2026-11-04): hisoblar rejasi, avto-provodka, qo'lda provodka/storno, davr, bank importi, HR ilgagi.
         Har amalning oq ro'yxatdagi maydonlari; a'zolik + accounting.* RPC ichida tekshiriladi. */
      if (!sess.foydalanuvchi_id || !uuidRe.test(String(so.operation_id || ''))) {
        return Response.json({ ok: false, error: 'Buxgalteriya: operatsiya (operation_id) talab qilinadi.' }, { status: 400 });
      }
      const matn = (x: unknown, n: number) => (x == null || String(x).trim() === '' ? null : String(x).slice(0, n));
      const butun = (x: unknown) => (x == null || x === '' ? null : Number(x));
      const sonXato = (x: unknown) => x != null && x !== '' && !Number.isFinite(Number(x));
      const idXato = (x: unknown) => x != null && x !== '' && (!Number.isSafeInteger(Number(x)) || Number(x) <= 0);
      const sanaXato = (x: unknown) => x != null && x !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(String(x));
      const asos = { p_actor_id: sess.foydalanuvchi_id, p_kompaniya_id: so.kompaniya_id, p_operation_id: so.operation_id };
      const xato400 = (m: string) => Response.json({ ok: false, error: `Buxgalteriya: ${m}` }, { status: 400 });
      if (amal === 'bux_boshlash_v1') {
        yuk = { ...asos };
      } else if (amal === 'bux_hisob_saqla_v1') {
        if (!/^\d{4}$/.test(String(so.kod || '')) || !matn(so.nom_uz, 200) || !matn(so.nom_ru, 200)) return xato400('hisob kodi (4 raqam) va nomlari talab qilinadi.');
        yuk = { ...asos, p_kod: String(so.kod), p_nom_uz: matn(so.nom_uz, 200), p_nom_ru: matn(so.nom_ru, 200), p_tur: matn(so.tur, 30),
          p_kontragent_analitika: so.kontragent_analitika === true, p_faol: so.faol !== false };
      } else if (amal === 'bux_moslik_saqla_v1') {
        if (!/^[a-z0-9_]+\.[a-z0-9_]+$/.test(String(so.kalit || '')) || sonXato(so.qiymat)) return xato400('qoida kaliti noto‘g‘ri.');
        yuk = { ...asos, p_kalit: String(so.kalit), p_dt_kod: matn(so.dt_kod, 4), p_kt_kod: matn(so.kt_kod, 4), p_qiymat: butun(so.qiymat) };
      } else if (amal === 'bux_avto_v1') {
        yuk = { ...asos, p_dry: so.dry === true };
      } else if (amal === 'bux_qolda_v1') {
        if (sanaXato(so.sana) || !so.sana || sonXato(so.summa) || so.summa == null || idXato(so.kontragent_id) || idXato(so.shartnoma_id) || idXato(so.obyekt_id)) return xato400('sana, summa va analitika noto‘g‘ri.');
        yuk = { ...asos, p_sana: String(so.sana), p_dt_kod: matn(so.dt_kod, 4), p_kt_kod: matn(so.kt_kod, 4), p_summa: Number(so.summa),
          p_kontragent_id: butun(so.kontragent_id), p_shartnoma_id: butun(so.shartnoma_id), p_obyekt_id: butun(so.obyekt_id), p_izoh: matn(so.izoh, 300) };
      } else if (amal === 'bux_storno_v1') {
        if (idXato(so.provodka_id) || so.provodka_id == null) return xato400('provodka talab qilinadi.');
        yuk = { ...asos, p_provodka_id: Number(so.provodka_id), p_izoh: matn(so.izoh, 300) };
      } else if (amal === 'bux_davr_v1') {
        if (!/^\d{4}-\d{2}(-\d{2})?$/.test(String(so.oy || '')) || !['yop', 'och'].includes(String(so.davr_amal))) return xato400('oy va amal (yop/och) talab qilinadi.');
        const oy = String(so.oy);
        yuk = { ...asos, p_oy: oy.length === 7 ? `${oy}-01` : oy, p_amal: String(so.davr_amal), p_tasdiq: so.tasdiq === true, p_izoh: matn(so.izoh, 300) };
      } else if (amal === 'bux_shablon_tanla_v1') {
        if (!/^[a-z_]{3,30}$/.test(String(so.shablon || ''))) return xato400('shablon nomi noto‘g‘ri.');
        yuk = { ...asos, p_shablon: String(so.shablon) };
      } else if (amal === 'bux_davr_blok_v1') {
        if (typeof so.blok !== 'boolean') return xato400('blok (true/false) talab qilinadi.');
        yuk = { ...asos, p_blok: so.blok };
      } else if (amal === 'bux_hisob_tasdiq_v1') {
        const kodlar = so.kodlar;
        if (!Array.isArray(kodlar) || kodlar.length === 0 || kodlar.length > 200 || kodlar.some((x) => !/^\d{4}$/.test(String(x)))) return xato400('1–200 ta hisob kodi (4 raqam) talab qilinadi.');
        yuk = { ...asos, p_kodlar: kodlar.map((x) => String(x)) };
      } else if (amal === 'bux_saldo_import_v1') {
        const qs = so.qatorlar;
        if (sanaXato(so.sana) || !so.sana) return xato400('sana talab qilinadi.');
        if (!Array.isArray(qs) || qs.length === 0 || qs.length > 2000) return xato400('1–2000 qator talab qilinadi.');
        const qatorlar: Record<string, unknown>[] = [];
        for (const q of qs) {
          const e = q as Record<string, unknown> | null;
          if (!e || typeof e !== 'object' || Array.isArray(e) || sonXato(e.dt) || sonXato(e.kt) || idXato(e.kontragent_id) || idXato(e.shartnoma_id) || idXato(e.obyekt_id)) return xato400('saldo qatori noto‘g‘ri.');
          qatorlar.push({ hisob: matn(e.hisob, 4), dt: matn(e.dt, 30), kt: matn(e.kt, 30), kontragent_id: butun(e.kontragent_id), shartnoma_id: butun(e.shartnoma_id), obyekt_id: butun(e.obyekt_id) });
        }
        yuk = { ...asos, p_sana: String(so.sana), p_qarshi: matn(so.qarshi, 4), p_qatorlar: qatorlar, p_dry: so.dry === true };
      } else if (amal === 'bux_saldo_bekor_v1') {
        yuk = { ...asos };
      } else if (amal === 'bux_tannarx_v1') {
        if (!/^\d{4}-\d{2}(-\d{2})?$/.test(String(so.oy || '')) || !['yop', 'bekor'].includes(String(so.tannarx_amal))) return xato400('oy va amal (yop/bekor) talab qilinadi.');
        const oy = String(so.oy);
        yuk = { ...asos, p_oy: oy.length === 7 ? `${oy}-01` : oy, p_amal: String(so.tannarx_amal), p_dry: so.dry === true };
      } else if (amal === 'bux_hisobot_saqla_v1') {
        const qs = so.qatorlar;
        if (!['balans', 'foyda_zarar'].includes(String(so.forma)) || !Array.isArray(qs) || qs.length > 100) return xato400('forma va ≤100 qator talab qilinadi.');
        yuk = { ...asos, p_forma: String(so.forma), p_qatorlar: qs };
      } else if (amal === 'bux_bank_yuklash_v1') {
        const qs = so.qatorlar;
        if (!Array.isArray(qs) || qs.length === 0 || qs.length > 500) return xato400('1–500 qator talab qilinadi.');
        const qatorlar: Record<string, unknown>[] = [];
        for (const q of qs) {
          const e = q as Record<string, unknown> | null;
          if (!e || typeof e !== 'object' || Array.isArray(e) || sanaXato(e.sana) || sonXato(e.summa) || !matn(e.kalit, 120) || !['kirim', 'chiqim'].includes(String(e.yonalish))) return xato400('bank qatori noto‘g‘ri.');
          qatorlar.push({ kalit: matn(e.kalit, 120), sana: matn(e.sana, 10), summa: matn(e.summa, 30), yonalish: String(e.yonalish), hujjat_raqam: matn(e.hujjat_raqam, 60), izoh: matn(e.izoh, 500), inn: matn(e.inn, 20), kontragent: matn(e.kontragent, 200) });
        }
        yuk = { ...asos, p_qatorlar: qatorlar };
      } else if (amal === 'bux_bank_qabul_v1') {
        if (idXato(so.qator_id) || so.qator_id == null || idXato(so.shartnoma_id) || idXato(so.oylik_id) || (so.shartnoma_id == null) === (so.oylik_id == null)) return xato400('qator va bitta nishon (shartnoma yoki oylik) talab qilinadi.');
        yuk = { ...asos, p_qator_id: Number(so.qator_id), p_shartnoma_id: butun(so.shartnoma_id), p_oylik_id: butun(so.oylik_id) };
      } else if (amal === 'bux_kassa_yoz_v1') {
        if (!['kirim', 'chiqim'].includes(String(so.tur)) || sanaXato(so.sana) || !so.sana || sonXato(so.summa) || so.summa == null || !/^\d{4}$/.test(String(so.qarshi || '')) || idXato(so.kontragent_id) || idXato(so.shartnoma_id) || idXato(so.obyekt_id)) return xato400('kassa order maydonlari noto‘g‘ri.');
        yuk = { ...asos, p_tur: String(so.tur), p_sana: String(so.sana), p_summa: Number(so.summa), p_qarshi: String(so.qarshi), p_kontragent_id: butun(so.kontragent_id), p_shartnoma_id: butun(so.shartnoma_id), p_obyekt_id: butun(so.obyekt_id), p_asos: matn(so.asos, 300) };
      } else if (amal === 'bux_kassa_bekor_v1') {
        if (idXato(so.order_id) || so.order_id == null) return xato400('order talab qilinadi.');
        yuk = { ...asos, p_order_id: Number(so.order_id) };
      } else if (amal === 'bux_taqsim_saqla_v1') {
        const qs = so.qatorlar;
        if (idXato(so.kadr_id) || so.kadr_id == null || !Array.isArray(qs) || qs.length > 50) return xato400('xodim va ≤50 ulush qatori talab qilinadi.');
        yuk = { ...asos, p_kadr_id: Number(so.kadr_id), p_qatorlar: qs.map((x) => ({ obyekt_id: Number((x as Record<string, unknown>)?.obyekt_id), ulush: Number((x as Record<string, unknown>)?.ulush) })) };
      } else if (amal === 'bux_bank_import_v1') {        const qs = so.qatorlar;
        if (!Array.isArray(qs) || qs.length === 0 || qs.length > 500) return xato400('1–500 qator talab qilinadi.');
        const qatorlar: Record<string, unknown>[] = [];
        for (const q of qs) {
          const e = q as Record<string, unknown> | null;
          if (!e || typeof e !== 'object' || Array.isArray(e) || sanaXato(e.sana) || sonXato(e.summa) || idXato(e.shartnoma_id)) return xato400('bank qatori noto‘g‘ri.');
          qatorlar.push({ kalit: matn(e.kalit, 120), sana: matn(e.sana, 10), summa: e.summa, yonalish: matn(e.yonalish, 10), shartnoma_id: butun(e.shartnoma_id),
            hujjat_raqam: matn(e.hujjat_raqam, 60), izoh: matn(e.izoh, 500) });
        }
        yuk = { ...asos, p_qatorlar: qatorlar };
      } else if (amal === 'bux_tashqi_v1') {
        const qs = so.qatorlar;
        if (!/^(hr|tr)_[a-z0-9_]{1,30}$/.test(String(so.manba_tur || '')) || !Array.isArray(qs) || qs.length > 5000) return xato400('manba (hr_* yoki tr_*) va ≤5000 qator talab qilinadi.');
        const qatorlar: Record<string, unknown>[] = [];
        for (const q of qs) {
          const e = q as Record<string, unknown> | null;
          if (!e || typeof e !== 'object' || Array.isArray(e) || idXato(e.manba_id) || sanaXato(e.sana) || sonXato(e.summa) || idXato(e.kontragent_id) || idXato(e.shartnoma_id) || idXato(e.obyekt_id)) return xato400('qator noto‘g‘ri.');
          qatorlar.push({ manba_id: butun(e.manba_id), sana: matn(e.sana, 10), dt_kod: matn(e.dt_kod, 4), kt_kod: matn(e.kt_kod, 4), summa: e.summa,
            kontragent_id: butun(e.kontragent_id), shartnoma_id: butun(e.shartnoma_id), obyekt_id: butun(e.obyekt_id) });
        }
        yuk = { ...asos, p_manba_tur: String(so.manba_tur), p_qatorlar: qatorlar };
      } else {
        return xato400('noma‘lum amal.');
      }
    } else if (amal === 'ish_turi_saqla_v1') {
      if (!sess.foydalanuvchi_id) return Response.json({ ok: false, error: 'Sessiya talab qilinadi.' }, { status: 401 });
      yuk = {
        p_actor_id: sess.foydalanuvchi_id, p_kompaniya_id: so.kompaniya_id, p_id: so.id ?? null,
        p_kod: so.kod ?? null, p_nomi: so.nomi ?? null, p_birligi: so.birligi ?? null,
        p_narx: so.narx ?? null, p_norma: so.norma ?? null, p_kategoriya: so.kategoriya ?? null,
        p_kutilgan_versiya: so.kutilgan_versiya ?? null,
      };
    } else if (amal === 'ish_resurslar_bilan_yarat_v1') {
      const buyruq = String(so.command || '');
      const resurslar = Array.isArray(so.resurslar) ? so.resurslar : [];
      if (!sess.foydalanuvchi_id || !so.operation_id || !Number.isSafeInteger(Number(so.kutilgan_versiya))
          || (buyruq !== 'additional' && buyruq !== 'replacement') || resurslar.length > 500) {
        return Response.json({ ok: false, error: 'Buyruq, operatsiya, versiya va ≤500 resurs talab qilinadi.' }, { status: 400 });
      }
      const matnQ = (x: unknown, n: number) => (x == null || String(x).trim() === '' ? null : String(x).slice(0, n));
      const sonQ = (x: unknown) => (x == null || x === '' || !Number.isFinite(Number(x)) ? null : Number(x));
      yuk = { p_request: {
        command: buyruq, kompaniya_id: Number(so.kompaniya_id), actor_id: sess.foydalanuvchi_id,
        obyekt_id: Number(so.obyekt_id), ota_qator_id: Number(so.ota_qator_id),
        almashtirilayotgan_qator_id: buyruq === 'replacement' ? Number(so.almashtirilayotgan_qator_id) : null,
        nom: matnQ(so.nom, 500), birlik: matnQ(so.birlik, 40), hajm: sonQ(so.hajm), kod: matnQ(so.kod, 100),
        keyin_qator_id: so.keyin_qator_id ?? null, sabab: matnQ(so.sabab, 500), dalil_hujjat_id: so.dalil_hujjat_id ?? null,
        operation_id: so.operation_id, kutilgan_versiya: Number(so.kutilgan_versiya),
        resurslar: resurslar.map((r: Record<string, unknown>) => ({
          tur: ['rs', 'mat', 'ob'].includes(String(r.tur)) ? String(r.tur) : 'rs',
          nom: matnQ(r.nom, 500), birlik: matnQ(r.birlik, 40), hajm: sonQ(r.hajm), kod: matnQ(r.kod, 100),
        })),
      } };
    } else if (amal === 'catalog_observation_yoz_v1') {
      if (!sess.foydalanuvchi_id || !so.operation_id || !Array.isArray(so.observations) || so.observations.length > 1000) {
        return Response.json({ ok: false, error: 'Operatsiya va 1–1000 ta katalog kuzatuvi talab qilinadi.' }, { status: 400 });
      }
      yuk = { p_kompaniya_id: so.kompaniya_id, p_actor_id: sess.foydalanuvchi_id,
        p_scope: so.scope, p_observations: so.observations, p_operation_id: so.operation_id };
    } else if (amal === 'f2_qoralama_yangila_v1') {
      if (!sess.foydalanuvchi_id || !uuidRe.test(String(so.operation_id || '')) || !Number.isSafeInteger(Number(so.akt_id)) || Number(so.akt_id) <= 0
          || !Number.isSafeInteger(so.kutilgan_versiya) || !Array.isArray(so.qatorlar) || so.qatorlar.length === 0) {
        return Response.json({ ok: false, error: 'Akt, versiya, operatsiya va qatorlar talab qilinadi.' }, { status: 400 });
      }
      yuk = {
        p_actor_id: sess.foydalanuvchi_id, p_kompaniya_id: so.kompaniya_id, p_akt_id: Number(so.akt_id), p_kutilgan_versiya: Number(so.kutilgan_versiya),
        p_qatorlar: so.qatorlar.map((q: any) => ({
          qator_id: Number(q.qator_id), certified_quantity: q.certified_quantity,
          certified_unit_price: q.price_intentionally_absent === true ? null : q.certified_unit_price,
          certified_amount: q.price_intentionally_absent === true ? null : q.certified_amount,
          price_intentionally_absent: q.price_intentionally_absent === true,
          certified_source_hash: q.certified_source_hash ? String(q.certified_source_hash).slice(0, 200) : null,
          raw_snapshot: f2RawSnapshot(q), izoh: q.izoh ? String(q.izoh).slice(0, 500) : null,
        })),
        p_operation_id: so.operation_id, p_manba: 'frontend_v2',
      };
    } else if (amal === 'akt_podval_yoz_v1') {
      const aktId = Number(so.akt_id);
      const manba = String(so.manba || '');
      if (!sess.foydalanuvchi_id || !Number.isSafeInteger(aktId) || aktId <= 0 || !Number.isSafeInteger(Number(so.kompaniya_id))
          || !['import', 'storno', 'smeta', 'backfill'].includes(manba)) {
        return Response.json({ ok: false, error: 'Akt, kompaniya va manba talab qilinadi.' }, { status: 400 });
      }
      if (manba !== 'storno' && (so.podval == null || typeof so.podval !== 'object' || JSON.stringify(so.podval).length > 200000)) {
        return Response.json({ ok: false, error: 'Podval noto\'g\'ri yoki juda katta.' }, { status: 400 });
      }
      yuk = {
        p_actor_id: sess.foydalanuvchi_id, p_kompaniya_id: Number(so.kompaniya_id), p_akt_id: aktId,
        p_blok: so.blok == null ? '' : String(so.blok).slice(0, 40), p_manba: manba,
        p_podval: manba === 'storno' ? null : so.podval,
        p_manba_akt_id: so.manba_akt_id == null ? null : Number(so.manba_akt_id),
      };
    } else if (amal === 'akt_yarat_v2') {
      const obyektId = Number(so.obyekt_id);
      if (!Number.isFinite(obyektId) || obyektId <= 0) {
        return Response.json({ ok: false, error: 'obyekt_id noto\'g\'ri' });
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(so.oy || ''))) {
        return Response.json({ ok: false, error: 'oy YYYY-MM-DD ko\'rinishida bo\'lishi kerak' });
      }
      if (!Array.isArray(so.qatorlar) || so.qatorlar.length === 0) {
        return Response.json({ ok: false, error: 'Hujjatda bironta qator yo\'q' });
      }
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(so.operation_id || ''))) {
        return Response.json({ ok: false, error: 'operation_id (UUID) majburiy' });
      }
      const v2Qatorlar = so.qatorlar.map((q: any) => ({
        qator_id: Number(q.qator_id),
        certified_quantity: q.certified_quantity,
        certified_unit_price: q.price_intentionally_absent === true ? null : q.certified_unit_price,
        certified_amount: q.price_intentionally_absent === true ? null : q.certified_amount,
        price_intentionally_absent: q.price_intentionally_absent === true,
        certified_source_hash: q.certified_source_hash ? String(q.certified_source_hash).slice(0, 200) : null,
        raw_snapshot: f2RawSnapshot(q),
        izoh: q.izoh ? String(q.izoh).slice(0, 500) : null,
      }));
      if (v2Qatorlar.some((q: any) => !Number.isFinite(q.qator_id) || q.qator_id <= 0)) {
        return Response.json({ ok: false, error: 'Ba\'zi qatorlarda qator_id noto\'g\'ri' });
      }
      yuk = {
        p_obyekt_id: obyektId,
        p_oy: so.oy,
        p_qatorlar: v2Qatorlar,
        p_actor_id: sess.foydalanuvchi_id,
        p_raqam: so.raqam ? String(so.raqam).slice(0, 100) : null,
        p_operation_id: so.operation_id,
        p_manba: 'frontend_v2',
      };

    /* ══════════ F2 RESUMABLE IMPORT JOB (T2-GAS-EXIT-001 §5/§6) ══════════
     * `f2_import_job_ilgarilash`/`f2_import_draft_saqla` xato yoki eskirgan
     * versiya bo'lsa 200 status bilan `{ok:false, code:...}` qaytaradi (RPC
     * o'zi shunday javob beradi) -- bu yerda status kodini o'zgartirmaymiz,
     * chunked worker javobni o'zi tekshiradi (STALE_VERSION/STALE_DRAFT_VERSION
     * xato emas, optimistic-lock normal holati). */
    } else if (amal === 'f2_import_job_yarat') {
      const obyektId = Number(so.obyekt_id);
      if (!Number.isFinite(obyektId) || obyektId <= 0) {
        return Response.json({ ok: false, error: 'obyekt_id noto\'g\'ri' });
      }
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(so.operation_id || ''))) {
        return Response.json({ ok: false, error: 'operation_id (UUID) majburiy -- usiz qayta urinish ikkinchi job yaratadi' });
      }
      const totalRows = Number(so.total_rows);
      if (!Number.isFinite(totalRows) || totalRows < 1 || totalRows > 100000) {
        return Response.json({ ok: false, error: 'total_rows 1..100000 oralig\'ida bo\'lishi kerak' });
      }
      yuk = {
        p_obyekt_id: obyektId,
        p_actor_id: sess.foydalanuvchi_id,
        p_source_document_id: so.source_document_id ? Number(so.source_document_id) : null,
        p_operation_id: so.operation_id,
        p_total_rows: totalRows,
      };

    } else if (amal === 'f2_import_job_ilgarilash') {
      const jobId = Number(so.job_id);
      if (!Number.isFinite(jobId) || jobId <= 0) {
        return Response.json({ ok: false, error: 'job_id noto\'g\'ri' });
      }
      if (!Number.isInteger(Number(so.expected_versiya)) || Number(so.expected_versiya) < 1) {
        return Response.json({ ok: false, error: 'expected_versiya noto\'g\'ri' });
      }
      const delta = ['processed_delta', 'matched_delta', 'unmatched_delta'].every(
        (k) => Number.isFinite(Number((so as any)[k])) && Number((so as any)[k]) >= 0);
      if (!delta) {
        return Response.json({ ok: false, error: 'processed_delta/matched_delta/unmatched_delta manfiy bo\'lmagan son bo\'lishi kerak' });
      }
      yuk = {
        p_job_id: jobId,
        p_actor_id: sess.foydalanuvchi_id,
        p_expected_versiya: Number(so.expected_versiya),
        p_processed_delta: Number(so.processed_delta),
        p_matched_delta: Number(so.matched_delta),
        p_unmatched_delta: Number(so.unmatched_delta),
        p_cursor: so.cursor ?? null,
        p_status: so.status ?? null,
        p_last_error: so.last_error ? String(so.last_error).slice(0, 500) : null,
      };

    } else if (amal === 'f2_import_job_recover' || amal === 'f2_import_job_cancel') {
      const jobId = Number(so.job_id);
      const expectedRaw = so.expected_versiya ?? so.kutilgan_versiya;
      const expectedVersion = Number(expectedRaw);
      if (!Number.isSafeInteger(jobId) || jobId <= 0 || expectedRaw == null ||
          (typeof expectedRaw === 'string' && !expectedRaw.trim()) ||
          !Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
        return Response.json({ ok: false, error: 'job_id va expected_versiya noto\'g\'ri' });
      }
      if (!uuidRe.test(operationId)) {
        return Response.json({ ok: false, error: 'operation_id (UUID) majburiy' });
      }
      if (amal === 'f2_import_job_recover') {
        const staleRaw = so.stale_after_seconds;
        const stale = staleRaw == null ? null : Number(staleRaw);
        if (stale != null && (!Number.isSafeInteger(stale) || stale < 60 || stale > 86400)) {
          return Response.json({ ok: false, error: 'stale_after_seconds 60..86400 oralig\'ida bo\'lishi kerak' });
        }
        yuk = {
          p_job_id: jobId,
          p_actor_id: sess.foydalanuvchi_id,
          p_expected_versiya: expectedVersion,
          p_operation_id: operationId,
          ...(stale == null ? {} : { p_stale_after_seconds: stale }),
        };
      } else {
        const reason = typeof so.sabab === 'string' ? so.sabab.trim().slice(0, 2000) : '';
        if (!reason) return Response.json({ ok: false, error: 'Bekor qilish sababi majburiy' });
        yuk = {
          p_job_id: jobId,
          p_actor_id: sess.foydalanuvchi_id,
          p_expected_versiya: expectedVersion,
          p_operation_id: operationId,
          p_reason: reason,
        };
      }

    } else if (amal === 'f2_import_draft_saqla') {
      const jobId = Number(so.job_id);
      if (!Number.isFinite(jobId) || jobId <= 0) {
        return Response.json({ ok: false, error: 'job_id noto\'g\'ri' });
      }
      if (!Array.isArray(so.qatorlar) || so.qatorlar.length === 0 || so.qatorlar.length > 5000) {
        return Response.json({ ok: false, error: 'qatorlar 1..5000 ta bo\'lishi kerak' });
      }
      yuk = {
        p_job_id: jobId,
        p_actor_id: sess.foydalanuvchi_id,
        p_qatorlar: so.qatorlar,
      };

    /* ══════════ NARX BASIS (Протокол согласования цены va h.k.) ══════════ */
    } else if (amal === 'price_basis_yarat') {
      const kompaniyaId = Number(so.kompaniya_id);
      if (!Number.isFinite(kompaniyaId) || kompaniyaId <= 0) {
        return Response.json({ ok: false, error: 'kompaniya_id noto\'g\'ri' });
      }
      if (!Array.isArray(sess.kompaniyalar) || !sess.kompaniyalar.some((a) => a.kompaniya_id === kompaniyaId)) {
        return Response.json({ ok: false, error: 'Bu kompaniyaga a\'zo emassiz' }, { status: 403 });
      }
      const BASIS_TURLAR = ['PRICE_AGREEMENT_PROTOCOL', 'APPROVED_CHANGE', 'ADDITIONAL_AGREEMENT', 'OTHER_APPROVED_PRICE_BASIS'];
      if (!BASIS_TURLAR.includes(String(so.basis_type))) {
        return Response.json({ ok: false, error: 'basis_type noto\'g\'ri' });
      }
      if (!Array.isArray(so.lines) || so.lines.length === 0) {
        return Response.json({ ok: false, error: 'Bironta qator ko\'rsatilmagan' });
      }
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(so.operation_id || ''))) {
        return Response.json({ ok: false, error: 'operation_id (UUID) majburiy' });
      }
      yuk = {
        p_actor_id: sess.foydalanuvchi_id,
        p_kompaniya_id: kompaniyaId,
        p_basis_type: so.basis_type,
        p_lines: so.lines.map((l: any) => ({
          qator_id: Number(l.qator_id), approved_price: l.approved_price,
          valid_from: l.valid_from || null, valid_to: l.valid_to || null,
        })),
        p_document_id: so.document_id ? Number(so.document_id) : null,
        p_operation_id: so.operation_id,
      };

    /* ══════════ SMETAGA QATOR QO'SHISH ══════════ */
    } else if (amal === 'qator_qosh') {
      const obyektId = Number(so.obyekt_id);
      if (!Number.isFinite(obyektId) || obyektId <= 0) {
        return Response.json({ ok: false, error: 'obyekt_id noto\'g\'ri' });
      }
      const TURLAR = ['rz', 'bl', 'rs', 'mat', 'ob'];
      if (!TURLAR.includes(String(so.tur))) {
        return Response.json({ ok: false, error: 'tur: rz|bl|rs|mat|ob' });
      }
      if (!String(so.nom || '').trim()) {
        return Response.json({ ok: false, error: 'Nom bo\'sh' });
      }
      /* ⚠️ IDEMPOTENTLIK MAJBURIY — `akt_yarat` dagi bilan bir xil sabab:
         tarmoq uzilib qayta yuborilsa smetaga IKKITA bir xil qator
         tushardi va jami ogohlantirishsiz oshardi. */
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
            .test(String(so.operation_id || ''))) {
        return Response.json({ ok: false,
          error: 'operation_id (UUID) majburiy — usiz takroriy so\'rov ikkinchi qator yaratadi' });
      }
      /* ⚠️ NORMA: berilgan bo'lsa son bo'lishi shart, lekin MANFIY
         bo'lishi MUMKIN. `> 0` deb tekshirish ПЕРЕРАСЧЁТ ni bloklardi —
         bu tizimda bir necha marta shu xato qilingan. */
      let norma: number | null = null;
      if (so.norma != null && so.norma !== '') {
        norma = Number(so.norma);
        if (!Number.isFinite(norma)) {
          return Response.json({ ok: false, error: 'norma son emas' });
        }
      }
      /* ⚠️ Narx BERILMASA yuborilmaydi (null emas, umuman yo'q) —
         shunda baza narxlar bazasidan qidiradi. 0 yuborish «bepul»
         degani bo'lardi. */
      let narx: number | null = null;
      if (so.narx != null && so.narx !== '') {
        narx = Number(so.narx);
        if (!Number.isFinite(narx)) {
          return Response.json({ ok: false, error: 'narx son emas' });
        }
      }
      yuk = {
        p_obyekt_id: obyektId,
        p_tur: so.tur,
        p_nom: String(so.nom).slice(0, 500),
        p_ota_id: so.ota_id == null ? null : Number(so.ota_id),
        p_kod: so.kod ? String(so.kod).slice(0, 100) : null,
        p_birlik: so.birlik ? String(so.birlik).slice(0, 50) : null,
        p_norma: norma,
        p_narx: narx,
        p_e_obyom: so.e_obyom == null ? null : so.e_obyom === true,
        p_kat: so.kat ? String(so.kat).slice(0, 20) : null,
        p_keyin_id: so.keyin_id == null ? null : Number(so.keyin_id),
        p_operation_id: so.operation_id,
        p_manba: 'frontend',
        p_kim: sess.email || '',
      };

    /* ══════════ NARX BELGILASH ══════════ */
    } else if (amal === 'narx_belgila') {
      if (!String(so.nom || '').trim()) {
        return Response.json({ ok: false, error: 'Nom bo\'sh' });
      }
      /* ⚠️ NARX O'ZIDAN TO'QILMAYDI. «Belgilash» — bu ATAYLAB qo'yilgan
         raqam. Noma'lum bo'lsa bu amal umuman chaqirilmaydi; bo'sh
         yuborib «0» bo'lib qolishiga yo'l qo'ymaymiz. */
      const narx = Number(so.narx);
      if (so.narx == null || so.narx === '' || !Number.isFinite(narx) || narx < 0) {
        return Response.json({ ok: false,
          error: 'Belgilanadigan narx musbat son bo\'lishi kerak' });
      }
      yuk = {
        p_nom: String(so.nom).slice(0, 500),
        p_birlik: so.birlik ? String(so.birlik).slice(0, 50) : null,
        p_narx: narx,
        p_kat: so.kat ? String(so.kat).slice(0, 20) : null,
        p_izoh: so.izoh ? String(so.izoh).slice(0, 500) : null,
        p_kutilgan_versiya: so.kutilgan_versiya == null
          ? null : Number(so.kutilgan_versiya),
        p_manba: 'frontend',
        p_kim: sess.email || '',
      };

    /* ══════════ SANA (BOZOR) NARXLARI ══════════ */
    } else if (amal === 'narx_sana_qosh') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(so.sana || ''))) {
        return Response.json({ ok: false, error: 'sana YYYY-MM-DD bo\'lishi kerak' });
      }
      if (!Array.isArray(so.qatorlar) || so.qatorlar.length === 0) {
        return Response.json({ ok: false, error: 'Bironta qator yo\'q' });
      }
      /* ⚠️ Yaroqsiz qatorlarni BU YERDA tashlamaymiz — baza ularni
         sanab, `tashlangan_qatorlar` bo'lib qaytaradi. Bu yerda jim
         filtrlab yuborsak «qancha kirdi = qancha yozildi» kafolati
         yolg'on bo'lib qolardi. */
      const qatorlar = so.qatorlar.slice(0, 5000).map((q: any) => ({
        nom: String(q.nom ?? '').slice(0, 500),
        birlik: q.birlik ? String(q.birlik).slice(0, 50) : null,
        narx: q.narx,
        izoh: q.izoh ? String(q.izoh).slice(0, 300) : null,
      }));
      yuk = {
        p_sana: so.sana,
        p_qatorlar: qatorlar,
        p_manba: so.manba ? String(so.manba).slice(0, 100) : null,
        p_kim: sess.email || '',
      };

    /* ══════════ VIBORKA — SMETADAN REJA TO'LDIRISH ══════════ */
    } else if (amal === 'viborka_smetadan_toldir') {
      const obyektId = Number(so.obyekt_id);
      if (!Number.isFinite(obyektId) || obyektId <= 0) {
        return Response.json({ ok: false, error: 'obyekt_id noto\'g\'ri' });
      }
      yuk = { p_obyekt_id: obyektId };

    /* ══════════ VIBORKA — MATERIAL QABULI ══════════ */
    } else if (amal === 'viborka_qabul_yoz') {
      const viborkaId = Number(so.viborka_id);
      if (!Number.isFinite(viborkaId) || viborkaId <= 0) {
        return Response.json({ ok: false, error: 'viborka_id noto\'g\'ri' });
      }
      const hajm = Number(so.hajm);
      if (!Number.isFinite(hajm) || hajm === 0) {
        return Response.json({ ok: false, error: 'hajm 0 yoki bo\'sh bo\'lishi mumkin emas' });
      }
      /* ⚠️ IDEMPOTENTLIK MAJBURIY — boshqa moliyaviy yozuvlar bilan bir xil sabab. */
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
            .test(String(so.operation_id || ''))) {
        return Response.json({ ok: false,
          error: 'operation_id (UUID) majburiy — usiz takroriy so\'rov ikkinchi qabul yaratadi' });
      }
      yuk = {
        p_viborka_id: viborkaId,
        p_hajm: hajm,
        p_narx: (so.narx == null || so.narx === '') ? null : Number(so.narx),
        p_yetkazib_beruvchi: so.yetkazib_beruvchi ? String(so.yetkazib_beruvchi).slice(0, 200) : null,
        p_sana: so.sana || null,
        p_izoh: so.izoh ? String(so.izoh).slice(0, 500) : null,
        p_kutilgan_versiya: so.kutilgan_versiya == null ? null : Number(so.kutilgan_versiya),
        p_operation_id: so.operation_id,
        p_manba: 'frontend',
        p_kim: sess.email || '',
      };

    /* ══════════ ШАРТНОМА SAQLASH ══════════ */
    } else if (amal === 'shartnoma_saqla') {
      if (!String(so.raqam || '').trim()) {
        return Response.json({ ok: false, error: 'Shartnoma raqami bo\'sh' });
      }
      /* ⚠️ 2026-08-28: `kompaniya_id` uzatilmasdi — shartnoma qaysi
         kompaniyaga tegishli ekani TASODIFGA qolardi. Boshqa hamma
         domen (sklad/kadr/texnika/kontragent/loyiha) uni uzatadi,
         faqat shartnoma istisno edi. */
      const shKomp = Number(so.kompaniya_id);
      if (!Number.isFinite(shKomp) || shKomp <= 0) {
        return Response.json({ ok: false, error: 'kompaniya_id noto\'g\'ri' });
      }
      yuk = {
        p_kompaniya_id: shKomp,
        p_raqam: String(so.raqam).slice(0, 100),
        p_nom: so.nom ? String(so.nom).slice(0, 500) : null,
        p_taraf: so.taraf ? String(so.taraf).slice(0, 300) : null,
        p_summa_bez_nds: so.summa_bez_nds == null ? null : Number(so.summa_bez_nds),
        p_nds: so.nds == null ? null : Number(so.nds),
        p_jami_nds_bilan: so.jami_nds_bilan == null ? null : Number(so.jami_nds_bilan),
        p_chel_stavka: so.chel_stavka == null ? null : Number(so.chel_stavka),
        p_izoh: so.izoh ? String(so.izoh).slice(0, 1000) : null,
        p_kutilgan_versiya: so.kutilgan_versiya == null ? null : Number(so.kutilgan_versiya),
        p_manba: 'frontend',
        p_kim: sess.email || '',
        /* ЗАКАЗЧИК rekvizitlari (F3 — счет-фактура titulida) — egasi 2026-09-28. */
        p_zakazchik_toliq_nom: so.zakazchik_toliq_nom ? String(so.zakazchik_toliq_nom).slice(0, 300) : null,
        p_zakazchik_manzil: so.zakazchik_manzil ? String(so.zakazchik_manzil).slice(0, 500) : null,
        p_zakazchik_telefon: so.zakazchik_telefon ? String(so.zakazchik_telefon).slice(0, 60) : null,
        p_zakazchik_hisob_raqam: so.zakazchik_hisob_raqam ? String(so.zakazchik_hisob_raqam).slice(0, 60) : null,
        p_zakazchik_bank: so.zakazchik_bank ? String(so.zakazchik_bank).slice(0, 300) : null,
        p_zakazchik_mfo: so.zakazchik_mfo ? String(so.zakazchik_mfo).slice(0, 20) : null,
        p_zakazchik_inn: so.zakazchik_inn ? String(so.zakazchik_inn).slice(0, 30) : null,
        p_zakazchik_oked: so.zakazchik_oked ? String(so.zakazchik_oked).slice(0, 30) : null,
        /* Kanonik bog'lanish — t2_kompaniya registriga (egasi 2026-09-28: rekvizit bir marta kiritiladi, ko'p joyda ishlatiladi). */
        p_zakazchik_kompaniya_id: so.zakazchik_kompaniya_id == null ? null : Number(so.zakazchik_kompaniya_id),
      };

    /* ══════════ ШАРТНОМА BEKOR QILISH ══════════ */
    } else if (amal === 'shartnoma_ochir') {
      if (!Number.isSafeInteger(sess.foydalanuvchi_id) || (sess.foydalanuvchi_id as number) <= 0) return Response.json({ ok: false, error: 'Sessiya talab qilinadi.' }, { status: 401 });
            const shartnomaId = Number(so.shartnoma_id);
      if (!Number.isFinite(shartnomaId) || shartnomaId <= 0) {
        return Response.json({ ok: false, error: 'shartnoma_id noto\'g\'ri' });
      }
      yuk = {
        p_actor_id: sess.foydalanuvchi_id,
        p_shartnoma_id: shartnomaId,
        p_kutilgan_versiya: so.kutilgan_versiya == null ? null : Number(so.kutilgan_versiya),
      };

    /* ══════════ OBYEKTNI ШАРТНОМАGA BOG'LASH ══════════ */
    } else if (amal === 'shartnoma_bog_saqla') {
      const obyektId = Number(so.obyekt_id);
      const shartnomaId = Number(so.shartnoma_id);
      if (!Number.isFinite(obyektId) || obyektId <= 0) {
        return Response.json({ ok: false, error: 'obyekt_id noto\'g\'ri' });
      }
      if (!Number.isFinite(shartnomaId) || shartnomaId <= 0) {
        return Response.json({ ok: false, error: 'shartnoma_id noto\'g\'ri' });
      }
      yuk = { p_obyekt_id: obyektId, p_shartnoma_id: shartnomaId };

    /* ══════════ НАКРУТКА KOEFFITSIENTLARINI SAQLASH ══════════
       ⚠️ shartnoma_id berilmasa UMUMIY DEFAULT yangilanadi — bu BARCHA
       shartnomalarga ta'sir qiladi. Faqat admin/superadmin qila oladi. */
    } else if (amal === 'nakrutka_saqla') {
      if (!Array.isArray(so.qatorlar) || so.qatorlar.length === 0) {
        return Response.json({ ok: false, error: 'Bironta koeffitsient yo\'q' });
      }
      const shartnomaId = so.shartnoma_id == null ? null : Number(so.shartnoma_id);
      if (shartnomaId === null && !(sess.rol === 'admin' || sess.rol === 'superadmin')) {
        return Response.json({ ok: false, status: 403,
          error: 'Umumiy default накрутка faqat admin huquqi bilan o\'zgartiriladi' }, { status: 403 });
      }
      const qatorlar = so.qatorlar.slice(0, 50).map((q: any) => ({
        koef: String(q.koef ?? '').slice(0, 100),
        qiymat: q.qiymat,
        izoh: q.izoh ? String(q.izoh).slice(0, 300) : null,
      }));
      yuk = { p_qatorlar: qatorlar, p_shartnoma_id: shartnomaId };

    /* ══════════ TO'LOV YOZISH ══════════
       ⚠️ IDEMPOTENTLIK MAJBURIY — moliyaviy yozuv, tarmoq uzilib qayta
       yuborilsa ikkinchi to'lov paydo bo'lmasin. */
    } else if (amal === 'tolov_yoz') {
      const shartnomaId = Number(so.shartnoma_id);
      const summa = Number(so.summa);
      if (!Number.isFinite(shartnomaId) || shartnomaId <= 0) {
        return Response.json({ ok: false, error: 'shartnoma_id noto\'g\'ri' });
      }
      if (!Number.isFinite(summa) || summa === 0) {
        return Response.json({ ok: false, error: 'summa 0 yoki bo\'sh bo\'lishi mumkin emas' });
      }
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
            .test(String(so.operation_id || ''))) {
        return Response.json({ ok: false,
          error: 'operation_id (UUID) majburiy — usiz takroriy so\'rov ikkinchi to\'lov yaratadi' });
      }
      yuk = {
        p_shartnoma_id: shartnomaId,
        p_summa: summa,
        p_tur: so.tur ? String(so.tur).slice(0, 20) : 'tolov',
        p_sana: so.sana || null,
        p_obyekt_id: so.obyekt_id == null ? null : Number(so.obyekt_id),
        p_izoh: so.izoh ? String(so.izoh).slice(0, 500) : null,
        p_operation_id: so.operation_id,
        /* 2026-10-23: kompaniya berilmasa RPC eng birinchi kompaniyani yozardi — endi so'rovdagi (a'zolik tekshirilgan) kompaniya. */
        p_kompaniya_id: so.kompaniya_id ?? null,
        p_manba: 'frontend',
        p_kim: sess.email || '',
      };

    /* ══════════ TO'LOV TAHRIRLASH ══════════ */
    } else if (amal === 'tolov_tahrir') {
      const tolovId = Number(so.tolov_id);
      if (!Number.isFinite(tolovId) || tolovId <= 0) {
        return Response.json({ ok: false, error: 'tolov_id noto\'g\'ri' });
      }
      yuk = {
        p_tolov_id: tolovId,
        p_summa: so.summa == null ? null : Number(so.summa),
        p_sana: so.sana || null,
        p_tur: so.tur ? String(so.tur).slice(0, 20) : null,
        p_izoh: so.izoh ? String(so.izoh).slice(0, 500) : null,
        p_kutilgan_versiya: so.kutilgan_versiya == null ? null : Number(so.kutilgan_versiya),
      };

    /* ══════════ TO'LOV BEKOR QILISH (soft-cancel, o'chirmaydi) ══════════ */
    } else if (amal === 'tolov_ochir') {
      const tolovId = Number(so.tolov_id);
      if (!Number.isFinite(tolovId) || tolovId <= 0) {
        return Response.json({ ok: false, error: 'tolov_id noto\'g\'ri' });
      }
      yuk = { p_tolov_id: tolovId,
              p_kutilgan_versiya: so.kutilgan_versiya == null ? null : Number(so.kutilgan_versiya) };

    /* ══════════ XARAJAT YOZISH ══════════ */
    } else if (amal === 'xarajat_yoz') {
      const summa = Number(so.summa);
      if (!Number.isFinite(summa) || summa === 0) {
        return Response.json({ ok: false, error: 'summa 0 yoki bo\'sh bo\'lishi mumkin emas' });
      }
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
            .test(String(so.operation_id || ''))) {
        return Response.json({ ok: false,
          error: 'operation_id (UUID) majburiy — usiz takroriy so\'rov ikkinchi xarajat yaratadi' });
      }
      yuk = {
        p_summa: summa,
        p_toifa: so.toifa ? String(so.toifa).slice(0, 100) : null,
        p_sana: so.sana || null,
        p_izoh: so.izoh ? String(so.izoh).slice(0, 500) : null,
        p_operation_id: so.operation_id,
        p_manba: 'frontend',
        p_kim: sess.email || '',
      };

    /* ══════════ XARAJAT TAHRIRLASH ══════════ */
    } else if (amal === 'xarajat_tahrir') {
      const xarajatId = Number(so.xarajat_id);
      if (!Number.isFinite(xarajatId) || xarajatId <= 0) {
        return Response.json({ ok: false, error: 'xarajat_id noto\'g\'ri' });
      }
      yuk = {
        p_xarajat_id: xarajatId,
        p_summa: so.summa == null ? null : Number(so.summa),
        p_toifa: so.toifa ? String(so.toifa).slice(0, 100) : null,
        p_sana: so.sana || null,
        p_izoh: so.izoh ? String(so.izoh).slice(0, 500) : null,
        p_kutilgan_versiya: so.kutilgan_versiya == null ? null : Number(so.kutilgan_versiya),
      };

    /* ══════════ XARAJAT BEKOR QILISH (soft-cancel, o'chirmaydi) ══════════ */
    } else if (amal === 'xarajat_ochir') {
      const xarajatId = Number(so.xarajat_id);
      if (!Number.isFinite(xarajatId) || xarajatId <= 0) {
        return Response.json({ ok: false, error: 'xarajat_id noto\'g\'ri' });
      }
      yuk = { p_xarajat_id: xarajatId,
              p_kutilgan_versiya: so.kutilgan_versiya == null ? null : Number(so.kutilgan_versiya) };

    /* ══════════ CANONICAL F2 LIFECYCLE / CORRECTION ══════════ */
    } else if (amal === 'akt_lifecycle_transition_v1' || amal === 'akt_correction_create_v1') {
      const kompaniyaId = Number(so.kompaniya_id);
      const actorId = Number(sess.foydalanuvchi_id);
      if (!Number.isSafeInteger(kompaniyaId) || kompaniyaId <= 0) {
        return Response.json({ ok: false, error: 'kompaniya_id noto\'g\'ri' }, { status: 400 });
      }
      if (!Number.isSafeInteger(actorId) || actorId <= 0) {
        return Response.json({ ok: false, error: 'Lifecycle uchun tasdiqlangan actor talab qilinadi' }, { status: 401 });
      }
      if (!Array.isArray(sess.kompaniyalar) || !sess.kompaniyalar.some((a) => a.kompaniya_id === kompaniyaId)) {
        return Response.json({ ok: false, error: 'Bu kompaniyaga ruxsat yo\'q' }, { status: 403 });
      }
      if (!uuidRe.test(operationId)) {
        return Response.json({ ok: false, error: 'Lifecycle operation_id UUID bo\'lishi shart' }, { status: 400 });
      }
      if (amal === 'akt_lifecycle_transition_v1') {
        const aktId = Number(so.akt_id);
        const expectedRaw = so.kutilgan_versiya ?? so.expected_version;
        const expectedVersion = Number(expectedRaw);
        const allowed = new Set(['draft', 'submitted', 'checked', 'approved', 'rejected', 'cancelled', 'superseded']);
        if (expectedRaw == null || (typeof expectedRaw === 'string' && !expectedRaw.trim()) ||
            !Number.isSafeInteger(aktId) || aktId <= 0 || !Number.isSafeInteger(expectedVersion) || expectedVersion < 0) {
          return Response.json({ ok: false, error: 'akt_id va kutilgan_versiya noto\'g\'ri' }, { status: 400 });
        }
        if (!allowed.has(String(so.to_status || so.holat || ''))) {
          return Response.json({ ok: false, error: 'to_status noto\'g\'ri' }, { status: 400 });
        }
        yuk = {
          p_kompaniya_id: kompaniyaId,
          p_akt_id: aktId,
          p_to_status: String(so.to_status || so.holat),
          p_actor_id: actorId,
          p_expected_version: expectedVersion,
          p_operation_id: operationId,
          p_reason: so.sabab ? String(so.sabab).slice(0, 2000) : null,
        };
      } else {
        const sourceAktId = Number(so.source_akt_id ?? so.akt_id);
        const expectedRaw = so.kutilgan_versiya ?? so.expected_source_version;
        const expectedVersion = Number(expectedRaw);
        const revisionId = so.revision_id == null ? null : Number(so.revision_id);
        if (expectedRaw == null || (typeof expectedRaw === 'string' && !expectedRaw.trim()) ||
            !Number.isSafeInteger(sourceAktId) || sourceAktId <= 0 || !Number.isSafeInteger(expectedVersion) || expectedVersion < 0) {
          return Response.json({ ok: false, error: 'source_akt_id va kutilgan_versiya noto\'g\'ri' }, { status: 400 });
        }
        if (revisionId != null && (!Number.isSafeInteger(revisionId) || revisionId <= 0)) {
          return Response.json({ ok: false, error: 'revision_id noto\'g\'ri' }, { status: 400 });
        }
        yuk = {
          p_kompaniya_id: kompaniyaId,
          p_actor_id: actorId,
          p_source_akt_id: sourceAktId,
          p_operation_id: operationId,
          p_expected_source_version: expectedVersion,
          p_revision_id: revisionId,
          p_reason: so.sabab ? String(so.sabab).slice(0, 2000) : null,
          p_raqam: so.raqam ? String(so.raqam).slice(0, 100) : null,
        };
      }

    /* ══════════ TASDIQLASH / BEKOR ══════════ */
    } else if (amal === 'akt_tasdiqlash' || amal === 'akt_bekor') {
      const aktId = Number(so.akt_id);
      if (!Number.isFinite(aktId) || aktId <= 0) {
        return Response.json({ ok: false, error: 'akt_id noto\'g\'ri' });
      }
      /* Versiya bu yerda MAJBURIY EMAS, lekin berilsa uzatiladi:
         hujjat holati ikki foydalanuvchi tomonidan bir vaqtda
         o'zgartirilishi kamdan-kam, va RPC `for update` bilan
         qulflaydi. Berilgan bo'lsa qo'shimcha himoya. */
      const versiya = Number(so.kutilgan_versiya);
      const v = Number.isFinite(versiya) ? versiya : null;

      if (amal === 'akt_tasdiqlash') {
        if (!uuidRe.test(operationId)) {
          return Response.json({ ok: false, error: 'Tasdiqlash uchun operation_id (UUID) majburiy' }, { status: 400 });
        }
        const actorId = Number(sess.foydalanuvchi_id);
        if (!Number.isSafeInteger(actorId) || actorId <= 0) {
          return Response.json({ ok: false, error: 'Tasdiqlash uchun sessiya yangilanishi kerak' }, { status: 401 });
        }
        const access = await aktTasdiqlashRuxsati(ctx.env, aktId, actorId);
        if (!access.ok) {
          return Response.json({ ok: false, error: access.status === 503 ? 'Tasdiqlash xizmati vaqtincha mavjud emas' : 'Bu hujjatni tasdiqlashga ruxsat yo‘q' }, { status: access.status });
        }
        yuk = { p_akt_id: aktId, p_kutilgan_versiya: v, p_kim: sess.email || '', p_operation_id: operationId };
      } else {
        yuk = { p_akt_id: aktId, p_kutilgan_versiya: v, p_kim: sess.email || '',
                p_sabab: so.sabab ? String(so.sabab).slice(0, 500) : null };
      }

    /* ══════════ SKLADGA YOZISH ══════════
       ⚠️ IDEMPOTENTLIK MAJBURIY — sklad qoldig'iga ta'sir qiladi. */
    } else if (amal === 'skladga_yozish') {
      const obyektId = Number(so.obyekt_id);
      if (!Number.isFinite(obyektId) || obyektId <= 0) {
        return Response.json({ ok: false, error: 'obyekt_id noto\'g\'ri' });
      }
      if (so.operatsiya !== 'prixod' && so.operatsiya !== 'rasxod') {
        return Response.json({ ok: false, error: 'operatsiya faqat «prixod» yoki «rasxod»' });
      }
      const obyomi = Number(so.obyomi);
      if (!Number.isFinite(obyomi) || obyomi <= 0) {
        return Response.json({ ok: false, error: 'obyomi musbat son bo\'lishi kerak' });
      }
      if (!String(so.nomi || '').trim() || !String(so.birligi || '').trim()) {
        return Response.json({ ok: false, error: 'nomi va birligi bo\'sh bo\'lishi mumkin emas' });
      }
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
            .test(String(so.operation_id || ''))) {
        return Response.json({ ok: false,
          error: 'operation_id (UUID) majburiy — usiz takroriy so\'rov ikkinchi harakat yaratadi' });
      }
      yuk = {
        p_kompaniya_id: Number(so.kompaniya_id),
        p_operatsiya: so.operatsiya,
        p_obyekt_id: obyektId,
        p_turi: so.turi ? String(so.turi).slice(0, 20) : 'mat',
        p_sana: so.sana || null,
        p_nomi: String(so.nomi).slice(0, 300),
        p_birligi: String(so.birligi).slice(0, 50),
        p_obyomi: obyomi,
        p_postavshik: so.postavshik ? String(so.postavshik).slice(0, 200) : null,
        p_qabul_qiluvchi: so.qabul_qiluvchi ? String(so.qabul_qiluvchi).slice(0, 200) : null,
        p_qabul_turi: so.qabul_turi ? String(so.qabul_turi).slice(0, 50) : null,
        p_izoh: so.izoh ? String(so.izoh).slice(0, 500) : null,
        p_operation_id: so.operation_id,
        p_manba: 'frontend',
        p_kim: sess.email || '',
      };

    /* ══════════ FAKTURA (Didox EHF) ══════════
       ⚠️ Yaratishda operation_id majburiy; tahrirlashda (p_id berilsa)
       kompaniya_id ham bazada tekshiriladi (boshqa kompaniyaga tegishli
       fakturani o'zgartirib bo'lmaydi) va versiya tekshiriladi. */
    } else if (amal === 'faktura_yoz') {
      if (!String(so.raqam || '').trim() || !String(so.inn || '').trim()) {
        return Response.json({ ok: false, error: 'raqam va inn bo\'sh bo\'lishi mumkin emas' });
      }
      const id = so.id ? Number(so.id) : null;
      if (!id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
            .test(String(so.operation_id || ''))) {
        return Response.json({ ok: false,
          error: 'operation_id (UUID) majburiy — usiz takroriy so\'rov ikkinchi faktura yaratadi' });
      }
      yuk = {
        p_kompaniya_id: Number(so.kompaniya_id),
        p_raqam: String(so.raqam).slice(0, 100),
        p_sana: so.sana,
        p_kontragent: String(so.kontragent || '').slice(0, 300),
        p_inn: String(so.inn).slice(0, 20),
        p_summa: Number(so.summa),
        p_holat: so.holat || 'yangi',
        p_items: so.items || [],
        p_id: id,
        p_kutilgan_versiya: so.kutilgan_versiya == null ? null : Number(so.kutilgan_versiya),
        p_operation_id: id ? null : so.operation_id,
        p_kim: sess.email || '',
      };

    /* ══════════ ISH TURI (spravochnik) ══════════ */
    } else if (amal === 'ish_turi_yoz') {
      if (!String(so.kod || '').trim() || !String(so.nomi || '').trim()) {
        return Response.json({ ok: false, error: 'kod va nomi bo\'sh bo\'lishi mumkin emas' });
      }
      yuk = {
        p_kompaniya_id: Number(so.kompaniya_id),
        p_kod: String(so.kod).slice(0, 100),
        p_nomi: String(so.nomi).slice(0, 300),
        p_birligi: String(so.birligi || '').slice(0, 50),
        p_norma: so.norma == null ? 0 : Number(so.norma),
        p_narx: so.narx == null ? 0 : Number(so.narx),
        p_kategoriya: so.kategoriya ? String(so.kategoriya).slice(0, 100) : null,
        p_id: so.id ? Number(so.id) : null
      };

    /* ══════════ SHAXSIY SMETA ══════════ */
    } else if (amal === 'shaxsiy_smeta_yarat') {
      if (!String(so.nom || '').trim()) {
        return Response.json({ ok: false, error: 'nom bo\'sh bo\'lishi mumkin emas' });
      }
      yuk = {
        p_kompaniya_id: Number(so.kompaniya_id),
        p_nom: String(so.nom).slice(0, 500),
        p_qatorlar: so.qatorlar || [],
        p_kim: sess.email || '',
      };

    /* ══════════ АОСР (yashirin ishlar akti) ══════════ */
    } else if (amal === 'aosr_yoz') {
      const obyektId = Number(so.obyekt_id);
      if (!Number.isFinite(obyektId) || obyektId <= 0) {
        return Response.json({ ok: false, error: 'obyekt_id noto\'g\'ri' });
      }
      const id = so.id ? Number(so.id) : null;
      if (!id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
            .test(String(so.operation_id || ''))) {
        return Response.json({ ok: false,
          error: 'operation_id (UUID) majburiy — usiz takroriy so\'rov ikkinchi akt yaratadi' });
      }
      yuk = {
        p_obyekt_id: obyektId,
        p_raqam: so.raqam ? String(so.raqam).slice(0, 100) : null,
        p_ish_nomi: so.ish_nomi ? String(so.ish_nomi).slice(0, 500) : null,
        p_boshlanish_sana: so.boshlanish_sana || null,
        p_tugash_sana: so.tugash_sana || null,
        p_bajarilgan: so.bajarilgan ? String(so.bajarilgan).slice(0, 300) : null,
        p_pdf_url: so.pdf_url ? String(so.pdf_url).slice(0, 1000) : null,
        p_izoh: so.izoh ? String(so.izoh).slice(0, 1000) : null,
        p_holat: so.holat || 'yangi',
        p_id: id,
        p_kutilgan_versiya: so.kutilgan_versiya == null ? null : Number(so.kutilgan_versiya),
        p_operation_id: id ? null : so.operation_id,
        p_manba: 'frontend',
        p_kim: sess.email || '',
      };

    } else if (amal === 'aosr_bekor') {
      const id = Number(so.id);
      if (!Number.isFinite(id) || id <= 0) {
        return Response.json({ ok: false, error: 'id noto\'g\'ri' });
      }
      yuk = { p_id: id, p_kutilgan_versiya: so.kutilgan_versiya == null ? null : Number(so.kutilgan_versiya) };

    } else if (amal === 'aosr_bog_saqla') {
      if (!Array.isArray(so.aosr_ids) || !so.aosr_ids.length ||
          !Array.isArray(so.qator_ids) || !so.qator_ids.length) {
        return Response.json({ ok: false, error: 'akt yoki qator tanlanmagan' });
      }
      yuk = {
        p_aosr_ids: so.aosr_ids.slice(0, 200).map(Number),
        p_qator_ids: so.qator_ids.slice(0, 500).map(Number),
      };

    } else if (amal === 'aosr_bog_ochir') {
      const aosrId = Number(so.aosr_id);
      const qatorId = Number(so.qator_id);
      if (!Number.isFinite(aosrId) || aosrId <= 0 || !Number.isFinite(qatorId) || qatorId <= 0) {
        return Response.json({ ok: false, error: 'aosr_id yoki qator_id noto\'g\'ri' });
      }
      yuk = { p_aosr_id: aosrId, p_qator_id: qatorId };

    /* ══════════ IJRO HUJJATLARI v2 (АОСР, laboratoriya, logo) ══════════
       kompaniya_id MAJBURIY — yuqoridagi a'zolik tekshiruvi shu orqali ishlaydi;
       RPC obyekt shu kompaniyaga tegishliligini qayta tekshiradi. */
    } else if (amal === 'aosr_yoz_v2' || amal === 'lab_protokol_yoz') {
      const kompaniyaId = Number(so.kompaniya_id);
      const obyektId = Number(so.obyekt_id);
      if (!Number.isInteger(kompaniyaId) || kompaniyaId <= 0 || !Number.isInteger(obyektId) || obyektId <= 0) {
        return Response.json({ ok: false, error: 'kompaniya_id va obyekt_id majburiy' });
      }
      const id = so.id ? Number(so.id) : null;
      if (!id && !uuidRe.test(operationId)) {
        return Response.json({ ok: false, error: 'operation_id (UUID) majburiy — usiz takroriy so\'rov ikkinchi yozuv yaratadi' });
      }
      const m = so.malumot && typeof so.malumot === 'object' && !Array.isArray(so.malumot) ? so.malumot : {};
      const toza: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(m)) {
        if (k === 'komissiya') {
          if (!Array.isArray(v) || v.length > 20) return Response.json({ ok: false, error: 'komissiya ro\'yxati noto\'g\'ri' });
          toza[k] = v.map((x: any) => ({
            rol: String(x?.rol ?? '').slice(0, 60), tashkilot: String(x?.tashkilot ?? '').slice(0, 300),
            fio: String(x?.fio ?? '').slice(0, 200), lavozim: String(x?.lavozim ?? '').slice(0, 200),
          }));
        } else if (v === null || typeof v === 'number') {
          toza[k] = v;
        } else {
          toza[k] = String(v).slice(0, 4000);
        }
      }
      yuk = {
        p_kompaniya_id: kompaniyaId, p_obyekt_id: obyektId, p_malumot: toza,
        p_id: id, p_kutilgan_versiya: so.kutilgan_versiya == null ? null : Number(so.kutilgan_versiya),
        p_operation_id: id ? null : operationId, p_kim: sess.email || '',
      };

    } else if (amal === 'lab_protokol_bekor') {
      const kompaniyaId = Number(so.kompaniya_id);
      const id = Number(so.id);
      if (!Number.isInteger(kompaniyaId) || kompaniyaId <= 0 || !Number.isInteger(id) || id <= 0) {
        return Response.json({ ok: false, error: 'kompaniya_id va id majburiy' });
      }
      yuk = { p_kompaniya_id: kompaniyaId, p_id: id, p_kutilgan_versiya: so.kutilgan_versiya == null ? null : Number(so.kutilgan_versiya) };

    } else if (amal === 'lab_protokol_bog_saqla') {
      const kompaniyaId = Number(so.kompaniya_id);
      const id = Number(so.protokol_id);
      if (!Number.isInteger(kompaniyaId) || kompaniyaId <= 0 || !Number.isInteger(id) || id <= 0) {
        return Response.json({ ok: false, error: 'kompaniya_id va protokol_id majburiy' });
      }
      const sonlar = (x: unknown, n: number) => (Array.isArray(x) ? x.slice(0, n).map(Number).filter((v) => Number.isInteger(v) && v > 0) : []);
      yuk = { p_kompaniya_id: kompaniyaId, p_protokol_id: id, p_aosr_ids: sonlar(so.aosr_ids, 200), p_qator_ids: sonlar(so.qator_ids, 1000) };

    } else if (amal === 'kompaniya_logo_saqla') {
      const kompaniyaId = Number(so.kompaniya_id);
      if (!Number.isInteger(kompaniyaId) || kompaniyaId <= 0) {
        return Response.json({ ok: false, error: 'kompaniya_id majburiy' });
      }
      if (!Array.isArray(sess.kompaniyalar) ||
          !sess.kompaniyalar.some((a) => a.kompaniya_id === kompaniyaId && (a.rol === 'boss' || a.rol === 'superadmin' || a.rol === 'admin'))) {
        return Response.json({ ok: false, error: 'Logoni faqat kompaniya rahbariyati (boss/admin) o\'zgartiradi' }, { status: 403 });
      }
      const data = so.data_b64 == null ? null : String(so.data_b64);
      if (data !== null && (data.length > 409600 || !/^[A-Za-z0-9+/=]+$/.test(data))) {
        return Response.json({ ok: false, error: 'Logo ma\'lumoti noto\'g\'ri yoki juda katta (≤ 300 KB)' });
      }
      yuk = {
        p_kompaniya_id: kompaniyaId, p_mime: so.mime ? String(so.mime) : null, p_data_b64: data,
        p_sha256: so.sha256 ? String(so.sha256).slice(0, 64) : null, p_kim: sess.email || '',
      };

    /* ══════════ NAKRUTKA PODVAL KONSTRUKTORI ══════════
       Tuzilma (qatorlar) frontend `lib/nakrutka-konstruktor.ts` da tekshiriladi, RPC
       qayta tekshiradi (kod/tur, doira kompaniyaga tegishliligi). */
    } else if (amal === 'nakrutka_podval_saqla') {
      const kompaniyaId = Number(so.kompaniya_id);
      if (!Number.isInteger(kompaniyaId) || kompaniyaId <= 0) {
        return Response.json({ ok: false, error: 'kompaniya_id majburiy' });
      }
      if (!Array.isArray(so.qatorlar) || !so.qatorlar.length || so.qatorlar.length > 80) {
        return Response.json({ ok: false, error: 'Podval qatorlari 1..80 bo\'lishi shart' });
      }
      if (JSON.stringify(so.qatorlar).length > 60000) {
        return Response.json({ ok: false, error: 'Podval juda katta' });
      }
      const id = so.id ? Number(so.id) : null;
      if (!id && !uuidRe.test(operationId)) {
        return Response.json({ ok: false, error: 'operation_id (UUID) majburiy' });
      }
      const ixtiyoriyId = (v: unknown) => (v == null || v === '' ? null : Number(v));
      yuk = {
        p_kompaniya_id: kompaniyaId, p_obyekt_id: ixtiyoriyId(so.obyekt_id), p_shartnoma_id: ixtiyoriyId(so.shartnoma_id),
        p_nom: so.nom ? String(so.nom).slice(0, 200) : null, p_qatorlar: so.qatorlar,
        p_id: id, p_kutilgan_versiya: so.kutilgan_versiya == null ? null : Number(so.kutilgan_versiya),
        p_operation_id: id ? null : operationId, p_kim: sess.email || '',
      };

    } else if (amal === 'nakrutka_podval_ochir') {
      const kompaniyaId = Number(so.kompaniya_id);
      const id = Number(so.id);
      if (!Number.isInteger(kompaniyaId) || kompaniyaId <= 0 || !Number.isInteger(id) || id <= 0) {
        return Response.json({ ok: false, error: 'kompaniya_id va id majburiy' });
      }
      yuk = { p_kompaniya_id: kompaniyaId, p_id: id, p_kutilgan_versiya: so.kutilgan_versiya == null ? null : Number(so.kutilgan_versiya), p_kim: sess.email || '' };

    /* ══════════ NARX MANBALARI VA DALIL ══════════
       Katta kataloglar bo'laklab yuboriladi (rejim 'qosh', bir bo'lakda ≤ 20 000 qator). */
    } else if (amal === 'narx_manba_yoz' || amal === 'platforma_narx_manba_yoz') {
      const platforma = amal === 'platforma_narx_manba_yoz';
      const kompaniyaId = Number(so.kompaniya_id);
      if (platforma && (!Number.isInteger(sess.foydalanuvchi_id) || (sess.foydalanuvchi_id as number) <= 0)) {
        return Response.json({ ok: false, error: 'Sessiya talab qilinadi' }, { status: 401 });
      }
      if (!platforma && (!Number.isInteger(kompaniyaId) || kompaniyaId <= 0)) {
        return Response.json({ ok: false, error: 'kompaniya_id majburiy' });
      }
      const id = so.id ? Number(so.id) : null;
      if (!id && !uuidRe.test(operationId)) {
        return Response.json({ ok: false, error: 'operation_id (UUID) majburiy' });
      }
      if (so.qatorlar != null && (!Array.isArray(so.qatorlar) || so.qatorlar.length > 20000)) {
        return Response.json({ ok: false, error: 'Qatorlar ro\'yxati noto\'g\'ri yoki juda katta (bir bo\'lakda ≤ 20 000)' });
      }
      const m = so.malumot && typeof so.malumot === 'object' && !Array.isArray(so.malumot) ? so.malumot : {};
      const toza: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(m)) toza[k] = v == null || typeof v === 'number' ? v : String(v).slice(0, 1000);
      const qatorlar = Array.isArray(so.qatorlar)
        ? so.qatorlar.map((q: any) => ({
          kod: q?.kod == null ? null : String(q.kod).slice(0, 100), nom: String(q?.nom ?? '').slice(0, 1500),
          birlik: q?.birlik == null ? null : String(q.birlik).slice(0, 60),
          narx: q?.narx == null || q.narx === '' ? null : String(q.narx).replace(',', '.').replace(/\s/g, '').slice(0, 30),
          izoh: q?.izoh == null ? null : String(q.izoh).slice(0, 500),
          /* 2026-10-02: narx izohi uchun (katalog yili/kvartali, hudud, zavod sarlavhasi, NDS, narx varianti). */
          hudud: q?.hudud == null ? null : String(q.hudud).slice(0, 200),
          guruh: q?.guruh == null ? null : String(q.guruh).slice(0, 1000),
          zavod: q?.zavod == null ? null : String(q.zavod).slice(0, 1000),
          ishlab_chiqaruvchi: q?.ishlab_chiqaruvchi == null ? null : String(q.ishlab_chiqaruvchi).slice(0, 300),
          nds_holati: ['nds_siz', 'nds_bilan', 'nomalum'].includes(String(q?.nds_holati)) ? String(q.nds_holati) : null,
          nds_izoh: q?.nds_izoh == null ? null : String(q.nds_izoh).slice(0, 100),
          yil: Number.isInteger(Number(q?.yil)) && Number(q.yil) > 1990 && Number(q.yil) < 2100 ? Number(q.yil) : null,
          kvartal: [1, 2, 3, 4].includes(Number(q?.kvartal)) ? Number(q.kvartal) : null,
          narx_varianti: q?.narx_varianti == null ? null : String(q.narx_varianti).slice(0, 40),
        }))
        : null;
      const rejim = so.rejim === 'qosh' ? 'qosh' : 'almashtir';
      const kutilgan = so.kutilgan_versiya == null ? null : Number(so.kutilgan_versiya);
      yuk = platforma
        ? { p_actor_id: sess.foydalanuvchi_id, p_malumot: toza, p_qatorlar: qatorlar, p_rejim: rejim, p_id: id, p_kutilgan_versiya: kutilgan, p_operation_id: id ? null : operationId }
        : {
          p_kompaniya_id: kompaniyaId, p_malumot: toza, p_qatorlar: qatorlar, p_rejim: rejim,
          p_id: id, p_kutilgan_versiya: kutilgan,
          p_operation_id: id ? null : operationId, p_kim: sess.email || '',
        };

    } else if (amal === 'narx_manba_bekor') {
      const kompaniyaId = Number(so.kompaniya_id);
      const id = Number(so.id);
      if (!Number.isInteger(kompaniyaId) || kompaniyaId <= 0 || !Number.isInteger(id) || id <= 0) {
        return Response.json({ ok: false, error: 'kompaniya_id va id majburiy' });
      }
      yuk = { p_kompaniya_id: kompaniyaId, p_id: id, p_kutilgan_versiya: so.kutilgan_versiya == null ? null : Number(so.kutilgan_versiya), p_kim: sess.email || '' };

    } else if (amal === 'narx_protokol_yarat' || amal === 'narx_protokol_tasdiqla' || amal === 'narx_protokol_bekor') {
      if (!Number.isInteger(sess.foydalanuvchi_id) || (sess.foydalanuvchi_id as number) <= 0) {
        return Response.json({ ok: false, error: 'Sessiya talab qilinadi' }, { status: 401 });
      }
      if (amal === 'narx_protokol_yarat') {
        const obyektId = Number(so.obyekt_id);
        if (!Number.isInteger(obyektId) || obyektId <= 0 || !uuidRe.test(operationId)) {
          return Response.json({ ok: false, error: 'obyekt_id va operation_id (UUID) majburiy' });
        }
        const lines = Array.isArray(so.qatorlar) ? so.qatorlar.slice(0, 5000).map((x: any) => ({
          qator_id: Number(x?.qator_id), yangi_narx: Number(x?.yangi_narx),
          manba_qator_id: x?.manba_qator_id == null ? null : Number(x.manba_qator_id),
          izoh: x?.izoh == null ? null : String(x.izoh).slice(0, 500),
        })) : [];
        // Platform catalogue rows live in R2 (owner rule 2026-10-05): verify cited rows there and pass a snapshot.
        const snap = ctx.env.R2_CANONICAL ? await katalogSnapshotlari(ctx.env.R2_CANONICAL as never, lines.map((x: any) => x.manba_qator_id).filter((x: any) => x != null)).catch(() => new Map()) : new Map();
        for (const x of lines as any[]) if (x.manba_qator_id != null && snap.has(x.manba_qator_id)) x.katalog = snap.get(x.manba_qator_id);
        yuk = { p_actor_id: sess.foydalanuvchi_id, p_obyekt_id: obyektId, p_lines: lines, p_izoh: so.izoh == null ? null : String(so.izoh).slice(0, 1000), p_operation_id: operationId };
      } else if (amal === 'narx_protokol_tasdiqla') {
        const id = Number(so.id); const doc = Number(so.document_id);
        const sana = String(so.kuchga_kirish || '');
        if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(doc) || doc <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(sana)) {
          return Response.json({ ok: false, error: 'id, document_id va kuchga_kirish (YYYY-MM-DD) majburiy' });
        }
        yuk = { p_actor_id: sess.foydalanuvchi_id, p_id: id, p_document_id: doc, p_kuchga_kirish: sana };
      } else {
        const id = Number(so.id);
        if (!Number.isInteger(id) || id <= 0) return Response.json({ ok: false, error: 'id majburiy' });
        yuk = { p_actor_id: sess.foydalanuvchi_id, p_id: id, p_sabab: so.sabab == null ? null : String(so.sabab).slice(0, 300) };
      }

    } else if (amal === 'obyekt_hudud_belgila') {
      const obyektId = Number(so.obyekt_id);
      if (!Number.isInteger(obyektId) || obyektId <= 0 || !Number.isInteger(sess.foydalanuvchi_id)) {
        return Response.json({ ok: false, error: 'obyekt_id va sessiya majburiy' });
      }
      yuk = { p_actor_id: sess.foydalanuvchi_id, p_obyekt_id: obyektId, p_hudud: so.hudud == null || so.hudud === '' ? null : String(so.hudud).slice(0, 40) };

    } else if (amal === 'platforma_narx_manba_bekor') {
      const id = Number(so.id);
      if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(sess.foydalanuvchi_id)) {
        return Response.json({ ok: false, error: 'id va sessiya majburiy' });
      }
      yuk = { p_actor_id: sess.foydalanuvchi_id, p_id: id, p_kutilgan_versiya: so.kutilgan_versiya == null ? null : Number(so.kutilgan_versiya) };

    } else if (amal === 'narx_dalil_bogla' || amal === 'narx_dalil_ochir') {
      const kompaniyaId = Number(so.kompaniya_id);
      const obyektId = Number(so.obyekt_id);
      if (!Number.isInteger(kompaniyaId) || kompaniyaId <= 0 || !Number.isInteger(obyektId) || obyektId <= 0) {
        return Response.json({ ok: false, error: 'kompaniya_id va obyekt_id majburiy' });
      }
      if (amal === 'narx_dalil_bogla') {
        if (!Array.isArray(so.boglar) || !so.boglar.length || so.boglar.length > 5000) {
          return Response.json({ ok: false, error: 'Bog\'lanishlar 1..5000 bo\'lishi shart' });
        }
        yuk = {
          p_kompaniya_id: kompaniyaId, p_obyekt_id: obyektId, p_kim: sess.email || '',
          p_boglar: so.boglar.map((b: any) => ({ qator_id: Number(b?.qator_id), manba_qator_id: Number(b?.manba_qator_id), izoh: b?.izoh == null ? null : String(b.izoh).slice(0, 500) })),
        };
        // Platform catalogue rows live in R2: attach a verified snapshot (company-owned sources stay DB-validated).
        if (ctx.env.R2_CANONICAL) {
          const snap = await katalogSnapshotlari(ctx.env.R2_CANONICAL as never, (yuk.p_boglar as any[]).map((b: any) => b.manba_qator_id)).catch(() => new Map());
          for (const b of yuk.p_boglar as any[]) if (snap.has(b.manba_qator_id)) b.katalog = snap.get(b.manba_qator_id);
        }
      } else {
        const ids = Array.isArray(so.qator_ids) ? so.qator_ids.slice(0, 5000).map(Number).filter((x: number) => Number.isInteger(x) && x > 0) : [];
        yuk = { p_kompaniya_id: kompaniyaId, p_obyekt_id: obyektId, p_qator_ids: ids, p_kim: sess.email || '' };
      }

    /* ══════════ AUDIT LOG ══════════
       ⚠️ Log yozuvi — idempotentlik shart emas (ikkilanib yozilishi
       jiddiy xavf emas, log yo'qolib qolishi yomonroq). */
    } else if (amal === 'audit_yoz') {
      if (!String(so.amal_turi || '').trim() || !String(so.modul || '').trim()) {
        return Response.json({ ok: false, error: 'amal_turi va modul bo\'sh bo\'lishi mumkin emas' });
      }
      yuk = {
        p_kompaniya_id: Number(so.kompaniya_id),
        p_amal_turi: String(so.amal_turi).slice(0, 100),
        p_modul: String(so.modul).slice(0, 100),
        p_obyekt_id: so.obyekt_id == null ? null : Number(so.obyekt_id),
        p_tafsilot: so.tafsilot ? String(so.tafsilot).slice(0, 2000) : null,
        p_kim: sess.email || '',
        p_ip: ctx.request.headers.get('CF-Connecting-IP') || null,
      };

    /* ══════════ OBYEKT HUJJATLARI (loyiha/tasdiqlangan fayllar) ══════════
       ⚠️ 2026-08-27 (Claude): «Arxiv (R2)» avval obyektga UMUMAN
       bog'lanmagan, ro'yxatsiz bitta-fayl-yuklovchi edi. Endi har fayl
       aniq obyektga (`obyekt_id`) va turga (loyiha|hujjat) bog'lanadi. */
    } else if (amal === 'hujjat_yoz') {
      const obyektId = Number(so.obyekt_id);
      if (!Number.isFinite(obyektId) || obyektId <= 0) {
        return Response.json({ ok: false, error: 'obyekt_id noto\'g\'ri' });
      }
      if (!String(so.nom || '').trim() || !String(so.url || '').trim()) {
        return Response.json({ ok: false, error: 'nom va url bo\'sh bo\'lishi mumkin emas' });
      }
      yuk = {
        p_obyekt_id: obyektId,
        p_turi: so.turi === 'loyiha' ? 'loyiha' : 'hujjat',
        p_nom: String(so.nom).slice(0, 300),
        p_url: String(so.url).slice(0, 1000),
        p_izoh: so.izoh ? String(so.izoh).slice(0, 1000) : null,
        p_kim: sess.email || '',
      };

    } else if (amal === 'hujjat_ochir') {
      const id = Number(so.id);
      if (!Number.isFinite(id) || id <= 0) {
        return Response.json({ ok: false, error: 'id noto\'g\'ri' });
      }
      yuk = { p_id: id };

    /* ══════════ MUSTAQIL RESURSLAR (M:N sklad/kadr/texnika) ══════════
       ⚠️ 2026-08-27: "32 gektar ichida 40 obyekt, 1 umumiy sklad"
       arxitekturasi — resurs bitta obyektga qattiq bog'lanmaydi,
       junction jadval orqali bir yoki bir nechta obyektga ulanadi. */
    } else if (amal === 'sklad_mustaqil_yarat') {
      const kompaniyaId = Number(so.kompaniya_id);
      if (!Number.isFinite(kompaniyaId) || kompaniyaId <= 0) {
        return Response.json({ ok: false, error: 'kompaniya_id noto\'g\'ri' });
      }
      if (!String(so.nomi || '').trim()) {
        return Response.json({ ok: false, error: 'nomi bo\'sh bo\'lishi mumkin emas' });
      }
      yuk = {
        p_kompaniya_id: kompaniyaId,
        p_nomi: String(so.nomi).slice(0, 300),
        p_manzil: so.manzil ? String(so.manzil).slice(0, 500) : null,
        p_masul_shaxs: so.masul_shaxs ? String(so.masul_shaxs).slice(0, 200) : null,
      };

    } else if (amal === 'kadr_mustaqil_yarat') {
      const kompaniyaId = Number(so.kompaniya_id);
      if (!Number.isFinite(kompaniyaId) || kompaniyaId <= 0) {
        return Response.json({ ok: false, error: 'kompaniya_id noto\'g\'ri' });
      }
      if (!String(so.ism_sharif || '').trim() || !String(so.lavozim || '').trim()) {
        return Response.json({ ok: false, error: 'ism_sharif va lavozim bo\'sh bo\'lishi mumkin emas' });
      }
      yuk = {
        p_kompaniya_id: kompaniyaId,
        p_ism_sharif: String(so.ism_sharif).slice(0, 200),
        p_lavozim: String(so.lavozim).slice(0, 200),
        p_oylik_maosh: so.oylik_maosh == null ? null : Number(so.oylik_maosh),
        p_valyuta: so.valyuta ? String(so.valyuta).slice(0, 10) : 'UZS',
      };

    } else if (amal === 'texnika_mustaqil_yarat') {
      const kompaniyaId = Number(so.kompaniya_id);
      if (!Number.isFinite(kompaniyaId) || kompaniyaId <= 0) {
        return Response.json({ ok: false, error: 'kompaniya_id noto\'g\'ri' });
      }
      if (!String(so.nomi || '').trim()) {
        return Response.json({ ok: false, error: 'nomi bo\'sh bo\'lishi mumkin emas' });
      }
      yuk = {
        p_kompaniya_id: kompaniyaId,
        p_nomi: String(so.nomi).slice(0, 300),
        p_davlat_raqami: so.davlat_raqami ? String(so.davlat_raqami).slice(0, 50) : null,
        p_yoqilgi_mejori: so.yoqilgi_mejori == null ? null : Number(so.yoqilgi_mejori),
      };

    /* V2 resource commands are the only shared mutation boundary for
       Mindmap and module tabs.  Legacy create RPCs remain reachable for
       old clients while they are migrated. */
    } else if (amal === 'resurs_yarat_v2') {
      const tur = String(so.tur || '');
      if (!['sklad', 'kadr', 'texnika'].includes(tur) || !so.maydonlar || typeof so.maydonlar !== 'object') {
        return Response.json({ ok: false, error: 'resource create parametrlari noto\'g\'ri' });
      }
      yuk = { p_kompaniya_id: Number(so.kompaniya_id), p_actor_id: sess.foydalanuvchi_id,
        p_tur: tur, p_maydonlar: so.maydonlar, p_operation_id: operationId,
        p_actor_label: sess.email || null };

    } else if (amal === 'resurs_yangila_v2') {
      const tur = String(so.tur || ''); const id = Number(so.id);
      if (!['sklad', 'kadr', 'texnika'].includes(tur) || !Number.isInteger(id) || id <= 0 || !so.maydonlar || typeof so.maydonlar !== 'object') {
        return Response.json({ ok: false, error: 'resource update parametrlari noto\'g\'ri' });
      }
      yuk = { p_kompaniya_id: Number(so.kompaniya_id), p_actor_id: sess.foydalanuvchi_id,
        p_tur: tur, p_id: id, p_maydonlar: so.maydonlar,
        p_kutilgan_versiya: Number(so.expected_version), p_operation_id: operationId,
        p_actor_label: sess.email || null };

    } else if (amal === 'resurs_bekor_v2') {
      const tur = String(so.tur || ''); const id = Number(so.id);
      if (!['sklad', 'kadr', 'texnika'].includes(tur) || !Number.isInteger(id) || id <= 0) {
        return Response.json({ ok: false, error: 'resource delete parametrlari noto\'g\'ri' });
      }
      yuk = { p_kompaniya_id: Number(so.kompaniya_id), p_actor_id: sess.foydalanuvchi_id,
        p_tur: tur, p_id: id, p_kutilgan_versiya: Number(so.expected_version),
        p_operation_id: operationId, p_actor_label: sess.email || null };

    } else if (amal === 'resurs_bog_saqla' || amal === 'resurs_bog_ochir') {
      const TUR_RUXSAT = ['sklad', 'kadr', 'texnika'];
      const tur = String(so.tur || '');
      const resursId = Number(so.resurs_id);
      const obyektId = Number(so.obyekt_id);
      if (!TUR_RUXSAT.includes(tur)) {
        return Response.json({ ok: false, error: 'noma\'lum tur: ' + tur });
      }
      if (!Number.isFinite(resursId) || resursId <= 0 || !Number.isFinite(obyektId) || obyektId <= 0) {
        return Response.json({ ok: false, error: 'resurs_id yoki obyekt_id noto\'g\'ri' });
      }
      yuk = { p_tur: tur, p_resurs_id: resursId, p_obyekt_id: obyektId };

    /* ══════════ LOYIHA (Kompaniya→Loyiha→Obyekt) ══════════ */
    } else if (amal === 'loyiha_yarat') {
      if (!Number.isSafeInteger(sess.foydalanuvchi_id) || (sess.foydalanuvchi_id as number) <= 0) return Response.json({ ok: false, error: 'Sessiya talab qilinadi.' }, { status: 401 });
            const kompaniyaId = Number(so.kompaniya_id);
      if (!Number.isFinite(kompaniyaId) || kompaniyaId <= 0) {
        return Response.json({ ok: false, error: 'kompaniya_id noto\'g\'ri' });
      }
      if (!String(so.nom || '').trim()) {
        return Response.json({ ok: false, error: 'nom bo\'sh bo\'lishi mumkin emas' });
      }
      yuk = {
        p_actor_id: sess.foydalanuvchi_id,
        p_kompaniya_id: kompaniyaId,
        p_nom: String(so.nom).slice(0, 300),
        p_izoh: so.izoh ? String(so.izoh).slice(0, 1000) : null,
        p_hudud: so.hudud ? String(so.hudud).slice(0, 200) : null,
        /* ⚠️ byudjet: 0 va "belgilanmagan" FARQLI. `undefined`/`null` →
           NULL bo'lib qoladi, 0 esa haqiqiy nol byudjet sifatida saqlanadi. */
        p_byudjet: so.byudjet == null || so.byudjet === '' ? null : Number(so.byudjet),
      };

    } else if (amal === 'loyiha_yangila') {
      if (!Number.isSafeInteger(sess.foydalanuvchi_id) || (sess.foydalanuvchi_id as number) <= 0) return Response.json({ ok: false, error: 'Sessiya talab qilinadi.' }, { status: 401 });
            const id = Number(so.id);
      const kutilganVersiya = Number(so.kutilgan_versiya);
      if (!Number.isFinite(id) || id <= 0) {
        return Response.json({ ok: false, error: 'id noto\'g\'ri' });
      }
      if (!Number.isFinite(kutilganVersiya)) {
        return Response.json({ ok: false, error: 'kutilgan_versiya kerak (optimistik qulf)' });
      }
      const HOLAT_RUXSAT = ['faol', 'tuxtatilgan', 'yakunlangan', 'bekor'];
      if (so.holat != null && !HOLAT_RUXSAT.includes(String(so.holat))) {
        return Response.json({ ok: false, error: 'holat noto\'g\'ri: ' + HOLAT_RUXSAT.join('|') });
      }
      yuk = {
        p_actor_id: sess.foydalanuvchi_id,
        p_id: id,
        p_kutilgan_versiya: kutilganVersiya,
        p_nom: so.nom ? String(so.nom).slice(0, 300) : null,
        p_izoh: so.izoh != null ? String(so.izoh).slice(0, 1000) : null,
        p_hudud: so.hudud != null ? String(so.hudud).slice(0, 200) : null,
        p_byudjet: so.byudjet == null || so.byudjet === '' ? null : Number(so.byudjet),
        p_holat: so.holat ? String(so.holat) : null,
      };

    } else if (amal === 'loyiha_ochir') {
      if (!Number.isSafeInteger(sess.foydalanuvchi_id) || (sess.foydalanuvchi_id as number) <= 0) return Response.json({ ok: false, error: 'Sessiya talab qilinadi.' }, { status: 401 });
            const id = Number(so.id);
      if (!Number.isFinite(id) || id <= 0) {
        return Response.json({ ok: false, error: 'id noto\'g\'ri' });
      }
      yuk = { p_actor_id: sess.foydalanuvchi_id, p_id: id };

    } else if (amal === 'obyekt_loyihaga_biriktir') {
      const obyektId = Number(so.obyekt_id);
      const loyihaId = so.loyiha_id == null ? null : Number(so.loyiha_id);
      if (!Number.isFinite(obyektId) || obyektId <= 0) {
        return Response.json({ ok: false, error: 'obyekt_id noto\'g\'ri' });
      }
      yuk = { p_obyekt_id: obyektId, p_loyiha_id: loyihaId };

    /* T2-PTO-OWNER-CRITICAL-CLOSURE P0-1: production obyekt yaratish, Drive
       storage-provisioning zanjiridan (t2_object_create_v1) mustaqil --
       o'sha zanjir hech qanday Function chaqiruvchisiga ega emas va
       real Drive papka bog'lanishisiz OBJECT_STORAGE_NOT_PROVISIONED
       qaytaradi (supabase/migrations/20261011090000_t2_obyekt_yarat_v1.sql
       header'ida sabab tafsilotlari). */
    } else if (amal === 'obyekt_yarat') {
      const kompaniyaId = Number(so.kompaniya_id);
      if (!Number.isFinite(kompaniyaId) || kompaniyaId <= 0) {
        return Response.json({ ok: false, error: 'kompaniya_id noto\'g\'ri' });
      }
      if (!String(so.nom || '').trim()) {
        return Response.json({ ok: false, error: 'nom bo\'sh bo\'lishi mumkin emas' });
      }
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      yuk = {
        p_kompaniya_id: kompaniyaId,
        p_actor_id: sess.foydalanuvchi_id,
        p_loyiha_id: so.loyiha_id == null || so.loyiha_id === '' ? null : Number(so.loyiha_id),
        p_nom: String(so.nom).trim().slice(0, 300),
        p_operation_id: UUID_RE.test(String(so.operation_id || '')) ? so.operation_id : crypto.randomUUID(),
      };

    /* T2-PTO-OWNER-CRITICAL-CLOSURE: resurs kategoriya (ЧЕЛ/МАШ/МАТ/ОБ/М/К/КАБ/БЕЗСКЛАД)
       registri -- T1 GAS'ning "NARXLAR" registri (10_Engine.js _narxlarKatMap)
       bilan bir xil mexanizm: bir marta tasdiqlangan nom+birlik keyingi
       importlarda avtomatik eslab qolinadi. */
    } else if (amal === 'resurs_kategoriya_belgila') {
      const kompaniyaId = Number(so.kompaniya_id);
      if (!Number.isFinite(kompaniyaId) || kompaniyaId <= 0) {
        return Response.json({ ok: false, error: 'kompaniya_id noto\'g\'ri' });
      }
      const KAT_RUXSAT = ['ЧЕЛ', 'МАШ', 'МАТ', 'ОБ', 'М/К', 'КАБ', 'БЕЗСКЛАД'];
      if (!KAT_RUXSAT.includes(String(so.kategoriya))) {
        return Response.json({ ok: false, error: 'kategoriya noto\'g\'ri: ' + KAT_RUXSAT.join('|') });
      }
      if (!String(so.nom || '').trim() || !String(so.birlik || '').trim()) {
        return Response.json({ ok: false, error: 'nom va birlik majburiy' });
      }
      const UUID_RE2 = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      yuk = {
        p_kompaniya_id: kompaniyaId,
        p_actor_id: sess.foydalanuvchi_id,
        p_nom: String(so.nom).trim().slice(0, 300),
        p_birlik: String(so.birlik).trim().slice(0, 50),
        p_kategoriya: String(so.kategoriya),
        p_operation_id: UUID_RE2.test(String(so.operation_id || '')) ? so.operation_id : crypto.randomUUID(),
      };

    /* T1->T2 PTO gap-close: NAKRUTKA (markup/overhead cascade) koeffitsienti
       saqlash. T1 GAS'ning apiNakrutkaSaqla (Smeta tizimi/80_Shartnoma.js)
       porti -- supabase/migrations/20261014090000_t2_nakrutka_v1.sql.
       shartnoma_id null bo'lsa -- kompaniya standart koeffitsienti, aks
       holda faqat o'sha shartnomaga tegishli override. */
    } else if (amal === 'nakrutka_koef_saqla') {
      const kompaniyaId = Number(so.kompaniya_id);
      if (!Number.isFinite(kompaniyaId) || kompaniyaId <= 0) {
        return Response.json({ ok: false, error: 'kompaniya_id noto\'g\'ri' });
      }
      const KOEF_RUXSAT = [
        'ЗТР_СОЦСТРАХ', 'ТРАНСПОРТ_МАТЕРИАЛ', 'СКЛАДСКИЕ_МАТЕРИАЛ', 'СКЛАДСКИЕ_МК',
        'ТРАНСПОРТ_КАБЕЛЬ', 'ПРОЧИЕ_ПОДРЯДЧИК', 'ТРАНСПОРТ_ОБОРУД', 'ЗАГОТ_СКЛАД_ОБОРУД',
        'СТРАХОВАНИЕ', 'РИСК', 'НДС',
      ];
      if (!KOEF_RUXSAT.includes(String(so.koef_kod))) {
        return Response.json({ ok: false, error: 'koef_kod noto\'g\'ri: ' + KOEF_RUXSAT.join('|') });
      }
      const qiymat = Number(so.qiymat);
      if (!Number.isFinite(qiymat)) {
        return Response.json({ ok: false, error: 'qiymat noto\'g\'ri' });
      }
      const shartnomaId = so.shartnoma_id == null || so.shartnoma_id === '' ? null : Number(so.shartnoma_id);
      if (shartnomaId != null && (!Number.isFinite(shartnomaId) || shartnomaId <= 0)) {
        return Response.json({ ok: false, error: 'shartnoma_id noto\'g\'ri' });
      }
      const UUID_RE3 = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      yuk = {
        p_kompaniya_id: kompaniyaId,
        p_actor_id: sess.foydalanuvchi_id,
        p_shartnoma_id: shartnomaId,
        p_koef_kod: String(so.koef_kod),
        p_qiymat: qiymat,
        p_operation_id: UUID_RE3.test(String(so.operation_id || '')) ? so.operation_id : crypto.randomUUID(),
      };

    /* «Bajarilmadi» qoplamasi (egasi 2026-10-24): asl smeta qatoriga TEGMAYDI; sabab, dalil hujjat, sana alohida jadvalda. */
    } else if (amal === 'bajarilmadi_belgila') {
      const kompaniyaId = Number(so.kompaniya_id);
      const obyektId = Number(so.obyekt_id);
      if (![kompaniyaId, obyektId].every((n) => Number.isInteger(n) && n > 0)) {
        return Response.json({ ok: false, error: 'kompaniya_id yoki obyekt_id noto\'g\'ri' });
      }
      if (!Array.isArray(so.qatorlar) || so.qatorlar.length === 0 || so.qatorlar.length > 2000) {
        return Response.json({ ok: false, error: 'qatorlar 1..2000 ta bo\'lishi kerak' });
      }
      const SABAB_RUXSAT = ['buyurtmachi_chiqardi', 'loyiha_ozgardi', 'boshqa_pudratchi', 'texnik_sabab', 'zamena', 'material_yoq', 'boshqa'];
      if (!SABAB_RUXSAT.includes(String(so.sabab_kod))) {
        return Response.json({ ok: false, error: 'sabab_kod noto\'g\'ri: ' + SABAB_RUXSAT.join('|') });
      }
      const sana = so.sana ? String(so.sana) : null;
      if (sana && !/^\d{4}-\d{2}-\d{2}$/.test(sana)) {
        return Response.json({ ok: false, error: 'sana YYYY-MM-DD shaklida bo\'lishi kerak' });
      }
      const idYoki = (v: unknown) => (v == null || v === '' ? null : Number(v));
      const hujjatId = idYoki(so.hujjat_id); const zamenaId = idYoki(so.zamena_qator_id);
      if ((hujjatId != null && !(Number.isInteger(hujjatId) && hujjatId > 0)) || (zamenaId != null && !(Number.isInteger(zamenaId) && zamenaId > 0))) {
        return Response.json({ ok: false, error: 'hujjat_id yoki zamena_qator_id noto\'g\'ri' });
      }
      const UUID_RE4 = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!UUID_RE4.test(String(so.operation_id || ''))) {
        return Response.json({ ok: false, error: 'operation_id UUID bo\'lishi kerak' });
      }
      yuk = {
        p_kompaniya_id: kompaniyaId, p_actor_id: sess.foydalanuvchi_id, p_obyekt_id: obyektId,
        p_qatorlar: so.qatorlar, p_sabab_kod: String(so.sabab_kod),
        p_sabab_izoh: so.sabab_izoh ? String(so.sabab_izoh).slice(0, 1000) : null,
        p_hujjat_id: hujjatId, p_sana: sana, p_zamena_qator_id: zamenaId, p_operation_id: String(so.operation_id),
      };

    } else if (amal === 'xarajat_kirit_v1') {
      const kompaniyaId = Number(so.kompaniya_id);
      const idYoki = (v: unknown) => (v == null || v === '' ? null : Number(v));
      const obyektId = idYoki(so.obyekt_id); const shartnomaId = idYoki(so.shartnoma_id);
      const summa = Number(so.summa);
      if (!Number.isInteger(kompaniyaId) || kompaniyaId <= 0
        || (obyektId != null && !(Number.isInteger(obyektId) && obyektId > 0)) || (shartnomaId != null && !(Number.isInteger(shartnomaId) && shartnomaId > 0))) {
        return Response.json({ ok: false, error: 'kompaniya_id, obyekt_id yoki shartnoma_id noto\'g\'ri' });
      }
      if (!Number.isFinite(summa) || summa === 0 || Math.abs(summa) > 1e13) return Response.json({ ok: false, error: 'summa noto\'g\'ri' });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(so.sana || ''))) return Response.json({ ok: false, error: 'sana YYYY-MM-DD shaklida bo\'lishi kerak' });
      if (!['ЧЕЛ', 'МАШ', 'МАТ', 'ОБ', 'SUB', 'OTK'].includes(String(so.kat))) return Response.json({ ok: false, error: 'kat noto\'g\'ri' });
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(so.operation_id || ''))) {
        return Response.json({ ok: false, error: 'operation_id UUID bo\'lishi kerak' });
      }
      yuk = {
        p_kompaniya_id: kompaniyaId, p_actor_id: sess.foydalanuvchi_id, p_obyekt_id: obyektId, p_shartnoma_id: shartnomaId,
        p_sana: String(so.sana), p_kat: String(so.kat), p_summa: summa,
        p_hujjat_ref: so.hujjat_ref ? String(so.hujjat_ref).slice(0, 300) : null, p_izoh: so.izoh ? String(so.izoh).slice(0, 1000) : null,
        p_operation_id: String(so.operation_id),
      };

    } else if (amal === 'moliya_qolda_yoz_v1') {
      const kompaniyaId = Number(so.kompaniya_id);
      const obyektId = so.obyekt_id == null || so.obyekt_id === '' ? null : Number(so.obyekt_id);
      const qiymat = so.qiymat == null || so.qiymat === '' ? null : Number(so.qiymat);
      if (!Number.isInteger(kompaniyaId) || kompaniyaId <= 0 || (obyektId != null && !(Number.isInteger(obyektId) && obyektId > 0))) {
        return Response.json({ ok: false, error: 'kompaniya_id yoki obyekt_id noto\'g\'ri' });
      }
      if (!['fakt', 'f2', 'f2_kutilgan', 'tushgan', 'sarf', 'qarz', 'yakunlash_talab', 'qmi'].includes(String(so.kod))) return Response.json({ ok: false, error: 'kod noto\'g\'ri' });
      if (qiymat != null && (!Number.isFinite(qiymat) || Math.abs(qiymat) > 1e15)) return Response.json({ ok: false, error: 'qiymat noto\'g\'ri' });
      if (so.sana != null && so.sana !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(String(so.sana))) return Response.json({ ok: false, error: 'sana YYYY-MM-DD shaklida bo\'lishi kerak' });
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(so.operation_id || ''))) {
        return Response.json({ ok: false, error: 'operation_id UUID bo\'lishi kerak' });
      }
      yuk = {
        p_kompaniya_id: kompaniyaId, p_actor_id: sess.foydalanuvchi_id, p_obyekt_id: obyektId, p_kod: String(so.kod),
        p_qiymat: qiymat, p_sana: so.sana ? String(so.sana) : null, p_izoh: so.izoh ? String(so.izoh).slice(0, 1000) : null,
        p_operation_id: String(so.operation_id),
      };

    } else if (amal === 'xarajat_bekor_v1') {
      const kompaniyaId = Number(so.kompaniya_id);
      const id = Number(so.id);
      if (![kompaniyaId, id].every((n) => Number.isInteger(n) && n > 0)) {
        return Response.json({ ok: false, error: 'kompaniya_id yoki id noto\'g\'ri' });
      }
      yuk = { p_kompaniya_id: kompaniyaId, p_actor_id: sess.foydalanuvchi_id, p_xarajat_id: id,
        p_kutilgan_versiya: so.versiya == null ? null : Number(so.versiya) };
    } else if (amal.startsWith('transport_')) {
      /* TRANSPORT v1: bitta umumiy shakl. ID lar `data` ichida — egalik (kompaniya) RPC ichida tekshiriladi. */
      const kompaniyaId = Number(so.kompaniya_id);
      if (!Number.isInteger(kompaniyaId) || kompaniyaId <= 0) return Response.json({ ok: false, error: 'kompaniya_id noto\'g\'ri' });
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(so.operation_id || ''))) {
        return Response.json({ ok: false, error: 'operation_id UUID bo\'lishi kerak' });
      }
      const data = (so as { data?: unknown }).data;
      if (!data || typeof data !== 'object' || Array.isArray(data)) return Response.json({ ok: false, error: 'data obyekt bo\'lishi kerak' });
      if (JSON.stringify(data).length > 200_000) return Response.json({ ok: false, error: 'data juda katta' });
      yuk = { p_kompaniya_id: kompaniyaId, p_actor_id: sess.foydalanuvchi_id, p_operation_id: String(so.operation_id), p_data: data };
    } else if (amal === 'bajarilmadi_bekor') {
      const kompaniyaId = Number(so.kompaniya_id);
      const id = Number(so.id);
      if (![kompaniyaId, id].every((n) => Number.isInteger(n) && n > 0)) {
        return Response.json({ ok: false, error: 'kompaniya_id yoki id noto\'g\'ri' });
      }
      const UUID_RE5 = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!UUID_RE5.test(String(so.operation_id || ''))) {
        return Response.json({ ok: false, error: 'operation_id UUID bo\'lishi kerak' });
      }
      /* Egalik: yozuv shu kompaniyaniki ekani RPC ichida (kompaniya_id sharti) tekshiriladi; p_id shlyuz egalik jadvaliga kirmaydi. */
      yuk = { p_kompaniya_id: kompaniyaId, p_actor_id: sess.foydalanuvchi_id, p_id: id,
        p_sabab: so.sabab ? String(so.sabab).slice(0, 500) : null, p_operation_id: String(so.operation_id) };

    /* Smeta versiyasi / farq / da'vo (PTO-CORE-001): faqat qoplama jadvallar; egalik (versiya → kompaniya, qator → obyekt)
       RPC ichida tekshiriladi (`p_versiya_id` shlyuz egalik jadvaliga kirmaydi — xuddi bajarilmadi_bekor kabi). */
    } else if (amal.startsWith('smeta_versiya_')) {
      const kompaniyaId = Number(so.kompaniya_id);
      if (!Number.isInteger(kompaniyaId) || kompaniyaId <= 0) return Response.json({ ok: false, error: 'kompaniya_id noto\'g\'ri' });
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(so.operation_id || ''))) {
        return Response.json({ ok: false, error: 'operation_id UUID bo\'lishi kerak' });
      }
      const asos = { p_kompaniya_id: kompaniyaId, p_actor_id: sess.foydalanuvchi_id, p_operation_id: String(so.operation_id) };
      const musbatId = (v: unknown) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };
      if (amal === 'smeta_versiya_yarat_v1') {
        const obyektId = musbatId(so.obyekt_id);
        if (!obyektId) return Response.json({ ok: false, error: 'obyekt_id noto\'g\'ri' });
        const sana = so.manba_sana ? String(so.manba_sana) : null;
        if (sana && !/^\d{4}-\d{2}-\d{2}$/.test(sana)) return Response.json({ ok: false, error: 'manba_sana YYYY-MM-DD shaklida bo\'lishi kerak' });
        const fayllar = Array.isArray(so.manba_fayllar) ? so.manba_fayllar.slice(0, 200).map((f: { nom?: unknown; hajm?: unknown }) => ({
          nom: String(f?.nom ?? '').slice(0, 300), hajm: Number.isFinite(Number(f?.hajm)) ? Number(f?.hajm) : null })) : [];
        yuk = { ...asos, p_obyekt_id: obyektId, p_nom: String(so.nom ?? '').slice(0, 300), p_tur: String(so.tur ?? ''),
          p_manba_sana: sana, p_manba_fayllar: fayllar, p_izoh: so.izoh ? String(so.izoh).slice(0, 2000) : null };
      } else {
        const versiyaId = musbatId(so.versiya_id);
        if (!versiyaId) return Response.json({ ok: false, error: 'versiya_id noto\'g\'ri' });
        if (amal === 'smeta_versiya_pozitsiya_yoz_v1') {
          if (!Array.isArray(so.pozitsiyalar) || !so.pozitsiyalar.length || so.pozitsiyalar.length > 1000) return Response.json({ ok: false, error: 'pozitsiyalar 1..1000 ta bo\'lishi kerak' });
          yuk = { ...asos, p_versiya_id: versiyaId, p_pozitsiyalar: so.pozitsiyalar };
        } else if (amal === 'smeta_versiya_moslik_yoz_v1') {
          if (so.mosliklar != null && (!Array.isArray(so.mosliklar) || so.mosliklar.length > 2000)) return Response.json({ ok: false, error: 'mosliklar 0..2000 ta bo\'lishi kerak' });
          yuk = { ...asos, p_versiya_id: versiyaId, p_mosliklar: so.mosliklar ?? [], p_yakunla: so.yakunla === true };
        } else if (amal === 'smeta_versiya_qaror_v1') {
          if (!Array.isArray(so.qarorlar) || !so.qarorlar.length || so.qarorlar.length > 2000) return Response.json({ ok: false, error: 'qarorlar 1..2000 ta bo\'lishi kerak' });
          yuk = { ...asos, p_versiya_id: versiyaId, p_qarorlar: so.qarorlar };
        } else {
          yuk = { ...asos, p_versiya_id: versiyaId, p_sabab: so.sabab ? String(so.sabab).slice(0, 1000) : null };
        }
      }

    /* Shartnoma qamrovi: canonical t2_qator satrini o'chirmasdan,
       faqat shu shartnoma hisobidan kiritish/chiqarish qarorini saqlaydi. */
    } else if (amal === 'shartnoma_qamrov_saqla') {
      const kompaniyaId = Number(so.kompaniya_id);
      const shartnomaId = Number(so.shartnoma_id);
      const obyektId = Number(so.obyekt_id);
      const qatorId = Number(so.qator_id);
      const expectedVersion = Number(so.kutilgan_versiya);
      if (![kompaniyaId, shartnomaId, obyektId, qatorId].every(n => Number.isInteger(n) && n > 0)) {
        return Response.json({ ok: false, error: 'kompaniya/shartnoma/obyekt/qator ID noto\'g\'ri' });
      }
      if (!['kiritilgan', 'chiqarilgan'].includes(String(so.holat))) {
        return Response.json({ ok: false, error: 'qamrov holati noto\'g\'ri' });
      }
      if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
        return Response.json({ ok: false, error: 'kutilgan_versiya majburiy' });
      }
      const hajmOverride = so.hajm_override == null || so.hajm_override === '' ? null : Number(so.hajm_override);
      if (hajmOverride != null && (!Number.isFinite(hajmOverride) || hajmOverride < 0)) {
        return Response.json({ ok: false, error: 'hajm_override noto\'g\'ri' });
      }
      const sabab = String(so.sabab || '').trim();
      if (!sabab || sabab.length > 500) {
        return Response.json({ ok: false, error: 'sabab majburiy' });
      }
      const dalil = so.dalil_hujjat_id == null || so.dalil_hujjat_id === '' ? null : Number(so.dalil_hujjat_id);
      if (dalil != null && (!Number.isInteger(dalil) || dalil <= 0)) {
        return Response.json({ ok: false, error: 'dalil_hujjat_id noto\'g\'ri' });
      }
      yuk = {
        p_kompaniya_id: kompaniyaId,
        p_actor_id: sess.foydalanuvchi_id,
        p_shartnoma_id: shartnomaId,
        p_obyekt_id: obyektId,
        p_qator_id: qatorId,
        p_holat: String(so.holat),
        p_hajm_override: hajmOverride,
        p_sabab: sabab,
        p_dalil_hujjat_id: dalil,
        p_operation_id: uuidRe.test(String(so.operation_id || '')) ? so.operation_id : crypto.randomUUID(),
        p_kutilgan_versiya: expectedVersion,
      };

    /* ⚠️ Polimorfik tashkilot bog'lanishi (MASTER_REJA band 1): taraf
       kompaniya_id YOKI kontragent_id — ANIQ BITTASI, ikkalasi ham yoki
       hech biri emas. RPC ham CHECK bilan tekshiradi, bu ikkinchi
       qatlam (frontend soxta ikkalasini ham yuborsa ham ushlanadi). */
    } else if (amal === 'loyiha_qatnashchi_biriktir') {
      const loyihaId = Number(so.loyiha_id);
      if (!Number.isFinite(loyihaId) || loyihaId <= 0) {
        return Response.json({ ok: false, error: 'loyiha_id noto\'g\'ri' });
      }
      /* V2 contract separates tenant from the party company.  The old
         adapter overloaded kompaniya_id for both, which made an external
         kontragent link lose its tenant context. */
      const tenantId = so.tenant_id == null ? (so.kompaniya_id == null ? null : Number(so.kompaniya_id)) : Number(so.tenant_id);
      const tarafKompaniyaId = so.taraf_kompaniya_id == null ? null : Number(so.taraf_kompaniya_id);
      const kontragentId = so.kontragent_id == null ? null : Number(so.kontragent_id);
      if (tenantId == null || !Number.isInteger(tenantId) || tenantId <= 0 || !Array.isArray(sess.kompaniyalar) ||
          !sess.kompaniyalar.some((a) => a.kompaniya_id === tenantId)) {
        return Response.json({ ok: false, error: 'tenant_id sessiya kompaniyasiga mos emas' }, { status: 403 });
      }
      const bittaTaraf = (tarafKompaniyaId != null) !== (kontragentId != null);
      if (!bittaTaraf) {
        return Response.json({ ok: false, error: 'Aynan bittasi kerak: taraf_kompaniya_id YOKI kontragent_id' });
      }
      const ROL_RUXSAT = ['zakazchik', 'bosh_pudratchi', 'subpudratchi', 'loyihachi', 'taminotchi'];
      if (!ROL_RUXSAT.includes(String(so.rol))) {
        return Response.json({ ok: false, error: 'rol noto\'g\'ri: ' + ROL_RUXSAT.join('|') });
      }
      const expectedVersion = Number(so.expected_version ?? so.kutilgan_versiya);
      if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
        return Response.json({ ok: false, error: 'expected_version (loyiha versiyasi) majburiy' });
      }
      if (!uuidRe.test(operationId)) {
        return Response.json({ ok: false, error: 'operation_id UUID bo\'lishi shart' });
      }
      yuk = {
        p_kompaniya_id: tenantId,
        p_actor_id: sess.foydalanuvchi_id,
        p_loyiha_id: loyihaId,
        p_taraf_kompaniya_id: tarafKompaniyaId,
        p_kontragent_id: kontragentId,
        p_rol: String(so.rol),
        p_kutilgan_versiya: expectedVersion,
        p_operation_id: operationId,
        p_izoh: so.izoh ? String(so.izoh).slice(0, 500) : null,
        p_actor_label: sess.email || null,
      };

    } else if (amal === 'loyiha_qatnashchi_ochir') {
      const id = Number(so.id);
      const tenantId = so.tenant_id == null ? (so.kompaniya_id == null ? null : Number(so.kompaniya_id)) : Number(so.tenant_id);
      const kutilganVersiya = Number(so.expected_version ?? so.kutilgan_versiya);
      if (!Number.isFinite(id) || id <= 0) {
        return Response.json({ ok: false, error: 'id noto\'g\'ri' });
      }
      if (tenantId == null || !Number.isInteger(tenantId) || tenantId <= 0 || !Array.isArray(sess.kompaniyalar) ||
          !sess.kompaniyalar.some((a) => a.kompaniya_id === tenantId)) {
        return Response.json({ ok: false, error: 'tenant_id sessiya kompaniyasiga mos emas' }, { status: 403 });
      }
      if (!Number.isInteger(kutilganVersiya) || kutilganVersiya < 1) {
        return Response.json({ ok: false, error: 'kutilgan_versiya kerak (optimistik qulf)' });
      }
      if (!uuidRe.test(operationId)) {
        return Response.json({ ok: false, error: 'operation_id UUID bo\'lishi shart' });
      }
      yuk = {
        p_kompaniya_id: tenantId,
        p_actor_id: sess.foydalanuvchi_id,
        p_id: id,
        p_kutilgan_versiya: kutilganVersiya,
        p_operation_id: operationId,
        p_actor_label: sess.email || null,
      };

    /* ══════════ KONTRAGENTLAR (B2B Reestr) ══════════
       ⚠️ STIR/INN validatsiyasi shu yerda ham (RPC ichida ham bor,
       ikki qatlamli himoya — frontend soxta 9 xonali son yuborishi
       mumkin bo'lsa ham, format xato bo'lsa RAD etiladi). */
    } else if (amal === 'kontragent_saqla') {
      const kompaniyaId = Number(so.kompaniya_id);
      if (!Number.isFinite(kompaniyaId) || kompaniyaId <= 0) {
        return Response.json({ ok: false, error: 'kompaniya_id noto\'g\'ri' });
      }
      if (!String(so.nom || '').trim()) {
        return Response.json({ ok: false, error: 'nom bo\'sh bo\'lishi mumkin emas' });
      }
      const inn = so.inn ? String(so.inn).trim() : null;
      if (inn && !/^[0-9]{9}$/.test(inn)) {
        return Response.json({ ok: false, error: 'STIR (INN) 9 ta raqamdan iborat bo\'lishi shart' });
      }
      const MAVQE_RUXSAT = ['buyurtmachi', 'pudratchi', 'subpudratchi', 'loyihachi', 'taminotchi', 'laboratoriya'];
      const mavqe = so.mavqe && MAVQE_RUXSAT.includes(String(so.mavqe)) ? String(so.mavqe) : null;
      yuk = {
        p_kompaniya_id: kompaniyaId,
        p_inn: inn,
        p_nom: String(so.nom).slice(0, 300),
        p_rahbar: so.rahbar ? String(so.rahbar).slice(0, 200) : null,
        p_manzil: so.manzil ? String(so.manzil).slice(0, 500) : null,
        p_mfo: so.mfo ? String(so.mfo).slice(0, 20) : null,
        p_hisob_raqam: so.hisob_raqam ? String(so.hisob_raqam).slice(0, 40) : null,
        p_qqs_tolovchi: so.qqs_tolovchi == null ? null : Boolean(so.qqs_tolovchi),
        p_mavqe: mavqe,
      };

    } else if (amal === 'kontragent_ochir') {
      const id = Number(so.id);
      if (!Number.isFinite(id) || id <= 0) {
        return Response.json({ ok: false, error: 'id noto\'g\'ri' });
      }
      yuk = { p_id: id };

    /* ══════════ KOMPANIYA (o'z tashkilot profili) ══════════
       ⚠️ 2026-08-28: bu blok bir marta yozilgan, keyingi merge'da
       yo'qolib qolgan edi — tiklandi (yuqoridagi izohga qarang).
       ⚠️ P0 SECURITY (2026-09-03): bu yerda `id` (target kompaniya)
       chaqiruvchining sessiyadagi a'zoligiga qarshi HECH tekshirilmasdi
       — har qanday tizimga kirgan foydalanuvchi istalgan kompaniyaning
       nomi/STIR/bank rekvizitlarini o'zgartira olardi. Endi: chaqiruvchi
       shu kompaniyaning faol boss/superadmin a'zosi bo'lishi shart
       (bazadagi t2_kompaniya_yangila o'zi ham endi anon/authenticated'dan
       revoke qilingan — bu ikkinchi, mustaqil qatlam). */
    } else if (amal === 'kompaniya_yangila') {
      const id = Number(so.id);
      if (!Number.isFinite(id) || id <= 0) {
        return Response.json({ ok: false, error: 'id noto\'g\'ri' });
      }
      if (!Array.isArray(sess.kompaniyalar) ||
          !sess.kompaniyalar.some((a) => a.kompaniya_id === id && (a.rol === 'boss' || a.rol === 'superadmin'))) {
        return Response.json({ ok: false, error: 'Bu kompaniyani faqat uning direktori (boss) tahrirlashi mumkin' },
          { status: 403 });
      }
      if (so.kutilgan_versiya == null) {
        return Response.json({ ok: false, error: 'kutilgan_versiya majburiy' });
      }
      const MAVQE_RUXSAT3 = ['zakazchik', 'pudratchi', 'loyihachi'];
      const mavqe3 = so.mavqe && MAVQE_RUXSAT3.includes(String(so.mavqe)) ? String(so.mavqe) : null;
      yuk = {
        p_id: id, p_kutilgan_versiya: Number(so.kutilgan_versiya),
        p_toliq_nom: so.toliq_nom != null ? String(so.toliq_nom).slice(0, 300) : null,
        p_inn: so.inn != null ? String(so.inn).slice(0, 20) : null,
        p_manzil: so.manzil != null ? String(so.manzil).slice(0, 500) : null,
        p_rahbar: so.rahbar != null ? String(so.rahbar).slice(0, 200) : null,
        p_telefon: so.telefon != null ? String(so.telefon).slice(0, 40) : null,
        p_bank: so.bank != null ? String(so.bank).slice(0, 200) : null,
        p_hisob_raqam: so.hisob_raqam != null ? String(so.hisob_raqam).slice(0, 40) : null,
        p_mfo: so.mfo != null ? String(so.mfo).slice(0, 20) : null,
        p_mavqe: mavqe3,
        p_oked: so.oked != null ? String(so.oked).slice(0, 30) : null,
      };

    /* ══════════ MATERIAL ALIASLARI (AI semantik qidiruv) ══════════ */
    } else if (amal === 'material_alias_yoz') {
      if (!String(so.alias_nom || '').trim() || !String(so.kanonik_nom_key || '').trim()) {
        return Response.json({ ok: false, error: 'alias_nom va kanonik_nom_key bo\'sh bo\'lishi mumkin emas' });
      }
      yuk = {
        p_alias_nom: String(so.alias_nom).slice(0, 300),
        p_kanonik_nom_key: String(so.kanonik_nom_key).slice(0, 300),
        p_kanonik_birlik_key: so.kanonik_birlik_key ? String(so.kanonik_birlik_key).slice(0, 50) : null,
        p_kompaniya_id: so.kompaniya_id == null ? null : Number(so.kompaniya_id),
      };

    } else if (amal === 'material_alias_ochir') {
      const id = Number(so.id);
      if (!Number.isFinite(id) || id <= 0) {
        return Response.json({ ok: false, error: 'id noto\'g\'ri' });
      }
      yuk = { p_id: id };

    /* ══════════ MINDMAP — CHIZIQ TORTIB BOG'LASH ══════════
       Foydalanuvchi: "bog'lanishlar chiziqlar bilan tortib
       birlashtirilishi kerak". Bog'lanish turi QAT'IY oq ro'yxatdan —
       RPC ichida ham qayta tekshiriladi (ikki qatlamli himoya). */
    } else if (amal === 'mindmap_bog' || amal === 'mindmap_bog_ochir') {
      const BOG_TURLARI = ['obyekt_loyiha', 'shartnoma_loyiha', 'shartnoma_obyekt',
                           'sklad_obyekt', 'texnika_obyekt', 'kadr_obyekt', 'qatnashchi'];
      const tur = String(so.tur || '');
      const manbaId = Number(so.manba_id);
      const maqsadId = Number(so.maqsad_id);
      if (!BOG_TURLARI.includes(tur)) {
        return Response.json({ ok: false, error: 'noma\'lum bog\'lanish turi: ' + tur });
      }
      if (!Number.isFinite(manbaId) || manbaId <= 0 || !Number.isFinite(maqsadId) || maqsadId <= 0) {
        return Response.json({ ok: false, error: 'manba_id yoki maqsad_id noto\'g\'ri' });
      }
      const ROLLAR = ['zakazchik', 'bosh_pudratchi', 'subpudratchi', 'loyihachi', 'taminotchi'];
      if (amal === 'mindmap_bog') {
        const rol = so.rol && ROLLAR.includes(String(so.rol)) ? String(so.rol) : null;
        if (tur === 'qatnashchi' && !rol) {
          return Response.json({ ok: false, error: 'qatnashchi bog\'lanishida rol majburiy' });
        }
        yuk = { p_kompaniya_id: Number(so.kompaniya_id), p_actor_id: sess.foydalanuvchi_id,
          p_tur: tur, p_manba_id: manbaId, p_maqsad_id: maqsadId, p_rol: rol,
          p_kutilgan_versiya: Number(so.expected_version), p_operation_id: operationId,
          p_actor_label: sess.email || null };
      } else {
        const rol = so.rol && ROLLAR.includes(String(so.rol)) ? String(so.rol) : null;
        yuk = { p_kompaniya_id: Number(so.kompaniya_id), p_actor_id: sess.foydalanuvchi_id,
          p_tur: tur, p_manba_id: manbaId, p_maqsad_id: maqsadId, p_rol: rol,
          p_kutilgan_versiya: Number(so.expected_version), p_operation_id: operationId,
          p_actor_label: sess.email || null };
      }

    /* ══════════ MINDMAP — MAS'ULLARNI BIRIKTIRISH ══════════
       Odam (a'zo) → obyekt YOKI loyiha. `ruxsat` null = olib tashlash. Aʼzolik/egalik RPC ichida ham tekshiriladi. */
    } else if (amal === 'mindmap_masul') {
      const obyektId = so.obyekt_id == null || so.obyekt_id === '' ? null : Number(so.obyekt_id);
      const loyihaId = so.loyiha_id == null || so.loyiha_id === '' ? null : Number(so.loyiha_id);
      const userId = Number(so.foydalanuvchi_id);
      if ((obyektId == null) === (loyihaId == null)) {
        return Response.json({ ok: false, error: "obyekt_id yoki loyiha_id (faqat bittasi) kerak" });
      }
      for (const v of [obyektId, loyihaId]) {
        if (v != null && (!Number.isInteger(v) || v <= 0)) return Response.json({ ok: false, error: "obyekt_id/loyiha_id noto'g'ri" });
      }
      if (!Number.isInteger(userId) || userId <= 0) {
        return Response.json({ ok: false, error: "foydalanuvchi_id noto'g'ri" });
      }
      const ruxsat = so.ruxsat == null || so.ruxsat === '' ? null : String(so.ruxsat);
      if (ruxsat != null && !['read', 'write', 'manage'].includes(ruxsat)) {
        return Response.json({ ok: false, error: "ruxsat noto'g'ri" });
      }
      yuk = { p_actor_id: sess.foydalanuvchi_id, p_kompaniya_id: Number(so.kompaniya_id),
        p_obyekt_id: obyektId, p_loyiha_id: loyihaId, p_foydalanuvchi_id: userId,
        p_ruxsat: ruxsat, p_operation_id: operationId };

    /* Tugun sudrab ko'chirilganda joylashuv saqlanadi — aks holda har
       ochilganda avtomatik qayta terilib, odam terib qo'ygan tartib
       YO'QOLARDI (foydalanuvchi: «yana yangidan qurayapdi»). */
    } else if (amal === 'mindmap_joylashuv_saqla') {
      const kompaniyaId = Number(so.kompaniya_id);
      if (!Number.isFinite(kompaniyaId) || kompaniyaId <= 0) {
        return Response.json({ ok: false, error: "kompaniya_id noto'g'ri" });
      }
      if (!Array.isArray(so.joylar) || !so.joylar.length) {
        return Response.json({ ok: false, error: "joylar bo'sh" });
      }
      const joylar = so.joylar.slice(0, 500).map((j: any) => ({
        tugun_id: String(j.tugun_id || '').slice(0, 60),
        x: Number(j.x), y: Number(j.y),
      })).filter((j: any) => j.tugun_id && Number.isFinite(j.x) && Number.isFinite(j.y));
      if (!joylar.length) {
        return Response.json({ ok: false, error: "yaroqli joylashuv yo'q" });
      }
      yuk = { p_kompaniya_id: kompaniyaId, p_actor_id: sess.foydalanuvchi_id,
        p_joylar: joylar, p_operation_id: operationId, p_actor_label: sess.email || null };

    /* Mindmapdan tugun o'chirish — QATTIQ o'chirmaydi (holat='bekor').
       Obyekt ATAYLAB ro'yxatda yo'q: unda smeta/F2/pul bor, u Korzinka
       orqali o'chiriladi (u yerda tekshiruvlar bor). */
    } else if (amal === 'mindmap_tugun_ochir') {
      const TUR_RUXSAT = ['loyiha', 'shartnoma', 'sklad', 'texnika', 'kadr', 'kontragent'];
      const tur = String(so.tur || '');
      const id = Number(so.id);
      if (!TUR_RUXSAT.includes(tur)) {
        return Response.json({ ok: false, error: "bu turni mindmapdan o'chirib bo'lmaydi: " + tur });
      }
      if (!Number.isFinite(id) || id <= 0) {
        return Response.json({ ok: false, error: "id noto'g'ri" });
      }
      yuk = { p_kompaniya_id: Number(so.kompaniya_id), p_actor_id: sess.foydalanuvchi_id,
        p_tur: tur, p_id: id, p_kutilgan_versiya: Number(so.expected_version),
        p_operation_id: operationId, p_actor_label: sess.email || null };

    /* ══════════ ФАКТ KIRITISH (bajarilgan ish) ══════════
       Foydalanuvchi: «ikkalasi ham bo'lishi kerak» — prorab kunlik ham,
       PTO jamlab ham. Ikkalasi AYNI RPC ga yozadi, farq faqat paket
       kattaligida; jamlash mantig'i o'zgarmaydi. */
    } else if (amal === 'fakt_yoz_v2') {
      const obyektId = Number(so.obyekt_id);
      if (!Number.isFinite(obyektId) || obyektId <= 0) {
        return Response.json({ ok: false, error: 'obyekt_id noto\'g\'ri' });
      }
      const sana = String(so.sana || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(sana)) {
        return Response.json({ ok: false, error: 'sana YYYY-MM-DD shaklida bo\'lishi kerak' });
      }
      if (!Array.isArray(so.qatorlar) || so.qatorlar.length === 0) {
        return Response.json({ ok: false, error: 'qatorlar bo\'sh' });
      }
      const operationId = String(so.operation_id || '');
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(operationId)) {
        return Response.json({ ok: false, error: 'operation_id UUID bo\'lishi kerak' });
      }
      yuk = {
        p_obyekt_id: obyektId,
        p_sana: sana,
        p_qatorlar: so.qatorlar,
        p_actor_id: sess.foydalanuvchi_id,
        p_operation_id: operationId,
        p_izoh: so.izoh ? String(so.izoh).slice(0, 500) : null,
        p_raqam: so.raqam ? String(so.raqam).slice(0, 50) : null,
        p_actor_label: sess.email || null,
      };

    /* USTA «Bugun» (20261214300000): actor sessiyadan; maydonlar oq ro'yxat; operation_id UUID (oflayn navbat idempotentligi). */
    } else if (amal === 'usta_fakt_qoralama_v1' || amal === 'usta_zayavka_v1' || amal === 'usta_fakt_qaror_v1') {
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      const kid = Number(so.kompaniya_id);
      const opId = String(so.operation_id || '');
      if (!Number.isSafeInteger(kid) || kid <= 0) return Response.json({ ok: false, error: 'kompaniya_id noto\'g\'ri' }, { status: 400 });
      if (!UUID_RE.test(opId)) return Response.json({ ok: false, error: 'operation_id UUID bo\'lishi kerak' }, { status: 400 });
      const matn = (v: unknown, n: number) => (v == null || v === '' ? null : String(v).slice(0, n));
      if (amal === 'usta_fakt_qoralama_v1') {
        const obyektId = Number(so.obyekt_id);
        const sana = String(so.sana || '');
        if (!Number.isSafeInteger(obyektId) || obyektId <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(sana)) return Response.json({ ok: false, error: 'obyekt_id yoki sana noto\'g\'ri' }, { status: 400 });
        if (!Array.isArray(so.qatorlar) || so.qatorlar.length === 0 || so.qatorlar.length > 200) return Response.json({ ok: false, error: 'qatorlar 1..200 bo\'lishi kerak' }, { status: 400 });
        const qatorlar = (so.qatorlar as Array<Record<string, unknown>>).map((q) => ({ qator_id: Number(q?.qator_id), hajm: Number(q?.hajm) }));
        if (qatorlar.some((q) => !Number.isSafeInteger(q.qator_id) || q.qator_id <= 0 || !Number.isFinite(q.hajm) || q.hajm === 0)) return Response.json({ ok: false, error: 'qator yoki hajm noto\'g\'ri' }, { status: 400 });
        const foto = so.foto_hujjat_id == null ? null : Number(so.foto_hujjat_id);
        if (foto != null && (!Number.isSafeInteger(foto) || foto <= 0)) return Response.json({ ok: false, error: 'foto_hujjat_id noto\'g\'ri' }, { status: 400 });
        yuk = { p_actor_id: sess.foydalanuvchi_id, p_kompaniya_id: kid, p_obyekt_id: obyektId, p_sana: sana, p_qatorlar: qatorlar,
          p_izoh: matn(so.izoh, 500), p_foto_hujjat_id: foto, p_operation_id: opId };
      } else if (amal === 'usta_zayavka_v1') {
        const obyektId = Number(so.obyekt_id);
        const miqdor = Number(so.miqdor);
        const nom = matn(so.nomi, 300);
        if (!Number.isSafeInteger(obyektId) || obyektId <= 0 || !Number.isFinite(miqdor) || miqdor <= 0 || !nom) return Response.json({ ok: false, error: 'obyekt, material nomi va miqdor kerak' }, { status: 400 });
        const kerak = so.kerak_sana ? String(so.kerak_sana) : null;
        if (kerak && !/^\d{4}-\d{2}-\d{2}$/.test(kerak)) return Response.json({ ok: false, error: 'kerak_sana noto\'g\'ri' }, { status: 400 });
        yuk = { p_actor_id: sess.foydalanuvchi_id, p_kompaniya_id: kid, p_obyekt_id: obyektId, p_item_text: nom, p_requested_qty: miqdor,
          p_unit: matn(so.birlik, 30), p_required_date: kerak, p_note: matn(so.izoh, 500), p_operation_id: opId };
      } else {
        const idlar = Array.isArray(so.idlar) ? (so.idlar as unknown[]).map(Number) : [];
        if (idlar.length === 0 || idlar.length > 500 || idlar.some((x) => !Number.isSafeInteger(x) || x <= 0)) return Response.json({ ok: false, error: 'idlar 1..500 bo\'lishi kerak' }, { status: 400 });
        if (!['tasdiqlangan', 'rad'].includes(String(so.qaror))) return Response.json({ ok: false, error: 'qaror tasdiqlangan | rad bo\'lishi kerak' }, { status: 400 });
        yuk = { p_actor_id: sess.foydalanuvchi_id, p_kompaniya_id: kid, p_qoralama_ids: idlar, p_qaror: String(so.qaror), p_izoh: matn(so.izoh, 500), p_operation_id: opId };
      }
    /* Ko'zgu varaqdan: JAMI qiymat beriladi, FARQ hujjat qilib yoziladi.
       ⚠️ Manfiy farq (перерасчёт) ATAYLAB bloklanmaydi — loyiha qoidasi. */
    } else if (amal === 'fakt_belgila') {
      const qatorId = Number(so.qator_id);
      if (!Number.isFinite(qatorId) || qatorId <= 0) {
        return Response.json({ ok: false, error: 'qator_id noto\'g\'ri' });
      }
      if (so.yangi_jami == null || !Number.isFinite(Number(so.yangi_jami))) {
        return Response.json({ ok: false, error: 'yangi_jami son bo\'lishi kerak' });
      }
      yuk = {
        p_qator_id: qatorId,
        p_yangi_jami: Number(so.yangi_jami),
        p_sana: so.sana ? String(so.sana) : null,
        p_kim: sess.email || null,
      };

    /* Sayt uchun kanonik JAMI Fakt qiymatini optimistik qulf bilan belgilash.
       Bu eski `fakt_belgila` emas: obyekt, actor, joriy qiymat va operation_id
       server kontrakti orqali tekshiriladi. */
    } else if (amal === 'fakt_belgila_v2') {
      const obyektId = Number(so.obyekt_id);
      const qatorId = Number(so.qator_id);
      const expected = Number(so.expected_fakt_hajm);
      const yangi = Number(so.yangi_fakt_hajm);
      const operationId = String(so.operation_id || '');
      if (!Number.isSafeInteger(obyektId) || obyektId <= 0 || !Number.isSafeInteger(qatorId) || qatorId <= 0) {
        return Response.json({ ok: false, error: 'obyekt_id yoki qator_id noto\'g\'ri' });
      }
      if (!Number.isFinite(expected) || !Number.isFinite(yangi)) {
        return Response.json({ ok: false, error: 'Fakt qiymatlari son bo\'lishi kerak' });
      }
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(operationId)) {
        return Response.json({ ok: false, error: 'operation_id UUID bo\'lishi kerak' });
      }
      const sana = String(so.sana || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(sana)) {
        return Response.json({ ok: false, error: 'sana YYYY-MM-DD shaklida bo\'lishi kerak' });
      }
      yuk = {
        p_obyekt_id: obyektId,
        p_qator_id: qatorId,
        p_expected_fakt_hajm: expected,
        p_yangi_fakt_hajm: yangi,
        p_sana: sana,
        p_actor_id: sess.foydalanuvchi_id,
        p_operation_id: operationId,
        p_izoh: so.izoh ? String(so.izoh).slice(0, 500) : null,
        p_actor_label: sess.email || null,
      };

    /* ══════════ A'ZOLIK (Xodimlar va Rollar) ══════════
       ⚠️ Multi-tenant poydevorining ochiq bo'shlig'i edi: t2_azolik
       jadvali bor edi, lekin uni boshqaradigan RPC yo'q — faqat GAS
       login orqali BIRINCHI marta avtomatik yaratilardi. */
    } else if (amal === 'azolik_qosh') {
      const kompaniyaId = Number(so.kompaniya_id);
      if (!Number.isFinite(kompaniyaId) || kompaniyaId <= 0) {
        return Response.json({ ok: false, error: 'kompaniya_id noto\'g\'ri' });
      }
      if (!String(so.login || '').trim()) {
        return Response.json({ ok: false, error: 'login bo\'sh bo\'lishi mumkin emas' });
      }
      const ROL_RUXSAT = ['boss', 'rahbar', 'bugalter', 'pto', 'prorab', 'buyurtmachi', 'pudratchi', 'kuzatuvchi'];
      if (!ROL_RUXSAT.includes(String(so.rol))) {
        return Response.json({ ok: false, error: 'rol noto\'g\'ri: ' + ROL_RUXSAT.join('|') });
      }
      yuk = {
        p_actor_id: sess.foydalanuvchi_id,
        p_kompaniya_id: kompaniyaId,
        p_login: String(so.login).trim().slice(0, 100),
        p_rol: String(so.rol),
        p_email: so.email ? String(so.email).slice(0, 200) : null,
        p_ism: so.ism ? String(so.ism).slice(0, 200) : null,
        p_operation_id: crypto.randomUUID(),
      };

    } else if (amal === 'azolik_rol_ozgartir') {
      const azolikId = Number(so.azolik_id);
      if (!Number.isFinite(azolikId) || azolikId <= 0) {
        return Response.json({ ok: false, error: 'azolik_id noto\'g\'ri' });
      }
      const ROL_RUXSAT = ['boss', 'rahbar', 'bugalter', 'pto', 'prorab', 'buyurtmachi', 'pudratchi', 'kuzatuvchi'];
      if (!ROL_RUXSAT.includes(String(so.yangi_rol))) {
        return Response.json({ ok: false, error: 'yangi_rol noto\'g\'ri: ' + ROL_RUXSAT.join('|') });
      }
      yuk = {
        p_actor_id: sess.foydalanuvchi_id, p_azolik_id: azolikId,
        p_yangi_rol: String(so.yangi_rol), p_operation_id: crypto.randomUUID(),
      };

    } else if (amal === 'azolik_ochir') {
      const azolikId = Number(so.azolik_id);
      if (!Number.isFinite(azolikId) || azolikId <= 0) {
        return Response.json({ ok: false, error: 'azolik_id noto\'g\'ri' });
      }
      yuk = { p_actor_id: sess.foydalanuvchi_id, p_azolik_id: azolikId, p_operation_id: crypto.randomUUID() };

    /* ══════════ KORZINKA ══════════
       ⚠️ `p_jadval` FAQAT bazadagi RPC'ning o'zi ichida tekshiriladigan
       oq ro'yxatdan (t2_obyekt/t2_shaxsiy_smeta/t2_sklad_harakat) —
       shu yerda ham qo'shimcha tekshiramiz, ixtiyoriy jadval nomi
       yozishga yo'l qo'ymaslik uchun ikki qatlamli himoya. */
    } else if (amal === 'korzinkaga_tashlash' || amal === 'korzinkadan_tiklash' || amal === 'butunlay_ochirish') {
      const jadval = String(so.jadval || so.rpcArgs?.p_jadval || '');
      const JADVAL_RUXSAT = ['t2_obyekt', 't2_shaxsiy_smeta', 't2_sklad_harakat'];
      if (!JADVAL_RUXSAT.includes(jadval)) {
        return Response.json({ ok: false, error: 'Bu jadval korzinka orqali boshqarilmaydi: ' + jadval });
      }
      const id = Number(so.id || so.rpcArgs?.p_id);
      if (!Number.isFinite(id) || id <= 0) {
        return Response.json({ ok: false, error: 'id noto\'g\'ri' });
      }
      yuk = { p_jadval: jadval, p_id: id, p_kim: sess.email || '' };

    /* ══════════ ARXIVLASH / KORZINKA (loyiha, obyekt, shartnoma, kontragent, AOSR va F2 qoralama) ══════════
       Egalik (kompaniya a'zoligi), rol va «tasdiqlangan hujjat bor» bloki RPC ichida; actor faqat sessiyadan. */
    } else if (amal === 'arxivla_v1' || amal === 'arxivdan_tiklash_v1' || amal === 'arxiv_butunlay_v1') {
      if (!Number.isSafeInteger(sess.foydalanuvchi_id) || (sess.foydalanuvchi_id as number) <= 0) return Response.json({ ok: false, error: 'Sessiya talab qilinadi.' }, { status: 401 });
      const tur = String(so.tur || '');
      const TURLAR = amal === 'arxivla_v1' ? ['loyiha', 'obyekt', 'shartnoma', 'kontragent', 'aosr', 'akt'] : ['loyiha', 'shartnoma', 'kontragent', 'aosr', 'akt'];
      if (!TURLAR.includes(tur)) return Response.json({ ok: false, error: 'Noma\'lum tur: ' + tur }, { status: 400 });
      const id = Number(so.id);
      if (!Number.isSafeInteger(id) || id <= 0) return Response.json({ ok: false, error: 'id noto\'g\'ri' }, { status: 400 });
      yuk = amal === 'arxivla_v1'
        ? { p_actor_id: sess.foydalanuvchi_id, p_tur: tur, p_id: id, p_operation_id: crypto.randomUUID() }
        : { p_actor_id: sess.foydalanuvchi_id, p_tur: tur, p_id: id };

    /* ══════════ OBYEKT TAHRIRLASH ══════════
       ⚠️ 2026-08-28: `p_lat`/`p_lng` qo'shildi (foydalanuvchi
       ko'rsatmasi — "har obyektga lokatsiyasini kartadan belgilash").
       RPC ularni COALESCE bilan qo'llaydi — yuborilmasa (undefined)
       eskisi saqlanadi, xato bo'lmaydi. */
    } else if (amal === 'obyekt_yangila') {
      const id = Number(so.id || so.rpcArgs?.p_id);
      if (!Number.isFinite(id) || id <= 0) {
        return Response.json({ ok: false, error: 'id noto\'g\'ri' });
      }
      const lat = so.lat == null ? null : Number(so.lat);
      const lng = so.lng == null ? null : Number(so.lng);
      if (lat != null && (!Number.isFinite(lat) || lat < -90 || lat > 90)) {
        return Response.json({ ok: false, error: 'lat -90..90 oralig\'ida bo\'lishi kerak' });
      }
      if (lng != null && (!Number.isFinite(lng) || lng < -180 || lng > 180)) {
        return Response.json({ ok: false, error: 'lng -180..180 oralig\'ida bo\'lishi kerak' });
      }
      yuk = {
        p_id: id,
        p_nomi: String(so.nomi || so.rpcArgs?.p_nomi || ''),
        p_tur: so.tur || so.rpcArgs?.p_tur || null,
        p_kutilgan_versiya: so.kutilgan_versiya == null ? null : Number(so.kutilgan_versiya),
        p_lat: lat, p_lng: lng,
      };

    /* ══════════ TENDER PROTSESSI ══════════ */
    } else if (TENDER_AMALLAR.has(amal)) {
      const t = tenderYuk(amal, so as Record<string, unknown>, sess.foydalanuvchi_id);
      if (!t.ok) return Response.json({ ok: false, code: 'REQUIRED_FIELD', error: t.error }, { status: 400 });
      yuk = t.yuk;

    /* BUYURTMA: yuk oq ro'yxatdan (_shared/buyurtma-yuk.ts); actor sessiyadan; kompaniya a'zoligi va egalik quyidagi umumiy blokda. */
    } else if (BUYURTMA_AMALLAR.has(amal)) {
      const b = buyurtmaYuk(amal, so as Record<string, unknown>, sess.foydalanuvchi_id);
      if (!b.ok) return Response.json({ ok: false, code: 'REQUIRED_FIELD', error: b.error }, { status: 400 });
      yuk = b.yuk;

    /* ══════════ B2B BIRJA ══════════
       ⚠️ IDEMPOTENTLIK MAJBURIY — RFQ va taklif narxga bog'liq. */
    } else if (amal === 'birja_rfq_yarat') {
      const hajm = Number(so.hajm);
      if (!String(so.nom || '').trim() || !String(so.birlik || '').trim()) {
        return Response.json({ ok: false, error: 'nom va birlik bo\'sh bo\'lishi mumkin emas' });
      }
      if (!Number.isFinite(hajm) || hajm <= 0) {
        return Response.json({ ok: false, error: 'hajm musbat son bo\'lishi kerak' });
      }
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
            .test(String(so.operation_id || ''))) {
        return Response.json({ ok: false,
          error: 'operation_id (UUID) majburiy — usiz takroriy so\'rov ikkinchi RFQ yaratadi' });
      }
      yuk = {
        p_kompaniya_id: Number(so.kompaniya_id),
        p_nom: String(so.nom).slice(0, 300),
        p_birlik: String(so.birlik).slice(0, 50),
        p_hajm: hajm,
        p_izoh: so.izoh ? String(so.izoh).slice(0, 500) : null,
        p_holat: 'ochiq',
        p_operation_id: so.operation_id,
        p_kim: sess.email || '',
      };

    } else if (amal === 'birja_taklif_ber') {
      const rfqId = Number(so.rfq_id);
      const narx = Number(so.narx);
      if (!Number.isFinite(rfqId) || rfqId <= 0) {
        return Response.json({ ok: false, error: 'rfq_id noto\'g\'ri' });
      }
      if (!Number.isFinite(narx) || narx <= 0) {
        return Response.json({ ok: false, error: 'narx musbat son bo\'lishi kerak' });
      }
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
            .test(String(so.operation_id || ''))) {
        return Response.json({ ok: false,
          error: 'operation_id (UUID) majburiy — usiz takroriy so\'rov ikkinchi taklif yaratadi' });
      }
      yuk = {
        p_rfq_id: rfqId,
        p_kompaniya_id: Number(so.kompaniya_id),
        p_narx: narx,
        p_izoh: so.izoh ? String(so.izoh).slice(0, 500) : null,
        p_operation_id: so.operation_id,
        p_kim: sess.email || '',
      };

    /* ══════════ KALENDAR GRAFIK (Gantt) ══════════
       ⚠️ 2026-08-28: avval `p_payload: JSON.stringify(so)` — mijoz
       yuborgan HAR QANDAY JSON'ni RPC'ga xom uzatardi (bu loyihaning
       "maydon oq ro'yxati" konvensiyasiga zid, boshqa hech bir amalda
       bunday umumiy blob yo'q). RPC'ning o'zi ham hali mavjud emas edi
       (404 xatosi ildizi). Ikkalasi ham tuzatildi: RPC qurildi, maydon
       oq ro'yxati bilan validatsiya qilinadi. */
    } else if (amal === 'grafik_sozlama_saqla') {
      const kompaniyaId = Number(so.kompaniya_id);
      const obyektId = Number(so.obyekt_id);
      if (!Number.isFinite(kompaniyaId) || kompaniyaId <= 0 || !Number.isFinite(obyektId) || obyektId <= 0) {
        return Response.json({ ok: false, error: 'kompaniya_id yoki obyekt_id noto\'g\'ri' });
      }
      if (!String(so.nom || '').trim()) {
        return Response.json({ ok: false, error: 'nom bo\'sh bo\'lishi mumkin emas' });
      }
      yuk = {
        p_kompaniya_id: kompaniyaId, p_obyekt_id: obyektId,
        p_nom: String(so.nom).slice(0, 300),
        p_boshlanish_sana: so.boshlanish_sana || null,
        p_tugash_sana: so.tugash_sana || null,
        p_id: so.id == null ? null : Number(so.id),
        p_kutilgan_versiya: so.kutilgan_versiya == null ? null : Number(so.kutilgan_versiya),
      };

    } else if (amal === 'grafik_yangilash') {
      const id = Number(so.id);
      if (!Number.isFinite(id) || id <= 0) {
        return Response.json({ ok: false, error: 'id noto\'g\'ri' });
      }
      if (so.kutilgan_versiya == null) {
        return Response.json({ ok: false, error: 'kutilgan_versiya majburiy' });
      }
      const HOLAT_RUXSAT = ['reja', 'jarayonda', 'bajarildi'];
      const holat = so.holat && HOLAT_RUXSAT.includes(String(so.holat)) ? String(so.holat) : null;
      yuk = {
        p_id: id, p_kutilgan_versiya: Number(so.kutilgan_versiya),
        p_holat: holat,
        p_foiz: so.foiz == null ? null : Number(so.foiz),
      };

    } else if (amal === 'sozlama_saqla') {
      yuk = {
        p_kompaniya_id: Number(so.kompaniya_id || 0),
        p_sozlamalar: so.sozlamalar ? JSON.stringify(so.sozlamalar) : JSON.stringify(so)
      };

    } else if (amal === 'tizim_amal') {
      yuk = {
        p_turi: String(so.tizim_amal_turi || so.turi || so.harakat || ''),
        p_payload: so.payload ? JSON.stringify(so.payload) : JSON.stringify(so)
      };

    } else if (amal === 'xato_yoz') {
      yuk = {
        p_payload: so.payload ? JSON.stringify(so.payload) : JSON.stringify(so)
      };

    } else if (amal === 'erp_amal') {
      /* Faqat zayavka operatsiyalari qoldi (t2_erp_amal jsonb nusxasi boshqasini bilmaydi; sklad kirim — alohida `skladga_yozish`).
         Noma'lum operatsiya bazaga yetib «yuklab bo'lmadi» bo'lib qaytmasin — aniq sabab. */
      if (!['zayavka_yarat', 'zayavka_holat', 'zayavka_ochir'].includes(String(so.operatsiya || ''))) {
        return Response.json({ ok: false, code: 'OPERATSIYA_NOMALUM', error: 'Bu operatsiya qo‘llab-quvvatlanmaydi (faqat zayavka yaratish, holat va bekor qilish). Sklad kirimi uchun «skladga yozish» ishlatiladi.' }, { status: 400 });
      }
      yuk = {
        p_kompaniya_id: Number(so.kompaniya_id || 0),
        p_operatsiya: String(so.operatsiya || ''),
        /* AUDIT 121 (2026-11-11): prodda t2_erp_amal ikki nusxada edi (p_payload text va jsonb) — satr yuborilganda PostgREST
           PGRST203 (qaysi nusxa?) bilan yiqilar va zayavka yaratilmasdi. Endi OBYEKT yuboriladi (jsonb nusxa, yagona
           canonical; text nusxa 20261214600000 migratsiyasida olib tashlanadi). */
        p_payload: (so.payload && typeof so.payload === 'object') ? so.payload : so,
        /* ⚡ 2026-08-28: audit jurnali «kim» ni ham bilishi kerak.
           Busiz «nima bo'ldi» ma'lum, «kim qildi» noma'lum qolardi va
           jurnal javobgarlik uchun yaroqsiz bo'lardi. RPC buni
           `t2.kim` sozlamasiga yozadi, triggerlar o'shandan o'qiydi. */
        p_kim: sess.email || (sess.foydalanuvchi_id ? 'actor:' + String(sess.foydalanuvchi_id) : null)
      };

    } else if (amal === 'boss_tahlil_boshla') {
      yuk = {
        p_kompaniya_id: Number(so.kompaniya_id || 0),
        p_oy: String(so.oy || '')
      };

    } else if (amal === 'kirish_amal' || amal === 'taklif_yubor' || amal === 'taklif_qabul') {
      yuk = {
        p_kompaniya_id: so.kompaniya_id ? Number(so.kompaniya_id) : 0,
        p_foydalanuvchi: String(so.foydalanuvchi || ''),
        p_payload: so.payload ? JSON.stringify(so.payload) : JSON.stringify(so)
      };

    /* ══════════ HALI KOD YOZILMAGAN AMALLAR ══════════
       🚧 2026-08-25 (Claude): `AMALLAR` da RO'YXATDAN O'TGAN, lekin bu
       yerda o'z shoxobchasi bo'lmagan amallar avval JIM shu yerga —
       aslida `akt_tasdiqlash`/`akt_bekor` uchun yozilgan yuqoridagi
       blokka — tushib, ular kutmagan `p_akt_id` kabi parametrlar bilan
       chaqirilardi. Bu amallarning ko'pi (sklad/faktura/erp/grafik/...)
       RPC darajasida ham hali bazada YO'Q (tekshirildi). Aniq xato
       xabari — soxta muvaffaqiyatdan yaxshiroq. Har amal o'z egasi
       tomonidan tegishli parametrlar bilan to'ldirilishi kerak. */
    } else if (ybAmalmi(amal)) {
      /* Yuk birjasi (egasi tomoni): yuk oq ro'yxatdan (_shared/yuk-birjasi-yuk.ts); actor sessiyadan. */
      const y = ybYuk(amal, so as Record<string, unknown>, Number(sess.foydalanuvchi_id));
      if (typeof y === 'string') return Response.json({ ok: false, error: y }, { status: 400 });
      yuk = y;
    } else if (sotuvAmalmi(amal)) {
      /* Uy sotish: yuk oq ro'yxatdan (_shared/sotuv-yuk.ts); actor sessiyadan. */
      const y = sotuvYuk(amal, so as Record<string, unknown>, Number(sess.foydalanuvchi_id));
      if (typeof y === 'string') return Response.json({ ok: false, error: y }, { status: 400 });
      yuk = y;
    } else {
      return Response.json({ ok: false,
        error: 'Amal "' + amal + '" ro\'yxatda bor, lekin hali parametr moslashtirilmagan (TODO)' });
    }

    /* ═══ YOZISH IZOLYATSIYASI (2026-10-02, DEFAULT DENY) — `_shared/tenant-yozish.ts` ═══
       RPC ga ketadigan YAKUNIY argumentlardagi har ID (obyekt, qator, akt, to'lov, shartnoma, …) ning egasi bazadan
       aniqlanadi; foydalanuvchi o'sha kompaniyaga a'zo bo'lishi shart. Ko'p eski RPC a'zolikni o'zi tekshirmaydi. */
    {
      if (!Array.isArray(sess.kompaniyalar)) {
        return Response.json({ ok: false, code: 'SESSION_STALE', error: 'Sessiyani yangilang — chiqib, qaytadan kiring.' }, { status: 401 });
      }
      const talab = yozishTalablari(amal, yuk);
      if (!talab.ok) return Response.json({ ok: false, code: 'TENANT_FORBIDDEN', error: talab.error }, { status: talab.status });
      const topilgan = await egalarniOqi(supabaseBaseUrl(ctx.env.SUPABASE_URL), ctx.env.SUPABASE_KEY, talab.sorovlar);
      if (!topilgan) return Response.json({ ok: false, code: 'TENANT_CHECK_FAILED', error: 'Yozuv egasini tekshirib bo\'lmadi' }, { status: 502 });
      const ega = egaQarori(azoKompaniyalar(sess), talab, topilgan);
      if (!ega.ok) return Response.json({ ok: false, code: 'TENANT_FORBIDDEN', error: ega.error }, { status: ega.status });
      const targets = new Set(talab.kompaniyalar);
      for (const rows of topilgan.values()) for (const companyId of rows.values()) if (companyId != null) targets.add(companyId);
      if (!mayWriteCompanies(sess, [...targets], dataPermission(amal,true,so))) return Response.json({ ok: false, code: 'PERMISSION_DENIED', error: 'Bu kompaniyada yozish huquqingiz yo‘q.' }, { status: 403 });
    }

    /* Keep the public action names stable for old clients/tests, while
       dispatching participant writes to the tenant-aware canonical V2 RPC. */
    const rpc = amal === 'loyiha_qatnashchi_biriktir'
      ? 't2_loyiha_qatnashchi_biriktir_v2'
      : amal === 'loyiha_qatnashchi_ochir'
        ? 't2_loyiha_qatnashchi_ochir_v2'
        : AMALLAR[amal].rpc;
    // The default endpoint remains the allow-list expression: rpc/' + AMALLAR[amal].rpc.
    const r = await fetch(
      supabaseBaseUrl(ctx.env.SUPABASE_URL) + '/rest/v1/rpc/' + rpc,
      {
        method: 'POST',
        headers: {
          apikey: ctx.env.SUPABASE_KEY,
          Authorization: 'Bearer ' + ctx.env.SUPABASE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(yuk),
      });

    const matn = await r.text();
    if (!r.ok && ['qoshimcha_ish_yarat_v1', 'zamena_ish_yarat_v1', 'resurs_bola_qosh_v1', 'ish_resurslar_bilan_yarat_v1'].includes(amal)) {
      let code = '';
      try { code = JSON.parse(matn).code || ''; } catch { /* Faqat xavfsiz xabar qaytadi. */ }
      return Response.json({ ok: false, error: code === '40001'
        ? 'Ma’lumot yangilangan. Yangi versiyani yuklab oling.'
        : code === '42501' ? 'Bu amal uchun ruxsat yo‘q.'
        : 'Qator yaratilmadi. Bog‘lanish, tartib va kiritilgan ma’lumotlarni tekshiring.' }, { status: code === '42501' ? 403 : 409 });
    }
    if (!r.ok && amal === 'catalog_observation_yoz_v1') {
      return Response.json({ ok: false, error: 'Katalog kuzatuvlari yozilmadi. Ruxsat va manba doirasini tekshiring.' }, { status: 409 });
    }
    if (!r.ok && f2AktRaqamZiddiyati(amal, matn)) {
      return Response.json({ ok: false, code: 'F2_ACT_NUMBER_CONFLICT',
        error: 'Shu raqam bilan F2 allaqachon mavjud (shu obyekt yoki shartnoma doirasida). Mavjud aktni tekshiring. Tasdiqlangan akt oddiy import bilan almashtirilmaydi.' }, { status: 409 });
    }
    if (!r.ok) {
      // F2 baza qoidalari (CHECK hajm 0, versiya qo'riqchisi) — sababli kod; xom matn faqat logga.
      const biznes = bazaBiznesKodi(matn);
      if (biznes) return xavfsizXato(biznes, 409, matn);
      return xavfsizUpstream(r.status, matn);
    }
    let natija: any;
    try { natija = JSON.parse(matn); } catch {
      return xavfsizUpstream(502, matn);
    }

    /* Baza `{ok:false, sabab:'ziddiyat'|'invariant', …}` qaytarishi
       MUMKIN va bu xato emas — normal holat. O'zgartirmasdan uzatamiz. */
    /* Egasi 2026-10-27: sarf hisobidagi tannarx va foyda — faqat platforma superadmini (vakolat bazadan). */
    if (amal === 'token_sarfla_v1' && sess.rol !== 'superadmin') natija = tokenJavobTozala(natija);
    return Response.json({ ...natija, amal, ms: Date.now() - t0 });

  } catch (err: unknown) {
    return xavfsizUpstream(502, err);
  }
};

/** A duplicate act number is a business conflict, not a stale-version instruction. */
export function f2AktRaqamZiddiyati(amal: string, matn: string): boolean {
  if (amal !== 'akt_yarat_v2') return false;
  try {
    const j = JSON.parse(matn) as { code?: string; message?: string };
    return j.code === '23505' && typeof j.message === 'string' && /\bt2_akt_(kalit_uniq|raqam_takror)\b/.test(j.message);
  } catch { return false; }
}

/** F2 qatori raw_snapshot: storno manba qatori (manba_akt_qator_id) yuqori darajada kelsa raw_snapshot ichiga ko'chiriladi.
 * Server (20261203001500) storno takrori va himoyasini shu kalit bo'yicha tekshiradi; t2_akt_qator.manba_akt_qator_id
 * USTUNIGA yozilmaydi (u «Fakt = F2» nusxa izi). Boshqa hollarda raw_snapshot o'zgarishsiz o'tadi. */
function f2RawSnapshot(q: any): unknown {
  const raw = q?.raw_snapshot ?? null;
  const m = Number(q?.manba_akt_qator_id);
  if (!Number.isSafeInteger(m) || m <= 0) return raw;
  const asos = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return { ...asos, manba_akt_qator_id: m };
}
