import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { T2Qator } from '../../api/supabase';
import type { EgizakQator } from '../../lib/f2-moslash-v3/egizak';

const m = vi.hoisted(() => ({ yoz: vi.fn(), toast: vi.fn(), tasdiq: vi.fn(), egQator: vi.fn(), egHolat: vi.fn() }));
vi.mock('../../api/t2-fakt', () => ({ sbFaktYoz: m.yoz }));
vi.mock('../../umumiy/ui/Toast', () => ({ toast: m.toast }));
vi.mock('../../umumiy/ui/Tasdiq', () => ({ tasdiqSora: m.tasdiq }));
vi.mock('../../api/t2-bajarilmadi', async (orig) => ({ ...(await orig<typeof import('../../api/t2-bajarilmadi')>()), bajarilmadiRoyxatOl: vi.fn(async () => ({ ok: true, qatorlar: [] })) }));
vi.mock('../../api/t2-ish-abc', () => ({ ishTuriQidir: vi.fn(async () => []), resursQidir: vi.fn(async () => []), narxTakliflari: vi.fn(async () => []), ishAbcSaqla: vi.fn(), ishAbcTahrir: vi.fn(), ishAbcOchir: vi.fn(), abcXato: () => '' }));
vi.mock('../../api/t2-holat-qisman', () => ({ sbT2QatorHolatQisman: vi.fn(async () => ({ ok: true, qatorlar: [] })), sbT2DaraxtQisman: vi.fn() }));
vi.mock('../../lib/fakt-zamena-boglanish', () => ({ zamenaBoglanishOl: vi.fn(async () => ({ almashtiradi: new Map<number, number>(), almashtirilgan: new Map<number, number>() })) }));
vi.mock('../../api/t2-egizak', async (orig) => ({ ...(await orig<typeof import('../../api/t2-egizak')>()), egizakQatorlarOl: m.egQator, egizakHolatOl: m.egHolat }));

import { FaktJurnal } from './FaktJurnal';
import { FaktEgizakOyna } from './FaktEgizakOyna';
import { BirlikOgohBlok } from '../../components/fakt/BirlikOgoh';
import { birlikOgohi } from '../../lib/fakt-birlik-ogoh';
import type { T2Obyekt } from '../../api/supabase';

const q = (o: Partial<T2Qator> & { id: number; tur: string }): T2Qator => ({
  obyekt_id: 8, obyekt: null, kompaniya_id: 1, ota_id: null, daraja: 0, tartib: o.id, kod: null, nom: 'n', birlik: 'М3',
  hajm: null, narx: null, summa: null, kat: null, narx_usul: null, qoshimcha: false, zamena: false,
  d1: null, d2: null, d3: null, xom_qator: null, yangilandi: null, manba_id: null, versiya: 1, ...o,
} as T2Qator);
const rows = [
  q({ id: 1, tur: 'rz', kod: '1', nom: 'Bo‘lim' }),
  q({ id: 2, tur: 'bl', ota_id: 1, daraja: 1, nom: 'Beton ishi', birlik: '100 М3 БЕТОНА', hajm: 2.791 }),
  q({ id: 3, tur: 'bl', ota_id: 1, daraja: 1, nom: 'Oddiy ish', birlik: 'М3', hajm: 100 }),
];
const states = [{ qator_id: 2, smeta_hajm: 2.791, fakt_hajm: 0 }, { qator_id: 3, smeta_hajm: 100, fakt_hajm: 0 }];
const props = () => ({ kompaniyaId: 1, obyektId: 8, rows, states, holatniYangila: vi.fn(), tuzilmaniYangila: vi.fn() });
const kirit = (nom: string, v: string) => fireEvent.change(screen.getByLabelText(`Bugun bajarildi: ${nom}`), { target: { value: v } });

// Fakt jurnali qoralamasi (localStorage) testlar orasida tiklanmasin.
afterEach(() => { cleanup(); vi.clearAllMocks(); localStorage.clear(); });

describe('Fakt jurnali: birlik xatosi ogohlantirishi', () => {
  it('«100 М3» ishga 300 — qatorda matn va 3,00 taklifi; oddiy 120 — ogoh yo‘q', () => {
    render(<FaktJurnal {...props()} />);
    kirit('Beton ishi', '2,5');
    kirit('Oddiy ish', '120');
    expect(screen.queryByTestId('birlik-ogoh')).toBeNull();
    kirit('Beton ishi', '300');
    const matn = screen.getByTestId('birlik-ogoh-matn').textContent ?? '';
    expect(matn).toContain('Birlik: 100 М3');
    expect(matn).toContain('300');
    expect(matn).toContain('2,791');
    expect(matn).toContain('3,00 nazarda tutilmaganmi?');
    expect(screen.getByTestId('birlik-tuzat').textContent).toMatch(/^3,00 qilib qo/);
  });

  it('fokus yo‘qolmaydi: ogoh paydo bo‘lganda input qayta yaratilmaydi', () => {
    render(<FaktJurnal {...props()} />);
    const inp = screen.getByLabelText('Bugun bajarildi: Beton ishi') as HTMLInputElement;
    inp.focus();
    fireEvent.change(inp, { target: { value: '300' } });
    expect(screen.getByTestId('birlik-ogoh')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText('Bugun bajarildi: Beton ishi'));
  });

  it('bir tugmada tuzatish: «3,00 qilib qo‘yish» katakni 3 ga almashtiradi, ogoh yo‘qoladi', () => {
    render(<FaktJurnal {...props()} />);
    kirit('Beton ishi', '300');
    fireEvent.click(screen.getByTestId('birlik-tuzat'));
    expect((screen.getByLabelText('Bugun bajarildi: Beton ishi') as HTMLInputElement).value).toBe('3');
    expect(screen.queryByTestId('birlik-ogoh')).toBeNull();
  });

  it('foizli tez kiritish: ulkan foiz ogohlantiradi, oddiy 50% — yo‘q', () => {
    render(<FaktJurnal {...props()} />);
    kirit('Beton ishi', '50%');
    expect(screen.queryByTestId('birlik-ogoh')).toBeNull();
    kirit('Beton ishi', '10000%');
    expect(screen.getByTestId('birlik-ogoh')).toBeTruthy();
  });

  it('saqlashda: ogoh qator bor — umumiy tasdiq; «yo‘q» desak yozilmaydi, qoralama qoladi', async () => {
    m.tasdiq.mockResolvedValue(false);
    render(<FaktJurnal {...props()} />);
    kirit('Beton ishi', '300');
    kirit('Oddiy ish', '10');
    fireEvent.click(screen.getByRole('button', { name: /^Saqlash/ }));
    await waitFor(() => expect(m.tasdiq).toHaveBeenCalledTimes(1));
    expect(m.tasdiq.mock.calls[0][0]).toEqual(expect.objectContaining({ matn: '1 qatorda fakt smetadan ancha oshgan — baribir saqlansinmi?' }));
    expect(m.yoz).not.toHaveBeenCalled();
    expect((screen.getByLabelText('Bugun bajarildi: Beton ishi') as HTMLInputElement).value).toBe('300');
  });

  it('tasdiqlansa — baribir saqlanadi (bloklanmaydi)', async () => {
    m.tasdiq.mockResolvedValue(true);
    m.yoz.mockResolvedValue({ ok: true });
    render(<FaktJurnal {...props()} />);
    kirit('Beton ishi', '300');
    fireEvent.click(screen.getByRole('button', { name: /^Saqlash/ }));
    await waitFor(() => expect(m.yoz).toHaveBeenCalledTimes(1));
    expect(m.yoz).toHaveBeenCalledWith(expect.objectContaining({ qatorlar: [{ qator_id: 2, hajm: 300 }] }));
  });

  it('ogoh yo‘q bo‘lsa — tasdiq so‘ralmaydi', async () => {
    m.yoz.mockResolvedValue({ ok: true });
    render(<FaktJurnal {...props()} />);
    kirit('Beton ishi', '2');
    kirit('Oddiy ish', '120'); // smetadan oshdi, lekin 1,5× dan past
    fireEvent.click(screen.getByRole('button', { name: /^Saqlash/ }));
    await waitFor(() => expect(m.yoz).toHaveBeenCalledTimes(1));
    expect(m.tasdiq).not.toHaveBeenCalled();
  });

  it('minus qiymat ogoh bermaydi va bloklanmaydi', () => {
    render(<FaktJurnal {...props()} />);
    kirit('Beton ishi', '-300');
    expect(screen.queryByTestId('birlik-ogoh')).toBeNull();
  });
});

describe('BirlikOgohBlok (Holat «Diqqat: smetadan oshgan» kartasi uchun ham)', () => {
  it('fakt matni va tuzatish tugmasiz ko‘rinish', () => {
    const og = birlikOgohi({ smeta: 2.791, joriy: 0, rejim: '=', n: 300, birlik: '100М3' })!;
    render(<BirlikOgohBlok ogoh={og} tur="fakt" />);
    expect(screen.getByTestId('birlik-ogoh-matn').textContent).toBe('Birlik: 100 М3 — fakt 300 (smeta 2,791). 3,00 bo‘lishi kerak emasmi?');
    expect(screen.queryByTestId('birlik-tuzat')).toBeNull();
  });
  it('birlik ko‘paytmasiz — umumiy matn', () => {
    const og = birlikOgohi({ smeta: 3, joriy: 0, rejim: '=', n: 300, birlik: 'М3' })!;
    render(<BirlikOgohBlok ogoh={og} tur="fakt" />);
    expect(screen.getByTestId('birlik-ogoh-matn').textContent).toContain('100 marta ko‘p');
  });
});

describe('Egizak oldindan ko‘rish: birlik ogohi', () => {
  const eq = (d: number, birlik: string): EgizakQator[] => [
    { id: 1 + d, ota_id: null, daraja: 0, tartib: 1, tur: 'rz', kod: null, nom: 'Bo‘lim', birlik: null, hajm: null, qoshimcha: false },
    { id: 2 + d, ota_id: 1 + d, daraja: 1, tartib: 2, tur: 'bl', kod: 'E1', nom: 'Ish', birlik, hajm: 10, qoshimcha: false },
  ];
  const ob = (id: number, nom: string) => ({ id, nom, loyiha_id: 22 }) as unknown as T2Obyekt;

  it('egizakka yoziladigan 1000 (smeta 10, «100М3») — ogoh va yozishda tasdiq', async () => {
    m.egQator.mockImplementation(async (oid: number) => eq(oid === 167 ? 0 : 100, '100М3'));
    m.egHolat.mockResolvedValue([]);
    m.tasdiq.mockResolvedValue(false);
    render(<FaktEgizakOyna obyektId={167} obyektNom="Osiyo oshxonasi №1" objects={[ob(167, 'Osiyo oshxonasi №1'), ob(168, 'Osiyo oshxonasi №2')]} sana="2026-11-03"
      qoralama={{ 2: { rejim: '+', qiymat: '1000' } }} bolimNom={null} bolimKiritma={{}} obyektKiritma={{}} manbaSaqla={async () => true} onYop={() => undefined} onYozildi={() => undefined} />);
    expect(await screen.findByTestId('egizak-168')).toBeTruthy();
    expect(screen.getByTestId('birlik-ogoh-matn').textContent).toContain('10,00 nazarda tutilmaganmi?');
    fireEvent.click(screen.getByRole('button', { name: /^Egizaklarga yozish/ }));
    await waitFor(() => expect(m.tasdiq).toHaveBeenCalledTimes(1));
    expect(m.tasdiq.mock.calls[0][0]).toEqual(expect.objectContaining({ matn: '1 qatorda fakt smetadan ancha oshgan — baribir saqlansinmi?' }));
    expect(m.yoz).not.toHaveBeenCalled();
  });
});
