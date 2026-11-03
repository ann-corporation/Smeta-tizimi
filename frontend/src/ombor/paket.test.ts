import { afterEach, describe, expect, it, vi } from 'vitest';
import { PaketXato, bormi, paketDekod, paketdanHolatlar, paketdanQatorlar, son, type PaketXom } from './paket';
import { sbT2TreeQur, type T2Qator, type T2QatorHolat } from '../api/supabase';
import { T2_DARAXT_USTUNLARI, T2_HOLAT_DARAXT_USTUNLARI } from '../api/t2-daraxt-ustunlar';
import { obyektPaketOl } from '../api/t2-obyekt-paket';

/* ── Sintetik obyekt (real ma'lumot emas). Eski o'quvchilar qaytaradigan qatorlar (t2_daraxt / t2_qator_holat,
   aynan useT2Daraxt so'raydigan ustunlar) va server `t2_obyekt_paket_v1` shu obyekt uchun beradigan paket. ── */
const ESKI_QATORLAR: Partial<T2Qator>[] = [
  { id: 10, obyekt_id: 4, obyekt: 'SINOV', ota_id: null, daraja: 0, tartib: 1, tur: 'rz', kod: null, nom: 'РАЗДЕЛ', birlik: null, hajm: null, narx: null, summa: 1550, kat: null, narx_usul: null, qoshimcha: false, zamena: false, xom_qator: 5, versiya: 3, norma: null },
  { id: 11, obyekt_id: 4, obyekt: 'SINOV', ota_id: 10, daraja: 1, tartib: 2, tur: 'bl', kod: 'E1-1', nom: 'ИШ', birlik: 'М3', hajm: 10, narx: null, summa: 1500, kat: null, narx_usul: null, qoshimcha: false, zamena: false, xom_qator: null, versiya: 1, norma: null },
  // Teng tartib — id bo'yicha (12 oldin 13).
  { id: 12, obyekt_id: 4, obyekt: 'SINOV', ota_id: 11, daraja: 2, tartib: 3, tur: 'rs', kod: 'C2', nom: 'ГИПС', birlik: 'КГ', hajm: 2, narx: null, summa: null, kat: 'МАТ', narx_usul: null, qoshimcha: false, zamena: false, xom_qator: null, versiya: 1, norma: 0.5 },
  { id: 13, obyekt_id: 4, obyekt: 'SINOV', ota_id: 11, daraja: 2, tartib: 3, tur: 'rs', kod: 'C1', nom: 'ЦЕМЕНТ', birlik: 'Т', hajm: 10, narx: 100, summa: 1000, kat: 'МАТ', narx_usul: 'katalog', qoshimcha: false, zamena: false, xom_qator: null, versiya: 2, norma: 1 },
  { id: 14, obyekt_id: 4, obyekt: 'SINOV', ota_id: 11, daraja: 2, tartib: 4, tur: 'rs', kod: 'C1', nom: 'ЦЕМЕНТ', birlik: 'Т', hajm: 5, narx: 100, summa: 500, kat: 'МАТ', narx_usul: 'qolda', qoshimcha: true, zamena: true, xom_qator: null, versiya: 1, norma: null },
];
// T2QatorHolat turida fakt_summa `number`, lekin view NULL qaytaradi (BL_NORMA, narxsiz) — fikstura shuni aks ettiradi.
const h = (x: Record<string, string | number | null>) => x as Partial<T2QatorHolat>;
// t2_qator_holat (qator_id bo'yicha). 12: BL_NORMA, narx yo'q → fakt_summa NULL (0 emas); 13: tasdiqlangan F2 + almashtirilgan.
const ESKI_HOLATLAR: Partial<T2QatorHolat>[] = [
  h({ qator_id: 10, tur: 'rz', kod: null, nom: 'РАЗДЕЛ', birlik: null, kat: null, smeta_hajm: null, smeta_summa: 1550, fakt_hajm: 0, fakt_summa: 0, f2_hajm: 0, f2_summa: 0, qoldiq_hajm: null, qoldiq_summa: 1550, f2_mumkin_hajm: 0, f2_mumkin_summa: 0 }),
  h({ qator_id: 11, tur: 'bl', kod: 'E1-1', nom: 'ИШ', birlik: 'М3', kat: null, smeta_hajm: 10, smeta_summa: 1500, fakt_hajm: 4, fakt_summa: 400, f2_hajm: 0, f2_summa: 0, qoldiq_hajm: 10, qoldiq_summa: 1500, f2_mumkin_hajm: 4, f2_mumkin_summa: 400 }),
  h({ qator_id: 12, tur: 'rs', kod: 'C2', nom: 'ГИПС', birlik: 'КГ', kat: 'МАТ', smeta_hajm: 2, smeta_summa: null, fakt_hajm: 2, fakt_summa: null, f2_hajm: 0, f2_summa: 0, qoldiq_hajm: 2, qoldiq_summa: null, f2_mumkin_hajm: 2, f2_mumkin_summa: null }),
  h({ qator_id: 13, tur: 'rs', kod: 'C1', nom: 'ЦЕМЕНТ', birlik: 'Т', kat: 'МАТ', smeta_hajm: 10, smeta_summa: 1000, fakt_hajm: 7, fakt_summa: 700, f2_hajm: 6, f2_summa: 600, qoldiq_hajm: 1, qoldiq_summa: 100, f2_mumkin_hajm: 1, f2_mumkin_summa: 100 }),
  h({ qator_id: 14, tur: 'rs', kod: 'C1', nom: 'ЦЕМЕНТ', birlik: 'Т', kat: 'МАТ', smeta_hajm: 5, smeta_summa: 500, fakt_hajm: 0, fakt_summa: 0, f2_hajm: 0, f2_summa: 0, qoldiq_hajm: 4, qoldiq_summa: 500, f2_mumkin_hajm: 0, f2_mumkin_summa: 0 }),
];
const PAKET: PaketXom = {
  format: 't2-paket/1', obyekt_id: 4, obyekt_nom: 'SINOV', kompaniya_id: 17, soni: 5,
  lugat: { nom: ['ГИПС', 'ИШ', 'РАЗДЕЛ', 'ЦЕМЕНТ'], kod: ['C1', 'C2', 'E1-1'], birlik: ['КГ', 'М3', 'Т'], tur: ['rz', 'bl', 'rs', 'mat', 'ob'], kat: ['МАТ'] },
  q: {
    id: [10, 11, 12, 13, 14], ota_id: [null, 10, 11, 11, 11], daraja: [0, 1, 2, 2, 2], tartib: [1, 2, 3, 3, 4],
    tur: [0, 1, 2, 2, 2], kat: [null, null, 0, 0, 0], kod: [null, 2, 1, 0, 0], nom: [2, 1, 0, 3, 3], birlik: [null, 1, 0, 2, 2],
    hajm: [null, 10, 2, 10, 5], narx: [null, null, null, 100, 100], summa: [1550, 1500, null, 1000, 500], norma: [null, null, 0.5, 1, null],
    narx_usul: [null, null, null, 'katalog', 'qolda'], versiya: [3, 1, 1, 2, 1], qoshimcha: [0, 0, 0, 0, 1], zamena: [0, 0, 0, 0, 1],
    xom_qator: { 10: 5 },
  },
  h: {
    fakt_hajm: [0, 4, 2, 7, 0], fakt_summa: [0, 400, null, 700, 0], f2_hajm: [0, 0, 0, 6, 0], f2_summa: [0, 0, 0, 600, 0],
    f2_summa_nomalum: [0, 0, 0, 0, 0], direct_fakt_hajm: [0, 4, 0, 7, 0], fakt_manbasi: [0, 0, 1, 0, 0],
    almashtirilgan_hajm: { 13: 3, 14: 1 }, almashtirilgan_summa: { 13: 300, 14: null },
  },
  f2: [{ akt_id: 90, raqam: '1', oy: '2026-09-01', holat: 'tasdiqlangan', lifecycle_status: 'approved', versiya: 2, hujjat_jami: 600, muhr_xesh: 'x' }],
  meta: { nk_manba: 'sukut' },
};
const nusxa = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

describe('paketDekod — struct-of-arrays', () => {
  it('NULL ≠ 0 (bitmap), lug‘at indeksi, id → indeks', () => {
    const p = paketDekod(nusxa(PAKET));
    expect(p.soni).toBe(5);
    expect(p.indeks.get(13)).toBe(3);
    expect(p.id).toBeInstanceOf(Float64Array);
    expect(p.hajm.q).toBeInstanceOf(Float64Array);
    expect(bormi(p.hajm, 0)).toBe(false);          // rz hajmi NULL
    expect(son(p.fakt_hajm, 0)).toBe(0);            // fakt 0 — bor, nol
    expect(son(p.fakt_summa, 2)).toBeNull();         // BL_NORMA, narxsiz — NULL
    expect(son(p.almashtirilgan_hajm, 0)).toBe(0);   // siyrak: yo'q kalit — 0
    expect(son(p.almashtirilgan_summa, 4)).toBeNull(); // kalit bor, qiymat null — NULL
    expect(p.kod.i[0]).toBe(-1);
    expect(p.fakt_manbasi[2]).toBe(1);
  });

  it('buzilgan shakl — PaketXato (jim yarim ma‘lumot yo‘q)', () => {
    expect(() => paketDekod({ ...nusxa(PAKET), format: 't2-paket/9' })).toThrow(PaketXato);
    const qisqa = nusxa(PAKET); qisqa.q.hajm.pop();
    expect(() => paketDekod(qisqa)).toThrow(/hajm uzunligi/);
    const lug = nusxa(PAKET); lug.q.nom[0] = 99;
    expect(() => paketDekod(lug)).toThrow(/lug'atda yo'q/);
    const tur = nusxa(PAKET); tur.q.tur[1] = null;
    expect(() => paketDekod(tur)).toThrow(/tur\[1\] bo'sh/);
    const tak = nusxa(PAKET); tak.q.id[1] = 10;
    expect(() => paketDekod(tak)).toThrow(/takror/);
    const beg = nusxa(PAKET); beg.h.almashtirilgan_hajm = { 999: 1 };
    expect(() => paketDekod(beg)).toThrow(/noma'lum id/);
  });
});

describe('materializator — joriy kanonik hisob-yadro kontrakti', () => {
  it('qatorlar aynan T2_DARAXT_USTUNLARI shaklida va tartibida', () => {
    const q = paketdanQatorlar(paketDekod(nusxa(PAKET)));
    expect(q).toEqual(ESKI_QATORLAR);
    for (const r of q) expect(Object.keys(r).sort()).toEqual(T2_DARAXT_USTUNLARI.split(',').sort());
  });

  it('holatlar T2_HOLAT_DARAXT_USTUNLARI shaklida, hosilalar joriy hisob-yadro kontrakti bilan', () => {
    const hs = paketdanHolatlar(paketDekod(nusxa(PAKET)));
    expect(hs).toEqual(ESKI_HOLATLAR);
    for (const r of hs) expect(Object.keys(r).sort()).toEqual(T2_HOLAT_DARAXT_USTUNLARI.split(',').sort());
  });

  it('daraxt (sbT2TreeQur) kanonik NULL fixture bilan bir xil', () => {
    const p = paketDekod(nusxa(PAKET));
    expect(sbT2TreeQur(paketdanQatorlar(p), paketdanHolatlar(p))).toEqual(sbT2TreeQur(ESKI_QATORLAR as T2Qator[], ESKI_HOLATLAR as T2QatorHolat[]));
  });

  it('katta sintetik obyekt (3000 qator, tasodifiy NULL) — kodlash → dekod → materializatsiya aylanib qaytadi', () => {
    let s = 12345; const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
    const yoki = <T,>(v: T): T | null => (rnd() < 0.15 ? null : v);
    const eski: Partial<T2Qator>[] = [];
    const turlar = ['rz', 'bl', 'rs', 'mat', 'ob'];
    for (let i = 0; i < 3000; i++) {
      eski.push({ id: 1000 + i * 3, obyekt_id: 4, obyekt: 'SINOV', ota_id: i ? 1000 + Math.floor(rnd() * i) * 3 : null, daraja: Math.floor(rnd() * 3),
        tartib: Math.floor(i / 2), tur: turlar[Math.floor(rnd() * 5)], kod: yoki('K' + Math.floor(rnd() * 50)), nom: yoki('НОМ ' + Math.floor(rnd() * 200)),
        birlik: yoki(['М3', 'Т', 'КГ'][Math.floor(rnd() * 3)]), hajm: yoki(Math.round(rnd() * 1e4) / 100), narx: yoki(Math.round(rnd() * 1e6) / 100),
        summa: yoki(Math.round(rnd() * 1e8) / 100), kat: yoki('МАТ'), narx_usul: yoki('katalog'), qoshimcha: rnd() < 0.1, zamena: rnd() < 0.05,
        xom_qator: yoki(i), versiya: 1 + Math.floor(rnd() * 5), norma: yoki(Math.round(rnd() * 100) / 100) });
    }
    // Server kodlashi (SQL bilan bir xil qoidalar): lug'at, tartib+id bo'yicha massiv, siyrak xom_qator.
    const lug = (k: keyof T2Qator) => [...new Set(eski.map((r) => r[k]).filter((v) => v != null) as string[])].sort();
    const L = { nom: lug('nom'), kod: lug('kod'), birlik: lug('birlik'), kat: lug('kat'), tur: turlar };
    const idx = (l: string[], v: unknown) => (v == null ? null : l.indexOf(v as string));
    const ust = <K extends keyof T2Qator>(k: K) => eski.map((r) => (r[k] ?? null)) as never;
    const n = eski.length; const nol = () => new Array(n).fill(0);
    const xom: PaketXom = {
      format: 't2-paket/1', obyekt_id: 4, obyekt_nom: 'SINOV', kompaniya_id: 17, soni: n, lugat: L,
      q: { id: ust('id'), ota_id: ust('ota_id'), daraja: ust('daraja'), tartib: ust('tartib'), tur: eski.map((r) => idx(L.tur, r.tur)),
        kat: eski.map((r) => idx(L.kat, r.kat)), kod: eski.map((r) => idx(L.kod, r.kod)), nom: eski.map((r) => idx(L.nom, r.nom)),
        birlik: eski.map((r) => idx(L.birlik, r.birlik)), hajm: ust('hajm'), narx: ust('narx'), summa: ust('summa'), norma: ust('norma'),
        narx_usul: ust('narx_usul'), versiya: ust('versiya'), qoshimcha: eski.map((r) => (r.qoshimcha ? 1 : 0)), zamena: eski.map((r) => (r.zamena ? 1 : 0)),
        xom_qator: Object.fromEntries(eski.filter((r) => r.xom_qator != null).map((r) => [r.id, r.xom_qator])) },
      h: { fakt_hajm: nol(), fakt_summa: nol(), f2_hajm: nol(), f2_summa: nol(), f2_summa_nomalum: nol(), direct_fakt_hajm: nol(), fakt_manbasi: nol(),
        almashtirilgan_hajm: {}, almashtirilgan_summa: {} },
      f2: [], meta: {},
    };
    const p = paketDekod(JSON.parse(JSON.stringify(xom)));
    expect(paketdanQatorlar(p)).toEqual(eski);
    const hs = paketdanHolatlar(p);
    expect(hs.map((x) => x.qator_id)).toEqual([...eski.map((r) => r.id!)].sort((a, b) => a - b));
    const birinchi = hs.find((x) => x.qator_id === eski[7].id)!;
    expect(birinchi.smeta_summa).toBe(eski[7].summa ?? null);
    expect(birinchi.qoldiq_summa).toBe(eski[7].summa ?? null);
  });
});

describe('api/t2-obyekt-paket — mijoz porti', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('paket va xato javoblari; keshsiz so‘rov', async () => {
    const chaqiruv: Array<{ url: string; init: RequestInit }> = [];
    let javob: Response = Response.json(PAKET);
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => { chaqiruv.push({ url, init }); return javob; }));
    const a = await obyektPaketOl(4);
    expect(a).toMatchObject({ ok: true });
    expect(a.ok && a.paket.soni).toBe(5);
    expect(chaqiruv[0].url).toBe('/api/obyekt-paket?obyekt_id=4');
    expect(chaqiruv[0].init.cache).toBe('no-store');
    javob = Response.json({ ok: false, code: 'PERMISSION_DENIED', error: 'yo‘q' }, { status: 403 });
    expect(await obyektPaketOl(4)).toEqual({ ok: false, status: 403, code: 'PERMISSION_DENIED', error: 'yo‘q' });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('tarmoq'); }));
    expect(await obyektPaketOl(4)).toMatchObject({ ok: false, status: 0 });
  });
});