import { tekshir } from '../_shared/auth';
import { aiCall, aiPublicError, type AiEnv } from '../_shared/ai';
import { AI_KORSATMA, type AiUmumiy } from '../../src/api/t2-ai';
import { supabaseBaseUrl } from '../_shared/supabase-url';
import { jarvisSalomJavobi, jarvisSalommi } from '../../src/lib/jarvis/intent';
import { jarvisHelp, jarvisMoney, jarvisEvidenceAnswer } from '../../src/lib/jarvis/answers';

type Env = AiEnv & {
  SESSIYA_KALIT: string;
  SUPABASE_URL: string;
  SUPABASE_KEY: string;
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
  /** Cloudflare Workers AI binding. Bu tashqi provider API kalitini talab qilmaydi. */
  AI?: {
    run: (model: string, input: Record<string, unknown>) => Promise<{
      response?: string;
      usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
    }>;
  };
  AI_MODEL?: string;
};

type Savol = { savol?: unknown; kompaniya_id?: unknown };

const MAX_SAVOL = 2000;
const MAX_PROMPT = 45000;

function xato(xabar: string, status = 400) {
  return Response.json({ ok: false, xabar }, { status });
}

function musbatId(value: unknown): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function oqishRpc<T>(env: Env, id: number): Promise<T> {
  const rpc = 't2_ai_umumiy';
  const param = 'p_kompaniya_id';
  const url = supabaseBaseUrl(env.SUPABASE_URL) +
    '/rest/v1/rpc/' + rpc + '?' + new URLSearchParams({ [param]: String(id) });
  const response = await fetch(url, {
    headers: {
      apikey: env.SUPABASE_KEY,
      Authorization: 'Bearer ' + env.SUPABASE_KEY,
    },
  });
  if (!response.ok) throw new Error('Kontekst so\'rovi bajarilmadi (' + response.status + ')');
  return await response.json() as T;
}

function umumiyMatn(k: AiUmumiy): string {
  const pul = jarvisMoney;
  const satrlar = k.obyektlar.map((o) =>
    '• ' + o.nom + ': smeta ' + pul(o.smeta) +
    (o.toliq ? '' : ' ⚠️ TO\'LIQ EMAS (' + o.narxsiz + ' qatorda narx yo\'q)') +
    ' · fakt ' + pul(o.fakt) + ' · Ф2 ' + pul(o.f2));
  return 'OBYEKTLAR HOLATI (tizimdan):\n' + satrlar.join('\n') + '\n\n' + k.izoh;
}

async function jarvisJavobi(env: Env, system: string, text: string) {
  if (env.OPENROUTER_API_KEY?.trim()) {
    // Egasi ulagan provider: Workers binding yoki boshqa eski kalit uni chetlab o'tmaydi.
    return aiCall({ ...env, AI_PRIMARY_PROVIDER: 'openrouter' }, { system, text, temperature: 0.1, maxOutputTokens: 1000, tier: 'fast' });
  }
  /* Cloudflare Workers AI birinchi tanlov: kalit emas, Pages binding orqali
     account ruxsati ishlatiladi. Tashqi providerlar faqat oldindan sozlangan
     bo'lsa, eski gateway orqali fallback bo'lib qoladi. */
  if (env.AI) {
    const model = String(env.AI_MODEL || '@cf/meta/llama-3.1-8b-instruct-fast').trim();
    const raw = await env.AI.run(model, {
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: text },
      ],
      temperature: 0.1,
      max_tokens: 1000,
    });
    const javob = String(raw?.response || '').trim();
    if (!javob) throw new Error('Workers AI bo\'sh javob qaytardi');
    return {
      text: javob,
      provider: 'cloudflare-workers-ai',
      model,
      usage: raw.usage,
    };
  }
  return aiCall(env, { system, text, temperature: 0.1, maxOutputTokens: 1000 });
}

/**
 * Jarvis beta: faqat dalilli, kompaniya-doirasidagi o'qish. Bu endpoint
 * hech qanday yozuvchi RPC chaqirmaydi; zayavka yoki boshqa amal keyingi
 * bosqichda alohida draft -> tasdiq kontrakti orqali qo'shiladi.
 */
export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const boshlandi = Date.now();
  try {
    const sess = await tekshir(ctx.request.headers.get('Cookie'), ctx.env.SESSIYA_KALIT);
    if (!sess) return xato('Kirish talab qilinadi', 401);
    if (!ctx.env.SUPABASE_URL || !ctx.env.SUPABASE_KEY) return xato('Supabase AI konteksti sozlanmagan', 503);

    let body: Savol;
    try { body = await ctx.request.json<Savol>(); }
    catch { return xato('Noto\'g\'ri JSON so\'rov'); }

    const savol = String(body.savol || '').trim();
    if (!savol || savol.length > MAX_SAVOL) return xato('Savol 1–' + MAX_SAVOL + ' belgi bo\'lishi kerak');

    // Oddiy salomlashuv kompaniya dalilini talab qilmaydi. Bu global floating
    // Jarvis oynasi kompaniya tanlanmagan paytda ham foydalanuvchini xom 422
    // bilan qaytarmasligi uchun local, deterministic javobdir.
    if (jarvisSalommi(savol)) {
      return Response.json({ ok: true, agent: 'Jarvis', javob: jarvisSalomJavobi(), requires_approval: false, provider: 'local', model: 'greeting', ms: Date.now() - boshlandi });
    }
    const help = jarvisHelp(savol);
    if (help) return Response.json({ ok: true, agent: 'Jarvis', javob: help, requires_approval: false, provider: 'local', model: 'capabilities' });

    if (!Array.isArray(sess.kompaniyalar)) {
      return xato('Sessiya kompaniya ruxsatini tasdiqlamayapti; qayta kiring', 403);
    }
    const soralganKompaniya = body.kompaniya_id == null ? null : musbatId(body.kompaniya_id);
    if (body.kompaniya_id != null && !soralganKompaniya) {
      return xato('kompaniya_id musbat butun son bo\'lishi kerak');
    }
    /* Global Jarvis ikonkasi Tizim_02 tanlagichidan tashqarida ham ochiladi.
       Bitta ruxsatli kompaniya bo'lsa uni sessiyadan xavfsiz tanlaymiz;
       bir nechta bo'lsa jimgina birinchisiga o'tmaymiz. */
    const kompaniyaId = soralganKompaniya ??
      (sess.kompaniyalar.length === 1 ? sess.kompaniyalar[0].kompaniya_id : null);
    if (!kompaniyaId) {
      return xato('Bir nechta kompaniya bor — Tizim_02 tepasidan kompaniyani tanlang', 422);
    }
    if (!sess.kompaniyalar.some((a) => a.kompaniya_id === kompaniyaId)) {
      return xato('Bu kompaniyaga ruxsat yo\'q', 403);
    }

    const kontekst = await oqishRpc<AiUmumiy>(ctx.env, kompaniyaId);
    if (!kontekst?.ok) return xato(String((kontekst && 'xabar' in kontekst && (kontekst as { xabar?: string }).xabar) || 'Kontekst olinmadi'), 422);
    const exact = jarvisEvidenceAnswer(savol, kontekst);
    if (exact) return Response.json({ ok: true, agent: 'Jarvis', javob: exact, dalil: { tur: 'kompaniya', id: kompaniyaId, rpc: 't2_ai_umumiy' }, requires_approval: false, provider: 'local', model: 'evidence', ms: Date.now() - boshlandi });

    const dalil = umumiyMatn(kontekst);
    const text = 'MA\'LUMOT (tizimdan):\n' + dalil + '\n\nSAVOL: ' + savol;
    if (text.length > MAX_PROMPT) return xato('Kontekst juda katta; aniqroq obyektni tanlang', 422);

    const natija = await jarvisJavobi(
      ctx.env,
      'Sening noming Jarvis. ' + AI_KORSATMA +
        '\n6. Bu beta agent faqat o\'qiydi; hech qanday amal bajarilgan deb aytma.' +
        '\n7. Qoidalarni javob sifatida takrorlama. «N qatorda» deb yozma: faqat manbadagi haqiqiy sonni yoz.' +
        '\n8. Tayin kompaniya ma’lumoti berilgan; qayta kompaniya tanlashni so‘rama. Faqat savolga tegishli obyektni tushuntir.' +
        '\n9. Summalarning tiyinlarini saqla. F2 va smeta to‘liqligini aralashtirma. Obyekt raqamlaridan o‘zingning imkoniyatlaring haqida xulosa qilma.',
      text,
    );

    return Response.json({
      ok: true,
      agent: 'Jarvis',
      javob: natija.text,
      dalil: { tur: 'kompaniya', id: kompaniyaId, rpc: 't2_ai_umumiy' },
      requires_approval: false,
      provider: natija.provider,
      model: natija.model,
      usage: natija.usage,
      ms: Date.now() - boshlandi,
    });
  } catch (error) {
    const ochiqXato = aiPublicError(error);
    const status = ochiqXato.code === 'request_invalid' ? 400 : 502;
    return Response.json({ ok: false, xabar: ochiqXato.message, code: ochiqXato.code }, { status });
  }
};
