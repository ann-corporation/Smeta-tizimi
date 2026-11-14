import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KONTEKST_TTL_MS, kontekstAktorTozala, kontekstKeshTozala, kontekstOl, kontekstStat, keshliRpc } from './agent-kontekst-kesh';

const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_KEY: 'svc' };
const javob = (d: unknown) => new Response(JSON.stringify(d), { status: 200 });
const chaqirilgan = (f: ReturnType<typeof vi.fn>, nom: string) => f.mock.calls.filter((c) => String(c[0]).includes(nom)).length;

beforeEach(() => kontekstKeshTozala());
afterEach(() => vi.unstubAllGlobals());

describe('Jarvis kontekst keshi (tezlik): har xabarda qayta so‘rov yo‘q', () => {
  it('ikkinchi xabarda lavozim/kim/sozlama bazaga bormaydi (RPC soni 4 -> 1 ta uslub)', async () => {
    const f = vi.fn(async () => javob({ ok: true, rol: 'pto' })); vi.stubGlobal('fetch', f);
    await kontekstOl(env, 7, 11);
    const birinchi = f.mock.calls.length;
    await kontekstOl(env, 7, 11);
    await kontekstOl(env, 7, 11);
    expect(birinchi).toBe(4);
    /* 2-3 xabar: faqat keshlanmaydigan uslub (o'qi-o'zgartir-yoz) — jami 4 + 1 + 1 */
    expect(f.mock.calls.length).toBe(6);
    expect(chaqirilgan(f, 't2_agent_kasb_v1')).toBe(1);
    expect(chaqirilgan(f, 't2_men_v1')).toBe(1);
    expect(chaqirilgan(f, 't2_agent_shaxsiy_v1')).toBe(1);
    expect(chaqirilgan(f, 't2_agent_uslub_v1')).toBe(3);
  });

  it('bir vaqtdagi bir xil so‘rovlar bitta RPC ga birlashadi (in-flight)', async () => {
    const f = vi.fn(async () => { await new Promise((r) => setTimeout(r, 5)); return javob({ ok: true }); }); vi.stubGlobal('fetch', f);
    await Promise.all([keshliRpc(env, 7, 11, 't2_agent_kasb_v1', {}), keshliRpc(env, 7, 11, 't2_agent_kasb_v1', {}), keshliRpc(env, 7, 11, 't2_agent_kasb_v1', {})]);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('xato (ok:false) keshlanmaydi: keyingi so‘rov qayta urinadi', async () => {
    const f = vi.fn(async () => javob({ ok: false, code: 'COMPANY_ACCESS_DENIED' })); vi.stubGlobal('fetch', f);
    await keshliRpc(env, 7, 11, 't2_agent_kasb_v1', {});
    await keshliRpc(env, 7, 11, 't2_agent_kasb_v1', {});
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('kalit aktor+kompaniya: boshqa foydalanuvchi/kompaniyaga hech qachon tushmaydi', async () => {
    const f = vi.fn(async (_u: unknown, init?: RequestInit) => javob({ ok: true, aktor: JSON.parse(String(init?.body)).p_actor_id })); vi.stubGlobal('fetch', f);
    const a = await keshliRpc(env, 7, 11, 't2_agent_kasb_v1', { p_actor_id: 7 });
    const b = await keshliRpc(env, 8, 11, 't2_agent_kasb_v1', { p_actor_id: 8 });
    const c = await keshliRpc(env, 7, 12, 't2_agent_kasb_v1', { p_actor_id: 7 });
    expect([a.data.aktor, b.data.aktor, c.data.aktor]).toEqual([7, 8, 7]);
    expect(f).toHaveBeenCalledTimes(3);
  });

  it('TTL o‘tgach yangilanadi; sozlama o‘zgarsa aktor keshi darhol tozalanadi', async () => {
    const f = vi.fn(async () => javob({ ok: true })); vi.stubGlobal('fetch', f);
    const t0 = Date.now();
    await keshliRpc(env, 7, 11, 't2_agent_kasb_v1', {}, KONTEKST_TTL_MS, t0);
    await keshliRpc(env, 7, 11, 't2_agent_kasb_v1', {}, KONTEKST_TTL_MS, t0 + 1000);
    expect(f).toHaveBeenCalledTimes(1);
    await keshliRpc(env, 7, 11, 't2_agent_kasb_v1', {}, KONTEKST_TTL_MS, t0 + KONTEKST_TTL_MS + Date.now() - t0 + 5);
    expect(f).toHaveBeenCalledTimes(2);
    kontekstAktorTozala(7);
    await keshliRpc(env, 7, 11, 't2_agent_kasb_v1', {});
    expect(f).toHaveBeenCalledTimes(3);
    expect(kontekstStat.kesh).toBeGreaterThanOrEqual(1);
  });
});
