/**
 * SINOV (fakt bo'g'ini): Holat sahifasi Fakt / F2 / Qoldiq kartalari — svod yaxlit bo'limli obyekt (SINTETIK, masshtablangan agregatlar)
 * (sintetik masshtablangan agregatlar). Maqsad: kartadagi raqamlar lib hisobidan aynan chiqishini ko'rsatish.
 */
import { describe, expect, it } from 'vitest';
import { svodKorinishKesimi, type SvodYaxlit } from './svod-yaxlit';
import { qiymatUchligi, ustamaliHisobla } from './ustamali-summa';
import { yaxlit2 } from './hisob-yadro';

const KOEF = { 'НДС': 12, 'РИСК': 0, 'СТРАХОВАНИЕ': 0.32, 'ЗТР_СОЦСТРАХ': 12, 'СКЛАДСКИЕ_МК': 0.75, 'ПРОЧИЕ_ПОДРЯДЧИК': 18, 'ТРАНСПОРТ_КАБЕЛЬ': 1.5, 'ТРАНСПОРТ_ОБОРУД': 2, 'ЗАГОТ_СКЛАД_ОБОРУД': 0, 'СКЛАДСКИЕ_МАТЕРИАЛ': 2, 'ТРАНСПОРТ_МАТЕРИАЛ': 5 };
const bz = (kod: string, nom: string, tur: string, baza: unknown[], extra: Record<string, unknown> = {}) => ({ kod, nom, tur, baza, ...extra });
const PODVAL = {
  versiya: 1, nom: 'podval 29',
  qatorlar: [
    bz('pryamye', 'p', 'jami', [{ k: 1, kat: 'ЧЕЛ' }, { k: 1, kat: 'МАШ' }, { k: 1, kat: 'МАТ' }, { k: 1, kat: 'ОБ' }, { k: 1, kat: 'КАБ' }, { k: 1, kat: 'М/К' }, { k: 1, kat: 'БЕЗ СКЛАД' }]),
    bz('tr_mat', 'tr', 'foiz', [{ k: 1, kat: 'МАТ' }, { k: 1, kat: 'М/К' }, { k: 1, kat: 'БЕЗ СКЛАД' }], { foiz: 5, manba: 'smeta', koefKod: 'ТРАНСПОРТ_МАТЕРИАЛ' }),
    bz('skl_mat', 'sk', 'foiz', [{ k: 1, kat: 'МАТ' }, { k: 1, kat: 'КАБ' }], { foiz: 2, manba: 'smeta', koefKod: 'СКЛАДСКИЕ_МАТЕРИАЛ' }),
    bz('skl_mk', 'skmk', 'foiz', [{ k: 1, kat: 'М/К' }], { foiz: 0.75, manba: 'smeta', koefKod: 'СКЛАДСКИЕ_МК' }),
    bz('tr_kab', 'trkab', 'foiz', [{ k: 1, kat: 'КАБ' }], { foiz: 1.5, manba: 'smeta', koefKod: 'ТРАНСПОРТ_КАБЕЛЬ' }),
    bz('itogo1', 'i1', 'jami', [{ k: 1, qator: 'pryamye' }, { k: -1, kat: 'ОБ' }, { k: 1, qator: 'tr_mat' }, { k: 1, qator: 'skl_mat' }, { k: 1, qator: 'skl_mk' }, { k: 1, qator: 'tr_kab' }]),
    bz('prochie', 'pr', 'foiz', [{ k: 1, qator: 'itogo1' }], { foiz: 18, manba: 'smeta', koefKod: 'ПРОЧИЕ_ПОДРЯДЧИК' }),
    bz('itogo2', 'i2', 'jami', [{ k: 1, qator: 'itogo1' }, { k: 1, qator: 'prochie' }]),
    bz('tr_ob', 'trob', 'foiz', [{ k: 1, kat: 'ОБ' }], { foiz: 2, manba: 'meros', koefKod: 'ТРАНСПОРТ_ОБОРУД' }),
    bz('zag_ob', 'zag', 'foiz', [{ k: 1, kat: 'ОБ' }], { foiz: 1.2, manba: 'meros', koefKod: 'ЗАГОТ_СКЛАД_ОБОРУД' }),
    bz('itogo3', 'i3', 'jami', [{ k: 1, qator: 'itogo2' }, { k: 1, kat: 'ОБ' }, { k: 1, qator: 'tr_ob' }, { k: 1, qator: 'zag_ob' }]),
    bz('strax', 'st', 'foiz', [{ k: 1, qator: 'itogo3' }], { foiz: 0.32, manba: 'smeta', koefKod: 'СТРАХОВАНИЕ' }),
    bz('risk', 'rk', 'foiz', [{ k: 1, qator: 'itogo3' }], { foiz: 0, manba: 'smeta', koefKod: 'РИСК' }),
    bz('itogo4', 'i4', 'jami', [{ k: 1, qator: 'itogo3' }, { k: 1, qator: 'strax' }, { k: 1, qator: 'risk' }]),
    bz('nds', 'nds', 'foiz', [{ k: 1, qator: 'itogo4' }], { foiz: 12, manba: 'smeta', koefKod: 'НДС' }),
    bz('vsego', 'v', 'jami', [{ k: 1, qator: 'itogo4' }, { k: 1, qator: 'nds' }]),
  ],
};
const bolim = (id: number, qqssiz: number, barglar: number, svod: number) => ({ id: id - 950964, qator_id: id, nom: null, svod_summa: svod, qqs_stavka: 12, qqssiz, barglar, asos: 'svod' as const, dalil: {} });
const SVOD: SvodYaxlit = {
  qqssiz: 58242340.32, barglar: 53869308.86, summasiz: 0,
  bolimlar: [bolim(950967, 20949616.07, 17505456.73, 23463570), bolim(950968, 18156545.62, 15179534.75, 20335331.09), bolim(950969, 19136178.63, 21184317.38, 21432520.06)],
};

type G = { bolim: number | null; kat: string; smeta: number; fakt: number; f2: number; ost: number };
const G_: G[] = [
  { bolim: 950967, kat: 'МАТ', smeta: 1087537.03, fakt: 0, f2: 0, ost: 1087537.03 },
  { bolim: 950967, kat: 'ЧЕЛ', smeta: 16417919.7, fakt: 16417919.7, f2: 16417919.7, ost: 0 },
  { bolim: 950968, kat: 'МАТ', smeta: 1476636.61, fakt: 0, f2: 0, ost: 1476636.61 },
  { bolim: 950968, kat: 'ЧЕЛ', smeta: 13702898.14, fakt: 13516668.75, f2: 13516668.75, ost: 186229.39 },
  { bolim: 950969, kat: 'ОБ', smeta: 21184317.38, fakt: 17311561.86, f2: 17311561.86, ost: 3872755.52 },
  { bolim: null, kat: 'БЕЗСКЛАД', smeta: 1231447, fakt: 861649.23, f2: 861649.23, ost: 369660.88 },
  { bolim: null, kat: 'КАБ', smeta: 162843.9, fakt: 0, f2: 0, ost: 162843.9 },
  { bolim: null, kat: 'М/К', smeta: 899102.22, fakt: 3566.508928571428, f2: 0, ost: 899102.22 },
  { bolim: null, kat: 'МАТ', smeta: 4437595.43, fakt: 1949164.92, f2: 2020759.65, ost: 2468870.79 },
  { bolim: null, kat: 'МАШ', smeta: 691773.68, fakt: 576467.14, f2: 602278.32, ost: 100022.82 },
  { bolim: null, kat: 'ЧЕЛ', smeta: 1391833.91, fakt: 715238.51, f2: 715238.51, ost: 676744.13 },
];
const daraxt = [
  ...[950967, 950968, 950969].map((id) => ({ id, ota_id: null as number | null })),
  ...G_.map((g, i) => ({ id: 900000 + i, ota_id: g.bolim })),
];
type B = G & { id: number };
const barglar: B[] = G_.map((g, i) => ({ ...g, id: 900000 + i }));
const sum = (k: 'smeta' | 'fakt' | 'f2' | 'ost') => yaxlit2(G_.reduce((a, g) => a + g[k], 0));

function karta(k: 'smeta' | 'fakt' | 'f2' | 'ost', opts: { masshtab?: boolean; f2?: boolean }) {
  const jami = sum(k);
  const kesim = svodKorinishKesimi(daraxt, barglar, { id: (b) => b.id, kat: (b) => b.kat, summa: (b) => b[k], smeta: (b) => b.smeta }, SVOD, { jami, ...opts });
  const u = ustamaliHisobla(kesim, KOEF, PODVAL as never);
  return { jami, u, q: qiymatUchligi(u, jami) };
}

describe('sinov-fakt: svod yaxlit obyekt kartalari sintetik (real nisbatlari saqlangan, masshtablangan) agregatlar bilan', () => {
  it("fakt/F2 ustamasiz jami agregatlardan yig'iladi", () => {
    expect(sum('f2') / sum('fakt')).toBeGreaterThan(1);
    expect(sum('f2') / sum('fakt')).toBeLessThan(1.01);
  });
  it('kartalar QQS bilan', () => {
    const fakt = karta('fakt', {}), f2 = karta('f2', { masshtab: false, f2: true }), ost = karta('ost', {});
    expect(fakt.q.qqsBilan).not.toBeNull();
    // Fakt (svod bo'limlari masshtablanadi) va F2 (aynan) ustamasiz deyarli teng, QQS bilanda farq bor - sinov hujjati (dizayn qoidasi, egasi tasdiqlaydi).
    expect(f2.q.qqsBilan! - fakt.q.qqsBilan!).toBeGreaterThan(0);
  });
});

