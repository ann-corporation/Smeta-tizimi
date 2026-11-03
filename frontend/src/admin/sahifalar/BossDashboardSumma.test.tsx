import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { dashboardFixture } from '../../components/boss-decision/fixtures.fixture';
import { summaPaket } from '../../lib/summa-paket';

/** Sintetik ma'lumot: haqiqiy summa yo'q. Panel: F2 paketi 70 / 66 / 60; smeta (portfel hook): 130 / 110 / 100. */
const m = vi.hoisted(() => ({ panel: undefined as any }));
vi.mock('../../umumiy/kontekst/KompaniyaKontekst', () => ({ useKompaniya: () => ({ joriy: { id: 17, nom: 'DEMO' }, joriyId: 17 }) }));
vi.mock('../../api/t2-boss', () => ({ useBossDashboard: () => ({ data: dashboardFixture(), isError: false, isLoading: false, isFetching: false, refetch: vi.fn() }) }));
vi.mock('../../api/t2-rahbar-panel', () => ({ useRahbarPanel: () => ({ data: m.panel, isPending: false, fetchStatus: 'idle' }) }));
vi.mock('../../api/t2-hujjat-canonical', () => ({ hujjatYuklabOlishUrl: (id: number) => '/api/hujjat-ol?id=' + id }));
vi.mock('../../components/boss-decision/documents', () => ({ readDocuments: vi.fn() }));
vi.mock('../../api/supabase', () => ({ sbT2DaraxtOl: vi.fn(), sbT2QatorHolatOl: vi.fn(), sbT2ObyektlarOl: vi.fn(async () => ({ ok: true, qatorlar: [] })) }));
vi.mock('../../umumiy/ui/usePortfelUstamali', () => ({
  usePortfelUstamali: (royxat: readonly { obyektId: number; nom?: string }[]) => {
    const har = (v: number) => new Map(royxat.map((o) => [o.obyektId, v] as const));
    return { holat: 'tayyor', ustamali: 110 * royxat.length, ustamasiz: 100 * royxat.length, ndsBilan: 130 * royxat.length, nomalumSoni: 0,
      hisoblanganUstamasiz: 100 * royxat.length, jamiSoni: royxat.length, boYicha: har(110), qqsBoYicha: har(130), ustamasizBoYicha: har(100), royxat, retry: vi.fn() };
  },
}));
import BossDashboard from './BossDashboard';

const f2Paket = summaPaket({
  qqs_bilan: 70, qqs: 4, ustamali: 66, ustamasiz: 60, qqs_foiz: 12, ustamasiz_qism: 0,
  kesim: { chel: 10, mash: 10, mat: 20, ob: 20, subpudrat: 0, svod: 0, ustamasiz: 0, nomalum: 0 },
  soat: { chel: 0, mash: 0, mashinist: 0 }, subpudratchilar: [], narxsiz_soni: 0, qator_soni: 3,
})!;

function ochish() {
  return render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><BossDashboard /></QueryClientProvider></MemoryRouter>);
}
afterEach(() => { cleanup(); m.panel = undefined; });

/** F2 plitkasi: yorliq elementidan yuqoriga — birinchi uchlik katagi bor ota. */
function tile(): HTMLElement { let el: HTMLElement = screen.getByText('Tasdiqlangan F2 hujjatlari summasi'); while (!within(el).queryByTestId('qiymat-uchlik')) el = el.parentElement!; return el; }
const oldin = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe('Rahbar paneli — har summa uchlik: QQS bilan → ustamali → ustamasiz', () => {
  it('har uchlik katagida uch qator, shu tartibda; ustamasiz-faqat plitka yo‘q', () => {
    m.panel = { kartalar: { bajarildi: { jami: f2Paket } }, obyektlar: [{ obyekt_id: 127, nom: 'Amfiteatr DEMO', f2: f2Paket, fakt: null, smeta: null }] };
    ochish();
    expect(screen.queryByText('To‘g‘ridan-to‘g‘ri xarajat (ustamasiz)')).toBeNull();
    const kataklar = screen.getAllByTestId('qiymat-uchlik');
    expect(kataklar.length).toBeGreaterThanOrEqual(4); // smeta kartasi, F2 plitkasi, obyekt jadvali (smeta, F2), loyiha kartasi
    for (const k of kataklar) {
      const w = within(k);
      const qqs = w.getByTestId('summa-qqs'), ust = w.getByTestId('summa-ustamali'), pry = w.getByTestId('summa-ustamasiz');
      expect(oldin(qqs, ust) && oldin(ust, pry)).toBe(true);
    }
  });

  it('Xulosa: smeta kartasi 130 / 110 / 100, F2 plitkasi 70 / 66 / 60 (yorliqlari bilan)', () => {
    m.panel = { kartalar: { bajarildi: { jami: f2Paket } }, obyektlar: [{ obyekt_id: 127, nom: 'Amfiteatr DEMO', f2: f2Paket }] };
    ochish();
    const smeta = within(screen.getByTestId('ustama-xulosa'));
    expect(smeta.getByTestId('summa-qqs').textContent).toContain('130');
    expect(smeta.getByTestId('summa-ustamali').textContent).toContain('110');
    expect(smeta.getByTestId('summa-ustamasiz').textContent).toContain('100');
    const f2 = within(tile());
    expect(f2.getAllByTestId('summa-qqs-yorliq')[0].textContent).toContain('F2, QQS bilan');
    expect(f2.getAllByTestId('summa-qqs')[0].textContent).toContain('70');
    expect(f2.getAllByTestId('summa-ustamali')[0].textContent).toContain('66');
    expect(f2.getAllByTestId('summa-ustamasiz')[0].textContent).toContain('60');
  });

  it('smeta kartasini ochsa — tarkibida obyekt o‘z uchligi bilan, kaskad qadamlari ko‘rinadi', () => {
    m.panel = { kartalar: { bajarildi: { jami: f2Paket } }, obyektlar: [{ obyekt_id: 127, nom: 'Amfiteatr DEMO', f2: f2Paket }] };
    ochish();
    const karta = within(screen.getByTestId('ustama-xulosa'));
    fireEvent.click(karta.getByText(/kesim va hisob/));
    const band = within(karta.getByTestId('summa-qism-127'));
    expect(band.getByTestId('qism-qqs').textContent).toContain('130');
    expect(band.getByTestId('qism-ustamali').textContent).toContain('110');
    expect(band.getByTestId('qism-ustamasiz').textContent).toContain('100');
    expect(karta.getByTestId('summa-zanjir-itogo4')).toBeTruthy();
    expect(karta.getByTestId('summa-zanjir-vsego')).toBeTruthy();
  });

  it('F2 plitkasini ochsa — obyektlar bo‘yicha F2 uchligi; panel yo‘q bo‘lsa «hisoblanmadi», 0 emas', () => {
    m.panel = { kartalar: { bajarildi: { jami: f2Paket } }, obyektlar: [{ obyekt_id: 127, nom: 'Amfiteatr DEMO', f2: f2Paket }, { obyekt_id: 128, nom: 'Boshqa DEMO', f2: null }] };
    ochish();
    const plitka = within(tile());
    fireEvent.click(plitka.getAllByText(/kesim va hisob/)[0]);
    expect(within(plitka.getByTestId('summa-qism-127')).getByTestId('qism-qqs').textContent).toContain('70');
    expect(within(plitka.getByTestId('summa-qism-128')).getByTestId('qism-qqs').textContent).toContain('noma');
  });

  it('panel server paketi yo‘q: F2 faqat ustamasiz (60), QQS bilan «—» sababi bilan — 0 ko‘rsatilmaydi', () => {
    m.panel = undefined;
    ochish();
    const plitka = within(tile());
    expect(plitka.getAllByTestId('summa-ustamasiz')[0].textContent).toContain('60');
    expect(plitka.getAllByTestId('summa-qqs')[0].textContent).toContain('—');
    expect(plitka.getAllByTestId('summa-ustamali')[0].textContent).toContain('—');
  });
});
