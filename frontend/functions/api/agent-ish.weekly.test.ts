import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), model: vi.fn() }));
vi.mock('../_shared/auth', () => ({ tekshir: mocks.auth }));
vi.mock('../_shared/agent-hisob', async orig => ({ ...await orig<typeof import('../_shared/agent-hisob')>(), aiHisobli: mocks.model }));
import { onRequestPost } from './agent-ish';
const key = 'synthetic-weekly-key-1234567890';
const operation = '11111111-1111-4111-8111-111111111111';
const env = { SUPABASE_URL: 'https://synthetic.supabase.co', SUPABASE_KEY: 'synthetic', SESSIYA_KALIT: 'synthetic',
  KUZATUV_KALIT: key, KUZATUV_ACTOR_ID: '21' };
const post = (body: Record<string, unknown> = {}, cronKey?: string) => onRequestPost({ request: new Request('https://test.invalid/api/agent-ish', {
  method: 'POST', headers: cronKey ? { 'X-Kuzatuv-Kalit': cronKey } : {}, body: JSON.stringify({ amal: 'rivojlanish_tahlil', operation_id: operation, ...body }),
}), env } as never);
const setup = (weekly: unknown = { ok: true, yaratildi: true, taklif_id: '9007199254740993' }, groups = false, companies = 5) => {
  const fetcher = vi.fn(async (url: string, _init?: RequestInit) => {
    if (url.endsWith('t2_agent_rivojlanish_yigish_v1')) return Response.json({ ok: true, natija: groups ? [{ sahifa: 'synthetic', tur: 'xato', soni: 1, kompaniya_soni: companies, namunalar: [], signal_idlar: [1] }] : [] });
    if (url.endsWith('t2_jarvis_haftalik_taklif_v1')) return weekly instanceof Response ? weekly : Response.json(weekly);
    if (url.endsWith('t2_agent_muhit_v1')) return Response.json({ ok: true, scope: 'system', qoidalar: [], xotira: [], manbalar: [] });
    throw Error('unexpected RPC');
  }); vi.stubGlobal('fetch', fetcher); return fetcher;
};
beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockResolvedValue({ foydalanuvchi_id: 7 });
  mocks.model.mockResolvedValue({ text: '{"takliflar":[]}', model: 'synthetic' }); });
afterEach(() => vi.unstubAllGlobals());
it('existing cron action produces the deterministic report without calling a model and binds its actor/id', async () => {
  const f = setup(); const response = await post({ p_actor_id: 99 }, key);
  expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ ok: true, takliflar: [], jarvis_hafta: { ok: true, yaratildi: true, taklif_id: '9007199254740993' } });
  expect(mocks.model).not.toHaveBeenCalled();
  expect(JSON.parse(String(f.mock.calls.find(([url]) => url.endsWith('t2_jarvis_haftalik_taklif_v1'))?.[1]?.body)))
    .toEqual({ p_actor_id: 21, p_operation_id: operation });
});
it('preserves an explicit no-eligible result as no report rather than inventing one', async () => {
  setup({ ok: true, yaratildi: false, sabab: 'NO_ELIGIBLE_FAILURES' });
  expect(await (await post()).json()).toMatchObject({ jarvis_hafta: { ok: true, yaratildi: false } });
  expect(mocks.model).not.toHaveBeenCalled();
});
it('keeps missing migration/source failure explicit without breaking the legacy response', async () => {
  setup(new Response('private SQL detail', { status: 404 })); const response = await post();
  expect(response.status).toBe(200); const body = await response.json();
  expect(body).toMatchObject({ jarvis_hafta: { ok: false, code: 'WEEKLY_UNAVAILABLE' } });
  expect(JSON.stringify(body)).not.toContain('private SQL');
});
it('does not continue to the model after the weekly source denies current authority', async () => {
  setup({ ok: false, code: 'GLOBAL_SCOPE_DENIED' }, true);
  expect((await post()).status).toBe(403); expect(mocks.model).not.toHaveBeenCalled();
});
it('the existing global guard blocks the new writer and model', async () => {
  const f = vi.fn(async () => Response.json({ ok: false, code: 'GLOBAL_SCOPE_DENIED' })); vi.stubGlobal('fetch', f);
  expect((await post()).status).toBe(403); expect(f).toHaveBeenCalledTimes(1); expect(mocks.model).not.toHaveBeenCalled();
});
it('legacy global analysis also needs five companies before any model/promotion', async () => {
  setup(undefined, true, 4); const response = await post({ min_kompaniya: 1 });
  expect(response.status).toBe(200); expect(mocks.model).not.toHaveBeenCalled();
  expect(await response.json()).toMatchObject({ takliflar: [] });
});
it.each(['WEEKLY_BUSY', 'OPERATION_REUSE'])('returns the actionable %s status', async code => {
  setup({ ok: false, code }); expect(await (await post()).json()).toMatchObject({ jarvis_hafta: { ok: false, code } });
});
it('keeps the report receipt even if legacy analysis fails after it was created', async () => {
  setup(undefined, true); mocks.model.mockRejectedValue(Error('synthetic provider failure'));
  const response = await post(); expect(response.status).toBeGreaterThanOrEqual(400);
  expect(await response.json()).toMatchObject({ jarvis_hafta: { ok: true, yaratildi: true } });
});
it('rejects company scope, malformed operation id, and invalid cron key before any write', async () => {
  const f = setup();
  expect((await post({ kompaniya_id: 5 })).status).toBe(403);
  expect((await post({ operation_id: 'invalid' })).status).toBe(400);
  expect((await post({}, 'wrong-key')).status).toBe(401);
  expect(f).not.toHaveBeenCalled();
});
