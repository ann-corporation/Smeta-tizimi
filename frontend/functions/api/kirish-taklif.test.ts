/* /api/kirish-taklif — SINTETIK ma'lumot; tarmoq to'liq soxtalashtirilgan. Haqiqiy telefon/ism/token YO'Q. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { imzola, tekshir } from '../_shared/auth';
import { vakolatKeshTozala } from '../_shared/role-authority';
import { xesh } from '../_shared/kirish-emailsiz';
import { onRequestGet, onRequestPost } from './kirish-taklif';

const KALIT = 'k'.repeat(32);
const SITE = 'https://t.example';
const ENV = { SUPABASE_URL: 'https://sinov.supabase.co', SUPABASE_KEY: 'server-only', SESSIYA_KALIT: KALIT, KIRISH_TAKLIF_YOQILGAN: '1' };
const TEL = '+998901234567';
const TOKEN = 'T'.repeat(32);

type Yozuv = { nom: string; yuk: Record<string, any> };
function tarmoq(rpc: Record<string, (b: any) => unknown>) {
  const log: Yozuv[] = [];
  vi.stubGlobal('fetch', vi.fn(async (raw: string, init?: RequestInit) => {
    const nom = new URL(raw).pathname.split('/').at(-1)!;
    const yuk = init?.body ? JSON.parse(String(init.body)) : {};
    log.push({ nom, yuk });
    const h = rpc[nom];
    if (!h) return Response.json({ message: 'not found' }, { status: 404 });
    const r = h(yuk);
    return r instanceof Response ? r : Response.json(r);
  }));
  return log;
}
afterEach(() => { vi.unstubAllGlobals(); vakolatKeshTozala(); });

const post = (body: unknown, o: { env?: Record<string, unknown>; headers?: Record<string, string>; cookie?: string } = {}) =>
  onRequestPost({ request: new Request(SITE + '/api/kirish-taklif', { method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(o.cookie ? { Cookie: o.cookie } : {}), ...(o.headers ?? {}) }, body: typeof body === 'string' ? body : JSON.stringify(body) }), env: o.env ?? ENV } as never);
const sessCookie = async (id = 7) => 'sess=' + await imzola({ rol: 'boss', foydalanuvchi_id: id, kompaniyalar: [{ kompaniya_id: 17, rol: 'boss' }] }, KALIT);
const men = () => ({ ok: true, platform_role: 'none', foydalanuvchi: { holat: 'faol' }, context_kompaniyalar: [{ kompaniya_id: 17, effective_role: 'boss', permissions: ['company.read', 'company.member.manage'], explicit_denials: [] }] });

describe('umumiy rad yo‘llari', () => {
  it('boshqa saytdan (Origin / cross-site) → 403, bazaga tegmaydi', async () => {
    const log = tarmoq({});
    expect((await post({ amal: 'qabul', token: TOKEN, parol: 'x' }, { headers: { Origin: 'https://evil.example' } })).status).toBe(403);
    expect((await post({ amal: 'qabul', token: TOKEN, parol: 'x' }, { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status).toBe(403);
    expect(log).toHaveLength(0);
  });
  it('sozlama o‘chiq (sukut) → 503 YOQILMAGAN; sozlanmagan → 503; GET holati maxfiy qiymatsiz', async () => {
    const log = tarmoq({});
    const r = await post({ amal: 'qabul', token: TOKEN, parol: 'x' }, { env: { ...ENV, KIRISH_TAKLIF_YOQILGAN: undefined } });
    expect(r.status).toBe(503);
    expect(((await r.json()) as { code: string }).code).toBe('YOQILMAGAN');
    expect((await post({ amal: 'qabul' }, { env: { ...ENV, SESSIYA_KALIT: 'qisqa' } })).status).toBe(503);
    const g = await onRequestGet({ env: ENV } as never);
    expect(await g.json()).toEqual({ ok: true, taklif: true, telefon: false, telegram: false });
    expect(log).toHaveLength(0);
  });
  it('noto‘g‘ri tana / noma’lum amal → 400', async () => {
    tarmoq({});
    expect((await post('{not json')).status).toBe(400);
    expect((await post({ amal: 'x' })).status).toBe(400);
    expect((await post(null)).status).toBe(400);
  });
});

describe('yarat / royxat / bekor — actor sessiyadan', () => {
  it('sessiyasiz → 401; kompaniya_id yo‘q → 400; telefon yaroqsiz → 400 (bazaga yetmaydi)', async () => {
    const log = tarmoq({ t2_men_v1: men });
    expect((await post({ amal: 'yarat', kompaniya_id: 17, ism: 'Sinov', telefon: TEL, rol: 'usta' })).status).toBe(401);
    expect((await post({ amal: 'yarat', ism: 'Sinov', telefon: TEL, rol: 'usta' }, { cookie: await sessCookie() })).status).toBe(400);
    const r = await post({ amal: 'yarat', kompaniya_id: 17, ism: 'Sinov', telefon: 'telefon emas', rol: 'usta' }, { cookie: await sessCookie() });
    expect(r.status).toBe(400);
    expect(((await r.json()) as { code: string }).code).toBe('TELEFON_NOTOGRI');
    expect(log.filter((l) => l.nom === 't2_kirish_taklif_yarat_v1')).toHaveLength(0);
  });
  it('muvaffaqiyat: actor sessiyadan (klient yuborgan p_actor_id emas), bazaga faqat xesh, kod/havola javobda BIR MARTA', async () => {
    const log = tarmoq({ t2_men_v1: men, t2_kirish_taklif_yarat_v1: () => ({ ok: true, taklif_id: 5, tugaydi: '2026-11-16T10:00:00Z', telefon: '+998 ** *** 4567' }) });
    const r = await post({ amal: 'yarat', kompaniya_id: 17, ism: 'Sinov Odam', telefon: '90 123 45 67', rol: 'usta', p_actor_id: 999, muddat_soat: 100000 }, { cookie: await sessCookie(7) });
    expect(r.status).toBe(200);
    const j = await r.json() as { kod: string; havola: string; taklif_id: number };
    expect(j.kod).toMatch(/^[1-9]\d{7}$/);
    const token = j.havola.replace(SITE + '/taklif/', '');
    expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    const yuk = log.find((l) => l.nom === 't2_kirish_taklif_yarat_v1')!.yuk;
    expect(yuk.p_actor_id).toBe(7);
    expect(yuk.p_telefon).toBe(TEL);
    expect(yuk.p_muddat_soat).toBe(72); // klient 100000 desa ham server chegarasi
    expect(yuk.p_kod_xesh).toBe(await xesh('taklif-kod', j.kod, KALIT, TEL));
    expect(yuk.p_token_xesh).toBe(await xesh('taklif-token', token, KALIT));
    const xom = JSON.stringify(yuk);
    expect(xom).not.toContain(j.kod);
    expect(xom).not.toContain(token);
  });
  it('replay (takror operation_id) → kod qayta ko‘rsatilmaydi', async () => {
    tarmoq({ t2_men_v1: men, t2_kirish_taklif_yarat_v1: () => ({ ok: true, takror: true, taklif_id: 5 }) });
    const r = await post({ amal: 'yarat', kompaniya_id: 17, ism: 'Sinov Odam', telefon: TEL, rol: 'usta', operation_id: '11111111-1111-4111-8111-111111111111' }, { cookie: await sessCookie() });
    const j = await r.json() as Record<string, unknown>;
    expect(j.takror).toBe(true);
    expect(j.kod).toBeUndefined();
    expect(j.havola).toBeUndefined();
  });
  it('SQL rad etsa (rol/ruxsat/limit) → mos status va xabar; kod/havola YO‘Q', async () => {
    for (const [code, status] of [['ROL_NOTOGRI', 400], ['RUXSAT_YOQ', 403], ['LIMIT', 429], ['ALLAQACHON_AZO', 409]] as const) {
      tarmoq({ t2_men_v1: men, t2_kirish_taklif_yarat_v1: () => ({ ok: false, code }) });
      const r = await post({ amal: 'yarat', kompaniya_id: 17, ism: 'Sinov Odam', telefon: TEL, rol: 'superadmin' }, { cookie: await sessCookie() });
      expect(r.status).toBe(status);
      const j = await r.json() as Record<string, unknown>;
      expect(j.ok).toBe(false); expect(j.kod).toBeUndefined(); expect(j.havola).toBeUndefined();
      vakolatKeshTozala();
    }
  });
  it('royxat va bekor: actor sessiyadan; noto‘g‘ri taklif_id → 400', async () => {
    const log = tarmoq({ t2_men_v1: men, t2_kirish_taklif_royxat_v1: () => ({ ok: true, takliflar: [] }), t2_kirish_taklif_bekor_v1: () => ({ ok: true }) });
    const c = await sessCookie(7);
    expect(await (await post({ amal: 'royxat', kompaniya_id: 17 }, { cookie: c })).json()).toEqual({ ok: true, takliflar: [] });
    expect((await post({ amal: 'bekor', kompaniya_id: 17, taklif_id: 'x' }, { cookie: c })).status).toBe(400);
    expect((await post({ amal: 'bekor', kompaniya_id: 17, taklif_id: 9, p_actor_id: 1 }, { cookie: c })).status).toBe(200);
    expect(log.find((l) => l.nom === 't2_kirish_taklif_bekor_v1')!.yuk).toEqual({ p_actor_id: 7, p_kompaniya_id: 17, p_taklif_id: 9 });
  });
});

describe('qabul — kirmasdan', () => {
  it('havola formati yoki telefon+kod yetishmasa → TAKLIF_RAD (bazaga yetmaydi)', async () => {
    const log = tarmoq({});
    for (const b of [{ amal: 'qabul', parol: 'Parol-12345' }, { amal: 'qabul', token: 'qisqa', parol: 'Parol-12345' }, { amal: 'qabul', telefon: TEL, kod: '123', parol: 'Parol-12345' }, { amal: 'qabul', telefon: 'yoq', kod: '12345678', parol: 'Parol-12345' }]) {
      const r = await post(b); expect(r.status).toBe(400);
      expect(((await r.json()) as { code: string }).code).toBe('TAKLIF_RAD');
    }
    expect(log).toHaveLength(0);
  });
  it('parol kodning o‘ziga teng → rad (bazaga yetmaydi); parol yo‘q → PAROL_QISQA', async () => {
    const log = tarmoq({});
    expect(((await (await post({ amal: 'qabul', telefon: TEL, kod: '12345678', parol: '12345678' })).json()) as { code: string }).code).toBe('PAROL_KOD');
    expect(((await (await post({ amal: 'qabul', token: TOKEN })).json()) as { code: string }).code).toBe('PAROL_QISQA');
    expect(log).toHaveLength(0);
  });
  it('mavjud va mavjud bo‘lmagan telefon uchun javob AYNAN bir xil (TAKLIF_RAD), baza xeshni telefonga bog‘lab oladi', async () => {
    const log = tarmoq({ t2_kirish_taklif_qabul_v1: () => ({ ok: false, code: 'TAKLIF_RAD' }) });
    const a = await post({ amal: 'qabul', telefon: '+998901111111', kod: '12345678', parol: 'Yaxshi-Parol-77' });
    const b = await post({ amal: 'qabul', telefon: '+998902222222', kod: '12345678', parol: 'Yaxshi-Parol-77' });
    expect(a.status).toBe(b.status);
    expect(await a.json()).toEqual(await b.json());
    expect(a.headers.get('Set-Cookie')).toBeNull();
    // kod xeshi telefon kontekstida: bir xil kod boshqa telefonda boshqa xesh
    expect(log[0].yuk.p_kod_xesh).not.toBe(log[1].yuk.p_kod_xesh);
    expect(log[0].yuk.p_kod_xesh).toBe(await xesh('taklif-kod', '12345678', KALIT, '+998901111111'));
  });
  it('muddati o‘tgan / ishlatilgan / bloklangan (SQL TAKLIF_RAD) → 400, cookie yo‘q', async () => {
    tarmoq({ t2_kirish_taklif_qabul_v1: () => ({ ok: false, code: 'TAKLIF_RAD' }) });
    const r = await post({ amal: 'qabul', token: TOKEN, parol: 'Yaxshi-Parol-77' });
    expect(r.status).toBe(400);
    expect(r.headers.get('Set-Cookie')).toBeNull();
  });
  it('HISOB_BOR → 409 (jim ulanmaydi, cookie yo‘q)', async () => {
    tarmoq({ t2_kirish_taklif_qabul_v1: () => ({ ok: false, code: 'HISOB_BOR' }) });
    const r = await post({ amal: 'qabul', token: TOKEN, parol: 'Yaxshi-Parol-77' });
    expect(r.status).toBe(409);
    expect(r.headers.get('Set-Cookie')).toBeNull();
  });
  it('muvaffaqiyat: oddiy sess cookie (HttpOnly/Secure/SameSite=Lax), rol AYNAN bazadan; token faqat xesh bo‘lib ketadi', async () => {
    const log = tarmoq({ t2_kirish_taklif_qabul_v1: () => ({ ok: true, foydalanuvchi_id: 42, login: TEL, rol: 'usta', azoliklar: [{ kompaniya_id: 17, rol: 'usta' }] }) });
    const r = await post({ amal: 'qabul', token: TOKEN, parol: 'Yaxshi-Parol-77', rol: 'boss', p_rol: 'admin' });
    expect(r.status).toBe(200);
    const ck = r.headers.get('Set-Cookie')!;
    expect(ck).toMatch(/^sess=.+; HttpOnly; Secure; SameSite=Lax; Path=\/; Max-Age=\d+$/);
    const s = await tekshir(ck, KALIT);
    expect(s).toMatchObject({ rol: 'usta', foydalanuvchi_id: 42, email: TEL, kompaniyalar: [{ kompaniya_id: 17, rol: 'usta' }] });
    const yuk = log[0].yuk;
    expect(Object.keys(yuk).sort()).toEqual(['p_ip_belgi', 'p_kod_xesh', 'p_operation_id', 'p_parol', 'p_telefon', 'p_token_xesh']); // rol parametri YO'Q
    expect(yuk.p_token_xesh).toBe(await xesh('taklif-token', TOKEN, KALIT));
    expect(JSON.stringify(yuk)).not.toContain(TOKEN);
  });
});

describe('ulash — faqat mavjud hisobning o‘z sessiyasi bilan', () => {
  it('sessiyasiz → 401 (jim ulanmaydi)', async () => {
    const log = tarmoq({});
    expect((await post({ amal: 'ulash', token: TOKEN })).status).toBe(401);
    expect(log).toHaveLength(0);
  });
  it('sessiya bilan: actor sessiyadan, yangi a‘zolik cookie ga kiradi', async () => {
    const log = tarmoq({ t2_men_v1: men, t2_kirish_taklif_ulash_v1: () => ({ ok: true, kompaniya_id: 18, rol: 'usta', azoliklar: [{ kompaniya_id: 17, rol: 'boss' }, { kompaniya_id: 18, rol: 'usta' }] }) });
    const r = await post({ amal: 'ulash', token: TOKEN, p_actor_id: 1 }, { cookie: await sessCookie(7) });
    expect(r.status).toBe(200);
    expect(log.find((l) => l.nom === 't2_kirish_taklif_ulash_v1')!.yuk.p_actor_id).toBe(7);
    const s = await tekshir(r.headers.get('Set-Cookie'), KALIT);
    expect(s?.foydalanuvchi_id).toBe(7);
    expect(s?.kompaniyalar).toHaveLength(2);
  });
});
