import { describe, expect, it } from 'vitest';
import { NAV_SAHIFALAR } from '../nav/navReestr';
import { pultAsboblar } from '../mindmap-pult';
import { barchaVositalar, pultVositalar, modelSxemasidaYoqlari, navVositalar, STATIK_VOSITALAR, yordamMatni } from './vositalar-reestr';

describe('vositalar reestri', () => {
  it('navReestrning har sahifasi uchun navigatsiya vositasi bor (avtomatik)', () => {
    const v = navVositalar();
    expect(v.length).toBe(NAV_SAHIFALAR.length);
    for (const s of NAV_SAHIFALAR) expect(v.some((x) => x.manba === s.yol)).toBe(true);
  });
  it('model sxemasidagi har bir o‘qish/amal reestrda yozilgan', () => {
    expect(modelSxemasidaYoqlari()).toEqual([]);
  });
  it('har yozuv vositasi tasdiqsiz emas; pulli — ikkinchi tasdiq', () => {
    for (const v of STATIK_VOSITALAR.filter((x) => x.tur === 'yozuv')) expect(v.tasdiq).not.toBe('yoq');
    expect(STATIK_VOSITALAR.find((x) => x.id === 'yozuv.narx_tuzat')?.tasdiq).toBe('kartaPul');
  });
  it('vosita id lari takrorlanmaydi', () => {
    const id = barchaVositalar().map((v) => v.id);
    expect(new Set(id).size).toBe(id.length);
  });
  it('yordam matni reestrdan quriladi', () => {
    expect(yordamMatni([{ yol: '/admin/fakt', nom: 'Fakt' }])).toContain('1 ta bo‘lim');
  });
});

describe('mindmap pult amallari reestrda', () => {
  it('pultAsboblar() ning har amali yozuv vositasi sifatida (tasdiqli) reestrda', () => {
    const v = pultVositalar();
    expect(v.length).toBe(pultAsboblar().length);
    expect(v.length).toBeGreaterThan(0);
    for (const x of v) { expect(x.tur).toBe('yozuv'); expect(x.tasdiq).not.toBe('yoq'); expect(x.id.startsWith('mindmap.')).toBe(true); }
    const id = barchaVositalar().map((x) => x.id);
    expect(new Set(id).size).toBe(id.length);
  });
});
