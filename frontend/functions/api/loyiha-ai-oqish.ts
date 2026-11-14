/**
 * /api/loyiha-ai-oqish — chizma sahifasining (yoki jadval qismining) rasmini vision model bilan o'qish: qoida profillari o'qiy olmagan sahifalar uchun.
 * Hisob qoidasi: model chaqiruvi FAQAT `aiHisobli` orqali (limit -> model -> token yechish). Kesh: R2, kompaniya + fayl sha256 + sahifa + hudud:
 * qayta o'qish bepul (token yechilmaydi). Bazaga hech narsa yozilmaydi: natija «taklif» sifatida qaytadi (tasdiq — odam).
 * Aniq o'qilmagan qiymat null (0 emas); o'ylab topilgan nom/miqdor taqiqlangan (prompt va tekshiruvda).
 */
import { cachedAuthority } from '../_shared/permission-policy';
import { tekshir } from '../_shared/auth';
import { aiPublicError } from '../_shared/ai';
import { AiByudjetXatosi, aiHisobli } from '../_shared/ai-hisobli';
import { sessiyaKompaniya } from '../_shared/ai-kompaniya';

type Env = {
  SESSIYA_KALIT: string; SUPABASE_URL?: string; SUPABASE_KEY?: string;
  OPENROUTER_API_KEY?: string; GEMINI_API_KEY?: string; GROQ_API_KEY?: string; OPENAI_API_KEY?: string; ANTHROPIC_API_KEY?: string;
  AI_PRIMARY_PROVIDER?: string; AI_TIMEOUT_MS?: string; AI_MAX_RETRIES?: string; AI_MAX_RETRY_DELAY_MS?: string;
  AI_LOYIHA_MODEL?: string;
  R2_CANONICAL?: R2Bucket;
};

export const LOYIHA_AI_VERSIYA = 'lm-ai-1';
export const LOYIHA_AI_MODEL = 'google/gemini-2.5-flash';
const MAX_RASM_BAYT = 6 * 1024 * 1024;
const HEX64 = /^[0-9a-f]{64}$/;
const TURLAR = ['beton', 'armatura', 'pardoz', 'eshik_oyna', 'uskuna', 'boshqa'] as const;

export const LOYIHA_AI_SYSTEM = [
  'You read ONE construction drawing page (or a table region of it) and extract table rows of quantities.',
  'Return ONLY JSON matching the schema. Copy names, marks, units and numbers EXACTLY as printed; never invent, never round, never convert units.',
  'If a quantity is not clearly legible, set miqdor to null. Skip notes, dimensions and title-block text. Multi-line cells belong to ONE row.',
  'tur: beton (concrete volume), armatura (rebar mass/length), pardoz (finishing), eshik_oyna (doors/windows), uskuna (equipment), boshqa (anything else).',
].join('\n');

export const LOYIHA_AI_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['items'],
  properties: { items: { type: 'array', maxItems: 300, items: { type: 'object', additionalProperties: false, required: ['nom', 'birlik', 'miqdor', 'tur'],
    properties: { nom: { type: 'string' }, belgi: { type: ['string', 'null'] }, birlik: { type: 'string' }, miqdor: { type: ['number', 'null'] }, tur: { type: 'string', enum: [...TURLAR] } } } } },
} as const;

export type AiElement = { nom: string; belgi: string | null; birlik: string; miqdor: number | null; tur: (typeof TURLAR)[number] };

/** Model javobini qat'iy tekshiradi: noto'g'ri qator tashlanmaydi, butun javob rad etiladi (fail-closed). */
export function javobniTekshir(text: string): { ok: true; items: AiElement[] } | { ok: false; kod: string } {
  let j: unknown;
  try { j = JSON.parse(text); } catch { return { ok: false, kod: 'JSON' }; }
  const arr = (j as { items?: unknown })?.items;
  if (!Array.isArray(arr) || arr.length > 300) return { ok: false, kod: 'ITEMS' };
  const items: AiElement[] = [];
  for (const x of arr) {
    const e = x as Record<string, unknown>;
    const nom = typeof e?.nom === 'string' ? e.nom.trim() : ''; const birlik = typeof e?.birlik === 'string' ? e.birlik.trim() : '';
    const miqdor = e?.miqdor == null ? null : Number(e.miqdor);
    if (!nom || nom.length > 300 || !birlik || birlik.length > 20 || (miqdor != null && (!Number.isFinite(miqdor) || miqdor < 0))) return { ok: false, kod: 'QATOR' };
    const belgi = typeof e.belgi === 'string' && e.belgi.trim() ? e.belgi.trim().slice(0, 60) : null;
    items.push({ nom, belgi, birlik, miqdor, tur: (TURLAR as readonly string[]).includes(String(e.tur)) ? (e.tur as AiElement['tur']) : 'boshqa' });
  }
  return { ok: true, items };
}

export function keshKaliti(kompaniyaId: number, faylSha: string, sahifa: number, hudud: string): string {
  return `loyiha-ai-kesh/k${kompaniyaId}/${faylSha}/s${sahifa}.${hudud}.${LOYIHA_AI_VERSIYA}.json`;
}

const xato = (xabar: string, status: number, code?: string) => Response.json({ ok: false, xabar, ...(code ? { code } : {}) }, { status });

function base64Bayt(s: string): Uint8Array | null {
  if (!s || !/^[A-Za-z0-9+/]+={0,2}$/.test(s)) return null;
  try { const bin = atob(s); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; } catch { return null; }
}
async function sha256Hex(b: Uint8Array): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', b as BufferSource);
  return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  try {
    const sess = cachedAuthority(ctx) ?? (ctx.env.SESSIYA_KALIT ? await tekshir(ctx.request.headers.get('Cookie'), ctx.env.SESSIYA_KALIT) : null);
    if (!sess) return xato('Kirish talab qilinadi', 401);
    let body: Record<string, any>;
    try { body = await ctx.request.json(); } catch { return xato('Noto‘g‘ri JSON so‘rov', 400); }
    const komp = sessiyaKompaniya(sess, body?.kompaniya_id);
    if (!komp.ok) return xato(komp.xabar, komp.status);
    if (body.versiya !== LOYIHA_AI_VERSIYA) return xato('Klient versiyasi eskirgan — sahifani yangilang', 409, 'VERSIYA');
    const faylSha = String(body.fayl_sha256 ?? '').toLowerCase();
    if (!HEX64.test(faylSha)) return xato('fayl_sha256 noto‘g‘ri', 400);
    const s = body.sahifa ?? {};
    const raqam = Number(s.raqam);
    if (!Number.isInteger(raqam) || raqam < 1 || raqam > 500) return xato('Sahifa raqami noto‘g‘ri', 400);
    const mimeType = String(s.mimeType ?? '').toLowerCase();
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) return xato('Sahifa rasm bo‘lishi kerak (jpeg/png/webp)', 400);
    const b64 = String(s.base64 ?? '').replace(/\s/g, '');
    if (b64.length > Math.ceil(MAX_RASM_BAYT / 3) * 4) return xato('Rasm 6 MB dan oshmasin', 413);
    const bayt = base64Bayt(b64);
    if (!bayt?.length) return xato('Rasm base64 formati noto‘g‘ri', 400);
    const rasmSha = await sha256Hex(bayt);
    if (String(s.sha256 ?? '').toLowerCase() !== rasmSha) return xato('Rasm xeshi mos emas', 400, 'XESH');
    const hudud = /^[0-9a-z_-]{1,40}$/i.test(String(s.hudud ?? 'toliq')) ? String(s.hudud ?? 'toliq') : 'toliq';

    const kalit = keshKaliti(komp.id, faylSha, raqam, hudud);
    const r2 = ctx.env.R2_CANONICAL;
    if (r2) {
      const obj = await r2.get(kalit).catch(() => null);
      const yozuv = obj ? await obj.json<{ versiya: string; rasm_sha256: string; model: string; items: AiElement[] }>().catch(() => null) : null;
      if (yozuv && yozuv.versiya === LOYIHA_AI_VERSIYA && yozuv.rasm_sha256 === rasmSha) return Response.json({ ok: true, kesh: true, model: yozuv.model, items: yozuv.items });
    }
    const javob = await aiHisobli(ctx.env, komp.actor, komp.id, 'document_control', 'loyiha_oqish', {
      system: LOYIHA_AI_SYSTEM,
      text: `Sheet ${typeof body.varaq === 'string' ? body.varaq.slice(0, 20) : ''}, page ${raqam}. Extract the quantity table rows.`,
      attachment: { mimeType, data: b64 },
      jsonSchema: { name: 'loyiha_ai_jadval', schema: LOYIHA_AI_SCHEMA as unknown as Record<string, unknown> },
      model: ctx.env.AI_LOYIHA_MODEL?.trim() || LOYIHA_AI_MODEL,
      temperature: 0, maxOutputTokens: 8000, totalTimeoutMs: 120000,
    });
    if (javob.finishReason === 'length') return xato('AI javobi kesildi — jadval qismini kichikroq tanlang', 422, 'KESILDI');
    const v = javobniTekshir(javob.text);
    if (!v.ok) return Response.json({ ok: false, xabar: 'AI javobi sxemaga mos emas', code: v.kod }, { status: 422 });
    if (r2) await r2.put(kalit, JSON.stringify({ versiya: LOYIHA_AI_VERSIYA, rasm_sha256: rasmSha, model: javob.model, items: v.items }), { httpMetadata: { contentType: 'application/json' }, customMetadata: { kompaniya_id: String(komp.id) } }).catch(() => null);
    return Response.json({ ok: true, kesh: false, model: javob.model, items: v.items });
  } catch (e) {
    if (e instanceof AiByudjetXatosi) return Response.json({ ok: false, xabar: e.xabar, code: e.kod }, { status: 402 });
    const p = aiPublicError(e);
    return Response.json({ ok: false, xabar: p.message, code: p.code }, { status: p.code === 'request_invalid' ? 400 : 502 });
  }
};
