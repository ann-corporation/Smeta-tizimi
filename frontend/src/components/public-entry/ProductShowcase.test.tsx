import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ProductShowcase } from './ProductShowcase';
import { productScreens } from './product-screens';
afterEach(cleanup);
const screens = productScreens.map(s => ({ src: s.src, alt: s.title[0], caption: s.caption[0] }));
const props = { screens, title: 'Haqiqiy ekranlar', note: 'Haqiqiy lavha', expand: 'Katta ko‘rish', close: 'Qayta bosing', start: 'Hisob ochish', onStart: vi.fn() };
describe('Haqiqiy mahsulot lavhalari', () => {
  it('uch haqiqiy lokal asset bilan boshlanadi, caption va lazy image mavjud', () => {
    render(<ProductShowcase {...props} />);
    expect(productScreens).toHaveLength(3);
    expect(new Set(productScreens.map(s => s.src)).size).toBe(3);
    const img = screen.getByRole('img', { name: screens[0].alt });
    expect(img.getAttribute('src')).toBe(screens[0].src);
    expect(img.getAttribute('loading')).toBe('lazy');
    expect(screen.getByText(screens[0].caption)).toBeTruthy();
  });
  it('tanlov tasvir, izoh va faol tugmani birga almashtiradi', () => {
    render(<ProductShowcase {...props} />);
    fireEvent.click(screen.getByRole('button', { name: `02${screens[1].alt}` }));
    expect(screen.getByRole('img', { name: screens[1].alt }).getAttribute('src')).toBe(screens[1].src);
    expect(screen.getByText(screens[1].caption)).toBeTruthy();
    expect(screen.getByRole('button', { name: `02${screens[1].alt}` }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByText(screens[0].caption)).toBeNull();
  });
  it('oldingi/keyingi lavha aylanishi va auth CTA ishlaydi', () => {
    const onStart = vi.fn(); render(<ProductShowcase {...props} onStart={onStart} />);
    fireEvent.click(screen.getByRole('button', { name: screens[2].alt }));
    expect(screen.getByText('3 / 3')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: screens[0].alt }));
    expect(screen.getByText('1 / 3')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Hisob ochish' }));
    expect(onStart).toHaveBeenCalledOnce();
  });
  it('native details kattalashtirish klaviatura orqali ham ishlaydi va bo‘sh massiv crash qilmaydi', () => {
    const { rerender } = render(<ProductShowcase {...props} />);
    expect(document.querySelector('details summary')?.textContent).toBe('Katta ko‘rish');
    expect(screen.getByRole('img', { name: `${screens[0].alt} — Katta ko‘rish`, hidden: true }).getAttribute('src')).toBe(screens[0].src);
    rerender(<ProductShowcase {...props} screens={[]} />);
    expect(document.querySelector('figure')).toBeNull();
  });
});
