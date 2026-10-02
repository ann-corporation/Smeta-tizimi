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
import { tekshir } from '../_shared/auth';
import { supabaseBaseUrl } from '../_shared/supabase-url';
import { xavfsizUpstream } from '../_shared/xato';
import { azoKompaniyalar } from '../_shared/tenant-oqish';
import { egaQarori, egalarniOqi, yozishTalablari } from '../_shared/tenant-yozish';

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
  ish_abc_tahrir_v1: { rpc: 't2_ish_abc_tahrir_v1' },
  /* Egasi 2026-10-01: shartnoma kartasi — loyiha, erkin turdagi tomonlar, obyektlar to'plami (asosiy: obyektda bitta). */
  shartnoma_saqla_v2: { rpc: 't2_shartnoma_saqla_v2' },
  /* Egasi 2026-10-02: token daftari (o'zgarmas): sarf/qaytarish — a'zo; to'ldirish/obuna/demo — faqat superadmin (RPC ichida). */
  token_sarfla_v1: { rpc: 't2_token_sarfla_v1' },
  token_qaytar_v1: { rpc: 't2_token_qaytar_v1' },
  /* Egasi 2026-10-02: token sotib olish so'rovi (o'tkazma; superadmin tasdiqlaydi — /api/boshqaruv). */
  tolov_sorov_yarat_v1: { rpc: 't2_tolov_sorov_yarat_v1' },
  token_toldir_v1: { rpc: 't2_token_toldir_v1' },
  obuna_belgila_v1: { rpc: 't2_obuna_belgila_v1' },
  demo_manba_belgila_v1: { rpc: 't2_demo_manba_belgila_v1' },
  zamena_ish_yarat_v1: { rpc: 't2_zamena_ish_yarat_v1' },
  resurs_bola_qosh_v1: { rpc: 't2_resurs_bola_qosh_v1' },
  /* Egasi 2026-09-28: zamena/qo'shimcha ish RESURSLARI BILAN bitta so'rov, bitta tranzaksiya. */
  ish_resurslar_bilan_yarat_v1: { rpc: 't2_ish_resurslar_bilan_yarat_v1' },
  catalog_observation_yoz_v1: { rpc: 't2_catalog_observation_yoz_v1' },
  smeta_narxla_res: { rpc: 't2_smeta_narxla_res_v1' },
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
  fakt_yoz_v2: { rpc: 't2_fakt_yoz_v2' },
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
  mindmap_tugun_ochir: { rpc: 't2_mindmap_tugun_ochir_v2' }
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
    if (!rol || rol === 'boss' || rol === 'rahbar') return { ok: false, status: 403 };
    return { ok: true, kompaniyaId, rol };
  } catch {
    return { ok: false, status: 503 };
  }
}

export const onRequestPost: PagesFunction<{
  SUPABASE_URL: string; SUPABASE_KEY: string; SESSIYA_KALIT: string;
}> = async (ctx) => {
  const t0 = Date.now();
  try {
    const secret = ctx.env.SESSIYA_KALIT;
    const sess = await tekshir(ctx.request.headers.get('Cookie'), secret);
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
    if (sess.rol === 'rahbar') {
      return Response.json({ ok: false, error: 'Раҳбар режимида ёзиш мумкин эмас' },
                           { status: 403 });
    }
    if (!ctx.env.SUPABASE_URL || !ctx.env.SUPABASE_KEY) {
      return Response.json({ ok: false, sozlanmagan: true,
        error: 'Supabase sozlanmagan (SUPABASE_URL / SUPABASE_KEY)' });
    }

    const so = await ctx.request.json<any>();
    /* Eski klientlar `amal` yubormaydi — ular qator tahriri qiladi. */
    const amal: Amal = (so.amal || 'qator_tahrir') as Amal;
    if (!Object.prototype.hasOwnProperty.call(AMALLAR, amal)) {
      return Response.json({ ok: false, error: 'Noma\'lum amal: ' + String(so.amal) });
    }

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
      if (amal !== 'mindmap_joylashuv_saqla' && amal !== 'resurs_yarat_v2' &&
          (!Number.isInteger(Number(so.expected_version)) || Number(so.expected_version) < 0)) {
        return Response.json({ ok: false, error: 'expected_version noto\'g\'ri' });
      }
    }

    /* RES narxlash — yuk shakli shu yerda ham tekshiriladi (RPC ham qayta
       tekshiradi: tenant, faol a'zolik, rol va 1..10000 chegara). */
    if (amal === 'smeta_narxla_res') {
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
        if (azolik.rol === 'rahbar') {
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
    if (amal === 'smeta_narxla_res') {
      const narxlar = (so.narxlar as unknown[]).map((raw) => {
        const q = raw as Record<string, unknown>;
        return {
          kod: q.kod == null ? null : String(q.kod).slice(0, 160),
          nom: q.nom == null ? null : String(q.nom).slice(0, 1500),
          birlik: q.birlik == null ? null : String(q.birlik).slice(0, 80),
          narx: Number(q.narx),
        };
      });
      if (narxlar.some((q) =>
        !String(q.nom ?? '').trim() || !String(q.birlik ?? '').trim() || !Number.isFinite(q.narx) || q.narx <= 0)) {
        return Response.json({ ok: false, error: 'Har RES qatorida nom, birlik va musbat narx bo\'lishi shart' });
      }
      yuk = {
        p_kompaniya_id: Number(so.kompaniya_id), p_actor_id: sess.foydalanuvchi_id,
        p_obyekt_id: Number(so.obyekt_id), p_operation_id: operationId, p_narxlar: narxlar,
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
    } else if (amal === 'ish_abc_ochir_v1') {
      if (!sess.foydalanuvchi_id || !uuidRe.test(String(so.operation_id || '')) || !Number.isSafeInteger(Number(so.qator_id))) {
        return Response.json({ ok: false, error: 'Qator va operatsiya talab qilinadi.' }, { status: 400 });
      }
      yuk = {
        p_actor_id: sess.foydalanuvchi_id, p_kompaniya_id: so.kompaniya_id, p_obyekt_id: so.obyekt_id,
        p_qator_id: Number(so.qator_id), p_sabab: so.sabab ? String(so.sabab).slice(0, 500) : null, p_operation_id: so.operation_id,
      };
    } else if (amal === 'ish_abc_tahrir_v1') {
      if (!sess.foydalanuvchi_id || !uuidRe.test(String(so.operation_id || '')) || !Number.isSafeInteger(Number(so.qator_id))
          || !String(so.sabab || '').trim() || (so.resurslar != null && (!Array.isArray(so.resurslar) || so.resurslar.length > 60))
          || (so.sana != null && !/^\d{4}-\d{2}-\d{2}$/.test(String(so.sana)))) {
        return Response.json({ ok: false, error: 'Qator, sabab, operatsiya va ≤60 resurs talab qilinadi.' }, { status: 400 });
      }
      yuk = {
        p_actor_id: sess.foydalanuvchi_id, p_kompaniya_id: so.kompaniya_id, p_obyekt_id: so.obyekt_id, p_qator_id: Number(so.qator_id),
        p_ish: so.ish ?? null, p_resurslar: so.resurslar ?? null,
        p_fakt_hajm: so.fakt_hajm == null || so.fakt_hajm === '' ? null : Number(so.fakt_hajm),
        p_sana: so.sana ?? null, p_sabab: String(so.sabab).slice(0, 500), p_operation_id: so.operation_id,
      };
    } else if (amal === 'token_sarfla_v1') {
      const n = so.birlik_soni == null ? 1 : Number(so.birlik_soni);
      if (!sess.foydalanuvchi_id || !uuidRe.test(String(so.operation_id || '')) || !/^[a-z_0-9]{2,40}$/.test(String(so.tur_amal || '')) || !Number.isFinite(n) || n < 0 || n > 10_000_000) {
        return Response.json({ ok: false, error: 'Amal, miqdor va operatsiya talab qilinadi.' }, { status: 400 });
      }
      yuk = { p_actor_id: sess.foydalanuvchi_id, p_kompaniya_id: so.kompaniya_id, p_amal: String(so.tur_amal), p_birlik_soni: n, p_operation_id: so.operation_id,
        p_meta: so.meta && typeof so.meta === 'object' && !Array.isArray(so.meta) ? Object.fromEntries(Object.entries(so.meta).slice(0, 10).map(([k, v]) => [String(k).slice(0, 40), typeof v === 'number' ? v : String(v).slice(0, 200)])) : {} };
    } else if (amal === 'tolov_sorov_yarat_v1') {
      if (!sess.foydalanuvchi_id || !uuidRe.test(String(so.operation_id || '')) || !/^[a-z0-9_]{2,30}$/.test(String(so.paket_kod || '')) || !['otkazma', 'payme', 'click'].includes(String(so.usul))) {
        return Response.json({ ok: false, error: 'Paket, usul va operatsiya talab qilinadi.' }, { status: 400 });
      }
      yuk = { p_actor_id: sess.foydalanuvchi_id, p_kompaniya_id: so.kompaniya_id, p_paket_kod: String(so.paket_kod), p_usul: String(so.usul), p_tolov_malumot: String(so.tolov_malumot || '').slice(0, 300), p_operation_id: so.operation_id };
    } else if (amal === 'token_qaytar_v1') {
      if (!sess.foydalanuvchi_id || !uuidRe.test(String(so.operation_id || '')) || !uuidRe.test(String(so.sarf_operation_id || ''))) {
        return Response.json({ ok: false, error: 'Sarf va operatsiya talab qilinadi.' }, { status: 400 });
      }
      yuk = { p_actor_id: sess.foydalanuvchi_id, p_kompaniya_id: so.kompaniya_id, p_sarf_operation_id: so.sarf_operation_id, p_operation_id: so.operation_id, p_sabab: so.sabab ? String(so.sabab).slice(0, 300) : null };
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
        raw_snapshot: q.raw_snapshot ?? null,
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
      const shartnomaId = Number(so.shartnoma_id);
      if (!Number.isFinite(shartnomaId) || shartnomaId <= 0) {
        return Response.json({ ok: false, error: 'shartnoma_id noto\'g\'ri' });
      }
      yuk = {
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
      const kompaniyaId = Number(so.kompaniya_id);
      if (!Number.isFinite(kompaniyaId) || kompaniyaId <= 0) {
        return Response.json({ ok: false, error: 'kompaniya_id noto\'g\'ri' });
      }
      if (!String(so.nom || '').trim()) {
        return Response.json({ ok: false, error: 'nom bo\'sh bo\'lishi mumkin emas' });
      }
      yuk = {
        p_kompaniya_id: kompaniyaId,
        p_nom: String(so.nom).slice(0, 300),
        p_izoh: so.izoh ? String(so.izoh).slice(0, 1000) : null,
        p_hudud: so.hudud ? String(so.hudud).slice(0, 200) : null,
        /* ⚠️ byudjet: 0 va "belgilanmagan" FARQLI. `undefined`/`null` →
           NULL bo'lib qoladi, 0 esa haqiqiy nol byudjet sifatida saqlanadi. */
        p_byudjet: so.byudjet == null || so.byudjet === '' ? null : Number(so.byudjet),
      };

    } else if (amal === 'loyiha_yangila') {
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
        p_id: id,
        p_kutilgan_versiya: kutilganVersiya,
        p_nom: so.nom ? String(so.nom).slice(0, 300) : null,
        p_izoh: so.izoh != null ? String(so.izoh).slice(0, 1000) : null,
        p_hudud: so.hudud != null ? String(so.hudud).slice(0, 200) : null,
        p_byudjet: so.byudjet == null || so.byudjet === '' ? null : Number(so.byudjet),
        p_holat: so.holat ? String(so.holat) : null,
      };

    } else if (amal === 'loyiha_ochir') {
      const id = Number(so.id);
      if (!Number.isFinite(id) || id <= 0) {
        return Response.json({ ok: false, error: 'id noto\'g\'ri' });
      }
      yuk = { p_id: id };

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
      yuk = {
        p_kompaniya_id: Number(so.kompaniya_id || 0),
        p_operatsiya: String(so.operatsiya || ''),
        p_payload: so.payload ? JSON.stringify(so.payload) : JSON.stringify(so),
        /* ⚡ 2026-08-28: audit jurnali «kim» ni ham bilishi kerak.
           Busiz «nima bo'ldi» ma'lum, «kim qildi» noma'lum qolardi va
           jurnal javobgarlik uchun yaroqsiz bo'lardi. RPC buni
           `t2.kim` sozlamasiga yozadi, triggerlar o'shandan o'qiydi. */
        p_kim: sess.email || null
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
    if (!r.ok) {
      return xavfsizUpstream(r.status, matn);
    }
    let natija: any;
    try { natija = JSON.parse(matn); } catch {
      return xavfsizUpstream(502, matn);
    }

    /* Baza `{ok:false, sabab:'ziddiyat'|'invariant', …}` qaytarishi
       MUMKIN va bu xato emas — normal holat. O'zgartirmasdan uzatamiz. */
    return Response.json({ ...natija, amal, ms: Date.now() - t0 });

  } catch (err: unknown) {
    return xavfsizUpstream(502, err);
  }
};
