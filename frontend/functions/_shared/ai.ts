/**
 * TIZIM_02 AI GATEWAY
 *
 * Barcha Cloudflare AI chaqiruvlari uchun bitta, provider-agnostic qatlam.
 * Gateway model javobini moliyaviy haqiqat deb qabul qilmaydi: u faqat
 * matn/JSON qaytaradi, domain validator esa uni keyin tekshiradi.
 *
 * Xavfsizlik chegaralari:
 *   - API kalitlari faqat Cloudflare environment'da qoladi;
 *   - provider nomi va URL klientdan qabul qilinmaydi;
 *   - timeout/retry barcha providerlarda bir xil ishlaydi;
 *   - fallback faqat boshqa sozlangan providerga o'tadi;
 *   - modeldan kelgan ichki xato klientga berilmaydi.
 */

export type AiProvider = 'gemini' | 'groq' | 'openai' | 'anthropic' | 'openrouter';

/** Model darajasi: qaysi ish qaysi modelga ketishini SERVER belgilaydi (klient model nomini yubormaydi). */
export type AiTier = 'fast' | 'coding' | 'reasoning';

export type AiAttachment = {
  mimeType: string;
  /** Data URL prefiksi olib tashlangan base64 qiymat. */
  data: string;
};

export type AiJsonSchema = {
  name: string;
  schema: Record<string, unknown>;
};

export type AiRequest = {
  system?: string;
  text: string;
  attachment?: AiAttachment;
  jsonSchema?: AiJsonSchema;
  temperature?: number;
  maxOutputTokens?: number;
  /** Berilsa va OpenRouter sozlangan bo'lsa — shu daraja modeli birinchi tanlanadi. */
  tier?: AiTier;
  /** Admin katalogidan tanlangan aniq OpenRouter modeli (faqat openrouter provayderiga ta'sir qiladi; tier dan ustun). */
  model?: string;
};

export type AiUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

export type AiResponse = {
  text: string;
  provider: AiProvider;
  model: string;
  usage?: AiUsage;
};

export type AiEnv = {
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
  /** OpenRouter: bitta kalit orqali ko'p model. Faqat Cloudflare secret; kodda/gitda/frontendda YO'Q. */
  OPENROUTER_API_KEY?: string;
  OPENROUTER_MODEL?: string;
  OPENROUTER_MODEL_FAST?: string;
  OPENROUTER_MODEL_CODING?: string;
  OPENROUTER_MODEL_REASONING?: string;
};

type JsonObject = Record<string, any>;

const PROVIDER_ORDER: AiProvider[] = ['gemini', 'groq', 'openai', 'anthropic', 'openrouter'];
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const DEFAULT_MODELS: Record<AiProvider, string> = {
  gemini: 'gemini-2.5-flash',
  groq: 'llama-3.3-70b-versatile',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-haiku-latest',
  openrouter: 'openrouter/auto',
};

const ENV_KEY: Record<AiProvider, keyof AiEnv> = {
  gemini: 'GEMINI_API_KEY',
  groq: 'GROQ_API_KEY',
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
};

const ENV_MODEL: Record<AiProvider, keyof AiEnv> = {
  gemini: 'GEMINI_MODEL',
  groq: 'GROQ_MODEL',
  openai: 'OPENAI_MODEL',
  anthropic: 'ANTHROPIC_MODEL',
  openrouter: 'OPENROUTER_MODEL',
};

const ENV_TIER_MODEL: Record<AiTier, keyof AiEnv> = {
  fast: 'OPENROUTER_MODEL_FAST',
  coding: 'OPENROUTER_MODEL_CODING',
  reasoning: 'OPENROUTER_MODEL_REASONING',
};

export type AiErrorCode =
  | 'request_invalid'
  | 'not_configured'
  | 'timeout'
  | 'provider_unavailable'
  | 'invalid_response';

export class AiGatewayError extends Error {
  readonly code: AiErrorCode;
  readonly status?: number;

  constructor(code: AiErrorCode, message: string, status?: number) {
    super(message);
    this.name = 'AiGatewayError';
    this.code = code;
    this.status = status;
  }
}

function numberEnv(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function providerFrom(value: string | undefined): AiProvider | null {
  const normalized = String(value || '').trim().toLowerCase();
  return (PROVIDER_ORDER as string[]).includes(normalized) ? normalized as AiProvider : null;
}

function modelFor(env: AiEnv, provider: AiProvider, tier?: AiTier, model?: string): string {
  if (provider === 'openrouter' && model) return model;
  const tierModel = provider === 'openrouter' && tier ? env[ENV_TIER_MODEL[tier]] : undefined;
  const configured = tierModel || env[ENV_MODEL[provider]];
  return String(configured || DEFAULT_MODELS[provider]).trim();
}

function keyFor(env: AiEnv, provider: AiProvider): string {
  return String(env[ENV_KEY[provider]] || '').trim();
}

function supportsAttachment(provider: AiProvider, attachment?: AiAttachment): boolean {
  if (!attachment) return true;
  if (provider === 'gemini') return IMAGE_TYPES.has(attachment.mimeType) || attachment.mimeType === 'application/pdf';
  if (provider === 'openai' || provider === 'anthropic') return IMAGE_TYPES.has(attachment.mimeType);
  /* Groq modeli bu gateway'da matn uchun ishlatiladi. Vision faylni
     noto'g'ri fallback qilib yubormaslik uchun ataylab o'tkazib yuboriladi. */
  return false;
}

function candidateProviders(env: AiEnv, request: AiRequest): AiProvider[] {
  const primary = providerFrom(env.AI_PRIMARY_PROVIDER);
  /* tier berilgan so'rovda OpenRouter (sozlangan bo'lsa) birinchi: daraja → model xaritasi shu yerda. */
  const first = (request.tier || request.model) && !primary ? 'openrouter' : primary;
  const order = first
    ? [first, ...PROVIDER_ORDER.filter((provider) => provider !== first)]
    : PROVIDER_ORDER;
  return order.filter((provider) => keyFor(env, provider) && supportsAttachment(provider, request.attachment));
}

function retryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

function retryAfterMs(headers: Headers): number | null {
  const raw = headers.get('retry-after');
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(raw);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new AiGatewayError('timeout', 'AI provider javobi uchun vaqt tugadi');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function providerFetch(
  provider: AiProvider,
  env: AiEnv,
  request: AiRequest,
  timeoutMs: number,
  maxRetries: number,
  maxRetryDelayMs: number,
): Promise<{ body: JsonObject; headers: Headers }> {
  const key = keyFor(env, provider);
  const model = modelFor(env, provider, request.tier, request.model);
  const payload = providerPayload(provider, model, request);
  const prepared = providerInit(provider, key, model, payload);
  let lastStatus = 0;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const response = await fetchWithTimeout(prepared.url, prepared.init, timeoutMs);
    const raw = await response.text();
    let body: JsonObject = {};
    try {
      body = raw ? JSON.parse(raw) as JsonObject : {};
    } catch {
      body = { raw };
    }

    if (response.ok) return { body, headers: response.headers };
    lastStatus = response.status;
    if (!retryableStatus(response.status) || attempt === maxRetries) {
      throw new AiGatewayError('provider_unavailable', 'AI provider so\'rovni qabul qilmadi', response.status);
    }

    const serverDelay = retryAfterMs(response.headers);
    const exponential = 250 * (2 ** attempt);
    await sleep(Math.min(maxRetryDelayMs, serverDelay ?? exponential));
  }

  throw new AiGatewayError('provider_unavailable', 'AI provider mavjud emas', lastStatus);
}

function providerUrl(provider: AiProvider): string {
  if (provider === 'gemini') return 'https://generativelanguage.googleapis.com/v1beta/models';
  if (provider === 'groq') return 'https://api.groq.com/openai/v1/chat/completions';
  if (provider === 'openrouter') return 'https://openrouter.ai/api/v1/chat/completions';
  if (provider === 'openai') return 'https://api.openai.com/v1/responses';
  return 'https://api.anthropic.com/v1/messages';
}

function providerPayload(provider: AiProvider, model: string, request: AiRequest): JsonObject {
  const temperature = request.temperature == null ? 0.1 : Math.min(1, Math.max(0, request.temperature));
  const maxTokens = request.maxOutputTokens || 1800;
  const jsonInstruction = request.jsonSchema
    ? '\nJavobni faqat valid JSON sifatida qaytaring. Markdown yoki izoh yozmang.'
    : '';

  if (provider === 'gemini') {
    const parts: JsonObject[] = [{ text: request.text + jsonInstruction }];
    if (request.attachment) {
      parts.push({ inline_data: { mime_type: request.attachment.mimeType, data: request.attachment.data } });
    }
    const payload: JsonObject = {
      contents: [{ role: 'user', parts }],
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens,
        ...(request.jsonSchema ? { responseMimeType: 'application/json' } : {}),
      },
    };
    if (request.system) payload.system_instruction = { parts: [{ text: request.system }] };
    return payload;
  }

  if (provider === 'openai') {
    const content: JsonObject[] = [{ type: 'input_text', text: request.text }];
    if (request.attachment) {
      content.push({
        type: 'input_image',
        image_url: `data:${request.attachment.mimeType};base64,${request.attachment.data}`,
      });
    }
    const payload: JsonObject = {
      model,
      input: [{ role: 'user', content }],
      max_output_tokens: maxTokens,
      temperature,
    };
    if (request.system) payload.instructions = request.system;
    if (request.jsonSchema) {
      payload.text = {
        format: {
          type: 'json_schema',
          name: request.jsonSchema.name,
          strict: true,
          schema: request.jsonSchema.schema,
        },
      };
    }
    return payload;
  }

  const userContent: JsonObject[] = [{ type: 'text', text: request.text + jsonInstruction }];
  if (request.attachment && provider === 'anthropic') {
    userContent.push({
      type: 'image',
      source: { type: 'base64', media_type: request.attachment.mimeType, data: request.attachment.data },
    });
  }

  if (provider === 'anthropic') {
    return {
      model,
      max_tokens: maxTokens,
      temperature,
      ...(request.system ? { system: request.system } : {}),
      messages: [{ role: 'user', content: userContent }],
    };
  }

  return {
    model,
    temperature,
    max_tokens: maxTokens,
    messages: [
      ...(request.system ? [{ role: 'system', content: request.system }] : []),
      { role: 'user', content: request.text + jsonInstruction },
    ],
    ...(request.jsonSchema ? { response_format: { type: 'json_object' } } : {}),
  };
}

function providerInit(
  provider: AiProvider,
  key: string,
  model: string,
  payload: JsonObject,
): { url: string; init: RequestInit } {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  let url = providerUrl(provider);
  if (provider === 'gemini') {
    url += '/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(key);
  } else if (provider === 'anthropic') {
    headers['x-api-key'] = key;
    headers['anthropic-version'] = '2023-06-01';
  } else {
    headers.Authorization = 'Bearer ' + key;
    if (provider === 'openrouter') headers['X-Title'] = 'Smeta-tizimi';
  }
  return { url, init: { method: 'POST', headers, body: JSON.stringify(payload) } };
}

function textFromProvider(provider: AiProvider, body: JsonObject): { text: string; usage?: AiUsage } {
  if (provider === 'gemini') {
    const parts = body.candidates?.[0]?.content?.parts;
    const text = Array.isArray(parts)
      ? parts.map((part: JsonObject) => String(part.text || '')).join('').trim()
      : '';
    return { text, usage: usageFrom(body.usageMetadata, 'gemini') };
  }

  if (provider === 'openai') {
    let text = String(body.output_text || '').trim();
    if (!text && Array.isArray(body.output)) {
      text = body.output
        .flatMap((item: JsonObject) => Array.isArray(item.content) ? item.content : [])
        .filter((part: JsonObject) => part.type === 'output_text')
        .map((part: JsonObject) => String(part.text || ''))
        .join('').trim();
    }
    return { text, usage: usageFrom(body.usage, 'openai') };
  }

  if (provider === 'anthropic') {
    const text = Array.isArray(body.content)
      ? body.content.filter((part: JsonObject) => part.type === 'text')
        .map((part: JsonObject) => String(part.text || '')).join('').trim()
      : '';
    return { text, usage: usageFrom(body.usage, 'anthropic') };
  }

  const content = body.choices?.[0]?.message?.content;
  const text = typeof content === 'string'
    ? content.trim()
    : Array.isArray(content)
      ? content.map((part: JsonObject) => String(part.text || '')).join('').trim()
      : '';
  return { text, usage: usageFrom(body.usage, provider) };
}

function usageFrom(usage: JsonObject | undefined, provider: AiProvider): AiUsage | undefined {
  if (!usage) return undefined;
  /* OpenAI-mos chat (groq/openrouter) prompt_tokens/completion_tokens qaytaradi. */
  const input = provider === 'gemini' ? usage.promptTokenCount : usage.input_tokens ?? usage.prompt_tokens;
  const output = provider === 'gemini' ? usage.candidatesTokenCount : usage.output_tokens ?? usage.completion_tokens;
  const total = provider === 'gemini' ? usage.totalTokenCount : usage.total_tokens;
  return {
    inputTokens: Number.isFinite(Number(input)) ? Number(input) : undefined,
    outputTokens: Number.isFinite(Number(output)) ? Number(output) : undefined,
    totalTokens: Number.isFinite(Number(total)) ? Number(total) : undefined,
  };
}

/**
 * Modelning JSON javobini markdown fence va qo'shimcha matndan ajratadi.
 * Domain validator keyingi qadamda qiymatlarni tekshiradi.
 */
export function parseJsonText<T = unknown>(text: string): T {
  const source = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    return JSON.parse(source) as T;
  } catch {
    /* JSON oldidan/qatoridan izoh kelgan providerlar uchun xavfsiz skan. */
    for (let start = 0; start < source.length; start += 1) {
      if (source[start] !== '{' && source[start] !== '[') continue;
      const open = source[start];
      const close = open === '{' ? '}' : ']';
      let depth = 0;
      let quoted = false;
      let escaped = false;
      for (let i = start; i < source.length; i += 1) {
        const char = source[i];
        if (quoted) {
          if (escaped) escaped = false;
          else if (char === '\\') escaped = true;
          else if (char === '"') quoted = false;
          continue;
        }
        if (char === '"') { quoted = true; continue; }
        if (char === open) depth += 1;
        if (char === close) depth -= 1;
        if (depth === 0) {
          try { return JSON.parse(source.slice(start, i + 1)) as T; } catch { break; }
        }
      }
    }
  }
  throw new AiGatewayError('invalid_response', 'AI valid JSON qaytarmadi');
}

export function isAiGatewayError(error: unknown): error is AiGatewayError {
  return error instanceof AiGatewayError;
}

export function aiPublicError(error: unknown): { code: AiErrorCode; message: string } {
  if (isAiGatewayError(error)) {
    const messages: Record<AiErrorCode, string> = {
      request_invalid: 'AI so\'rovi tekshiruvdan o\'tmadi',
      not_configured: 'AI provider sozlanmagan. Cloudflare environment kalitlarini kiriting.',
      timeout: 'AI javobi uchun vaqt tugadi. Keyinroq qayta urinib ko\'ring.',
      provider_unavailable: 'AI providerlar vaqtincha javob bermayapti. Keyinroq qayta urinib ko\'ring.',
      invalid_response: 'AI javobi kutilgan formatda emas; hujjat moliyaviy yozuvga aylantirilmadi.',
    };
    return { code: error.code, message: messages[error.code] };
  }
  return { code: 'provider_unavailable', message: 'AI xizmati vaqtincha mavjud emas.' };
}

export async function aiCall(env: AiEnv, request: AiRequest): Promise<AiResponse> {
  const text = String(request.text || '').trim();
  if (!text || text.length > 50000) {
    throw new AiGatewayError('request_invalid', 'AI matni bo\'sh yoki juda uzun');
  }
  if (request.attachment && (!IMAGE_TYPES.has(request.attachment.mimeType) && request.attachment.mimeType !== 'application/pdf')) {
    throw new AiGatewayError('request_invalid', 'Fayl turi AI uchun ruxsat etilmagan');
  }

  const providers = candidateProviders(env, request);
  if (!providers.length) throw new AiGatewayError('not_configured', 'Mos AI provider sozlanmagan');

  const timeoutMs = numberEnv(env.AI_TIMEOUT_MS, 20000, 3000, 45000);
  const maxRetries = numberEnv(env.AI_MAX_RETRIES, 1, 0, 3);
  const maxRetryDelayMs = numberEnv(env.AI_MAX_RETRY_DELAY_MS, 2500, 100, 5000);
  let lastError: unknown = null;

  for (const provider of providers) {
    try {
      const model = modelFor(env, provider, request.tier, request.model);
      const { body } = await providerFetch(provider, env, { ...request, text }, timeoutMs, maxRetries, maxRetryDelayMs);
      const parsed = textFromProvider(provider, body);
      if (!parsed.text) throw new AiGatewayError('invalid_response', 'AI bo\'sh javob qaytardi');
      return { text: parsed.text, provider, model, usage: parsed.usage };
    } catch (error) {
      lastError = error;
      /* Timeout/format xatosi ham boshqa provider bilan sinab ko'riladi;
         barcha urinishlar tugagach faqat umumiy public xabar qaytadi. */
    }
  }

  throw lastError instanceof AiGatewayError
    ? lastError
    : new AiGatewayError('provider_unavailable', 'AI providerlar javob bermadi');
}
