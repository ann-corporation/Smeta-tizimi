/**
 * POST /api/telegram/reliz — dastur relizlarini kanal/guruhda e'lon qilish (fayli bilan; _shared/telegram-reliz.ts).
 *
 * { amal:'holat' }                                              → manifestdagi joriy relizlar (versiya/hajm/sha256; token yo'q)   [superadmin]
 * { amal:'elon' }                                               → joriy relizlarni e'lon qiladi; allaqachon e'lon qilingani o'tkaziladi [cron YOKI superadmin]
 * { amal:'elon', platforma?:'android'|'windows', versiya?:'x.y.z', majbur?:true } → aniq versiyani (eski bo'lsa ham) qayta e'lon qilish [FAQAT superadmin]
 *
 * Kirish: (1) `X-Cron-Kalit` = BILDIRISHNOMA_CRON_KALIT (GitHub Actions .github/workflows/reliz-elon.yml; faqat «joriy relizni e'lon qil», majbur/versiya yo'q),
 *         (2) superadmin sessiyasi (sessiya + bazada qayta tekshiruv; origin tekshiruvi). Boshqasi — 401/403.
 * Chatlar: TG_KANAL va TG_GURUH (wrangler [vars]); bot ikkalasida admin bo'lishi kerak (docs/ops/TELEGRAM_RELIZ.md).
 */
import { superadminActor } from '../../_shared/superadmin';
import { type Reliz, type RelizEnv, elonChatlari, relizElon, relizTop, relizlarniOl } from '../../_shared/telegram-reliz';
import { tokenBormi } from '../../_shared/telegram';
import { cronKalitTekshir } from '../bildirishnoma-yetkaz';

type Env = RelizEnv & { SUPABASE_URL: string; SUPABASE_KEY: string; SESSIYA_KALIT: string; BILDIRISHNOMA_CRON_KALIT?: string };
const json = (b: unknown, status = 200) => Response.json(b, { status, headers: { 'Cache-Control': 'no-store' } });
const originYaroqsiz = (req: Request) => {
  const origin = req.headers.get('Origin');
  return req.headers.get('Sec-Fetch-Site') === 'cross-site' || (!!origin && origin !== new URL(req.url).origin);
};
const korinish = (r: Reliz) => ({ platforma: r.platforma, versiya: r.versiya, bayt: r.bayt, sha256: r.sha256, fayl: r.fayl });

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let cron = false; let kim: number | null = null;
  if (request.headers.get('X-Cron-Kalit') != null) {
    const k = cronKalitTekshir(request, env.BILDIRISHNOMA_CRON_KALIT);
    if (k === 'sozlanmagan') return json({ ok: false, code: 'SOZLANMAGAN' }, 503);
    if (k === 'rad') return json({ ok: false, code: 'RAD' }, 403);
    cron = true;
  } else {
    if (originYaroqsiz(request)) return json({ ok: false, code: 'ORIGIN_INVALID' }, 403);
    const s = await superadminActor(request, env);
    if ('code' in s) return json({ ok: false, code: s.code }, s.status);
    kim = s.id;
  }
  let b: Record<string, unknown> = {};
  try { b = await request.json(); } catch { return json({ ok: false, code: 'BODY_INVALID' }, 400); }
  if (!tokenBormi(env)) return json({ ok: false, code: 'SOZLANMAGAN' }, 503);

  const joriy = await relizlarniOl(env);
  if (b.amal === 'holat' && !cron) return json({ ok: true, relizlar: joriy.map(korinish), chatlar: elonChatlari(env).map((c) => c.alias) });
  if (b.amal !== 'elon') return json({ ok: false, code: 'AMAL_NOMALUM' }, 400);
  if (!elonChatlari(env).length) return json({ ok: false, code: 'CHAT_SOZLANMAGAN' }, 400);

  const platforma: 'android' | 'windows' | null = b.platforma === 'android' ? 'android' : b.platforma === 'windows' ? 'windows' : null;
  if (b.platforma != null && !platforma) return json({ ok: false, code: 'PLATFORMA_NOTOGRI' }, 400);
  if (cron && (b.majbur || b.versiya || platforma)) return json({ ok: false, code: 'CRON_FAQAT_JORIY' }, 403);

  let tanlangan: Reliz[];
  if (typeof b.versiya === 'string' && b.versiya) {
    const turlar = platforma ? [platforma] : (['android', 'windows'] as const);
    tanlangan = (await Promise.all(turlar.map((t) => relizTop(env, t, String(b.versiya), joriy)))).filter((x): x is Reliz => !!x);
  } else tanlangan = joriy.filter((x) => !platforma || x.platforma === platforma);
  if (!tanlangan.length) return json({ ok: false, code: 'RELIZ_TOPILMADI' }, 404);

  const natija = await relizElon(env, { relizlar: tanlangan, majbur: b.majbur === true, kim });
  return json({ ok: !natija.some((n) => n.holat === 'xato'), natija });
};
