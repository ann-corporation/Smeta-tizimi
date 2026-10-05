import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../_shared/auth', () => ({ tekshir: vi.fn(async () => ({ foydalanuvchi_id: 7 })) }));

import { grantlarniTozala, kodXeshi, onRequestGet, onRequestPost, oqishYuki, xatoJavobi, yangiKod, yozishYuki } from './tomon';

const ENV = { SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_KEY: 'service-key', SESSIYA_KALIT: 'a'.repeat(32) };
const post = (body: unknown) => ({ request: new Request('https://x/api/tomon', { method: 'POST', headers: { Cookie: 's=1' }, body: JSON.stringify(body) }), env: ENV }) as never;
const get = (qs: string) => ({ request: new Request('https://x/api/tomon?' + qs, { headers: { Cookie: 's=1' } }), env: ENV }) as never;

afterEach(() => vi.unstubAllGlobals());

describe('tomon shlyuzi — yozish yuki', () => {
  it('taklif: rollar va INN tekshiriladi, kod xeshi keyin qo‘yiladi', () => {
    const y = yozishYuki('taklif', { kompaniya_id: 3, qabul_inn: '301234567', taklif_rol: 'pudratchi', qabul_rol: 'zakazchik', nom: ' Navoiy ', operation_id: 'xato' }) as Record<string, unknown>;
    expect(y).toMatchObject({ p_kompaniya_id: 3, p_qabul_inn: '301234567', p_taklif_rol: 'pudratchi', p_qabul_rol: 'zakazchik', p_turi: 'shartnoma', p_nom: 'Navoiy', p_kod_xesh: null });
    expect(String(y.p_operation_id)).toMatch(/^[0-9a-f-]{36}$/);
    expect(yozishYuki('taklif', { kompaniya_id: 3, qabul_inn: '12', taklif_rol: 'a', qabul_rol: 'b' })).toMatch(/INN/);
    expect(yozishYuki('taklif', { kompaniya_id: 3, taklif_rol: 'p', qabul_rol: 'zakazchik' })).toMatch(/rol/);
    // Kompaniya ID ni INN siz yuborib bo'lmaydi (taxmin qilib taklif yuborishga qarshi).
    expect(yozishYuki('taklif', { kompaniya_id: 3, qabul_kompaniya_id: 9, taklif_rol: 'pudratchi', qabul_rol: 'zakazchik' })).toMatch(/INN/);
  });

  it('actor va boshqa kompaniya maydonlari almashtirib bo‘lmaydi', () => {
    const y = yozishYuki('javob', { kompaniya_id: 3, aloqa_id: 5, qaror: 'qabul', p_actor_id: 99, actor_id: 99 }) as Record<string, unknown>;
    expect(y).toEqual({ p_kompaniya_id: 3, p_aloqa_id: 5, p_qaror: 'qabul', p_izoh: null });
    expect(y).not.toHaveProperty('p_actor_id');
    expect(yozishYuki('javob', { aloqa_id: 5, qaror: 'qabul' })).toMatch(/kompaniya_id/);
    expect(yozishYuki('javob', { kompaniya_id: 3, aloqa_id: 5, qaror: 'hammasi' })).toMatch(/qaror/);
  });

  it('grantlar: aynan bitta doira, amallar tekshiriladi, ortiqcha maydon tashlanadi', () => {
    const ok = grantlarniTozala([{ resurs: 'f2', amallar: ['korish', 'korish', 'tafsilot'], obyekt_id: 4, juda_xavfli: 'x', kompaniya_id: 999 }]) as Array<Record<string, unknown>>;
    expect(ok).toEqual([{ resurs: 'f2', amallar: ['korish', 'tafsilot'], loyiha_id: null, obyekt_id: 4, shartnoma_id: null }]);
    expect(grantlarniTozala([{ resurs: 'f2', amallar: ['korish'] }])).toMatch(/doira/);
    expect(grantlarniTozala([{ resurs: 'f2', amallar: ['korish'], obyekt_id: 1, loyiha_id: 2 }])).toMatch(/doira/);
    expect(grantlarniTozala([{ resurs: 'F2;drop', amallar: ['korish'], obyekt_id: 1 }])).toMatch(/resurs/);
    expect(grantlarniTozala([{ resurs: 'f2', amallar: [], obyekt_id: 1 }])).toMatch(/amallar/);
    expect(grantlarniTozala([])).toMatch(/grantlar/);
    expect(yozishYuki('grant_saqla', { kompaniya_id: 3, aloqa_id: 5, grantlar: [{ resurs: 'obyekt_holat', amallar: ['korish'], shartnoma_id: 8 }] }))
      .toMatchObject({ p_aloqa_id: 5, p_grantlar: [{ resurs: 'obyekt_holat', shartnoma_id: 8 }] });
  });

  it('holat, taqdim, qaror, izoh', () => {
    expect(yozishYuki('holat', { kompaniya_id: 3, aloqa_id: 5, harakat: 'yopish', sabab: 'tugadi' })).toEqual({ p_kompaniya_id: 3, p_aloqa_id: 5, p_amal: 'yopish', p_sabab: 'tugadi' });
    expect(yozishYuki('holat', { kompaniya_id: 3, aloqa_id: 5, harakat: 'ochir' })).toMatch(/harakat/);
    expect(yozishYuki('taqdim_yarat', { kompaniya_id: 3, aloqa_id: 5, resurs: 'f2', manba_id: 11 })).toMatchObject({ p_resurs: 'f2', p_manba_id: 11, p_izoh: null });
    expect(yozishYuki('taqdim_yarat', { kompaniya_id: 3, aloqa_id: 5, resurs: 'f2' })).toMatch(/manba_id/);
    expect(yozishYuki('qaror', { kompaniya_id: 3, taqdim_id: 2, qaror: 'tuzatish', izoh: 'narx xato' })).toEqual({ p_kompaniya_id: 3, p_taqdim_id: 2, p_qaror: 'tuzatish', p_izoh: 'narx xato' });
    expect(yozishYuki('qaror', { kompaniya_id: 3, taqdim_id: 2, qaror: 'tasdiq' })).toMatch(/qaror/);
    expect(yozishYuki('izoh', { kompaniya_id: 3, taqdim_id: 2, matn: ' salom ' })).toMatchObject({ p_taqdim_id: 2, p_aloqa_id: null, p_matn: 'salom' });
    expect(yozishYuki('izoh', { kompaniya_id: 3, matn: 'x' })).toMatch(/aloqa_id yoki taqdim_id/);
    expect(yozishYuki('sql', { kompaniya_id: 3 })).toBe('Amal ochiq emas');
  });
});

describe('tomon shlyuzi — taklif kodi', () => {
  it('kod formati va xeshi barqaror (registr/chiziqchaga befarq), ochiq kod xeshda ko‘rinmaydi', async () => {
    const k = yangiKod();
    expect(k).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(k).not.toMatch(/[01OIL]/);
    const h = await kodXeshi(k);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(await kodXeshi(k.toLowerCase().replace(/-/g, ' '))).toBe(h);
    expect(h).not.toContain(k.replace(/-/g, ''));
    expect(await kodXeshi(yangiKod())).not.toBe(h);
  });

  it('POST taklif: bazaga faqat xesh boradi, ochiq kod faqat javobda bir marta', async () => {
    let yuborilgan = '';
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init?: { body?: string }) => {
      yuborilgan = String(init?.body);
      return new Response(JSON.stringify({ ok: true, id: 5, holat: 'taklif', kod_kerak: true }), { status: 200 });
    }));
    const r = await onRequestPost(post({ amal: 'taklif', kompaniya_id: 3, qabul_nom: 'Yangi MCHJ', taklif_rol: 'pudratchi', qabul_rol: 'zakazchik', p_actor_id: 1 }));
    const d = await r.json() as { ok: boolean; kod: string };
    expect(d.ok).toBe(true);
    expect(d.kod).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    const body = JSON.parse(yuborilgan) as Record<string, unknown>;
    expect(body.p_actor_id).toBe(7);                       // sessiyadan, so‘rovdagi 1 emas
    expect(body.p_kod_xesh).toBe(await kodXeshi(d.kod));
    expect(yuborilgan).not.toContain(d.kod);
    expect(yuborilgan).not.toContain(d.kod.replace(/-/g, ''));
  });

  it('POST taklif: tizimdagi tomon (kod_kerak=false) yoki qayta chaqiruvda kod qaytarilmaydi', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, id: 5, holat: 'taklif', kod_kerak: false }), { status: 200 })));
    const a = await (await onRequestPost(post({ amal: 'taklif', kompaniya_id: 3, qabul_inn: '301234567', taklif_rol: 'pudratchi', qabul_rol: 'zakazchik' }))).json();
    expect(a).not.toHaveProperty('kod');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, id: 5, holat: 'taklif', kod_kerak: true, qayta: true }), { status: 200 })));
    const b = await (await onRequestPost(post({ amal: 'taklif', kompaniya_id: 3, qabul_nom: 'X', taklif_rol: 'pudratchi', qabul_rol: 'zakazchik' }))).json();
    expect(b).not.toHaveProperty('kod');
  });

  it('POST kod_qabul: kiritilgan kod xeshlanib boradi', async () => {
    let body: Record<string, unknown> = {};
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init?: { body?: string }) => { body = JSON.parse(String(init?.body)); return new Response(JSON.stringify({ ok: true, id: 5, holat: 'faol' }), { status: 200 }); }));
    await onRequestPost(post({ amal: 'kod_qabul', kompaniya_id: 4, kod: 'abcd-efgh-jkmn' }));
    expect(body).toEqual({ p_actor_id: 7, p_kompaniya_id: 4, p_kod_xesh: await kodXeshi('ABCDEFGHJKMN') });
    const r = await onRequestPost(post({ amal: 'kod_qabul', kompaniya_id: 4, kod: '123' }));
    expect(r.status).toBe(400);
  });
});

describe('tomon shlyuzi — o‘qish va xatolar', () => {
  it('bo‘limlar va parametrlar', () => {
    expect(oqishYuki('aloqalar', new URLSearchParams('kompaniya_id=3'))).toEqual({ p_kompaniya_id: 3 });
    expect(oqishYuki('aloqalar', new URLSearchParams(''))).toMatch(/kompaniya_id/);
    expect(oqishYuki('taqdimlar', new URLSearchParams('kompaniya_id=3&yonalish=kelgan&holat=yuborilgan'))).toEqual({ p_kompaniya_id: 3, p_yonalish: 'kelgan', p_holat: 'yuborilgan', p_aloqa_id: null, p_limit: 100 });
    expect(oqishYuki('taqdimlar', new URLSearchParams('kompaniya_id=3&yonalish=hammasi&holat=x;y'))).toMatchObject({ p_yonalish: null, p_holat: null });
    expect(oqishYuki('qidir', new URLSearchParams('kompaniya_id=3&inn=12'))).toMatch(/INN/);
    expect(oqishYuki('qidir', new URLSearchParams('kompaniya_id=3&inn=301234567'))).toEqual({ p_kompaniya_id: 3, p_inn: '301234567' });
    expect(oqishYuki('jadval', new URLSearchParams('kompaniya_id=3'))).toBe('Bo‘lim ochiq emas');
  });

  it('GET ochiq bo‘lmagan bo‘limni rad etadi, RPC xatosi tashqariga ichki matnsiz chiqadi', async () => {
    const yoq = await onRequestGet(get('bolim=pg_catalog&kompaniya_id=3'));
    expect(yoq.status).toBe(400);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ code: '42501', message: 'actor bu kompaniyaning faol a\'zosi emas' }), { status: 403 })));
    const r = await onRequestGet(get('bolim=aloqalar&kompaniya_id=3'));
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ ok: false, code: 'AZO_EMAS', error: 'Siz bu kompaniyaning faol a’zosi emassiz' });
  });

  it('xato xaritasi', () => {
    expect(xatoJavobi(JSON.stringify({ code: '42501', message: 'TOMON_ROL_YETARLI_EMAS: kuzatuvchi roli "qaror" amalini bajara olmaydi' })).body).toMatchObject({ code: 'ROL_YETARLI_EMAS' });
    expect(xatoJavobi(JSON.stringify({ code: '22023', message: 'kompaniya_id majburiy' })).status).toBe(400);
    const x = xatoJavobi(JSON.stringify({ code: 'XX000', message: 'relation "t2_tomon_grant" does not exist' }));
    expect(x.status).toBe(502);
    expect(JSON.stringify(x.body)).not.toContain('t2_tomon');
    expect(xatoJavobi('<html>').status).toBe(502);
  });
});
