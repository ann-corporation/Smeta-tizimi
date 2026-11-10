import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const m = vi.hoisted(() => ({
  ws: { companyId: 7 as number | null, scope: { objectId: 5 as number | null }, objects: [{ id: 5, jami: 1000, narxsiz: 0 }], scopeSearch: (id: number | null) => `?obyekt=${id}` },
  akt: vi.fn(), davom: vi.fn(),
}));
vi.mock('../../umumiy/kontekst/PTOWorkspaceContext', () => ({ usePTOWorkspace: () => m.ws }));
vi.mock('../../api/supabase', () => ({ sbT2AktReestrOl: m.akt }));
vi.mock('../../api/t2-f2-davom', () => ({ f2DavomRoyxatOl: m.davom }));
import { ObyektQadamlari } from './ObyektQadamlari';

const akt = (o: Record<string, unknown>) => ({ tur: 'fakt', holat: 'tasdiqlangan', oy: '2026-11-01', yaratildi: '2026-11-03T00:00:00Z', hujjat_jami: 1, yozilgan_jami: 1, ...o });
const chiz = (joriy?: 'fakt' | 'f2-yasash' | 'f2-import' | 'hujjatlar') => render(<MemoryRouter><ObyektQadamlari joriy={joriy} /></MemoryRouter>);

afterEach(() => { cleanup(); m.ws = { companyId: 7, scope: { objectId: 5 }, objects: [{ id: 5, jami: 1000, narxsiz: 0 }], scopeSearch: (id) => `?obyekt=${id}` }; vi.clearAllMocks(); });

describe('ObyektQadamlari (B0 qadam chizig‘i)', () => {
  it('obyekt tanlanmagan — hech narsa chizilmaydi', () => {
    m.ws.scope.objectId = null; m.akt.mockResolvedValue({ ok: true, qatorlar: [] }); m.davom.mockResolvedValue({ ok: true, qatorlar: [] });
    const { container } = chiz();
    expect(container.innerHTML).toBe('');
  });

  it('4 qadam, hammasi scope bilan havola; joriy qadam belgilanadi; ma‘lumotsiz chip ham tugma ham yo‘q', () => {
    m.akt.mockReturnValue(new Promise(() => undefined)); m.davom.mockReturnValue(new Promise(() => undefined));
    chiz('f2-yasash');
    const havolalar = screen.getAllByRole('link');
    expect(havolalar.map((a) => a.getAttribute('href'))).toEqual([
      '/admin/fakt?obyekt=5', '/admin/f2-tayyorlash?obyekt=5', '/admin/f2?obyekt=5', '/admin/nakopitelniy?obyekt=5',
    ]);
    expect(havolalar[1].getAttribute('aria-current')).toBe('step');
    expect(havolalar[0].getAttribute('aria-current')).toBeNull();
    expect(screen.queryByTestId('qadam-chip')).toBeNull();
    expect(screen.queryByTestId('keyingi-qadam')).toBeNull();
  });

  it('chiplar mock API dan; BITTA «Keyingi qadam» tugmasi scope bilan', async () => {
    m.akt.mockResolvedValue({ ok: true, qatorlar: [akt({ holat: 'qoralama' }), akt({ tur: 'f2', holat: 'qoralama' })] });
    m.davom.mockResolvedValue({ ok: true, qatorlar: [{ yozilgan: false }, { yozilgan: true }] });
    chiz('fakt');
    const keyingi = await screen.findByTestId('keyingi-qadam');
    expect(keyingi.getAttribute('href')).toBe('/admin/fakt?obyekt=5');
    expect(keyingi.textContent).toContain('Faktni yakunlang');
    const chiplar = screen.getAllByTestId('qadam-chip').map((c) => c.textContent);
    expect(chiplar).toContain('1 qoralama');
    expect(chiplar).toContain('1 ochiq import');
    expect(screen.getAllByTestId('keyingi-qadam')).toHaveLength(1);
  });

  it('akt reestri o‘qilmasa — chip va keyingi qadam yo‘q (taxmin qilinmaydi)', async () => {
    m.akt.mockResolvedValue({ ok: false, error: 'x' }); m.davom.mockResolvedValue({ ok: true, qatorlar: [] });
    chiz();
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByTestId('keyingi-qadam')).toBeNull();
    expect(screen.queryByTestId('qadam-chip')).toBeNull();
    expect(screen.getAllByRole('link')).toHaveLength(4);
  });
});
