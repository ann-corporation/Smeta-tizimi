/**
 * /api/ai-loyiha — loyiha chizmasi sahifasini (КЖ/АС/АР) vision model bilan o'qish. PROTOTIP, FLAG BILAN.
 *
 * Kontrakt: docs/architecture/AI_LOYIHA_OQISH.md
 *  - `AI_LOYIHA_YOQILGAN !== '1'` → 404 (standart: o'chiq);
 *  - sessiya majburiy (fail-closed), kompaniya sessiyadan (`sessiyaKompaniya`), boshqa kompaniya — 403;
 *  - bitta so'rov = bitta sahifa rasmi (PDF klientda pdf.js bilan chiziladi; Workers da canvas yo'q);
 *  - model chaqiruvi HISOBLI (`aiHisobli`: limit tekshiruvi → model → sarf/token yechish);
 *  - kesh: R2 `ai-loyiha-kesh/k{kompaniya}/{fayl_sha256}/...` — shu fayl/sahifa qayta o'qilsa token yechilmaydi;
 *  - AI javobi `sahifaJavobiniTekshir` dan o'tmasa 422; bazaga hech narsa yozilmaydi (faqat taklif qaytadi).
 */
import { cachedAuthority } from '../_shared/permission-policy';
import { tekshir } from '../_shared/auth';
import { aiPublicError } from '../_shared/ai';
import { AiByudjetXatosi, aiHisobli } from '../_shared/ai-hisobli';
import { sessiyaKompaniya } from '../_shared/ai-kompaniya';
import { AI_LOYIHA_JSON_SCHEMA, AI_LOYIHA_VERSIYA, VARAQ_TURLARI, type SahifaNatija, type VaraqTuri } from '../../src/lib/ai-loyiha/sxema';
import { sahifaJavobiniTekshir } from '../../src/lib/ai-loyiha/validator';
import { AI_LOYIHA_SYSTEM, sahifaPrompt } from '../../src/lib/ai-loyiha/prompt';
import { kesishmaTekshir } from '../../src/lib/ai-loyiha/kesishma';

type Env = {
  SESSIYA_KALIT: string;
  SUPABASE_URL?: string;
  SUPABASE_KEY?: string;
  OPENROUTER_API_KEY?: string;
  GEMINI_API_KEY?: string;
  GROQ_API_KEY?: string;
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  AI_PRIMARY_PROVIDER?: string;
  AI_TIMEOUT_MS?: string;
  AI_MAX_RETRIES?: string;
  AI_MAX_RETRY_DELAY_MS?: string;
  /** '1' bo'lmasa endpoint yo'q (404). */
  AI_LOYIHA_YOQILGAN?: string;
  /** Vision modeli (OpenRouter id). Profil modeli vision bo'lmasligi mumkin — shuning uchun alohida. */
  AI_LOYIHA_MODEL?: string;
  R2_CANONICAL?: R2Bucket;
};

export const AI_LOYIHA_STANDART_MODEL = 'google/gemini-2.5-flash';
export const AI_LOYIHA_PROFIL = 'document_control';
export const AI_LOYIHA_AMAL = 'loyiha_oqish';
const MAX_RASM_BAYT = 6 * 1024 * 1024;
const MAX_SAHIFA = 500;
const HEX64 = /^[0-9a-f]{64}$/;
const RASM_TURLARI = new Set(['image/jpeg', 'image/png', 'image/webp']);

const xato = (xabar: string, status: number, code?: string) => Response.json({ ok: false, xabar, ...(code ? { code } : {}) }, { status });

function base64Bayt(s: string): Uint8Array | null {
  if (!s || !/^[A-Za-z0-9+/]+={0,2}$/.test(s)) return null;
  try {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch { return null; }
}

async function sha256Hex(b: Uint8Array): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', b);
  return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

type KeshYozuv = { versiya: string; rasm_sha256: string; model: string; natija: SahifaNatija; ogohlantirishlar: string[] };

export function keshKaliti(kompaniyaId: number, faylSha: string, sahifa: number, varaqTuri: VaraqTuri | null): string {
  return `ai-loyiha-kesh/k${kompaniyaId}/${faylSha}/s${sahifa}.${varaqTuri ?? 'auto'}.${AI_LOYIHA_VERSIYA}.json`;
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  if (ctx.env.AI_LOYIHA_YOQILGAN !== '1') return xato('Topilmadi', 404, 'FLAG_OFF');
  try {
    const sess = cachedAuthority(ctx) ?? (ctx.env.SESSIYA_KALIT ? await tekshir(ctx.request.headers.get('Cookie'), ctx.env.SESSIYA_KALIT) : null);
    if (!sess) return xato('Кириш талаб қилинади', 401);

    let body: Record<string, any>;
    try { body = await ctx.request.json(); } catch { return xato('Noto‘g‘ri JSON so‘rov', 400); }
    const komp = sessiyaKompaniya(sess, body?.kompaniya_id);
    if (!komp.ok) return xato(komp.xabar, komp.status);

    if (body.versiya !== AI_LOYIHA_VERSIYA) return xato('Klient versiyasi eskirgan — sahifani yangilang', 409, 'VERSIYA');
    const faylSha = String(body.fayl_sha256 ?? '').toLowerCase();
    if (!HEX64.test(faylSha)) return xato('fayl_sha256 noto‘g‘ri', 400);
    const varaqTuri: VaraqTuri | null = (VARAQ_TURLARI as readonly string[]).includes(body.varaq_turi) ? body.varaq_turi : null;
    const s = body.sahifa ?? {};
    const raqam = Number(s.raqam);
    const jami = Number(s.jami);
    if (!Number.isInteger(raqam) || !Number.isInteger(jami) || raqam < 1 || jami < raqam || jami > MAX_SAHIFA) return xato('Sahifa raqami noto‘g‘ri', 400);
    const mimeType = String(s.mimeType ?? '').toLowerCase();
    if (!RASM_TURLARI.has(mimeType)) return xato('Sahifa rasm bo‘lishi kerak (jpeg/png/webp)', 400);
    const b64 = String(s.base64 ?? '').replace(/\s/g, '');
    if (b64.length > Math.ceil(MAX_RASM_BAYT / 3) * 4) return xato('Sahifa rasmi 6 MB dan oshmasin', 413);
    const bayt = base64Bayt(b64);
    if (!bayt || !bayt.length) return xato('Rasm base64 formati noto‘g‘ri', 400);
    const rasmSha = await sha256Hex(bayt);
    if (String(s.sha256 ?? '').toLowerCase() !== rasmSha) return xato('Rasm xeshi mos emas', 400, 'XESH');

    // Kesh: shu kompaniya, shu fayl, shu sahifa, shu rasm — qayta o'qish bepul.
    const kalit = keshKaliti(komp.id, faylSha, raqam, varaqTuri);
    const r2 = ctx.env.R2_CANONICAL;
    if (r2) {
      const obj = await r2.get(kalit).catch(() => null);
      const yozuv = obj ? await obj.json<KeshYozuv>().catch(() => null) : null;
      if (yozuv && yozuv.versiya === AI_LOYIHA_VERSIYA && yozuv.rasm_sha256 === rasmSha) {
        return Response.json({ ok: true, kesh: true, model: yozuv.model, natija: yozuv.natija, ogohlantirishlar: yozuv.ogohlantirishlar,
          kesishma: kesishmaTekshir([yozuv.natija]) });
      }
    }

    const matn = typeof s.matn === 'string' ? s.matn.slice(0, 20000) : null;
    const javob = await aiHisobli(ctx.env, komp.actor, komp.id, AI_LOYIHA_PROFIL, AI_LOYIHA_AMAL, {
      system: AI_LOYIHA_SYSTEM,
      text: sahifaPrompt({ sahifa: raqam, jamiSahifa: jami, varaqTuri, matnQatlami: matn }),
      attachment: { mimeType, data: b64 },
      jsonSchema: { name: 'ai_loyiha_sahifa', schema: AI_LOYIHA_JSON_SCHEMA },
      model: ctx.env.AI_LOYIHA_MODEL?.trim() || AI_LOYIHA_STANDART_MODEL,
      temperature: 0,
      maxOutputTokens: 12000,
      totalTimeoutMs: 120000,
    });
    if (javob.finishReason === 'length') return xato('AI javobi kesildi (varaq juda zich) — sahifani bo‘lib yuboring', 422, 'KESILDI');
    const v = sahifaJavobiniTekshir(javob.text, raqam, faylSha.slice(0, 8));
    if (!v.ok) return Response.json({ ok: false, xabar: 'AI javobi sxemaga mos emas', code: v.kod }, { status: 422 });

    if (r2) {
      const yozuv: KeshYozuv = { versiya: AI_LOYIHA_VERSIYA, rasm_sha256: rasmSha, model: javob.model, natija: v.natija, ogohlantirishlar: v.ogohlantirishlar };
      await r2.put(kalit, JSON.stringify(yozuv), { httpMetadata: { contentType: 'application/json' }, customMetadata: { kompaniya_id: String(komp.id) } }).catch(() => null);
    }
    return Response.json({ ok: true, kesh: false, model: javob.model, natija: v.natija, ogohlantirishlar: v.ogohlantirishlar, kesishma: kesishmaTekshir([v.natija]) });
  } catch (e) {
    if (e instanceof AiByudjetXatosi) return Response.json({ ok: false, xabar: e.xabar, code: e.kod }, { status: 402 });
    const p = aiPublicError(e);
    return Response.json({ ok: false, xabar: p.message, code: p.code }, { status: p.code === 'request_invalid' ? 400 : 502 });
  }
};
