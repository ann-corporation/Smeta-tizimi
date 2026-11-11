import { afterEach, describe, expect, it, vi } from 'vitest';
import { paketdanDaraxtHolatOl, paketdanF2DaraxtHolatOl } from './t2-paket-oqish';
import { paketDekod, type PaketXom } from '../ombor/paket';

// Sintetik 2 qatorli obyekt (real ma'lumot emas).
const PAKET: PaketXom = {
  format: 't2-paket/1', obyekt_id: 7, obyekt_nom: 'SINOV', kompaniya_id: 1, soni: 2,
  lugat: { nom: ['ИШ', 'РАЗДЕЛ'], kod: ['E1'], birlik: ['М3'], tur: ['rz', 'bl', 'rs', 'mat', 'ob'], kat: [] },
  q: {
    id: [1, 2], ota_id: [null, 1], daraja: [0, 1], tartib: [1, 2], tur: [0, 1], kat: [null, null], kod: [null, 0], nom: [1, 0], birlik: [null, 0],
    hajm: [null, 10], narx: [null, 5], summa: [50, 50], norma: [null, null], narx_usul: [null, null], versiya: [1, 1], qoshimcha: [0, 0], zamena: [0, 0],
    xom_qator: {},
  },
  h: {
    fakt_hajm: [0, 4], fakt_summa: [0, 20], f2_hajm: [0, 0], f2_summa: [0, 0], f2_summa_nomalum: [0, 0], direct_fakt_hajm: [0, 4], fakt_manbasi: [0, 0],
    almashtirilgan_hajm: {}, almashtirilgan_summa: {},
  },
  f2: [], meta: {},
};

describe('paketdanDaraxtHolatOl', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('bir vaqtdagi bir xil obyekt so‘rovlari BITTA fetch ga birlashadi; qator va holat shakli eski yo‘lniki', async () => {
    const f = vi.fn(async () => Response.json(PAKET));
    vi.stubGlobal('fetch', f);
    const [a, b] = await Promise.all([paketdanDaraxtHolatOl(7), paketdanDaraxtHolatOl(7)]);
    expect(f).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
    expect(a?.rows.map((r) => r.id)).toEqual([1, 2]);
    expect(a?.rows[1]).toMatchObject({ obyekt_id: 7, obyekt: 'SINOV', ota_id: 1, tur: 'bl', kod: 'E1', hajm: 10, summa: 50 });
    expect(a?.states[1]).toMatchObject({ qator_id: 2, fakt_hajm: 4, smeta_hajm: 10 });
  });

  it('tugagach keyingi chaqiruv yangidan o‘qiydi (keshlanmaydi)', async () => {
    const f = vi.fn(async () => Response.json(PAKET));
    vi.stubGlobal('fetch', f);
    await paketdanDaraxtHolatOl(7);
    await paketdanDaraxtHolatOl(7);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('403 / tarmoq xatosi / boshqa obyekt paketi — null (eski yo‘lga qaytish)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ok: false, code: 'PERMISSION_DENIED', error: 'yo‘q' }, { status: 403 })));
    expect(await paketdanDaraxtHolatOl(7)).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('tarmoq'); }));
    expect(await paketdanDaraxtHolatOl(7)).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(PAKET)));
    expect(await paketdanDaraxtHolatOl(8)).toBeNull();
  });
});

describe('paketdanF2DaraxtHolatOl (F2 tayyorlash)', () => {
  afterEach(() => vi.unstubAllGlobals());
  const YANGI: PaketXom = {
    ...PAKET,
    q: { ...PAKET.q, raqam: { '2': '7-A' } },
    h: { ...PAKET.h, fakt_hajm: [null, 4], f2_hajm: [0, 3], f2_narx: [null, 12.5], smeta_hajm: { '2': 9 }, almashtirilgan_hajm: { '1': 2 }, fakt_manbasi: [0, 1] },
  };

  it('view ustunlari shaklida: smeta_hajm (zamena reja hajmi yoki q.hajm), narx, f2_narx, mumkin, manba', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(YANGI)));
    const r = await paketdanF2DaraxtHolatOl(7);
    expect(r?.rows.map((x) => x.id)).toEqual([1, 2]);
    expect(r?.f2Holat).toEqual([
      { qator_id: 1, smeta_hajm: null, smeta_narx: null, fakt_hajm: null, f2_hajm: 0, f2_mumkin_hajm: 0, f2_narx: null, almashtirilgan_hajm: 2, fakt_manbasi: 'DIRECT' },
      { qator_id: 2, smeta_hajm: 9, smeta_narx: 5, fakt_hajm: 4, f2_hajm: 3, f2_mumkin_hajm: 1, f2_narx: 12.5, almashtirilgan_hajm: 0, fakt_manbasi: 'BL_NORMA' },
    ]);
  });

  it('eski server (f2_narx/smeta_hajm yo\'q) yoki xato — null (eski yo\'lga qaytish)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(PAKET)));
    expect(await paketdanF2DaraxtHolatOl(7)).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('tarmoq'); }));
    expect(await paketdanF2DaraxtHolatOl(7)).toBeNull();
  });

  it('raqam siyrak xaritadan paralel massivga; noma\'lum id — xato', () => {
    expect(paketDekod(YANGI).raqam).toEqual([null, '7-A']);
    expect(paketDekod(PAKET).raqam).toBeUndefined();
    expect(() => paketDekod({ ...YANGI, q: { ...YANGI.q, raqam: { '99': 'x' } } })).toThrow();
  });
});