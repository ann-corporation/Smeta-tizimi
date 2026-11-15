/**
 * obyekt-tugun-summa.ts - har RZ/BL tuguni uchun smeta / fakt / F-2 summalari UCHTA shaklda (QQS bilan, ustamali QQS siz, ustamasiz).
 *
 *   GET /api/obyekt-tugun-summa?obyekt_id=N
 *     -> { ok, obyekt_id, ustama: 'bor' | 'yoq', sabab?, obyekt: [smeta3, fakt3, f2_3], tugunlar: [[id, [s_qqs, s_ustamali, s_ustamasiz], [f_...], [a_...]]] }   (a = F-2; null = noma'lum, 0 emas)
 *
 * Hisob QURILMADA YO'Q va yangi qoida YO'Q: `src/lib/tugun-summa.ts` ekrandagi bo'lim kartalari (SmetaAnatomiya) ishlatadigan yagona yadroni
 * (svodKorinishKesimi / svodFaktKesimi -> ustamaliHisobla -> qiymatUchligi) chaqiradi; ustama manbai `ustamaManbaOl` (t2_obyekt_nakrutka_v1 + obyekt podvali) -
 * `/api/hujjat-yarat` (Slichitelniy/Ostatka) bilan bir xil. Ustama manbai o'qilmasa/yo'q bo'lsa faqat ustamasiz qaytadi (`ustama: 'yoq'`).
 * Darvoza `obyekt-paket` bilan bir xil: sessiya -> rol -> obyekt kompaniyasi a'zoligi -> smeta.read + f2.read + narx.read.
 * Ma'lumot o'qish `ichkiRejimda`: o'zgarmagan `_middleware` va `sb` darvozalari orqali (sayt bilan bir xil ruxsat).
 */
import { cachedAuthority } from '../_shared/permission-policy';
import { tekshir } from '../_shared/auth';
import { azoKompaniyalar } from '../_shared/tenant-oqish';
import { roleAuthority, sessiyaYaroqsizmi, yaroqsizSessiyaJavob } from '../_shared/role-authority';
import { otaKompaniyasi } from '../_shared/ota-kompaniya';
import { ichkiRejimda } from '../_shared/hujjat-ichki';
import { PAKET_RUXSATLARI } from './obyekt-paket';
import { daraxtToliqOl, ustamaManbaOl } from '../../src/lib/oylik-hujjat/ostatka-slichitelniy';
import { tugunDaraxti, type TugunQator } from '../../src/lib/tugun-summa';

type Env = { SUPABASE_URL: string; SUPABASE_KEY: string; SESSIYA_KALIT: string };
const NO_STORE = { 'Cache-Control': 'no-store' };
const xato = (status: number, code: string, error: string) => Response.json({ ok: false, code, error }, { status, headers: NO_STORE });

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  try {
    const env = ctx.env;
    let sess = cachedAuthority(ctx) ?? await tekshir(ctx.request.headers.get('Cookie'), env.SESSIYA_KALIT);
    if (!sess) return xato(401, 'AUTH_REQUIRED', 'Kirish talab qilinadi');
    if (!env.SUPABASE_URL || !env.SUPABASE_KEY) return xato(503, 'SOZLANMAGAN', 'Supabase sozlanmagan');
    const tekshirilgan = sess;
    sess = cachedAuthority(ctx) ?? await roleAuthority(sess, env);
    if (!sess && sessiyaYaroqsizmi(tekshirilgan)) return yaroqsizSessiyaJavob();
    if (!sess) return xato(503, 'AUTHORITY_UNAVAILABLE', 'Joriy ruxsatlarni tekshirib bo\'lmadi');
    if (!Number.isInteger(sess.foydalanuvchi_id) || (sess.foydalanuvchi_id as number) <= 0) return xato(401, 'AUTH_REQUIRED', 'Sessiyada foydalanuvchi yo\'q');
    if (!Array.isArray(sess.kompaniyalar)) return xato(401, 'SESSION_STALE', 'Sessiyani yangilang');

    const obyektId = Number(new URL(ctx.request.url).searchParams.get('obyekt_id'));
    if (!Number.isSafeInteger(obyektId) || obyektId <= 0) return xato(400, 'OBYEKT_ID', 'obyekt_id noto\'g\'ri');
    let kid: number | null;
    try { kid = await otaKompaniyasi(env, 't2_obyekt', obyektId); }
    catch { return xato(502, 'TENANT_CHECK_FAILED', 'Obyekt tegishliligini tekshirib bo\'lmadi'); }
    if (kid == null || !azoKompaniyalar(sess).includes(kid)) return xato(403, 'TENANT_FORBIDDEN', 'Bu obyektga ruxsat yo\'q');
    if (sess.rol !== 'superadmin') {
      if (!sess.permissionsByCompany) return xato(503, 'AUTHORITY_SCHEMA_REQUIRED', 'Ruxsatlar xaritasi yo\'q');
      const bor = sess.permissionsByCompany[kid] ?? [];
      if (!PAKET_RUXSATLARI.every((p) => bor.includes(p))) return xato(403, 'PERMISSION_DENIED', 'Ruxsat yetarli emas');
    }

    const natija = await ichkiRejimda(ctx, async () => {
      const d = await daraxtToliqOl(obyektId);
      if (!d.ok) return { yoq: d.xato } as const;
      const u = await ustamaManbaOl(kid!, obyektId);
      return { d, u } as const;
    });
    if ('yoq' in natija) return xato(502, 'DARAXT_OQILMADI', String(natija.yoq ?? '').slice(0, 160));
    const holat = new Map(natija.d.states.map((s) => [Number(s.qator_id), s] as const));
    const qatorlar: TugunQator[] = natija.d.rows.map((r) => {
      const h = holat.get(r.id);
      return { id: r.id, ota_id: r.ota_id, tur: String(r.tur), kat: r.kat, smeta: r.summa, fakt: h?.fakt_summa ?? null, f2: h?.f2_summa ?? null };
    });
    const ustama = natija.u.ok ? natija.u.ustama : null;
    const d = tugunDaraxti(qatorlar, ustama);
    const m = d.tugunlar;
    const uch = (x: { qqsBilan: number | null; ustamali: number | null; ustamasiz: number | null }) => [x.qqsBilan, x.ustamali, x.ustamasiz];
    const tugunlar = [...m].map(([id, t]) => [id, uch(t.smeta), uch(t.fakt), uch(t.f2)]);
    return Response.json({ ok: true, obyekt_id: obyektId, ustama: ustama ? 'bor' : 'yoq', obyekt: [uch(d.obyekt.smeta), uch(d.obyekt.fakt), uch(d.obyekt.f2)], ...(ustama ? {} : { sabab: natija.u.ok ? 'USTAMA_YOQ' : natija.u.xato.slice(0, 160) }), tugunlar }, { headers: NO_STORE });
  } catch (err: unknown) {
    return xato(502, 'TUGUN_SUMMA_XATO', err instanceof Error ? err.message.slice(0, 160) : 'Hisoblab bo\'lmadi');
  }
};
