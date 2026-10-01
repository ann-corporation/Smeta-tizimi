import { describe, expect, it } from 'vitest';
import { aosrReestrXlsx, labReestrXlsx } from './ijro-reestr-export';
import { hujjatTekshir } from './hujjat-yozuvchi';

describe('Ijro reestrlari — bo‘sh hujjat', () => {
  it('AOSR reestri bo‘sh bo‘lsa ham yaroqli workbook qaytaradi', () => {
    const { bytes, faylNomi } = aosrReestrXlsx([], { obyektNomi: 'X', sana: '2026-10-01' });

    expect(faylNomi).toBe('X_РЕЕСТР_АОСР_2026-10-01.xlsx');
    expect(hujjatTekshir(bytes).taqiqlangan).toEqual([]);
  });

  it('LAB reestri bo‘sh bo‘lsa ham yaroqli workbook qaytaradi', () => {
    const { bytes, faylNomi } = labReestrXlsx([], { obyektNomi: 'X', sana: '2026-10-01' });

    expect(faylNomi).toBe('X_РЕЕСТР_ЛАБ_ПРОТОКОЛОВ_2026-10-01.xlsx');
    expect(hujjatTekshir(bytes).taqiqlangan).toEqual([]);
  });
});
