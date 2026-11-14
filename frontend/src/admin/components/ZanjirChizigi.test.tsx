import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const m = vi.hoisted(() => ({
  ws: { companyId: 7 as number | null, scope: { objectId: 5 as number | null }, objects: [{ id: 5, jami: 1000, narxsiz: 0 }] as unknown[], scopeSearch: (id: number | null) => `?obyekt=${id}&davr=2026-11` },
  akt: vi.fn(), davom: vi.fn(), f3: vi.fn(),
}));
vi.mock('../../umumiy/kontekst/PTOWorkspaceContext', () => ({ usePTOWorkspace: () => m.ws }));
const rolHolati = vi.hoisted(() => ({ rol: null as string | null }));
vi.mock('../../umumiy/kontekst/KompaniyaKontekst', () => ({ useKompaniya: () => ({ joriy: rolHolati.rol ? { rol: rolHolati.rol } : null }) }));
vi.mock('../../api/supabase', () => ({ sbT2AktReestrOl: m.akt }));
vi.mock('../../api/t2-f2-davom', () => ({ f2DavomRoyxatOl: m.davom }));
vi.mock('../../lib/pto-markazi/forma3-holat', () => ({ forma3OyHolati: m.f3 }));
import { ZanjirChizigi } from './ZanjirChizigi';
import { qadamMalumotKeshTozala } from '../../lib/pto-markazi/useQadamMalumot';

const akt = (o: Record<string, unknown>) => ({ tur: 'fakt', holat: 'tasdiqlangan', oy: '2026-11-01', yaratildi: '2026-11-03T00:00:00Z', hujjat_jami: 1, yozilgan_jami: 1, ...o });
const chiz = (p: Parameters<typeof ZanjirChizigi>[0] = {}) => render(<MemoryRouter><ZanjirChizigi {...p} /></MemoryRouter>);
const TARTIB = ['smeta', 'fakt', 'aosr', 'f2', 'nakopitelniy', 'f3', 'tolov', 'slichitelniy'];

afterEach(() => {
  cleanup(); qadamMalumotKeshTozala(); vi.clearAllMocks(); rolHolati.rol = null;
  m.ws = { companyId: 7, scope: { objectId: 5 }, objects: [{ id: 5, jami: 1000, narxsiz: 0 }], scopeSearch: (id) => `?obyekt=${id}&davr=2026-11` };
});

describe('ZanjirChizigi — rol va qo‘shimcha sonlar', () => {
  it('buyurtmachi/texnadzor roli — chiziq chizilmaydi; pudratchi roli (pto) — chiziladi', () => {
    m.akt.mockReturnValue(new Promise(() => undefined)); m.davom.mockReturnValue(new Promise(() => undefined));
    rolHolati.rol = 'buyurtmachi';
    const { container, unmount } = chiz();
    expect(container.innerHTML).toBe('');
    unmount();
    rolHolati.rol = 'pto';
    chiz();
    expect(screen.getByTestId('zanjir-chizigi')).toBeTruthy();
  });
  it('slichitelniy farqi sahifadan berilsa — qadam izohida son; berilmasa — noma‘lum', () => {
    m.akt.mockReturnValue(new Promise(() => undefined)); m.davom.mockReturnValue(new Promise(() => undefined));
    const { unmount } = chiz({ qoshimcha: { slichitelniy: { farqli: 7, barglar: 20 } } });
    expect(screen.getByTestId('zanjir-izoh-slichitelniy').textContent).toBe('7 qatorda farq bor');
    unmount();
    chiz();
    expect(screen.getByTestId('zanjir-qadam-slichitelniy').closest('li')?.getAttribute('data-holat')).not.toBe('done');
  });
});

describe('ZanjirChizigi', () => {
  it('obyekt tanlanmagan — hech narsa chizilmaydi', () => {
    m.ws.scope.objectId = null; m.akt.mockResolvedValue({ ok: true, qatorlar: [] }); m.davom.mockResolvedValue({ ok: true, qatorlar: [] });
    const { container } = chiz();
    expect(container.innerHTML).toBe('');
  });

  it('8 qadam to‘g‘ri tartibda (АОСР F2 dan oldin); hammasi obyekt va davr bilan havola; joriy sahifa belgilanadi', () => {
    m.akt.mockReturnValue(new Promise(() => undefined)); m.davom.mockReturnValue(new Promise(() => undefined));
    chiz({ joriy: 'aosr' });
    const nav = screen.getByTestId('zanjir-chizigi');
    const qadamlar = Array.from(nav.querySelectorAll('li a'));
    expect(qadamlar.map((a) => a.getAttribute('data-testid'))).toEqual(TARTIB.map((x) => `zanjir-qadam-${x}`));
    expect(qadamlar.map((a) => a.getAttribute('href'))).toEqual([
      '/admin/holat/5?obyekt=5&davr=2026-11',
      '/admin/fakt?obyekt=5&davr=2026-11',
      '/admin/aosr?obyekt=5&davr=2026-11',
      '/admin/f2-tayyorlash?obyekt=5&davr=2026-11',
      '/admin/nakopitelniy?obyekt=5&davr=2026-11',
      '/admin/nakopitelniy?obyekt=5&davr=2026-11&f3=shartnoma',
      '/admin/moliya?obyekt=5&davr=2026-11&tab=tolov',
      '/admin/holat/5?obyekt=5&davr=2026-11#slichitelniy',
    ]);
    expect(screen.getByTestId('zanjir-qadam-aosr').getAttribute('aria-current')).toBe('step');
    expect(screen.getByTestId('zanjir-qadam-f2').getAttribute('aria-current')).toBeNull();
  });

  it('akt reestri kelmaguncha — fakt/F2 «Noma‘lum», hech biri «bajarilgan» emas va «Keyingi qadam» faqat ma‘lum smetadan', () => {
    m.akt.mockReturnValue(new Promise(() => undefined)); m.davom.mockReturnValue(new Promise(() => undefined));
    chiz();
    expect(screen.getByTestId('zanjir-qadam-fakt').closest('li')?.getAttribute('data-holat')).toBe('unknown');
    expect(screen.getByTestId('zanjir-qadam-f2').closest('li')?.getAttribute('data-holat')).toBe('unknown');
    expect(screen.getByTestId('zanjir-qadam-smeta').closest('li')?.getAttribute('data-holat')).toBe('done');
  });

  it('fakt bor, АОСР qamrovi berilgan: БИТТА «Keyingi qadam» — АОСР (F2 dan oldin), obyekt id bilan', async () => {
    m.akt.mockResolvedValue({ ok: true, qatorlar: [akt({})] }); m.davom.mockResolvedValue({ ok: true, qatorlar: [] });
    chiz({ joriy: 'fakt', aosr: { yashirin: 3, aktsiz: 2 } });
    const keyingi = await screen.findByTestId('keyingi-qadam');
    expect(keyingi.getAttribute('href')).toBe('/admin/aosr?obyekt=5&davr=2026-11');
    expect(keyingi.textContent).toContain('АОСР');
    expect(screen.getAllByTestId('keyingi-qadam')).toHaveLength(1);
    expect(screen.getByTestId('keyingi-sabab').textContent).toContain('2 ta yashirin ish');
    expect(screen.getByTestId('zanjir-qadam-f2').closest('li')?.getAttribute('data-holat')).toBe('not_started');
  });

  it('АОСР noma‘lum bo‘lsa — F2 tavsiya + «АОСР holati noma‘lum» eslatma', async () => {
    m.akt.mockResolvedValue({ ok: true, qatorlar: [akt({})] }); m.davom.mockResolvedValue({ ok: true, qatorlar: [] });
    chiz();
    const keyingi = await screen.findByTestId('keyingi-qadam');
    expect(keyingi.getAttribute('href')).toBe('/admin/f2-tayyorlash?obyekt=5&davr=2026-11');
    expect(screen.getByTestId('keyingi-sabab').textContent).toContain('АОСР holati noma‘lum');
  });

  it('F2 tasdiqlangan, Forma 3 yo‘q — keyingi qadam Forma 3 (f3=shartnoma bilan); to‘lov blocked', async () => {
    m.akt.mockResolvedValue({ ok: true, qatorlar: [akt({}), akt({ tur: 'f2' })] }); m.davom.mockResolvedValue({ ok: true, qatorlar: [] }); m.f3.mockResolvedValue(0);
    chiz({ joriy: 'f2', aosr: { yashirin: 0, aktsiz: 0 } });
    const keyingi = await screen.findByText(/Forma 3 tayyorlang/);
    expect(keyingi.closest('a')?.getAttribute('href')).toBe('/admin/nakopitelniy?obyekt=5&davr=2026-11&f3=shartnoma');
    expect(screen.getByTestId('zanjir-qadam-tolov').closest('li')?.getAttribute('data-holat')).toBe('blocked');
  });

  it('akt reestri o‘qilmadi — «Keyingi qadam» fakt deb taxmin qilinmaydi (noma‘lum holat, 0 emas)', async () => {
    m.akt.mockResolvedValue({ ok: false, error: 'x' }); m.davom.mockResolvedValue({ ok: true, qatorlar: [] });
    chiz();
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByTestId('zanjir-qadam-fakt').closest('li')?.getAttribute('data-holat')).toBe('unknown');
    expect(screen.getByTestId('zanjir-qadam-fakt').closest('li')?.getAttribute('data-holat')).not.toBe('current');
  });

  it('mobil: qatorlar o‘raladi (flex-wrap), qat’iy min-width yo‘q', () => {
    m.akt.mockReturnValue(new Promise(() => undefined)); m.davom.mockReturnValue(new Promise(() => undefined));
    chiz();
    const ol = screen.getByTestId('zanjir-chizigi').querySelector('ol');
    expect(ol?.className).toContain('flex-wrap');
    expect(screen.getByTestId('zanjir-chizigi').innerHTML).not.toMatch(/min-w-\[\d/);
  });
});
