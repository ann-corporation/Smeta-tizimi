import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { HujjatTomonlariPanel, useHujjatTomonlari } from './HujjatTomonlari';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

const javob = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));
const bosh = { loyiha: null, obyekt: null, razdel: null };
const yoz = (l: boolean, o: boolean, r: boolean) => ({ loyiha: l, obyekt: o, razdel: r });
const yozuv = (daraja: string, o: Record<string, unknown>) => ({ daraja, razdel_id: null, tashkilot: null, lavozim: null, fio: null, manba: 'ozi', tomon_kompaniya_id: 3, yangilangan_at: '2026-10-26T10:00:00Z', ...o });

/** Chaqiruvchi — pudratchi (egasi): pudratchini yoza oladi, zakazchik/texnadzorni qoralama sifatida; subpudratchi band. */
const imzochilar = (o: { razdel?: boolean } = {}) => ({
  ok: true, obyekt_id: 7, loyiha_id: 2, razdel_id: o.razdel ? 40 : null, mening_tomonim: 'pudratchi', egasi: true,
  imzochilar: [
    { rol: 'zakazchik', effektiv: yozuv('loyiha', { tashkilot: 'Buyurtma MChJ', fio: 'Valiyev V.', manba: 'ozi', tomon_kompaniya_id: 9 }), qatlamlar: { ...bosh, loyiha: yozuv('loyiha', { tashkilot: 'Buyurtma MChJ', fio: 'Valiyev V.' }) }, yozish: yoz(false, false, false) },
    { rol: 'pudratchi', effektiv: yozuv('obyekt', { tashkilot: 'Bizning MChJ', lavozim: 'Direktor' }), qatlamlar: { ...bosh, obyekt: yozuv('obyekt', { tashkilot: 'Bizning MChJ', lavozim: 'Direktor' }) }, yozish: yoz(true, true, !!o.razdel) },
    { rol: 'subpudratchi', effektiv: null, qatlamlar: bosh, yozish: yoz(true, true, !!o.razdel) },
    { rol: 'texnadzor', effektiv: null, qatlamlar: bosh, yozish: yoz(true, true, !!o.razdel) },
    { rol: 'loyihachi', effektiv: null, qatlamlar: bosh, yozish: yoz(false, false, false) },
  ],
});

function stub(o: { razdel?: boolean } = {}) {
  const f = vi.fn((u: string, init?: RequestInit) => {
    if (u.startsWith('/api/tomon?') && u.includes('bolim=imzochilar')) return javob(imzochilar(o));
    if (u.startsWith('/api/tomon?') && u.includes('bolim=imzochi_tarix')) return javob({ ok: true, tarix: [{ rol: 'pudratchi', tashkilot: 'Eski MChJ', lavozim: 'Bosh muhandis', fio: 'Soliyev S.', oxirgi_at: '2026-10-01' }] });
    if (u === '/api/tomon' && init?.method === 'POST') return javob({ ok: true, manba: 'ozi' });
    if (u === '/api/sb') return javob({ ok: true, natija: { loyihalar: [], rollar: [], turlar: [], obyektlar: [{ id: 7, nom: 'O', loyiha_id: 2, asosiy_shartnoma_id: 1 }],
      shartnomalar: [{ id: 1, loyiha_id: 2, raqam: '1', nom: null, turi: null, asosiy: true, holat: 'faol', summa_bez_nds: null, nds: null, jami_nds_bilan: null, izoh: null, versiya: 1, obyektlar: [7],
        tomonlar: [{ rol: 'Texnik nazorat', nom: 'Shartnoma Nazorat', inn: null }] }] } });
    if (u.startsWith('/api/kompaniya-sozlama')) return javob({ ok: true, kompaniya_id: 5, mavqe: null, f2_tasdiq_rejimi: 'shaxsiy', sozlamalar: { 'hujjat.imzo_tomonlari': { qiymat: { zakazchik: 'ESKI KOMPANIYA', tuzuvchi: 'PTO Karimov' } } }, yozish_mumkin: true });
    return javob({ ok: false }, 404);
  });
  vi.stubGlobal('fetch', f);
  return f;
}
const posts = (f: ReturnType<typeof stub>) => f.mock.calls.filter(([u, i]) => u === '/api/tomon' && i?.method === 'POST').map(([, i]) => JSON.parse(String(i!.body)) as Record<string, unknown>);

describe('useHujjatTomonlari — obyekt rejimi', () => {
  it('birlashtiradi: obyekt yozuvi > shartnoma tashkiloti; tuzuvchi — kompaniya sukuti; eski kompaniya zakazchigi ishlatilmaydi', async () => {
    stub();
    const { result } = renderHook(() => useHujjatTomonlari(5, 7));
    await waitFor(() => expect(result.current[2]?.yuklanmoqda).toBe(false));
    expect(result.current[0]).toMatchObject({ zakazchik: 'Buyurtma MChJ, Valiyev V.', pudratchi: 'Bizning MChJ, Direktor', texnadzor: 'Shartnoma Nazorat', tuzuvchi: 'PTO Karimov' });
    expect(result.current[0].subpudratchi).toBeUndefined();
    expect(result.current[2]?.tarix).toHaveLength(1);
  });

  it('saqla: faqat yoza oladigan rollar, aniq «obyekt» darajasiga; yozib bo‘lmaydigan (zakazchik) o‘tkazib yuboriladi', async () => {
    const f = stub();
    const { result } = renderHook(() => useHujjatTomonlari(5, 7));
    await waitFor(() => expect(result.current[2]?.yuklanmoqda).toBe(false));
    act(() => result.current[1]({ ...result.current[0], zakazchik: 'Boshqa', texnadzor: 'Yangi nazorat' }));
    await waitFor(() => expect(posts(f)).toHaveLength(1));
    expect(posts(f)[0]).toMatchObject({ amal: 'imzochi_saqla', kompaniya_id: 5, obyekt_id: 7, rol: 'texnadzor', daraja: 'obyekt', tashkilot: 'Yangi nazorat' });
  });

  it('obyektId null — kompaniya rejimi (tafsilot null), eski xatti-harakat', async () => {
    localStorage.setItem('hujjat-tomonlari:5', JSON.stringify({ zakazchik: 'Lokal' }));
    const f = vi.fn((_u: string) => javob({ ok: false, code: 'SERVER_YANGILANMAGAN' }, 404));
    vi.stubGlobal('fetch', f);
    const { result } = renderHook(() => useHujjatTomonlari(5, null));
    expect(result.current[0]).toEqual({ zakazchik: 'Lokal' });
    expect(result.current[2]).toBeNull();
    await waitFor(() => expect(f).toHaveBeenCalled());
    expect(f.mock.calls.every(([u]) => !String(u).startsWith('/api/tomon'))).toBe(true);
  });
});

function Namuna({ razdel }: { razdel?: boolean }) {
  const [n, s, t] = useHujjatTomonlari(5, 7, razdel ? 40 : null);
  return <HujjatTomonlariPanel qiymat={n} onChange={s} tafsilot={t} />;
}

describe('HujjatTomonlariPanel — obyekt rejimi', () => {
  it('o‘z tomoni tahrirlanadi, boshqa tomon faqat o‘qish + chip; daraja tanlanadi; saqlash tanlangan darajaga', async () => {
    const f = stub();
    render(<Namuna />);
    expect(await screen.findByLabelText(/\(ПОДРЯДЧИК\) — Tashkilot/)).toBeTruthy();
    // Buyurtmachi (boshqa tomon): yozuv ko'rinadi, input yo'q.
    expect(screen.getByTestId('imzo-zakazchik').textContent).toContain('Buyurtma MChJ');
    expect(screen.queryByLabelText(/\(ЗАКАЗЧИК\) — Tashkilot/)).toBeNull();
    expect(screen.getByText('o‘zi tayinlagan')).toBeTruthy();
    expect(screen.getByText('Har tomon o‘z imzochisini o‘zi tayinlaydi.')).toBeTruthy();
    // Darajalar: razdel yo'q (kontekst yo'q), obyekt va loyiha bor.
    const sel = screen.getByLabelText('Qaysi darajaga saqlanadi', { selector: '#ht-daraja-pudratchi' }) as HTMLSelectElement;
    expect([...sel.options].map((o) => o.value)).toEqual(['obyekt', 'loyiha']);
    fireEvent.change(sel, { target: { value: 'loyiha' } });
    fireEvent.change(screen.getByLabelText(/\(ПОДРЯДЧИК\) — F\.I\.O\./), { target: { value: 'Aliyev A.' } });
    const saqlash = screen.getAllByRole('button', { name: 'Saqlash' })[0];
    fireEvent.click(saqlash);
    await waitFor(() => expect(posts(f)).toHaveLength(1));
    expect(posts(f)[0]).toMatchObject({ rol: 'pudratchi', daraja: 'loyiha', fio: 'Aliyev A.' });
  });

  it('razdel kontekstida «faqat shu razdel» darajasi chiqadi; takliflardan tanlash maydonlarni to‘ldiradi', async () => {
    stub({ razdel: true });
    render(<Namuna razdel />);
    const sel = (await screen.findAllByLabelText('Qaysi darajaga saqlanadi', { selector: '#ht-daraja-pudratchi' }))[0] as HTMLSelectElement;
    expect([...sel.options].map((o) => o.value)).toEqual(['razdel', 'obyekt', 'loyiha']);
    const taklif = screen.getByLabelText(/\(ПОДРЯДЧИК\) — Oldin kiritilganlar/) as HTMLSelectElement;
    fireEvent.change(taklif, { target: { value: '0' } });
    expect((screen.getByLabelText(/\(ПОДРЯДЧИК\) — Tashkilot/) as HTMLInputElement).value).toBe('Eski MChJ');
    expect((screen.getByLabelText(/\(ПОДРЯДЧИК\) — F\.I\.O\./) as HTMLInputElement).value).toBe('Soliyev S.');
  });
});
