/**
 * POST /api/telegram/kanal — QURAI brend kanali/guruhi boshqaruvi (SUPERADMIN; sessiya + har chaqiruvda bazada qayta tekshiruv).
 *
 * { amal:'holat', chat?:'kanal'|'guruh'|'@username'|'-100…' }   → getChat + a'zolar soni + botning admin huquqlari (chat berilmasa — sozlangan hammasi)
 * { amal:'tavsif_ornat', chat, tavsif?, sarlavha? }               → setChatDescription (+ setChatTitle faqat sarlavha aniq berilsa); can_change_info kerak
 * { amal:'bot_profil_ornat', nom?, qisqa?:{uz,ru,en}, tavsif?:{uz,ru,en} } → setMyName / setMyShortDescription / setMyDescription
 * { amal:'post_taklif', chat, matn, rasm? }                       → qoralama EGASINING shaxsiy chatiga [Chiqarish][Tahrirlash][Bekor] bilan; o'zi chiqarmaydi
 * { amal:'post_ochir', chat, xabar_id }                           → o'chirish so'rovi egasiga tugma bilan; deleteMessage faqat egasi bosgach
 * Chiqarish/o'chirish webhook callback ida (_shared/telegram-kanal.ts). Token/sir hech qachon javobda yo'q.
 *
 * IJTIMOIY NASHR (Facebook sahifa + Instagram + Telegram; Meta Graph API, _shared/meta-graph.ts):
 * { amal:'meta_holat' }                                           → sahifa/IG ulanishi, token_ok, berilgan huquqlar (token qaytmaydi)
 * { amal:'post_taklif', chat?, matn, rasm?|video?, tarmoqlar?:['telegram'|'facebook'|'instagram'] }
 *     → qoralama egasiga (yuqoridagidek). Egasi «Chiqarish» bosganda har tanlangan tarmoqqa chiqadi va egasi chatiga tarmoq bo'yicha
 *       natija (havola yoki xato kodi) keladi. tarmoqlar berilmasa: media bor → uchalasi; media yo'q → telegram+facebook (instagram media talab qiladi);
 *       META_TOKEN yo'q → faqat telegram. rasm/video — faqat o'z originimiz (https), video .mp4 (Reels/FB video/Telegram sendVideo).
 *       Instagram Reels: konteyner FINISHED bo'lguncha ~15 s kutiladi; tayyor bo'lmasa natija xabarida [Instagram holatini tekshirish] tugmasi (kp:r:<id>) chiqadi.
 * { amal:'statistika', n?:1..10 }                                 → oxirgi n post: IG (qamrov/ko'rish/like/izoh) + FB (reaksiya/izoh/qamrov) — haftalik hisobot uchun
 * Sozlash: Cloudflare Pages secret META_TOKEN (system-user); wrangler [vars]: META_PAGE_ID (bo'sh bo'lsa /me/accounts dan topiladi), META_IG_ID, META_GRAPH_VERSION.
 * Ishlatish: scripts/tg-kanal.mjs yoki superadmin sessiyasi bilan POST; hamma narsa egasi tugmasi bilan chiqadi.
 */
import { superadminActor } from '../../_shared/superadmin';
import { type TgEnv, tokenBormi } from '../../_shared/telegram';
import { metaBormi, metaHolat, statistika } from '../../_shared/meta-graph';
import { auditYoz, type KanalEnv, botProfilOrnat, chatHolati, chatTanla, postOchirTaklif, postTaklif, tavsifOrnat } from '../../_shared/telegram-kanal';

type Env = KanalEnv & TgEnv & { SUPABASE_URL: string; SUPABASE_KEY: string; SESSIYA_KALIT: string };
const json = (b: unknown, status = 200) => Response.json(b, { status, headers: { 'Cache-Control': 'no-store' } });
const originYaroqsiz = (req: Request) => {
  const origin = req.headers.get('Origin');
  return req.headers.get('Sec-Fetch-Site') === 'cross-site' || (!!origin && origin !== new URL(req.url).origin);
};
const javob = (r: { ok: boolean; status?: number } & Record<string, unknown>) => { const { status, ...q } = r; return json(q, r.ok ? 200 : (status ?? 400)); };

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (originYaroqsiz(request)) return json({ ok: false, code: 'ORIGIN_INVALID' }, 403);
  const s = await superadminActor(request, env);
  if ('code' in s) return json({ ok: false, code: s.code }, s.status);
  let b: Record<string, unknown> = {};
  try { b = await request.json(); } catch { return json({ ok: false, code: 'BODY_INVALID' }, 400); }
  if (b.amal === 'meta_holat') return json(await metaHolat(env), 200);
  if (b.amal === 'statistika') {
    if (!metaBormi(env)) return json({ ok: false, code: 'META_SOZLANMAGAN' }, 503);
    await auditYoz(env, 'statistika', s.id, { n: Number.isSafeInteger(b.n) ? b.n : null });
    return javob(await statistika(env, b.n));
  }
  if (!tokenBormi(env)) return json({ ok: false, code: 'SOZLANMAGAN' }, 503);

  if (b.amal === 'bot_profil_ornat') return javob(await botProfilOrnat(env, s.id, b as { nom?: unknown; qisqa?: unknown; tavsif?: unknown }));

  if (b.amal === 'holat') {
    const royxat: { alias: string; id: string }[] = [];
    if (b.chat == null) { for (const a of ['kanal', 'guruh']) { const c = chatTanla(env, a); if (c) royxat.push({ alias: c.alias, id: c.id }); } }
    else {
      const c = chatTanla(env, b.chat);
      const xom = String(b.chat).trim();
      if (c) royxat.push({ alias: c.alias, id: c.id });
      else if (/^(@[A-Za-z][A-Za-z0-9_]{4,31}|-?\d{5,20})$/.test(xom)) royxat.push({ alias: 'ixtiyoriy', id: xom });   // faqat o'qish (id topish uchun)
      else return json({ ok: false, code: 'CHAT_NOMALUM' }, 400);
    }
    if (!royxat.length) return json({ ok: false, code: 'CHAT_SOZLANMAGAN', xabar: 'TG_KANAL / TG_GURUH wrangler.toml [vars] da.' }, 400);
    return json({ ok: true, chatlar: await Promise.all(royxat.map(async (c) => ({ alias: c.alias, sozlangan: c.id, ...(await chatHolati(env, c.id)) }))) });
  }

  if (b.amal === 'tavsif_ornat' || b.amal === 'post_taklif' || b.amal === 'post_ochir') {
    const c = chatTanla(env, b.chat);
    if (!c) return json({ ok: false, code: 'CHAT_SOZLANMAGAN', xabar: 'Faqat sozlangan chat (TG_KANAL / TG_GURUH): chat = kanal | guruh.' }, 400);
    if (b.amal === 'tavsif_ornat') return javob(await tavsifOrnat(env, s.id, c, b.tavsif, b.sarlavha));
    if (b.amal === 'post_taklif') return javob(await postTaklif(env, s.id, c, b as { matn?: unknown; rasm?: unknown; video?: unknown; tarmoqlar?: unknown }));
    return javob(await postOchirTaklif(env, s.id, c, b.xabar_id));
  }
  return json({ ok: false, code: 'AMAL_NOMALUM' }, 400);
};
