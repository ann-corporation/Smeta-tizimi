import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { T2Qator } from '../../api/supabase';

const m = vi.hoisted(() => ({ yoz: vi.fn(), toast: vi.fn(), yangi: vi.fn(async () => false), uid: 7 as number | null }));
vi.mock('../../umumiy/kontekst/KompaniyaKontekst', async (orig) => ({ ...(await orig<typeof import('../../umumiy/kontekst/KompaniyaKontekst')>()), useKompaniya: () => ({ foydalanuvchi: m.uid == null ? null : { id: m.uid } }) }));
vi.mock('../../api/t2-fakt', () => ({ sbFaktYoz: m.yoz }));
vi.mock('../../umumiy/ui/Toast', () => ({ toast: m.toast }));
vi.mock('../../_shared/versiya', async (orig) => ({ ...(await orig<typeof import('../../_shared/versiya')>()), yangiVersiyaniTekshir: m.yangi }));
vi.mock('../../api/t2-bajarilmadi', async (orig) => ({ ...(await orig<typeof import('../../api/t2-bajarilmadi')>()), bajarilmadiRoyxatOl: vi.fn(async () => ({ ok: true, qatorlar: [] })) }));
vi.mock('../../api/t2-ish-abc', () => ({ ishTuriQidir: vi.fn(async () => []), resursQidir: vi.fn(async () => []), narxTakliflari: vi.fn(async () => []), ishAbcSaqla: vi.fn(), ishAbcTahrir: vi.fn(), ishAbcOchir: vi.fn(), abcXato: () => '' }));
vi.mock('../../api/t2-holat-qisman', () => ({ sbT2QatorHolatQisman: vi.fn(async () => ({ ok: true, qatorlar: [] })), sbT2DaraxtQisman: vi.fn() }));
vi.mock('../../lib/fakt-zamena-boglanish', () => ({ zamenaBoglanishOl: vi.fn(async () => ({ almashtiradi: new Map(), almashtirilgan: new Map() })) }));

import { FaktJurnal } from './FaktJurnal';
import { qoralamaKaliti } from '../../lib/fakt-jurnal-qoralama';

// Sintetik ma'lumot.
const q = (o: Partial<T2Qator> & { id: number; tur: string }): T2Qator => ({
  obyekt_id: 8, obyekt: null, kompaniya_id: 1, ota_id: null, daraja: 0, tartib: o.id, kod: null, nom: 'n', birlik: 'm3',
  hajm: null, narx: null, summa: null, kat: null, narx_usul: null, qoshimcha: false, zamena: false,
  d1: null, d2: null, d3: null, xom_qator: null, yangilandi: null, manba_id: null, versiya: 1, ...o,
} as T2Qator);
const rows = [
  q({ id: 1, tur: 'rz', kod: '1', nom: 'Bolim A' }),
  q({ id: 2, tur: 'bl', ota_id: 1, daraja: 1, nom: 'Ish A', hajm: 100 }),
  q({ id: 3, tur: 'mat', ota_id: 2, daraja: 2, nom: 'Mat B', hajm: 10 }),
];
const holat = (f2: number) => [{ qator_id: 2, smeta_hajm: 100, fakt_hajm: f2 }, { qator_id: 3, smeta_hajm: 10, fakt_hajm: 0 }];
const props = (states = holat(40)) => ({ kompaniyaId: 1, obyektId: 8, rows, states, holatniYangila: vi.fn(), tuzilmaniYangila: vi.fn() });
const KALIT = qoralamaKaliti(1, 8, 7);
const qoralama = (yozuvlar: unknown[], kalit = KALIT) => localStorage.setItem(kalit, JSON.stringify({ v: 1, ts: Date.now(), yozuvlar }));

afterEach(() => { cleanup(); vi.clearAllMocks(); localStorage.clear(); m.uid = 7; });

describe('FaktJurnal brauzer qoralamasi (hodisa 2026-11-09)', () => {
  it('boshqa foydalanuvchi (bir profil) A ning v2 qoralamasini ko‘rmaydi', () => {
    qoralama([{ id: 2, rejim: '+', qiymat: '5', asos: 40 }]);
    m.uid = 8;
    render(<FaktJurnal {...props()} />);
    expect(screen.queryByTestId('fakt-qoralama-banner')).toBeNull();
    expect((screen.getByLabelText('Bugun bajarildi: Ish A') as HTMLInputElement).value).toBe('');
    expect(localStorage.getItem(KALIT)).not.toBeNull();
  });

  it('deploydan oldingi v1 qoralama joriy foydalanuvchining v2 siga ko‘chib tiklanadi, v1 o‘chadi', () => {
    localStorage.setItem('t2.fakt.jurnal.qoralama:v1:1:8', JSON.stringify({ v: 1, ts: Date.now(), yozuvlar: [{ id: 2, rejim: '+', qiymat: '9', asos: 40 }] }));
    render(<FaktJurnal {...props()} />);
    expect((screen.getByLabelText('Bugun bajarildi: Ish A') as HTMLInputElement).value).toBe('9');
    expect(localStorage.getItem('t2.fakt.jurnal.qoralama:v1:1:8')).toBeNull();
    expect(localStorage.getItem(KALIT)).not.toBeNull();
  });

  it('kiritma localStorage ga yoziladi va qayta ochilganda banner bilan tiklanadi', async () => {
    const r1 = render(<FaktJurnal {...props()} />);
    fireEvent.change(screen.getByLabelText('Bugun bajarildi: Ish A'), { target: { value: '5' } });
    await waitFor(() => expect(JSON.parse(localStorage.getItem(KALIT) ?? 'null')?.yozuvlar).toEqual([{ id: 2, rejim: '+', qiymat: '5', asos: 40 }]));
    r1.unmount();
    render(<FaktJurnal {...props()} />);
    expect(screen.getByTestId('fakt-qoralama-banner').textContent).toContain('Saqlanmagan 1 ta o‘zgarish tiklandi');
    expect((screen.getByLabelText('Bugun bajarildi: Ish A') as HTMLInputElement).value).toBe('5');
  });

  it('banner «Saqlash» — bitta fakt_yoz_v2, muvaffaqiyatdan keyin qoralama o‘chiriladi', async () => {
    m.yoz.mockResolvedValue({ ok: true });
    qoralama([{ id: 2, rejim: '+', qiymat: '5', asos: 40 }]);
    render(<FaktJurnal {...props()} />);
    fireEvent.click(within(screen.getByTestId('fakt-qoralama-banner')).getByRole('button', { name: 'Saqlash' }));
    await waitFor(() => expect(m.yoz).toHaveBeenCalledWith(expect.objectContaining({ qatorlar: [{ qator_id: 2, hajm: 5 }] })));
    await waitFor(() => expect(screen.queryByTestId('fakt-qoralama-banner')).toBeNull());
    await waitFor(() => expect(localStorage.getItem(KALIT)).toBeNull());
  });

  it('«Bekor qilish» — tiklangan kiritmalar va qoralama tozalanadi', async () => {
    qoralama([{ id: 2, rejim: '+', qiymat: '5', asos: 40 }]);
    render(<FaktJurnal {...props()} />);
    fireEvent.click(within(screen.getByTestId('fakt-qoralama-banner')).getByRole('button', { name: 'Bekor qilish' }));
    expect((screen.getByLabelText('Bugun bajarildi: Ish A') as HTMLInputElement).value).toBe('');
    expect(screen.queryByTestId('fakt-qoralama-banner')).toBeNull();
    await waitFor(() => expect(localStorage.getItem(KALIT)).toBeNull());
  });

  it('ziddiyat: server fakti o‘zgargan yoki qator yo‘q — jim qo‘llanmaydi, qator belgilanadi', () => {
    qoralama([{ id: 2, rejim: '+', qiymat: '5', asos: 30 }, { id: 3, rejim: '+', qiymat: '1', asos: 0 }, { id: 77, rejim: '=', qiymat: '2', asos: 0 }]);
    render(<FaktJurnal {...props()} />);
    const b = screen.getByTestId('fakt-qoralama-banner').textContent ?? '';
    expect(b).toContain('Saqlanmagan 1 ta o‘zgarish tiklandi');
    expect(screen.getByTestId('fakt-qoralama-ziddiyat').textContent).toMatch(/2 ta qator tiklanmadi.*Ish A, #77/);
    expect((screen.getByLabelText('Bugun bajarildi: Ish A') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Bugun bajarildi: Mat B') as HTMLInputElement).value).toBe('1');
    expect(screen.getByTestId('qoralama-ziddiyat').textContent).toContain('qoralama: + 5');
  });

  it('so‘rov serverga yetmadi va yangi versiya chiqqan — aniq xabar, qoralama saqlanib qoladi', async () => {
    m.yoz.mockResolvedValue({ ok: false, code: 'NETWORK', error: 'Internet aloqasi uzildi' });
    m.yangi.mockResolvedValueOnce(true);
    render(<FaktJurnal {...props()} />);
    fireEvent.change(screen.getByLabelText('Bugun bajarildi: Ish A'), { target: { value: '7' } });
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    await waitFor(() => expect(m.toast).toHaveBeenCalledWith(expect.stringContaining('Tizimning yangi versiyasi chiqdi'), 'warn', undefined, 15000));
    expect(JSON.parse(localStorage.getItem(KALIT) ?? 'null')?.yozuvlar).toEqual([{ id: 2, rejim: '+', qiymat: '7', asos: 40 }]);
  });

  it('oddiy tarmoq xatosi (yangi versiya yo‘q) — tarmoq xabari + «brauzerda saqlab qo‘yildi»', async () => {
    m.yoz.mockResolvedValue({ ok: false, code: 'NETWORK', error: 'Internet aloqasi uzildi' });
    render(<FaktJurnal {...props()} />);
    fireEvent.change(screen.getByLabelText('Bugun bajarildi: Ish A'), { target: { value: '7' } });
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    await waitFor(() => expect(m.toast).toHaveBeenCalledWith(expect.stringMatching(/Internet aloqasi uzildi.*brauzerda saqlab qo‘yildi/), 'danger', undefined, 12000));
  });
});
