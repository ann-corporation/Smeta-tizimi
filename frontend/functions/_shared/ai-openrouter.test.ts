import { afterEach, describe, expect, it, vi } from 'vitest';
import { aiCall } from './ai';

const javob = (extra: Record<string, unknown> = {}) => new Response(JSON.stringify({
  choices: [{ message: { content: 'salom' } }], usage: { prompt_tokens: 11, completion_tokens: 4, total_tokens: 15 }, ...extra,
}), { status: 200, headers: { 'Content-Type': 'application/json' } });

afterEach(() => vi.unstubAllGlobals());

describe('AI shlyuzi — OpenRouter', () => {
  it('empty billed Studio length result is metered, not silently retried at another provider', async () => {
    const f=vi.fn(async()=>javob({id:'gen-billed',choices:[{finish_reason:'length',message:{content:''}}],usage:{prompt_tokens:20,completion_tokens:100,cost:0.003}}));vi.stubGlobal('fetch',f);
    const r=await aiCall({OPENROUTER_API_KEY:'fake',GROQ_API_KEY:'fake'},{text:'x',tier:'fast',workload:'primary'});
    expect(f).toHaveBeenCalledTimes(1);expect(r).toMatchObject({text:'',finishReason:'length',generationId:'gen-billed',usage:{cost:0.003}});
  });
  it('thinking effort is separate from answer limit; generation and reasoning usage preserved', async () => {
    const f=vi.fn(async()=>javob({id:'gen-test',choices:[{finish_reason:'length',message:{content:'{}'}}],usage:{prompt_tokens:20,completion_tokens:100,total_tokens:120,cost:0.003,completion_tokens_details:{reasoning_tokens:95}}}));
    vi.stubGlobal('fetch',f);
    const r=await aiCall({OPENROUTER_API_KEY:'fake-test'},{text:'x',tier:'fast',reasoning:{effort:'minimal'},maxOutputTokens:100,workload:'utility'});
    const payload=JSON.parse(String((f.mock.calls[0] as unknown as [string,RequestInit])[1].body));
    expect(payload).toMatchObject({reasoning:{effort:'minimal'},max_tokens:100});expect(payload.workload).toBeUndefined();
    expect(r).toMatchObject({generationId:'gen-test',finishReason:'length',usage:{outputTokens:100,reasoningTokens:95,cost:0.003}});
  });
  it('tier berilganda daraja modeli tanlanadi, kalit faqat Authorization headerda, usage o‘qiladi', async () => {
    const f = vi.fn(async () => javob());
    vi.stubGlobal('fetch', f);
    const r = await aiCall({ OPENROUTER_API_KEY: 'k-test', OPENROUTER_MODEL_CODING: 'vendor/kod-model', GROQ_API_KEY: 'g-test' }, { text: 'savol', tier: 'coding' });
    expect(r.provider).toBe('openrouter');
    expect(r.model).toBe('vendor/kod-model');
    expect(r.usage).toEqual({ inputTokens: 11, outputTokens: 4, totalTokens: 15 });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer k-test');
    expect(String(init.body)).not.toContain('k-test');
    expect(JSON.parse(String(init.body)).model).toBe('vendor/kod-model');
  });

  it('tiersiz so‘rov eski tartibni buzmaydi (groq oldin), OpenRouter faqat zaxira', async () => {
    const f = vi.fn(async () => javob());
    vi.stubGlobal('fetch', f);
    const r = await aiCall({ OPENROUTER_API_KEY: 'k-test', GROQ_API_KEY: 'g-test' }, { text: 'savol' });
    expect(r.provider).toBe('groq');
  });

  it('OpenRouter kaliti bo‘lmasa tier so‘rovi sozlanmagan provayderga ketmaydi', async () => {
    const f = vi.fn(async () => javob());
    vi.stubGlobal('fetch', f);
    const r = await aiCall({ GROQ_API_KEY: 'g-test' }, { text: 'savol', tier: 'fast' });
    expect(r.provider).toBe('groq');
  });
});

describe('AI shlyuzi — umumiy muddat (egasi: «oddiy gapga 5 minut»)', () => {
  it('javob bermaydigan providerlar umumiy muddatdan oshirmaydi va aniq timeout qaytaradi', async () => {
    const f = vi.fn((_u: string, init?: RequestInit) => new Promise<Response>((_res, rej) => {
      init?.signal?.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    }));
    vi.stubGlobal('fetch', f);
    const t0 = Date.now();
    const xato = await aiCall({ OPENROUTER_API_KEY: 'k', GROQ_API_KEY: 'g', AI_TIMEOUT_MS: '3000' }, { text: 'savol', totalTimeoutMs: 5000 })
      .then(() => null, (e: unknown) => e as { code?: string });
    const ms = Date.now() - t0;
    expect(xato?.code).toBe('timeout');
    expect(ms).toBeLessThan(6500);
    expect(f.mock.calls.length).toBeLessThanOrEqual(2);
    expect(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body)).not.toContain('totalTimeoutMs');
  }, 15000);
});
