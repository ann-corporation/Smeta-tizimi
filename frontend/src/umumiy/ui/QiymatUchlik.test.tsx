import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { qiymatUchligi, type UstamaNatija } from '../../lib/ustamali-summa';
import { QiymatUchlik } from './QiymatUchlik';

afterEach(cleanup);
const matn = (id: string) => (screen.getByTestId(id).textContent ?? '').replace(/\s+/g, ' ').trim();
const NAMUNA: UstamaNatija = {
  ustamali: 1_157_000, ndsBilan: 1_295_840, ustamasiz: 1_000_000,
  nomalum: { summa: 0, soni: 0 }, qadamlar: null, zanjir: [], ndsFoiz: 12,
};

describe('QiymatUchlik — obyekt qiymati: QQS bilan katta, ustamali va ustamasiz kichik', () => {
  it('sintetik namuna: asosiy 1 295 840 (QQS bilan), ikkinchi qatorda 1 157 000 va 1 000 000', () => {
    render(<QiymatUchlik q={qiymatUchligi(NAMUNA, 1_000_000)} />);
    expect(matn('summa-qqs')).toBe('QQS bilan 1 295 840.00');
    expect(matn('summa-ustamali')).toBe('ustamali, QQS siz: 1 157 000.00');
    expect(matn('summa-ustamasiz')).toBe('to‘g‘ri xarajat (ustamasiz): 1 000 000.00');
  });

  it('yorliq almashtiriladi (masalan «F2, QQS bilan»)', () => {
    render(<QiymatUchlik q={qiymatUchligi(NAMUNA, 1_000_000)} yorliq="F2, QQS bilan" />);
    expect(matn('summa-qqs-yorliq')).toBe('F2, QQS bilan');
  });

  it('NULL → «—» izoh bilan, hech qachon 0', () => {
    render(<QiymatUchlik q={qiymatUchligi(NAMUNA, null)} />);
    expect(matn('summa-qqs')).toBe('QQS bilan —');
    expect(matn('summa-ustamali')).toBe('ustamali, QQS siz: —');
    expect(matn('summa-ustamasiz')).toBe('to‘g‘ri xarajat (ustamasiz): —');
    expect(document.body.textContent).not.toMatch(/\b0\.00\b/);
    expect(screen.getByTestId('summa-qqs').querySelector('[title]')?.getAttribute('title')).toBe('Manba qiymati yo‘q');
  });

  it('koeffitsient yo‘q — QQS «—», sababi izohda', () => {
    render(<QiymatUchlik q={qiymatUchligi({ ...NAMUNA, ustamali: null, ndsBilan: null, xato: 'KOEF_YOQ' }, 1000)} />);
    expect(matn('summa-qqs')).toBe('QQS bilan —');
    expect(screen.getByTestId('summa-qqs').querySelector('[title]')?.getAttribute('title')).toContain('koeffitsientlari o‘qilmadi');
    expect(matn('summa-ustamasiz')).toContain('1 000.00');
  });

  it('taxminiy: QQS qatori ham, ustamali qatori ham «≈»', () => {
    const q = qiymatUchligi({ ...NAMUNA, ustamali: 1266.64, ndsBilan: 1418.64, ustamasiz: 1000, nomalum: { summa: 500, soni: 1 } }, 1500);
    render(<QiymatUchlik q={q} />);
    expect(matn('summa-qqs')).toBe('QQS bilan ≈ 1 978.64');
    expect(matn('summa-ustamali')).toBe('ustamali, QQS siz: ≈ 1 766.64');
    expect(matn('summa-ustamasiz')).toContain('1 500.00');
  });
});
