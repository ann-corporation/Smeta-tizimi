import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { RasmiyVaraq, rasmiyKitob, type RasmiyUstun } from './index';

const U: RasmiyUstun[] = [
  { sarlavha: '№', kenglik: 6, tur: 'tartib' }, { sarlavha: 'Шифр', kenglik: 12, tur: 'kod' }, { sarlavha: 'Наименование', kenglik: 40, tur: 'matn' },
  { sarlavha: 'Ед.изм', kenglik: 8, tur: 'birlik' }, { sarlavha: 'Кол-во', kenglik: 10, tur: 'hajm' }, { sarlavha: 'Сумма', kenglik: 14, tur: 'pul' },
];
const rows = (kattaHarf?: boolean) => {
  const v = new RasmiyVaraq({ nom: 'S', sarlavha: 'ЛОКАЛЬНАЯ СМЕТА', ustunlar: U, ...(kattaHarf === undefined ? {} : { kattaHarf }) });
  v.bolim('Раздел 1. Fundament (beton ishlari)');
  v.qator('oddiy', [1, 'e6-1-1-1', 'Устройство бетонной подготовки', 'м3', 4.5, { f: 'E4*1000', v: 4500 }]);
  v.qator('jami', ['', '', 'Итого по разделу', 'сум', null, 4500]);
  return XLSX.utils.sheet_to_json<string[]>(XLSX.read(rasmiyKitob([v]).bytes).Sheets.S, { header: 1, raw: false, defval: '' }).map(r => r.join('|'));
};

describe('smeta hujjatlarining asosiy qatorlari — to‘liq katta harfda (egasi 2026-10-14)', () => {
  it('bo‘lim, shifr, nom va birlik katta harfda; son va formula o‘zgarmaydi', () => {
    const r = rows();
    expect(r.some(x => x.startsWith('РАЗДЕЛ 1. FUNDAMENT (BETON ISHLARI)'))).toBe(true);
    expect(r.some(x => x.includes('E6-1-1-1|УСТРОЙСТВО БЕТОННОЙ ПОДГОТОВКИ|М3|4.5|4,500'))).toBe(true);
    expect(r.some(x => x.includes('ИТОГО ПО РАЗДЕЛУ|СУМ'))).toBe(true);
  });
  it('smeta bo‘lmagan varaq kattaHarf:false bilan matnni o‘zgartirmaydi', () => {
    expect(rows(false).some(x => x.includes('Устройство бетонной подготовки|м3'))).toBe(true);
  });
});
