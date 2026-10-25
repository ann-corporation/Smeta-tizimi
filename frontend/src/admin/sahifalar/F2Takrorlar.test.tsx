import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { F2Takrorlar } from './F2Takrorlar';
import { F2DublikatPanel } from './F2DublikatPanel';
import type { ReestrMalumot } from '../../api/t2-f2-reestr';

afterEach(cleanup);
const akt = (id: number, obyekt_id: number, raqam: string | null, hujjat_jami: number | null, holat = 'tasdiqlangan') =>
  ({ id, obyekt_id, oy: '2026-09-01', raqam, holat, lifecycle_status: null, hujjat_jami, farq: 0, qator_soni: 1, narxsiz_qator: 0, manba: 'tizim' as const });
const malumot: ReestrMalumot = {
  obyektlar: [1, 2, 3].map((id) => ({ id, nom: `Fast Food ${id}`, loyiha_id: null, jami: null, narxsiz: null })),
  aktlar: [akt(10, 1, '49', 100), akt(11, 2, '49', 200), akt(12, 3, '49', 300), akt(20, 1, '35', 5_000), akt(21, 1, '35-П', -5_000)],
  shartnomalar: new Map([1, 2, 3].map((id) => [id, [{ id: 26, raqam: '26', nom: null, jami_nds_bilan: null, summa_bez_nds: null }]] as const)),
  loyihalar: new Map(), manbaXato: 0, faylNomlari: new Map(),
};

it('reestr «Takrorlar»: №49 ×3 bir shartnomada va tuzatish juftligi ko‘rinadi', () => {
  render(<MemoryRouter><F2Takrorlar malumot={malumot} /></MemoryRouter>);
  expect(screen.getByText(/1 ta guruh tekshirilsin/)).toBeTruthy();
  expect(screen.getByText('№49')).toBeTruthy();
  expect(screen.getByText('№35-П')).toBeTruthy();
  expect(screen.getAllByText('asl').length).toBe(1);
});

it('reestr «Takrorlar»: takror yo‘q bo‘lsa shuni aytadi', () => {
  render(<MemoryRouter><F2Takrorlar malumot={{ ...malumot, aktlar: [akt(1, 1, '1', 10), akt(2, 2, '2', 20)] }} /></MemoryRouter>);
  expect(screen.getByText('takror topilmadi')).toBeTruthy();
});

it('dublikat paneli: blok — qizil alert + yangilash havolasi; ogohlantirish — status', () => {
  render(<F2DublikatPanel obyektId={7} yangilaHref={(id) => `/admin/f2?obyekt=7&akt=${id}`} masalalar={[
    { daraja: 'blok', kod: 'manba', aktIdlar: [358], matn: 'BLOK MATN' },
    { daraja: 'ogoh', kod: 'summa', aktIdlar: [1], matn: 'OGOH MATN' },
  ]} />);
  expect(screen.getByRole('alert').textContent).toContain('BLOK MATN');
  expect(screen.getByRole('status').textContent).toContain('OGOH MATN');
  expect(screen.getByRole('link', { name: /akt #358/ }).getAttribute('href')).toBe('/admin/f2?obyekt=7&akt=358');
  expect(screen.queryByRole('link', { name: /akt #1\)/ })).toBeNull();
});