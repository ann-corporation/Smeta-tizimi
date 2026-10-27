import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { sintetikGraf } from '../../lib/tizim-xaritasi.fixture';

const m = vi.hoisted(() => ({
  ruxsat: { isLoading: false, data: { ruxsat: false, superadmin: false } as { ruxsat: boolean; superadmin: boolean } | undefined },
  ol: vi.fn(),
  royxat: vi.fn(),
}));
vi.mock('../../api/t2-tizim-xaritasi', () => ({
  useTizimRuxsat: () => m.ruxsat,
  tizimXaritasiOl: m.ol,
  tizimRuxsatRoyxat: m.royxat,
  tizimFoydalanuvchiQidir: vi.fn(async () => ({ ok: true, natija: [] })),
  tizimRuxsatBer: vi.fn(),
  tizimRuxsatOl: vi.fn(),
}));

import TizimXaritasi from './TizimXaritasi';

beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
});
beforeEach(() => {
  m.ol.mockReset();
  m.royxat.mockReset();
  m.ol.mockResolvedValue({ ok: true, natija: sintetikGraf() });
  m.royxat.mockResolvedValue({ ok: true, natija: [{ foydalanuvchi_id: 9, login: 'sinov', ism: 'Sinov Kuzatuvchi', holat: 'faol', berilgan_by: 1, berilgan_by_nom: 'Super', berildi: '2026-10-27T10:00:00Z', izoh: null }] });
});

const chiz = () => render(<MemoryRouter><TizimXaritasi /></MemoryRouter>);

describe('TizimXaritasi sahifasi', () => {
  it('ruxsat yo‘q (masalan boss) — «ruxsat yo‘q», ma’lumot SO‘RALMAYDI', () => {
    m.ruxsat = { isLoading: false, data: { ruxsat: false, superadmin: false } };
    chiz();
    expect(screen.getByTestId('tizim-ruxsat-yoq')).toBeTruthy();
    expect(m.ol).not.toHaveBeenCalled();
  });

  it('ruxsat tekshirilayotganda ham ma’lumot so‘ralmaydi', () => {
    m.ruxsat = { isLoading: true, data: undefined };
    chiz();
    expect(m.ol).not.toHaveBeenCalled();
  });

  it('grant olgan foydalanuvchi: xarita, panel va oxirgi hodisalar; ruxsat boshqaruvi yo‘q', async () => {
    m.ruxsat = { isLoading: false, data: { ruxsat: true, superadmin: false } };
    chiz();
    await waitFor(() => expect(screen.getByTestId('tizim-panel')).toBeTruthy());
    expect(m.ol).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('heading', { name: 'Tizim xaritasi' })).toBeTruthy();
    const lenta = screen.getByTestId('tizim-hodisalar');
    expect(within(lenta).getByText(/statement timeout/)).toBeTruthy();
    expect(screen.getByTestId('tizim-malumot-yoq').textContent).toMatch(/Deploy holati/);
    expect(screen.getByTestId('tizim-yangilandi').textContent).toMatch(/yangilandi/);
    expect(screen.queryByRole('button', { name: /Ruxsatlar/ })).toBeNull();
    // Hodisani bosish — modul tanlanadi, panelda xato va navbat.
    fireEvent.click(within(lenta).getByText(/statement timeout/));
    await waitFor(() => expect(screen.getByTestId('tizim-xatolar')).toBeTruthy());
    expect(screen.getByText('3 ta ish navbatda')).toBeTruthy();
    expect(screen.getByRole('link', { name: /F2 sahifasini ochish/ }).getAttribute('href')).toBe('/admin/f2-reestr');
  });

  it('server rad etsa (grant olingan) — «ruxsat yo‘q»ga o‘tadi', async () => {
    m.ruxsat = { isLoading: false, data: { ruxsat: true, superadmin: false } };
    m.ol.mockResolvedValue({ ok: false, code: 'AUTHORIZATION_DENIED', error: 'AUTHORIZATION_DENIED' });
    chiz();
    await waitFor(() => expect(screen.getByTestId('tizim-ruxsat-yoq')).toBeTruthy());
  });

  it('superadmin: ruxsatlar bo‘limi (ro‘yxat)', async () => {
    m.ruxsat = { isLoading: false, data: { ruxsat: true, superadmin: true } };
    chiz();
    await waitFor(() => expect(screen.getByTestId('tizim-panel')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Ruxsatlar/ }));
    await waitFor(() => expect(screen.getByText('Sinov Kuzatuvchi')).toBeTruthy());
    expect(m.royxat).toHaveBeenCalledTimes(1);
  });
});
