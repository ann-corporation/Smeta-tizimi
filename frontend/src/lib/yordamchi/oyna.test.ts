import { describe, expect, it } from 'vitest';
import { amalRejim, CHEKKA, MIN_H, MIN_W, olchamlash, oynaKaliti, oynaOqi, oynaTekshir, oynaYoz, SUKUT_OYNA, surish, suzuvchiRect, telefonmi, yonOlcham, yonSukut } from './oyna';

const VW = 1440; const VH = 900;

describe('Jarvis oynasi holati', () => {
  it('sukut: kichik, pastki o‘ngda; ekranga sig‘adi', () => {
    const o = oynaTekshir(null, VW, VH);
    expect(o.rejim).toBe('kichik');
    const r = suzuvchiRect(o, VW, VH);
    expect(r.left + r.width).toBeLessThanOrEqual(VW - CHEKKA);
    expect(r.top + r.height).toBeLessThanOrEqual(VH - CHEKKA);
    expect(r.left + r.width).toBe(VW - 24);
  });

  it('yon panel sukut kengligi ~40% va chegarada', () => {
    expect(yonSukut(1440)).toBe(576);
    expect(yonSukut(800)).toBe(360);
    expect(yonSukut(3000)).toBe(900);
  });

  it('sudrash ekrandan chiqarmaydi', () => {
    const o = oynaTekshir({ rejim: 'kichik', x: 100, y: 100 }, VW, VH);
    const a = surish(o, -5000, -5000, VW, VH);
    expect(a.x).toBe(CHEKKA); expect(a.y).toBe(CHEKKA);
    const b = surish(o, 5000, 5000, VW, VH);
    expect(b.x).toBe(VW - o.w - CHEKKA); expect(b.y).toBe(VH - o.h - CHEKKA);
  });

  it('o‘lcham: minimumdan kichik va ekrandan katta bo‘lmaydi', () => {
    const o = oynaTekshir({ x: 200, y: 100 }, VW, VH);
    const k = olchamlash(o, -9999, -9999, VW, VH);
    expect(k.w).toBe(MIN_W); expect(k.h).toBe(MIN_H);
    const c = olchamlash(o, 9999, 9999, VW, VH);
    expect(c.x! + c.w).toBeLessThanOrEqual(VW - CHEKKA); expect(c.y! + c.h).toBeLessThanOrEqual(VH - CHEKKA);
  });

  it('yon panel kengligi chapga tortilganda kengayadi, chegarada qoladi', () => {
    const o = oynaTekshir({ rejim: 'yon' }, VW, VH);
    expect(yonOlcham(o, -100, VW).yonW).toBe(o.yonW + 100);
    expect(yonOlcham(o, 5000, VW).yonW).toBe(360);
    expect(yonOlcham(o, -5000, VW).yonW).toBe(900);
  });

  it('telefonda doim to‘liq ekran; torayib ketgan ekranda yon panel to‘liqqa o‘tadi', () => {
    expect(telefonmi(390)).toBe(true);
    expect(amalRejim({ ...SUKUT_OYNA, rejim: 'kichik' }, 390)).toBe('toliq');
    expect(amalRejim({ ...SUKUT_OYNA, rejim: 'yon' }, 1440)).toBe('yon');
    expect(amalRejim({ ...SUKUT_OYNA, rejim: 'yon' }, 660)).toBe('toliq');
    expect(amalRejim({ ...SUKUT_OYNA, rejim: 'kichik' }, 1440)).toBe('kichik');
  });

  it('foydalanuvchi bo‘yicha eslab qolinadi; buzuq qiymat sukutga qaytadi; kichik ekranga qisiladi', () => {
    const xotira = new Map<string, string>();
    const st = { getItem: (k: string) => xotira.get(k) ?? null, setItem: (k: string, v: string) => { xotira.set(k, v); } };
    oynaYoz(oynaKaliti(7), { rejim: 'yon', x: 50, y: 60, w: 500, h: 500, yonW: 600 }, st);
    expect(oynaOqi(oynaKaliti(7), VW, VH, st).rejim).toBe('yon');
    expect(oynaOqi(oynaKaliti(7), VW, VH, st).yonW).toBe(600);
    expect(oynaOqi(oynaKaliti(8), VW, VH, st).rejim).toBe('kichik');     // boshqa foydalanuvchi — sukut
    xotira.set(oynaKaliti(9), '{buzuq');
    expect(oynaOqi(oynaKaliti(9), VW, VH, st)).toEqual(oynaTekshir(null, VW, VH));
    const kichikEkran = oynaTekshir({ x: 5000, y: 5000, w: 5000, h: 5000 }, 800, 600);
    expect(kichikEkran.w).toBeLessThanOrEqual(800 - 2 * CHEKKA);
    expect(kichikEkran.x! + kichikEkran.w).toBeLessThanOrEqual(800);
  });
});
