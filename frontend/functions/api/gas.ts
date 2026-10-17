import { cachedAuthority } from '../_shared/permission-policy';
import { tekshir } from '../_shared/auth';

export const onRequestPost: PagesFunction<{
  GAS_URL: string; GAS_TOKEN: string; SESSIYA_KALIT: string;
}> = async (ctx) => {
  try {
    const { fn, args } = await ctx.request.json<{ fn: string; args?: unknown[] }>();

    const secret = ctx.env.SESSIYA_KALIT;
    const sess = cachedAuthority(ctx) ?? await tekshir(ctx.request.headers.get('Cookie'), secret);
    if (!sess) {
      return Response.json({ ok: false, error: 'Кириш талаб қилинади' }, { status: 401 });
    }

    // ⚠️ DIQQAT: bu ro'yxat FAQAT yozuvchi funksiyalarni bloklashi kerak.
    // Prefiks bilan yozganda ("Texnika") o'qish funksiyasi (apiTexnikaDashboard)
    // ham tasodifan bloklanib qoladi — shuning uchun har biri to'liq yoziladi.
    const YOZUVCHI = new RegExp('^api(' + [
      // Smeta / F2
      'HolatSaqla', 'BlQosh', 'RsQosh', 'RzQosh', 'OyQosh', 'SmetaQatorQosh',
      'F2Qolla', 'F2QollaNavbatga', 'F2BoglanishBekorQil', 'F2OyOchirish',
      'Lock[A-Za-z]*',
      // Shartnoma / Buxgalteriya
      'ShartnomaSaqla', 'ShartnomaOchir', 'ShartnomaBogSaqla',
      'QoshIshSaqla', 'QoshIshOchir', 'TolovSaqla', 'TolovOchir', 'TolovTahrir',
      'XarajatYoz', 'XarajatOchir',
      // Narx / ierarxiya / sozlama
      'NarxlarSaqla', 'NarxBelgilanganSaqla', 'NarxKatSaqla', 'NarxSanaQosh',
      'DarajalarSaqla', 'ReestrSaqla', 'SozlamaSaqla', 'StavkaSaqla',
      'OraliqlarSaqla', 'SvodUstunSaqla', 'KategoriyaSaqla', 'NakrutkaSaqla',
      // Sklad
      'SkladYoz', 'SkladOchir', 'PrixodYoz', 'RashodYoz', 'RashodYozMass',
      // Dvigatelni ishga tushirish (og'ir yozuv operatsiyasi)
      'ObyektIshla', 'ObyektFonIshla', 'ObyektTezkorIshla', 'ObyektTezkorFonIshla',
      'BarchaIshla', 'BarchaFonIshla', 'BarchaTezkorIshla', 'NavbatToxtat',
      // ERP
      'IshchiQosh', 'IshchiTahrir', 'IshchiOchir', 'TabelBelgila',
      'TexnikaQosh', 'TexnikaTahrir', 'TexnikaTarixQosh',
      'ZayavkaQosh', 'ZayavkaHolatYangila',
      'PostavshikQosh', 'PostavshikTahrir',
      'NuqsonQosh', 'NuqsonHolatYangila',
      // Obyekt hujjatlari (Drive dual-storage nusxasi)
      'ObyektHujjatDriveSaqla',
    ].join('|') + ')$');
    if ((sess.rol === 'boss' || sess.rol === 'rahbar') && YOZUVCHI.test(fn)) {
      return Response.json({ ok: false, error: 'Раҳбар режимида ёзиш мумкин эмас' }, { status: 403 });
    }

    /* STOR-001: the actor id is authoritative from the signed session, never
     * from the client. Storage commands (apiT2*Storage* / apiT2*Obyekt* /
     * apiT2Document*) resolve their T2 actor from here so a caller cannot
     * assert someone else's identity. */
    let safeArgs: unknown[] = args ?? [];
    if (/^apiT2([A-Za-z0-9]*Storage|YangiObyektYarat|Obyekt(Yarat|Papka)|DocumentUpload|F2Upload|LoyihaStorage)/.test(fn)
        && sess.foydalanuvchi_id != null
        && safeArgs.length > 0 && typeof safeArgs[0] === 'object' && safeArgs[0] !== null && !Array.isArray(safeArgs[0])) {
      safeArgs = [{ ...(safeArgs[0] as Record<string, unknown>), actorId: sess.foydalanuvchi_id }, ...safeArgs.slice(1)];
    }

    if (!ctx.env.GAS_URL) {
      return new Response(JSON.stringify({ ok: false, error: 'Cloudflare muhitida GAS_URL kiritilmagan (Environment Variables)' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const r = await fetch(ctx.env.GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ __api: 1, token: ctx.env.GAS_TOKEN, fn, args: safeArgs, kim: sess.email || '' }),
    });

    const text = await r.text();
    
    // Agar Google 302/HTML qaytarsa, u JSON emas. Shuni ushlaymiz.
    if (text.trim().startsWith('<')) {
      return new Response(JSON.stringify({ ok: false, error: 'GAS HTML qaytardi: ' + text.slice(0, 300) }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(text, {
      headers: {
        'Content-Type': 'application/json'
      },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: 'Cloudflare xatosi: ' + err.message }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
