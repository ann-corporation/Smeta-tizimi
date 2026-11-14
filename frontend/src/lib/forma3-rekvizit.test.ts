import { describe, expect, it } from 'vitest';
import { f3KeyingiRaqam, f3Yetishmaydi, zakazchikKontragentdan, type KontragentRek } from './forma3-rekvizit';

const k = (o: Partial<KontragentRek>): KontragentRek => ({ nom: 'ООО Заказчик', inn: '123456789', manzil: 'г. Ташкент', mfo: '00014', hisob_raqam: '2020000', rahbar: 'Иванов И.', mavqe: 'buyurtmachi', ...o });

describe('forma3-rekvizit', () => {
  it('butunlay bo‘sh Заказчик + aynan bitta buyurtmachi — to‘ldiriladi', () => {
    const r = zakazchikKontragentdan({}, [k({}), k({ nom: 'Boshqa', mavqe: 'taminotchi', inn: '9' })]);
    expect(r).toMatchObject({ toliqNom: 'ООО Заказчик', inn: '123456789', rahbar: 'Иванов И.' });
  });
  it('ikkita buyurtmachi — taxmin qilinmaydi', () => {
    const r = zakazchikKontragentdan({}, [k({}), k({ inn: '555', nom: 'Yana' })]);
    expect(r).toEqual({});
  });
  it('INN bo‘yicha mos; mavjud qiymat bosilmaydi, faqat bo‘shlari to‘ldiriladi', () => {
    const r = zakazchikKontragentdan({ inn: '123 456 789', toliqNom: 'Mening nomim', mfo: null }, [k({})]);
    expect(r).toMatchObject({ toliqNom: 'Mening nomim', mfo: '00014', hisobRaqam: '2020000' });
  });
  it('f3Yetishmaydi: nimalar yo‘qligini sanaydi', () => {
    const m = f3Yetishmaydi({ raqam: '', pudratchi: { toliqNom: 'X', inn: '1', hisobRaqam: '1', bank: 'b', mfo: '1', manzil: 'a', rahbar: 'R', boshHisobchi: 'B' }, zakazchik: {}, imzo: {} });
    expect(m).toContain('Номер документа');
    expect(m).toContain('Заказчик: МФО');
    expect(m).toContain('Технадзор (Ф.И.О.)');
    expect(m.some((x) => x.startsWith('Подрядчик'))).toBe(false);
  });
  it('f3KeyingiRaqam: shu yil, bekorlar tashqari, raqamsizlar e‘tiborsiz', () => {
    const l = [
      { raqam: '3', davr_boshi: '2026-05-01' }, { raqam: 'Ф3-7', davr_boshi: '2026-06-01' }, { raqam: '50', davr_boshi: '2025-12-01' },
      { raqam: '99', davr_boshi: '2026-07-01', holat: 'bekor' }, { raqam: null, davr_boshi: '2026-08-01' },
    ];
    expect(f3KeyingiRaqam(l, 2026)).toBe('8');
    expect(f3KeyingiRaqam(l, 2027)).toBe('1');
  });
});
