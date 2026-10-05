/**
 * royxat-ozi.ts — O'ZI RO'YXATDAN O'TISH (egasi, 2026-10-02: "tashqaridan kiradigan odam mening aralashuvimsiz
 * demoda sinab ko'ra olishi kerak").
 *
 * Login'dan OLDIN chaqiriladigan ikkinchi ochiq nuqta — shuning uchun JUDA TOR:
 *   • bitta RPC (`t2_ozi_royxat_v1`): foydalanuvchi (bcrypt parol) + o'z kompaniyasi (boss) + bepul tarif
 *     tokenlari + (egasi tanlagan bo'lsa) demo obyekt nusxasi — bitta tranzaksiyada;
 *   • qurilma (IP xeshi) bo'yicha sutkasiga 5 ta (RPC ichida);
 *   • sessiya BU YERDA BERILMAYDI — klient keyin odatdagi `/api/kirish` dan o'tadi (parol bazadagi xesh bilan
 *     tekshiriladi), ya'ni yangi auth yo'li ochilmaydi.
 */
import { supabaseBaseUrl } from '../_shared/supabase-url';

type Env = { SUPABASE_URL: string; SUPABASE_KEY: string; SESSIYA_KALIT: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  let so: { login?: string; parol?: string; ism?: string; telefon?: string; kompaniya?: string; operation_id?: string; tasdiqlash_id?: string; kod?: string } = {};
  try { so = await ctx.request.json(); } catch { return Response.json({ ok: false, xabar: 'Noto\'g\'ri so\'rov formati' }, { status: 400 }); }

  const login = String(so.login || '').trim().toLowerCase().slice(0, 80);
  const parol = String(so.parol || '').slice(0, 200);
  const ism = String(so.ism || '').trim().slice(0, 200);
  const telefon = String(so.telefon || '').trim().slice(0, 40);
  const kompaniya = String(so.kompaniya || '').trim().slice(0, 200);
  if (!login || !parol || !ism) return Response.json({ ok: false, xabar: 'Email, parol va ism majburiy' }, { status: 400 });
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(login)) return Response.json({ ok: false, xabar: 'Ro‘yxatdan o‘tish uchun email manzili kerak' }, { status: 400 });
  if (!UUID.test(String(so.operation_id || ''))) return Response.json({ ok: false, xabar: 'operation_id kerak' }, { status: 400 });
  if (!UUID.test(String(so.tasdiqlash_id || '')) || !/^\d{6}$/.test(String(so.kod || ''))) return Response.json({ ok: false, xabar: 'Emailga yuborilgan 6 xonali kodni kiriting' }, { status: 400 });
  if (!ctx.env.SUPABASE_URL || !ctx.env.SUPABASE_KEY || !ctx.env.SESSIYA_KALIT) return Response.json({ ok: false, xabar: 'Ro\'yxatdan o\'tish xizmati hozircha ulanmagan' }, { status: 503 });

  // IP to'liq saqlanmaydi — faqat suiiste'molni sanash uchun xesh belgi.
  const ip = ctx.request.headers.get('CF-Connecting-IP') || '';
  let ipBelgi: string | null = null;
  if (ip) {
    const xesh = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip + '|t2ozi'));
    ipBelgi = [...new Uint8Array(xesh)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(ctx.env.SESSIYA_KALIT), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(String(so.kod) + '|' + login));
  const kodXesh = [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, '0')).join('');

  try {
    const r = await fetch(supabaseBaseUrl(ctx.env.SUPABASE_URL) + '/rest/v1/rpc/t2_ozi_royxat_email_tasdiqla_v1', {
      method: 'POST',
      headers: { apikey: ctx.env.SUPABASE_KEY, Authorization: 'Bearer ' + ctx.env.SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_tasdiqlash_id: so.tasdiqlash_id, p_kod_xesh: kodXesh, p_login: login, p_parol: parol, p_ism: ism, p_telefon: telefon || null, p_kompaniya_nom: kompaniya || null, p_ip_belgi: ipBelgi, p_operation_id: so.operation_id }),
    });
    const d = await r.json().catch(() => null) as { ok?: boolean; code?: string; xabar?: string; login?: string; demo_obyekt_id?: number | null } | null;
    if (!r.ok || !d) return Response.json({ ok: false, xabar: 'Ro\'yxatdan o\'tkazib bo\'lmadi. Keyinroq urinib ko\'ring.' }, { status: 502 });
    if (!d.ok) return Response.json({ ok: false, code: d.code, xabar: d.xabar || d.code || 'Ro\'yxatdan o\'tkazib bo\'lmadi' }, { status: 400 });
    return Response.json({ ok: true, login: d.login, demo: d.demo_obyekt_id != null });
  } catch {
    return Response.json({ ok: false, xabar: 'Tarmoq xatosi' }, { status: 502 });
  }
};
