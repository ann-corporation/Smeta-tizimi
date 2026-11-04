import { describe, expect, it } from 'vitest';
import { f2Hujjat } from './f2-hujjat';
import { bosKiritma, f2Qatorlar, f2Qur } from './f2-tayyor';
import { darajaHisobot, dizaynTozala, hujjatDizayniniSaqla, hujjatDizaynTekshir, hujjatTekshir, imzoRollariBormi, joriyHujjatDizayni, tipUstunlariYashirin } from './hujjat-yozuvchi';
import { namunaSaqla } from './hujjat-yozuvchi/test-yordam';
import { readXlsx } from './f2-import-parse/xlsxReader';
import { f2FaylOqiCore, f2UstunAniqla } from './f2-import-parse';
import { imzoNomlariTomonlardan, imzoRollari } from './shartnoma-liniya';
import { kalitdanBog } from './f2-kalit-bogla';
import { lrvKalitOqi } from './lrv-qayta-import';
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
    expect(t.matnlar.some((s) => s.includes('ИТОГО ПО РАЗДЕЛУ «НАРУЖНАЯ ОТДЕЛКА»'))).toBe(true);
    expect(t.matnlar).toContain('АКТ ПРИЕМКИ ВЫПОЛНЕННЫХ РАБОТ № 1 (ФОРМА № 2)');
    expect(k.some((x) => /^[L-Z]\d/.test(x.ref))).toBe(false);                     // ko'rinadigan A–I + yashirin J (kat), K (КАЛИТ), boshqa yo'q
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

  it('КАЛИТ round-trip: yashirin K ustuni har ish/resurs qatorini t2_qator.id ga aniq bog‘laydi; tahrirlangan/nusxalangan/begona kalit bog‘lanmaydi', async () => {
    const { b, q } = tayyorla();
    const r = f2Hujjat(b, q, { obyektNom: 'Fast Food 1-etaj', davr: '2026-10', raqam: '1', nakrutka: NAMUNA_NAKRUTKA, ndsFoiz: 12 });
    const grid = (await readXlsx(r.bytes)).sheet('Ф-2')!.rows;
    const tugunlar = grid.flatMap((row, i) => lrvKalitOqi(row[10]) ? [{ uid: 'r' + i, kod: row[1] == null ? null : String(row[1]), nom: String(row[2] ?? ''), birlik: row[3] == null ? null : String(row[3]), manzil: { qator: i + 1 } }] : []);
    expect(tugunlar).toHaveLength(q.length);
    const kanonik = AKT246_ROWS.map((x) => ({ id: x.id, kod: x.kod, nom: x.nom, birlik: x.birlik }));
    const bog = kalitdanBog(grid, tugunlar, kanonik);
    expect(bog.size).toBe(q.length);
    const idlar = new Set(q.map((x) => x.id));
    for (const v of bog.values()) { expect(idlar.has(v.qatorId)).toBe(true); expect(v.holat).toBe('qolda'); }
    // Fayldagi nom tahrirlansa - shu qator bog'lanmaydi (kalit eski).
    const t2 = tugunlar.map((t, i) => i === 3 ? { ...t, nom: t.nom + ' (TAHRIR)' } : t);
    expect(kalitdanBog(grid, t2, kanonik).size).toBe(q.length - 1);
    // Nusxalangan qator (bir xil ID ikki marta) - ikkalasi ham oddiy moslashga qoladi.
    const g2 = grid.map((row) => [...row]); const src = tugunlar[5].manzil.qator - 1;
    g2[tugunlar[6].manzil.qator - 1][10] = g2[src][10];
    expect(kalitdanBog(g2, tugunlar, kanonik).size).toBe(q.length - 2 );
    // Begona obyekt (smetada yo'q ID).
    expect(kalitdanBog(grid, tugunlar, kanonik.filter((x) => x.id !== q[0].id)).size).toBe(q.length - 1);
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

describe('Ф-2 pereraschet: eski F2 bloklari (minus, o‘z podvali) + yangi qatorlar (egasi 2026-11-03)', () => {
  const eskiQatorlar = [
    { id: 1, kod: 'E1', nom: 'mehnat', birlik: 'чел.-ч', kat: 'ЧЕЛ', tur: 'rs', hajm: -10, narx: 100, summa: -1000 },
    { id: 2, kod: 'E2', nom: 'material', birlik: 'шт', kat: 'МАТ', tur: 'mat', hajm: -5, narx: 200, summa: -1000 },
  ];
  const NK_AKT = { ...NAMUNA_NAKRUTKA, ПРОЧИЕ_ПОДРЯДЧИК: 10, НДС: 12 };

  it('faqat storno (yangi qator yo‘q): blok, jami va sof jami yoziladi, yiqilmaydi', () => {
    const r = f2Hujjat([], [], { obyektNom: 'Объект', davr: '2026-10', raqam: '535-С', eskiBloklar: [{ nom: '535', nk: NK_AKT, qatorlar: eskiQatorlar }] });
    const t = hujjatTekshir(r.bytes);
    expect(t.matnlar.some((s) => s.toUpperCase().includes('СТОРНО Ф-2 № 535'))).toBe(true);
    expect(t.matnlar.some((s) => s.toUpperCase().includes('ИТОГО ПЕРЕРАСЧЕТ'))).toBe(true);
    expect(t.taqiqlangan).toEqual([]);
    expect(t.dollarFormulalar).toEqual([]);
  });

  it('ikki eski F2 + yangi qatorlar: har blok alohida, yangi blok smeta podvali bilan', () => {
    const { b, q } = tayyorla();
    const r = f2Hujjat(b, q, { obyektNom: 'Объект', davr: '2026-10', raqam: '1', ndsFoiz: 12, nakrutka: NAMUNA_NAKRUTKA,
      eskiBloklar: [{ nom: '535', nk: NK_AKT, qatorlar: eskiQatorlar }, { nom: '536', nk: null, qatorlar: eskiQatorlar.slice(0, 1) }] });
    const t = hujjatTekshir(r.bytes);
    expect(t.matnlar.some((s) => s.toUpperCase().includes('СТОРНО Ф-2 № 535'))).toBe(true);
    expect(t.matnlar.some((s) => s.toUpperCase().includes('СТОРНО Ф-2 № 536'))).toBe(true);
    expect(t.matnlar.some((s) => s.toUpperCase().includes('ИТОГО ПЕРЕРАСЧЕТ'))).toBe(true);
    expect(r.jami).toBeCloseTo(150026606.32, 2);
  });
});
describe('Ф-2 — hujjat dizayni (resolver)', () => {
  it('Тип ustuni yashirin; BL qalin, RS kursiv, MAT/OB qalin; ramka/son/o‘rash tekshiruvi toza', () => {
    const { b, q } = tayyorla();
    const r = f2Hujjat(b, q, { obyektNom: 'Fast Food 1-etaj', davr: '2026-10', raqam: '1', nakrutka: NAMUNA_NAKRUTKA, ndsFoiz: 12 });
    expect(tipUstunlariYashirin(r.bytes)).toEqual([true]);
    const h = darajaHisobot(r.bytes);
    expect(h.bl?.qalin).toEqual(new Set([true]));
    expect(h.rs?.kursiv).toEqual(new Set([true]));
    expect(h.rs?.qalin).toEqual(new Set([false]));
    expect(h.mat?.qalin).toEqual(new Set([true]));
    expect(h.jami?.qalin).toEqual(new Set([true]));
    expect(hujjatDizaynTekshir(r.bytes, joriyHujjatDizayni())).toEqual([]);
  });

  it('kompaniya dizayni qo‘llanadi: Тип ko‘rinadi, RS qalin (formula va summa o‘zgarmaydi)', () => {
    const { b, q } = tayyorla();
    const opt = { obyektNom: 'Fast Food 1-etaj', davr: '2026-10', raqam: '1', nakrutka: NAMUNA_NAKRUTKA, ndsFoiz: 12 };
    const asl = f2Hujjat(b, q, opt);
    hujjatDizayniniSaqla(dizaynTozala({ tipKorsat: true, daraja: { rs: { qalin: true, kursiv: false } } }));
    try {
      const r = f2Hujjat(b, q, opt);
      expect(tipUstunlariYashirin(r.bytes)).toEqual([false]);
      expect(darajaHisobot(r.bytes).rs?.qalin).toEqual(new Set([true]));
      expect(r.jami).toBe(asl.jami);
    } finally { hujjatDizayniniSaqla(null); }
  });
});