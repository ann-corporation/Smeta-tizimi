import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { htmldanKirishSkripti, korilmaganlar, saqlanmaganIsh, saqlanmaganIshBormi, versiyaKuzatuvi, yangiliklarniAjrat } from './versiya';

describe('«Nima yangi» (egasi 2026-10-25: versiya almashganda nima o‘zgarganini aytsin)', () => {
  const r = yangiliklarniAjrat({ yozuvlar: [{ id: 1, sana: 'a', sarlavha: 'eski', bandlar: ['x'] }, { id: 3, sana: 'c', sarlavha: 'yangi', bandlar: ['z'] }, { id: 'yomon' }, { id: 2, sana: 'b', sarlavha: 'o‘rta', bandlar: ['y', 5] }] });
  it('yozuvlar tekshiriladi va id bo‘yicha kamayish tartibida', () => {
    expect(r.map((x) => x.id)).toEqual([3, 2, 1]);
    expect(r[1].bandlar).toEqual(['y']);
    expect(yangiliklarniAjrat(null)).toEqual([]);
  });
  it('faqat ko‘rilmaganlar; ko‘rilgan noma’lum bo‘lsa — faqat eng yangisi', () => {
    expect(korilmaganlar(r, 1).map((x) => x.id)).toEqual([3, 2]);
    expect(korilmaganlar(r, 3)).toEqual([]);
    expect(korilmaganlar(r, null).map((x) => x.id)).toEqual([3]);
  });
  it('public/yangiliklar.json yaroqli: id lar takrorlanmaydi, har yozuvda sarlavha va kamida bitta band bor', () => {
    const json = JSON.parse(readFileSync(resolve(__dirname, '../../public/yangiliklar.json'), 'utf8'));
    const y = yangiliklarniAjrat(json);
    expect(y.length).toBe(json.yozuvlar.length);
    expect(new Set(y.map((x) => x.id)).size).toBe(y.length);
    for (const x of y) { expect(x.sarlavha.trim()).not.toBe(''); expect(x.bandlar.length).toBeGreaterThan(0); }
  });
});

afterEach(() => { saqlanmaganIsh('test', false); document.getElementById('yangi-versiya-banner')?.remove(); vi.unstubAllGlobals(); });

describe('versiya kuzatuvi', () => {
  it('index.html dan kirish skripti xeshi olinadi', () => {
    expect(htmldanKirishSkripti('<script type="module" crossorigin src="/assets/index-mU6HDLPt.js"></script>')).toBe('/assets/index-mU6HDLPt.js');
    expect(htmldanKirishSkripti('<script src="/src/main.tsx"></script>')).toBeNull();
  });
});

describe('saqlanmagan ish himoyasi (egasi sinovi 2026-10-06: deploy F2 import ishini o‘chirib yubordi)', () => {
  it('saqlanmagan ish bo‘lsa eski chunk xatosida sahifa avtomatik yangilanmaydi, banner chiqadi', () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    versiyaKuzatuvi();
    saqlanmaganIsh('test', true);
    window.dispatchEvent(new Event('vite:preloadError'));
    expect(reload).not.toHaveBeenCalled();
    expect(document.getElementById('yangi-versiya-banner')?.textContent).toContain('Avval joriy ishingizni saqlang');
  });
  it('sahifani tark etishda ogohlantiradi; ish tugagach ogohlantirish olib tashlanadi', () => {
    saqlanmaganIsh('test', true);
    expect(saqlanmaganIshBormi()).toBe(true);
    const e = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    saqlanmaganIsh('test', false);
    const e2 = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(e2);
    expect(e2.defaultPrevented).toBe(false);
  });
});
