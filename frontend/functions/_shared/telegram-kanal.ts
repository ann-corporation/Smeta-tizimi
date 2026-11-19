/**
 * telegram-kanal.ts — QURAI brend kanali/guruhi boshqaruvi (rahbar/Claude server orqali; bot tokeni faqat Cloudflare secret).
 *
 * QOIDALAR:
 *  • Hech narsa kanalga/guruhga egasining tasdiq tugmasisiz CHIQMAYDI: post_taklif faqat EGASINING shaxsiy chatiga qoralama
 *    yuboradi ([Chiqarish] [Tahrirlash] [Bekor]); kanalga yozish faqat `kp:y:<id>` callback ida (webhook), egasi qayta
 *    superadmin ekani bazada tekshirilgach.
 *  • Faqat sozlangan chatlar (TG_KANAL, TG_GURUH — wrangler [vars]) bilan ishlanadi; ixtiyoriy chat id ga yozib bo'lmaydi.
 *  • Qoralama va audit — R2_CANONICAL (tg-kanal/qoralama/, tg-kanal/audit/); yangi jadval yo'q. Audit yozilmasa — amal bajarilmaydi
 *    (fail closed). Token hech qachon javob/logga chiqmaydi (tgApi buni ta'minlaydi).
 *  • Rasm — faqat o'z saytimiz originidan (https).
 */
import { type MetaEnv, type Sahifa, type TarmoqNatija, fbNashr, igNashr, igReelsYakunla, metaBormi, sahifaOl } from './meta-graph';
import { r2Yoz } from './r2-saqlash';
import { type TgEnv, type TgTil, saytUrl, tgApi, tgRpc, tgT, xabarYubor } from './telegram';
import { hisobTili } from './telegram-holat';

export type KanalEnv = TgEnv & MetaEnv & {
  TG_KANAL?: string; TG_GURUH?: string;
  R2_CANONICAL?: { put(k: string, v: string): Promise<unknown>; get(k: string): Promise<{ json(): Promise<unknown> } | null> };
};
export type ChatAlias = 'kanal' | 'guruh';
export const QORALAMA_PREFIKS = 'tg-kanal/qoralama/';
export const AUDIT_PREFIKS = 'tg-kanal/audit/';
export const BELGI = '#KP:';
export const MAX_POST = 4000;
export const MAX_ISHLATISH_MS = 7 * 24 * 3600 * 1000;

export type Qoralama = {
  id: string; tur: 'post' | 'ochir'; egasi: number; chat: ChatAlias; chat_id: string;
  matn?: string; rasm?: string | null; video?: string | null; xabar_id?: number;
  /** Ijtimoiy tarmoqlar (eski qoralamalarda yo'q = faqat telegram); natijalar — har tarmoq uchun (token/xom xatosiz). */
  tarmoqlar?: Tarmoq[]; natijalar?: Partial<Record<Tarmoq, TarmoqNatija>>;
  holat: 'kutilmoqda' | 'tahrir' | 'bajarilmoqda' | 'kutish' | 'chiqarildi' | 'bekor' | 'xato'; yaratildi: string; natija_xabar_id?: number;
};
export const TARMOQLAR = ['telegram', 'facebook', 'instagram'] as const;
export type Tarmoq = typeof TARMOQLAR[number];

/* ───────── sozlangan chatlar ───────── */
export function chatTanla(env: KanalEnv, nom: unknown): { alias: ChatAlias; id: string } | null {
  const k = String(env.TG_KANAL ?? '').trim(); const g = String(env.TG_GURUH ?? '').trim();
  const s = String(nom ?? 'kanal').trim();
  if (s === 'kanal' || (k && s === k)) return k ? { alias: 'kanal', id: k } : null;
  if (s === 'guruh' || (g && s === g)) return g ? { alias: 'guruh', id: g } : null;
  return null;
}

/* ───────── R2: qoralama + audit ───────── */
export async function auditYoz(env: KanalEnv, amal: string, egasi: number, tafsilot: Record<string, unknown>): Promise<boolean> {
  if (!env.R2_CANONICAL) return false;
  const vaqt = new Date().toISOString();
  const kalit = `${AUDIT_PREFIKS}${vaqt.replace(/[:.]/g, '-')}-${crypto.randomUUID().slice(0, 8)}-${amal}.json`;
  try { await r2Yoz(env.R2_CANONICAL as never, kalit, JSON.stringify({ vaqt, amal, egasi, ...tafsilot })); return true; } catch { return false; }
}
export async function qoralamaOl(env: KanalEnv, id: string): Promise<Qoralama | null> {
  if (!env.R2_CANONICAL || !/^[a-f0-9]{16}$/.test(id)) return null;
  try { const o = await env.R2_CANONICAL.get(QORALAMA_PREFIKS + id + '.json'); return o ? (await o.json() as Qoralama) : null; } catch { return null; }
}
export async function qoralamaSaqla(env: KanalEnv, q: Qoralama): Promise<boolean> {
  if (!env.R2_CANONICAL) return false;
  try { await r2Yoz(env.R2_CANONICAL as never, QORALAMA_PREFIKS + q.id + '.json', JSON.stringify(q)); return true; } catch { return false; }
}
const yangiId = () => [...crypto.getRandomValues(new Uint8Array(8))].map((x) => x.toString(16).padStart(2, '0')).join('');

/* ───────── egasi (superadmin) tekshiruvi ───────── */
export async function superadminUid(env: KanalEnv, uid: number): Promise<boolean> {
  const r = await tgRpc<{ ok?: boolean; foydalanuvchi?: unknown }>(env, 't2_boshqaruv_umumiy_v1', { p_actor_id: uid });
  return !!r && typeof r === 'object' && !Array.isArray(r) && 'foydalanuvchi' in r && r.ok !== false;
}

/* ───────── rasm ───────── */
export function rasmYaroqli(env: KanalEnv, url: unknown): string | null {
  if (url == null || url === '') return null;
  try {
    const u = new URL(String(url));
    return u.protocol === 'https:' && u.host === new URL(saytUrl(env)).host ? u.toString() : null;
  } catch { return null; }
}

/** Video: faqat o'z originimiz (https) va .mp4 (Instagram Reels / Facebook video / Telegram sendVideo shu URL ni o'zlari yuklab oladi). */
export function videoYaroqli(env: KanalEnv, url: unknown): string | null {
  const u = rasmYaroqli(env, url);
  return u && /\.mp4$/i.test(new URL(u).pathname) ? u : null;
}

/* ───────── holat ───────── */
const HUQUQLAR = ['can_post_messages', 'can_edit_messages', 'can_delete_messages', 'can_change_info', 'can_pin_messages', 'can_invite_users'] as const;
type TgChat = { id?: number; title?: string; username?: string; description?: string; type?: string };
type TgAzo = { status?: string } & Partial<Record<typeof HUQUQLAR[number], boolean>>;

export async function chatHolati(env: KanalEnv, chatId: string) {
  const [chat, soni, me] = await Promise.all([
    tgApi<TgChat>(env, 'getChat', { chat_id: chatId }),
    tgApi<number>(env, 'getChatMemberCount', { chat_id: chatId }),
    tgApi<{ id?: number }>(env, 'getMe', {}),
  ]);
  if (!chat.ok) return { ok: false as const, xato: chat.description ?? 'TELEGRAM_RAD' };
  const azo = me.result?.id ? await tgApi<TgAzo>(env, 'getChatMember', { chat_id: chatId, user_id: me.result.id }) : null;
  const a = azo?.result;
  return {
    ok: true as const, chat_id: chat.result?.id ?? null, tur: chat.result?.type ?? null, nom: chat.result?.title ?? null,
    username: chat.result?.username ?? null, tavsif: chat.result?.description ?? null, azolar: soni.ok ? (soni.result ?? null) : null,
    bot_holati: a?.status ?? null,
    huquqlar: Object.fromEntries(HUQUQLAR.map((h) => [h, a?.[h] === true])) as Record<typeof HUQUQLAR[number], boolean>,
  };
}
/** Bot kerakli huquqqa egami — yo'q bo'lsa Telegram'dan ko'rinadigan aniq xato. */
async function huquqBor(env: KanalEnv, chatId: string, huquq: typeof HUQUQLAR[number]): Promise<boolean> {
  const me = await tgApi<{ id?: number }>(env, 'getMe', {});
  if (!me.result?.id) return false;
  const a = await tgApi<TgAzo>(env, 'getChatMember', { chat_id: chatId, user_id: me.result.id });
  return a.ok && (a.result?.status === 'creator' || a.result?.[huquq] === true);
}

/* ───────── tavsif / sarlavha / bot profili ───────── */
export async function tavsifOrnat(env: KanalEnv, egasi: number, c: { alias: ChatAlias; id: string }, tavsif: unknown, sarlavha: unknown) {
  const t = typeof tavsif === 'string' ? tavsif.trim() : undefined; const s = typeof sarlavha === 'string' ? sarlavha.trim() : undefined;
  if ((t === undefined && s === undefined) || (t !== undefined && t.length > 255) || (s !== undefined && (s.length < 1 || s.length > 128)))
    return { ok: false as const, status: 400, code: 'MATN_NOTOGRI' };
  if (!(await huquqBor(env, c.id, 'can_change_info')))
    return { ok: false as const, status: 403, code: 'HUQUQ_YOQ', huquq: 'can_change_info', xabar: 'Botga «Change channel info» (can_change_info) huquqini yoqing.' };
  if (!(await auditYoz(env, 'tavsif_ornat', egasi, { chat: c.alias, tavsif_uzunlik: t?.length ?? null, sarlavha: s ?? null }))) return { ok: false as const, status: 503, code: 'AUDIT_YOZILMADI' };
  const natija: Record<string, boolean> = {};
  if (t !== undefined) { const r = await tgApi(env, 'setChatDescription', { chat_id: c.id, description: t }); if (!r.ok) return { ok: false as const, status: 502, code: 'TELEGRAM_RAD', xabar: r.description }; natija.tavsif = true; }
  if (s !== undefined) { const r = await tgApi(env, 'setChatTitle', { chat_id: c.id, title: s }); if (!r.ok) return { ok: false as const, status: 502, code: 'TELEGRAM_RAD', xabar: r.description, natija }; natija.sarlavha = true; }
  return { ok: true as const, natija };
}

const TILLAR = ['uz', 'ru', 'en'] as const;
export async function botProfilOrnat(env: KanalEnv, egasi: number, b: { nom?: unknown; qisqa?: unknown; tavsif?: unknown }) {
  const olish = (v: unknown, max: number): Partial<Record<typeof TILLAR[number], string>> | null => {
    if (v == null) return {};
    if (typeof v !== 'object' || Array.isArray(v)) return null;
    const o: Partial<Record<typeof TILLAR[number], string>> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (!(TILLAR as readonly string[]).includes(k) || typeof x !== 'string' || x.length > max) return null;
      o[k as typeof TILLAR[number]] = x;
    }
    return o;
  };
  const qisqa = olish(b.qisqa, 120); const tavsif = olish(b.tavsif, 512);
  const nom = typeof b.nom === 'string' ? b.nom.trim() : undefined;
  if (!qisqa || !tavsif || (nom !== undefined && (nom.length < 1 || nom.length > 64)) || (nom === undefined && !Object.keys(qisqa).length && !Object.keys(tavsif).length))
    return { ok: false as const, status: 400, code: 'MATN_NOTOGRI' };
  if (!(await auditYoz(env, 'bot_profil_ornat', egasi, { nom: nom ?? null, qisqa: Object.keys(qisqa), tavsif: Object.keys(tavsif) }))) return { ok: false as const, status: 503, code: 'AUDIT_YOZILMADI' };
  const yuk: { metod: string; p: Record<string, unknown> }[] = [];
  if (nom !== undefined) yuk.push({ metod: 'setMyName', p: { name: nom } });
  for (const [til, matn] of Object.entries(qisqa)) {
    yuk.push({ metod: 'setMyShortDescription', p: { short_description: matn, language_code: til } });
    if (til === 'uz') yuk.push({ metod: 'setMyShortDescription', p: { short_description: matn } });   // standart til = o'zbek
  }
  for (const [til, matn] of Object.entries(tavsif)) {
    yuk.push({ metod: 'setMyDescription', p: { description: matn, language_code: til } });
    if (til === 'uz') yuk.push({ metod: 'setMyDescription', p: { description: matn } });
  }
  const xatolar: string[] = [];
  for (const y of yuk) { const r = await tgApi(env, y.metod, y.p); if (!r.ok) xatolar.push(`${y.metod}${y.p.language_code ? ':' + y.p.language_code : ''}`); }
  return xatolar.length ? { ok: false as const, status: 502, code: 'TELEGRAM_RAD', xatolar } : { ok: true as const, ornatildi: yuk.length };
}

/* ───────── post taklifi (egasiga) ───────── */
type EgasiChat = { chat_id: number; til: TgTil };
async function egasiChat(env: KanalEnv, egasi: number): Promise<EgasiChat | null> {
  const m = await tgRpc<{ ok?: boolean; yuborish?: boolean; chat_id?: number; til?: TgTil }>(env, 't2_telegram_manzil_v1', { p_foydalanuvchi_id: egasi, p_tur: 'topshiriq' });
  // Til: egasining HISOB tili (Telegram language_code / ulash paytidagi til emas) — qoralama rus tilida kelmasin.
  return m?.ok && m.yuborish && Number.isSafeInteger(m.chat_id) ? { chat_id: m.chat_id as number, til: await hisobTili(env, egasi) } : null;
}
const tugmalar = (q: Qoralama, til: TgTil) => ({ inline_keyboard: q.tur === 'post'
  ? [[{ text: tgT('✅ Chiqarish', til), callback_data: `kp:y:${q.id}` }, { text: tgT('✏️ Tahrirlash', til), callback_data: `kp:e:${q.id}` }, { text: tgT('❌ Bekor', til), callback_data: `kp:n:${q.id}` }]]
  : [[{ text: tgT('🗑 O‘chirish', til), callback_data: `kp:y:${q.id}` }, { text: tgT('❌ Bekor', til), callback_data: `kp:n:${q.id}` }]] });
const korinish = (q: Qoralama, til: TgTil) => q.tur === 'post'
  ? [tgT('Post qoralamasi — {chat}', til, { chat: q.chat_id }), tgT('Tarmoqlar: {list}', til, { list: (q.tarmoqlar ?? ['telegram']).join(', ') }),
    q.rasm ? tgT('Rasm: {url}', til, { url: q.rasm }) : '', q.video ? tgT('Video: {url}', til, { url: q.video }) : '', '', q.matn ?? '', '', tgT('Faqat «Chiqarish» bosilganda e’lon qilinadi.', til), BELGI + q.id].filter((x, i) => x !== '' || i === 4 || i > 5).join('\n')
  : [tgT('Postni o‘chirish — {chat}, xabar № {id}', til, { chat: q.chat_id, id: q.xabar_id ?? 0 }), '', tgT('Faqat «O‘chirish» bosilganda o‘chiriladi.', til), BELGI + q.id].join('\n');

async function qoralamaYubor(env: KanalEnv, q: Qoralama, e: EgasiChat) {
  return xabarYubor(env, e.chat_id, korinish(q, e.til), { reply_markup: tugmalar(q, e.til) });
}

/**
 * tarmoqlar berilmasa: media bor → hammasi (telegram, facebook, instagram); media yo'q → instagram'siz (u media talab qiladi);
 * META_TOKEN sozlanmagan bo'lsa — faqat telegram. Aniq so'ralgan tarmoq mumkin bo'lmasa — xato (jimgina tashlanmaydi).
 */
export async function postTaklif(env: KanalEnv, egasi: number, c: { alias: ChatAlias; id: string }, b: { matn?: unknown; rasm?: unknown; video?: unknown; tarmoqlar?: unknown }) {
  const matn = typeof b.matn === 'string' ? b.matn.trim() : '';
  const rasm = rasmYaroqli(env, b.rasm);
  const video = videoYaroqli(env, b.video);
  if (!matn || matn.length > (rasm || video ? 1000 : MAX_POST)) return { ok: false as const, status: 400, code: 'MATN_NOTOGRI' };
  if (b.rasm != null && b.rasm !== '' && !rasm) return { ok: false as const, status: 400, code: 'RASM_MANZIL_NOTOGRI' };
  if (b.video != null && b.video !== '' && !video) return { ok: false as const, status: 400, code: 'VIDEO_MANZIL_NOTOGRI' };
  if (rasm && video) return { ok: false as const, status: 400, code: 'MEDIA_IKKALASI' };
  let tarmoqlar: Tarmoq[];
  if (b.tarmoqlar == null) tarmoqlar = ['telegram', ...(metaBormi(env) ? (rasm || video ? ['facebook', 'instagram'] : ['facebook']) : [])] as Tarmoq[];
  else {
    const t = Array.isArray(b.tarmoqlar) ? [...new Set(b.tarmoqlar)] : [];
    if (!t.length || !t.every((x): x is Tarmoq => (TARMOQLAR as readonly unknown[]).includes(x))) return { ok: false as const, status: 400, code: 'TARMOQ_NOTOGRI' };
    tarmoqlar = t;
    if (t.includes('instagram') && !rasm && !video) return { ok: false as const, status: 400, code: 'MEDIA_KERAK' };
    if ((t.includes('instagram') || t.includes('facebook')) && !metaBormi(env)) return { ok: false as const, status: 503, code: 'META_SOZLANMAGAN' };
  }
  const e = await egasiChat(env, egasi);
  if (!e) return { ok: false as const, status: 409, code: 'EGASI_TELEGRAM_ULANMAGAN' };
  const q: Qoralama = { id: yangiId(), tur: 'post', egasi, chat: c.alias, chat_id: c.id, matn, rasm, video, tarmoqlar, holat: 'kutilmoqda', yaratildi: new Date().toISOString() };
  if (!(await qoralamaSaqla(env, q))) return { ok: false as const, status: 503, code: 'SAQLANMADI' };
  if (!(await auditYoz(env, 'post_taklif', egasi, { id: q.id, chat: c.alias, uzunlik: matn.length, rasm: !!rasm, video: !!video, tarmoqlar }))) return { ok: false as const, status: 503, code: 'AUDIT_YOZILMADI' };
  if (!(await qoralamaYubor(env, q, e))) return { ok: false as const, status: 502, code: 'TELEGRAM_RAD' };
  return { ok: true as const, qoralama_id: q.id };
}
export async function postOchirTaklif(env: KanalEnv, egasi: number, c: { alias: ChatAlias; id: string }, xabarId: unknown) {
  if (!Number.isSafeInteger(xabarId) || (xabarId as number) <= 0) return { ok: false as const, status: 400, code: 'XABAR_ID_NOTOGRI' };
  const e = await egasiChat(env, egasi);
  if (!e) return { ok: false as const, status: 409, code: 'EGASI_TELEGRAM_ULANMAGAN' };
  const q: Qoralama = { id: yangiId(), tur: 'ochir', egasi, chat: c.alias, chat_id: c.id, xabar_id: xabarId as number, holat: 'kutilmoqda', yaratildi: new Date().toISOString() };
  if (!(await qoralamaSaqla(env, q))) return { ok: false as const, status: 503, code: 'SAQLANMADI' };
  if (!(await auditYoz(env, 'post_ochir_taklif', egasi, { id: q.id, chat: c.alias, xabar_id: q.xabar_id }))) return { ok: false as const, status: 503, code: 'AUDIT_YOZILMADI' };
  if (!(await qoralamaYubor(env, q, e))) return { ok: false as const, status: 502, code: 'TELEGRAM_RAD' };
  return { ok: true as const, qoralama_id: q.id };
}

/* ───────── webhook: callback (kp:y|e|n:<id>) va tahrir javobi ───────── */
export const kanalCallbackmi = (d: unknown) => typeof d === 'string' && /^kp:[yenr]:[a-f0-9]{16}$/.test(d);

export async function kanalCallback(env: KanalEnv, uid: number, til: TgTil, data: string, chatId: number): Promise<{ toast: string; amal: string; tugmalarniOlibTashla?: boolean }> {
  const [, ish, id] = data.split(':');
  const yoq = (toast: string, amal: string) => ({ toast: tgT(toast, til), amal });
  const q = await qoralamaOl(env, id);
  if (!q || q.egasi !== uid) return yoq('Qoralama topilmadi', 'kp_yoq');
  if (!(await superadminUid(env, uid))) return yoq('Faqat egasi uchun', 'kp_ruxsatsiz');
  if (q.holat !== 'kutilmoqda' && q.holat !== 'tahrir' && !(ish === 'r' && q.holat === 'kutish')) return { ...yoq('Bu qoralama allaqachon yopilgan', 'kp_yopiq'), tugmalarniOlibTashla: true };
  if (Date.now() - Date.parse(q.yaratildi) > MAX_ISHLATISH_MS) return { ...yoq('Qoralama eskirgan', 'kp_eskirgan'), tugmalarniOlibTashla: true };
  const c = chatTanla(env, q.chat_id);
  if (!c) return yoq('Kanal sozlanmagan', 'kp_chat_yoq');

  if (ish === 'n') {
    q.holat = 'bekor'; await qoralamaSaqla(env, q); await auditYoz(env, 'bekor', uid, { id: q.id, tur: q.tur, chat: q.chat });
    return { ...yoq('Bekor qilindi', 'kp_bekor'), tugmalarniOlibTashla: true };
  }
  if (ish === 'r') return igYakunla(env, q, uid, til, chatId);
  if (ish === 'e') {
    if (q.tur !== 'post') return yoq('Bu qoralamani tahrirlab bo‘lmaydi', 'kp_tahrir_yoq');
    q.holat = 'tahrir'; await qoralamaSaqla(env, q);
    await xabarYubor(env, chatId, tgT('Yangi matnni shu xabarga javob (reply) qilib yuboring.', til) + '\n' + BELGI + q.id, { reply_markup: { force_reply: true, selective: true } });
    return yoq('Yangi matnni yuboring', 'kp_tahrir');
  }
  // 'y' — FAQAT shu yerda yoziladi. Avval holat «bajarilmoqda» (takror bosish/qayta yuborishdan himoya), so'ng audit, so'ng tarmoqlar.
  const tarm = q.tarmoqlar ?? ['telegram'];
  q.holat = 'bajarilmoqda';
  if (!(await qoralamaSaqla(env, q)) || !(await auditYoz(env, q.tur === 'post' ? 'chiqarish_urinish' : 'ochirish_urinish', uid, { id: q.id, chat: q.chat, xabar_id: q.xabar_id ?? null, uzunlik: q.matn?.length ?? null, tarmoqlar: q.tur === 'post' ? tarm : null }))) {
    q.holat = 'kutilmoqda'; await qoralamaSaqla(env, q); return yoq('Audit yozilmadi — bajarilmadi', 'kp_audit_xato');
  }
  if (q.tur === 'post') return postChiqar(env, q, c, uid, til, chatId, tarm);
  const r = await tgApi(env, 'deleteMessage', { chat_id: c.id, message_id: q.xabar_id });
  if (!r.ok) {
    q.holat = 'xato'; await qoralamaSaqla(env, q); await auditYoz(env, 'xato', uid, { id: q.id, tur: q.tur, chat: q.chat, sabab: String(r.description ?? '').slice(0, 120) });
    return { ...yoq('Telegram rad etdi — huquqni tekshiring', 'kp_telegram_rad'), tugmalarniOlibTashla: true };
  }
  q.holat = 'chiqarildi'; q.natija_xabar_id = q.xabar_id;
  await qoralamaSaqla(env, q);
  await auditYoz(env, 'ochirildi', uid, { id: q.id, chat: q.chat, xabar_id: q.natija_xabar_id ?? null });
  return { ...yoq('O‘chirildi', 'kp_ochirildi'), tugmalarniOlibTashla: true };
}

/* ───────── ko'p tarmoqqa chiqarish (egasi «Chiqarish» bosgach) ───────── */
const NOM: Record<Tarmoq, string> = { telegram: 'Telegram', facebook: 'Facebook', instagram: 'Instagram' };
const tgHavola = (chatId: string, id: number | undefined) => (chatId.startsWith('@') && id ? `https://t.me/${chatId.slice(1)}/${id}` : undefined);

async function tgNashr(env: KanalEnv, q: Qoralama, c: { id: string }): Promise<TarmoqNatija> {
  const r = q.video ? await tgApi<{ message_id?: number }>(env, 'sendVideo', { chat_id: c.id, video: q.video, caption: q.matn })
    : q.rasm ? await tgApi<{ message_id?: number }>(env, 'sendPhoto', { chat_id: c.id, photo: q.rasm, caption: q.matn })
      : await tgApi<{ message_id?: number }>(env, 'sendMessage', { chat_id: c.id, text: q.matn, disable_web_page_preview: false });
  const id = r.result?.message_id;
  return r.ok ? { ok: true, id: id == null ? undefined : String(id), havola: tgHavola(c.id, id) } : { ok: false, kod: 'TG_RAD' };
}

/** Natijalar xabari egasining chatiga: tarmoq bo'yicha ✅ havola / ❌ kod / ⏳ kutilmoqda (+ Instagram uchun «Tekshirish» tugmasi). */
async function natijaXabari(env: KanalEnv, q: Qoralama, til: TgTil, chatId: number) {
  const satr = (Object.keys(q.natijalar ?? {}) as Tarmoq[]).map((t) => {
    const n = q.natijalar![t]!;
    return n.ok ? tgT('{tarmoq}: ✅ {havola}', til, { tarmoq: NOM[t], havola: n.havola ?? n.id ?? '' })
      : n.holat === 'kutilmoqda' ? tgT('{tarmoq}: ⏳ video tayyorlanmoqda', til, { tarmoq: NOM[t] })
        : tgT('{tarmoq}: ❌ {kod}', til, { tarmoq: NOM[t], kod: n.kod ?? '?' });
  });
  const kut = q.holat === 'kutish';
  await xabarYubor(env, chatId, satr.join('\n'), kut ? { reply_markup: { inline_keyboard: [[{ text: tgT('🔄 Instagram holatini tekshirish', til), callback_data: `kp:r:${q.id}` }]] } } : {});
}

async function postChiqar(env: KanalEnv, q: Qoralama, c: { alias: ChatAlias; id: string }, uid: number, til: TgTil, chatId: number, tarm: Tarmoq[]) {
  const yoq = (toast: string, amal: string, tugma = true) => ({ toast: tgT(toast, til), amal, tugmalarniOlibTashla: tugma });
  const natijalar: Partial<Record<Tarmoq, TarmoqNatija>> = {};
  let sahifa: Sahifa | null = null; let sahifaKod = '';
  if (tarm.includes('facebook') || tarm.includes('instagram')) { const s = await sahifaOl(env); if (s.ok) sahifa = s.data; else sahifaKod = s.kod; }
  const m = { matn: q.matn ?? '', rasm: q.rasm, video: q.video };
  for (const t of tarm) {
    natijalar[t] = t === 'telegram' ? await tgNashr(env, q, c) : !sahifa ? { ok: false, kod: sahifaKod || 'SAHIFA_TOPILMADI' } : t === 'facebook' ? await fbNashr(env, sahifa, m) : await igNashr(env, sahifa, m);
    const n = natijalar[t]!;
    await auditYoz(env, 'ijtimoiy_' + t, uid, { id: q.id, ok: n.ok, kod: n.kod ?? null, post_id: n.id ?? null, kutilmoqda: n.holat === 'kutilmoqda' });
  }
  q.natijalar = natijalar;
  const kutish = Object.values(natijalar).some((n) => n?.holat === 'kutilmoqda');
  const okSoni = Object.values(natijalar).filter((n) => n?.ok).length;
  q.holat = kutish ? 'kutish' : okSoni ? 'chiqarildi' : 'xato';
  q.natija_xabar_id = Number(natijalar.telegram?.ok ? natijalar.telegram.id : undefined) || undefined;
  await qoralamaSaqla(env, q);
  if (okSoni) await auditYoz(env, 'chiqarildi', uid, { id: q.id, chat: q.chat, xabar_id: q.natija_xabar_id ?? null, tarmoqlar: tarm.filter((t) => natijalar[t]?.ok) });
  else await auditYoz(env, 'xato', uid, { id: q.id, tur: q.tur, chat: q.chat, sabab: tarm.map((t) => `${t}:${natijalar[t]?.kod ?? ''}`).join(',').slice(0, 120) });
  const faqatTg = tarm.length === 1 && tarm[0] === 'telegram';
  if (!faqatTg) await natijaXabari(env, q, til, chatId);
  if (faqatTg) return okSoni ? yoq('Chiqarildi', 'kp_chiqarildi') : yoq('Telegram rad etdi — huquqni tekshiring', 'kp_telegram_rad');
  return okSoni === tarm.length ? yoq('Chiqarildi', 'kp_chiqarildi')
    : okSoni || kutish ? yoq('Qisman chiqarildi — natijani ko‘ring', 'kp_qisman')
      : yoq('Hech biri chiqmadi — natijani ko‘ring', 'kp_rad');
}

/** `kp:r:<id>` — Instagram Reels konteyneri tayyor bo'lganda chiqaradi (Worker ichida kutish chegaralangan; qolgani shu tugma orqali). */
async function igYakunla(env: KanalEnv, q: Qoralama, uid: number, til: TgTil, chatId: number) {
  const yoq = (toast: string, amal: string, tugma = false) => ({ toast: tgT(toast, til), amal, tugmalarniOlibTashla: tugma });
  const n0 = q.natijalar?.instagram;
  if (q.holat !== 'kutish' || !n0?.creation_id) return yoq('Bu qoralama allaqachon yopilgan', 'kp_yopiq', true);
  q.holat = 'bajarilmoqda'; await qoralamaSaqla(env, q);
  const s = await sahifaOl(env);
  const n = s.ok ? await igReelsYakunla(env, s.data, n0.creation_id, 2) : { ok: false, kod: s.kod } as TarmoqNatija;
  q.natijalar!.instagram = n;
  q.holat = n.holat === 'kutilmoqda' ? 'kutish' : Object.values(q.natijalar!).some((x) => x?.ok) ? 'chiqarildi' : 'xato';
  await qoralamaSaqla(env, q);
  await auditYoz(env, 'ijtimoiy_instagram_yakun', uid, { id: q.id, ok: n.ok, kod: n.kod ?? null, post_id: n.id ?? null });
  if (n.holat === 'kutilmoqda') return yoq('Instagram hali tayyor emas — keyinroq qayta bosing', 'kp_ig_kutish');
  await natijaXabari(env, q, til, chatId);
  return yoq(n.ok ? 'Chiqarildi' : 'Hech biri chiqmadi — natijani ko‘ring', n.ok ? 'kp_chiqarildi' : 'kp_rad', true);
}

/** Egasi «Tahrirlash» xabariga javob (reply) berdi: matn yangilanadi, qoralama qayta yuboriladi. Chiqarilmaydi. */
export function tahrirBelgisi(reply: { text?: string } | undefined): string | null {
  const m = /#KP:([a-f0-9]{16})/.exec(String(reply?.text ?? ''));
  return m ? m[1] : null;
}
export async function kanalTahrirJavobi(env: KanalEnv, uid: number, til: TgTil, chatId: number, id: string, yangiMatn: string): Promise<string> {
  const q = await qoralamaOl(env, id);
  if (!q || q.egasi !== uid || q.tur !== 'post' || q.holat !== 'tahrir' || !(await superadminUid(env, uid))) { await xabarYubor(env, chatId, tgT('Qoralama topilmadi', til)); return 'kp_tahrir_yoq'; }
  const m = yangiMatn.trim();
  if (!m || m.length > (q.rasm || q.video ? 1000 : MAX_POST)) { await xabarYubor(env, chatId, tgT('Matn bo‘sh yoki juda uzun', til)); return 'kp_tahrir_notogri'; }
  q.matn = m; q.holat = 'kutilmoqda';
  await qoralamaSaqla(env, q); await auditYoz(env, 'tahrir', uid, { id: q.id, uzunlik: m.length });
  await qoralamaYubor(env, q, { chat_id: chatId, til });
  return 'kp_tahrir_ok';
}
