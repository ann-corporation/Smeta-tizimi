import { describe, expect, it } from 'vitest';
import { narxSavolimi, vaqtBilan } from './katalog-kontekst';

describe('Jarvis: narx indeksi faqat narx savolida (egasi 2026-10-15)', () => {
  it('aniq narx so‘zi + resurs → narx savoli', () => {
    expect(narxSavolimi('M200 beton narxi qancha?')).toBe(true);
    expect(narxSavolimi('Amfiteatrda M200 beton smetada qanchadan berilgan?')).toBe(true);
    expect(narxSavolimi('Сколько стоит цемент М400?')).toBe(true);
  });
  it('miqdor savoli yoki resurssiz savol — indeks yuklanmaydi', () => {
    expect(narxSavolimi('Omborda sement qancha?')).toBe(false);
    expect(narxSavolimi('Bu sahifa nima uchun kerak?')).toBe(false);
    expect(narxSavolimi('narxlar qayerda?')).toBe(false);
  });
  it('indeks kechiksa javob kutmaydi', async () => {
    expect(await vaqtBilan(new Promise<number[]>(() => {}), 10, [])).toEqual([]);
    expect(await vaqtBilan(Promise.resolve([1]), 1000, [])).toEqual([1]);
  });
});
