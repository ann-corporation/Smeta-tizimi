import { describe, expect, it, vi } from 'vitest';

vi.mock('../_shared/auth', () => ({ tekshir: vi.fn(async () => ({ foydalanuvchi_id: 7 })) }));

import { bandlarniTozala, oqishYuki, xatoJavobi, yozishYuki } from './tomon';

const band = { kod: 'b1', nom: 'Himoya qatlami', natija: 'mos_emas', izoh: 'Qatlam 15 mm', document_ids: [11, 12] };

describe('tomon shlyuzi: texnik nazorat', () => {
  it('tekshiruv_yoz: bandlar tozalanadi, ortiqcha maydon tushadi', () => {
    const y = yozishYuki('tekshiruv_yoz', { kompaniya_id: 3, obyekt_id: 9, aloqa_id: 4, ish_turi: 'Beton ishlari', bandlar: [{ ...band, xavfli: 'x' }], yakunla: true });
    expect(y).toMatchObject({ p_kompaniya_id: 3, p_obyekt_id: 9, p_aloqa_id: 4, p_yakunla: true, p_muddat_kun: null });
    expect((y as { p_bandlar: unknown[] }).p_bandlar[0]).toEqual({ kod: 'b1', nom: 'Himoya qatlami', natija: 'mos_emas', izoh: 'Qatlam 15 mm', muhimlik: 'yuqori', document_ids: [11, 12] });
  });
  it('tekshiruv_yoz: noto‘g‘ri kirishlar rad', () => {
    expect(yozishYuki('tekshiruv_yoz', { kompaniya_id: 3, ish_turi: 'Beton', bandlar: [] })).toBe('obyekt_id kerak');
    expect(yozishYuki('tekshiruv_yoz', { kompaniya_id: 3, obyekt_id: 9, ish_turi: 'B', bandlar: [] })).toBe('Ish turi kerak');
    expect(yozishYuki('tekshiruv_yoz', { kompaniya_id: 3, obyekt_id: 9, ish_turi: 'Beton', bandlar: [], muddat_kun: 99 })).toMatch(/muddat_kun/);
    expect(typeof bandlarniTozala([{ kod: 'a', nom: 'Band', natija: 'xato' }])).toBe('string');
    expect(typeof bandlarniTozala([{ kod: 'a', nom: 'Band', natija: 'mos', document_ids: ['x'] }])).toBe('string');
    expect(typeof bandlarniTozala(new Array(81).fill(band))).toBe('string');
  });
  it('aosr_foto: 1–20 ta foto', () => {
    expect(yozishYuki('aosr_foto', { kompaniya_id: 3, aosr_id: 5, document_ids: [1, 2] })).toEqual({ p_kompaniya_id: 3, p_aosr_id: 5, p_document_ids: [1, 2] });
    expect(yozishYuki('aosr_foto', { kompaniya_id: 3, aosr_id: 5, document_ids: [] })).toMatch(/document_ids/);
  });
  it('o‘qish bo‘limlari', () => {
    expect(oqishYuki('nazorat_uy', new URLSearchParams('kompaniya_id=3'))).toEqual({ p_kompaniya_id: 3 });
    expect(oqishYuki('tekshiruvlar', new URLSearchParams('kompaniya_id=3&dan=2026-11-01&gacha=bad'))).toMatchObject({ p_dan: '2026-11-01', p_gacha: null, p_limit: 200 });
    expect(oqishYuki('tekshiruv', new URLSearchParams('kompaniya_id=3'))).toBe('tekshiruv_id kerak');
    expect(oqishYuki('aosr_korik', new URLSearchParams('kompaniya_id=3&taqdim_id=8'))).toEqual({ p_kompaniya_id: 3, p_taqdim_id: 8 });
    expect(oqishYuki('f2_tekshiruv', new URLSearchParams('kompaniya_id=3'))).toMatch(/taqdim_id/);
    expect(oqishYuki('f2_tekshiruv', new URLSearchParams('kompaniya_id=3&akt_id=2'))).toEqual({ p_kompaniya_id: 3, p_taqdim_id: null, p_akt_id: 2 });
  });
  it('predpisaniya xatosi tushunarli javob', () => {
    const e = xatoJavobi(JSON.stringify({ code: '22023', message: 'PREDPISANIYA_XATO: x' }));
    expect(e.status).toBe(409);
    expect(e.body.code).toBe('PREDPISANIYA_XATO');
  });
});
