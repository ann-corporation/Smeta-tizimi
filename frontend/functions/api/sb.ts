/**
 * sb.ts — SUPABASE'DAN FAQAT O'QISH DARCHASI
 * ═══════════════════════════════════════════════════════════════════
 *
 * MAQSAD: sayt og'ir ma'lumotni Google Sheets o'rniga Postgres'dan
 * o'qisin. Sheets har so'rovda faylni ochadi va varaqni skanlaydi;
 * Postgres indeksdan o'qiydi.
 *
 * ⚠️ QAT'IY CHEKLOVLAR — bu darcha ATAYLAB tor:
 *   1) FAQAT O'QISH. `insert/update/delete` yo'q. Yagona haqiqat manbai
 *      Google Sheets bo'lib qoladi; Supabase — uning KO'ZGUSI.
 *      Ko'zguga yozish ikki manba yaratadi va ular albatta ajralib
 *      ketadi ([[soxta-malumot-buzilishlari]] naqshi).
 *   2) Jadval OQ RO'YXATI — faqat quyidagilar o'qiladi.
 *   3) Sessiya MAJBURIY — `/api/gas` bilan bir xil tekshiruv.
 *   4) `service_role` kaliti FAQAT serverda qoladi, brauzerga
 *      HECH QACHON yuborilmaydi.
 *
 * SO'ROV:
 *   POST /api/sb
 *   { "jadval": "holat", "filtr": "obyekt=eq.Amfiteatr",
 *     "ustunlar": "*", "tartib": "varaq.asc,qator.asc", "limit": 50000 }
 *
 * JAVOB:
 *   { ok: true, qatorlar: [...], soni: 1234, ms: 87 }
 *   { ok: false, error: "..." }
 */
import { tekshir } from '../_shared/auth';
import { supabaseBaseUrl } from '../_shared/supabase-url';
import { xavfsizUpstream } from '../_shared/xato';
import { azoKompaniyalar, oqishQarori, rpcKompaniyasi } from '../_shared/tenant-oqish';

/* Faqat shu jadvallar o'qiladi. Yangi jadval kerak bo'lsa SHU YERGA va `_shared/tenant-oqish.ts` dagi
   OQISH_SIYOSATI ga (aniq izolyatsiya siyosati bilan) qo'shiladi — ikkalasi bir xil bo'lishi testda majburiy.
   «hamma jadval ochiq» holatiga hech qachon o'tmaymiz. */
const RUXSAT_JADVALLAR = new Set([
  /* ── TIZIM_01 ko’zgusi (eski) — 2026-10-02: faqat superadmin (Tezlik sinovi); kompaniya ustuni yo'q.
     Ishlatilmaydigan eski jadvallar (oylik_f2, narxlar, akt, …) ro'yxatdan olib tashlandi. ── */
  'obyektlar', 'holat', 'v_sklad_nomlar',
  /* ── TIZIM_02 (t2_) — BU YERDA BAZA HAQIQAT MANBAI ──
     Tizim_02 sahifalari FAQAT shu jadvallarni o’qiydi. Eski ko’zgu
     jadvallariga (yuqoridagilar) ular MUROJAAT QILMAYDI — aks holda
     ikki tizim ma’lumoti aralashib, qaysi raqam qayerdan kelgani
     bilinmay qoladi. */
  't2_kompaniya', 't2_obyekt', 't2_obyekt_jami', 't2_daraxt', 't2_qator',
  't2_narx', 't2_manba', 't2_xom', 't2_lrv',
  't2_kozgu', 't2_ozgarish', 't2_sozlama',
  /* F2 / FAKT (E bosqichi) */
  't2_akt', 't2_akt_qator', 't2_akt_reestr', 't2_qator_holat', 't2_faktura', 't2_ish_turi', 't2_shaxsiy_smeta',
  'v_erp_kadrlar_dashboard', 'v_erp_texnika_dashboard', 'v_erp_taminot_dashboard', 'v_erp_sifat_dashboard', 't2_grafik_holat', 'v_boss_init', 'v_boss_data',
  't2_birja_rfq', 't2_birja_taklif', 't2_sklad_qoldiq', 't2_sklad_harakat',
  /* NARXLAR MARKAZI — hammasi FAQAT O'QISH uchun ko'rinishlar.
     `t2_narx_qol_xavf` — odamning qo'lda tuzatgan narxi himoyasiz
     qolgan qatorlar; u BO'SH bo'lishi kerak. */
  't2_narx_markaz', 't2_topilmaganlar', 't2_narx_sana', 't2_narx_qol_xavf',
  /* F2/FAKT TAHLIL - Sheets skanlash o'rniga bazadan aggregatsiya */
  't2_f2_kat_oy', 't2_f2_tafsilot',
  /* VIBORKA — har obyektga xos material tanlash/xarid nazorati
     (2026-08-25: umumiy Sheets hujjatidan Tizim_02 ga ko'chirildi) */
  't2_viborka', 't2_viborka_qabul', 't2_viborka_holat',
  /* ШАРТНОМА + НАКРУТКА */
  't2_shartnoma', 't2_shartnoma_bog', 't2_nakrutka', 't2_qoshimcha_ish',
  't2_obyekt_nakrutka',
  /* БУХГАЛТЕРИЯ — to'lov/xarajat + hisoblangan ko'rishlar (2026-08-25) */
  't2_tolov', 't2_xarajat', 't2_bux_dashboard', 't2_debitor_aging', 't2_bux_umumiy',
  /* АОСР — yashirin ishlar akti (2026-08-27, hujjat domeni) */
  't2_aosr_reestr', 't2_aosr_coverage',
  /* Ijro hujjatlari v2 (2026-10-01): АОСР blank maydonlari, laboratoriya, logo */
  't2_aosr_reestr_v2', 't2_lab_protokol_reestr', 't2_kompaniya_logo',
  /* Nakrutka podval konstruktori (2026-10-01) */
  't2_nakrutka_podval_royxat',
  /* Narx manbalari va dalil (2026-10-01) */
  't2_narx_manba_royxat', 't2_narx_manba_qator', 't2_narx_taklif', 't2_narx_dalil_holat',
  /* Platforma katalogi (egasi 2026-10-02: bir marta, hamma kompaniya uchun) — faqat platforma qatorlari. */
  't2_platforma_narx_manba', 't2_platforma_narx_manba_qator',
  /* Протокол согласования цен (2026-10-03). */
  't2_narx_protokol_royxat', 't2_narx_protokol_qator',
  /* KORZINKA — bekor qilingan obyekt/smeta/sklad harakat (3 jadval
     birlashgan VIEW — `holat='bekor'`, is_deleted EMAS). */
  't2_korzinka',
  /* AUDIT & LOGLAR (2026-08-27, Antigravity SQL + Claude qo'llagan) */
  't2_audit_reestr',
  /* OBYEKT HUJJATLARI — har obyektga bog'langan loyiha/tasdiqlangan fayllar */
  't2_obyekt_hujjat_royxat',
  /* MUSTAQIL RESURSLAR (M:N) — sklad/kadr/texnika bitta obyektga emas,
     junction jadval orqali bir nechta obyektga bog'lanadi (2026-08-27,
     Antigravity SQL + Claude qattiqlashtirgan). */
  't2_sklad_royxat', 't2_kadr_royxat', 't2_texnika_royxat',
  /* LOYIHA (Project) — Kompaniya→Loyiha→Obyekt oraliq bosqichi
     (2026-08-27, MASTER_REJA_ENTERPRISE_OS.md FAZA-oldi ustuvor
     bo'shliq: "32 gektar, 40 obyekt, bitta park" guruhlash). */
  't2_loyiha_royxat',
  /* Polimorfik tashkilot bog'lanishi (MASTER_REJA band 1, 2026-08-28):
     har loyiha uchun qatnashchilar (kompaniya YOKI kontragent + rol)
     bitta jsonb_agg'da — zero re-fetch. */
  't2_loyiha_qatnashchilar_royxat',
  /* KONTRAGENTLAR (B2B Reestr) — biznes hamkorlar adress daftari,
     t2_kompaniya (tizim tenant'lari) EMAS (2026-08-27). */
  't2_kontragent_royxat',
  /* A'ZOLIK (Xodimlar va Rollar) — kompaniya a'zolari ro'yxati
     (foydalanuvchi + rol), 2026-08-28. */
  't2_azolik_royxat',
  /* MATERIAL ALIASLARI — AI semantik qidiruv poydevori (2026-08-28,
     MASTER_REJA_ENTERPRISE_OS.md "0-A" tahlili). "M200"/"Бетон М200"/
     "М-200" bitta kanonik nom_key'ga ishora qiladi. */
  't2_material_alias_royxat',
  /* ZAYAVKA (ta'minot) — auditda topilgan bo'shliq yopildi (2026-08-28):
     `t2_erp_taminot` jadvali bor edi, lekin `t2_erp_amal` RPC bazada
     UMUMAN yo'q edi → yozish 404 berardi. */
  't2_zayavka_royxat',
  /* HODISA LENTASI — rahbar «nima sodir bo'ldi» ni ko'radi.
     `t2_audit_log` ga endi TRIGGER yozadi; avval 0 qator edi, chunki
     `t2_audit_yoz` ni hech kim chaqirmasdi (auditda qayd etilgan). */
  't2_hodisa_lenta',
  /* PAPKA TUZILMASI — Drive va mindmap AYNI manbadan o'qiydi. */
  't2_papka_daraxt', 't2_hujjat_turi',
  /* OVERBILLING RADORI (MASTER_REJA FAZA 5, band 50, 2026-08-28):
     F2 faktdan yoki (manfiy bo'lmagan) smetadan oshib ketgan qatorlar —
     FAQAT ko'rish uchun, yozishda bloklanmaydi (foydalanuvchi qarori:
     "faqat ogohlantirish"). */
  't2_overbilling_radar',
  /* MARKAZIY SKLAD KONSOLIDATSIYASI (2026-08-28, foydalanuvchi
     ko'rsatmasi — "20+ obyekt, bitta markaziy sklad, umumiy ostatka
     ko'rinishi kerak"): bitta markaziy skladga bog'langan (t2_sklad_bog)
     BARCHA obyektning haqiqiy qoldig'ini material bo'yicha yig'adi. */
  't2_sklad_konsolidatsiya',
]);

/** Bitta `/api/sb` o'qishining vaqt byudjeti (ms). Oshsa — log + `sekin: true`. */
const TEZLIK_BYUDJETI_MS = 3000;

/** Ota yozuvning (obyekt / loyiha / viborka) kompaniyasi — service_role bilan, faqat `kompaniya_id` ustuni. */
async function otaKompaniyasi(env: { SUPABASE_URL: string; SUPABASE_KEY: string }, jadval: string, id: number): Promise<number | null> {
  const r = await fetch(
    supabaseBaseUrl(env.SUPABASE_URL) + '/rest/v1/' + jadval + '?select=kompaniya_id&id=eq.' + id + '&limit=1',
    { headers: { apikey: env.SUPABASE_KEY, Authorization: 'Bearer ' + env.SUPABASE_KEY } });
  if (!r.ok) throw new Error('OTA_OQILMADI');
  const rows = await r.json() as Array<{ kompaniya_id?: number | null }>;
  const k = Array.isArray(rows) && rows[0] ? Number(rows[0].kompaniya_id) : NaN;
  return Number.isSafeInteger(k) && k > 0 ? k : null;
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

    if (!ctx.env.SUPABASE_URL || !ctx.env.SUPABASE_KEY) {
      return Response.json({
        ok: false,
        error: 'Supabase sozlanmagan. Cloudflare Pages → Settings → ' +
               'Environment Variables ga SUPABASE_URL va SUPABASE_KEY qo\'shing.',
        sozlanmagan: true,
      });
    }

    const so = await ctx.request.json<{
      jadval?: string; filtr?: string; ustunlar?: string;
      tartib?: string; limit?: number;
      soro?: string; obyekt_id?: number; kompaniya_id?: number; akt_id?: number; job_id?: number;
      shartnoma_id?: number;
      /* ABC kutubxona qidiruvi (2026-10-01). */
      q?: string; kat?: string; items?: Array<{ nom?: string; birlik?: string }>;
    }>();

    /* ══════════ O'QISH-RPC (AI konteksti) ══════════════════════════════
     * ⚠️ ATAYLAB O'TA TOR: bu yerda faqat SANAB O'TILGAN, FAQAT O'QIYDIGAN
     * funksiyalar. Ixtiyoriy RPC nomi qabul QILINMAYDI — aks holda bu
     * o'qish eshigi jimgina yozish eshigiga aylanardi.
     *
     * Nega kerak: AI ga bitta obyekt bo'yicha to'liq kontekst kerak
     * (jami, kategoriya, ogohlantirishlar). Buni jadval-jadval o'qib
     * frontendda yig'ish — aynan Tizim_01 dagi sekin yo'l. Postgres
     * hammasini bitta chaqiruvda beradi.
     *
     * Rol: `boss`/`rahbar` ham CHAQIRA OLADI — bu faqat o'qish. */
    if (so.soro) {
      const OQISH_RPC: Record<string, 'obyekt' | 'kompaniya' | 'obyekt_kompaniya' | 'obyekt_actor' | 'akt_actor' | 'job_actor' | 'kompaniya_actor' | 'akt_kompaniya_actor' | 'shartnoma_actor'> = {
        ai_kontekst: 'obyekt',
        ai_umumiy: 'kompaniya',
        /* ⚡ 2026-08-28: mindmap butun grafni (tugunlar + bog'lanishlar)
           BITTA chaqiruvda oladi — jadval-jadval o'qish o'rniga. */
        mindmap_grafi: 'kompaniya',
        mindmap_grafi_v2: 'kompaniya',
        hodisa_obyekt_lenta: 'obyekt_kompaniya',
        /* T2-REAL-PARK-LRV-VERTICAL-SLICE-004: Price Control + exact-F2
           read models. p_actor_id ALWAYS from the verified session --
           the RPC itself checks company membership (t2_actor_kompaniya_azo_tekshir),
           it is never client-supplied. */
        price_control_v1: 'obyekt_actor',
        f2_exact_qatorlar_v1: 'akt_actor',
        /* T2-GAS-EXIT-001 §5/§6: resumable F2 import job — resumption reads.
           Both RPCs are `stable` (read-only) and membership-checked inside
           the function itself via job_id -> kompaniya_id, same law as above. */
        f2_import_job_holat_v1: 'job_actor',
        f2_import_draft_royxat_v1: 'job_actor',
        /* T1->T2 PTO gap-close: NAKRUTKA (markup cascade) reads. Both RPCs
           are `stable`, membership-checked inside via
           t2_actor_kompaniya_azo_tekshir. */
        nakrutka_koef_ol_v1: 'kompaniya_actor',
        obyekt_nakrutka_v1: 'obyekt_actor',
        shartnoma_qamrov_ol_v1: 'shartnoma_actor',
        /* HERM-001 WP-1: F2 lifecycle approval-chain history. `stable`,
           membership-checked inside the RPC itself
           (t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id)); the
           WHERE clause filters by BOTH kompaniya_id and akt_id, so a
           mismatched pair simply returns zero rows rather than leaking
           another tenant's history. */
        akt_lifecycle_history_v1: 'akt_kompaniya_actor',
        /* Egasi 2026-10-01 — kichik ABC: ish turi / resurs kutubxonalari (yuklangan smetalardan) va
           narx takliflari. `stable`, a'zolik ichida (t2_obyekt_kompaniya_azo). */
        ish_turi_qidir_v1: 'obyekt_actor',
        resurs_qidir_v1: 'obyekt_actor',
        resurs_narx_taklif_v1: 'obyekt_actor',
        /* Egasi 2026-10-01: Loyiha → Shartnoma (tomonlar) → Obyektlar liniyasi. `stable`, a'zolik ichida. */
        shartnoma_liniya_v1: 'kompaniya_actor',
        /* Egasi 2026-10-02: token balansi, tarif, narxlar, harakatlar (sotiladigan PTO). */
        token_holat_v1: 'kompaniya_actor',
        /* Egasi 2026-10-02: fayl menejeri — kompaniya fayllari loyiha/obyekt/tur bo'yicha (a'zolik ichida). */
        fayl_explorer_v1: 'kompaniya_actor',
      };
      const tur = OQISH_RPC[so.soro];
      if (!tur) {
        return Response.json({ ok: false, error: 'So\'rov ochiq emas: ' + so.soro });
      }

      /* ⚠️ GET bilan chaqiriladi, POST bilan EMAS — va bu ATAYLAB.
       * `/api/sb` ning bosh kafolati: u HECH QACHON yoza olmaydi. Buni
       * qo'riqchi test ham tekshiradi («faqat GET so'rov»). POST ga
       * o'tsak kafolat zaiflashardi: keyinchalik kimdir ro'yxatga
       * yozuvchi funksiyani qo'shsa, hech narsa to'smasdi.
       *
       * PostgREST `STABLE`/`IMMUTABLE` funksiyalarni GET bilan chaqirishga
       * ruxsat beradi, `VOLATILE` (yozuvchi) larni esa RAD ETADI. Ya'ni
       * cheklovni endi POSTGRESNING O'ZI majburlaydi — yozuvchi funksiya
       * bu yerga qo'shilsa, u GET da umuman ishlamaydi. */
      const q = new URLSearchParams();
      if (tur === 'obyekt' || tur === 'obyekt_kompaniya' || tur === 'obyekt_actor') {
        const id = Number(so.obyekt_id);
        if (!Number.isFinite(id) || id <= 0) {
          return Response.json({ ok: false, error: 'obyekt_id noto\'g\'ri' });
        }
        q.set('p_obyekt_id', String(id));
      }
      if (tur === 'akt_actor' || tur === 'akt_kompaniya_actor') {
        const id = Number(so.akt_id);
        if (!Number.isFinite(id) || id <= 0) {
          return Response.json({ ok: false, error: 'akt_id noto\'g\'ri' });
        }
        q.set('p_akt_id', String(id));
      }
      if (tur === 'job_actor') {
        const id = Number(so.job_id);
        if (!Number.isFinite(id) || id <= 0) {
          return Response.json({ ok: false, error: 'job_id noto\'g\'ri' });
        }
        q.set('p_job_id', String(id));
      }
      if (tur === 'shartnoma_actor') {
        const id = Number(so.shartnoma_id);
        if (!Number.isFinite(id) || id <= 0) {
          return Response.json({ ok: false, error: 'shartnoma_id noto\'g\'ri' });
        }
        q.set('p_shartnoma_id', String(id));
      }
      if (tur === 'obyekt_actor' || tur === 'akt_actor' || tur === 'job_actor' || tur === 'kompaniya_actor' || tur === 'akt_kompaniya_actor' || tur === 'shartnoma_actor') {
        if (!Number.isInteger(sess.foydalanuvchi_id) || (sess.foydalanuvchi_id as number) <= 0) {
          return Response.json({ ok: false, error: 'Sessiyada foydalanuvchi yo\'q' }, { status: 401 });
        }
        q.set('p_actor_id', String(sess.foydalanuvchi_id));
      }
      /* 2026-10-02 izolyatsiya auditi: avval `obyekt` turidagi RPC (ai_kontekst) obyektning kimga tegishliligini
         tekshirmasdi, `kompaniya` turida esa kompaniya berilmasa BARCHA kompaniyalar qaytardi. Endi:
         obyekt → uning kompaniyasi a'zolikda bo'lishi shart; kompaniya → majburiy va a'zo. */
      if (tur === 'obyekt' || tur === 'obyekt_kompaniya') {
        if (!Array.isArray(sess.kompaniyalar)) {
          return Response.json({ ok: false, code: 'SESSION_STALE', error: 'Sessiyani yangilang — chiqib, qaytadan kiring.' }, { status: 401 });
        }
        let okid: number | null;
        try { okid = await otaKompaniyasi(ctx.env, 't2_obyekt', Number(so.obyekt_id)); }
        catch { return Response.json({ ok: false, code: 'TENANT_CHECK_FAILED', error: 'Obyekt tegishliligini tekshirib bo\'lmadi' }, { status: 502 }); }
        if (okid == null || !azoKompaniyalar(sess).includes(okid)) {
          return Response.json({ ok: false, code: 'TENANT_FORBIDDEN', error: 'Bu obyektga ruxsat yo\'q' }, { status: 403 });
        }
      }
      if (tur === 'kompaniya' || tur === 'obyekt_kompaniya') {
        const k = rpcKompaniyasi(sess, so.kompaniya_id);
        if (!k.ok) return Response.json({ ok: false, code: 'TENANT_FORBIDDEN', error: k.error }, { status: k.status });
        q.set('p_kompaniya_id', String(k.id));
      }
      if (tur === 'kompaniya_actor' || tur === 'akt_kompaniya_actor') {
        const kid = Number(so.kompaniya_id);
        if (!Number.isFinite(kid) || kid <= 0) {
          return Response.json({ ok: false, error: 'kompaniya_id noto\'g\'ri' });
        }
        if (!Array.isArray(sess.kompaniyalar) ||
            !sess.kompaniyalar.some((a) => a.kompaniya_id === kid)) {
          return Response.json(
            { ok: false, error: 'Bu kompaniyaga ruxsat yo\'q' }, { status: 403 });
        }
        q.set('p_kompaniya_id', String(kid));
      }
      if (so.soro === 'nakrutka_koef_ol_v1' || so.soro === 'obyekt_nakrutka_v1') {
        if (so.shartnoma_id != null && String(so.shartnoma_id) !== '') {
          const sid = Number(so.shartnoma_id);
          if (!Number.isFinite(sid) || sid <= 0) {
            return Response.json({ ok: false, error: 'shartnoma_id noto\'g\'ri' });
          }
          q.set('p_shartnoma_id', String(sid));
        }
      }
      if (so.soro === 'mindmap_grafi_v2') {
        const mode = String((so as any).mode || 'overview');
        if (!['overview', 'taminot', 'obyekt'].includes(mode)) {
          return Response.json({ ok: false, error: 'mindmap mode noto\'g\'ri' });
        }
        q.set('p_mode', mode);
        if (mode !== 'overview') {
          const objectId = Number(so.obyekt_id);
          if (!Number.isInteger(objectId) || objectId <= 0) {
            return Response.json({ ok: false, error: 'drilldown uchun obyekt_id majburiy' });
          }
          q.set('p_obyekt_id', String(objectId));
        }
      }
      if (so.soro === 'ish_turi_qidir_v1' || so.soro === 'resurs_qidir_v1') {
        q.set('p_q', String(so.q ?? '').slice(0, 100));
        if (so.soro === 'resurs_qidir_v1') q.set('p_kat', String(so.kat ?? '').slice(0, 10));
      }
      if (so.soro === 'resurs_narx_taklif_v1') {
        const items = Array.isArray(so.items) ? so.items.slice(0, 80).map((x, i) => ({ i, nom: String(x?.nom ?? '').slice(0, 300), birlik: String(x?.birlik ?? '').slice(0, 30) })) : [];
        q.set('p_items', JSON.stringify(items));
      }
      if (so.soro === 'hodisa_obyekt_lenta') {
        const lim = Math.min(100, Math.max(1, Number(so.limit || 20)));
        q.set('p_limit', String(Number.isFinite(lim) ? lim : 20));
      }

      const rr = await fetch(
        supabaseBaseUrl(ctx.env.SUPABASE_URL) +
          '/rest/v1/rpc/t2_' + so.soro + '?' + q.toString(),
        {
          headers: {
            apikey: ctx.env.SUPABASE_KEY,
            Authorization: 'Bearer ' + ctx.env.SUPABASE_KEY,
          },
        });
      if (!rr.ok) {
        return Response.json(
          { ok: false, error: 'So\'rov bajarilmadi (' + rr.status + ')' });
      }
      const natija = await rr.json();
      return Response.json({ ok: true, natija, ms: Date.now() - t0 });
    }

    const jadval = String(so.jadval || '');
    if (!RUXSAT_JADVALLAR.has(jadval)) {
      return Response.json({ ok: false, error: 'Jadval ochiq emas: ' + jadval });
    }
    /* ═══ TENANT IZOLYATSIYASI (o'qish) — 2026-10-02, DEFAULT DENY ═══
     * Har jadvalning aniq siyosati `_shared/tenant-oqish.ts` da. Kompaniya ustunli jadvalga server
     * `kompaniya_id=in.(a'zo kompaniyalar)` ni MAJBURAN qo'shadi; ustunsiz jadval aniq ota yozuv
     * (obyekt/loyiha/viborka) orqali tekshiriladi; eski TIZIM_01 ko'zgusi — faqat superadmin. */
    const qaror = oqishQarori(jadval, so, sess);
    if (!qaror.ok) {
      return Response.json({ ok: false, code: qaror.code, error: qaror.error }, { status: qaror.status });
    }
    if (qaror.ota) {
      let okid: number | null;
      try { okid = await otaKompaniyasi(ctx.env, qaror.ota.jadval, qaror.ota.id); }
      catch { return Response.json({ ok: false, code: 'TENANT_CHECK_FAILED', error: 'Tegishlilikni tekshirib bo\'lmadi' }, { status: 502 }); }
      if (okid == null || !azoKompaniyalar(sess).includes(okid)) {
        return Response.json({ ok: false, code: 'TENANT_FORBIDDEN', error: 'Bu ma\'lumotga ruxsat yo\'q' }, { status: 403 });
      }
    }
    const majburiyFiltr = qaror.qoshimchaFiltr.map((f) => {
      const i = f.indexOf('=');
      return encodeURIComponent(f.slice(0, i)) + '=' + encodeURIComponent(f.slice(i + 1));
    }).join('&');
    const mosObyekt = (so.filtr || '').match(/(?:^|&)obyekt_id=eq\.(-?\d+)/);

    /* ══════════════════════════════════════════════════════════════
     * ⚠️ 2026-08-17 — SAHIFALAB O'QISH (1000 QATOR CHEGARASI)
     *
     * Avval bitta so'rov yuborilardi va `limit=100000` deb yozilgandi.
     * LEKIN Supabase'ning REST qatlamida SERVER TOMONDA «Max rows»
     * chegarasi bor (standart 1000) — u so'ralgan limitdan qat'i nazar
     * javobni KESIB TASHLAYDI.
     *
     * Natijasi xatarli edi: 2765 qatorlik obyekt uchun 1000 qator
     * qaytardi va summa 50% kam chiqdi. Ya'ni javob TO'LIQ EMAS, lekin
     * xato ham chiqmaydi — jim yarim ma'lumot. Tezlik sinovi buni
     * «ko'zgu eskirgan» deb ko'rsatdi va foydalanuvchi 1000 raqamini
     * o'zi payqadi.
     *
     * ENDI: sahifalab o'qiymiz (offset bilan), to'liq yig'ilguncha.
     * Bu chegara qanday sozlanganidan QAT'I NAZAR ishlaydi — serverdagi
     * sozlamaga tayanmaymiz.
     *
     * `Content-Range` dan HAQIQIY jamini olamiz va agar biror sababga
     * ko'ra hammasini ololmasak — `toliq:false` deb OCHIQ aytamiz.
     * ══════════════════════════════════════════════════════════════ */
    const kerak = Math.min(Math.max(1, so.limit || 50000), 200000);

    /* ⚠️⚠️ 2026-08-17 (3-tuzatish) — SAHIFA HAJMI ENDI MOSLASHUVCHAN.
     *
     * O'lchov shuni ko'rsatdi: vaqt ma'lumot HAJMIGA emas, BORIB-KELISH
     * soniga ketadi. 1673 qator ham, 4937 qator ham bitta so'rovda
     * ~1000 ms. Ya'ni 5 so'rov = ~5 barobar kutish.
     *
     * Avval `SAHIFA = 1000` qattiq yozilgandi — Supabase'ning standart
     * «Max rows» sozlamasi shuncha. Lekin u sozlama O'ZGARTIRILISHI
     * mumkin. Agar u 10 000 ga ko'tarilsa, bizning kod baribir 1000
     * talab so'rayverardi va tezlik yaxshilanmasdi.
     *
     * ENDI: birinchi so'rovda KATTA limit so'raymiz. Server nechta
     * qaytarsa — haqiqiy chegara o'sha. Keyingi sahifalar ham o'sha
     * hajmda so'raladi. Ya'ni foydalanuvchi Supabase'da «Max rows» ni
     * ko'tarsa, KOD O'ZGARTIRMASDAN tezlashadi; ko'tarmasa avvalgidek
     * ishlaydi. Sozlamaga bog'liqlik yo'q — moslashuv bor. */
    const SORALADI = Math.min(kerak, 10000);
    let SAHIFA = SORALADI;        // birinchi javobdan keyin aniqlanadi
    /* ⚠️ Cloudflare Worker BITTA so'rov ichida chekli sonda tashqi so'rov
       qila oladi (bepul rejada 50 ta). Shuning uchun 20 bilan cheklaymiz —
       ya'ni bir marta 20 000 qatorgacha. Undan kattasi kerak bo'lsa
       `toliq:false` qaytadi va chaqiruvchi buni KO'RADI (jim kesilmaydi).
       Eng katta obyekt hozir ~5000 qator, ya'ni zaxira 4 barobar. */
    const MAX_SORO = 20;

    const baza = supabaseBaseUrl(ctx.env.SUPABASE_URL) + '/rest/v1/' + jadval;
    const boshHeaders = {
      apikey: ctx.env.SUPABASE_KEY,
      Authorization: 'Bearer ' + ctx.env.SUPABASE_KEY,
      Prefer: 'count=exact',
    };

    type SahifaNatija =
      | { bolak: unknown[]; jami: number | null }
      | { failed: true; status: number; detail: string };

    /** Bitta sahifani o'qiydi. Upstream tafsiloti faqat keyingi xavfsiz
     * boundaryga beriladi, brauzerga hech qachon qaytarilmaydi. */
    async function sahifaOl(offset: number, limit: number): Promise<SahifaNatija> {
      const p = new URLSearchParams();
      p.set('select', so.ustunlar || '*');
      if (so.tartib) p.set('order', so.tartib);
      p.set('limit', String(limit));
      p.set('offset', String(offset));
      // Majburiy tenant filtri (server qo'shadi) brauzer filtri bilan AND qilinadi.
      // 2026-10-03: filtrdagi kodlanmagan ASCII bo'lmagan belgilar (kirillcha qidiruv) shu yerda percent-kodlanadi —
      // aks holda so'rov Supabase ga yetmasdan yiqilardi (katalog qidiruvi "keyinroq urinib ko'ring").
      const filtrUrl = (so.filtr || '').replace(/[^\x20-\x7e]+/g, (m) => encodeURIComponent(m));
      const url = baza + '?' + p.toString() + (filtrUrl ? '&' + filtrUrl : '') + (majburiyFiltr ? '&' + majburiyFiltr : '');
      const r = await fetch(url, { headers: boshHeaders });
      const matn = await r.text();
      if (!r.ok) return { failed: true, status: r.status, detail: matn.slice(0, 500) };
      let bolak: unknown[];
      try { bolak = JSON.parse(matn); }
      catch { return { failed: true, status: 502, detail: matn.slice(0, 500) }; }
      const cr = r.headers.get('content-range') || '';
      const jm = cr.split('/')[1];
      return { bolak: Array.isArray(bolak) ? bolak : [],
               jami: (jm && jm !== '*') ? (Number(jm) || null) : null };
    }

    /* ⚠️ 2026-08-17 (2-tuzatish) — SAHIFALAR PARALLEL O'QILADI.
     *
     * Avval sahifalar BIRIN-KETIN so'ralardi. 4937 qatorlik obyektda bu
     * 5 marta borib-kelish demakdi va Supabase tomoni 7.8 soniya chiqdi.
     * Foydalanuvchi haqli savol berdi: «bu aldamayaptimi?».
     *
     * Aldov emas edi — o'lchov halol (Sheets birinchi, ketma-ket, bir xil
     * shart) — LEKIN raqam Postgres tezligini emas, MENING KODIMNING
     * sekinligini ko'rsatardi. Bu ham yomon: noto'g'ri xulosa chiqarish
     * mumkin («Supabase kutganchalik tez emas ekan»).
     *
     * ENDI: birinchi sahifadan `Content-Range` orqali HAQIQIY jamini
     * bilamiz, keyin qolgan sahifalarni BARAVARIGA so'raymiz. Ya'ni
     * kutish vaqti = eng sekin bitta so'rov, yig'indi emas. */
    let qatorlar: unknown[] = [];
    let jamiServerda: number | null = null;
    let soro = 0;

    /* Bosqichma-bosqich vaqt — sekinlik QAYERDA ekanini bilish uchun.
       Taxmin qilmaymiz: birinchi so'rov (aloqa o'rnatish + tarmoq yo'li)
       va qolgan sahifalar (parallel) alohida o'lchanadi. */
    const tBir = Date.now();
    const birinchi = await sahifaOl(0, SORALADI);
    const msBirinchi = Date.now() - tBir;
    let msQolgan = 0;
    soro++;
    if ('failed' in birinchi) {
      return xavfsizUpstream(birinchi.status, birinchi.detail);
    }
    qatorlar = birinchi.bolak || [];
    jamiServerda = birinchi.jami ?? null;

    /* HAQIQIY sahifa hajmi — serverning o'zi nechta berganidan bilinadi.
       Kam bergan bo'lsa: yo hammasi shu (tugadi), yo server chegarasi shu. */
    if (qatorlar.length > 0 && qatorlar.length < SORALADI) SAHIFA = qatorlar.length;

    const olinishiKerak = jamiServerda != null ? Math.min(jamiServerda, kerak) : kerak;

    if (qatorlar.length >= SAHIFA && qatorlar.length < olinishiKerak) {
      /* Qolgan sahifalar ro'yxati — hammasi BIR VAQTDA */
      const vazifalar: Promise<SahifaNatija>[] = [];
      for (let off = qatorlar.length; off < olinishiKerak && vazifalar.length < MAX_SORO - 1;
           off += SAHIFA) {
        vazifalar.push(sahifaOl(off, Math.min(SAHIFA, olinishiKerak - off)));
      }
      soro += vazifalar.length;

      const tQol = Date.now();
      const natijalar = await Promise.all(vazifalar);
      msQolgan = Date.now() - tQol;
      for (const nat of natijalar) {
        if ('failed' in nat) return xavfsizUpstream(nat.status, nat.detail);
        if (nat.bolak?.length) qatorlar = qatorlar.concat(nat.bolak);
      }
    }

    /* HALOL BAYROQ: hammasini oldikmi? Ko'zgu to'liq bo'lmasa
       chaqiruvchi buni bilishi SHART — yarim ma'lumot ustida
       hisob-kitob qilinmasin. */
    const toliq = jamiServerda === null
      ? soro < MAX_SORO
      : qatorlar.length >= jamiServerda;

    /* ⏱ TEZLIK BYUDJETI (2026-09-25, egasi: "har safar tezlatib berish yechim
       emas — tizim moslashishi kerak"). Byudjetdan oshgan o'qish jim qolmaydi:
       Cloudflare logiga tuzilgan yozuv (jadval, obyekt, qator soni, vaqt
       taqsimoti) va javobda `sekin: true`. Baza tomoni:
       supabase/tests/t2_obyekt_read_model_tezlik_contract.sql. */
    const ms = Date.now() - t0;
    const sekin = ms > TEZLIK_BYUDJETI_MS;
    if (sekin) {
      console.warn(JSON.stringify({
        hodisa: 'sb_sekin_oqish', jadval, obyekt_id: mosObyekt ? Number(mosObyekt[1]) : null,
        soni: qatorlar.length, soro, msBirinchi, msQolgan, ms, byudjet: TEZLIK_BYUDJETI_MS,
      }));
    }

    return Response.json({
      ok: true,
      qatorlar,
      soni: qatorlar.length,
      jamiServerda,
      toliq,
      soro,
      /* Vaqt taqsimoti — optimallashtirishni taxmin bilan emas, o'lchov
         bilan qilish uchun. msBirinchi katta bo'lsa muammo TARMOQ
         MASOFASIDA (Supabase regioni), msQolgan katta bo'lsa — HAJMDA. */
      msBirinchi,
      msQolgan,
      ms,
      ...(sekin ? { sekin: true } : {}),
    });
  } catch (err: unknown) {
    return xavfsizUpstream(502, err);
  }
};
