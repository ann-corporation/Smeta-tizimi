import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ tekshir: vi.fn() }));
vi.mock('../_shared/auth', () => ({ tekshir: m.tekshir }));

import { buyruqIssueMatni, izTozala, onRequestGet, onRequestPost } from './agent-ish';

const env = (o: Record<string, unknown> = {}) => ({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_KEY: 'svc', SESSIYA_KALIT: 's', AGENT_ISH_YOQILGAN: '1', GROQ_API_KEY: 'g', ...o });
const post = (body: unknown, e = env()) => onRequestPost({ request: new Request('https://t/api/agent-ish', { method: 'POST', body: JSON.stringify(body) }), env: e } as never);

const rpcJavob = (d: unknown) => new Response(JSON.stringify(d), { status: 200 });

beforeEach(() => { m.tekshir.mockResolvedValue({ foydalanuvchi_id: 7 }); });
afterEach(() => vi.unstubAllGlobals());

describe('agent-ish shlyuzi', () => {
  it('yoqilmagan bo‘lsa 503 (hech narsa chaqirilmaydi)', async () => {
    const f = vi.fn(); vi.stubGlobal('fetch', f);
    const r = await post({ amal: 'savol', savol: 'salom' }, env({ AGENT_ISH_YOQILGAN: undefined }));
    expect(r.status).toBe(503); expect(f).not.toHaveBeenCalled();
  });

  it('sessiyasiz 401', async () => {
    m.tekshir.mockResolvedValue(null);
    expect((await post({ amal: 'savol', savol: 'salom' })).status).toBe(401);
  });

  it('doira bazada rad etilsa model CHAQIRILMAYDI (token sarflanmaydi)', async () => {
    const f = vi.fn(async () => rpcJavob({ ok: false, code: 'COMPANY_ACCESS_DENIED' })); vi.stubGlobal('fetch', f);
    const r = await post({ amal: 'savol', savol: 'salom', kompaniya_id: 5 });
    expect(r.status).toBe(403);
    expect(f).toHaveBeenCalledTimes(1);
    expect(String((f.mock.calls[0] as unknown as [string])[0])).toContain('t2_agent_muhit_v1');
  });

  it('global doira (kompaniya_id yo‘q) null sifatida bazaga ketadi; actor sessiyadan', async () => {
    const f = vi.fn(async () => rpcJavob({ ok: false, code: 'GLOBAL_SCOPE_DENIED' })); vi.stubGlobal('fetch', f);
    const r = await post({ amal: 'savol', savol: 'salom', p_actor_id: 999 });
    expect(r.status).toBe(403);
    const yuk = JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(yuk).toMatchObject({ p_actor_id: 7, p_kompaniya_id: null });
  });

  it('veb_ol: tasdiqlanmagan domenga tashqi so‘rov yuborilmaydi', async () => {
    const f = vi.fn(async (u: string) => (String(u).includes('t2_agent_veb_ruxsat_v1') ? rpcJavob({ ok: false, code: 'MANBA_TASDIQLANMAGAN' }) : new Response('x')));
    vi.stubGlobal('fetch', f);
    const r = await post({ amal: 'veb_ol', url: 'https://norma.uz/a', kompaniya_id: 5 });
    expect(r.status).toBe(400);
    expect(f.mock.calls.every(([u]) => String(u).includes('supabase.co'))).toBe(true);
  });

  it('takliflar GET noto‘g‘ri kompaniya_id ni rad etadi', async () => {
    const r = await onRequestGet({ request: new Request('https://t/api/agent-ish?bolim=muhit&kompaniya_id=abc'), env: env() } as never);
    expect(r.status).toBe(400);
  });

  it('fikr: AI ishlamasa ham fikr saqlanadi (yo‘qolmaydi), ulashish bazada hal bo‘ladi', async () => {
    const f = vi.fn(async (u: string) => {
      if (String(u).includes('t2_agent_muhit_v1')) return rpcJavob({ ok: true, scope: 'company', qoidalar: [], xotira: [], manbalar: [] });
      if (String(u).includes('t2_agent_fikr_yoz_v1')) return rpcJavob({ ok: true, id: 11, ulashildi: false });
      return new Response('{}', { status: 500 });
    });
    vi.stubGlobal('fetch', f);
    const r = await post({ amal: 'fikr', kompaniya_id: 5, tur: 'muammo', matn: 'F2 sekin', sahifa: '/admin/f2' }, env({ GROQ_API_KEY: undefined }));
    expect(r.status).toBe(200);
    const j = await r.json() as { ok: boolean; fikr_id: number; javob: unknown };
    expect(j).toMatchObject({ ok: true, fikr_id: 11, javob: null });
    const yozuv = f.mock.calls.find(([u]) => String(u).includes('t2_agent_fikr_yoz_v1')) as unknown as [string, RequestInit];
    expect(JSON.parse(String(yozuv[1].body))).toMatchObject({ p_actor_id: 7, p_kompaniya_id: 5, p_tur: 'muammo' });
  });

  it('fikr kompaniyasiz (global) yozilmaydi; tizim amallari kompaniya doirasida rad', async () => {
    vi.stubGlobal('fetch', vi.fn());
    expect((await post({ amal: 'fikr', matn: 'x' })).status).toBe(400);
    expect((await post({ amal: 'rivojlanish_tahlil', kompaniya_id: 5 })).status).toBe(403);
    expect((await post({ amal: 'buyruq_yubor', kompaniya_id: 5, buyruq_id: 1 })).status).toBe(403);
    expect((await post({ amal: 'buyruq_holat', kompaniya_id: 5, buyruq_id: 1, holat: 'bekor' })).status).toBe(403);
  });

  it('buyruq_yubor: GitHub sozlanmagan bo‘lsa 503, hech narsa yuborilmaydi', async () => {
    const f = vi.fn(); vi.stubGlobal('fetch', f);
    const r = await post({ amal: 'buyruq_yubor', buyruq_id: 1 });
    expect(r.status).toBe(503); expect(f).not.toHaveBeenCalled();
  });

  it('issue matni: maqsad/mezon/qoidalar bor, spec dagi ortiqcha maydon kirmaydi', () => {
    const t = buyruqIssueMatni({ id: 9, sarlavha: 'Qidiruv', xavf: 'past', avto_birlashtirish: true,
      spec: { maqsad: 'Tez qidiruv', tavsif: 'Sinonimlar', qabul_mezonlari: ['test yashil'], yashirin: 'SIR-QIYMAT' } });
    expect(t.title).toContain('#9'); expect(t.body).toContain('test yashil'); expect(t.body).toContain('Pull Request'); expect(t.body).toContain('CI yashil');
    expect(t.body).not.toContain('SIR-QIYMAT');
  });

  it('izTozala: tur oq ro‘yxatdan, uzun raqam maskalanadi, ortiqcha belgi va 40 dan ko‘p hodisa kesiladi', () => {
    const iz = izTozala([{ t: 5, tur: 'sql', nom: 'Obyekt 123456 <script>' }, { t: -3, tur: 'xato', nom: 'saqlash xatosi' }, { t: 1, tur: 'bosish', nom: '   ' }, ...Array.from({ length: 60 }, (_, i) => ({ t: i, tur: 'sahifa', nom: 'sahifa ' + i }))]);
    expect(iz.length).toBeLessThanOrEqual(40);
    const bosh = izTozala([{ t: 5, tur: 'sql', nom: 'Obyekt 123456 <script>' }, { t: -3, tur: 'xato', nom: 'saqlash xatosi' }, { t: 1, tur: 'bosish', nom: '   ' }]);
    expect(bosh).toEqual([{ t: 5, tur: 'bosish', nom: 'Obyekt # script' }, { t: 0, tur: 'xato', nom: 'saqlash xatosi' }]);
  });

  it('qadam_taklif: iz qisqa bo‘lsa model chaqirilmaydi; admin tanlagan model OpenRouter ga uzatiladi; yo‘l faqat /admin/…', async () => {
    const f = vi.fn(async (u: string, init?: RequestInit) => {
      if (String(u).includes('t2_agent_muhit_v1')) return rpcJavob({ ok: true, scope: 'company', qoidalar: [], xotira: [], manbalar: [], model: 'vendor/model-a' });
      if (String(u).includes('openrouter.ai')) {
        expect(JSON.parse(String(init?.body)).model).toBe('vendor/model-a');
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ taklif: 'Xohlasangiz F2 import sahifasiga o‘ting', sabab: 'takror xato', yol: '/admin/f2-import' }) } }], usage: {} }), { status: 200 });
      }
      return new Response('{}', { status: 500 });
    });
    vi.stubGlobal('fetch', f);
    const qisqa = await post({ amal: 'qadam_taklif', kompaniya_id: 5, sahifa: '/admin/f2', iz: [{ t: 5, tur: 'sahifa', nom: 'F2' }] }, env({ OPENROUTER_API_KEY: 'k', GROQ_API_KEY: undefined }));
    expect(await qisqa.json()).toMatchObject({ ok: true, taklif: null });
    expect(f).not.toHaveBeenCalled();
    const r = await post({ amal: 'qadam_taklif', kompaniya_id: 5, sahifa: '/admin/f2', iz: [{ t: 30, tur: 'sahifa', nom: 'F2' }, { t: 20, tur: 'xato', nom: 'saqlash' }, { t: 5, tur: 'xato', nom: 'saqlash' }] }, env({ OPENROUTER_API_KEY: 'k', GROQ_API_KEY: undefined }));
    expect(await r.json()).toMatchObject({ ok: true, taklif: 'Xohlasangiz F2 import sahifasiga o‘ting', yol: '/admin/f2-import' });
  });

  it('qadam_taklif: model qaytargan tashqi yo‘l (https://…) tashlab yuboriladi', async () => {
    vi.stubGlobal('fetch', vi.fn(async (u: string) => (String(u).includes('t2_agent_muhit_v1')
      ? rpcJavob({ ok: true, scope: 'company', qoidalar: [], xotira: [], manbalar: [] })
      : new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ taklif: 'Bu yerga o‘ting', sabab: 'x', yol: 'https://evil.example/x' }) } }] }), { status: 200 }))));
    const r = await post({ amal: 'qadam_taklif', kompaniya_id: 5, iz: [{ t: 3, tur: 'sahifa', nom: 'a' }, { t: 2, tur: 'xato', nom: 'b' }, { t: 1, tur: 'xato', nom: 'c' }] });
    expect(await r.json()).toMatchObject({ ok: true, taklif: 'Bu yerga o‘ting', yol: null });
  });

  it('model_katalog_yoz kompaniya doirasida rad; model_tanla profil talab qiladi', async () => {
    vi.stubGlobal('fetch', vi.fn());
    expect((await post({ amal: 'model_katalog_yoz', kompaniya_id: 5, model_id: 'a/b', nom: 'X' })).status).toBe(403);
    expect((await post({ amal: 'model_tanla', kompaniya_id: 5, profil: 'BAD PROFIL', model_id: 'a/b' })).status).toBe(400);
  });

  it('noma‘lum amal rad', async () => {
    vi.stubGlobal('fetch', vi.fn());
    expect((await post({ amal: 'sql_yoz' })).status).toBe(400);
  });
});
