import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const res = vi.hoisted(() => ({ sbKadrlarOl: vi.fn(), sbTexnikalarOl: vi.fn(), sbKadrYarat: vi.fn(), sbTexnikaYarat: vi.fn(), sbResursBekor: vi.fn() }));
const tasdiq = vi.hoisted(() => ({ tasdiqSora: vi.fn() }));
vi.mock('./KompaniyaTanlov', () => ({ useKompaniya: () => ({ joriy: { id: 17, nom: 'Test MChJ' } }) }));
vi.mock('../api/t2-resurs', () => res);
vi.mock('../umumiy/ui/Tasdiq', () => tasdiq);
vi.mock('../umumiy/ui/Toast', () => ({ toast: vi.fn() }));
vi.mock('../api/entity-consistency', () => ({ onEntityChanged: () => () => undefined }));

import TestErp from './TestErp';

const texnika = (id: number, nomi: string) => ({ id, nomi, davlat_raqami: null, versiya: 1, obyektlar: [] });

beforeEach(() => {
  Object.values(res).forEach((f) => f.mockReset());
  tasdiq.tasdiqSora.mockReset();
  res.sbKadrlarOl.mockResolvedValue({ qatorlar: [] });
  /* Server ro'yxati o'chirishdan keyin ham eski qatorni qaytaradi (kesh) — qator baribir darhol ketishi kerak. */
  res.sbTexnikalarOl.mockResolvedValue({ qatorlar: [texnika(1, 'Ekskavator A'), texnika(2, 'Kran B')] });
});
afterEach(cleanup);

const ochish = (yol: string) => render(
  <MemoryRouter initialEntries={[yol]}>
    <Routes>
      <Route path="/admin/erp" element={<TestErp />} />
      <Route path="/admin/hr" element={<div>HR YAGONA RO‘YXAT</div>} />
    </Routes>
  </MemoryRouter>,
);

describe('ERP: xodimlar ro‘yxati yagona (/admin/hr)', () => {
  it('?modul=kadrlar eski havolasi /admin/hr ga yo‘naltiriladi', async () => {
    ochish('/admin/erp?modul=kadrlar');
    expect(await screen.findByText('HR YAGONA RO‘YXAT')).toBeTruthy();
    expect(res.sbKadrlarOl).not.toHaveBeenCalled();
  });

  it('«Xodimlar» tabi HR sahifasiga olib boradi', async () => {
    ochish('/admin/erp');
    await screen.findByText('Ekskavator A');
    fireEvent.click(screen.getByRole('tab', { name: /Xodimlar/ }));
    expect(await screen.findByText('HR YAGONA RO‘YXAT')).toBeTruthy();
  });
});

describe('ERP: olib tashlash tasdig‘i', () => {
  it('tasdiq oynasida ikkita bir xil «Bekor qilish» yo‘q; qator qo‘lda yangilamasdan ketadi', async () => {
    tasdiq.tasdiqSora.mockResolvedValue(true);
    res.sbResursBekor.mockResolvedValue({ ok: true });
    ochish('/admin/erp?modul=texnika');
    await screen.findByText('Ekskavator A');
    fireEvent.click(screen.getAllByTitle(/Bekor qilish|Olib tashlash/)[0]);
    await waitFor(() => expect(tasdiq.tasdiqSora).toHaveBeenCalled());
    const a = tasdiq.tasdiqSora.mock.calls[0][0] as { sarlavha: string; tasdiqMatni: string; bekorMatni: string };
    expect(a.tasdiqMatni).not.toBe(a.bekorMatni);
    expect(a.sarlavha).not.toBe(a.bekorMatni);
    await waitFor(() => expect(screen.queryByText('Ekskavator A')).toBeNull());
    expect(screen.getByText('Kran B')).toBeTruthy();
  });
});
