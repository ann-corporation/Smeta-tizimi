import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ tekshir: vi.fn() }));
vi.mock('../_shared/auth', () => ({ tekshir: m.tekshir }));

import { onRequestGet, onRequestPost } from './ai-ishchi';
import { onRequestGet as bajarGet, onRequestPost as bajarPost, kalitTekshir } from './ai-ishchi-bajar';

const env = (o: Record<string, unknown> = {}) => ({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_KEY: 'svc', SESSIYA_KALIT: 's', OPENROUTER_API_KEY: 'k', ...o });
const rpcJ = (d: unknown) => new Response(JSON.stringify(d), { status: 200 });
const post = (body: unknown, e = env()) => onRequestPost({ request: new Request('https://t/api/ai-ishchi', { method: 'POST', body: JSON.stringify(body) }), env: e } as never);
const get = (q: string, e = env()) => onRequestGet({ request: new Request('https://t/api/ai-ishchi?' + q), env: e } as never);
const rpcNomi = (f: ReturnType<typeof vi.fn>) => f.mock.calls.map((c) => String(c[0]).split('/rpc/')[1]);
const yuk = (f: ReturnType<typeof vi.fn>, nom: string) => JSON.parse(String((f.mock.calls.find((c) => String(c[0]).includes(nom)) as unknown as [string, RequestInit])[1].body));

beforeEach(() => { m.tekshir.mockResolvedValue({ foydalanuvchi_id: 7 }); });
afterEach(() => vi.unstubAllGlobals());

describe('/api/ai-ishchi', () => {
  it('sessiyasiz 401; noto‘g‘ri kompaniya_id 400; noma‘lum bo‘lim 400', async () => {
    m.tekshir.mockResolvedValue(null);
    expect((await get('bolim=ishchilar')).status).toBe(401);
    m.tekshir.mockResolvedValue({ foydalanuvchi_id: 7 });
    expect((await get('bolim=ishchilar&kompaniya_id=abc')).status).toBe(400);
    expect((await get('bolim=hamma_narsa')).status).toBe(400);
  });

  it('actor HAR DOIM sessiyadan (tanadagi p_actor_id e‘tiborsiz), tizim doirasi = null', async () => {
    const f = vi.fn(async () => rpcJ({ ok: true, royxat: [] })); vi.stubGlobal('fetch', f);
    await get('bolim=inbox&kompaniya_id=5');
    expect(yuk(f, 't2_ai_ol_v1')).toMatchObject({ p_actor_id: 7, p_kompaniya_id: 5, p_bolim: 'inbox' });
    await post({ amal: 'sozlama_saqla', ishchi: 'tizim_sogligi', yoqilgan: true, p_actor_id: 999 });
    expect(yuk(f, 't2_ai_sozlama_saqla_v1')).toMatchObject({ p_actor_id: 7, p_kompaniya_id: null, p_yoqilgan: true });
  });

  it('baza ruxsatni rad etsa 403 qaytadi; model chaqirilmaydi', async () => {
    const f = vi.fn(async () => rpcJ({ ok: false, code: 'COMPANY_ACCESS_DENIED' })); vi.stubGlobal('fetch', f);
    const r = await post({ amal: 'ishga_tushir', ishchi: 'kunlik_nazoratchi', kompaniya_id: 5 });
    expect(r.status).toBe(403);
    expect(rpcNomi(f)).toEqual(['t2_ai_ish_navbat_v1']);
  });

  it('ishga_tushir: navbat -> SQL quruq qadam -> AI xulosa (token faqat shundan keyin) -> inbox natijasi', async () => {
    const chaqiruv: string[] = [];
    const f = vi.fn(async (u: string, init?: RequestInit) => {
      const nom = String(u).split('/rpc/')[1] ?? String(u); chaqiruv.push(nom);
      if (nom === 't2_ai_ish_navbat_v1') return rpcJ({ ok: true, id: 41, holat: 'navbatda' });
      if (nom === 't2_ai_ish_yur_v1') return rpcJ({ ok: true, holat: 'tugadi', ai_holat: 'kutilmoqda' });
      if (nom === 't2_ai_ish_ai_ol_v1') return rpcJ({ ok: true, ish_id: 41, ishchi_kod: 'kunlik_nazoratchi', kompaniya_id: 5, actor_id: 7, max_token: 3000, model_daraja: 'fast', faktlar: [{ bolak: '*' }], quruq: { sarlavha: 'S' } });
      if (nom.startsWith('t2_agent_sarf_tekshir')) return rpcJ({ ok: true });
      if (nom.startsWith('t2_agent_sarf_yoz')) return rpcJ({ ok: true });
      if (nom === 't2_ai_ish_ai_yoz_v1') return rpcJ({ ok: true, ai_holat: 'tayyor' });
      if (nom === 't2_ai_ol_v1') return rpcJ({ ok: true, royxat: [{ id: 3, ish_id: 41, sarlavha: 'Kunlik xulosa', xulosa: 'AI xulosa' }] });
      if (String(u).includes('openrouter')) return new Response(JSON.stringify({ choices: [{ message: { content: 'AI xulosa' }, finish_reason: 'stop' }], model: 'm', usage: { prompt_tokens: 10, completion_tokens: 5 } }), { status: 200 });
      void init; return rpcJ({ ok: true });
    });
    vi.stubGlobal('fetch', f);
    const r = await post({ amal: 'ishga_tushir', ishchi: 'kunlik_nazoratchi', kompaniya_id: 5 });
    expect(r.status).toBe(200);
    expect((await r.json() as { natija: { id: number } }).natija.id).toBe(3);
    const i = (n: string) => chaqiruv.indexOf(n);
    expect(i('t2_ai_ish_navbat_v1')).toBeLessThan(i('t2_ai_ish_yur_v1'));
    expect(i('t2_ai_ish_yur_v1')).toBeLessThan(i('t2_ai_ish_ai_ol_v1'));
    expect(chaqiruv.some((n) => n.startsWith('t2_agent_sarf_tekshir'))).toBe(true);   // limit tekshiruvi model chaqiruvidan OLDIN (aiHisobli)
  });

  it('AGENT_ISH_YOQILGAN=0: faqat SQL quruq qadam, model/limit RPC lari chaqirilmaydi', async () => {
    const chaqiruv: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (u: string) => {
      const nom = String(u).split('/rpc/')[1] ?? String(u); chaqiruv.push(nom);
      if (nom === 't2_ai_ish_navbat_v1') return rpcJ({ ok: true, id: 41, holat: 'navbatda' });
      if (nom === 't2_ai_ish_yur_v1') return rpcJ({ ok: true, holat: 'tugadi', ai_holat: 'kutilmoqda' });
      return rpcJ({ ok: true, royxat: [] });
    }));
    expect((await post({ amal: 'ishga_tushir', ishchi: 'kunlik_nazoratchi', kompaniya_id: 5 }, env({ AGENT_ISH_YOQILGAN: '0' }))).status).toBe(200);
    expect(chaqiruv).not.toContain('t2_ai_ish_ai_ol_v1');
  });

  it('yoqilmagan ishchi (o‘chiq): navbat rad etiladi, hech qanday ish bajarilmaydi', async () => {
    const f = vi.fn(async () => rpcJ({ ok: false, code: 'ISHCHI_OCHIQ', xabar: 'Ishchi o‘chiq — avval yoqing' })); vi.stubGlobal('fetch', f);
    const r = await post({ amal: 'ishga_tushir', ishchi: 'kunlik_nazoratchi', kompaniya_id: 5 });
    expect(r.status).toBe(400); expect((await r.json() as { error: string }).error).toContain('o‘chiq');
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('manba_saqla faqat tizim doirasida; natija_holat natija_id talab qiladi; ishchi nomi tekshiriladi', async () => {
    const f = vi.fn(async () => rpcJ({ ok: true })); vi.stubGlobal('fetch', f);
    expect((await post({ amal: 'manba_saqla', id: 3, kompaniya_id: 5 })).status).toBe(403);
    expect((await post({ amal: 'natija_holat', holat: 'oqildi' })).status).toBe(400);
    expect((await post({ amal: 'ishga_tushir', ishchi: 'X; drop table', kompaniya_id: 5 })).status).toBe(400);
    expect(f).not.toHaveBeenCalled();
    expect((await post({ amal: 'manba_saqla', id: 3, faol: false, chastota_soat: 12 })).status).toBe(200);
    expect(yuk(f, 't2_ai_manba_saqla_v1')).toMatchObject({ p_actor_id: 7, p_id: 3, p_faol: false, p_chastota_soat: 12 });
  });

  it('operation_id: mijoz bergan uuid saqlanadi (idempotent qayta urinish)', async () => {
    const f = vi.fn(async () => rpcJ({ ok: true })); vi.stubGlobal('fetch', f);
    const op = '8b1f6f0e-3c0a-4c63-9a53-6d1b0f6a1c11';
    await post({ amal: 'natija_holat', natija_id: 3, holat: 'oqildi', operation_id: op });
    expect(yuk(f, 't2_ai_natija_holat_v1').p_operation_id).toBe(op);
  });
});

describe('/api/ai-ishchi-bajar (cron)', () => {
  const kalit = 'k'.repeat(30);
  const bajar = (e: Record<string, unknown>, sarlavha: Record<string, string> = {}) => bajarPost({ request: new Request('https://t/api/ai-ishchi-bajar', { method: 'POST', headers: sarlavha, body: '{}' }), env: e } as never);

  it('kalit tekshiruvi: sozlanmagan 503, noto‘g‘ri 401; GET 405', async () => {
    const f = vi.fn(); vi.stubGlobal('fetch', f);
    expect((await bajar(env())).status).toBe(503);
    expect((await bajar(env({ KUZATUV_KALIT: kalit }), { 'X-Kuzatuv-Kalit': 'x'.repeat(30) })).status).toBe(401);
    expect((await bajar(env({ KUZATUV_KALIT: kalit }))).status).toBe(401);
    expect((await bajarGet({} as never)).status).toBe(405);
    expect(f).not.toHaveBeenCalled();
    expect(kalitTekshir(new Request('https://t', { headers: { 'X-Kuzatuv-Kalit': kalit } }), kalit)).toBe('ok');
    expect(kalitTekshir(new Request('https://t'), 'qisqa')).toBe('sozlanmagan');
  });

  it('to‘g‘ri kalit: jadval RPC + navbat; javobda FAQAT sonlar (kompaniya ma‘lumoti yo‘q)', async () => {
    const f = vi.fn(async (u: string) => {
      const nom = String(u).split('/rpc/')[1];
      if (nom === 't2_ai_jadval_v1') return rpcJ({ ok: true, navbatga: 2, bajarildi: 2, tiklandi: 0, ochirildi: 0 });
      if (nom === 't2_ai_bajaruvchi_navbat_v1') return rpcJ({ ok: true, internet: [], ai: [] });
      return rpcJ({ ok: true });
    });
    vi.stubGlobal('fetch', f);
    const r = await bajar(env({ KUZATUV_KALIT: kalit }), { 'X-Kuzatuv-Kalit': kalit });
    expect(r.status).toBe(200);
    const j = await r.json() as Record<string, unknown>;
    expect(j).toMatchObject({ ok: true, jadval: { navbatga: 2, bajarildi: 2 }, internet: 0, ai: 0 });
    expect(JSON.stringify(j)).not.toMatch(/kompaniya|nom|summa/i);
    expect(rpcNomi(f)).toEqual(['t2_ai_jadval_v1', 't2_moslash_kunlik_v1', 't2_ai_bajaruvchi_navbat_v1']);
  });

  it('AGENT_ISH_YOQILGAN=0: navbat bajarilmaydi (model yo‘q)', async () => {
    const f = vi.fn(async () => rpcJ({ ok: true, navbatga: 0, bajarildi: 0 })); vi.stubGlobal('fetch', f);
    const r = await bajar(env({ KUZATUV_KALIT: kalit, AGENT_ISH_YOQILGAN: '0' }), { 'X-Kuzatuv-Kalit': kalit });
    expect((await r.json() as { ai: string }).ai).toBe('ochirilgan');
    expect(rpcNomi(f)).toEqual(['t2_ai_jadval_v1', 't2_moslash_kunlik_v1']);
  });
});
