import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { T2Qator } from '../../api/supabase';

// Sintetik ma'lumot; tarmoq yo'q (barcha API mock).
const m = vi.hoisted(() => ({ yoz: vi.fn(), toast: vi.fn() }));
vi.mock('../../api/t2-fakt', () => ({ sbFaktYoz: m.yoz }));
vi.mock('../../umumiy/ui/Toast', () => ({ toast: m.toast }));
vi.mock('../../api/t2-bajarilmadi', async (orig) => ({ ...(await orig<typeof import('../../api/t2-bajarilmadi')>()), bajarilmadiRoyxatOl: vi.fn(async () => ({ ok: true, qatorlar: [] })) }));
vi.mock('../../api/t2-ish-abc', () => ({ ishTuriQidir: vi.fn(async () => []), resursQidir: vi.fn(async () => []), narxTakliflari: vi.fn(async () => []), ishAbcSaqla: vi.fn(), ishAbcTahrir: vi.fn(), ishAbcOchir: vi.fn(), abcXato: () => '' }));
vi.mock('../../api/t2-holat-qisman', () => ({ sbT2QatorHolatQisman: vi.fn(async () => ({ ok: true, qatorlar: [] })), sbT2DaraxtQisman: vi.fn() }));
vi.mock('../../lib/fakt-zamena-boglanish', () => ({ zamenaBoglanishOl: vi.fn(async () => ({ almashtiradi: new Map(), almashtirilgan: new Map() })) }));

import { FaktJurnal } from './FaktJurnal';
import { HotkeyYordam } from '../../lib/hotkeys/HotkeyYordam';
import { keyingiMoslik, qoldimOl, qoldimYoz } from '../../lib/fakt-klaviatura';

const q = (o: Partial<T2Qator> & { id: number; tur: string }): T2Qator => ({
  obyekt_id: 8, obyekt: null, kompaniya_id: 1, ota_id: null, daraja: 0, tartib: o.id, kod: null, nom: 'n', birlik: 'м3',
  hajm: null, narx: null, summa: null, kat: null, narx_usul: null, qoshimcha: false, zamena: false,
  d1: null, d2: null, d3: null, xom_qator: null, yangilandi: null, manba_id: null, versiya: 1, ...o,
} as T2Qator);
const rows = [
  q({ id: 1, tur: 'rz', kod: '1', nom: 'Yer ishlari' }),
  q({ id: 2, tur: 'bl', ota_id: 1, daraja: 1, kod: 'E01', nom: 'Grunt', hajm: 100 }),
  q({ id: 3, tur: 'mat', ota_id: 2, daraja: 2, nom: 'Qum', hajm: 10 }),
  q({ id: 4, tur: 'rz', kod: '2', nom: 'Beton ishlari' }),
  q({ id: 5, tur: 'bl', ota_id: 4, daraja: 1, nom: 'Poydevor', hajm: 30 }),
];
const states = [{ qator_id: 2, smeta_hajm: 100, fakt_hajm: 40 }, { qator_id: 3, smeta_hajm: 10, fakt_hajm: 0 }, { qator_id: 5, smeta_hajm: 30, fakt_hajm: 0 }];
const props = () => ({ kompaniyaId: 1, obyektId: 8, rows, states, holatniYangila: vi.fn(), tuzilmaniYangila: vi.fn() });

const faol = () => (document.activeElement as HTMLElement | null)?.getAttribute('data-satr');
const bos = (key: string, o: Record<string, unknown> = {}) => fireEvent.keyDown(document.activeElement ?? window, { key, ...o });
const kirit = (nom: string) => screen.getByLabelText(`Bugun bajarildi: ${nom}`) as HTMLInputElement;

afterEach(() => { cleanup(); vi.clearAllMocks(); localStorage.clear(); });

describe('FaktJurnal — to‘liq klaviatura', () => {
  it('↑/↓, Home/End: faol qator (aria-selected, roving tabindex); ← ishni yig‘adi, → ochadi', () => {
    render(<FaktJurnal {...props()} />);
    bos('ArrowDown');
    expect(faol()).toBe('q-2');
    const grunt = document.querySelector('[data-satr="q-2"]')!;
    expect(grunt.getAttribute('aria-selected')).toBe('true');
    expect(grunt.getAttribute('tabindex')).toBe('0');
    bos('ArrowDown');
    expect(faol()).toBe('q-3');
    expect(grunt.getAttribute('aria-selected')).toBe('false');
    expect(grunt.getAttribute('tabindex')).toBe('-1');
    bos('Home'); expect(faol()).toBe('q-2');
    bos('End'); expect(faol()).toBe('q-3');
    bos('ArrowLeft'); expect(faol()).toBe('q-2'); // resurs → ota ish
    bos('ArrowLeft'); // ochiq ish — yig'iladi
    expect(screen.queryByText('Qum')).toBeNull();
    bos('ArrowRight');
    expect(screen.getByText('Qum')).toBeTruthy();
  });

  it('Enter — tahrir, Enter — keyingi qator katagi; raqam tahrirni boshlaydi; Esc — bekor (avvalgi qiymat)', () => {
    render(<FaktJurnal {...props()} />);
    bos('ArrowDown');
    bos('Enter');
    expect(document.activeElement).toBe(kirit('Grunt'));
    fireEvent.change(kirit('Grunt'), { target: { value: '5' } });
    bos('Enter');
    expect(document.activeElement).toBe(kirit('Qum'));
    bos('Escape');
    expect(faol()).toBe('q-3');
    bos('7');
    expect(document.activeElement).toBe(kirit('Qum'));
    expect(kirit('Qum').value).toBe('7');
    bos('Escape');
    expect(kirit('Qum').value).toBe(''); // bekor — tahrirdan oldingi holat
    expect(kirit('Grunt').value).toBe('5'); // boshqa qator tegilmadi
  });

  it('«*» — ochiq qoldiqni yozadi, Delete — tozalaydi; «=» — rejim', () => {
    render(<FaktJurnal {...props()} />);
    bos('ArrowDown');
    bos('*');
    expect(kirit('Grunt').value).toBe('60');
    bos('Delete');
    expect(kirit('Grunt').value).toBe('');
    bos('=');
    expect(screen.getByLabelText('Jami fakt: Grunt')).toBeTruthy();
  });

  it('Ctrl+Enter / Ctrl+S — mavjud saqlash yo‘li; o‘zgarish yo‘q bo‘lsa sababi aytiladi', async () => {
    m.yoz.mockResolvedValue({ ok: true });
    render(<FaktJurnal {...props()} />);
    bos('ArrowDown');
    bos('Enter', { ctrlKey: true });
    expect(m.toast).toHaveBeenCalledWith('Saqlanadigan o‘zgarish yo‘q.', 'warn');
    expect(m.yoz).not.toHaveBeenCalled();
    bos('*');
    bos('Enter', { ctrlKey: true });
    await waitFor(() => expect(m.yoz).toHaveBeenCalledTimes(1));
    expect(m.yoz).toHaveBeenCalledWith(expect.objectContaining({ obyektId: 8, qatorlar: [{ qator_id: 2, hajm: 60 }] }));
  });

  it('xato qiymat bilan Ctrl+S — saqlanmaydi, sabab va xatoli katak', () => {
    render(<FaktJurnal {...props()} />);
    fireEvent.change(kirit('Grunt'), { target: { value: 'abc' } });
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    expect(m.yoz).not.toHaveBeenCalled();
    expect(m.toast).toHaveBeenCalledWith('1 tasida xato — tuzating', 'warn');
    expect(document.activeElement).toBe(kirit('Grunt'));
  });

  it('qidiruv: «/» fokus, Enter — birinchi moslikka, n / Shift+N — aylanma', () => {
    render(<FaktJurnal {...props()} />);
    fireEvent.keyDown(window, { key: '/' });
    const qid = screen.getByLabelText('Qidirish');
    expect(document.activeElement).toBe(qid);
    fireEvent.change(qid, { target: { value: 'qum' } });
    fireEvent.keyDown(qid, { key: 'Enter' });
    expect(faol()).toBe('q-3');
    fireEvent.change(qid, { target: { value: 'u' } }); // Grunt, Qum — ikkalasi mos
    bos('n'); expect(faol()).toBe('q-2'); // aylanma
    bos('n'); expect(faol()).toBe('q-3');
    bos('N', { shiftKey: true }); expect(faol()).toBe('q-2');
  });

  it('Alt+4 «chala» filtri: boshlanmagan ish yashirinadi, Alt+1 — hammasi', () => {
    render(<FaktJurnal {...props()} />);
    fireEvent.click(screen.getByRole('button', { name: /2 Beton ishlari/ }));
    expect(screen.getByText('Poydevor')).toBeTruthy();
    fireEvent.keyDown(window, { key: '4', altKey: true });
    expect(screen.queryByText('Poydevor')).toBeNull();
    fireEvent.keyDown(window, { key: '1', altKey: true });
    expect(screen.getByText('Poydevor')).toBeTruthy();
  });

  it('«Qayerda qoldim»: oxirgi faol qator eslab qolinadi, qayta ochilganda tiklanadi; g → l qaytaradi', async () => {
    const { unmount } = render(<FaktJurnal {...props()} />);
    fireEvent.click(screen.getByRole('button', { name: /2 Beton ishlari/ }));
    bos('ArrowDown');
    expect(faol()).toBe('q-5');
    expect(qoldimOl(1, 8)).toBe(5);
    unmount();
    render(<FaktJurnal {...props()} />);
    await waitFor(() => expect(document.querySelector('[data-satr="q-5"]')?.getAttribute('aria-selected')).toBe('true'));
    expect(screen.getByTestId('qoldim-xabar').textContent).toMatch(/Siz shu yerda to‘xtagansiz: Poydevor/);
    fireEvent.click(screen.getByRole('button', { name: /1 Yer ishlari/ }));
    expect(screen.queryByText('Poydevor')).toBeNull();
    (document.activeElement as HTMLElement | null)?.blur();
    bos('g'); bos('l');
    await waitFor(() => expect(faol()).toBe('q-5'));
  });

  it('«?» — klaviatura yordam oynasi (fakt tugmalari bilan); tugma ham ochadi', () => {
    render(<><FaktJurnal {...props()} /><HotkeyYordam /></>);
    fireEvent.keyDown(window, { key: '?' });
    const dlg = screen.getByRole('dialog', { name: 'Klaviatura tugmalari' });
    expect(dlg.textContent).toMatch(/Keyingi qator/);
    expect(dlg.textContent).toMatch(/Ochiq qoldiqni to‘liq yozish/);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Klaviatura tugmalari' })).toBeNull();
    fireEvent.click(screen.getByTestId('klaviatura-yordam'));
    expect(screen.getByRole('dialog', { name: 'Klaviatura tugmalari' })).toBeTruthy();
  });

  it('«%» faol ish qatorida — faqat shu ish uchun Qamrov %', () => {
    render(<FaktJurnal {...props()} />);
    bos('ArrowDown'); bos('ArrowDown'); // Qum (resurs) → ota ish Grunt
    bos('%');
    expect(screen.getByRole('dialog', { name: 'Qamrov %' }).textContent).toMatch(/E01 Grunt/);
  });
});

describe('fakt-klaviatura (sof)', () => {
  it('keyingiMoslik aylanadi', () => {
    expect(keyingiMoslik([2, 5, 9], null, 1)).toBe(2);
    expect(keyingiMoslik([2, 5, 9], 9, 1)).toBe(2);
    expect(keyingiMoslik([2, 5, 9], 2, -1)).toBe(9);
    expect(keyingiMoslik([], 1, 1)).toBeNull();
  });
  it('qoldim: brauzer xotirasi xato bersa ham yiqilmaydi', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blok'); });
    expect(qoldimOl(1, 8)).toBeNull();
    spy.mockRestore();
    qoldimYoz(1, 8, 42); expect(qoldimOl(1, 8)).toBe(42);
  });
});
