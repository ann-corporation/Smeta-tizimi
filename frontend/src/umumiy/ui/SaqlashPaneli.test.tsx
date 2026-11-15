import { describe, expect, it, vi, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { SaqlashPaneli } from './SaqlashPaneli';
import { sinovUlagichOrnat } from './tasdiq-yadro';

afterEach(() => { cleanup(); sinovUlagichOrnat(null); });

const Joy = () => <span data-testid="joy">{useLocation().pathname}</span>;
function Sahifa({ soni, saqla, bekor }: { soni: number; saqla: () => unknown; bekor?: () => void }) {
  return <MemoryRouter initialEntries={['/a']}>
    <Routes><Route path="*" element={<><Link to="/b">Boshqa</Link><Joy /><SaqlashPaneli kalit="t" soni={soni} saqla={saqla} bekor={bekor} /></>} /></Routes>
  </MemoryRouter>;
}

describe('SaqlashPaneli', () => {
  it('toza bo‘lsa ko‘rinmaydi; o‘zgarish bo‘lsa soni bilan chiqadi', () => {
    const { rerender } = render(<Sahifa soni={0} saqla={vi.fn()} />);
    expect(screen.queryByRole('region')).toBeNull();
    rerender(<Sahifa soni={3} saqla={vi.fn()} />);
    expect(screen.getByRole('region').textContent).toContain('3');
    expect((screen.getByRole('button', { name: /Saqlash/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('Saqlash tugmasi va Ctrl+S bitta saqlash funksiyasini chaqiradi (preventDefault)', async () => {
    const saqla = vi.fn().mockResolvedValue(true);
    render(<Sahifa soni={2} saqla={saqla} />);
    fireEvent.click(screen.getByRole('button', { name: /Saqlash/ }));
    await waitFor(() => expect(saqla).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole('region').getAttribute('data-holat')).toBe('saqlandi'));
    const e = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, cancelable: true, bubbles: true });
    await act(async () => { window.dispatchEvent(e); });
    expect(e.defaultPrevented).toBe(true);
    await waitFor(() => expect(saqla).toHaveBeenCalledTimes(2));
  });

  it('Esc o‘zgarishlarni tashlamaydi; Bekor qilish — chaqiriladi', () => {
    const bekor = vi.fn();
    render(<Sahifa soni={1} saqla={vi.fn()} bekor={bekor} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(bekor).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Bekor qilish/ }));
    expect(bekor).toHaveBeenCalledTimes(1);
  });

  it('saqlash xatosi panelda aytiladi (role=alert), qayta urinish mumkin', async () => {
    const saqla = vi.fn().mockRejectedValue(new Error('Server rad etdi'));
    render(<Sahifa soni={1} saqla={saqla} />);
    fireEvent.click(screen.getByRole('button', { name: /Saqlash/ }));
    expect((await screen.findByRole('alert')).textContent).toContain('Server rad etdi');
    expect((screen.getByRole('button', { name: /Saqlash/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('saqlash false qaytarsa — «Saqlandi» ko‘rsatilmaydi', async () => {
    const saqla = vi.fn().mockResolvedValue(false);
    render(<Sahifa soni={1} saqla={saqla} />);
    fireEvent.click(screen.getByRole('button', { name: /Saqlash/ }));
    await waitFor(() => expect(saqla).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole('region').getAttribute('data-holat')).toBe('bosh'));
  });

  it('saqlanmagan ish bor: ichki havola dialog so‘raydi — «Qolish» joyida qoldiradi, «Chiqish» o‘tkazadi', async () => {
    render(<Sahifa soni={2} saqla={vi.fn()} />);
    sinovUlagichOrnat({ tasdiq: () => false });
    fireEvent.click(screen.getByText('Boshqa'));
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByTestId('joy').textContent).toContain('/a');
    sinovUlagichOrnat({ tasdiq: () => true });
    fireEvent.click(screen.getByText('Boshqa'));
    await waitFor(() => expect(screen.getByTestId('joy').textContent).toContain('/b'));
  });

  it('toza bo‘lsa havola so‘ramasdan o‘tadi', async () => {
    render(<Sahifa soni={0} saqla={vi.fn()} />);
    sinovUlagichOrnat({ tasdiq: () => false });
    fireEvent.click(screen.getByText('Boshqa'));
    await waitFor(() => expect(screen.getByTestId('joy').textContent).toContain('/b'));
  });

  it('saqlanmagan ish bor: beforeunload bekor qilinadi', () => {
    render(<Sahifa soni={1} saqla={vi.fn()} />);
    const e = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
  });
});
