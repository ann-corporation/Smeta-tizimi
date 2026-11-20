import { afterEach, expect, it, vi } from 'vitest';
import { jarvisReadTools } from './read-tools';
import { jarvisSignalBatch } from './learning';
import { kasbQuvur } from './chat';
vi.mock('../jarvis-xotira', () => ({ xotiraOqi: async () => ({ tizim: [], kompaniya: [], foydalanuvchi: [] }) }));
vi.mock('../agent-kontekst-kesh', () => ({ kontekstOl: async () => ({
  kasb: { ok: true, data: { nom: 'Synthetic assistant', rol: 'pto', profil: 'pto', kategoriyalar: [], namuna_savollar: [], boshqalar: [] } },
  shaxsiy: { ok: true, data: {} }, uslub: { ok: true, data: {} },
  men: { ok: true, data: { context_kompaniyalar: [{ kompaniya_id: 17, permissions: ['smeta.read'] }] } },
}) }));
const env = { SUPABASE_URL: 'https://synthetic.supabase.co', SUPABASE_KEY: 'synthetic' };
const scope = { actor: 7, company: 17, question: 'Obyektni top Synthetic', history: [], objectId: null };
const authority = { ok: true, status: 200, data: { context_kompaniyalar: [{ kompaniya_id: 17, permissions: ['smeta.read'] }] } };
afterEach(() => vi.unstubAllGlobals());
it.each(['found', 'empty', 'failed', 'denied'] as const)('real read dispatcher forwards %s to compact counters without source text', async state => {
  const calls: Array<{ name: string; body: Record<string, unknown> }> = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    const name = url.split('/').at(-1)!; calls.push({ name, body: JSON.parse(String(init.body)) });
    if (name === 't2_agent_fakt_v1') {
      if (state === 'failed') throw Error('synthetic source error');
      return Response.json({ ok: true, fakt: { obyektlar: state === 'empty' ? [] : [{ id: 5, nom: 'Synthetic private object' }] } });
    }
    return Response.json({ ok: true, qabul: 1 });
  }));
  const signals = jarvisSignalBatch(env, 7, 17);
  const reads = jarvisReadTools(env, scope, state === 'denied' ? null : authority, [], signals.record);
  const answer = await reads.run({ name: 'object_search', args: 'Obyektni top Synthetic private object' });
  expect(calls.some(c => c.name === 't2_osuvchi_yoz_v1')).toBe(false);
  await signals.flush();
  const event = calls.find(c => c.name === 't2_osuvchi_yoz_v1')!.body;
  expect(event).toMatchObject({ p_actor_id: 7, p_kompaniya_id: 17, p_amal: 'friksiya_yubor', p_yuk: { qatorlar: [{
    s: 'jarvis', a: 'read.object_search', n: 1, o: 0,
    k: state === 'found' ? 't0' : state === 'empty' ? 'NO_ANSWER' : state === 'denied' ? 'FORBIDDEN' : 'SOURCE_UNAVAILABLE',
  }] } });
  expect(JSON.stringify(event)).not.toMatch(/Synthetic|private|savol|jurnal|obyekt_id/);
  if (state === 'found') expect(answer?.javob).toContain('Synthetic private object');
  if (state === 'denied') { expect(answer?.rad).toBe(true); expect(calls.some(c => c.name === 't2_agent_fakt_v1')).toBe(false); }
});
it('the shared core defers one batch after the answer, without blocking on counter storage', async () => {
  const jobs: Promise<unknown>[] = []; let finish!: (response: Response) => void; let settled = false;
  const counter = new Promise<Response>(resolve => { finish = resolve; });
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('t2_osuvchi_yoz_v1') ? counter :
    Response.json(url.endsWith('t2_agent_fakt_v1') ? { ok: true, fakt: { obyektlar: [] } } : { ok: true })));
  try {
    const result = await kasbQuvur(env, 7, 17, { savol: 'Obyektni top Synthetic' }, () => undefined, 'read-only', undefined,
      job => { jobs.push(job); void job.then(() => { settled = true; }); });
    expect(result.body).toMatchObject({ ok: true, model: 'local' });
    expect(jobs).toHaveLength(1); expect(settled).toBe(false);
  } finally { finish(Response.json({ ok: true, qabul: 1 })); await Promise.all(jobs); }
});
