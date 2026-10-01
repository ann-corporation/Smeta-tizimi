import { describe, expect, it } from 'vitest';
import { f2Hujjat } from './f2-hujjat';
import { bosKiritma, f2Qatorlar, f2Qur } from './f2-tayyor';
import { hujjatTekshir, imzoRollariBormi } from './hujjat-yozuvchi';
import { namunaSaqla } from './hujjat-yozuvchi/test-yordam';
import { readXlsx } from './f2-import-parse/xlsxReader';
import { f2FaylOqiCore, f2UstunAniqla } from './f2-import-parse';
import { imzoNomlariTomonlardan, imzoRollari } from './shartnoma-liniya';
import { AKT246_HAJM, AKT246_HOLAT, AKT246_ROWS, NAMUNA_NAKRUTKA } from './f2-hujjat.fixture';

const tayyorla = () => {
  const b = f2Qur(AKT246_ROWS, AKT246_HOLAT);
  const q = f2Qatorlar(b, { ...bosKiritma(), hajm: AKT246_HAJM });
  return { b, q };
};

describe('Ф-2 hujjati (LRV_PLUS asosiy ustunlari, tirik formulalar)', () => {
  it('haqiqiy akt 246: ИТОГО 150 026 606,32; ustunlar A–I; $ yo‘q; imzolar', () => {
    const { b, q } = tayyorla();
    expect(q.every((x) => !x.xato)).toBe(true);
    const r = f2Hujjat(b, q, { obyektNom: 'Fast Food 1-etaj', davr: '2026-10-01', raqam: '1', ndsFoiz: 12, nakrutka: NAMUNA_NAKRUTKA,
      imzo: { zakazchik: 'Дирекция «Навоий бог»', pudratchi: 'ООО «NEW TIMES BUILDINGS»' }, shartnoma: '№ 45 от 01.07.2026' });
    namunaSaqla('F2_akt246_namuna.xlsx', r.bytes);
    expect(r.jami).toBeCloseTo(150026606.32, 2);
    expect(r.faylNomi).toBe('Fast Food 1-etaj_АКТ_Ф-2_№1_2026-10.xlsx');
    const t = hujjatTekshir(r.bytes);
    expect(t.taqiqlangan).toEqual([]);
    expect(t.dollarFormulalar).toEqual([]);
    expect(t.keshsizFormulalar).toEqual([]);
    expect(imzoRollariBormi(t, ['ЗАКАЗЧИК', 'ПОДРЯДЧИК', 'ТЕХНАДЗОР']).yoq).toEqual([]);
    const k = t.varaqlar[0].kataklar;
    // Ish hajmi o'zgarsa — resurs miqdori o'zgaradi: F(resurs) = ROUND(E × F(ish); 6).
    const ishF = k.find((x) => x.ref.startsWith('F') && x.v === '67.4')!;
    const ishQ = Number(ishF.ref.slice(1));
    expect(k.find((x) => x.ref === `F${ishQ + 1}`)?.f).toBe(`ROUND(E${ishQ + 1}*F${ishQ},6)`);
    expect(k.find((x) => x.ref === `H${ishQ + 1}`)?.f).toBe(`ROUND(F${ishQ + 1}*G${ishQ + 1},2)`);
    expect(k.find((x) => x.ref === `H${ishQ}`)?.f).toMatch(/^SUM\(H\d+:H\d+\)$/);
    expect(k.some((x) => x.f?.startsWith('SUMIF(J'))).toBe(true);                 // podval — xarajat turi bo'yicha
    expect(t.matnlar.some((s) => s.includes('Итого по разделу «НАРУЖНАЯ ОТДЕЛКА»'))).toBe(true);
    expect(t.matnlar).toContain('АКТ ПРИЕМКИ ВЫПОЛНЕННЫХ РАБОТ № 1 (ФОРМА № 2)');
    expect(k.some((x) => /^[K-Z]\d/.test(x.ref))).toBe(false);                     // ko'rinadigan A–I + yashirin J, boshqa yo'q
  });

  it('ROUND-TRIP: tizim chiqargan Ф-2 ni F2 import aynan o‘qiydi (ish, resurs, material, hajm, summa)', async () => {
    const { b, q } = tayyorla();
    const r = f2Hujjat(b, q, { obyektNom: 'Fast Food 1-etaj', davr: '2026-10', raqam: '1', nakrutka: NAMUNA_NAKRUTKA, ndsFoiz: 12 });
    const wb = await readXlsx(r.bytes);
    expect(wb.sheets.map((x) => x.name)).toEqual(['Ф-2', 'Ведомость ресурсов']);
    const grid = wb.sheet('Ф-2')!.rows;
    const cols = f2UstunAniqla(grid);
    expect([cols.kod, cols.nom, cols.bir, cols.norma, cols.obyom, cols.narx, cols.sum]).toEqual([1, 2, 3, 4, 5, 6, 7]);
    const res = f2FaylOqiCore(grid, cols);
    if (!('tree' in res)) throw new Error('daraxt yo‘q');
    const tugun = res.tree.flatMap((rz) => rz.children ?? []);
    const ishlar = tugun.filter((x) => x.type === 'bl');
    expect(ishlar.map((x) => [x.kod, x.hajm, x.children?.length])).toEqual([['Е1202-001-01', 0.1344, 8], ['Е1501-026-01 ДОП. 6', 0.092, 12], ['Е0904-002-03', 67.4, 19]]);
    expect(tugun.filter((x) => x.type === 'mat').map((x) => [x.nom, x.hajm, x.summa])).toEqual([['ОБЛИЦОВКА ИЗ ГРАНИТНОЙ ПЛИТКИ КУК САРОЙ', 9.2, 1610000]]);
    const barglar = [...ishlar.flatMap((x) => x.children ?? []), ...tugun.filter((x) => x.type !== 'bl')];
    expect(barglar).toHaveLength(q.filter((x) => x.tur !== 'bl').length);
    const jami = barglar.reduce((s2, x) => s2 + (x.summa ?? 0), 0);
    expect(Math.round(jami * 100) / 100).toBe(150026606.32);
    // Har qator hajmi aktdagi bilan aynan (resurs hajmi — formulaning keshi).
    const aktHajm = new Set(q.map((x) => `${x.nom}|${x.hajm}`));
    for (const x of barglar) expect(aktHajm.has(`${x.nom}|${x.hajm}`)).toBe(true);
  });

  it('resurs vedomosti: turlar bo‘yicha, Ф-2 ga havola formulalar, akt bilan solishtiruv 0', () => {
    const { b, q } = tayyorla();
    const t = hujjatTekshir(f2Hujjat(b, q, { obyektNom: 'Fast Food 1-etaj', davr: '2026-10', raqam: '1' }).bytes);
    const v = t.varaqlar.find((x) => x.nom === 'Ведомость ресурсов')!;
    expect(t.matnlar).toEqual(expect.arrayContaining(['ЗАТРАТЫ ТРУДА РАБОЧИХ (ЧЕЛ)', 'МАШИНЫ И МЕХАНИЗМЫ (МАШ)', 'МАТЕРИАЛЫ (МАТ)', 'МАТЕРИАЛЫ БЕЗ СКЛАДСКОГО ХРАНЕНИЯ (БЕЗ СКЛАД)']));
    // ЧЕЛ uchta ishda bor — bitta qatorga yig'iladi, uchta havola bilan.
    const chel = v.kataklar.find((x) => x.ref.startsWith('E') && (x.f ?? '').startsWith("ROUND('Ф-2'!F") && ((x.f ?? '').match(/'Ф-2'!F/g) ?? []).length === 3);
    expect(chel).toBeTruthy();
    const sverka = v.kataklar.find((x) => (x.f ?? '').includes("-'Ф-2'!H"));
    expect(sverka?.v).toBe('0');
    expect(t.keshsizFormulalar).toEqual([]);
    expect(t.taqiqlangan).toEqual([]);
  });

  it('imzolovchilar shartnoma tomonlaridan; 3 tomonlama — СУБПОДРЯДЧИК qo‘shiladi', () => {
    const n = imzoNomlariTomonlardan([{ rol: 'Buyurtmachi', nom: 'Дирекция' }, { rol: 'Bosh pudratchi', nom: 'ООО «Генподряд»' }, { rol: 'Subpudratchi', nom: 'ООО «Суб»' }, { rol: 'Texnik nazorat', nom: 'ГУП «Надзор»' }]);
    expect(n).toEqual({ zakazchik: 'Дирекция', pudratchi: 'ООО «Генподряд»', subpudratchi: 'ООО «Суб»', texnadzor: 'ГУП «Надзор»' });
    expect(imzoRollari(n)).toEqual(['ЗАКАЗЧИК', 'ПОДРЯДЧИК', 'СУБПОДРЯДЧИК', 'ТЕХНАДЗОР']);
    expect(imzoRollari({})).toEqual(['ЗАКАЗЧИК', 'ПОДРЯДЧИК', 'ТЕХНАДЗОР']);
    const { b, q } = tayyorla();
    const t = hujjatTekshir(f2Hujjat(b, q, { obyektNom: 'Fast Food 1-etaj', davr: '2026-10', imzo: n }).bytes);
    expect(imzoRollariBormi(t, ['ЗАКАЗЧИК', 'ПОДРЯДЧИК', 'СУБПОДРЯДЧИК', 'ТЕХНАДЗОР']).yoq).toEqual([]);
    expect(t.matnlar.some((m) => m.startsWith('Субподрядчик:'))).toBe(true);
  });

  it('rang mavzulari: har biri ochiladi, kulrang — sukut', () => {
    const { b, q } = tayyorla();
    for (const mavzu of ['kulrang', 'kok', 'yashil', 'qahva', 'rangsiz', 'kategoriya'] as const) {
      const r = f2Hujjat(b, q, { obyektNom: 'Fast Food 1-etaj', davr: '2026-10', raqam: '1', ndsFoiz: 12, nakrutka: NAMUNA_NAKRUTKA, mavzu });
      namunaSaqla(`F2_mavzu_${mavzu}.xlsx`, r.bytes);
      expect(hujjatTekshir(r.bytes).taqiqlangan).toEqual([]);
    }
  });
});
