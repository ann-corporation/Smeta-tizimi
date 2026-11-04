/**
 * ilova-darvoza.ts — ILOVA DARVOZASI (ekotizim P1, docs/architecture/EKOTIZIM_ILOVALAR_V1.md §F.3).
 *
 * Kompaniya ilovani (module.moliya, module.sotuv, …) o'chirgan bo'lsa, shu ilovaga tegishli amallar `/api/sb-yoz`,
 * o'qishlar `/api/sb` da `ILOVA_YOQILMAGAN` (403) bilan rad etiladi — menyu faqat ko'rinish edi, bu esa SERVER chegarasi.
 * Xarita (amal/so'rov → ilova) — `src/lib/ilova/ilovalar.ts` (menyu bilan bir manba). Xaritada YO'Q amal hech qachon bloklanmaydi.
 *
 * Holat manbai: mavjud `t2_modul_holat_v1(kompaniya, actor)` (default + kompaniya override). Kesh: isolate xotirasida 20 soniya
 * (modul o'chirish/yoqish darhol emas, ≤20 s ichida kuchga kiradi). Fail-open: holatni o'qib bo'lmasa — amal o'tadi
 * (capability/ruxsat tekshiruvi baribir qo'llanadi; ilova o'chirish tijoriy/ko'rinish chegarasi, xavfsizlik emas).
 * Platforma superadmini va ilovaga bog'lanmagan amallar — to'siqsiz.
 */
import { ilovaModuli, type IlovaKod } from '../../src/lib/ilova/ilovalar';
import { supabaseBaseUrl } from './supabase-url';

export type DarvozaEnv = { SUPABASE_URL?: string; SUPABASE_KEY?: string };
type Holat = { vaqt: number; off: ReadonlySet<string> };

const KESH_MS = 20_000;
const kesh = new Map<number, Holat>();
/** Test uchun. */
export const ilovaKeshTozala = () => kesh.clear();

async function ochirilganModullar(env: DarvozaEnv, kompaniyaId: number, actorId: number): Promise<ReadonlySet<string> | null> {
  const h = kesh.get(kompaniyaId);
  if (h && Date.now() - h.vaqt < KESH_MS) return h.off;
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) return null;
  const r = await fetch(supabaseBaseUrl(env.SUPABASE_URL) + '/rest/v1/rpc/t2_modul_holat_v1', {
    method: 'POST',
    headers: { apikey: env.SUPABASE_KEY, Authorization: 'Bearer ' + env.SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_kompaniya_id: kompaniyaId, p_actor_id: actorId }),
  }).catch(() => null);
  if (!r || !r.ok) return null;
  const j = await r.json().catch(() => null) as { ok?: boolean; modullar?: Array<{ kod?: string; holat?: string }> } | null;
  if (!j || j.ok !== true || !Array.isArray(j.modullar)) return null;
  const off = new Set(j.modullar.filter((m) => m.holat === 'off' && typeof m.kod === 'string').map((m) => m.kod as string));
  kesh.set(kompaniyaId, { vaqt: Date.now(), off });
  return off;
}

/** Ilova o'chirilgan bo'lsa 403 `ILOVA_YOQILMAGAN`, aks holda null. `kompaniyaId` noto'g'ri/yo'q bo'lsa — tekshirilmaydi. */
export async function ilovaDarvozasi(
  env: DarvozaEnv, sess: { rol?: string; foydalanuvchi_id?: unknown } | null | undefined,
  ilova: IlovaKod | null, kompaniyaId: unknown,
): Promise<Response | null> {
  if (!ilova || !sess || sess.rol === 'superadmin') return null;
  const modul = ilovaModuli(ilova);
  const kid = Number(kompaniyaId);
  const actor = Number(sess.foydalanuvchi_id);
  if (!modul || !Number.isSafeInteger(kid) || kid <= 0 || !Number.isSafeInteger(actor) || actor <= 0) return null;
  const off = await ochirilganModullar(env, kid, actor);
  if (!off || !off.has(modul)) return null;
  return Response.json({
    ok: false, code: 'ILOVA_YOQILMAGAN', ilova, modul,
    error: 'Bu ilova kompaniyada o‘chirilgan. Kompaniya → Modullar bo‘limida yoqing.',
  }, { status: 403 });
}
