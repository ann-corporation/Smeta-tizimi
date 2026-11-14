import { describe, expect, it } from 'vitest';
import { qidiruvVariantlari } from './katalog';
import { sorovBoshlangichOqi, sorovHavolasi, yetkazishHavolasi } from './havola';

describe('qidiruv variantlari', () => {
  it('lotin so\'z kirill va ruscha ildizlarni qo\'shadi', () => {
    const v = qidiruvVariantlari('gisht');
    expect(v).toContain('gisht');
    expect(v.some((x) => x.includes('кирпич'))).toBe(true);
  });
  it('bo\'sh qidiruv bo\'sh ro\'yxat', () => { expect(qidiruvVariantlari('  ')).toEqual([]); });
});

describe('bozor havolalari', () => {
  it('zayavka qatoridan so\'rov havolasi qayta o\'qiladi', () => {
    const h = sorovHavolasi({ nom: 'Sement M400', birlik: 'tonna', hajm: 12.5, zayavka_id: 7, obyekt_id: 3 });
    const q = sorovBoshlangichOqi(new URLSearchParams(h.split('?')[1]));
    expect(q).toMatchObject({ nom: 'Sement M400', birlik: 'tonna', hajm: 12.5, zayavka_id: 7, obyekt_id: 3, tur: 'tovar' });
    expect(sorovBoshlangichOqi(new URLSearchParams('nom=x'))).toBeNull();
  });
  it('yetkazish havolasi hajmni faqat tonnada uzatadi (hisob yo\'q)', () => {
    expect(yetkazishHavolasi({ nom: 'Sement', hajm: 5, birlik: 'tonna' })).toContain('tonna=5');
    expect(yetkazishHavolasi({ nom: 'Sement', hajm: 5, birlik: 'qop' })).not.toContain('tonna');
  });
});
