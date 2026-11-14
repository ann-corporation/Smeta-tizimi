/**
 * Sahifa yo'li va shartnoma oylik paketi yo'li BIR XIL kirishdan BAYT-BAYT bir xil Excel beradi
 * (Nakopitelniy, M-29, Ostatka, Slichitelniy). API qatlami sintetik ma'lumot bilan almashtirilgan; haqiqiy summa/nom yo'q.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { T2Qator, T2QatorHolat } from '../../api/supabase';
import type { NakopitelniyQator } from '../../api/t2-nakopitelniy';
import type { M29F2Qator, M29SkladQator, M29SmetaQator } from '../m29';

const D = vi.hoisted(() => ({ rows: [] as unknown[], states: [] as unknown[], nak: [] as unknown[], f2: [] as unknown[], sklad: [] as unknown[], smeta: [] as unknown[] }));

vi.mock('../../api/supabase', async (orig) => ({
  ...(await orig<typeof import('../../api/supabase')>()),
  sbT2DaraxtOl: vi.fn(async () => ({ ok: true, qatorlar: D.smeta.length ? D.smeta : D.rows })),
  sbT2QatorHolatOl: vi.fn(async () => ({ ok: true, qatorlar: D.states })),
  sbOqi: vi.fn(async () => ({ ok: true, qatorlar: D.sklad })),
  sbT2KompaniyalarOl: vi.fn(async () => ({ ok: true, qatorlar: [{ id: 1, nom: 'Firma', toliq_nom: 'Firma MChJ' }] })),
}));
vi.mock('../../api/t2-ozgarish', () => ({ ozgarishMalumotOl: vi.fn(async () => new Map()) }));
vi.mock('../../api/t2-document-control', () => ({ ozgarishRoyxatOl: vi.fn(async () => ({ ozgarishlar: [] })) }));
vi.mock('../../api/t2-nakrutka', () => ({ t2ObyektNakrutka: vi.fn(async () => ({ ok: true, koeffitsientlar: null, nakrutka: null, shartnoma_id: null, nakrutka_podval_id: null, svod_yaxlit: null, nk_manba: null })) }));
vi.mock('../../api/t2-nakrutka-podval', () => ({
  obyektPodvaliOqi: vi.fn(async () => ({ ok: true, podval: null })),
  ustamaKontekstXatosi: () => null,
}));
vi.mock('../../api/t2-narx', () => ({ sbT2F2TafsilotOl: vi.fn(async () => ({ ok: true, toliq: true, qatorlar: D.f2 })) }));
vi.mock('../smeta-model', async (orig) => ({ ...(await orig<typeof import('../smeta-model')>()), smetaModeliniYukla: vi.fn(async () => (await orig<typeof import('../smeta-model')>()).smetaModeliQur([])) }));
vi.mock('../../api/t2-nakopitelniy', async (orig) => ({
  ...(await orig<typeof import('../../api/t2-nakopitelniy')>()),
  t2NakopitelniyToliq: vi.fn(async () => ({
    ok: true, generated_at: '2026-09-30T00:00:00Z', obyekt: { id: 7, nom: 'Obyekt-A', kompaniya_id: 1, loyiha_id: null }, davr: '2026-09-01', joriy_revision_id: null,
    qatorlar: D.nak, qatorlar_jami: D.nak.length, qatorlar_korsatildi: D.nak.length, truncated: false,
    davrlar: [{ oy: '2026-09-01', akt_id: 1, raqam: '1', holat: 'tasdiqlangan', hujjat_jami: null, davr_muhr: null, revision_id: null, joriy: true, oldingi: false, certified: true }],
    jami: { smeta_summa: 1000 },
  })),
}));

import { ostatkaHujjatQur, slichitelniyHujjatQur, ostatkaPaketFayli } from './ostatka-slichitelniy';
import { m29HujjatQur, m29KirishOl, m29PaketFayli } from './m29';
import { nakopitelniyAktlarKOplate, nakopitelniyHujjatQur, nakopitelniyOylarOl, nakopitelniyPaketFayli, nakopitelniyUstamaOl, nakopitelniyYukla } from './nakopitelniy';
import { obyektHujjatlariniYigish } from './paket';
import { daraxtToliqOl, istisnolarOl, ustamaManbaOl } from './ostatka-slichitelniy';

function q(id: number, ota_id: number | null, tur: string, hajm: number | null, extra: Partial<T2Qator> = {}): T2Qator {
  return {
    id, obyekt_id: 7, obyekt: 'X', kompaniya_id: 1, ota_id, daraja: 0, tartib: id, tur, kod: 'K' + id, nom: 'POZITSIYA ' + id,
    birlik: 'm3', hajm, narx: 100, summa: null, kat: tur === 'rs' ? 'MAT' : null, narx_usul: null, qoshimcha: false, zamena: false,
    d1: null, d2: null, d3: null, xom_qator: id, yangilandi: null, manba_id: null, versiya: 1, raqam: null, norma: null, ...extra,
  } as T2Qator;
}
function h(qator_id: number, fakt_hajm: number): T2QatorHolat {
  return { id: qator_id, qator_id, obyekt_id: 7, tur: null, kod: null, nom: null, birlik: null, kat: null, smeta_hajm: null, smeta_summa: null, fakt_hajm, fakt_summa: 0, f2_hajm: 0, f2_summa: 0, qoldiq_hajm: null, qoldiq_summa: null } as T2QatorHolat;
}
const nq = (qator_id: number, ota_id: number | null, tur: NakopitelniyQator['tur'], smeta_hajm: number): NakopitelniyQator => ({
  qator_id, tartib: qator_id, kod: 'K' + qator_id, nom: 'POZITSIYA ' + qator_id, birlik: 'm3', tur, kat: tur === 'rs' ? 'MAT' : null, qoshimcha: false, zamena: false, ota_id, daraja: ota_id ? 1 : 0,
  smeta_hajm, smeta_narx: 10, smeta_summa: smeta_hajm * 10, fakt_hajm: 1, fakt_summa: 10, oldingi_hajm: 0, oldingi_summa: 0, joriy_hajm: 1, joriy_summa: 10, joriy_qoralama_summa: 0,
  jami_hajm: 1, jami_summa: 10, jami_baseline_summa: 10, jami_actual_summa: 10, narx_variance_summa: 0, bajarilish_foiz: null, f2_mumkin_hajm: 0, qoldiq_hajm: smeta_hajm - 1, qoldiq_summa: (smeta_hajm - 1) * 10,
});

const SMETA_M29: M29SmetaQator[] = [
  { id: 1, ota_id: null, tur: 'rz', kod: null, nom: 'RAZDEL 1', birlik: null, hajm: null, narx: null, kat: null },
  { id: 2, ota_id: 1, tur: 'bl', kod: 'E1', nom: 'ISH BIR', birlik: '100 M3', hajm: 2, narx: null, kat: null },
  { id: 3, ota_id: 2, tur: 'mat', kod: '12-1', nom: 'MATERIAL BIR', birlik: 'M3', hajm: 203, narx: 800, norma: 101.5, kat: 'MAT' },
];
const F2_M29: M29F2Qator[] = [{ qator_id: 2, oy: '2026-08-01', hajm: 0.5, akt_holat: 'tasdiqlangan' }, { qator_id: 2, oy: '2026-09-01', hajm: 0.3, akt_holat: 'tasdiqlangan' }];
const SK: M29SkladQator[] = [{ operatsiya: 'rasxod', sana: '2026-09-15', nomi: 'MATERIAL BIR', birligi: 'M3', obyomi: 31 }];

const imzo = { zakazchik: 'Z-tomon', pudratchi: 'P-tomon' };
const tokenla = vi.fn(async () => ({ ok: true as const }));

beforeEach(() => {
  D.rows = [q(1, null, 'rz', null), q(2, 1, 'bl', 10), q(3, 2, 'rs', 20, { kat: 'MAT' }), q(4, 2, 'mat', 5), q(5, 2, 'ob', 3)];
  D.states = [h(2, 4), h(3, 8), h(4, 5), h(5, 1)];
  D.nak = [nq(1, null, 'rz', 0), nq(2, 1, 'bl', 10), nq(3, 2, 'rs', 20), nq(4, 2, 'mat', 5)];
  D.f2 = []; D.sklad = SK; D.smeta = []; tokenla.mockClear();
});

const teng = (a: Uint8Array, b: Uint8Array) => a.byteLength === b.byteLength && a.every((x, i) => x === b[i]);

describe('sahifa yo‘li === paket yo‘li (bayt-bayt)', () => {
  it('Ostatka', async () => {
    const d = await daraxtToliqOl(7); const u = await ustamaManbaOl(1, 7); const ist = await istisnolarOl(7);
    if (!d.ok || !u.ok) throw new Error('mock');
    const sahifa = ostatkaHujjatQur({ rows: d.rows, states: d.states, istisnolar: ist.istisnolar, ustama: u.ustama, obyektNom: 'Obyekt-A', imzo });
    const paket = await ostatkaPaketFayli({ kompaniyaId: 1, obyektId: 7, obyektNom: 'Obyekt-A', imzo, tur: 'ostatka' });
    expect(sahifa.fayl).not.toBeNull();
    expect(paket.ok && teng(paket.bytes, sahifa.fayl!.bytes)).toBe(true);
    expect(paket.ok && paket.nom).toBe(sahifa.fayl!.faylNomi);
  });
  it('Slichitelniy', async () => {
    const d = await daraxtToliqOl(7); const u = await ustamaManbaOl(1, 7); const ist = await istisnolarOl(7);
    if (!d.ok || !u.ok) throw new Error('mock');
    const sahifa = slichitelniyHujjatQur({ rows: d.rows, states: d.states, istisnolar: ist.istisnolar, ustama: u.ustama, obyektNom: 'Obyekt-A', imzo });
    const paket = await ostatkaPaketFayli({ kompaniyaId: 1, obyektId: 7, obyektNom: 'Obyekt-A', imzo, tur: 'slichitelniy' });
    expect(sahifa.fayl).not.toBeNull();
    expect(paket.ok && teng(paket.bytes, sahifa.fayl!.bytes)).toBe(true);
  });
  it('M-29', async () => {
    D.smeta = SMETA_M29; D.f2 = F2_M29.map((x) => ({ ...x }));
    const y = await m29KirishOl(7);
    const sahifa = m29HujjatQur({ kirish: y.kirish, davr: '2026-09', obyektNom: 'Obyekt-A', pudratchi: 'Firma MChJ', imzo });
    const paket = await m29PaketFayli({ kompaniyaId: 1, obyektId: 7, obyektNom: 'Obyekt-A', oy: '2026-09', imzo });
    expect(paket.ok && teng(paket.bytes, sahifa.bytes)).toBe(true);
  });
  it('M-29: ma‘lumot yo‘q oy - xato emas, «bosh»', async () => {
    D.smeta = SMETA_M29; D.f2 = F2_M29.map((x) => ({ ...x }));
    const p = await m29PaketFayli({ kompaniyaId: 1, obyektId: 7, obyektNom: 'Obyekt-A', oy: '2027-01', imzo });
    expect(p.ok).toBe(false);
    expect(!p.ok && p.bosh).toBe(true);
  });
  it('Nakopitelniy', async () => {
    const y = await nakopitelniyYukla(7, '2026-09-01');
    if ('xato' in y) throw new Error(y.xato);
    const ustama = await nakopitelniyUstamaOl(1, 7);
    const oylar = await nakopitelniyOylarOl(7, String(y.r.davr));
    const aktlarKOplate = await nakopitelniyAktlarKOplate(1, 7, 'Obyekt-A', String(y.r.davr));
    const sahifa = nakopitelniyHujjatQur({ qatorlar: y.qatorlar, jami: y.r.jami ?? null, obyektNom: 'Obyekt-A', davr: String(y.r.davr), ustama, oylar, imzo, ndsFoiz: 12, aktlarKOplate });
    const paket = await nakopitelniyPaketFayli({ kompaniyaId: 1, obyektId: 7, obyektNom: 'Obyekt-A', oy: '2026-09', imzo, ndsFoiz: 12 });
    expect(paket.ok && teng(paket.bytes, sahifa.bytes)).toBe(true);
  });
  it('paket yig‘uvchi: har hujjat token bilan, «Tayyorgarlik» kataklari haqiqiy fayldan', async () => {
    D.smeta = SMETA_M29; D.f2 = F2_M29.map((x) => ({ ...x }));
    D.rows = SMETA_M29.map((s) => q(s.id, s.ota_id, s.tur ?? 'rz', s.hajm, { nom: s.nom ?? '', narx: s.narx ?? null })); D.states = [h(2, 1)];
    const r = await obyektHujjatlariniYigish({ kompaniyaId: 1, obyekt: { id: 7, nom: 'Obyekt-A' }, oy: '2026-09', imzo, ndsFoiz: 12, pudratchi: 'Firma MChJ', tokenla });
    expect(r.fayllar.map((f) => f.tur).sort()).toEqual(['m29', 'nakopitelniy', 'ostatka', 'slichitelniy']);
    expect(tokenla).toHaveBeenCalledTimes(4);
    expect(Object.values(r.kataklar).every((k) => k?.holat === 'ok')).toBe(true);
    expect(r.otkazilgan).toEqual([]);
  });
  it('token rad etilsa fayl paketga kirmaydi va katak ✗ bo‘ladi', async () => {
    D.smeta = SMETA_M29; D.f2 = F2_M29.map((x) => ({ ...x }));
    const rad = vi.fn(async () => ({ ok: false as const, xabar: 'Token yetmaydi' }));
    const r = await obyektHujjatlariniYigish({ kompaniyaId: 1, obyekt: { id: 7, nom: 'Obyekt-A' }, oy: '2026-09', imzo, ndsFoiz: 12, pudratchi: null, tokenla: rad });
    expect(r.fayllar).toEqual([]);
    expect(r.kataklar.m29?.holat).toBe('yoq');
    expect(r.otkazilgan.some((x) => x.includes('Token yetmaydi'))).toBe(true);
  });
});
