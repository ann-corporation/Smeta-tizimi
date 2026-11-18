// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestPost as yukla } from './hujjat-maydoni-yukla';
import { onRequestGet as ol } from './hujjat-maydoni-ol';
import { onRequestPost as amal } from './hujjat-maydoni';
import { onRequestPost as buyruq } from './hujjat-buyruq';
import { onRequestPost as tozala } from './hujjat-maydoni-tozala';
import { imzola } from '../_shared/auth';

const KEY = 'k'.repeat(32);
afterEach(() => vi.unstubAllGlobals());
const UUID = '11111111-2222-4333-8444-555555555555';
const bayt = new TextEncoder().encode('salom disk');

function r2() {
  const put = vi.fn(async () => ({}));
  const get = vi.fn(async () => ({ body: new Blob(['x']).stream() }));
  const del = vi.fn(async () => undefined);
  return { put, get, del, bucket: { put, get, delete: del } as unknown as R2Bucket };
}
const ENV = (bucket: R2Bucket, extra: Record<string, unknown> = {}) => ({ SUPABASE_URL: 'https://a.supabase.co', SUPABASE_KEY: 'k', SESSIYA_KALIT: KEY, R2_CANONICAL: bucket, ...extra });
const kuki = async () => 'sess=' + await imzola({ rol: 'pto', foydalanuvchi_id: 5, kompaniyalar: [{ kompaniya_id: 17, rol: 'pto' }] }, KEY);
function rpcMock(javoblar: Record<string, unknown>) {
  const chaqiruvlar: Array<{ nom: string; args: any }> = [];
  vi.stubGlobal('fetch', vi.fn(async (u: string, init?: RequestInit) => {
    const nom = String(u).split('/rpc/')[1];
    chaqiruvlar.push({ nom, args: init?.body ? JSON.parse(String(init.body)) : null });
    return Response.json((javoblar[nom] as object) ?? { ok: true });
  }));
  return chaqiruvlar;
}
async function yuk(env: ReturnType<typeof ENV>, kuk: string, maydon: Record<string, string> = {}, nom = 'a.pdf') {
  const f = new FormData();
  f.set('fayl', new File([bayt], nom, { type: 'application/pdf' })); f.set('operation_id', UUID);
  for (const [k, v] of Object.entries(maydon)) f.set(k, v);
  return yukla({ request: new Request('https://x/api/hujjat-maydoni-yukla', { method: 'POST', headers: { Cookie: kuk }, body: f }), env } as never);
}

describe('Hujjat maydoni: yuklash (kvota serverda majburan)', () => {
  it('kvota tugagan: 413 + tarif havolasi, R2 ga HECH NARSA yozilmaydi', async () => {
    const c = rpcMock({ t2_hm_yuklash_reserve_v1: { ok: false, code: 'KVOTA_TUGADI', ishlatilgan: 10, limit: 10 } });
    const s = r2();
    const res = await yuk(ENV(s.bucket), await kuki());
    const j = await res.json() as any;
    expect(res.status).toBe(413);
    expect(j).toMatchObject({ ok: false, code: 'KVOTA_TUGADI', tarif_yol: '/admin/tokenlar' });
    expect(j.xato).toMatch(/Tokenlar va obuna/);
    expect(s.put).not.toHaveBeenCalled();
    expect(c.map((x) => x.nom)).toEqual(['t2_hm_yuklash_reserve_v1']);
  });
  it('mijoz yuborgan actor_id/sha256/hajmga ishonilmaydi: aktor sessiyadan, sha256 serverda hisoblanadi', async () => {
    const c = rpcMock({ t2_hm_yuklash_reserve_v1: { ok: true, fayl_id: 1, versiya_id: 9, raqam: 1, r2_kalit: 'docs/17/0/0/f1/r1', yangi: true } });
    const s = r2();
    const res = await yuk(ENV(s.bucket), await kuki(), { actor_id: '999', sha256: 'f'.repeat(64), size: '1', kompaniya_id: '17' });
    expect((await res.json() as any).ok).toBe(true);
    const rez = c.find((x) => x.nom === 't2_hm_yuklash_reserve_v1')!.args;
    expect(rez.p_actor).toBe(5);
    expect(rez.p_bayt).toBe(bayt.byteLength);
    expect(rez.p_sha256).not.toBe('f'.repeat(64));
    expect(rez.p_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(s.put).toHaveBeenCalledTimes(1);
    expect(c.map((x) => x.nom)).toContain('t2_hm_yuklash_tasdiq_v1');
  });
  it('R2 yozish xato bersa: kutish qatori bekor qilinadi (kvota qaytadi), 502', async () => {
    const c = rpcMock({ t2_hm_yuklash_reserve_v1: { ok: true, fayl_id: 1, versiya_id: 9, raqam: 1, r2_kalit: 'docs/17/0/0/f1/r1' } });
    const s = r2(); s.put.mockRejectedValueOnce(new Error('r2 down'));
    const res = await yuk(ENV(s.bucket), await kuki());
    expect(res.status).toBe(502);
    expect(c.map((x) => x.nom)).toContain('t2_hm_yuklash_bekor_v1');
    expect(c.map((x) => x.nom)).not.toContain('t2_hm_yuklash_tasdiq_v1');
  });
  it('taqiqlangan tur (.exe) va sessiyasiz so\u2018rov rad etiladi', async () => {
    rpcMock({}); const s = r2();
    expect((await yuk(ENV(s.bucket), await kuki(), {}, 'virus.exe')).status).toBe(415);
    expect((await yuk(ENV(s.bucket), 'sess=yoq')).status).toBe(401);
    expect(s.put).not.toHaveBeenCalled();
  });
  it('operation_id majburiy', async () => {
    rpcMock({}); const s = r2();
    const f = new FormData(); f.set('fayl', new File([bayt], 'a.pdf'));
    const res = await yukla({ request: new Request('https://x/y', { method: 'POST', headers: { Cookie: await kuki() }, body: f }), env: ENV(s.bucket) } as never);
    expect(res.status).toBe(400);
  });
});

describe('Hujjat maydoni: yuklab olish (kvota to\u2018lgan bo\u2018lsa ham ishlaydi)', () => {
  it('attachment + nosniff; ruxsatni RPC beradi; aktor sessiyadan', async () => {
    const c = rpcMock({ t2_hm_yuklab_v1: { ok: true, kalit: 'docs/17/0/0/f1/r1', nom: 'hisob.html', mime: 'text/html', bayt: 1, sha256: 'a'.repeat(64) } });
    const s = r2();
    const res = await ol({ request: new Request('https://x/api/hujjat-maydoni-ol?id=1&korish=1', { headers: { Cookie: await kuki() } }), env: ENV(s.bucket) } as never);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Disposition')).toMatch(/^attachment/);
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Content-Type')).toBe('application/octet-stream'); // HTML hech qachon inline/html sifatida berilmaydi
    expect(c[0].args.p_actor).toBe(5);
  });
  it('ruxsat yo\u2018q: 403 va R2 ga murojaat qilinmaydi', async () => {
    rpcMock({ t2_hm_yuklab_v1: { ok: false, code: 'RUXSAT_YOQ' } }); const s = r2();
    const res = await ol({ request: new Request('https://x/api/hujjat-maydoni-ol?id=1', { headers: { Cookie: await kuki() } }), env: ENV(s.bucket) } as never);
    expect(res.status).toBe(403); expect(s.get).not.toHaveBeenCalled();
  });
  it('tashqi havola: faqat 64-hex token; bazaga faqat xesh ketadi', async () => {
    const s = r2();
    const yomon = await ol({ request: new Request('https://x/api/hujjat-maydoni-ol?t=abc'), env: ENV(s.bucket) } as never);
    expect(yomon.status).toBe(404);
    const c = rpcMock({ t2_hm_havola_ol_v1: { ok: true, kalit: 'k', nom: 'a.pdf', mime: 'application/pdf', bayt: 1, sha256: 'a'.repeat(64) } });
    const token = 'ab'.repeat(32);
    const res = await ol({ request: new Request('https://x/api/hujjat-maydoni-ol?t=' + token), env: ENV(s.bucket) } as never);
    expect(res.status).toBe(200);
    expect(c[0].args.p_xesh).toMatch(/^[0-9a-f]{64}$/); expect(c[0].args.p_xesh).not.toBe(token);
  });
});

describe('Hujjat maydoni: amallar', () => {
  it('body.actor_id e\u2019tiborsiz; havola yaratilganda token bir marta qaytadi, bazaga xesh', async () => {
    const c = rpcMock({ t2_hm_ulash_v1: { ok: true, ulash_id: 3 } });
    const res = await amal({ request: new Request('https://x/api/hujjat-maydoni', { method: 'POST', headers: { Cookie: await kuki() },
      body: JSON.stringify({ amal: 'ulash', actor_id: 999, p_actor: 999, nishon_turi: 'fayl', nishon_id: 4, subyekt_turi: 'havola', muddat_soat: 24 }) }), env: ENV(r2().bucket) } as never);
    const j = await res.json() as any;
    expect(c[0].args.p_actor).toBe(5);
    expect(c[0].args.p_havola_xesh).toMatch(/^[0-9a-f]{64}$/);
    expect(j.havola).toMatch(/\/api\/hujjat-maydoni-ol\?t=[0-9a-f]{64}$/);
    expect(j.havola).not.toContain(c[0].args.p_havola_xesh);
  });
  it('savatni bo\u2018shatish: R2 kalitlari o\u2018chiriladi, so\u2018ng metama\u2019lumot (RPC huquqni tekshirgan)', async () => {
    const c = rpcMock({ t2_hm_bosh_ol_v1: { ok: true, fayllar: [{ id: 7, kalitlar: ['docs/17/0/0/f7/r1', 'docs/17/0/0/f7/r2'] }], eski: [] } });
    const s = r2();
    const res = await amal({ request: new Request('https://x/api/hujjat-maydoni', { method: 'POST', headers: { Cookie: await kuki() }, body: JSON.stringify({ amal: 'bosh', kompaniya_id: 17, tur: 'savat' }) }), env: ENV(s.bucket) } as never);
    expect(res.status).toBe(200);
    expect(s.del).toHaveBeenCalledTimes(4); // har versiya + uning matn indeksi (.txt)
    expect(s.del).toHaveBeenCalledWith('docs/17/0/0/f7/r2.txt');
    expect(c.map((x) => x.nom)).toEqual(['t2_hm_bosh_ol_v1', 't2_hm_tozala_tasdiq_v1']);
  });
  it('bosh: huquq yo\u2018q bo\u2018lsa R2 ga tegilmaydi', async () => {
    rpcMock({ t2_hm_bosh_ol_v1: { ok: false, code: 'RUXSAT_YOQ' } }); const s = r2();
    const res = await amal({ request: new Request('https://x/api/hujjat-maydoni', { method: 'POST', headers: { Cookie: await kuki() }, body: JSON.stringify({ amal: 'bosh', kompaniya_id: 17 }) }), env: ENV(s.bucket) } as never);
    expect(res.status).toBe(403); expect(s.del).not.toHaveBeenCalled();
  });
});

describe('Jarvis: hujjat-buyruq', () => {
  const sorov = async (body: unknown) => buyruq({ request: new Request('https://x/api/hujjat-buyruq', { method: 'POST', headers: { Cookie: await kuki() }, body: JSON.stringify(body) }), env: ENV(r2().bucket) } as never);
  it('ulashish: tasdiqsiz faqat taklif (RPC chaqirilmaydi); ovoz bilan hech qachon', async () => {
    const c = rpcMock({});
    const t = await (await sorov({ amal: 'vosita', nom: 'fayl_ulash', args: { fayl_id: 1, foydalanuvchi_id: 2 } })).json() as any;
    expect(t).toMatchObject({ ok: true, holat: 'taklif', tasdiqKerak: true }); expect(c).toHaveLength(0);
    const o = await sorov({ amal: 'vosita', nom: 'fayl_ulash', ovoz: true, args: { fayl_id: 1, foydalanuvchi_id: 2, tasdiqlayman: true } });
    expect(o.status).toBe(403); expect(c).toHaveLength(0);
    const ok = await (await sorov({ amal: 'vosita', nom: 'fayl_ulash', args: { fayl_id: 1, foydalanuvchi_id: 2, tasdiqlayman: true } })).json() as any;
    expect(ok.holat).toBe('bajarildi'); expect(c[0].args.p_actor).toBe(5);
  });
  it('actor_id argumenti rad etiladi', async () => {
    rpcMock({});
    expect((await sorov({ amal: 'vosita', nom: 'fayl_qidir', args: { matn: 'smeta', actor_id: 3 } })).status).toBe(400);
  });
});

describe('Kunlik hisob/tozalash endpointi', () => {
  it('cron kalitisiz rad; sozlanmagan 503', async () => {
    rpcMock({});
    const env = ENV(r2().bucket, { BILDIRISHNOMA_CRON_KALIT: 'x'.repeat(40) });
    expect((await tozala({ request: new Request('https://x/t', { method: 'POST' }), env } as never)).status).toBe(403);
    expect((await tozala({ request: new Request('https://x/t', { method: 'POST', headers: { 'X-Cron-Kalit': 'x'.repeat(40) } }), env: ENV(r2().bucket) } as never)).status).toBe(503);
  });
  it('kalit bilan: R2 tozalanadi va hisob chaqiriladi', async () => {
    const c = rpcMock({ t2_hm_tozala_ol_v1: { ok: true, fayllar: [{ id: 1, kalitlar: ['k1'] }], versiyalar: [{ id: 2, kalit: 'k2' }] }, t2_hm_hisobla_v1: { ok: true, hisoblandi: 1, ogohlantirish: 0 } });
    const s = r2(); const kalit = 'x'.repeat(40);
    const res = await tozala({ request: new Request('https://x/t', { method: 'POST', headers: { 'X-Cron-Kalit': kalit } }), env: ENV(s.bucket, { BILDIRISHNOMA_CRON_KALIT: kalit }) } as never);
    expect(res.status).toBe(200); expect(s.del).toHaveBeenCalledTimes(2);
    expect(c.map((x) => x.nom)).toEqual(['t2_hm_tozala_ol_v1', 't2_hm_tozala_tasdiq_v1', 't2_disk_yetim_ishla_v1', 't2_hm_hisobla_v1']); // A2: Disk navbati (yetim hujjatlar) hisobdan oldin
  });
});