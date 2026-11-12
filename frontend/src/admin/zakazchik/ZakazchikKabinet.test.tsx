import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ZakazchikKabinet from './ZakazchikKabinet';

type Hal<T> = { resolve: (v: T) => void; p: Promise<T> };
function kech<T>(): Hal<T> { let resolve!: (v: T) => void; const p = new Promise<T>((r) => { resolve = r; }); return { resolve, p }; }

const st = vi.hoisted(() => ({ joriy: { id: 5, nom: 'Test' } as { id: number; nom: string }, aloqa: null as any, obyekt: null as any, taqdim: null as any, chaqiruv: [] as string[] }));
vi.mock('../../umumiy/kontekst/KompaniyaKontekst', () => ({ useKompaniya: () => ({ joriy: st.joriy }) }));
vi.mock('../../umumiy/kontekst/KompaniyaKerak', () => ({ KompaniyaKerak: () => <div>kompaniya kerak</div> }));
vi.mock('../../umumiy/ui/Sahifa', () => ({ Sahifa: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('./BugunBolimi', () => ({ default: () => <div data-testid="bugun" /> }));
vi.mock('../../api/t2-tomon', () => ({
  aloqalarOl: (k: number) => { st.chaqiruv.push(`aloqa${k}`); return st.aloqa.p; },
  zakazchikObyektlarOl: (k: number) => { st.chaqiruv.push(`obyekt${k}`); return st.obyekt.p; },
  taqdimlarOl: (k: number) => { st.chaqiruv.push(`taqdim${k}`); return st.taqdim.p; },
}));

const q = (id: number, holat = 'yuborilgan') => ({ id, aloqa_id: 1, resurs: 'f2', nom: `Hujjat ${id}`, oy: null, summa: null, holat, kelgan: true, qarshi_nom: 'Pudratchi', obyekt_nom: 'Obyekt', taqdim_vaqti: '2026-01-01T00:00:00Z', qaror_vaqti: null, qaror_izoh: null, oldingi_taqdim_id: null });
const bosh = () => { st.aloqa = kech(); st.obyekt = kech(); st.taqdim = kech(); st.chaqiruv = []; };
const kpi = () => Array.from(document.querySelectorAll('.fz-kpi__value')).map((e) => e.textContent);

afterEach(() => { cleanup(); });

describe('Buyurtmachi kabineti: yuklanish holati (T11)', () => {
  it('manbalar javob bermaguncha «0» EMAS — skelet; hammasi parallel so‘raladi', () => {
    bosh();
    render(<MemoryRouter><ZakazchikKabinet /></MemoryRouter>);
    expect(screen.getAllByTestId('kpi-yuklanmoqda')).toHaveLength(4);
    expect(kpi().every((x) => x === '')).toBe(true);
    expect(st.chaqiruv).toEqual(['aloqa5', 'obyekt5', 'taqdim5']);
    // «Hali pudratchi ulanmagan» ham yuklanguncha chiqmaydi (NULL ≠ bo'sh).
    expect(screen.queryByText(/Hali pudratchi ulanmagan/)).toBeNull();
  });

  it('har manba mustaqil: tez kelgani darrov ko‘rinadi, sekini skelet bo‘lib turadi', async () => {
    bosh();
    render(<MemoryRouter><ZakazchikKabinet /></MemoryRouter>);
    await act(async () => { st.taqdim.resolve({ ok: true, natija: [q(1), q(2, 'qabul')] }); await st.taqdim.p; });
    await waitFor(() => expect(screen.getAllByTestId('kpi-yuklanmoqda')).toHaveLength(3));
    expect(kpi()).toContain('1'); // faqat 1 ta qaror kutayotgan
  });

  it('T13: qaror kutayotgan qatorda «Qaror chiqarish» — hujjatni qaror sahifasida ochadi', async () => {
    bosh();
    render(<MemoryRouter><ZakazchikKabinet /></MemoryRouter>);
    await act(async () => { st.taqdim.resolve({ ok: true, natija: [q(77)] }); await st.taqdim.p; });
    const a = await screen.findByTestId('qaror-chiqarish');
    expect(a.getAttribute('href')).toBe('/admin/taqdimlar?id=77');
  });

  it('T15: kompaniya almashganda eski raqamlar qolmaydi — qayta skelet va yangi kompaniya bo‘yicha so‘rov', async () => {
    bosh();
    const r = render(<MemoryRouter><ZakazchikKabinet /></MemoryRouter>);
    await act(async () => {
      st.aloqa.resolve({ ok: true, natija: [{ id: 1, holat: 'faol' }] }); st.obyekt.resolve({ ok: true, natija: [] }); st.taqdim.resolve({ ok: true, natija: [] });
      await Promise.all([st.aloqa.p, st.obyekt.p, st.taqdim.p]);
    });
    await waitFor(() => expect(screen.queryAllByTestId('kpi-yuklanmoqda')).toHaveLength(0));
    expect(kpi()[0]).toBe('1');
    const eski = st.chaqiruv.length;
    st.aloqa = kech(); st.obyekt = kech(); st.taqdim = kech();
    st.joriy = { id: 9, nom: 'Boshqa' };
    r.rerender(<MemoryRouter><ZakazchikKabinet /></MemoryRouter>);
    await waitFor(() => expect(screen.getAllByTestId('kpi-yuklanmoqda')).toHaveLength(4));
    expect(st.chaqiruv.slice(eski)).toEqual(['aloqa9', 'obyekt9', 'taqdim9']);
    st.joriy = { id: 5, nom: 'Test' };
  });
});
