import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../_shared/auth', () => ({ tekshir: vi.fn(async () => ({ foydalanuvchi_id: 7 })) }));

import { maydonTozala, onRequestGet, onRequestPost, oqishYuki, yozishYuki } from './laboratoriya';
import { xatoJavobi } from './tomon';
import { SCOPED_APIS, requestPermission } from '../_shared/permission-policy';

const ENV = { SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_KEY: 'service-key', SESSIYA_KALIT: 'a'.repeat(32) };
const post = (body: unknown) => ({ request: new Request('https://x/api/laboratoriya', { method: 'POST', headers: { Cookie: 's=1' }, body: JSON.stringify(body) }), env: ENV }) as never;
const get = (qs: string) => ({ request: new Request('https://x/api/laboratoriya?' + qs, { headers: { Cookie: 's=1' } }), env: ENV }) as never;

afterEach(() => vi.unstubAllGlobals());

describe('laboratoriya shlyuzi — yuklar', () => {
  it('sorov_yarat: tur, muddat va namuna tekshiriladi, actor almashtirib bo‘lmaydi', () => {
    const y = yozishYuki('sorov_yarat', { kompaniya_id: 3, aloqa_id: 5, sinov_turi: 'beton_kub', obyekt_id: 2, aosr_id: 9, namuna_soni: 3, p_actor_id: 99 }) as Record<string, unknown>;
    expect(y).toMatchObject({ p_kompaniya_id: 3, p_aloqa_id: 5, p_sinov_turi: 'beton_kub', p_aosr_id: 9, p_namuna_soni: 3, p_majburiy: true, p_asl_sorov_id: null });
    expect(y).not.toHaveProperty('p_actor_id');
    expect(yozishYuki('sorov_yarat', { kompaniya_id: 3, aloqa_id: 5 })).toMatch(/sinov_turi/);
    expect(yozishYuki('sorov_yarat', { kompaniya_id: 3, aloqa_id: 5, sinov_turi: 'Beton;drop' })).toMatch(/sinov_turi/);
    expect(yozishYuki('sorov_yarat', { kompaniya_id: 3, aloqa_id: 5, sinov_turi: 'elektr', muddat: '10.01.2026' })).toMatch(/muddat/);
    expect(yozishYuki('sorov_yarat', { kompaniya_id: 3, aloqa_id: 5, sinov_turi: 'elektr', namuna_soni: 0 })).toMatch(/namuna/);
    // Qayta sinov: tur asl so'rovdan olinadi.
    expect(yozishYuki('sorov_yarat', { kompaniya_id: 3, aloqa_id: 5, asl_sorov_id: 11 })).toMatchObject({ p_asl_sorov_id: 11, p_sinov_turi: null });
    expect(yozishYuki('sorov_yarat', { kompaniya_id: 3, aloqa_id: 5, sinov_turi: 'elektr', majburiy: false })).toMatchObject({ p_majburiy: false });
  });

  it('natija: faqat mos/mos_emas, maydonlar sodda qiymat, summa son', () => {
    const y = yozishYuki('natija', { kompaniya_id: 4, murojaat_id: 8, versiya: 1, natija: 'mos_emas', protokol_raqam: ' P-7 ', xulosa: 'x', summa: '1 250,50', document_ids: [5],
      maydon: { olchangan_mpa: 20, marka_sinf: ' B25 ', bosh: '' } }) as Record<string, any>;
    expect(y.p_malumot).toMatchObject({ natija: 'mos_emas', protokol_raqam: 'P-7', summa: 1250.5, maydon: { olchangan_mpa: 20, marka_sinf: 'B25' } });
    expect(y.p_malumot.maydon).not.toHaveProperty('bosh');
    expect(y).toMatchObject({ p_murojaat_id: 8, p_kutilgan_versiya: 1, p_document_ids: [5] });
    expect(yozishYuki('natija', { kompaniya_id: 4, murojaat_id: 8, versiya: 1, natija: 'kutilmoqda' })).toMatch(/natija/);
    expect(yozishYuki('natija', { kompaniya_id: 4, murojaat_id: 8, natija: 'mos' })).toMatch(/versiya/);
    expect(yozishYuki('natija', { kompaniya_id: 4, murojaat_id: 8, versiya: 1, natija: 'mos', summa: 'abc' })).toMatch(/summa/);
    expect(yozishYuki('natija', { kompaniya_id: 4, murojaat_id: 8, versiya: 1, natija: 'mos', protokol_sana: '1-1-2026' })).toMatch(/protokol_sana/);
    expect(yozishYuki('natija', { kompaniya_id: 4, murojaat_id: 8, versiya: 1, natija: 'mos', maydon: { a: { b: 1 } } })).toMatch(/matn yoki son|kalit/);
    expect(maydonTozala({ 'Bad Key': 1 })).toMatch(/kalit/);
  });

  it('o‘qish bo‘limlari', () => {
    expect(oqishYuki('royxat', new URLSearchParams('kompaniya_id=3&yonalish=kelgan&holat=ochiq'))).toMatchObject({ p_kompaniya_id: 3, p_yonalish: 'kelgan', p_holat: 'ochiq' });
    expect(oqishYuki('royxat', new URLSearchParams('kompaniya_id=3'))).toMatchObject({ p_yonalish: 'yuborilgan' });
    expect(oqishYuki('tafsilot', new URLSearchParams('kompaniya_id=3'))).toMatch(/murojaat_id/);
    expect(oqishYuki('aosr_holat', new URLSearchParams('kompaniya_id=3&obyekt_id=2'))).toMatchObject({ p_obyekt_id: 2 });
    expect(oqishYuki('yoq', new URLSearchParams('kompaniya_id=3'))).toMatch(/Bo‘lim/);
    expect(oqishYuki('turlar', new URLSearchParams(''))).toMatch(/kompaniya_id/);
  });
});

describe('laboratoriya shlyuzi — ruxsat', () => {
  it('kompaniya doirasida; so‘rov yuborish document.write, qolganlari document.read', () => {
    const q = new URLSearchParams();
    expect(SCOPED_APIS.has('laboratoriya')).toBe(true);
    expect(requestPermission('laboratoriya', 'GET', {}, q)).toBe('document.read');
    expect(requestPermission('laboratoriya', 'POST', { amal: 'sorov_yarat' }, q)).toBe('document.write');
    expect(requestPermission('laboratoriya', 'POST', { amal: 'natija' }, q)).toBe('document.read');
  });
});

describe('laboratoriya shlyuzi — so‘rovlar', () => {
  it('ro‘yxatda ochiq bo‘lmagan amal rad etiladi; RPC ga actor sessiyadan boradi', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([{ id: 1 }]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const yoq = await onRequestPost(post({ amal: 'hammasini_ochir', kompaniya_id: 3 }));
    expect(yoq.status).toBe(400);
    const r = await onRequestGet(get('bolim=royxat&kompaniya_id=3&yonalish=kelgan'));
    expect(r.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/rest/v1/rpc/t2_lab_sorov_royxat_v1');
    expect(JSON.parse(String(init.body))).toMatchObject({ p_actor_id: 7, p_kompaniya_id: 3 });
  });

  it('kutilayotgan sinov xatosi ham tushunarli', () => {
    const e = xatoJavobi(JSON.stringify({ code: '23514', message: 'LAB_SINOV_KUTILMOQDA: sinov natijasi kutilmoqda (Beton)' }));
    expect(e.status).toBe(409);
    expect(e.body).toMatchObject({ ok: false, code: 'LAB_SINOV_KUTILMOQDA' });
  });

  it('АОСР qorovuli xatosi tushunarli javob beradi (ichki matn sizdirilmaydi)', () => {
    const e = xatoJavobi(JSON.stringify({ code: '23514', message: 'LAB_MOS_EMAS: majburiy sinov natijasi mos emas (Beton)' }));
    expect(e.status).toBe(409);
    expect(e.body).toMatchObject({ ok: false, code: 'LAB_MOS_EMAS' });
  });
});
