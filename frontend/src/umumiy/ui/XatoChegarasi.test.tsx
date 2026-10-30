import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { XatoChegarasi, PanelXatoChegarasi } from './XatoChegarasi';

afterEach(cleanup);

let yiqil = true;
function Mort() { if (yiqil) throw new Error('sinov xatosi'); return <p>ishlayapti</p>; }

describe('XatoChegarasi', () => {
  it('panel yiqilsa faqat o‘sha joyda xabar; qo‘shni kontent ishlayveradi; «Qayta urinish» qayta chizadi', () => {
    const konsol = vi.spyOn(console, 'error').mockImplementation(() => {});
    yiqil = true;
    render(<div><PanelXatoChegarasi nom="sinov"><Mort /></PanelXatoChegarasi><span>qo‘shni panel</span></div>);
    expect(screen.getByRole('alert').textContent).toContain('Bu bo‘limni ko‘rsatib bo‘lmadi');
    expect(screen.getByText('qo‘shni panel')).toBeTruthy();
    yiqil = false;
    fireEvent.click(screen.getByText('Qayta urinish'));
    expect(screen.getByText('ishlayapti')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    konsol.mockRestore();
  });

  it('chunk yuklanmasa faqat «Sahifani yangilash» (keshlangan lazy importga «Qayta urinish» yo‘q)', () => {
    const konsol = vi.spyOn(console, 'error').mockImplementation(() => {});
    function Chunk(): never { throw new TypeError('Failed to fetch dynamically imported module: /assets/X.js'); }
    render(<XatoChegarasi><Chunk /></XatoChegarasi>);
    expect(screen.getByText('Sahifani yangilash')).toBeTruthy();
    expect(screen.queryByText('Qayta urinish')).toBeNull();
    konsol.mockRestore();
  });

  it('kalit (manzil) o‘zgarsa xato o‘zi tozalanadi', () => {
    const konsol = vi.spyOn(console, 'error').mockImplementation(() => {});
    yiqil = true;
    const { rerender } = render(<XatoChegarasi kalit="/a"><Mort /></XatoChegarasi>);
    expect(screen.getByRole('alert').textContent).toContain('Sahifani ko‘rsatib bo‘lmadi');
    yiqil = false;
    rerender(<XatoChegarasi kalit="/b"><Mort /></XatoChegarasi>);
    expect(screen.getByText('ishlayapti')).toBeTruthy();
    konsol.mockRestore();
  });
});
