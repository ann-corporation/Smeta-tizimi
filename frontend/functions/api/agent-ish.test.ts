import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ tekshir: vi.fn() }));
vi.mock('../_shared/auth', () => ({ tekshir: m.tekshir }));

import { buyruqIssueMatni, izTozala, onRequestGet, onRequestPost } from './agent-ish';

const env = (o: Record<string, unknown> = {}) => ({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_KEY: 'svc', SESSIYA_KALIT: 's', AGENT_ISH_YOQILGAN: '1', GROQ_API_KEY: 'g', ...o });
const post = (body: unknown, e = env()) => onRequestPost({ request: new Request('https://t/api/agent-ish', { method: 'POST', body: JSON.stringify(body) }), env: e } as never);

const rpcJavob = (d: unknown) => new Response(JSON.stringify(d), { status: 200 });
/** Limit tekshiruvi va sarf jurnali (default-deny): sinovlarda ochiq limit. */
const sarfRpc = (u: string) => (String(u).includes('t2_agent_sarf_') ? rpcJavob({ ok: true })
  : String(u).includes('t2_agent_kompaniya_sozlama_v1') ? rpcJavob({ ok: true, ai_yoqilgan: true, kuzatuv_ruxsat: true }) : null);

beforeEach(() => { m.tekshir.mockResolvedValue({ foydalanuvchi_id: 7 }); });
afterEach(() => vi.unstubAllGlobals());

describe('agent-ish shlyuzi', () => {
  it('yoqilmagan bo‘lsa 503 (hech narsa chaqirilmaydi)', async () => {
    const f = vi.fn(); vi.stubGlobal('fetch', f);
    const r = await post({ amal: 'savol', savol: 'salom' }, env({ AGENT_ISH_YOQILGAN: '0' }));
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
      const sr = sarfRpc(u); if (sr) return sr;
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
    vi.stubGlobal('fetch', vi.fn(async (u: string) => (sarfRpc(u) ?? String(u).includes('t2_agent_muhit_v1')
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

  it('AI o‘chiq bo‘lsa ham boshqaruv amallari ishlaydi: model tanlash va fikrni SAQLASH (model chaqirilmaydi)', async () => {
    const f = vi.fn(async (u: string) => {
      if (String(u).includes('t2_agent_model_tanla_v1')) return rpcJavob({ ok: true });
      if (String(u).includes('t2_agent_muhit_v1')) return rpcJavob({ ok: true, scope: 'company', qoidalar: [], xotira: [], manbalar: [] });
      if (String(u).includes('t2_agent_fikr_yoz_v1')) return rpcJavob({ ok: true, id: 3, ulashildi: false });
      return new Response('{}', { status: 500 });
    });
    vi.stubGlobal('fetch', f);
    const off = env({ AGENT_ISH_YOQILGAN: '0', OPENROUTER_API_KEY: 'k' });
    expect((await post({ amal: 'model_tanla', kompaniya_id: 5, profil: 'document_control', model_id: 'vendor/a' }, off)).status).toBe(200);
    const r = await post({ amal: 'fikr', kompaniya_id: 5, tur: 'fikr', matn: 'Yaxshi bo‘lardi' }, off);
    expect(await r.json()).toMatchObject({ ok: true, fikr_id: 3, javob: null });
    expect(f.mock.calls.some(([u]) => String(u).includes('openrouter.ai'))).toBe(false);
    expect((await post({ amal: 'qadam_taklif', kompaniya_id: 5, iz: [] }, off)).status).toBe(503);
  });

  it('LIMIT YO‘Q = AI YO‘Q: byudjet bo‘lmasa model chaqirilmaydi (402), tushunarli xabar', async () => {
    const f = vi.fn(async (u: string) => {
      if (String(u).includes('t2_agent_sarf_tekshir_v1')) return rpcJavob({ ok: false, code: 'BYUDJET_YOQ' });
      if (String(u).includes('t2_agent_muhit_v1')) return rpcJavob({ ok: true, scope: 'company', qoidalar: [], xotira: [], manbalar: [] });
      return new Response('{}', { status: 500 });
    });
    vi.stubGlobal('fetch', f);
    const r = await post({ amal: 'savol', kompaniya_id: 5, savol: 'salom' }, env({ OPENROUTER_API_KEY: 'k' }));
    expect(r.status).toBe(402);
    expect(await r.json()).toMatchObject({ ok: false, code: 'BYUDJET_YOQ', error: expect.stringContaining('limit') });
    expect(f.mock.calls.some(([u]) => String(u).includes('openrouter.ai'))).toBe(false);
  });

  it('chaqiruvdan keyin HAQIQIY sarf (provayder narxi) jurnalga yoziladi', async () => {
    const f = vi.fn(async (u: string) => {
      if (String(u).includes('t2_agent_sarf_')) return rpcJavob({ ok: true });
      if (String(u).includes('t2_agent_muhit_v1')) return rpcJavob({ ok: true, scope: 'company', qoidalar: [], xotira: [], manbalar: [], model: 'vendor/model-a' });
      if (String(u).includes('openrouter.ai')) return new Response(JSON.stringify({ choices: [{ message: { content: 'Javob' } }], usage: { prompt_tokens: 120, completion_tokens: 30, total_tokens: 150, cost: 0.0042 } }), { status: 200 });
      return new Response('{}', { status: 500 });
    });
    vi.stubGlobal('fetch', f);
    const r = await post({ amal: 'savol', kompaniya_id: 5, profil: 'document_control', savol: 'salom' }, env({ OPENROUTER_API_KEY: 'k', GROQ_API_KEY: undefined }));
    expect(r.status).toBe(200);
    const yoz = f.mock.calls.find(([u]) => String(u).includes('t2_agent_sarf_yoz_v1')) as unknown as [string, RequestInit];
    expect(JSON.parse(String(yoz[1].body))).toMatchObject({ p_actor_id: 7, p_kompaniya_id: 5, p_profil: 'document_control', p_amal: 'savol', p_model: 'vendor/model-a', p_kirish: 120, p_chiqish: 30, p_narx_usd: 0.0042, p_muvaffaqiyat: true });
    const tekshir = f.mock.calls.findIndex(([u]) => String(u).includes('t2_agent_sarf_tekshir_v1'));
    const model = f.mock.calls.findIndex(([u]) => String(u).includes('openrouter.ai'));
    expect(tekshir).toBeGreaterThanOrEqual(0); expect(tekshir).toBeLessThan(model);
  });

  it('AI markazi va limit belgilash faqat tizim doirasida; sozlama holati kalitsiz (faqat true/false)', async () => {
    const f = vi.fn(async (u: string) => (String(u).includes('t2_agent_markaz_v1') ? rpcJavob({ ok: true, oy_sarfi_usd: 1.5, limit_usd: 50 }) : new Response('{}', { status: 500 })));
    vi.stubGlobal('fetch', f);
    const g = await onRequestGet({ request: new Request('https://t/api/agent-ish?bolim=markaz'), env: env({ OPENROUTER_API_KEY: 'sir-kalit' }) } as never);
    const j = await g.json() as Record<string, unknown>;
    expect(j).toMatchObject({ ok: true, oy_sarfi_usd: 1.5, sozlama: { ai_yoqilgan: true, openrouter: true, github: false } });
    expect(JSON.stringify(j)).not.toContain('sir-kalit');
    expect((await onRequestGet({ request: new Request('https://t/api/agent-ish?bolim=markaz&kompaniya_id=5'), env: env() } as never)).status).toBe(403);
    expect((await post({ amal: 'byudjet_belgila', kompaniya_id: 5, limit_usd: 'abc' })).status).toBe(400);
  });

  it('kompaniya sozlamasi: saqlash, kuzatuv ruxsati yo‘q bo‘lsa qadam_taklif model chaqirmaydi; ustama faqat tizim RPC iga', async () => {
    const f = vi.fn(async (u: string) => {
      if (String(u).includes('t2_agent_kompaniya_sozlama_saqla_v1')) return rpcJavob({ ok: true });
      if (String(u).includes('t2_agent_kompaniya_sozlama_v1')) return rpcJavob({ ok: true, kuzatuv_ruxsat: false, ai_yoqilgan: true });
      if (String(u).includes('t2_agent_ustama_belgila_v1')) return rpcJavob({ ok: false, code: 'GLOBAL_SCOPE_DENIED' });
      return new Response('{}', { status: 500 });
    });
    vi.stubGlobal('fetch', f);
    const s = await post({ amal: 'kompaniya_sozlama_saqla', kompaniya_id: 5, ai_yoqilgan: false, token_limit: 1000, kuzatuv_ruxsat: false });
    expect(s.status).toBe(200);
    const yuk = JSON.parse(String((f.mock.calls.find(([u]) => String(u).includes('sozlama_saqla')) as unknown as [string, RequestInit])[1].body));
    expect(yuk).toMatchObject({ p_actor_id: 7, p_kompaniya_id: 5, p_ai_yoqilgan: false, p_token_limit: 1000, p_kuzatuv_ruxsat: false });
    expect((await post({ amal: 'kompaniya_sozlama_saqla', kompaniya_id: 5, token_limit: 'abc' })).status).toBe(400);
    const q = await post({ amal: 'qadam_taklif', kompaniya_id: 5, iz: [{ t: 3, tur: 'sahifa', nom: 'a' }, { t: 2, tur: 'xato', nom: 'b' }, { t: 1, tur: 'xato', nom: 'c' }] });
    expect(await q.json()).toMatchObject({ ok: true, taklif: null, kuzatuv: 'ochirilgan' });
    expect(f.mock.calls.some(([u]) => String(u).includes('openrouter.ai') || String(u).includes('t2_agent_sarf_'))).toBe(false);
    expect((await post({ amal: 'ustama_belgila', kompaniya_id: 5, foiz: 25 })).status).toBe(403);
    expect((await post({ amal: 'ustama_belgila', foiz: 'x' })).status).toBe(400);
  });

  it('token yetmasa/AI o‘chirilgan bo‘lsa model chaqirilmaydi va tushunarli xabar (402)', async () => {
    for (const [kod, bo] of [['TOKEN_YETMAYDI', 'Tokenlar'], ['KOMPANIYA_AI_OCHIQ', 'o‘chirgan'], ['TOKEN_LIMIT_TUGADI', 'token limiti']] as const) {
      const f = vi.fn(async (u: string) => {
        if (String(u).includes('t2_agent_sarf_tekshir_v1')) return rpcJavob({ ok: false, code: kod });
        if (String(u).includes('t2_agent_muhit_v1')) return rpcJavob({ ok: true, scope: 'company', qoidalar: [], xotira: [], manbalar: [] });
        return new Response('{}', { status: 500 });
      });
      vi.stubGlobal('fetch', f);
      const r = await post({ amal: 'savol', kompaniya_id: 5, savol: 'salom' }, env({ OPENROUTER_API_KEY: 'k' }));
      expect(r.status).toBe(402);
      expect(((await r.json()) as { error: string }).error).toContain(bo);
      expect(f.mock.calls.some(([u]) => String(u).includes('openrouter.ai'))).toBe(false);
    }
  });

  it('standart holatda AI YOQIQ (bayroq shart emas) — xarajatni limit/hamyon cheklaydi', async () => {
    const f = vi.fn(async (u: string) => (String(u).includes('t2_agent_sarf_tekshir_v1') ? rpcJavob({ ok: false, code: 'BYUDJET_YOQ' }) : String(u).includes('t2_agent_muhit_v1') ? rpcJavob({ ok: true, scope: 'company', qoidalar: [], xotira: [], manbalar: [] }) : new Response('{}', { status: 500 })));
    vi.stubGlobal('fetch', f);
    const r = await post({ amal: 'savol', kompaniya_id: 5, savol: 'salom' }, env({ AGENT_ISH_YOQILGAN: undefined, OPENROUTER_API_KEY: 'k' }));
    expect(r.status).toBe(402);
  });

  describe('kasb_savol — lavozimga ajratilgan AI ishchi', () => {
    const kasb = (rol: string, kat: string[], nom = 'Prorab yordamchisi') => ({ ok: true, rol, profil: 'prorab', nom, vazifa: 'Ish borishi va ombor.', kategoriyalar: kat, namuna_savollar: ['Omborda nima bor?'], taqiq_izoh: 'Pul sizning doirangizda emas.',
      boshalar: [], boshqalar: [{ rol: 'bugalter', nom: 'Bugalter yordamchisi', vazifa: 'To‘lov' }, { rol: 'boss', nom: 'Direktor yordamchisi', vazifa: 'Umumiy' }] });
    const mock = (kat: string[], modelJavobi = 'Omborda 10 t sement bor.') => vi.fn(async (u: string, init?: RequestInit) => {
      const url = String(u);
      if (url.includes('t2_agent_kasb_v1')) return rpcJavob(kasb('prorab', kat));
      if (url.includes('t2_agent_fakt_v1')) { const y = JSON.parse(String(init?.body)); return rpcJavob({ ok: true, ishlatilgan: y.p_kategoriyalar, taqiqlangan: [], fakt: { ombor_qoldiq: [{ nomi: 'Sement', qoldiq: 10 }] } }); }
      if (url.includes('t2_agent_muhit_v1')) return rpcJavob({ ok: true, scope: 'company', qoidalar: [], xotira: [], manbalar: [], model: 'google/gemini-2.5-flash-lite' });
      if (url.includes('t2_agent_sarf_')) return rpcJavob({ ok: true });
      if (url.includes('openrouter.ai')) return new Response(JSON.stringify({ choices: [{ message: { content: modelJavobi } }], usage: { prompt_tokens: 900, completion_tokens: 60, cost: 0.0004 } }), { status: 200 });
      return new Response('{}', { status: 500 });
    });
    const PROR = ['obyektlar', 'hajm', 'grafik', 'ombor', 'sifat', 'texnika'];

    it('ruxsatsiz mavzu (pul): model CHAQIRILMAYDI, token sarflanmaydi, kim ko‘ra olishi aytiladi', async () => {
      const f = mock(PROR); vi.stubGlobal('fetch', f);
      const r = await post({ amal: 'kasb_savol', kompaniya_id: 5, savol: 'Shu oy qancha to‘lov bo‘ldi?' }, env({ OPENROUTER_API_KEY: 'k', GROQ_API_KEY: undefined }));
      const j = await r.json() as { ok: boolean; rad: boolean; javob: string; kasb: { nom: string } };
      expect(j).toMatchObject({ ok: true, rad: true }); expect(j.javob).toContain('doirasida emas'); expect(j.kasb.nom).toBe('Prorab yordamchisi');
      expect(f.mock.calls.some(([u]) => /openrouter\.ai|t2_agent_fakt_v1|t2_agent_sarf_/.test(String(u)))).toBe(false);
    });

    it('ruxsatli savol: faqat kerakli toifa bazadan so‘raladi (ruxsatsiz toifa so‘ralmaydi), model admin tanlagan modelda, sarf yoziladi', async () => {
      const f = mock(PROR); vi.stubGlobal('fetch', f);
      const r = await post({ amal: 'kasb_savol', kompaniya_id: 5, savol: 'Omborda sement qancha qolgan?', sahifa: '/admin/moliya' }, env({ OPENROUTER_API_KEY: 'k', GROQ_API_KEY: undefined }));
      const j = await r.json() as { javob: string; model: string; toifalar: string[] };
      expect(j.javob).toContain('10 t sement'); expect(j.model).toBe('google/gemini-2.5-flash-lite');
      const fakt = JSON.parse(String((f.mock.calls.find(([u]) => String(u).includes('t2_agent_fakt_v1')) as unknown as [string, RequestInit])[1].body));
      expect(fakt.p_kategoriyalar).toEqual(['obyektlar', 'ombor']);       // sahifa=/moliya ishorasi ham ruxsat doirasidan chiqolmadi
      const model = JSON.parse(String((f.mock.calls.find(([u]) => String(u).includes('openrouter.ai')) as unknown as [string, RequestInit])[1].body));
      expect(model.model).toBe('google/gemini-2.5-flash-lite');
      expect(JSON.stringify(model.messages)).toContain('Sement');
      expect(f.mock.calls.some(([u]) => String(u).includes('t2_agent_sarf_yoz_v1'))).toBe(true);
    });

    it('salomlashuv — mahalliy (model chaqirilmaydi), ishchi nomi va namunalar bilan', async () => {
      const f = mock(PROR); vi.stubGlobal('fetch', f);
      const r = await post({ amal: 'kasb_savol', kompaniya_id: 5, savol: 'Salom' }, env({ OPENROUTER_API_KEY: 'k' }));
      const j = await r.json() as { javob: string; model: string };
      expect(j.model).toBe('local'); expect(j.javob).toContain('Prorab yordamchisi'); expect(j.javob).toContain('Omborda nima bor?');
      expect(f.mock.calls.some(([u]) => String(u).includes('openrouter.ai'))).toBe(false);
    });

    const toliq = (modelMatni: string, o: { til?: string; ishonch?: string } = {}) => vi.fn(async (u: string, init?: RequestInit) => {
      const url = String(u);
      if (url.includes('t2_agent_kasb_v1')) return rpcJavob({ ...kasb('prorab', PROR), harakatlar: ['ombor_kirim', 'ombor_chiqim', 'eslatma'] });
      if (url.includes('t2_agent_shaxsiy_v1')) return rpcJavob({ ok: true, til: o.til ?? 'auto', uslub: 'qisqa', ishonch: o.ishonch ?? 'jiddiy' });
      if (url.includes('t2_agent_fakt_v1')) { const y = JSON.parse(String(init?.body)); return rpcJavob({ ok: true, ishlatilgan: y.p_kategoriyalar, taqiqlangan: ['moliya'], fakt: { obyektlar: [{ id: 7, nom: 'Obyekt 7' }], ombor_qoldiq: [{ nomi: 'Sement M400', qoldiq: 10 }] } }); }
      if (url.includes('t2_agent_muhit_v1')) return rpcJavob({ ok: true, scope: 'company', qoidalar: [{ doira: 'yadro', kod: 'a', matn: 'm' }], xotira: [], manbalar: [], model: 'google/gemini-2.5-flash-lite' });
      if (url.includes('t2_agent_jurnal_yoz_v1')) return rpcJavob({ ok: true, id: 55 });
      if (url.includes('t2_agent_harakat_taklif_v1')) { const y = JSON.parse(String(init?.body)); return rpcJavob({ ok: true, id: 9, amal: y.p_amal, xavf: 'orta', avto: false, parametrlar: y.p_param, tushuntirish: y.p_tushuntirish }); }
      if (url.includes('t2_agent_sarf_')) return rpcJavob({ ok: true });
      if (url.includes('openrouter.ai')) return new Response(JSON.stringify({ choices: [{ message: { content: modelMatni } }], usage: { prompt_tokens: 800, completion_tokens: 50, cost: 0.0003 } }), { status: 200 });
      return new Response('{}', { status: 500 });
    });

    it('har qadam javobda ko‘rinadi (lavozim → mavzu → ma’lumot → qoidalar → model → tayyor) va jurnalga yoziladi', async () => {
      const f = toliq('{"javob":"Omborda **10 t** sement bor.","harakatlar":[]}'); vi.stubGlobal('fetch', f);
      const r = await post({ amal: 'kasb_savol', kompaniya_id: 5, savol: 'Omborda sement qancha?' }, env({ OPENROUTER_API_KEY: 'k', GROQ_API_KEY: undefined }));
      const j = await r.json() as { javob: string; qadamlar: Array<{ belgi: string; matn: string }>; jurnal_id: number };
      expect(j.javob).toContain('10 t'); expect(j.jurnal_id).toBe(55);
      const matnlar = j.qadamlar.map((q) => q.matn).join(' | ');
      expect(matnlar).toMatch(/Lavozim: prorab/); expect(matnlar).toMatch(/Savol tahlil qilindi/); expect(matnlar).toMatch(/Olindi:.*yopiq: to‘lov/); expect(matnlar).toMatch(/Qoidalar yuklandi: 1 ta/); expect(matnlar).toMatch(/Model: google\/gemini-2\.5-flash-lite/); expect(matnlar).toMatch(/Tayyor:/);
      const jurnal = JSON.parse(String((f.mock.calls.find(([u]) => String(u).includes('t2_agent_jurnal_yoz_v1')) as unknown as [string, RequestInit])[1].body));
      expect(jurnal).toMatchObject({ p_actor_id: 7, p_kompaniya_id: 5, p_tur: 'savol', p_model: 'google/gemini-2.5-flash-lite', p_kirish: 800, p_chiqish: 50 });
      expect(jurnal.p_qadamlar.length).toBeGreaterThan(5);
    });

    it('harakat taklifi: model so‘ragan harakat bazada tekshiriladi va javobga qo‘shiladi (hech narsa bajarilmaydi)', async () => {
      const f = toliq('{"javob":"Kirim tayyor, tasdiqlang.","harakatlar":[{"amal":"ombor_kirim","parametrlar":{"obyekt_id":7,"nomi":"Sement M400","birligi":"tonna","obyomi":5},"tushuntirish":"5 t sement kirimi","aniq":true}]}'); vi.stubGlobal('fetch', f);
      const r = await post({ amal: 'kasb_savol', kompaniya_id: 5, savol: 'Omborga 5 tonna Sement M400 kirim qil' }, env({ OPENROUTER_API_KEY: 'k', GROQ_API_KEY: undefined }));
      const j = await r.json() as { harakatlar: Array<{ id: number; xavf: string; avto: boolean }>; qadamlar: Array<{ matn: string }> };
      expect(j.harakatlar).toHaveLength(1); expect(j.harakatlar[0]).toMatchObject({ id: 9, xavf: 'orta', avto: false });
      const taklif = JSON.parse(String((f.mock.calls.find(([u]) => String(u).includes('t2_agent_harakat_taklif_v1')) as unknown as [string, RequestInit])[1].body));
      expect(taklif).toMatchObject({ p_actor_id: 7, p_kompaniya_id: 5, p_jurnal: 55, p_amal: 'ombor_kirim', p_aniq: true });
      expect(j.qadamlar.map((q) => q.matn).join(' ')).toMatch(/tasdig‘ingiz kutilmoqda/);
      // gateway hech qanday biznes yozuvini (sklad/grafik) o'zi bajarmaydi
      expect(f.mock.calls.some(([u]) => /skladga|grafik_yangilash|t2_sklad_harakat/.test(String(u)))).toBe(false);
    });

    it('shaxsiy sozlama (til/uslub) promptga ta’sir qiladi', async () => {
      const f = toliq('{"javob":"Xo‘sh","harakatlar":[]}', { til: 'ru' }); vi.stubGlobal('fetch', f);
      await post({ amal: 'kasb_savol', kompaniya_id: 5, savol: 'Omborda sement qancha?' }, env({ OPENROUTER_API_KEY: 'k', GROQ_API_KEY: undefined }));
      const model = JSON.parse(String((f.mock.calls.find(([u]) => String(u).includes('openrouter.ai')) as unknown as [string, RequestInit])[1].body));
      expect(JSON.stringify(model.messages)).toContain('rus tilida');
      expect(JSON.stringify(model.messages)).toContain('ombor_kirim');
      expect(JSON.stringify(model.messages)).not.toContain('grafik_foiz:');   // rolga ruxsat etilmagan harakat promptga kirmaydi
    });

    it('OQIM (NDJSON): qadamlar sodir bo‘lishi bilan keladi, oxirida yakun', async () => {
      const f = toliq('{"javob":"Tayyor","harakatlar":[]}'); vi.stubGlobal('fetch', f);
      const r = await post({ amal: 'kasb_savol', kompaniya_id: 5, savol: 'Omborda sement qancha?', oqim: true }, env({ OPENROUTER_API_KEY: 'k', GROQ_API_KEY: undefined }));
      expect(r.headers.get('content-type')).toContain('x-ndjson');
      const satrlar = (await r.text()).trim().split('\n').map((x) => JSON.parse(x) as { t: string; matn?: string; javob?: string; ok?: boolean });
      const qadamlar = satrlar.filter((x) => x.t === 'qadam');
      expect(qadamlar.length).toBeGreaterThan(5); expect(qadamlar[0].matn).toContain('Lavozimingiz');
      const yakun = satrlar[satrlar.length - 1];
      expect(yakun).toMatchObject({ t: 'yakun', ok: true, javob: 'Tayyor' });
    });

    it('OQIM: limit yo‘q bo‘lsa yakun xatosi tushunarli (model chaqirilmaydi)', async () => {
      const f = vi.fn(async (u: string) => {
        const url = String(u);
        if (url.includes('t2_agent_kasb_v1')) return rpcJavob(kasb('prorab', PROR));
        if (url.includes('t2_agent_fakt_v1')) return rpcJavob({ ok: true, ishlatilgan: ['obyektlar'], taqiqlangan: [], fakt: {} });
        if (url.includes('t2_agent_muhit_v1')) return rpcJavob({ ok: true, scope: 'company', qoidalar: [], xotira: [], manbalar: [] });
        if (url.includes('t2_agent_sarf_tekshir_v1')) return rpcJavob({ ok: false, code: 'BYUDJET_YOQ' });
        return new Response('{}', { status: 500 });
      });
      vi.stubGlobal('fetch', f);
      const r = await post({ amal: 'kasb_savol', kompaniya_id: 5, savol: 'Omborda sement qancha?', oqim: true }, env({ OPENROUTER_API_KEY: 'k' }));
      const satrlar = (await r.text()).trim().split('\n').map((x) => JSON.parse(x) as { t: string; code?: string; error?: string; status?: number });
      const yakun = satrlar[satrlar.length - 1];
      expect(yakun).toMatchObject({ t: 'yakun', ok: false, code: 'BYUDJET_YOQ', status: 402 });
      expect(f.mock.calls.some(([u]) => String(u).includes('openrouter.ai'))).toBe(false);
    });

    it('jurnal, shaxsiy sozlama va harakat qarori — faqat sessiyadagi foydalanuvchi nomidan', async () => {
      const f = vi.fn(async (u: string) => rpcJavob({ ok: true, til: 'uz' })); vi.stubGlobal('fetch', f);
      expect((await post({ amal: 'shaxsiy_saqla', til: 'uz', uslub: 'batafsil', ishonch: 'sora' })).status).toBe(200);
      expect((await post({ amal: 'harakat_qaror', harakat_id: 9, qaror: 'tasdiqlash', p_actor_id: 999 })).status).toBe(200);
      expect((await post({ amal: 'harakat_natija', harakat_id: 9, ok: true, natija: { id: 3 } })).status).toBe(200);
      expect((await post({ amal: 'harakat_qaror', qaror: 'tasdiqlash' })).status).toBe(400);
      for (const c of f.mock.calls) expect(JSON.parse(String((c as unknown as [string, RequestInit])[1].body)).p_actor_id).toBe(7);
      const g = await onRequestGet({ request: new Request('https://t/api/agent-ish?bolim=jurnal&kompaniya_id=5&hamma=1'), env: env() } as never);
      expect(g.status).toBe(200);
      expect(JSON.parse(String((f.mock.calls[f.mock.calls.length - 1] as unknown as [string, RequestInit])[1].body))).toMatchObject({ p_actor_id: 7, p_kompaniya_id: 5, p_hamma: true });
    });

    const uslubli = (modelMatni: string, uslub: Record<string, unknown>) => {
      const asos = toliq(modelMatni);
      return vi.fn(async (u: string, init?: RequestInit) => (String(u).includes('t2_agent_uslub_v1') ? rpcJavob({ ok: true, ...uslub })
        : String(u).includes('t2_agent_uslub_yangila_v1') ? rpcJavob({ ok: true, saqlandi: true }) : asos(u, init)));
    };
    const modelSoroviga = (f: ReturnType<typeof vi.fn>) => JSON.stringify(JSON.parse(String((f.mock.calls.find(([u]) => String(u).includes('openrouter.ai')) as unknown as [string, RequestInit])[1].body)).messages);

    it('tizim bilimi: savolga tegishli atama va sahifa mantig‘i promptga qo‘shiladi, qadamda ko‘rinadi', async () => {
      const f = uslubli('{"javob":"Xo‘sh","harakatlar":[]}', { xususiyat: {}, korsatma: null, yoqilgan: true }); vi.stubGlobal('fetch', f);
      const r = await post({ amal: 'kasb_savol', kompaniya_id: 5, savol: 'Grafikdagi rz va bl qator turlari nima?', sahifa: '/admin/f2-tarix' }, env({ OPENROUTER_API_KEY: 'k', GROQ_API_KEY: undefined }));
      const j = await r.json() as { qadamlar: Array<{ matn: string }> };
      const p = modelSoroviga(f);
      expect(p).toContain('TIZIM BILIMI'); expect(p).toContain('Smeta qator turlari'); expect(p).toContain('F2 tarixi va tasdiqlash');
      expect(j.qadamlar.map((q) => q.matn).join(' ')).toMatch(/Tizim bilimi qo‘shildi/);
    });

    it('uslub: o‘rganilgan belgi va ko‘rsatma promptga ketadi; faqat SHAKL saqlanadi (savol matni emas); o‘chirilgan bo‘lsa na prompt, na saqlash', async () => {
      const xus = { n: 8, ru: 0.9, uzunlik: 30, batafsil: 0, qisqa: 0.5, jadval: 0, rasmiy: 0 };
      const f = uslubli('{"javob":"Xo‘sh","harakatlar":[]}', { xususiyat: xus, korsatma: 'Avval xulosa yoz', yoqilgan: true }); vi.stubGlobal('fetch', f);
      await post({ amal: 'kasb_savol', kompaniya_id: 5, savol: 'Omborda sement qancha?' }, env({ OPENROUTER_API_KEY: 'k', GROQ_API_KEY: undefined }));
      const p = modelSoroviga(f);
      expect(p).toContain('FOYDALANUVCHI USLUBI'); expect(p).toContain('asosan ruscha'); expect(p).toContain('Avval xulosa yoz');
      const yoz = JSON.parse(String((f.mock.calls.find(([u]) => String(u).includes('t2_agent_uslub_yangila_v1')) as unknown as [string, RequestInit])[1].body));
      expect(yoz.p_actor_id).toBe(7); expect(yoz.p_xususiyat.n).toBe(9); expect(JSON.stringify(yoz)).not.toContain('sement');

      const f2 = uslubli('{"javob":"Xo‘sh","harakatlar":[]}', { xususiyat: xus, korsatma: 'Avval xulosa yoz', yoqilgan: false }); vi.stubGlobal('fetch', f2);
      await post({ amal: 'kasb_savol', kompaniya_id: 5, savol: 'Omborda sement qancha?' }, env({ OPENROUTER_API_KEY: 'k', GROQ_API_KEY: undefined }));
      expect(modelSoroviga(f2)).not.toContain('FOYDALANUVCHI USLUBI');
      expect(f2.mock.calls.some(([u]) => String(u).includes('t2_agent_uslub_yangila_v1'))).toBe(false);
    });

    it('sahifa ochish: faqat katalogdagi yo‘l qabul qilinadi (o‘ylab topilgan va tashqi havola tashlanadi); navigatsiya savolida tokensiz qidiruv qo‘shiladi', async () => {
      const f = toliq('{"javob":"Mana.","harakatlar":[],"otish":"/admin/m29"}'); vi.stubGlobal('fetch', f);
      let j = await (await post({ amal: 'kasb_savol', kompaniya_id: 5, savol: 'Material sarfi hisobotini ko‘rsat' }, env({ OPENROUTER_API_KEY: 'k', GROQ_API_KEY: undefined }))).json() as { sahifalar: Array<{ yol: string }> };
      expect(j.sahifalar.map((x) => x.yol)).toEqual(['/admin/m29']);
      vi.stubGlobal('fetch', toliq('{"javob":"Mana.","harakatlar":[],"otish":"https://evil.example/x"}'));
      j = await (await post({ amal: 'kasb_savol', kompaniya_id: 5, savol: 'Material sarfi hisobotini ko‘rsat' }, env({ OPENROUTER_API_KEY: 'k', GROQ_API_KEY: undefined }))).json() as { sahifalar: Array<{ yol: string }> };
      expect(j.sahifalar).toEqual([]);
      vi.stubGlobal('fetch', toliq('{"javob":"Mana.","harakatlar":[],"otish":"/admin/yoq-sahifa"}'));
      j = await (await post({ amal: 'kasb_savol', kompaniya_id: 5, savol: 'Nakopitelniy qayerda?' }, env({ OPENROUTER_API_KEY: 'k', GROQ_API_KEY: undefined }))).json() as { sahifalar: Array<{ yol: string }> };
      expect(j.sahifalar.map((x) => x.yol)).toContain('/admin/nakopitelniy');
      expect(j.sahifalar.map((x) => x.yol)).not.toContain('/admin/yoq-sahifa');
    });

    it('tizim_yordam: kompaniyasiz va TOKENSIZ (model/baza chaqirilmaydi); mos qo‘llanma yo‘q bo‘lsa halol aytadi', async () => {
      const f = vi.fn(async (_u: string) => new Response('{}', { status: 500 })); vi.stubGlobal('fetch', f);
      const j = await (await post({ amal: 'tizim_yordam', savol: 'F2 nima?' })).json() as { ok: boolean; javob: string; topildi: boolean; model: string };
      expect(j).toMatchObject({ ok: true, topildi: true, model: 'local' }); expect(j.javob).toContain('Акт приёмки');
      const bos = await (await post({ amal: 'tizim_yordam', savol: 'qwertyuiop' })).json() as { topildi: boolean; javob: string };
      expect(bos.topildi).toBe(false); expect(bos.javob).toContain('topilmadi');
      expect((await post({ amal: 'tizim_yordam' })).status).toBe(400);
      // faqat umumiy (global) bilimni o'qiydi; model ham, kompaniya RPC si ham chaqirilmaydi
      expect(f.mock.calls.every(([u]) => String(u).includes('t2_agent_bilim_umumiy_v1'))).toBe(true);
    });

    it('uslub va shaxsiy model amallari faqat sessiyadagi foydalanuvchi nomidan; GET uslub odam o‘qiydigan xulosa qaytaradi', async () => {
      const f = vi.fn(async (u: string) => rpcJavob(String(u).includes('t2_agent_uslub_v1') ? { ok: true, xususiyat: { n: 9, ru: 1, uzunlik: 20, batafsil: 0, qisqa: 0, jadval: 0, rasmiy: 0 }, korsatma: null, yoqilgan: true } : { ok: true }));
      vi.stubGlobal('fetch', f);
      expect((await post({ amal: 'uslub_saqla', korsatma: 'Qisqa yoz', yoqilgan: true, p_actor_id: 999 })).status).toBe(200);
      expect((await post({ amal: 'uslub_tozala' })).status).toBe(200);
      expect((await post({ amal: 'model_shaxsiy_tanla', profil: 'prorab', model_id: 'google/gemini-2.5-flash-lite' })).status).toBe(200);
      expect((await post({ amal: 'model_shaxsiy_tanla', model_id: 'x/y' })).status).toBe(400);
      for (const c of f.mock.calls) expect(JSON.parse(String((c as unknown as [string, RequestInit])[1].body)).p_actor_id).toBe(7);
      const g = await onRequestGet({ request: new Request('https://t/api/agent-ish?bolim=uslub'), env: env() } as never);
      expect((await g.json() as { xulosa: string[] }).xulosa.join(' ')).toContain('ruscha');
    });

    it('bazadagi tasdiqlangan bilim savolga mos bo‘lsa promptga kiradi (kompaniya bilimi ham)', async () => {
      const asos = toliq('{"javob":"Xo‘sh","harakatlar":[]}');
      const f = vi.fn(async (u: string, init?: RequestInit) => (String(u).includes('t2_agent_bilim_v1')
        ? rpcJavob({ ok: true, natija: [{ kod: 'bizning_tartib', doira: 'company', sarlavha: 'Ombor chiqim tartibi', matn: 'Bizda chiqimni faqat omborchi va prorab birgalikda tasdiqlaydi.', kalit: ['chiqim tartibi'] }] })
        : asos(u, init)));
      vi.stubGlobal('fetch', f);
      await post({ amal: 'kasb_savol', kompaniya_id: 5, savol: 'Ombor chiqim tartibi qanday?' }, env({ OPENROUTER_API_KEY: 'k', GROQ_API_KEY: undefined }));
      const p = JSON.stringify(JSON.parse(String((f.mock.calls.find(([u]) => String(u).includes('openrouter.ai')) as unknown as [string, RequestInit])[1].body)).messages);
      expect(p).toContain('faqat omborchi va prorab'); expect(p).toContain('kompaniya bilimi');
      const bl = JSON.parse(String((f.mock.calls.find(([u]) => String(u).includes('t2_agent_bilim_v1')) as unknown as [string, RequestInit])[1].body));
      expect(bl).toMatchObject({ p_actor_id: 7, p_kompaniya_id: 5 });
    });

    describe('boshqaruvchi agent — bilim yig‘ish', () => {
      const SAHIFA = '<html><body><p>ShNQ 3.01.01-22 band 6: yashirin ishlar dalolatnomasi talablari.</p></body></html>';
      const kuz = (sha: string | null, o: { royxatXato?: boolean; modelMatni?: string } = {}) => vi.fn(async (u: string, init?: RequestInit) => {
        const url = String(u);
        if (url.includes('t2_agent_kuzatuv_royxat_v1')) return o.royxatXato ? rpcJavob({ ok: false, code: 'GLOBAL_SCOPE_DENIED' }) : rpcJavob({ ok: true, natija: [{ id: 3, url: 'https://norma.uz/x', nom: 'Norma ShNQ', maqsad: 'ShNQ', faol: true, oxirgi_sha256: sha }] });
        if (url.includes('t2_agent_muhit_v1')) return rpcJavob({ ok: true, scope: 'global', qoidalar: [], xotira: [], manbalar: [], model: 'google/gemini-2.5-flash-lite' });
        if (url.includes('t2_agent_veb_ruxsat_v1')) return rpcJavob({ ok: true });
        if (url.includes('t2_agent_veb_log_v1') || url.includes('t2_agent_kuzatuv_belgila_v1') || url.includes('t2_agent_sarf_')) return rpcJavob({ ok: true });
        if (url.includes('t2_agent_taklif_yarat_v1')) return rpcJavob({ ok: true, id: 41 });
        if (url.startsWith('https://norma.uz/')) return new Response(SAHIFA, { status: 200, headers: { 'content-type': 'text/html' } });
        if (url.includes('openrouter.ai')) return new Response(JSON.stringify({ choices: [{ message: { content: o.modelMatni ?? JSON.stringify({ takliflar: [{ kod: 'shnq_3_01_01_22_aosr', sarlavha: 'ShNQ 3.01.01-22 АОСР', matn: 'Yashirin ishlar dalolatnomasi 6-bandga muvofiq rasmiylashtiriladi.', kalit: ['aosr', 'dalolatnoma'] }] }) } }], usage: { prompt_tokens: 700, completion_tokens: 80, cost: 0.0003 } }), { status: 200 });
        void init; return new Response('{}', { status: 500 });
      });
      const yuboring = (f: ReturnType<typeof vi.fn>) => { vi.stubGlobal('fetch', f); return post({ amal: 'bilim_yigish' }, env({ OPENROUTER_API_KEY: 'k', GROQ_API_KEY: undefined })); };

      it('sahifa o‘zgargan: model chaqiriladi, bilim TAKLIFI yaratiladi (dalil: url+sha256), hech narsa to‘g‘ridan-to‘g‘ri kuchga kirmaydi', async () => {
        const f = kuz('eski-sha');
        const j = await (await yuboring(f)).json() as { ok: boolean; korildi: number; ozgardi: number; takliflar: number[] };
        expect(j).toMatchObject({ ok: true, korildi: 1, ozgardi: 1, takliflar: [41] });
        const t = JSON.parse(String((f.mock.calls.find(([u]) => String(u).includes('t2_agent_taklif_yarat_v1')) as unknown as [string, RequestInit])[1].body));
        expect(t).toMatchObject({ p_actor_id: 7, p_kompaniya_id: null, p_tur: 'bilim', p_doira: 'global' });
        expect(t.p_mazmun.kod).toBe('shnq_3_01_01_22_aosr'); expect(t.p_dalil[0].url).toBe('https://norma.uz/x'); expect(t.p_dalil[0].sha256).toMatch(/^[0-9a-f]{64}$/);
        expect(f.mock.calls.some(([u]) => /t2_agent_(bilim|qoida)\b|t2_agent_taklif_qaror/.test(String(u)))).toBe(false);
        const belgi = JSON.parse(String((f.mock.calls.find(([u]) => String(u).includes('t2_agent_kuzatuv_belgila_v1')) as unknown as [string, RequestInit])[1].body));
        expect(belgi).toMatchObject({ p_id: 3, p_holat: 'ozgardi' });
        const model = JSON.stringify(JSON.parse(String((f.mock.calls.find(([u]) => String(u).includes('openrouter.ai')) as unknown as [string, RequestInit])[1].body)).messages);
        expect(model).toContain('TASHQI_MANBA'); expect(model).toContain('bilim yig‘ish');
      });

      it('sahifa o‘zgarmagan: model CHAQIRILMAYDI (token sarflanmaydi), holat «ozgarmadi»', async () => {
        const sha = await (async () => { const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(SAHIFA)); return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join(''); })();
        const f = kuz(sha);
        const j = await (await yuboring(f)).json() as { ozgardi: number; natija: Array<{ holat: string }> };
        expect(j.ozgardi).toBe(0); expect(j.natija[0].holat).toBe('ozgarmadi');
        expect(f.mock.calls.some(([u]) => /openrouter\.ai|t2_agent_sarf_/.test(String(u)))).toBe(false);
      });

      it('birinchi olish «yangi»; model yaroqsiz javob bersa taklif yaratilmaydi, xato yutilmaydi', async () => {
        const f = kuz(null, { modelMatni: 'bu json emas' });
        const j = await (await yuboring(f)).json() as { takliflar: number[]; natija: Array<{ holat: string }> };
        expect(j.takliflar).toEqual([]); expect(j.natija[0].holat).toBe('yangi');
        expect(f.mock.calls.some(([u]) => String(u).includes('t2_agent_taklif_yarat_v1'))).toBe(false);
      });

      it('superadmin bo‘lmasa (baza rad etadi) hech narsa olinmaydi; kompaniya doirasida rad', async () => {
        const f = kuz('x', { royxatXato: true });
        const r = await yuboring(f);
        expect((await r.json() as { code: string }).code).toBe('GLOBAL_SCOPE_DENIED');
        expect(f.mock.calls.some(([u]) => /openrouter\.ai|norma\.uz/.test(String(u)))).toBe(false);
        vi.stubGlobal('fetch', kuz('x'));
        expect((await post({ amal: 'bilim_yigish', kompaniya_id: 5 }, env({ OPENROUTER_API_KEY: 'k' }))).status).toBe(403);
      });

      it('manba olinmasa (tasdiqlanmagan domen) sahifa «xato» deb belgilanadi, model chaqirilmaydi', async () => {
        const f = vi.fn(async (u: string) => { const url = String(u);
          if (url.includes('t2_agent_kuzatuv_royxat_v1')) return rpcJavob({ ok: true, natija: [{ id: 3, url: 'https://norma.uz/x', nom: 'N', maqsad: null, faol: true, oxirgi_sha256: null }] });
          if (url.includes('t2_agent_muhit_v1')) return rpcJavob({ ok: true, scope: 'global', qoidalar: [], xotira: [], manbalar: [] });
          if (url.includes('t2_agent_veb_ruxsat_v1')) return rpcJavob({ ok: false, code: 'MANBA_TASDIQLANMAGAN' });
          return rpcJavob({ ok: true }); });
        const j = await (await yuboring(f)).json() as { xatolar: number; natija: Array<{ holat: string }> };
        expect(j.xatolar).toBe(1); expect(j.natija[0].holat).toBe('xato');
        expect(f.mock.calls.some(([u]) => String(u).includes('openrouter.ai'))).toBe(false);
      });
    });

    it('bilim_yoz: inson yozgan bilim taklif sifatida yaratiladi va vakolat bo‘lsa darhol tasdiqlanadi; kalit/kod tozalanadi', async () => {
      const f = vi.fn(async (u: string) => (String(u).includes('t2_agent_taklif_yarat_v1') ? rpcJavob({ ok: true, id: 77 }) : rpcJavob({ ok: true, holat: 'qollandi' })));
      vi.stubGlobal('fetch', f);
      const j = await (await post({ amal: 'bilim_yoz', kompaniya_id: 5, sarlavha: 'Bizning ombor tartibi', matn: 'Chiqimni omborchi va prorab birga tasdiqlaydi.', kalit: 'chiqim tartibi, ombor , x' })).json() as { ok: boolean; taklif_id: number; qabul: boolean };
      expect(j).toMatchObject({ ok: true, taklif_id: 77, qabul: true });
      const c = JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body));
      expect(c).toMatchObject({ p_actor_id: 7, p_kompaniya_id: 5, p_tur: 'bilim', p_doira: 'company' });
      expect(c.p_mazmun.kalit).toEqual(['chiqim tartibi', 'ombor']); expect(c.p_mazmun.kod).toBe('bizning_ombor_tartibi');
      // vakolat yo'q: taklif qoladi (kutilmoqda), xato emas
      vi.stubGlobal('fetch', vi.fn(async (u: string) => (String(u).includes('t2_agent_taklif_yarat_v1') ? rpcJavob({ ok: true, id: 78 }) : rpcJavob({ ok: false, code: 'WRITE_ROLE_REQUIRED' }))));
      const j2 = await (await post({ amal: 'bilim_yoz', kompaniya_id: 5, sarlavha: 'Qoida', matn: 'Yetarlicha uzun matn bo‘lishi kerak', kalit: ['atama'] })).json() as { qabul: boolean; kutilmoqda: boolean };
      expect(j2).toMatchObject({ qabul: false, kutilmoqda: true });
      expect((await post({ amal: 'bilim_yoz', kompaniya_id: 5, sarlavha: 'Faqat sarlavha' })).status).toBe(400);
    });

    it('kuzatuv_saqla va bilim GET yo‘llari sessiya foydalanuvchisi nomidan', async () => {
      const f = vi.fn(async () => rpcJavob({ ok: true, natija: [] })); vi.stubGlobal('fetch', f);
      expect((await post({ amal: 'kuzatuv_saqla', url: 'https://norma.uz/a', nom: 'Norma', p_actor_id: 999 })).status).toBe(200);
      expect((await post({ amal: 'kuzatuv_saqla', kompaniya_id: 5, url: 'https://norma.uz/a', nom: 'Norma' })).status).toBe(403);
      for (const b of ['bilim', 'kuzatuv', 'bilim_holat']) {
        expect((await onRequestGet({ request: new Request(`https://t/api/agent-ish?bolim=${b}&kompaniya_id=5`), env: env() } as never)).status).toBe(200);
      }
      for (const c of f.mock.calls) expect(JSON.parse(String((c as unknown as [string, RequestInit])[1].body)).p_actor_id).toBe(7);
    });

    it('kompaniyasiz so‘rov 422; ruxsatsiz kompaniya bazada rad (model yo‘q)', async () => {
      vi.stubGlobal('fetch', vi.fn(async (u: string) => (String(u).includes('t2_agent_kasb_v1') ? rpcJavob({ ok: false, code: 'COMPANY_ACCESS_DENIED' }) : new Response('{}', { status: 500 }))));
      expect((await post({ amal: 'kasb_savol', savol: 'Salom' })).status).toBe(422);
      expect((await post({ amal: 'kasb_savol', kompaniya_id: 9, savol: 'Omborda nima bor?' })).status).toBe(403);
    });
  });

  it('noma‘lum amal rad', async () => {
    vi.stubGlobal('fetch', vi.fn());
    expect((await post({ amal: 'sql_yoz' })).status).toBe(400);
  });
});
