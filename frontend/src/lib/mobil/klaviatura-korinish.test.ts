import { afterEach, describe, expect, it, vi } from 'vitest';
import { klaviaturaKorinishiniUla } from './klaviatura-korinish';

const matchMediaQoy = (coarse: boolean) => {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: coarse && q.includes('coarse'), media: q, addEventListener() {}, removeEventListener() {} }));
};

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); document.body.innerHTML = ''; });

describe('klaviatura ko\'rinishi', () => {
  it('teginish ekranida fokusdagi maydon pastda qolsa uni suradi', () => {
    vi.useFakeTimers(); matchMediaQoy(true);
    const input = document.createElement('input'); document.body.append(input);
    const sur = vi.fn(); input.scrollIntoView = sur;
    input.getBoundingClientRect = () => ({ top: 5000, bottom: 5040, left: 0, right: 10, width: 10, height: 40, x: 0, y: 5000, toJSON() {} });
    const ochir = klaviaturaKorinishiniUla(window);
    input.focus(); window.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(300);
    expect(sur).toHaveBeenCalledWith({ block: 'center', inline: 'nearest' });
    ochir();
  });

  it('maydon ko\'rinib tursa surmaydi', () => {
    vi.useFakeTimers(); matchMediaQoy(true);
    const input = document.createElement('input'); document.body.append(input);
    const sur = vi.fn(); input.scrollIntoView = sur;
    input.getBoundingClientRect = () => ({ top: 10, bottom: 50, left: 0, right: 10, width: 10, height: 40, x: 0, y: 10, toJSON() {} });
    const ochir = klaviaturaKorinishiniUla(window);
    input.focus(); window.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(300);
    expect(sur).not.toHaveBeenCalled();
    ochir();
  });

  it('sichqonchali (desktop) ekranda hech narsa qilmaydi', () => {
    vi.useFakeTimers(); matchMediaQoy(false);
    const input = document.createElement('input'); document.body.append(input);
    const sur = vi.fn(); input.scrollIntoView = sur;
    input.getBoundingClientRect = () => ({ top: 5000, bottom: 5040, left: 0, right: 10, width: 10, height: 40, x: 0, y: 5000, toJSON() {} });
    klaviaturaKorinishiniUla(window);
    input.focus(); window.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(300);
    expect(sur).not.toHaveBeenCalled();
  });
});
