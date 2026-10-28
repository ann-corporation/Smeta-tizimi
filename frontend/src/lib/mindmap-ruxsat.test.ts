import { describe, expect, it } from 'vitest';
import { mindmapTahrirRuxsati } from './mindmap-ruxsat';

const joriy = (o: Partial<{ id: number; rol: string; membershipRole: string; permissions: string[] }> = {}) => ({ id: 7, rol: 'pto', permissions: ['document.read', 'document.write'], ...o });

describe('mindmapTahrirRuxsati', () => {
  it('document.write bor — tahrir mumkin', () => {
    expect(mindmapTahrirRuxsati({ joriy: joriy() })).toEqual({ mumkin: true, sabab: null });
  });
  it('document.write yo‘q — yopiq (ruxsat_yoq)', () => {
    expect(mindmapTahrirRuxsati({ joriy: joriy({ permissions: ['document.read'] }) })).toEqual({ mumkin: false, sabab: 'ruxsat_yoq' });
    expect(mindmapTahrirRuxsati({ joriy: joriy({ permissions: [] }) }).mumkin).toBe(false);
  });
  it('rahbar roli — ruxsat bo‘lsa ham yopiq (samarali yoki a’zolik roli)', () => {
    expect(mindmapTahrirRuxsati({ joriy: joriy({ rol: 'rahbar' }) })).toEqual({ mumkin: false, sabab: 'rahbar' });
    expect(mindmapTahrirRuxsati({ joriy: joriy({ membershipRole: 'rahbar' }) })).toEqual({ mumkin: false, sabab: 'rahbar' });
    expect(mindmapTahrirRuxsati({ joriy: joriy({ rol: 'rahbar' }), superadmin: true }).mumkin).toBe(false);
  });
  it('superadmin ruxsatlar ro‘yxatisiz ham yoza oladi (rahbar bo‘lmasa)', () => {
    expect(mindmapTahrirRuxsati({ joriy: joriy({ permissions: [] }), superadmin: true }).mumkin).toBe(true);
  });
  it('kompaniya tanlanmagan — yopiq; boshqa kompaniya xaritasi — yopiq', () => {
    expect(mindmapTahrirRuxsati({ joriy: null })).toEqual({ mumkin: false, sabab: 'ruxsat_yoq' });
    expect(mindmapTahrirRuxsati({ joriy: joriy(), kompaniyaId: 8 })).toEqual({ mumkin: false, sabab: 'boshqa_kompaniya' });
    expect(mindmapTahrirRuxsati({ joriy: joriy(), kompaniyaId: 7 }).mumkin).toBe(true);
  });
  it('ruxsatlar ro‘yxati kelmagan (eski t2_men) — aniqlab bo‘lmaydi: taqiqlanmaydi, server tekshiradi', () => {
    expect(mindmapTahrirRuxsati({ joriy: { id: 7, rol: 'pto' } }).mumkin).toBe(true);
  });
});
