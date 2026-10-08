import { tekshir } from '../_shared/auth';
import { aiPublicError, parseJsonText } from '../_shared/ai';
import { AiByudjetXatosi, aiHisobli } from '../_shared/ai-hisobli';
import { sessiyaKompaniya } from '../_shared/ai-kompaniya';
import { FAKTURA_AI_SCHEMA, normalizeFakturaAiPayload } from '../_shared/faktura-ai';

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
  GEMINI_MODEL?: string;
  GROQ_MODEL?: string;
  OPENAI_MODEL?: string;
  ANTHROPIC_MODEL?: string;
};

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_TEXT_LENGTH = 30000;
const MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function jsonError(message: string, status = 400, extra: Record<string, unknown> = {}) {
  return Response.json({ ok: false, xabar: message, ...extra }, { status });
}

function dataUrl(value: string, mimeType: string): { mimeType: string; data: string } | null {
  const match = value.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/i);
  if (match) {
    const actualMime = match[1].toLowerCase();
    if (actualMime !== mimeType.toLowerCase()) return null;
    return { mimeType: actualMime, data: match[2].replace(/\s/g, '') };
  }
  return { mimeType: mimeType.toLowerCase(), data: value.replace(/\s/g, '') };
}

function approxBytes(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const started = Date.now();
  try {
    const session = await tekshir(ctx.request.headers.get('Cookie'), ctx.env.SESSIYA_KALIT);
    if (!session) return jsonError('Кириш талаб қилинади', 401);

    let body: { base64?: string; mimeType?: string; nomi?: string; text?: string; kompaniya_id?: unknown };
    try {
      body = await ctx.request.json();
    } catch {
      return jsonError('Noto\'g\'ri JSON so\'rov');
    }

    /* Model chaqiruvi HISOBLI: kompaniya sessiyadan tekshiriladi; oylik limit, kompaniya hamyoni va sarf jurnali shu orqali (limit yo'q = AI yo'q). */
    const komp = sessiyaKompaniya(session, body.kompaniya_id);
    if (!komp.ok) return jsonError(komp.xabar, komp.status);
    const text = String(body.text || '').trim();
    if (text.length > MAX_TEXT_LENGTH) return jsonError('Matn hajmi juda katta');
    const encoded = String(body.base64 || '').trim();
    const mimeType = String(body.mimeType || '').trim().toLowerCase();
    let attachment: { mimeType: string; data: string } | undefined;

    if (encoded) {
      if (!MIME_TYPES.has(mimeType)) return jsonError('Fayl turi ruxsat etilmagan');
      const parsed = dataUrl(encoded, mimeType);
      if (!parsed || !parsed.data || !/^[A-Za-z0-9+/=]+$/.test(parsed.data)) {
        return jsonError('Fayl base64 formati noto\'g\'ri');
      }
      if (approxBytes(parsed.data) > MAX_FILE_BYTES) return jsonError('Fayl hajmi 8 MB dan oshmasligi kerak');
      attachment = parsed;
    } else if (!text) {
      return jsonError('Fayl yoki matn yuborilishi kerak');
    }

    const prompt = [
      'Bu qurilish kompaniyasining hisob-fakturasi/EHF hujjati.',
      'Hujjatdagi qiymatlarni aynan ko\'chiring; taxmin qilmang.',
      'O\'qilmagan yoki yo\'q qiymatni null qaytaring. 0 faqat hujjatda aniq 0 bo\'lsa ishlatiladi.',
      'Har bir item bitta tovar qatori bo\'lsin. Rekvizit va summalarni matn/fayldan tekshiring.',
      'sana YYYY-MM-DD yoki DD.MM.YYYY bo\'lsin.',
      text ? `Qo'shimcha matn:\n${text}` : '',
    ].filter(Boolean).join('\n');

    const result = await aiHisobli(ctx.env, komp.actor, komp.id, 'document_control', 'faktura_parse', {
      system: 'Siz OCR va hujjat rekvizitlarini ajratuvchi yordamchisiz. Javob faqat berilgan JSON schema bo\'yicha bo\'lsin.',
      text: prompt,
      attachment,
      jsonSchema: { name: 'faktura_parse', schema: FAKTURA_AI_SCHEMA },
      temperature: 0,
      maxOutputTokens: 4000,
    });

    const parsed = parseJsonText(result.text);
    const normalized = normalizeFakturaAiPayload(parsed);
    if (!normalized.ok) {
      return Response.json({ ...normalized, provider: result.provider, ms: Date.now() - started }, { status: 422 });
    }

    return Response.json({
      ...normalized,
      provider: result.provider,
      model: result.model,
      ms: Date.now() - started,
    });
  } catch (error) {
    if (error instanceof AiByudjetXatosi) return Response.json({ ok: false, xabar: error.xabar, code: error.kod }, { status: 402 });
    const publicError = aiPublicError(error);
    const status = publicError.code === 'request_invalid' ? 400 : 502;
    return Response.json({ ok: false, xabar: publicError.message, code: publicError.code }, { status });
  }
};
