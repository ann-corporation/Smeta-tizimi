/**
 * disk-yetim.ts - «Biriktirilmagan» papka (Disk A4): fayl ro'yxati + taklif (deterministik, keyin AI) + ko'chirish.
 *  - Ro'yxat va ko'chirish: SQL (t2_disk_yetim_royxat_v1 / t2_disk_yetim_kochir_v1; ruxsat, yo'l va kalit qoidasi shu yerda emas, SQL da).
 *  - Taklif: src/lib/disk-yetim-taklif.ts (sof modul). AI: FAQAT mavjud aiHisobli (agent-hisob) orqali - yangi provayder yo'q,
 *    limit va token yechish o'sha yerda; model javobi aiTaklifTekshir bilan qat'iy tekshiriladi (id larni o'ylab topa olmaydi).
 *  - Aktor FAQAT sessiyadan (chaqiruvchi beradi); body'dagi actor_id o'qilmaydi.
 */
import { aiHisobli, aiXatoJavobi } from './agent-hisob';
import { tashqiMatnOra } from './agent-prompt';
import { parseJsonText, type AiEnv } from './ai';
import { hmRpc, rpcOk, rpcXato, type HmEnv } from './hujjat-maydoni';
import { AI_TAKLIF_SXEMA, aiNomzodlari, aiTaklifTekshir, takliflar, type Taklif, type YetimFayl, type YetimLoyiha, type YetimObyekt } from '../../src/lib/disk-yetim-taklif';

type Env = HmEnv & AiEnv;
const JAVOB = { headers: { 'Cache-Control': 'no-store' } };
const AI_MAX_FAYL = 15;

type XomRoyxat = { ok: true; papka_id: number | null; daraja: number; fayllar: Array<YetimFayl & { mime?: string | null; bayt?: number | null; versiya?: number | null; yangilandi?: string | null }>; obyektlar: YetimObyekt[]; loyihalar: YetimLoyiha[] };

async function xomOl(env: Env, actorId: number, kompaniyaId: number): Promise<{ ok: true; r: XomRoyxat } | { ok: false; res: Response }> {
  const x = await hmRpc(env, 't2_disk_yetim_royxat_v1', { p_actor: actorId, p_kompaniya: kompaniyaId, p_limit: 300 });
  if (!rpcOk(x)) return { ok: false, res: rpcXato(x) };
  return { ok: true, r: x.body as XomRoyxat };
}

/** GET amal=yetim: fayllar + har biriga deterministik taklif + qo'lda tanlash uchun nomzodlar. */
export async function yetimRoyxat(env: Env, actorId: number, kompaniyaId: number): Promise<Response> {
  const x = await xomOl(env, actorId, kompaniyaId);
  if (!x.ok) return x.res;
  const { r } = x;
  const t = takliflar(r.fayllar, r.obyektlar, r.loyihalar);
  return Response.json({ ok: true, papka_id: r.papka_id, daraja: r.daraja, fayllar: r.fayllar.map((f, i) => ({ id: f.id, nom: f.nom, bayt: f.bayt ?? null, versiya: f.versiya ?? null, yangilandi: f.yangilandi ?? null, hujjat_turi: f.hujjat_turi ?? null, taklif: t[i] })), obyektlar: r.obyektlar.map((o) => ({ id: o.id, nom: o.nom, loyiha_id: o.loyiha_id, loyiha_nom: o.loyiha_nom ?? null })), loyihalar: r.loyihalar }, JAVOB);
}

/** POST amal=yetim_ai: deterministik taklifi yo'q fayllar uchun AI taklifi (token yechiladi; foydalanuvchi bosganda). */
export async function yetimAi(env: Env, actorId: number, kompaniyaId: number, faylIdlar: number[]): Promise<Response> {
  const x = await xomOl(env, actorId, kompaniyaId);
  if (!x.ok) return x.res;
  const { r } = x;
  const tanlov = new Set(faylIdlar);
  const det = new Map(takliflar(r.fayllar, r.obyektlar, r.loyihalar).map((t) => [t.faylId, t]));
  const nomzod = r.fayllar.filter((f) => tanlov.has(f.id) && det.get(f.id)?.daraja === 'yoq').slice(0, AI_MAX_FAYL);
  if (!nomzod.length) return Response.json({ ok: true, takliflar: [] as Taklif[], ai_chaqirildi: false }, JAVOB);
  const obyektlar = aiNomzodlari(nomzod, r.obyektlar);
  if (!obyektlar.length) return Response.json({ ok: true, takliflar: [] as Taklif[], ai_chaqirildi: false }, JAVOB);
  const yuk = {
    fayllar: nomzod.map((f) => ({ fayl_id: f.id, nom: f.nom, asl_nom: f.asl_nom ?? null, hujjat_turi: f.hujjat_turi ?? null, oy: f.revision ?? null })),
    obyektlar: obyektlar.map((o) => ({ obyekt_id: o.id, nom: o.nom, loyiha: o.loyiha_nom ?? null, shartnoma: o.shartnoma_raqam ?? null })),
  };
  try {
    const javob = await aiHisobli(env, actorId, kompaniyaId, null, 'disk_yetim_taklif', {
      system: 'Sen qurilish hujjatlarini obyektlarga biriktiruvchi yordamchisan. Har fayl uchun FAQAT berilgan obyektlar ro\'yxatidan bittasini tanla (obyekt_id). '
        + 'Fayl nomi lotin yoki kirill bo\'lishi mumkin. Ishonching 0.6 dan past bo\'lsa shu faylni natijaga QO\'SHMA. id o\'ylab topma. Faqat JSON qaytar.',
      text: tashqiMatnOra('disk-yetim', JSON.stringify(yuk)),
      tier: 'fast', temperature: 0, maxOutputTokens: 900, jsonSchema: AI_TAKLIF_SXEMA, totalTimeoutMs: 20000,
    });
    let xom: unknown = null;
    try { xom = parseJsonText(javob.text); } catch { xom = null; }
    return Response.json({ ok: true, takliflar: aiTaklifTekshir(xom, nomzod, obyektlar), ai_chaqirildi: true }, JAVOB);
  } catch (e) {
    return aiXatoJavobi(e);
  }
}

/** POST amal=yetim_kochir: bitta faylni obyekt/loyiha yo'liga ko'chiradi (SQL tekshiradi: ruxsat, yetim papka, kalit, nom to'qnashuvi). */
export async function yetimKochir(env: Env, actorId: number, kompaniyaId: number, faylId: number | null, loyihaId: number | null, obyektId: number | null): Promise<Response> {
  const x = await hmRpc(env, 't2_disk_yetim_kochir_v1', { p_actor: actorId, p_kompaniya: kompaniyaId, p_fayl_id: faylId, p_loyiha_id: loyihaId, p_obyekt_id: obyektId });
  return rpcOk(x) ? Response.json(x.body, JAVOB) : rpcXato(x);
}
