// @vitest-environment jsdom
/** Egasi 2026-10-27: tizim sahifalari to'g'ridan-to'g'ri URL bilan ham faqat platforma superadminiga ochiladi (sintetik kontekst). */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const k = vi.hoisted(() => ({ superadmin: false, yuklanmoqda: false }));
vi.mock('./KompaniyaKontekst', () => ({ useKompaniya: () => ({ ...k, joriyId: 17, joriy: { id: 17, permissions: ['company.read', 'control.company.read', 'control.global.read'] } }) }));
vi.mock('./KompaniyaKerak', () => ({ KompaniyaKerak: () => <div>kutilmoqda</div> }));
vi.mock('../../api/t2-authz', () => ({ useAuthorize: () => ({ isLoading: false, isError: false, data: { allowed: true } }) }));
vi.mock('./chiqish', () => ({ tizimdanChiq: vi.fn() }));

import { RuxsatGuard } from './RuxsatGuard';

const ochish = (yol: string) => render(
  <MemoryRouter initialEntries={[yol]}>
    <Routes><Route path="/admin" element={<RuxsatGuard />}><Route path="*" element={<div>TIZIM-MAZMUNI</div>} /></Route></Routes>
  </MemoryRouter>,
);
const TIZIM = ['/admin/system-control', '/admin/sayt-xaritasi', '/admin/boshqaruv', '/admin/fayl-boglash', '/admin/test/tizim', '/admin/_demo/system-control'];

afterEach(() => { cleanup(); k.superadmin = false; k.yuklanmoqda = false; });

describe('RuxsatGuard — tizim marshrutlari', () => {
  it.each(TIZIM)('kompaniya bossi %s ni URL bilan ochsa — «Ruxsat yo‘q», mazmun chizilmaydi', (yol) => {
    ochish(yol);
    expect(screen.queryByText('TIZIM-MAZMUNI')).toBeNull();
    expect(screen.getByText(/Ruxsat yo/)).toBeTruthy();
  });

  it.each(TIZIM)('superadmin %s ni ochadi', (yol) => {
    k.superadmin = true;
    ochish(yol);
    expect(screen.getByText('TIZIM-MAZMUNI')).toBeTruthy();
  });

  it('kontekst yuklanayotganda tizim mazmuni chizilmaydi', () => {
    k.yuklanmoqda = true;
    ochish('/admin/system-control');
    expect(screen.queryByText('TIZIM-MAZMUNI')).toBeNull();
  });

  it('kompaniyaning o‘z sahifalari (tokenlar, kompaniya) bossga ochiq', () => {
    for (const yol of ['/admin/tokenlar', '/admin/kompaniya']) {
      ochish(yol);
      expect(screen.getByText('TIZIM-MAZMUNI'), yol).toBeTruthy();
      cleanup();
    }
  });
});
