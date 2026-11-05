import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DiqqatRoyxati, ObyektlarMatritsa, PulOqimi, RahbarKartalar, TasdiqNavbati } from './RahbarMarkaz';
import { rahbarPanelTozala } from '../../api/t2-rahbar-panel';

afterEach(cleanup);
const paket = { qqs_bilan: 112, qqs: 12, ustamali: 100, ustamasiz: 80, kesim: { chel: 80 }, soat: {}, subpudratchilar: [] };
const p = rahbarPanelTozala({
  ok: true,
  kartalar: {
    portfel: { shartnoma_qqs_bilan: null, shartnoma_soni: 0, smeta: paket },
    bajarildi: { davr: paket, jami: paket, akt_soni: 2, foiz_smeta: 40, foiz_shartnoma: null, reestr: null },
    tolandi: { davr: null, jami: null, yozuv_soni: 0, manbalar_yoq: ['tolov'] },
    debitor: { qiymat: null, hujjatlangan: 112, tolangan: null, yosh: null, asos: 'f2_tasdiqlangan', manbalar_yoq: ['tolov'] },
    kreditor: { qiymat: null, manbalar_yoq: ['1c_prixod'] },
    rentabellik: { daromad: 100, tannarx: null, marja: null, foiz: null, manbalar_yoq: ['xarajat'] },
  },
  pul_oqimi: { oylar: [{ oy: '2026-10', bajarildi: 112, tolov: null, xarajat: null }, { oy: '2026-11', bajarildi: 0, tolov: null, xarajat: null }],
    prognoz: { kun: 90, qoralama_f2: 50, tolanmagan_f2: null, kutilayotgan: null, majburiyatlar: null, manbalar_yoq: ['tolov'] } },
  obyektlar: [
    { obyekt_id: 1, nom: 'Sintetik A', holat: 'faol', loyiha_id: null, loyiha_nom: 'L1', shartnoma: null, smeta: paket, fakt: paket, f2: paket,
      f2_qoralama: { qqs_bilan: 50, ustamali: 45, soni: 1 }, f3: null, tolangan: null, tolangan_foiz: null, qarz: null, marja_foiz: null,
      bajarilish: { fakt: 60, f2: 40, f3: null }, signal: { soni: 3, kritik: 0, eng_kop: 'missing_price' } },
    { obyekt_id: 2, nom: 'Sintetik B', holat: 'faol', loyiha_id: null, loyiha_nom: null, shartnoma: null, smeta: null, fakt: null, f2: null,
      f2_qoralama: { qqs_bilan: null, ustamali: null, soni: 0 }, f3: null, tolangan: null, tolangan_foiz: null, qarz: null, marja_foiz: null,
      bajarilish: { fakt: null, f2: null, f3: null }, signal: { soni: 0, kritik: 0, eng_kop: null } },
  ],
  diqqat: [{ kod: 'fakt_topshirilmagan', obyekt_id: 1, nom: 'Sintetik A', summa_tasir: 500, soni: null }, { kod: 'narxsiz', obyekt_id: null, nom: null, summa_tasir: null, soni: 4 }],
  tasdiq_kutmoqda: [{ tur: 'f2', id: 9, obyekt_id: 1, nom: 'F2-9', bosqich: 'draft', summa: 50, qachondan: new Date().toISOString(), kim: 'PTO' }],
  signal_guruh: [], shartnomalar: [],
});
const r = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('Rahbar markazi', () => {
  it('7 karta; kiritilmagan to‘lov/debitor/kreditor/tannarx — «kiritilmagan» (0 emas); fakt yo‘q — fakt kartasi nomalum', () => {
    r(<RahbarKartalar p={p} />);
    expect(screen.getAllByTestId('rahbar-karta')).toHaveLength(7);
    expect(screen.getAllByTestId('karta-kiritilmagan')).toHaveLength(4);
    expect(screen.getAllByTestId('rahbar-karta').filter((k) => k.dataset.holat === 'nomalum')).toHaveLength(5);
    expect(screen.queryByTestId('topshirilmagan')).toBeNull();
  });
  it('fakt kartasi (fakt) va F2 kartasi (topshirildi) ajralgan; «bajarildi, lekin topshirilmagan» = fakt − F2', () => {
    const fp = rahbarPanelTozala({ ...p, davr: { dan: '2026-11-01', gacha: '2026-11-05' }, fakt: { ...paket, qqs_bilan: 168, ustamali: 150, ustamasiz: 120 } } as unknown as Record<string, unknown>);
    r(<RahbarKartalar p={fp} />);
    const kartalar = screen.getAllByTestId('rahbar-karta');
    expect(kartalar[1].textContent).toContain('Bajarildi (fakt)');
    expect(kartalar[1].dataset.holat).toBe('yaxshi');
    expect(screen.getByTestId('fakt-karta-ost').textContent).toContain('smetadan 150%');
    expect(screen.getByTestId('fakt-karta-ost').textContent).toContain('davrdan qat’i nazar');
    expect(kartalar[2].textContent).toContain('Topshirildi (F2)');
    const ts = screen.getByTestId('topshirilmagan');
    expect(ts.textContent).toMatch(/56/);
    expect(ts.className).toContain('text-warn');
    expect(screen.getByTestId('topshirilmagan-diqqat').textContent).toContain('1');
  });
  it('pul oqimi: oylar va prognoz; kiritilmagan tushum', () => {
    r(<PulOqimi p={p} />);
    expect(screen.getByTestId('pul-oqimi-grafik').children).toHaveLength(2);
    expect(screen.getByTestId('prognoz').textContent).toContain('kiritilmagan');
  });
  it('diqqat: tartib va amal havolasi', () => {
    r(<DiqqatRoyxati diqqat={p.diqqat} />);
    const links = within(screen.getByTestId('diqqat-royxati')).getAllByRole('link');
    expect(links[0].getAttribute('href')).toBe('/admin/f2-tayyorlash?obyekt=1');
    expect(screen.getByText('summasi noma’lum')).toBeTruthy();
  });
  it('tasdiq navbati: F2 qoralama obyekt nomi bilan', () => {
    r(<TasdiqNavbati royxat={p.tasdiq_kutmoqda} obyektNomi={(id) => (id === 1 ? 'Sintetik A' : '—')} />);
    expect(screen.getByTestId('tasdiq-navbati').textContent).toContain('Sintetik A');
  });
  it('obyekt matritsasi: har obyekt qatori; paketsiz obyekt «—»', () => {
    r(<ObyektlarMatritsa p={p} />);
    const t = screen.getByTestId('obyekt-matritsa');
    expect(within(t).getAllByRole('row')).toHaveLength(3);
    expect(t.textContent).toContain('Sintetik B');
    expect(within(t).getAllByRole('columnheader').map((h) => h.textContent)).toContain('Fakt');
    expect(within(t).getAllByTestId('matritsa-fakt')).toHaveLength(2);
  });
});
