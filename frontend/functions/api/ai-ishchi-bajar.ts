/**
 * POST /api/ai-ishchi-bajar — AI ishchilarning REJALI (fon) bajaruvchisi: GitHub Actions (.github/workflows/ai-ishchilar.yml, har 30 daqiqada).
 *
 *  • Kirish FAQAT `X-Kuzatuv-Kalit` == Cloudflare sirri `KUZATUV_KALIT` (≥24 belgi; boshqa davriy kalitlar bilan bir xil sir). Sozlanmagan → 503, noto'g'ri → 401.
 *    Sessiya/foydalanuvchi yo'q; javobda faqat SONLAR (hech qanday kompaniya ma'lumoti yo'q).
 *  • Qiladi: (1) t2_ai_jadval_v1 — kunlik/haftalik ishlarni navbatga qo'yadi va SQL qadamlarni bajaradi (pg_cron o'chiq bo'lsa ham ishlaydi);
 *    (2) navbatdagi internet ishi (≤1) va AI xulosa qadamlari (≤5). Har model chaqiruvi aiHisobli orqali — limit/hamyon tekshiruvi OLDIN, ish aktori = ishchini yoqqan odam.
 *  • Cloudflare chegarasi: bitta chaqiruvda ≤ SUBREQUEST_BUDJET ta tashqi chaqiruv; qolgan ishlar keyingi nuqtada davom etadi (navbat holati bazada).
 *  • AGENT_ISH_YOQILGAN=0 — favqulodda o'chirgich: faqat SQL qadamlar (quruq natija) ishlaydi, model chaqirilmaydi.
 */
import { rpcData } from '../_shared/agent-rpc';
import { haqiqiyBogliq, navbatniBajar, type IshchiEnv } from '../_shared/ai-ishchi';

type Env = IshchiEnv & { KUZATUV_KALIT?: string; AGENT_ISH_YOQILGAN?: string };
const JAVOB = { headers: { 'Cache-Control': 'no-store' } };
const javob = (d: unknown, status = 200) => Response.json(d, { status, ...JAVOB });
export const KALIT_MIN = 24;

/** Vaqtni oshkor qilmaydigan solishtirish. */
function teng(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i += 1) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}

export function kalitTekshir(req: Request, sir: string | undefined): 'ok' | 'sozlanmagan' | 'rad' {
  const kutilgan = String(sir || '').trim();
  if (kutilgan.length < KALIT_MIN) return 'sozlanmagan';
  return teng(req.headers.get('X-Kuzatuv-Kalit') || '', kutilgan) ? 'ok' : 'rad';
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const env = ctx.env;
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) return javob({ ok: false, error: 'Server sozlanmagan' }, 503);
  const k = kalitTekshir(ctx.request, env.KUZATUV_KALIT);
  if (k === 'sozlanmagan') return javob({ ok: false, error: 'Davriy ishchi sozlanmagan' }, 503);
  if (k === 'rad') return javob({ ok: false, error: 'Kalit noto‘g‘ri' }, 401);
  const jadval = await rpcData(env, 't2_ai_jadval_v1', {});
  /* Moslash qutisi keshi: kuniga bir marta, har chaqiruvda eng eskirgan 1 kompaniya (og'ir hisob — qutu jadvaldan o'qiydi). FAQAT o'qish/hisoblash; AI yo'q, token yo'q.
     Migratsiya (20261218800000) qo'llanmagan bo'lsa — jim o'tkaziladi. */
  await rpcData(env, 't2_moslash_kunlik_v1', { p_limit: 1 }).catch(() => null);
  if (env.AGENT_ISH_YOQILGAN === '0') return javob({ ok: true, jadval: jadval.ok ? { navbatga: jadval.data.navbatga ?? 0, bajarildi: jadval.data.bajarildi ?? 0 } : null, ai: 'ochirilgan' });
  const hisob = { n: 0 };
  const r = await navbatniBajar(haqiqiyBogliq(env, hisob), hisob, 5);
  return javob({ ok: true, jadval: jadval.ok ? { navbatga: jadval.data.navbatga ?? 0, bajarildi: jadval.data.bajarildi ?? 0, tiklandi: jadval.data.tiklandi ?? 0 } : null, ...r, subrequest: hisob.n });
};

export const onRequestGet: PagesFunction<Env> = async () => javob({ ok: false, error: 'Faqat POST' }, 405);
