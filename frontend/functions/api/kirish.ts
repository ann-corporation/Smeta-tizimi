import { imzola, SESSIYA_MUDDAT_MS, type Rol } from '../_shared/auth';
import { supabaseBaseUrl } from '../_shared/supabase-url';
import { type KirishEnv, ipBelgi, loginTelefonmi, sbRpc, telefonNorm, yoqilgan } from '../_shared/kirish-emailsiz';

type Env = {
  GAS_URL: string; GAS_TOKEN: string;
  SUPABASE_URL?: string; SUPABASE_KEY?: string;
  SESSIYA_KALIT: string;
};

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  let req: { login?: string; parol?: string; isBoss?: boolean; isSuperadmin?: boolean } = {};
  try {
    req = await ctx.request.json();
  } catch (err) {
    return Response.json({ ok: false, xato: 'Noto\'g\'ri so\'rov formati' }, { status: 400 });
  }
  
  let rol: Rol | null = null;
  // T2-AUTH-GAS-RETIREMENT-001: true only when THIS login's password was
  // just verified by GAS (not by Supabase's own bcrypt hash). Used below to
  // self-heal this login onto the fast Supabase-only path for next time --
  // see supabase/migrations/20261015090000_t2_kirish_gas_parol_kochirish_v1.sql.
  let viaGas = false;

  /* ⚠️ 2026-08-28 XAVFSIZLIK TUZATISHI (Claude, login auditi).
   *
   * AVVAL BU YERDA TO'LIQ AUTENTIFIKATSIYA CHETLAB O'TILARDI:
   *     if (req.isBoss)        { rol = 'boss'; }
   *     else if (req.isSuperadmin) { rol = 'superadmin'; }
   * Ya'ni brauzerdan `{"isSuperadmin": true}` yuborgan HAR QANDAY odam —
   * internetdagi istalgan kishi — PAROLSIZ superadmin sessiyasini olardi.
   * Sayt jonli (smeta-tizimi.pages.dev), demak bu nazariy emas, HAQIQIY
   * ochiq eshik edi.
   *
   * ENDI: `isBoss`/`isSuperadmin` faqat LOGIN NOMINI oldindan to'ldiradi
   * (qulaylik uchun), lekin PAROL baribir talab qilinadi va u avvalgidek
   * GAS orqali tekshiriladi. Ya'ni tugmalar yo'qolmaydi — ular endi
   * parol so'raydi.
   *
   * ⚠️ Rol MIJOZDAN olinmaydi. GAS nima qaytarsa — o'sha. Mijoz
   * `isSuperadmin` yuborib, GAS 'prorab' desa — prorab bo'ladi. */
  let login = req.login || '';
  if (!login && req.isBoss) login = 'boss';
  if (!login && req.isSuperadmin) login = 'Anvar';

  const parol = req.parol || '';

  /* TELEFON + PAROL (20261217200000, KIRISH_TELEFON_YOQILGAN; sukut o'chiq). Login telefon ko'rinishida bo'lsa E.164 ga keltiriladi
   * (+998…), xato urinishlar telefon/IP bo'yicha SQL da limitlanadi va GAS zaxira yo'li BUTUNLAY o'chiriladi (fail-closed):
   * telefon loginlari faqat bazadagi bcrypt xesh bilan tekshiriladi. Email/oddiy login yo'li o'zgarmagan. */
  const telefonYolak = login && parol && yoqilgan((ctx.env as KirishEnv).KIRISH_TELEFON_YOQILGAN) && loginTelefonmi(login) ? telefonNorm(login) : null;
  let telIp: string | null = null;
  const telXato = async () => { if (telefonYolak) await sbRpc(ctx.env as KirishEnv, 't2_kirish_tel_limit_v1', { p_telefon: telefonYolak, p_ip_belgi: telIp, p_xato: true }); };
  if (telefonYolak) {
    login = telefonYolak;
    telIp = await ipBelgi(ctx.request);
    const lim = await sbRpc<{ ok?: boolean; code?: string }>(ctx.env as KirishEnv, 't2_kirish_tel_limit_v1', { p_telefon: telefonYolak, p_ip_belgi: telIp, p_xato: false });
    if (lim.data?.code === 'LIMIT') return Response.json({ ok: false, code: 'LIMIT', xato: 'Juda ko‘p urinish. 15 daqiqadan keyin qayta urinib ko‘ring.' }, { status: 429 });
    if (lim.data?.ok !== true) return Response.json({ ok: false, code: 'CONFIG', xato: 'Server hozircha band. Birozdan so‘ng qayta urinib ko‘ring.' }, { status: 503 });
  }
  if (!login || !parol) {
    return Response.json({ ok: false, xato: 'Логин ва паролни киритинг' }, { status: 400 });
  }

  /* T2-AUTH-PASSWORD-MIGRATION-001 — DUAL-CHECK, ATAYLAB.
   *
   * Incident (2026-09-05): "A'zo qo'shish" Supabaga login+rol yozadi,
   * lekin parolga hech qachon TEGMAYDI (t2_foydalanuvchi da parol maydoni
   * umuman yo'q edi) -- yangi a'zo GAS ning ochiq matnli _XODIMLAR
   * varag'ida ham yo'q, demak TIZIMGA UMUMAN KIRA OLMASDI.
   *
   * Yechim: Supabase'da HASHLANGAN (bcrypt, hech qachon ochiq matn) parol
   * -- lekin MAVJUD hech bir foydalanuvchi buzilmasin. Shuning uchun:
   *   1) Avval Supabase'dan (`t2_parol_tekshir_v1`) so'raymiz.
   *   2) `NO_PASSWORD_SET` bo'lsa -- bu login hali Supabase parolini
   *      OLMAGAN (hozircha HAMMA eski foydalanuvchi shunday) -- ESKI GAS
   *      yo'liga o'tamiz, xatti-harakat O'ZGARMAYDI.
   *   3) Hash BOR bo'lsa (`ok:true` YOKI `PAROL_NOTOGRI`) -- GAS UMUMAN
   *      CHAQIRILMAYDI. Noto'g'ri parol qat'iy rad etiladi, GAS'ga
   *      "orqaga qaytib" tekshirilmaydi -- aks holda Supabase paroli
   *      GAS parolini chetlab o'tishning yashirin yo'liga aylanardi. */
  let supabaseNatija: { ok: boolean; code?: string; foydalanuvchi_id?: number; rol?: string; login?: string } | null = null;
  if (ctx.env.SUPABASE_URL && ctx.env.SUPABASE_KEY) {
    try {
      const rr = await fetch(supabaseBaseUrl(ctx.env.SUPABASE_URL) + '/rest/v1/rpc/t2_parol_tekshir_v1', {
        method: 'POST',
        headers: { apikey: ctx.env.SUPABASE_KEY, Authorization: 'Bearer ' + ctx.env.SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_login: login, p_parol: parol }),
      });
      if (rr.ok) supabaseNatija = await rr.json();
    } catch (err) {
      console.error('[kirish] t2_parol_tekshir_v1 transport:', err);
      // Tarmoq xatosi -- GAS'ga tushamiz (pastdagi umumiy yo'l), Supabase'ni qayta chaqirmaymiz.
    }
  }

  if (supabaseNatija && supabaseNatija.code !== 'NO_PASSWORD_SET') {
    if (supabaseNatija.ok && supabaseNatija.rol) {
      rol = supabaseNatija.rol as Rol;
      /* Hisoblar birlashtirilgan bo'lsa (t2_hisob_birlashtir_v1) parol eski hisobniki, lekin sessiya OMON QOLGAN
       * hisobga beriladi — RPC uning loginini qaytaradi. Oddiy hisobda `login` kelmaydi → o'zgarmaydi. */
      if (supabaseNatija.login) login = supabaseNatija.login;
    } else {
      // Hash BOR, lekin mos kelmadi -- GAS'ga qaytish YO'Q (fail-closed).
      await telXato();
      await new Promise(r => setTimeout(r, 800));
      return Response.json({ ok: false, xato: 'Логин ёки парол нотўғри' }, { status: 401 });
    }
  } else {
    // NO_PASSWORD_SET (yoki Supabase javob bermadi) -- ESKI GAS yo'li.
    if (telefonYolak) {
      // Telefon login: GAS zaxirasi YO'Q. Parolsiz (Telegram orqali ochilgan) yoki mavjud bo'lmagan hisob — bir xil rad.
      await telXato();
      await new Promise(r => setTimeout(r, 800));
      return Response.json({ ok: false, xato: 'Логин ёки парол нотўғри' }, { status: 401 });
    }
    viaGas = true;
    try {
      const r = await fetch(ctx.env.GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          __api: 1,
          token: ctx.env.GAS_TOKEN,
          fn: 'apiKirishTekshir',
          args: [login, parol]
        }),
      });

      const data = await r.json<{ ok: boolean; data: string | null }>();
      if (data.ok && data.data) {
        rol = data.data as Rol;
      }
    } catch (err) {
      console.error('GAS ga bog\'lanishda xato:', err);
    }

    if (!rol) {
      // Brute-force sekinlashtirish
      await new Promise(r => setTimeout(r, 800));
      return Response.json({ ok: false, xato: 'Логин ёки парол нотўғри' }, { status: 401 });
    }
  }

  /* ⚡ 2026-09-02 (T2-COMPANY-CONTEXT-P0-FIX-001) — KANONIK LOGIN.
   *
   * AVVAL "BEST-EFFORT" edi: Supabase o'chib qolsa ham kirish davom
   * etardi, faqat `foydalanuvchi_id` sessiyada bo'lmay qolardi. Bu
   * SPLIT-BRAIN auth yaratardi: login "muvaffaqiyatli", lekin butun
   * kanonik ilova (`/api/company?me=1` -> `t2_men_v1`, KompaniyaProvider,
   * barcha /admin/* sahifalar) `foydalanuvchi_id` majburiy talab qiladi
   * -> hech narsa ishlamaydi.
   *
   * ENDI: kanonik login = GAS parol tasdig'i VA kanonik actor
   * resolution — IKKALASI muvaffaqiyatli bo'lmaguncha sessiya
   * BERILMAYDI. `t2_kirish_royxatga_ol` faqat upsert qiladi (login
   * bo'yicha), tabiatan barqaror; nosozlik = tarmoq/config, retry
   * bilan yopiladi. */
  let foydalanuvchiId: number | undefined;
  let kompaniyalar: { kompaniya_id: number; rol: string }[] | undefined;

  if (!ctx.env.SUPABASE_URL || !ctx.env.SUPABASE_KEY) {
    return Response.json({ ok: false, code: 'CONFIG',
      xato: 'Server sozlanmagan: Supabase (SUPABASE_URL / SUPABASE_KEY). Administrator bilan bog‘laning.' },
      { status: 503 });
  }

  async function actorResolve(): Promise<{ id?: number; az?: { kompaniya_id: number; rol: string }[]; xato?: string }> {
    try {
      const r = await fetch(
        supabaseBaseUrl(ctx.env.SUPABASE_URL!) + '/rest/v1/rpc/t2_kirish_royxatga_ol',
        {
          method: 'POST',
          headers: {
            apikey: ctx.env.SUPABASE_KEY!,
            Authorization: 'Bearer ' + ctx.env.SUPABASE_KEY!,
            'Content-Type': 'application/json',
          },
          /* `p_gas_verified_parol` ONLY when this exact login+password pair
           * was just proven correct by GAS above -- lets the RPC hash and
           * store it (only if this login has no Supabase hash yet), so
           * every LATER login for this user skips GAS entirely. Never sent
           * on the Supabase-native path (hash already exists there). */
          body: JSON.stringify({ p_login: login, p_rol: rol, p_gas_verified_parol: viaGas ? parol : null }),
        });
      const text = await r.text();
      if (!r.ok) {
        console.error('[kirish] t2_kirish_royxatga_ol HTTP', r.status, text.slice(0, 300));
        return { xato: 'HTTP_' + r.status };
      }
      let natija: any = null;
      try { natija = JSON.parse(text); } catch { return { xato: 'INVALID_JSON' }; }
      if (!natija || natija.ok !== true || natija.foydalanuvchi_id == null) {
        console.error('[kirish] t2_kirish_royxatga_ol javob:', text.slice(0, 300));
        return { xato: 'NO_ACTOR' };
      }
      return { id: natija.foydalanuvchi_id, az: natija.azoliklar || [] };
    } catch (err) {
      console.error('[kirish] t2_kirish_royxatga_ol transport:', err);
      return { xato: 'TRANSPORT' };
    }
  }

  let res = await actorResolve();
  if (res.xato) { await new Promise((r) => setTimeout(r, 400)); res = await actorResolve(); }
  if (res.xato || res.id == null) {
    return Response.json({ ok: false, code: 'ACTOR_RESOLVE_FAILED',
      xato: 'Kirish tasdiqlandi, lekin kanonik foydalanuvchi yozuvini olishning iloji bo‘lmadi. '
        + 'Birozdan so‘ng qayta urinib ko‘ring; takrorlansa administratorga ayting.' },
      { status: 502 });
  }
  foydalanuvchiId = res.id;
  kompaniyalar = res.az;

  const secret = ctx.env.SESSIYA_KALIT;
  let token: string;
  try {
    // SECURITY P0: imzola() fails closed if SESSIYA_KALIT is unset/short.
    // Never mint a cookie signed with a guessable key on a public repo.
    token = await imzola({ rol, email: login, foydalanuvchi_id: foydalanuvchiId, kompaniyalar }, secret);
  } catch (err: any) {
    if (err?.code === 'SESSIYA_KALIT_YOQ') {
      return Response.json({ ok: false, code: 'CONFIG',
        xato: 'Server sozlanmagan: SESSIYA_KALIT yo‘q. Cloudflare Pages → Environment variables → SESSIYA_KALIT (Production + Preview), keyin qayta deploy.' },
        { status: 503 });
    }
    throw err;
  }
  return new Response(JSON.stringify({ ok: true, rol }), {
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': `sess=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${Math.floor(SESSIYA_MUDDAT_MS / 1000)}`,
    },
  });
};
