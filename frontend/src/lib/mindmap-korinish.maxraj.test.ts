import { describe, expect, it } from 'vitest';
import type { MindmapGraf, MindmapTugun } from '../api/t2-mindmap';
import { daraxtQur } from './mindmap-korinish';

/** Sintetik obyekt: asl smeta kichik, qo'shimcha katta (smeta_joriy = asl + o'zgarishlar). Server foizi yo'q (zaxira yo'li). */
const ob = (id: number, meta: Record<string, unknown>): MindmapTugun => ({
  id: 'obyekt:' + id, tur: 'obyekt', nom: 'Obyekt ' + id, x: null, y: null,
  meta: { versiya: 1, loyiha_id: null, belgi: [], fakt: null, f2: null, smeta: 2300, fakt_foiz: null, f2_foiz: null, ...meta } as never,
});
const kompaniya: MindmapTugun = { id: 'kompaniya:1', tur: 'kompaniya', nom: 'K', meta: null, x: null, y: null };
const graf = (...t: MindmapTugun[]): MindmapGraf => ({ tugunlar: [kompaniya, ...t], bogichlar: [], jamlanma: undefined as never });

describe('mindmap foiz maxraji = asl smeta + o‘zgarishlar', () => {
  it('asl kichik + qo‘shimcha katta: F2 5000 / (2300 + 5000) = 68,5 % — 100 % dan oshmaydi; asl smeta ko‘rinishda qoladi', () => {
    const o = daraxtQur(graf(ob(1, { f2: 5000, smeta_joriy: 7300 }))).tugunlar.get('obyekt:1')!;
    expect(o.smeta).toBe(2300);
    expect(o.maxraj).toBe(7300);
    expect(o.f2Foiz).toBeCloseTo(68.49, 1);
    expect(o.f2Foiz!).toBeLessThanOrEqual(100);
  });

  it('joriy noma‘lum (smeta_joriy yo‘q/null): maxraj asl smeta, foiz asl bo‘yicha (NULL ≠ 0, 0 deb olinmaydi)', () => {
    const o = daraxtQur(graf(ob(1, { f2: 5000, smeta_joriy: null }))).tugunlar.get('obyekt:1')!;
    expect(o.maxraj).toBe(2300);
    expect(o.f2Foiz).toBeCloseTo(217.39, 1);
  });

  it('server foizi bor bo‘lsa — o‘sha (server maxraji manba)', () => {
    const o = daraxtQur(graf(ob(1, { f2: 5000, smeta_joriy: 7300, f2_foiz: 68.5, foiz_maxraj: 'joriy' }))).tugunlar.get('obyekt:1')!;
    expect(o.f2Foiz).toBe(68.5);
  });

  it('kompaniya jamlanmasi: maxraj obyektlar maxrajlari yig‘indisi (7300 + 1000), asl 2300 + 1000', () => {
    const d = daraxtQur(graf(ob(1, { f2: 5000, smeta_joriy: 7300 }), ob(2, { smeta: 1000, f2: 500, smeta_joriy: null })));
    const r = [...d.tugunlar.values()].find((x) => x.daraja === 0)!;
    expect(r.smeta).toBe(3300);
    expect(r.maxraj).toBe(8300);
    expect(r.f2Foiz).toBeCloseTo((5500 / 8300) * 100, 1);
  });
});
