import { describe, expect, it } from 'vitest';
import { OQISH, YOZISH, oqishYuki, qadamlarniTozala, xatoJavobi, yozishYuki } from './hujjat-aylanish';
import { SCOPED_APIS, requestPermission } from '../_shared/permission-policy';

const U = '123e4567-e89b-42d3-a456-426614174000';

describe('hujjat-aylanish shlyuzi: whitelist', () => {
  it('faqat sanab o‘tilgan RPC lar; hamma nom t2_ bilan va _v1 ga tugaydi', () => {
    for (const nom of [...Object.values(OQISH), ...Object.values(YOZISH)]) expect(nom).toMatch(/^t2_[a-z_]+_v1$/);
    expect(YOZISH.zanjir_qaror).toBe('t2_hujjat_zanjir_qaror_v1');
    expect(YOZISH['t2_obyekt_yoz']).toBeUndefined();
  });
  it('permission siyosatida ro‘yxatga olingan: qaror/qabul document.read, qolgan yozish document.write', () => {
    expect(SCOPED_APIS.has('hujjat-aylanish')).toBe(true);
    const q = new URLSearchParams();
    expect(requestPermission('hujjat-aylanish', 'GET', {}, q)).toBe('document.read');
    expect(requestPermission('hujjat-aylanish', 'POST', { amal: 'zanjir_qaror' }, q)).toBe('document.read');
    expect(requestPermission('hujjat-aylanish', 'POST', { amal: 'xat_qabul' }, q)).toBe('document.read');
    expect(requestPermission('hujjat-aylanish', 'POST', { amal: 'xat_yubor' }, q)).toBe('document.write');
    expect(requestPermission('hujjat-aylanish', 'POST', { amal: 'zanjir_yarat' }, q)).toBe('document.write');
  });
});

describe('yozishYuki', () => {
  it('kompaniya_id majburiy; noma’lum amal rad', () => {
    expect(yozishYuki('xat_qabul', { xat_id: 1 })).toBe('kompaniya_id kerak');
    expect(yozishYuki('uchirish', { kompaniya_id: 1 })).toBe('Amal ochiq emas');
  });
  it('zanjir_yarat: qadamlar tekshiriladi va tozalanadi', () => {
    const y = yozishYuki('zanjir_yarat', { kompaniya_id: 5, hujjat_turi: 'aosr', sarlavha: ' АОСР 1 ', obyekt_id: '7', operation_id: U,
      qadamlar: [{ kompaniya_id: 9, rol: 'texnadzor', muddat: '2026-11-10', ortiqcha: 'x' }, { kompaniya_id: 10, rol: 'buyurtmachi' }] });
    expect(y).toEqual({ p_kompaniya_id: 5, p_hujjat_turi: 'aosr', p_sarlavha: 'АОСР 1', p_obyekt_id: 7, p_document_id: null, p_manba_jadval: null, p_manba_id: null,
      p_qadamlar: [{ kompaniya_id: 9, rol: 'texnadzor', muddat: '2026-11-10' }, { kompaniya_id: 10, rol: 'buyurtmachi' }], p_operation_id: U });
    expect(yozishYuki('zanjir_yarat', { kompaniya_id: 5, hujjat_turi: 'AOSR', sarlavha: 'abc', qadamlar: [{ kompaniya_id: 1, rol: 'xx' }] })).toMatch(/hujjat_turi/);
    expect(yozishYuki('zanjir_yarat', { kompaniya_id: 5, hujjat_turi: 'aosr', sarlavha: 'ab', qadamlar: [{ kompaniya_id: 1, rol: 'xx' }] })).toMatch(/Sarlavha/);
    expect(yozishYuki('zanjir_yarat', { kompaniya_id: 5, hujjat_turi: 'aosr', sarlavha: 'abc', manba_jadval: 'users', qadamlar: [{ kompaniya_id: 1, rol: 'xx' }] })).toMatch(/manba_jadval/);
  });
  it('qadamlar: 1–8, kompaniya_id va rol shart, muddat formati', () => {
    expect(qadamlarniTozala([])).toMatch(/1–8/);
    expect(qadamlarniTozala(Array.from({ length: 9 }, () => ({ kompaniya_id: 1, rol: 'xx' })))).toMatch(/1–8/);
    expect(qadamlarniTozala([{ rol: 'xx' }])).toMatch(/kompaniya_id/);
    expect(qadamlarniTozala([{ kompaniya_id: 1, rol: 'x' }])).toMatch(/rol/);
    expect(qadamlarniTozala([{ kompaniya_id: 1, rol: 'xx', muddat: '10.11.2026' }])).toMatch(/muddat/);
  });
  it('zanjir_qaror: qaror ro‘yxati cheklangan', () => {
    expect(yozishYuki('zanjir_qaror', { kompaniya_id: 1, zanjir_id: 2, qaror: 'o‘chir' })).toMatch(/qaror/);
    expect(yozishYuki('zanjir_qaror', { kompaniya_id: 1, zanjir_id: 2, qaror: 'rad', izoh: ' sabab ' })).toEqual({ p_kompaniya_id: 1, p_zanjir_id: 2, p_qaror: 'rad', p_izoh: 'sabab' });
  });
  it('xat_yubor: tur, mavzu va muddat tekshiriladi; operation_id sessiyasiz uuid bo‘lmasa yangisi', () => {
    const y = yozishYuki('xat_yubor', { kompaniya_id: 1, qabul_kompaniya_id: 2, turi: 'talabnoma', mavzu: 'Muddat', javob_muddati: '2026-11-12', operation_id: 'yomon' }) as Record<string, unknown>;
    expect(y.p_turi).toBe('talabnoma'); expect(y.p_javob_muddati).toBe('2026-11-12'); expect(String(y.p_operation_id)).toMatch(/^[0-9a-f-]{36}$/);
    expect(yozishYuki('xat_yubor', { kompaniya_id: 1, qabul_kompaniya_id: 2, turi: 'spam', mavzu: 'abc' })).toMatch(/turi/);
    expect(yozishYuki('xat_yubor', { kompaniya_id: 1, qabul_kompaniya_id: 2, mavzu: 'a' })).toMatch(/Mavzu/);
    expect(yozishYuki('xat_yubor', { kompaniya_id: 1, qabul_kompaniya_id: 2, mavzu: 'abc', javob_muddati: 'ertaga' })).toMatch(/javob_muddati/);
    expect(yozishYuki('xat_yubor', { kompaniya_id: 1, mavzu: 'abc' })).toMatch(/qabul_kompaniya_id/);
  });
  it('bildirishnoma_oqildi: kompaniyasiz, idlar cheklangan', () => {
    expect(yozishYuki('bildirishnoma_oqildi', { idlar: [1, 2] })).toEqual({ p_idlar: [1, 2] });
    expect(yozishYuki('bildirishnoma_oqildi', { idlar: [] })).toMatch(/idlar/);
    expect(yozishYuki('bildirishnoma_oqildi', { idlar: [-1] })).toMatch(/idlar/);
  });
});

describe('oqishYuki', () => {
  it('bo‘limga xos parametrlar; begona qiymat tashlanadi', () => {
    expect(oqishYuki('kiruvchi', new URLSearchParams('kompaniya_id=3'))).toEqual({ p_kompaniya_id: 3 });
    expect(oqishYuki('kiruvchi', new URLSearchParams())).toBe('kompaniya_id kerak');
    expect(oqishYuki('xatlar', new URLSearchParams('kompaniya_id=3&yonalish=kiruvchi&holat=olindi'))).toEqual({ p_kompaniya_id: 3, p_yonalish: 'kiruvchi', p_holat: 'olindi', p_limit: 100 });
    expect(oqishYuki('xatlar', new URLSearchParams("kompaniya_id=3&yonalish=x&holat=a;drop"))).toEqual({ p_kompaniya_id: 3, p_yonalish: null, p_holat: null, p_limit: 100 });
    expect(oqishYuki('zanjir', new URLSearchParams('kompaniya_id=3'))).toBe('zanjir_id kerak');
    expect(oqishYuki('bildirishnomalar', new URLSearchParams('oqilmagan=1'))).toEqual({ p_faqat_oqilmagan: true, p_limit: 50, p_keyin_id: null });
    expect(oqishYuki('boshqa', new URLSearchParams('kompaniya_id=3'))).toBe('Bo‘lim ochiq emas');
  });
});

describe('xatoJavobi', () => {
  it('rol xatosi 403 va ichki matn sizdirilmaydi', () => {
    const e = xatoJavobi(JSON.stringify({ code: '42501', message: 'HUJJAT_ROL_YETARLI_EMAS: kuzatuvchi roli yozolmaydi' }));
    expect(e.status).toBe(403); expect(e.body.code).toBe('ROL_YETARLI_EMAS'); expect(JSON.stringify(e.body)).not.toContain('kuzatuvchi');
    expect(xatoJavobi(JSON.stringify({ code: '42501', message: 'actor bu kompaniyaning faol a’zosi emas' })).body.code).toBe('AZO_EMAS');
    expect(xatoJavobi(JSON.stringify({ code: 'XX000', message: 'select * from t2_xat' })).status).toBe(502);
  });
});
