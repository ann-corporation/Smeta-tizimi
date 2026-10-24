import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { T2Qator, T2QatorHolat } from '../../api/supabase';
import { XotiradanFakt } from './XotiradanFakt';

const yoz = vi.hoisted(() => vi.fn());
vi.mock('../../api/t2-fakt', () => ({ sbFaktYoz: yoz }));
vi.mock('../../api/t2-nakrutka', async (orig) => ({ ...(await orig<object>()), t2ObyektNakrutka: vi.fn(async () => ({ ok: true, koeffitsientlar: {} })) }));
vi.mock('../../umumiy/ui/Toast', () => ({ toast: vi.fn() }));

// Sintetik smeta (haqiqiy mijoz ma'lumoti emas).
let id = 0;
const rows: T2Qator[] = [];
const q = (o: Partial<T2Qator> & { tur: string; nom: string }) => { const x = { id: ++id, obyekt_id: 1, kompaniya_id: 1, ota_id: null, daraja: 0, tartib: id, kod: null, birlik: null, hajm: null, narx: null, summa: null, kat: null, ...o } as T2Qator; rows.push(x); return x.id; };
const R0 = q({ tur: 'rz', nom: 'РАЗДЕЛ: КОНСТРУКТИВНАЯ ЧАСТЬ' });
const RK = q({ tur: 'rz', nom: 'КАНАЛ', ota_id: R0 });
const BP = q({ tur: 'bl', nom: 'УСТРОЙСТВО БЕТОННОЙ ПОДГОТОВКИ ПОД КАНАЛ', ota_id: RK, kod: 'E6-1-24-4', birlik: 'М3', hajm: 300 });
const BETON = q({ tur: 'mat', nom: 'БЕТОН ТЯЖЕЛЫЙ В7,5', ota_id: BP, birlik: 'М3', hajm: 306, narx: 500000, summa: 153000000, kat: 'МАТ' });
const RG = q({ tur: 'rz', nom: 'ГИДРОИЗОЛЯЦИЯ', ota_id: R0 });
q({ tur: 'bl', nom: 'УКЛАДКА ГЕОМЕМБРАНЫ HDPE', ota_id: RG, birlik: 'М2', hajm: 5000 });
const states = rows.filter((r) => r.tur === 'bl').map((r) => ({ id: r.id, qator_id: r.id, obyekt_id: 1, smeta_hajm: r.hajm, fakt_hajm: r.id === BP ? 100 : 0, f2_hajm: 0 })) as unknown as T2QatorHolat[];

beforeEach(() => { yoz.mockReset(); yoz.mockResolvedValue({ ok: true }); });
afterEach(() => cleanup());

const ochish = (yangila = vi.fn()) => render(<MemoryRouter><XotiradanFakt obyektId={1} rows={rows} states={states} holatniYangila={yangila} /></MemoryRouter>);
const yoz2 = (m: string) => fireEvent.change(screen.getByRole('textbox', { name: /Bajarilgan ishlar/ }), { target: { value: m } });

describe('XotiradanFakt', () => {
  it('matn → nomzod (razdel yo‘li, qoldiq) → savat: ish va resursi bitta guruh; saqlash bitta fakt_yoz_v2 paketi', async () => {
    const yangila = vi.fn();
    ochish(yangila);
    yoz2('kanal tubiga beton 120 m3');
    fireEvent.click(screen.getByRole('button', { name: /Smetaga moslash/ }));
    const nz = await screen.findAllByRole('option');
    expect(nz[0].textContent).toContain('БЕТОННОЙ ПОДГОТОВКИ');
    expect(nz[0].textContent).toContain('КАНАЛ');   // razdel yo‘li
    expect(nz[0].textContent).toMatch(/Qoldiq:\s*200/); // 300 − 100
    fireEvent.click(within(nz[0]).getByRole('button', { name: /Savatga/ }));
    const savat = screen.getByRole('complementary', { name: /Fakt savati/ });
    expect(within(savat).getAllByLabelText('Hajm').map((i) => (i as HTMLInputElement).value)).toEqual(['120', '122.4']); // ish + beton (306/300)
    fireEvent.click(within(savat).getByRole('button', { name: /Saqlash/ }));
    await waitFor(() => expect(yoz).toHaveBeenCalledTimes(1));
    expect(yoz.mock.calls[0][0].qatorlar).toEqual([{ qator_id: BP, hajm: 120 }, { qator_id: BETON, hajm: 122.4 }]);
    await waitFor(() => expect(yangila).toHaveBeenCalled());
  });

  it('klaviatura: Enter nomzodni savatga qo‘shadi; hajm qoldiqdan oshsa bloklanmaydi, faqat belgi', async () => {
    ochish();
    yoz2('geomembrana 9000 m2');
    fireEvent.keyDown(screen.getByRole('textbox', { name: /Bajarilgan ishlar/ }), { key: 'Enter', ctrlKey: true });
    await screen.findAllByRole('option');
    fireEvent.keyDown(document.body, { key: 'Enter' });
    const savat = screen.getByRole('complementary', { name: /Fakt savati/ });
    expect((within(savat).getByLabelText('Hajm') as HTMLInputElement).value).toBe('9000');
    expect(savat.textContent).toMatch(/Qoldiqdan oshdi/);
  });
});
