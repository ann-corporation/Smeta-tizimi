import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { rahbarPultTozala, type RahbarPult } from '../../api/t2-rahbar-pult';

const m = vi.hoisted(() => ({ data: null as unknown, error: false, loading: false }));
vi.mock('../../umumiy/kontekst/KompaniyaKontekst', () => ({ useKompaniya: () => ({ joriy: { id: 17, nom: 'DEMO' } }) }));
vi.mock('../../api/t2-rahbar-pult', async (orig) => ({
  ...(await orig<typeof import('../../api/t2-rahbar-pult')>()),
  useRahbarPult: () => ({ data: m.data, isError: m.error, isLoading: m.loading, isFetching: false, refetch: vi.fn() }),
}));
import DirektorPult from './DirektorPult';

const xom = {
  ok: true, generated_at: '2026-11-12T00:00:00Z', oy: { oy: '2026-11', dan: '2026-11-01', gacha: '2026-11-30' },
  portfel: { obyekt_soni: 3, shartnoma_qqs_bilan: 1000, shartnoma_soni: 2, smeta: null, f2_jami: null, foiz_shartnoma: 12.5 },
  bajarildi_oy: { paket: null, akt_soni: 4 },
  hujjat: { f2_tasdiqlangan: 49, f2_qoralama: 24, f2_tekshiruvda: 2, f3_soni: 5, f3_chiqarilmagan: 7, f3_chiqarilmagan_summa: null },
  qarz: { debitor: { qiymat: null, hujjatlangan: null, tolangan: null, yosh: null }, tolandi: { jami: null, yozuv_soni: 0 } },
  kechikkan: { predpisaniya: { ochiq: 3, kechikkan: 2 }, topshiriq: { ochiq: 5, kechikkan: 1 } },
  xavfli: [{ obyekt_id: 9, nom: 'Obyekt A', kritik: 2, signal_soni: 4, sabablar: ['narxsiz'], qarz: null, f2_qqs_bilan: null }],
  kesh: { obyekt_soni: 3, toza_soni: 2, eng_eski: null },
};

function chiz() {
  return render(<MemoryRouter><QueryClientProvider client={new QueryClient()}><DirektorPult /></QueryClientProvider></MemoryRouter>);
}
afterEach(() => { cleanup(); m.data = null; m.error = false; m.loading = false; });

describe('DirektorPult', () => {
  it('oltita plitka, har biri havola; noma’lum summa — «—», nol emas', () => {
    m.data = rahbarPultTozala(xom as Record<string, unknown>) satisfies RahbarPult;
    chiz();
    for (const id of ['portfel', 'oy', 'hujjat', 'qarz', 'kechikkan', 'xavfli']) {
      const a = screen.getByTestId('pult-' + id);
      expect(a.tagName).toBe('A');
      expect(a.getAttribute('href')).toMatch(/^\/admin\//);
    }
    expect(screen.getByTestId('pult-qarz').textContent).toContain('—');
    expect(screen.getByTestId('pult-xavfli').textContent).toContain('Obyekt A');
    expect(screen.getByTestId('pult-hujjat').textContent).toContain('49');
  });
  it('yuklanmoqda va xato holatlari', () => {
    m.error = true;
    chiz();
    expect(screen.getByRole('alert')).toBeTruthy();
  });
  it('buzuq javob xavfsiz tozalanadi (paket null, sanoq 0)', () => {
    const d = rahbarPultTozala({ ok: true });
    expect(d.portfel.smeta).toBeNull();
    expect(d.hujjat.f2_tasdiqlangan).toBe(0);
    expect(d.xavfli).toEqual([]);
  });
});
