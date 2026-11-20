// @ts-nocheck -- node:fs bilan manba matnini tekshiradi; functions tsconfig faqat Workers turlarini ttashiydi.
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { navbatniIshla, type NavbatQator, type YangilaDeps } from './hujjat-yangila';
import { Rad, type F2Tayyor } from './hujjat-f2';
import { boshqaTurMi, oylikManba } from './hujjat-boshqa';

const Q = (o: Partial<NavbatQator> = {}): NavbatQator => ({ id: 1, tur: 'f2', manba_id: 100, kompaniya_id: 17, obyekt_id: 5, urinish: 1, aktor_id: 9, ...o });
const T = (akt: Partial<F2Tayyor['akt']> = {}): F2Tayyor => ({
  bytes: new Uint8Array([1, 2, 3]), faylNomi: 'f2.xlsx', turi: 'f2_hujjat', obyektId: 5, davr: '2031-03', xesh: 'f2:5:2031-03:1', arxivla: true, moliya: null,
  manba: { turi: 'f2', id: 100, kalit: 'f2:100', nom: 'F-2' }, akt: { id: 100, holat: 'qoralama', raqam: '1', ...akt },
});
function deps(qatorlar: NavbatQator[], o: Partial<YangilaDeps> = {}) {
  const tugat = vi.fn(async () => undefined);
  const d: YangilaDeps = {
    ol: async () => qatorlar, tugat, yasaF2: vi.fn(async () => T()),
    yoz: vi.fn(async () => ({ ok: true as const, documentId: 1, disk: { ok: true as const, faylId: 2, versiya: 6, takror: false, yangi: false } })), ...o,
  };
  return { d, tugat };
}

describe('navbatniIshla (fon yasash)', () => {
  it('muvaffaqiyat: yasaydi, Diskka yozadi, navbatni versiya bilan yopadi', async () => {
    const { d, tugat } = deps([Q()]);
    const n = await navbatniIshla(d);
    expect(n).toMatchObject({ korildi: 1, yangilandi: 1, xato: 0 });
    expect(d.yasaF2).toHaveBeenCalledTimes(1);
    expect(tugat).toHaveBeenCalledWith(1, 'ok', null, 6);
  });
  it('bekor va taxminiy F-2 Diskka yozilmaydi (otkazildi)', async () => {
    for (const akt of [{ holat: 'bekor' }, { raqam: 'taxminiy-3' }]) {
      const { d, tugat } = deps([Q()], { yasaF2: async () => T(akt) });
      const n = await navbatniIshla(d);
      expect(n.otkazildi).toBe(1); expect(d.yoz).not.toHaveBeenCalled();
      expect(tugat).toHaveBeenCalledWith(1, 'otkazildi', 'bekor_yoki_taxminiy', null);
    }
  });
  it('retry: yasash xatosi -> xato natijasi (SQL kechikish bilan qayta navbatga qo‘yadi); keyingi qator davom etadi', async () => {
    let i = 0;
    const { d, tugat } = deps([Q({ id: 1 }), Q({ id: 2, manba_id: 101 })], { yasaF2: async () => { if (i++ === 0) throw new Error('MALUMOT_OQILMADI'); return T(); } });
    const n = await navbatniIshla(d);
    expect(n).toMatchObject({ yangilandi: 1, xato: 1 });
    expect(tugat).toHaveBeenCalledWith(1, 'xato', 'MALUMOT_OQILMADI', null);
    expect(tugat).toHaveBeenCalledWith(2, 'ok', null, 6);
  });
  it('Disk yozuvi xatosi - xato (jim emas)', async () => {
    const { d, tugat } = deps([Q()], { yoz: async () => ({ ok: false as const, code: 'R2_XATO' }) });
    expect((await navbatniIshla(d)).xato).toBe(1);
    expect(tugat).toHaveBeenCalledWith(1, 'xato', 'disk:R2_XATO', null);
  });
  it('akt topilmadi (404) qayta urinilmaydi; aktorsiz qator - xato; boshqa tur - o‘tkazildi', async () => {
    const { d, tugat } = deps([Q({ id: 1 }), Q({ id: 2, aktor_id: null }), Q({ id: 3, tur: 'forma3' })], { yasaF2: async () => { throw new Rad(404, 'AKT_TOPILMADI', 'yoq'); } });
    const n = await navbatniIshla(d);
    expect(tugat).toHaveBeenCalledWith(1, 'otkazildi', 'AKT_TOPILMADI', null);
    expect(tugat).toHaveBeenCalledWith(2, 'xato', 'AKTOR_YOQ', null);
    expect(tugat).toHaveBeenCalledWith(3, 'otkazildi', 'tur_qollanmaydi:forma3', null);
    expect(n).toMatchObject({ otkazildi: 2, xato: 1 });
  });
  it('vaqt byudjeti: oshsa qolganlari xato(VAQT_BUDJETI) bilan qaytariladi - qayta uriniladi', async () => {
    let t = 0;
    const { d, tugat } = deps([Q({ id: 1 }), Q({ id: 2 })], { hozir: () => t, yasaF2: async () => { t += 30_000; return T(); } });
    const n = await navbatniIshla(d, { byudjetMs: 20_000 });
    expect(n.yangilandi).toBe(1);
    expect(tugat).toHaveBeenCalledWith(2, 'xato', 'VAQT_BUDJETI', null);
  });
  it('TOKEN yechilmaydi: ishlovchi hujjat-sarf ni umuman import qilmaydi va serverSarfla ni chaqirmaydi', () => {
    for (const f of ['hujjat-yangila.ts', '../api/hujjat-yangila-tick.ts']) {
      const src = readFileSync(new URL(f, import.meta.url), 'utf8');
      expect(src).not.toMatch(/hujjat-sarf|serverSarfla|t2_token_sarfla/);
    }
  });
});

describe('boshqa turlar (F-3, nakopitelniy, M-29, slichitelniy, ostatka)', () => {
  const B = (tur: string, o: Partial<NavbatQator> = {}): NavbatQator => Q({ tur, manba_id: 7, ...o });
  const tayyorB = (o: Partial<F2Tayyor> = {}) => ({ ...T(), turi: 'nakopitelniy', ...o });
  it('har tur o\'z generatori orqali yasaladi, Diskka yoziladi, token yechilmaydi', async () => {
    for (const tur of ['forma3', 'nakopitelniy', 'm29', 'slichitelniy', 'ostatka']) {
      const yasaBoshqa = vi.fn(async () => tayyorB());
      const yozBoshqa = vi.fn(async () => ({ ok: true as const, documentId: 1, disk: { ok: true as const, faylId: 2, versiya: 4, takror: false, yangi: true } }));
      const { d, tugat } = deps([B(tur, { obyekt_id: tur === 'forma3' ? null : 5 })], { yasaBoshqa, yozBoshqa });
      const n = await navbatniIshla(d);
      expect(n, tur).toMatchObject({ yangilandi: 1, xato: 0 });
      expect(yasaBoshqa).toHaveBeenCalledTimes(1); expect(d.yasaF2).not.toHaveBeenCalled();
      expect(tugat).toHaveBeenCalledWith(1, 'ok', null, 4);
    }
  });
  it('bo\'sh hujjat / sotuv F-3 emas -> otkazildi (qayta urinish befoyda); boshqa xato -> xato', async () => {
    for (const kod of ['HUJJAT_BOSH', 'F3_HISOBLANMADI', 'SHARTNOMA_TOPILMADI']) {
      const { d, tugat } = deps([B('m29')], { yasaBoshqa: async () => { throw new Rad(kod === 'SHARTNOMA_TOPILMADI' ? 404 : 409, kod, 'x'); }, yozBoshqa: vi.fn() });
      expect(await navbatniIshla(d)).toMatchObject({ otkazildi: 1, xato: 0 });
      expect(tugat).toHaveBeenCalledWith(1, 'otkazildi', kod, null);
    }
    const { d, tugat } = deps([B('m29')], { yasaBoshqa: async () => { throw new Error('REESTR_OQILMADI'); }, yozBoshqa: vi.fn() });
    expect(await navbatniIshla(d)).toMatchObject({ xato: 1 });
    expect(tugat).toHaveBeenCalledWith(1, 'xato', 'REESTR_OQILMADI', null);
  });
  it('aktor yo\'q -> xato; noma\'lum tur -> otkazildi; manba kodlash SQL bilan bir xil', async () => {
    const { d, tugat } = deps([B('ostatka', { aktor_id: null }), B('notanish', { id: 2 })], { yasaBoshqa: vi.fn(), yozBoshqa: vi.fn() });
    const n = await navbatniIshla(d);
    expect(n).toMatchObject({ xato: 1, otkazildi: 1 });
    expect(tugat).toHaveBeenCalledWith(2, 'otkazildi', 'tur_qollanmaydi:notanish', null);
    expect(boshqaTurMi('m29')).toBe(true); expect(boshqaTurMi('f2')).toBe(false);
    expect(oylikManba(5 * 1_000_000 + 203103)).toEqual({ obyektId: 5, oySon: 203103 });
  });
  it('migratsiya: har tur uchun trigger/kodlash va rollback/acceptance fayllari bor; yangi jadval yaratilmaydi', () => {
    const yol = (e: string) => new URL('../../../supabase/migrations/20270119000501_t2_hujjat_yangila_turlar_v1.' + e, import.meta.url);
    const sql = readFileSync(yol('sql'), 'utf8');
    for (const s of ["'forma3'", "'slichitelniy'", "'ostatka'", "'nakopitelniy'", "'m29'", '1000000']) expect(sql).toContain(s);
    expect(sql).not.toMatch(/create table/i);
    expect(readFileSync(yol('rollback.sql'), 'utf8')).toContain('drop trigger');
    expect(readFileSync(yol('acceptance.sql'), 'utf8')).toContain('OK: hujjat_yangila turlar');
  });
});