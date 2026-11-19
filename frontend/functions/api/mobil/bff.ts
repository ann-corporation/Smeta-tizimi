import { imzola, sessiyaOl, SESSIYA_MUDDAT_MS } from '../../_shared/auth';
import { base64url, DESKTOP_SESSION_MS, desktopDenyCode, desktopFail, desktopRpc, deviceHash, ilovaVersiya, verifiedDesktopDevice, type DesktopEnv } from '../../_shared/desktop-device';
import { onRequest as existingMiddleware } from '../_middleware';
import { onRequestGet as sessionGet } from '../sessiya';
import { onRequestGet as packetGet } from '../obyekt-paket';
import { onRequestGet as tugunSummaGet } from '../obyekt-tugun-summa';
import { onRequestPost as sbPost } from '../sb';
import { onRequestGet as companyGet, onRequestPost as companyPost } from '../company';
import { onRequestPost as writePost } from '../sb-yoz';
import { onRequestGet as workplaceGet, onRequestPost as workplacePost } from '../ish-joyi';
import { onRequestGet as modulesGet, onRequestPost as modulesPost } from '../modullarim';
import { onRequestGet as hujjatAylanishGet, onRequestPost as hujjatAylanishPost } from '../hujjat-aylanish';
import { onRequestGet as fotoDalilGet, onRequestPost as fotoDalilPost } from '../foto-dalil';
import { onRequestGet as profilGet, onRequestPost as profilPost } from '../profil';
import { onRequestPost as kirishTaklifPost } from '../kirish-taklif';
import { onRequestPost as aiSavolPost } from '../ai-savol';
import { onRequestPost as agentIshPost } from '../agent-ish';
import { onRequestGet as qulfGet, onRequestPost as qulfPost } from '../qulf';
import { onRequestGet as hujjatRoyxatGet } from '../hujjat-royxat';
import { onRequestGet as hujjatOlGet } from '../hujjat-ol';
import { onRequestGet as hujjatMaydoniGet, onRequestPost as hujjatMaydoniPost } from '../hujjat-maydoni';
import { onRequestGet as hujjatMaydoniOlGet } from '../hujjat-maydoni-ol';
import { onRequestPost as hujjatBuyruqPost } from '../hujjat-buyruq';
import { onRequestPost as hujjatYaratPost } from '../hujjat-yarat';
import { onRequestGet as tomonGet, onRequestPost as tomonPost } from '../tomon';
import { onRequestGet as telegramGet, onRequestPost as telegramPost } from '../telegram/index';
import { onRequestPost as omborBuyruqPost } from '../ombor-buyruq';
import { onRequestPost as omborOvozPost } from '../ombor-ovoz';
import { onRequestPost as f2BuyruqPost } from '../f2-buyruq';
import { onRequestGet as tekshiruvGet, onRequestPost as tekshiruvPost } from '../tekshiruv';
import { onRequestPost as yukTashishPost } from '../yuk-tashish';
import { yukTashishAmalmi } from '../../_shared/yuk-tashish';

// Native Android BFF (P0). Same trust model as api/desktop/bff.ts: verified device Bearer -> server-only cookie -> unchanged
// middleware + handler. Roles never come from the token; the unchanged middleware derives fresh authority from the database.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Env = DesktopEnv & Record<string, any>;
// Static imports only. This is not a network proxy and cannot reach arbitrary URLs.
const handlers: Record<string, Record<string, PagesFunction<Env>>> = {
  '/api/sessiya': { GET: sessionGet },
  '/api/ish-joyi': { GET: workplaceGet, POST: workplacePost },
  '/api/modullarim': { GET: modulesGet, POST: modulesPost },
  '/api/company': { GET: companyGet, POST: companyPost },
  '/api/sb': { POST: sbPost },
  '/api/sb-yoz': { POST: writePost },
  '/api/obyekt-paket': { GET: packetGet },
  '/api/obyekt-tugun-summa': { GET: tugunSummaGet },
  '/api/hujjat-aylanish': { GET: hujjatAylanishGet, POST: hujjatAylanishPost },
  '/api/foto-dalil': { GET: fotoDalilGet, POST: fotoDalilPost },
  '/api/profil': { GET: profilGet, POST: profilPost },
  '/api/kirish-taklif': { POST: kirishTaklifPost },
  '/api/ai-savol': { POST: aiSavolPost },
  '/api/agent-ish': { POST: agentIshPost },
  '/api/qulf': { GET: qulfGet, POST: qulfPost },
  // P6 documents: canonical registry list + binary download (F-2 PDF/Excel, drawings). GET only; same authorization as the web, bytes stream through unchanged.
  '/api/hujjat-royxat': { GET: hujjatRoyxatGet },
  '/api/hujjat-ol': { GET: hujjatOlGet },
  // Hujjat maydoni (Disk): ro'yxat/amallar JSON, yuklab olish, Jarvis vositalari; yuklash (multipart) ilova uchun keyingi bosqich.
  '/api/hujjat-maydoni': { GET: hujjatMaydoniGet, POST: hujjatMaydoniPost },
  '/api/hujjat-maydoni-ol': { GET: hujjatMaydoniOlGet },
  '/api/hujjat-buyruq': { POST: hujjatBuyruqPost },
  // Yagona hujjat dvigateli: server tayyor XLSX/PDF qaytaradi (ro'yxat ham serverdan); ilovada shablon yo'q.
  '/api/hujjat-yarat': { POST: hujjatYaratPost },
  // P10: texnadzor acceptance (tomon: nazorat sections + decision) and notification preferences (telegram: holat + sozlama). Allow-listed below.
  '/api/tomon': { GET: tomonGet, POST: tomonPost },
  '/api/telegram': { GET: telegramGet, POST: telegramPost },
  // Omborchi yagona nuqtasi (matn/ovoz buyrug'i, eslatma, ostatka, tasdiq). Ruxsat/aktor serverda (sessiya cookie'si BFF'dan); ovoz JSON udio_b64 sifatida.
  '/api/ombor-buyruq': { POST: omborBuyruqPost },
  // Jarvis ovozli kiritish: faqat matnga aylantirish (hech narsa yozilmaydi); ovoz JSON audio_b64 sifatida.
  '/api/ombor-ovoz': { POST: omborOvozPost },
  // Jarvis F2/fakt vositalari (smeta MCP o'qish + yozish): yozish faqat server dry_run preview + tasdiq tokeni bilan; ruxsat/aktor/token serverda.
  '/api/f2-buyruq': { POST: f2BuyruqPost },
  '/api/tekshiruv': { GET: tekshiruvGet, POST: tekshiruvPost },
  // Logistika yuk birjasi (haydovchi/yuk egasi): web bilan bir xil handler; aktor sessiyadan, ruxsat/tenant RPC ichida. Faqat oq ro'yxatdagi amallar.
  '/api/yuk-tashish': { POST: yukTashishPost },
} as never;
export const MOBIL_PATH = /^\/api\/(sessiya|ish-joyi|modullarim|company|sb|sb-yoz|obyekt-paket|obyekt-tugun-summa|hujjat-aylanish|foto-dalil|profil|kirish-taklif|ai-savol|agent-ish|qulf|hujjat-royxat|hujjat-ol|hujjat-maydoni|hujjat-maydoni-ol|hujjat-buyruq|hujjat-yarat|tomon|telegram|ombor-buyruq|ombor-ovoz|f2-buyruq|tekshiruv|yuk-tashish)(?:\?[^#\s]*)?$/;
/** /api/profil also hosts account-security actions (parol, google/telegram ulash, hisob_birlashtir, usul_uz, birlashtir_*): the native device token may NOT reach them.
 *  Exposed: GET (own profile + session window), the @username / people-search / invite-answer actions (USERNAME_V1), `yangila` (name, phone, language, avatar colour)
 *  and `boshqa_sessiyalar_chiqish` (sign out everywhere; the BFF re-enrols THIS device so it stays signed in, see reissueDevice). */
export const MOBIL_PROFIL_AMAL: ReadonlySet<string> = new Set(['username_ol','username_tekshir','username_belgila','username_sozlama','qidir','kompaniyadosh_qidir','username_ommaviy','taklif_royxat','taklif_javob','yangila','boshqa_sessiyalar_chiqish']);
/** /api/tomon: only the texnadzor (technical supervision) read sections and the acceptance decisions an external party needs. Authorization (membership, power of attorney, quality.decide) stays in the RPCs. */
export const MOBIL_TOMON_OQISH: ReadonlySet<string> = new Set(['nazorat_uy','nazorat_holat','nazorat_tayinlar','taqdimlar','taqdim','aloqalar','f2_tekshiruv','aosr_korik','tekshiruvlar','tekshiruv','izohlar','bugun']);
export const MOBIL_TOMON_YOZISH: ReadonlySet<string> = new Set(['nazorat_qaror','izoh','qator_izoh']);
/** /api/telegram: status + notification preferences only (never kod / uz / admin_*). */
export const MOBIL_TELEGRAM_AMAL: ReadonlySet<string> = new Set(['sozlama']);
/** /api/ombor-buyruq: omborchi buyrug'i va o'qishlar. eksport (ikkilik fayl, token yechiladi) va lias (variant birlashtirish) qurilmaga ochilmaydi. Ruxsat va yozish tokeni serverda. */
export const MOBIL_OMBOR_AMAL: ReadonlySet<string> = new Set(['kontekst','qoldiq','royxat','tarix','eslatma','taklif','hisobot','vosita','narx_qoy','tahlil','tasdiq','yoz','tuzat']);
/** /api/f2-buyruq: Jarvis F2/fakt vositalari. `vosita` (o'qish yoki preview) va `tasdiq` (token + tasdiqlayman). Ruxsat, aktor, token yechish serverda. */
export const MOBIL_F2_AMAL: ReadonlySet<string> = new Set(['vosita', 'tasdiq']);
/** /api/tekshiruv: only the PTO side of the F-2 editor (the texnadzor suggestions of one act and the PTO decision qabul | rad | keyinroq). The token-based inspector actions (saqla, holat, kod_ber, kod_ol, bog, import, hujjat) stay web-only. Ruxsat serverda (RPC). */
export const MOBIL_TEKSHIRUV_YOZISH: ReadonlySet<string> = new Set(['qaror']);
/** /api/kirish-taklif is public-by-design (qabul = sign-up without a session): the device may only reach yarat (director creates a phone invite link/code). */
export const MOBIL_TAKLIF_AMAL: ReadonlySet<string> = new Set(['yarat']);
const amalRuxsat = (amallar: ReadonlySet<string>, method: string, body: unknown): boolean => {
  if (method !== 'POST') return false;
  try { const o = typeof body === 'string' ? JSON.parse(body) : body; return !!o && typeof o === 'object' && typeof (o as { amal?: unknown }).amal === 'string' && amallar.has((o as { amal: string }).amal); } catch { return false; }
};
/** /api/yuk-tashish: faqat _shared/yuk-tashish AMALLAR oq ro'yxatidagi amal (web bilan bir xil); noma'lum amal serverga yetmaydi. */
const yukTashishAmalRuxsat = (body: unknown): boolean => {
  try { const o = typeof body === 'string' ? JSON.parse(body) : body; return !!o && typeof o === 'object' && yukTashishAmalmi((o as { amal?: unknown }).amal); } catch { return false; }
};
/** /api/agent-ish also hosts admin/superadmin actions (models, budgets, rules, rivojlanish...): the device may reach ONLY the Jarvis chat (kasb_savol, same aiHisobli charging) and the server-side chat list/save (t2_jarvis_suhbat), identical to web. */
export const MOBIL_AGENT_AMAL: ReadonlySet<string> = new Set(['kasb_savol','suhbat_sync','suhbat_page','suhbat_mutate','suhbat_royxat','suhbat_ol','suhbat_saqla','suhbat_ochir']);
export const MOBIL_BFF_MAX_BYTES = 2 * 1024 * 1024;

/** Per-path action gate on top of the path allow-list. GET /api/profil and GET /api/telegram are read-only own-account status. */
export function yolRuxsat(target: URL, method: string, body: unknown): boolean {
  switch (target.pathname) {
    case '/api/profil': return method === 'GET' || amalRuxsat(MOBIL_PROFIL_AMAL, method, body);
    case '/api/kirish-taklif': return amalRuxsat(MOBIL_TAKLIF_AMAL, method, body);
    case '/api/agent-ish': return amalRuxsat(MOBIL_AGENT_AMAL, method, body);
    case '/api/ombor-buyruq': return amalRuxsat(MOBIL_OMBOR_AMAL, method, body);
    case '/api/f2-buyruq': return amalRuxsat(MOBIL_F2_AMAL, method, body);
    case '/api/tekshiruv': return method === 'GET' ? target.searchParams.get('amal') === 'akt' : amalRuxsat(MOBIL_TEKSHIRUV_YOZISH, method, body);
    case '/api/ombor-ovoz': return method === 'POST';
    case '/api/yuk-tashish': return method === 'POST' && yukTashishAmalRuxsat(body);
    case '/api/telegram': return method === 'GET' || amalRuxsat(MOBIL_TELEGRAM_AMAL, method, body);
    case '/api/tomon': return method === 'GET' ? MOBIL_TOMON_OQISH.has(target.searchParams.get('bolim') ?? '') : amalRuxsat(MOBIL_TOMON_YOZISH, method, body);
    default: return true;
  }
}

const bodyAmal = (body: unknown): string | null => {
  try { const o = typeof body === 'string' ? JSON.parse(body) : body; return o && typeof o === 'object' && typeof (o as { amal?: unknown }).amal === 'string' ? (o as { amal: string }).amal : null; } catch { return null; }
};

/** `boshqa_sessiyalar_chiqish` stamps sessiya_bekor_dan = now, which also kills THIS device token (its enrolment predates the stamp).
 *  After the handler succeeded, enrol a fresh device record (same 90-day window rules as /api/desktop/qurilma) and hand the new token to the app,
 *  so the user stays signed in here while every other cookie/device is out. If the DB refuses, the app signs out (code QAYTA_KIRISH_KERAK). */
export async function reissueDevice(env: DesktopEnv, actorId: number, body: unknown, oldDeviceId: string): Promise<Record<string, unknown>> {
  const o = (typeof body === 'string' ? JSON.parse(body) : body) as Record<string, unknown>;
  const matn = (v: unknown, max: number): string | null => { if (typeof v !== 'string') return null; const s = v.replace(/\p{Cc}/gu, '').trim().slice(0, max); return s || null; };
  const token = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const deviceId = crypto.randomUUID();
  const sessiyaExp = Date.now() + DESKTOP_SESSION_MS - 1000;
  try {
    const sess = await desktopRpc(env, 't2_desktop_qurilma_yarat_v2', {
      p_actor_id: actorId, p_device_id: deviceId, p_token_hash: await deviceHash(token), p_sessiya_exp: sessiyaExp, p_operation_id: crypto.randomUUID(),
      p_qurilma_nomi: matn(o.qurilma_nomi, 120), p_os: matn(o.os, 60), p_ilova_versiya: ilovaVersiya(o.ilova_versiya),
    });
    if (sess.ok !== true || sess.device_id !== deviceId || typeof sess.tugaydi !== 'number') return { ok: true, qurilma: null, code: 'QAYTA_KIRISH_KERAK' };
    // Best effort: the old record is already dead (stamp), revoking keeps the device list clean.
    await desktopRpc(env, 't2_desktop_qurilma_bekor_v1', { p_actor_id: actorId, p_device_id: oldDeviceId, p_operation_id: crypto.randomUUID() }).catch(() => null);
    return { ok: true, qurilma: { device_id: deviceId, token, tugaydi: sess.tugaydi } };
  } catch { return { ok: true, qurilma: null, code: 'QAYTA_KIRISH_KERAK' }; }
}

async function boundedBody(request: Request): Promise<string> {
  if (Number(request.headers.get('Content-Length')) > MOBIL_BFF_MAX_BYTES) throw new Error('BODY_TOO_LARGE');
  const reader = request.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MOBIL_BFF_MAX_BYTES) { await reader.cancel(); throw new Error('BODY_TOO_LARGE'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder().decode(bytes);
}


/** Verified native bearer -> server-only same-expiry cookie -> unchanged BFF gates/handler.
 * External Cookie/headers/actor/authority are never forwarded. */
export const onRequestPost: PagesFunction<Env> = async ctx => {
  const sess = await sessiyaOl(ctx.request, ctx.env);
  const device = verifiedDesktopDevice(ctx.request);
  if (!sess || !device) return desktopFail(401, desktopDenyCode(ctx.request));
  let b: Record<string, unknown>;
  try { b = JSON.parse(await boundedBody(ctx.request)); }
  catch (err) { return desktopFail(err instanceof Error && err.message === 'BODY_TOO_LARGE' ? 413 : 400, 'BODY_INVALID'); }
  if (!b || typeof b !== 'object' || Array.isArray(b) || Object.keys(b).some(k => !['path','method','body','etag','tasdiq'].includes(k)) ||
    typeof b.path !== 'string' || b.path.length > 8192 || !MOBIL_PATH.test(b.path) ||
    typeof b.method !== 'string' || !['GET','POST'].includes(b.method)) return desktopFail(400, 'TARGET_INVALID');
  const target = new URL(b.path, new URL(ctx.request.url).origin);
  const handler = Object.hasOwn(handlers, target.pathname) ? handlers[target.pathname][b.method] : undefined;
  if (!handler || !yolRuxsat(target, b.method, b.body) || (b.method === 'GET' && b.body != null) ||
    (b.etag != null && (typeof b.etag !== 'string' || b.etag.length > 512 || /[\x00-\x1f\x7f]/.test(b.etag)))) return desktopFail(400, 'TARGET_INVALID');
  if (target.pathname === '/api/agent-ish' && b.body && typeof b.body === 'object' && Object.hasOwn(b.body, 'jarvis_device_id')) {
    const { jarvis_device_id: expected, ...payload } = b.body as Record<string, unknown>;
    if (payload.amal !== 'suhbat_mutate' || (payload.harakat !== 'create' && payload.harakat !== 'append') ||
      expected !== device.device_id) return desktopFail(403, 'JARVIS_DEVICE_SCOPE');
    b.body = payload;
  }
  try {
    const cookie = await imzola({ rol: sess.rol, foydalanuvchi_id: sess.foydalanuvchi_id }, ctx.env.SESSIYA_KALIT, sess.exp - SESSIYA_MUDDAT_MS);
    const headers = new Headers({ Cookie: 'sess=' + cookie, Origin: target.origin, 'Sec-Fetch-Site': 'same-origin' });
    if (typeof b.etag === 'string') headers.set('If-None-Match', b.etag);
    headers.set('X-Qulf-Kanal', 'mobil'); // QULF: tasdiq tokeni qurilma kanaliga bog'langan (BFF har so'rovda yangi sessiya jti beradi)
    if (typeof b.tasdiq === 'string' && b.tasdiq.length <= 600) headers.set('X-Tasdiq', b.tasdiq);
    if (b.method === 'POST') headers.set('Content-Type', 'application/json');
    const request = new Request(target.href, { method: b.method, headers,
      ...(b.method === 'POST' ? { body: typeof b.body === 'string' ? b.body : JSON.stringify(b.body ?? {}) } : {}),
    });
    const data = {};
    const internal = { ...ctx, request, data, next: () => handler({ ...ctx, request, data } as typeof ctx) as Promise<Response> };
    const response = await existingMiddleware(internal as typeof ctx);
    const responseHeaders = new Headers(response.headers);
    responseHeaders.delete('Set-Cookie');
    responseHeaders.set('Cache-Control', 'no-store');
    if (target.pathname === '/api/profil' && b.method === 'POST' && bodyAmal(b.body) === 'boshqa_sessiyalar_chiqish' && response.ok) {
      const device = verifiedDesktopDevice(ctx.request);
      const out = device ? await reissueDevice(ctx.env, device.foydalanuvchi_id, b.body, device.device_id) : { ok: true, qurilma: null, code: 'QAYTA_KIRISH_KERAK' };
      responseHeaders.delete('Content-Length');
      return Response.json(out, { status: 200, headers: responseHeaders });
    }
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers: responseHeaders });
  } catch { return desktopFail(503, 'MOBIL_BFF_UNAVAILABLE'); }
};
