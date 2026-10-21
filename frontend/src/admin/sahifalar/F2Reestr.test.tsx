import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import F2Reestr from './F2Reestr';

const mocks = vi.hoisted(() => ({ company: { joriy: { id: 17 }, yuklanmoqda: false }, fayllar: vi.fn() }));
vi.mock('../../umumiy/kontekst/KompaniyaKontekst', () => ({ useKompaniya: () => mocks.company }));
vi.mock('../../api/t2-f2-reestr', () => ({
  f2ReestrOl: async () => ({
    obyektlar: [{ id: 140, nom: 'Yevropa oshxonasi', loyiha_id: 7, jami: 5_000_000, narxsiz: 3 }, { id: 150, nom: 'Karting', loyiha_id: null, jami: null, narxsiz: 0 }],
    aktlar: [
      { id: 293, obyekt_id: 140, oy: '2026-06-01', raqam: null, holat: 'tasdiqlangan', lifecycle_status: 'approved', hujjat_jami: 1_200_000, farq: 0, qator_soni: 167, narxsiz_qator: 0, manba: 'import', import_job_id: 31, hujjat_id: 328 },
      { id: 290, obyekt_id: 140, oy: '2026-08-01', raqam: null, holat: 'qoralama', lifecycle_status: 'draft', hujjat_jami: null, farq: null, qator_soni: 336, narxsiz_qator: 2, manba: 'import', import_job_id: 28, hujjat_id: 325 },
      { id: 300, obyekt_id: 140, oy: '2026-09-01', raqam: '5', holat: 'qoralama', lifecycle_status: 'draft', hujjat_jami: 10, farq: 0, qator_soni: 4, narxsiz_qator: 0, manba: 'tizim', import_job_id: null, hujjat_id: null },
    ],
    shartnomalar: new Map(), loyihalar: new Map([[7, 'Navoiy bog‘']]), manbaXato: 0,
    faylNomlari: new Map([[328, '6703_ALL_01.xlsx']]),
  }),
  obyektF2Fayllari: mocks.fayllar,
}));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it('kompaniya F2 reestri: obyekt qatori, shartnomasiz ogohlantirish, ochilganda aktlar manbasi va aktsiz fayllar', async () => {
  mocks.fayllar.mockResolvedValue([{ id: '328', filename: '6703_ALL_01.xlsx', type: 'f2_akt', updatedAt: '2026-10-21T00:00:00Z' },
    { id: '400', filename: 'yangi_import.xlsx', type: 'f2_akt', updatedAt: '2026-10-21T00:00:00Z' }]);
  render(<MemoryRouter><F2Reestr /></MemoryRouter>);
  expect(await screen.findByText('Yevropa oshxonasi')).toBeTruthy();
  expect(screen.getByText('Navoiy bog‘')).toBeTruthy();
  expect(screen.getAllByText('Shartnoma biriktirilmagan').length).toBeGreaterThan(0);
  expect(screen.getByText('Karting')).toBeTruthy();
  fireEvent.click(screen.getByText('Yevropa oshxonasi'));
  expect(await screen.findByText(/6703_ALL_01\.xlsx/)).toBeTruthy();          // import akti fayl nomi bilan
  expect(screen.getByText(/hujjat №325/)).toBeTruthy();                       // almashgan hujjat — raqami bilan
  expect(screen.getByText('Tizimda yasalgan')).toBeTruthy();
  expect(await screen.findByText(/yangi_import\.xlsx/)).toBeTruthy();         // akt yozilmagan import fayli
  expect(mocks.fayllar).toHaveBeenCalledWith(17, 140);
  expect(screen.getByText('Obyektning F2 tarixini ochish').closest('a')?.getAttribute('href')).toBe('/admin/f2-tarix?obyekt=140');
});
