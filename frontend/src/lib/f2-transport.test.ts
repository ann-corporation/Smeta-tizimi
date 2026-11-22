import { describe, expect, it } from 'vitest';
import type { T2Qator } from '../api/supabase';
import { f2Hujjat } from './f2-hujjat';
import { NAMUNA_NAKRUTKA } from './f2-hujjat.fixture';
import { readXlsx } from './f2-import-parse/xlsxReader';
import type { F2Bolim, F2Qator, F2Resurs } from './f2-tayyor';
import { formulalarniQaytaHisobla } from './hujjat-yozuvchi/test-formula';
import { SPRAVKA_NOMLAR, SPRAVKA_SARLAVHA, TKM_PREFIKS, tashishIshimi, tkmQatorlar, tkmSarlavha, transportTartib } from './f2-transport';
import { kesimgaQosh, bosKesim, hisob, standartPodval, trChiqarKaliti } from './hisob-yadro';

describe('f2-transport: sof yordamchilar', () => {
  it('tkmQatorlar: faqat bog\'langan qatorlar (transport qatori → material)', () => {
    const m = tkmQatorlar([{ id: 1 }, { id: 2, transport_usul: 'tkm' }, { id: 3, transport_manba_qator_id: 2 }]);
    expect([...m.entries()]).toEqual([[3, 2]]);
    expect(tkmQatorlar(undefined).size).toBe(0);
  });

  it('tkmSarlavha: qisqa o\'qiladigan nom; zichlik 1 — «1 т»; ma\'lumot yo\'q — o\'z nomi', () => {
    expect(tkmSarlavha('X', { material: 'ГПС', zichlik: 1.5, km: 14.5, narx: 1227.1 })).toBe(`${TKM_PREFIKS}ГПС — 1,5 т/м³ × 14,5 км × 1${'\u00a0'}227,1 сум/т·км`);
    expect(tkmSarlavha('X', { material: 'ЩЕБЕНЬ', zichlik: 1, km: 10, narx: 5 })).toContain('— 1 т × 10 км');
    expect(tkmSarlavha('Т-1', {})).toBe(`${TKM_PREFIKS}Т-1`);
    expect(tkmSarlavha('↳ ТРАНСПОРТ Т·КМ: Q', {})).toBe('ТРАНСПОРТ Т·КМ: Q');
  });

  it('transportTartib: t·km qatori materialining to\'g\'ridan-to\'g\'ri tagiga; qolgan tartib saqlanadi', () => {
    const l = [{ id: 10 }, { id: 11 }, { id: 12 }, { id: 13 }];
    expect(transportTartib(l, new Map([[13, 10]])).map((x) => x.id)).toEqual([10, 13, 11, 12]);
    expect(transportTartib(l, new Map([[13, 99]])).map((x) => x.id)).toEqual([10, 11, 12, 13]);
    expect(transportTartib(l, new Map<number, number>())).toBe(l);
  });

  it('tashishIshimi: Е310 / С310 / Е311 (kirill va lotin), boshqa shifr emas', () => {
    for (const k of ['Е310-0101', 'С310-1005', 'E311-0001', 'C310-2', ' Е310 ']) expect(tashishIshimi(k)).toBe(true);
    for (const k of ['Е3101-1', 'Е312-1', 'С201-1', '', null, undefined]) expect(tashishIshimi(k as string | null | undefined)).toBe(false);
  });
});

describe('hisob-yadro: transport-% bazasidan chiqarish (server tr_ex_* bilan bir xil)', () => {
  const nk = { ...NAMUNA_NAKRUTKA };
  const kesim = (usul: string | null) => {
    const k = bosKesim();
    kesimgaQosh(k, 'МАТ', 1000, false, usul);
    kesimgaQosh(k, 'МАТ', 500, false, null);
    return k;
  };
  const trMat = (usul: string | null) => hisob(kesim(usul), { koef: nk }).ustama.find((q) => q.kod === 'tr_mat')!.summa as number;
  it('tkm / narx_ichida material transport-% bazasidan chiqadi; foiz va usulsiz — avvalgidek', () => {
    const f = Number(nk['ТРАНСПОРТ_МАТЕРИАЛ']);
    expect(trMat(null)).toBeCloseTo((1500 * f) / 100, 2);
    expect(trMat('foiz')).toBeCloseTo((1500 * f) / 100, 2);
    expect(trMat('tkm')).toBeCloseTo((500 * f) / 100, 2);
    expect(trMat('narx_ichida')).toBeCloseTo((500 * f) / 100, 2);
  });
  it('boshqa foizlar (складские, прочие) bazasi o\'zgarmaydi', () => {
    const a = hisob(kesim(null), { koef: nk }).ustama.find((q) => q.kod === 'skl_mat')!.summa;
    const b = hisob(kesim('tkm'), { koef: nk }).ustama.find((q) => q.kod === 'skl_mat')!.summa;
    expect(b).toBe(a);
    expect(trChiqarKaliti(standartPodval(nk).qatorlar.find((q) => q.kod === 'tr_mat')!)).toBe('ТР_МАТ');
    expect(trChiqarKaliti(standartPodval(nk).qatorlar.find((q) => q.kod === 'prochie')!)).toBeNull();
  });
});

/** Sintetik hujjat: tkm material (11) + t·km qatori (13), narx_ichida material (14), oddiy material (12). */
function hujjat(tkmBor: boolean) {
  const res = (id: number, kat: string, nom: string): F2Resurs => ({ id, tur: 'mat', kat, kod: String(id), nom, birlik: 'Т', norma: null, mumkin: 10, avto: false, taklifNarx: 100, taklifManba: 'smeta' });
  const bolim: F2Bolim = { id: 10, nom: 'ДОРОГА', daraja: 0, ishlar: [], alohida: [res(11, 'МАТ', 'АСФАЛЬТ'), res(12, 'МАТ', 'ЩЕБЕНЬ'), res(14, 'МАТ', 'БЕТОН'), res(13, 'МАШ', 'ПЕРЕВОЗКА')] };
  const q = (id: number, kat: string, nom: string, hajm: number, narx: number): F2Qator => ({ id, ishId: null, tur: 'mat', kat, nom, birlik: 'Т', hajm, narx, summa: Math.round(hajm * narx * 100) / 100, manba: 'smeta', narxsiz: false });
  const qatorlar = [q(11, 'МАТ', 'АСФАЛЬТ', 10, 100), q(12, 'МАТ', 'ЩЕБЕНЬ', 3, 100), q(14, 'МАТ', 'БЕТОН', 5, 100), q(13, 'МАШ', 'ПЕРЕВОЗКА', 210, 10)];
  const rows = [
    { id: 11, obyekt_id: 1, tur: 'mat', kat: 'МАТ', nom: 'АСФАЛЬТ', transport_usul: tkmBor ? 'tkm' : null },
    { id: 12, obyekt_id: 1, tur: 'mat', kat: 'МАТ', nom: 'ЩЕБЕНЬ' },
    { id: 14, obyekt_id: 1, tur: 'mat', kat: 'МАТ', nom: 'БЕТОН', transport_usul: tkmBor ? 'narx_ichida' : null },
    { id: 13, obyekt_id: 1, tur: 'mat', kat: 'МАШ', nom: 'ПЕРЕВОЗКА', transport_manba_qator_id: tkmBor ? 11 : null, transport_zichlik: tkmBor ? 1.5 : null, transport_km: tkmBor ? 14 : null },
  ] as unknown as T2Qator[];
  return f2Hujjat([bolim], qatorlar, { obyektNom: 'T', davr: '2026-10', raqam: '1', nakrutka: NAMUNA_NAKRUTKA, ndsFoiz: 12, rows });
}
const JAMI = 1000 + 300 + 500 + 2100;

describe('f2Hujjat: t·km transport ko\'rinishi (tirik formulalar)', () => {
  it('t·km qatori materialining tagida; norma/hajm materialga tirik formula; formulalar qayta hisoblanganda keshga teng', async () => {
    const r = hujjat(true);
    const g = (await readXlsx(r.bytes)).sheet('Ф-2')!.rows;
    const nomlar = g.map((x) => String(x[2] ?? ''));
    const i = nomlar.indexOf('АСФАЛЬТ');
    expect(i).toBeGreaterThan(-1);
    expect(nomlar[i + 1]).toBe(`${TKM_PREFIKS}АСФАЛЬТ — 1,5 т/м³ × 14 км × 10 сум/т·км`.toUpperCase()); // hujjat nomlari KATTA HARFDA
    expect(nomlar[i + 2]).toBe('ЩЕБЕНЬ');
    const fx = (await readXlsx(r.bytes)).sheet('Ф-2')!.formulalar!;
    expect(fx[i + 1][5]).toBe(`ROUND(F${i + 1}*1.5*14,6)`); // F — hajm; material qatori Excel raqami i + 1
    expect(r.jami).toBe(JAMI);
    const h = formulalarniQaytaHisobla(r.bytes);
    expect(h.xato.filter((x) => !x.includes('FUNKSIYA_YOQ ABS'))).toEqual([]); // ABS — faqat Ведомость (test yordamchisi bilmaydi)
    expect(h.farq).toEqual([]);
    expect(h.soni).toBeGreaterThan(5);
  });

  it('podval: tkm va narx_ichida material transport-% bazasidan chiqadi (SUMIFS formulasi), СПРАВОЧНО — SUMIF formulalari', async () => {
    const r = hujjat(true);
    const sh = (await readXlsx(r.bytes)).sheet('Ф-2')!;
    const g = sh.rows; const fx = sh.formulalar!;
    const qator = (b: string) => g.findIndex((x) => String(x[2] ?? '').toUpperCase().startsWith(b.toUpperCase()));
    const f = Number(NAMUNA_NAKRUTKA['ТРАНСПОРТ_МАТЕРИАЛ']);
    const tr = qator('Транспортные расходы — материалы');
    expect(Number(g[tr][7])).toBeCloseTo((300 * f) / 100, 2); // faqat oddiy material (3 x 100)
    expect(fx[tr][7]).toContain('-H');
    expect(g.some((x) => String(x[2] ?? '').toUpperCase().startsWith('В Т.Ч. МАТЕРИАЛЫ С ОТДЕЛЬНЫМ ТРАНСПОРТОМ'))).toBe(true);
    const sp = g.findIndex((x) => x.some((c) => String(c ?? '').toUpperCase().startsWith(SPRAVKA_SARLAVHA.toUpperCase())));
    expect(sp).toBeGreaterThan(-1);
    expect(String(g[sp + 2][2]).toUpperCase()).toBe(SPRAVKA_NOMLAR.tkm.toUpperCase());
    expect(Number(g[sp + 2][7])).toBe(2100);
    expect(fx[sp + 2][7]).toMatch(/^SUMIF\(L\d+:L\d+,"т·км",H\d+:H\d+\)$/);
    expect(Number(g[sp + 3][7])).toBeCloseTo((300 * f) / 100, 2);
    expect(String(g[sp + 4][2]).toUpperCase()).toBe(SPRAVKA_NOMLAR.tashish.toUpperCase());
  });

  it('REGRESSIYA: t·km yo\'q — prefiks, справка va L ustuni yo\'q; jami bir xil', async () => {
    const r = hujjat(false);
    const g = (await readXlsx(r.bytes)).sheet('Ф-2')!.rows;
    const barcha = g.flat().map((x) => String(x ?? ''));
    expect(barcha.some((s) => s.toUpperCase().includes(TKM_PREFIKS.toUpperCase()) || s.toUpperCase().includes('СПРАВОЧНО') || s.toUpperCase().startsWith('В Т.Ч. МАТЕРИАЛЫ'))).toBe(false);
    expect(g.every((x) => x.length <= 11)).toBe(true);
    expect(r.jami).toBe(JAMI);
    expect(formulalarniQaytaHisobla(r.bytes).farq).toEqual([]);
  });
});