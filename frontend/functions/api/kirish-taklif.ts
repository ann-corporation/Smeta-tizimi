/**
 * kirish-taklif.ts — KOMPANIYA ADMINI TAKLIFI ORQALI EMAILSIZ KIRISH (egasi 2026-11-13: «email/gmail siz kira olmaydi»).
 *
 * POST { amal:'yarat', kompaniya_id, ism, telefon, rol, muddat_soat? }  → admin/boss/kadr: bir martalik kod (8 xona) + havola
 * POST { amal:'royxat', kompaniya_id } | { amal:'bekor', kompaniya_id, taklif_id }                    → admin ro'yxati / bekor
 * POST { amal:'qabul', token | (telefon + kod), parol }  → KIRMASDAN: taklif egasi o'z parolini o'rnatadi, a'zolik AYNAN taklif roli bilan;
 *                                                           odatdagi sess cookie beriladi (kirish.ts bilan bir xil imzola)
 * POST { amal:'ulash', token | (telefon + kod) }          → MAVJUD hisob egasi o'z sessiyasi bilan taklifni qabul qiladi (jim ulanmaydi)
 *
 * Xavfsizlik: server sozlamasi KIRISH_TAKLIF_YOQILGAN (sukut — o'chiq); origin tekshiruvi; kod/token bazada faqat HMAC xesh;
 * actor har doim sessiyadan + yangi DB vakolati (roleAuthority), mijoz yuklamasidan emas; rol mijozdan faqat NOMI sifatida
 * keladi va SQL da katalog/ko'tarilmaslik bilan tekshiriladi; qabulda javoblar telefon/taklif bor-yo'qligini bildirmaydi (TAKLIF_RAD).
 * Limitlar (telefon / IP-xesh / kompaniya / taklif qiluvchi) va urinish bloklash — SQL da (20261217200000).
 */
import { imzola, tekshir, type Rol } from '../_shared/auth';
import { roleAuthority, sessiyaYaroqsizmi, yaroqsizSessiyaJavob } from '../_shared/role-authority';
import {
  type KirishEnv, TOKEN_FORMAT, UUID, ipBelgi, json, kalitYaroqli, originYaroqsiz, raqamliKod, sbRpc, sessCookie, taklifMuddatSoat,
  tasodifiyToken, telefonNorm, xesh, yoqilgan,
} from '../_shared/kirish-emailsiz';

type Env = KirishEnv;
type RpcNatija = { ok?: boolean; code?: string; [k: string]: unknown };

const XABAR: Record<string, string> = {
  RUXSAT_YOQ: 'Odam taklif qilish uchun ruxsatingiz yo‘q.',
  TELEFON_NOTOGRI: 'Telefon raqamini +998 XX XXX XX XX ko‘rinishida kiriting.',
  ISM_NOTOGRI: 'Ismni kiriting (2–120 belgi).',
  ROL_NOTOGRI: 'Bu lavozimni taklif orqali berib bo‘lmaydi.',
  LIMIT: 'Juda ko‘p urinish. Birozdan keyin qayta urinib ko‘ring.',
  KOP_TAKLIF: 'Kutayotgan takliflar juda ko‘p. Avval keraksizlarini bekor qiling.',
  ALLAQACHON_AZO: 'Bu odam allaqachon shu kompaniya a‘zosi.',
  TAKLIF_RAD: 'Kod yoki havola noto‘g‘ri, muddati tugagan yoki ishlatilgan.',
  HISOB_BOR: 'Bu raqam bilan hisob allaqachon bor. Avval o‘sha hisobga kiring, so‘ng taklifni «Mavjud hisobga ulash» orqali qabul qiling.',
  PAROL_QISQA: 'Parol kamida 8 belgidan iborat bo‘lsin.', PAROL_UZUN: 'Parol juda uzun.', PAROL_OSON: 'Parol juda oddiy. Boshqasini tanlang.',
  PAROL_TELEFON: 'Parol telefon raqamingizni o‘z ichiga olmasin.', PAROL_KOD: 'Parol taklif kodiga teng bo‘lmasin.',
};
const holat = (code?: string): number => code === 'LIMIT' ? 429 : code === 'RUXSAT_YOQ' || code === 'AUTH_REQUIRED' ? 403 : code === 'HISOB_BOR' || code === 'ALLAQACHON_AZO' ? 409 : 400;
const rad = (code?: string) => json({ ok: false, code: code || 'XATO', xabar: XABAR[code || ''] || 'Bajarib bo‘lmadi.' }, holat(code));

async function actorId(req: Request, env: Env): Promise<{ id: number; sess: NonNullable<Awaited<ReturnType<typeof tekshir>>> } | Response> {
  const s = await tekshir(req.headers.get('Cookie'), String(env.SESSIYA_KALIT)).catch(() => null);
  if (!s || !Number.isSafeInteger(s.foydalanuvchi_id) || Number(s.foydalanuvchi_id) <= 0) return json({ ok: false, code: 'AUTH_REQUIRED' }, 401);
  const a = await roleAuthority(s, env as never);
  if (!a && sessiyaYaroqsizmi(s)) return yaroqsizSessiyaJavob();
  if (!a) return json({ ok: false, code: 'AUTHORITY_UNAVAILABLE' }, 503);
  return { id: Number(s.foydalanuvchi_id), sess: s };
}

/** GET — sozlama holati (maxfiy qiymatsiz): UI taklif/telefon kirishini ko'rsatsinmi. */
export const onRequestGet: PagesFunction<Env> = async (ctx) => json({
  ok: true, taklif: yoqilgan(ctx.env.KIRISH_TAKLIF_YOQILGAN), telefon: yoqilgan(ctx.env.KIRISH_TELEFON_YOQILGAN), telegram: yoqilgan(ctx.env.KIRISH_TELEGRAM_YOQILGAN),
});

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const { env, request } = ctx;
  if (originYaroqsiz(request)) return json({ ok: false, code: 'ORIGIN_INVALID' }, 403);
  if (!yoqilgan(env.KIRISH_TAKLIF_YOQILGAN)) return json({ ok: false, code: 'YOQILMAGAN', xabar: 'Taklif orqali kirish hali yoqilmagan.' }, 503);
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY || !kalitYaroqli(env.SESSIYA_KALIT)) return json({ ok: false, code: 'SOZLANMAGAN', xabar: 'Server sozlanmagan.' }, 503);
  let b: Record<string, unknown> = {};
  try { b = await request.json() as Record<string, unknown>; } catch { return json({ ok: false, code: 'BODY_INVALID' }, 400); }
  if (!b || typeof b !== 'object') return json({ ok: false, code: 'BODY_INVALID' }, 400);
  const kalit = String(env.SESSIYA_KALIT);
  const amal = String(b.amal || '');
  const kompaniyaId = Number(b.kompaniya_id);

  if (amal === 'yarat' || amal === 'royxat' || amal === 'bekor') {
    if (!Number.isSafeInteger(kompaniyaId) || kompaniyaId <= 0) return json({ ok: false, code: 'KOMPANIYA_KERAK' }, 400);
    const a = await actorId(request, env); if (a instanceof Response) return a;

    if (amal === 'royxat') {
      const r = await sbRpc<RpcNatija>(env, 't2_kirish_taklif_royxat_v1', { p_actor_id: a.id, p_kompaniya_id: kompaniyaId });
      if (!r.data || r.status >= 500 || !r.data.ok) return rad(r.data?.code || 'RUXSAT_YOQ');
      return json({ ok: true, takliflar: r.data.takliflar });
    }
    if (amal === 'bekor') {
      const id = Number(b.taklif_id);
      if (!Number.isSafeInteger(id) || id <= 0) return json({ ok: false, code: 'TAKLIF_KERAK' }, 400);
      const r = await sbRpc<RpcNatija>(env, 't2_kirish_taklif_bekor_v1', { p_actor_id: a.id, p_kompaniya_id: kompaniyaId, p_taklif_id: id });
      if (!r.data || !r.data.ok) return rad(r.data?.code || 'TOPILMADI');
      return json({ ok: true });
    }
    // yarat
    const tel = telefonNorm(b.telefon);
    if (!tel) return rad('TELEFON_NOTOGRI');
    const ism = String(b.ism ?? '').trim().slice(0, 120);
    const rol = String(b.rol ?? '').trim().slice(0, 40);
    const muddat = Number.isFinite(Number(b.muddat_soat)) && Number(b.muddat_soat) >= 1 ? Math.min(Math.floor(Number(b.muddat_soat)), taklifMuddatSoat(env)) : taklifMuddatSoat(env);
    const opId = UUID.test(String(b.operation_id || '')) ? String(b.operation_id) : crypto.randomUUID();
    const kod = raqamliKod(8);
    const token = tasodifiyToken(24);
    const r = await sbRpc<RpcNatija>(env, 't2_kirish_taklif_yarat_v1', {
      p_actor_id: a.id, p_kompaniya_id: kompaniyaId, p_ism: ism, p_telefon: tel, p_rol: rol,
      p_kod_xesh: await xesh('taklif-kod', kod, kalit, tel), p_token_xesh: await xesh('taklif-token', token, kalit), p_muddat_soat: muddat, p_operation_id: opId,
    });
    if (!r.data || !r.data.ok) return rad(r.data?.code || 'XATO');
    if (r.data.takror) return json({ ok: true, takror: true, taklif_id: r.data.taklif_id, xabar: 'Bu so‘rov allaqachon bajarilgan; kod qayta ko‘rsatilmaydi.' });
    // Kod va havola FAQAT shu javobda (bir marta). Bazada faqat xesh.
    const sayt = new URL(request.url).origin;
    return json({ ok: true, taklif_id: r.data.taklif_id, tugaydi: r.data.tugaydi, telefon: r.data.telefon, kod, havola: `${sayt}/taklif/${token}` });
  }

  if (amal === 'qabul' || amal === 'ulash') {
    const token = typeof b.token === 'string' ? b.token.trim() : '';
    const tel = telefonNorm(b.telefon);
    const kod = String(b.kod ?? '').replace(/\s+/g, '');
    const tokenRejimi = token !== '';
    if (tokenRejimi ? !TOKEN_FORMAT.test(token) : !(tel && /^\d{8}$/.test(kod))) return rad('TAKLIF_RAD');
    const kodXesh = tokenRejimi ? null : await xesh('taklif-kod', kod, kalit, String(tel));
    const tokenXesh = tokenRejimi ? await xesh('taklif-token', token, kalit) : null;
    const ip = await ipBelgi(request);
    const opId = UUID.test(String(b.operation_id || '')) ? String(b.operation_id) : crypto.randomUUID();

    if (amal === 'ulash') {
      const a = await actorId(request, env); if (a instanceof Response) return a;
      const r = await sbRpc<RpcNatija & { azoliklar?: { kompaniya_id: number; rol: string }[]; foydalanuvchi_id?: number }>(env, 't2_kirish_taklif_ulash_v1', {
        p_actor_id: a.id, p_token_xesh: tokenXesh, p_telefon: tokenRejimi ? null : tel, p_kod_xesh: kodXesh, p_ip_belgi: ip, p_operation_id: opId,
      });
      if (!r.data || !r.data.ok) return rad(r.data?.code || 'TAKLIF_RAD');
      // Yangi a'zolik sessiyaga kirishi uchun cookie qayta imzolanadi (rol/email o'zgarmaydi; faqat kompaniyalar ro'yxati).
      let sess: string;
      try { sess = await imzola({ rol: a.sess.rol as Rol, email: a.sess.email, foydalanuvchi_id: a.id, kompaniyalar: r.data.azoliklar || [] }, kalit); }
      catch { return json({ ok: false, code: 'CONFIG' }, 503); }
      return json({ ok: true, kompaniya_id: r.data.kompaniya_id, rol: r.data.rol }, 200, { 'Set-Cookie': sessCookie(sess) });
    }

    const parol = String(b.parol ?? '').slice(0, 200);
    if (!parol) return rad('PAROL_QISQA');
    if (!tokenRejimi && parol.replace(/\s+/g, '') === kod) return rad('PAROL_KOD');
    const r = await sbRpc<RpcNatija & { foydalanuvchi_id?: number; login?: string; rol?: string; azoliklar?: { kompaniya_id: number; rol: string }[] }>(env, 't2_kirish_taklif_qabul_v1', {
      p_token_xesh: tokenXesh, p_telefon: tokenRejimi ? null : tel, p_kod_xesh: kodXesh, p_parol: parol, p_ip_belgi: ip, p_operation_id: opId,
    });
    if (!r.data) return json({ ok: false, code: 'SERVER_XATO', xabar: 'Server bilan aloqa yo‘q. Qayta urinib ko‘ring.' }, 502);
    if (!r.data.ok || !r.data.foydalanuvchi_id || !r.data.login || !r.data.rol) return rad(r.data.code || 'TAKLIF_RAD');
    let sess: string;
    try { sess = await imzola({ rol: r.data.rol as Rol, email: r.data.login, foydalanuvchi_id: r.data.foydalanuvchi_id, kompaniyalar: r.data.azoliklar || [] }, kalit); }
    catch { return json({ ok: false, code: 'CONFIG', xabar: 'Server sozlanmagan (SESSIYA_KALIT).' }, 503); }
    return json({ ok: true, yangi: true, rol: r.data.rol }, 200, { 'Set-Cookie': sessCookie(sess) });
  }

  return json({ ok: false, code: 'AMAL_NOMALUM' }, 400);
};
