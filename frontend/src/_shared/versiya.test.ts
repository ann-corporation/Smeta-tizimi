import { afterEach, describe, expect, it, vi } from 'vitest';
import { htmldanKirishSkripti, saqlanmaganIsh, saqlanmaganIshBormi, versiyaKuzatuvi } from './versiya';

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
