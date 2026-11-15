import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MobilTabPanel } from './MobilTabPanel';

const KORINADI = new Set(['/admin/obyektlar', '/admin/fakt', '/admin/documents']);

function matchMediaOrnat(mobil: boolean) {
  window.matchMedia = ((q: string) => ({ matches: mobil && q.includes('max-width'), media: q, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
}
const chiz = (onMenyu = () => undefined, yol = '/admin/obyektlar') => render(<MemoryRouter initialEntries={[yol]}><MobilTabPanel rol="pto" korinadi={KORINADI} menyuOchiq={false} onMenyu={onMenyu} /></MemoryRouter>);

afterEach(() => cleanup());

describe('MobilTabPanel', () => {
  it('tor ekranda pastki panelni chizadi (rolga mos tablar, faol belgi)', () => {
    matchMediaOrnat(true);
    chiz();
    expect(screen.getByTestId('mobil-tab')).toBeTruthy();
    expect(screen.getByTestId('mobil-tab-/admin/obyektlar').getAttribute('aria-current')).toBe('page');
    expect(screen.getByTestId('mobil-tab-/admin/fakt').getAttribute('href')).toBe('/admin/fakt');
    expect(screen.getByTestId('mobil-tab-jarvis')).toBeTruthy();
    expect(screen.getByTestId('mobil-tab-menyu')).toBeTruthy();
  });

  it('Jarvis tabi faqat Jarvis ochiq paytda faol; yopilgach faqat joriy sahifa tabi faol', async () => {
    matchMediaOrnat(true);
    chiz();
    const faol = () => Array.from(document.querySelectorAll('.mobil-tab__item--faol')).map((e) => e.getAttribute('data-testid'));
    expect(faol()).toEqual(['mobil-tab-/admin/obyektlar']);
    const { act } = await import('@testing-library/react');
    await act(async () => { document.documentElement.setAttribute('data-jarvis-ochiq', '1'); await Promise.resolve(); });
    expect(faol()).toContain('mobil-tab-jarvis');
    await act(async () => { document.documentElement.removeAttribute('data-jarvis-ochiq'); await Promise.resolve(); });
    expect(faol()).toEqual(['mobil-tab-/admin/obyektlar']);
  });

  it('keng ekranda (desktop/planshet) hech nima chizmaydi', () => {
    matchMediaOrnat(false);
    const { container } = chiz();
    expect(container.innerHTML).toBe('');
  });

  it('Jarvis tugmasi ai:ochish hodisasini yuboradi, Menyu tugmasi drawerni ochadi', () => {
    matchMediaOrnat(true);
    const menyu = vi.fn(); const ai = vi.fn();
    window.addEventListener('ai:ochish', ai);
    chiz(menyu);
    fireEvent.click(screen.getByTestId('mobil-tab-jarvis'));
    fireEvent.click(screen.getByTestId('mobil-tab-menyu'));
    window.removeEventListener('ai:ochish', ai);
    expect(ai).toHaveBeenCalledTimes(1);
    expect(menyu).toHaveBeenCalledTimes(1);
  });
});