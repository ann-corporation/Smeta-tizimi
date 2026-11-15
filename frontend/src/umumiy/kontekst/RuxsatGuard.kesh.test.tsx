// @vitest-environment jsdom
/** QA 2026-11-15: telefonda «Ruxsat tekshirilmoqda…» bo'sh ekran — skelet + sessiya keshi; xavfsizlik saqlanadi. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const az = vi.hoisted(() => ({ v: { isLoading: true, isError: false, isSuccess: false, data: undefined as undefined | { allowed: boolean; reason?: string } } }));
vi.mock('./KompaniyaKontekst', () => ({ useKompaniya: () => ({ superadmin: false, yuklanmoqda: false, joriyId: 17, joriy: { id: 17, permissions: ['company.read'] } }) }));
vi.mock('./KompaniyaKerak', () => ({ KompaniyaKerak: () => <div>kutilmoqda</div> }));
vi.mock('../../api/t2-authz', () => ({ useAuthorize: () => az.v }));
vi.mock('./chiqish', () => ({ tizimdanChiq: vi.fn() }));

import { RuxsatGuard, ruxsatKeshYoz, ruxsatKeshOqi } from './RuxsatGuard';

const ochish = () => render(
  <MemoryRouter initialEntries={['/admin/fakt']}>
    <Routes><Route path="/admin" element={<RuxsatGuard />}><Route path="*" element={<div>MAZMUN</div>} /></Route></Routes>
  </MemoryRouter>,
);

beforeEach(() => { sessionStorage.clear(); az.v = { isLoading: true, isError: false, isSuccess: false, data: undefined }; });
afterEach(cleanup);

describe('RuxsatGuard — yuklanish holati', () => {
  it('kesh yo‘q: skelet chiziladi, mazmun va matnli spinner yo‘q (ma’lumot ruxsatsiz chizilmaydi)', () => {
    ochish();
    expect(screen.getByTestId('ruxsat-skelet')).toBeTruthy();
    expect(screen.queryByText('MAZMUN')).toBeNull();
    expect(screen.queryByText(/Ruxsat tekshirilmoqda/)).toBeNull();
  });

  it('sessiyada ruxsat tasdiqlangan: mazmun darhol chiziladi', () => {
    ruxsatKeshYoz(17, true);
    ochish();
    expect(screen.getByText('MAZMUN')).toBeTruthy();
  });

  it('eskirgan kesh (TTL) hisobga olinmaydi', () => {
    sessionStorage.setItem('fz-ruxsat-ok:17', String(Date.now() - 11 * 60 * 1000));
    expect(ruxsatKeshOqi(17)).toBe(false);
    ochish();
    expect(screen.queryByText('MAZMUN')).toBeNull();
  });

  it('server rad etsa — keshga qaramay «Ruxsat yo‘q» va kesh o‘chadi', () => {
    ruxsatKeshYoz(17, true);
    az.v = { isLoading: false, isError: false, isSuccess: true, data: { allowed: false, reason: 'PERMISSION_DENIED' } };
    ochish();
    expect(screen.queryByText('MAZMUN')).toBeNull();
    expect(screen.getByText(/Ruxsat yo/)).toBeTruthy();
    expect(ruxsatKeshOqi(17)).toBe(false);
  });

  it('server ruxsat bersa — kesh yoziladi', () => {
    az.v = { isLoading: false, isError: false, isSuccess: true, data: { allowed: true } };
    ochish();
    expect(screen.getByText('MAZMUN')).toBeTruthy();
    expect(ruxsatKeshOqi(17)).toBe(true);
  });
});
