import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { lrvHujjat } from './lrv-hujjat';
import { hujjatTekshir } from './hujjat-yozuvchi';
import { namunaSaqla } from './hujjat-yozuvchi/test-yordam';
import { readXlsx } from './f2-import-parse/xlsxReader';
import { kitobAnatomiyasi } from './smeta-anatomiya';
import type { T2QatorHolat } from '../api/supabase';
import { AKT246_ROWS, NAMUNA_NAKRUTKA } from './f2-hujjat.fixture';

const holat = (qator_id: number, fakt_hajm: number, fakt_summa: number | null, f2_hajm = 0, f2_summa = 0): T2QatorHolat => ({
  id: qator_id, qator_id, obyekt_id: 79, tur: null, kod: null, nom: null, birlik: null, kat: null, smeta_hajm: null, smeta_summa: null,
  fakt_hajm, fakt_summa: fakt_summa as number, f2_hajm, f2_summa, qoldiq_hajm: null, qoldiq_summa: null,
} as T2QatorHolat);
// Krovlya ishi: 60 % bajarilgan, yarmi F2 da; ishchilar resursi shunga mos.
const HOLAT = [holat(678863, 72, null, 36, 0), holat(678864, 3254.4, 95749202.4, 1627.2, 47874601.2), holat(601801, 9.2, 1610000, 9.2, 1610000)];
const BARGLAR = AKT246_ROWS.filter((r) => r.tur === 'rs' || r.tur === 'mat');
const SMETA_JAMI = Math.round(BARGLAR.reduce((s, r) => s + Math.round((r.hajm ?? 0) * (r.narx ?? 0) * 100) / 100, 0) * 100) / 100;

const yasa = () => lrvHujjat(AKT246_ROWS, HOLAT, { obyektNom: 'Fast Food 1-etaj', davr: '2026-10-02', nakrutka: NAMUNA_NAKRUTKA, ndsFoiz: 12, imzo: { pudratchi: 'ООО Подрядчик' } });

describe('LRV — yangi shakl (butun smeta, Ф-2 bilan bir xil yozuvchi)', () => {
  it('uch varaq; ИТОГО = barcha barglar summasi; formulalar keshli, $ yo‘q', () => {
    const r = yasa();
    namunaSaqla('lrv_yangi.xlsx', r.bytes);
    expect(r.jami).toBe(SMETA_JAMI);
    const t = hujjatTekshir(r.bytes, { ruxsat: [/^(rz|bl|rs|mat|ob)$/, /^Р\d+$/, /^\d+:[0-9a-z]+$/] });
    expect(t.varaqlar.map((v) => v.nom)).toEqual(['LRV', 'Ведомость ресурсов', 'Свод', 'Сводная', 'Данные']);
    // Haqiqiy pivot: kesh ochilganda yangilanadi; qatorlar — xarajat turi → resurs; qiymatlar — smeta/fakt/ostatka.
    const z = unzipSync(r.bytes);
    const kesh = strFromU8(z['xl/pivotCache/pivotCacheDefinition1.xml']);
    expect(kesh).toMatch(/saveData="0" refreshOnLoad="1"/);
    expect(kesh).toContain('sheet="Данные"');
    const pv = strFromU8(z['xl/pivotTables/pivotTable1.xml']);
    expect(pv).toContain('<rowFields count="2"><field x="4"/><field x="2"/></rowFields>');
    expect(pv).toContain('<dataFields count="3">');
    expect(strFromU8(z['xl/worksheets/sheet4.xml'])).toMatch(/<f>'LRV'!H\d+<\/f>/);
    expect(t.dollarFormulalar).toEqual([]);
    expect(t.keshsizFormulalar).toEqual([]);
    expect(t.matnlar).toEqual(expect.arrayContaining(['ЛИМИТНО-РЕСУРСНАЯ ВЕДОМОСТЬ (ЛРВ)', 'ИТОГО ПРЯМЫЕ ЗАТРАТЫ ПО СМЕТЕ', 'ВЕДОМОСТЬ РЕСУРСОВ ПО СМЕТЕ', 'СВОД ПО ВИДАМ ЗАТРАТ']));
  });

  it('qulaylik: guruhlash (outline), muzlatilgan № | Шифр | Наименование, avtofiltr', () => {
    const z = unzipSync(yasa().bytes);
    const s1 = strFromU8(z['xl/worksheets/sheet1.xml']);
    expect(s1).toMatch(/<pane xSplit="3" ySplit="\d+"/);
    expect(s1).toMatch(/<autoFilter ref="A\d+:U\d+"\/>/);
    expect(s1.indexOf('<autoFilter')).toBeGreaterThan(s1.indexOf('</sheetData>'));
    expect(s1.indexOf('<autoFilter')).toBeLessThan(s1.indexOf('<mergeCells'));
    expect(s1).toMatch(/outlineLevel="2"/);
    expect(s1).toMatch(/<sheetFormatPr defaultRowHeight="[\d.]+" outlineLevelRow="\d"\/>/);
    expect(strFromU8(z['xl/workbook.xml'])).toContain('_xlnm._FilterDatabase');
  });

  it('bo‘lim va ish qatori o‘z jamini formulada ko‘rsatadi (yig‘ilganda ham ko‘rinadi); resurs = norma × ish', () => {
    const t = hujjatTekshir(yasa().bytes, { ruxsat: [/.*/] });
    const v = t.varaqlar[0];
    const qator = (matn: string) => v.kataklar.find((k) => k.matn === matn)!.ref.replace(/^[A-Z]+/, '');
    const krovlya = qator('МОНТАЖ КРОВЕЛЬНОГО ПОКРЫТИЯ ИЗ МНОГОСЛОЙНЫХ ПАНЕЛЕЙ ЗАВОДСКОЙ ГОТОВНОСТИ ПРИ ВЫСОТЕ ДО 50 М');
    expect(v.kataklar.find((k) => k.ref === `H${krovlya}`)?.f).toMatch(/^IF\(COUNTIFS\(T\d+:T\d+,1,H\d+:H\d+,""\)>0,"",SUMIFS\(H\d+:H\d+,T\d+:T\d+,1\)\)$/);
    const sendvich = qator('СЕНДВИС ПАНЕЛЬ 100КГ/М3');
    expect(v.kataklar.find((k) => k.ref === `F${sendvich}`)?.f).toBe(`ROUND(E${sendvich}*F${krovlya},6)`);
    const bolim = qator('НАРУЖНАЯ ОТДЕЛКА');
    expect(v.kataklar.find((k) => k.ref === `H${bolim}`)?.f).toMatch(/SUMIFS/);
    // Ostatka va "можно предъявить" — formulalar.
    expect(v.kataklar.find((k) => k.ref === `O${sendvich}`)?.f).toBe(`ROUND(F${sendvich}-K${sendvich},6)`);
    expect(v.kataklar.find((k) => k.ref === `R${sendvich}`)?.f).toBe(`IF(OR(L${sendvich}="",N${sendvich}=""),"",ROUND(L${sendvich}-N${sendvich},2))`);
  });

  it('resurs vedomosti va svod — LRV dan SUMIF (qisqa formula, minglab qatorda ham), solishtiruv 0', () => {
    const t = hujjatTekshir(yasa().bytes, { ruxsat: [/.*/] });
    const ved = t.varaqlar[1];
    const f = ved.kataklar.map((k) => k.f ?? '').filter(Boolean);
    expect(f.some((x) => /^ROUND\(SUMIF\('LRV'!S\d+:S\d+,"Р\d+",'LRV'!F\d+:F\d+\),6\)$/.test(x))).toBe(true);
    expect(Math.max(...f.map((x) => x.length))).toBeLessThan(400);
    const sR = ved.kataklar.find((k) => (k.matn ?? '').startsWith('Сверка с ЛРВ'))!.ref.replace(/^[A-Z]+/, '');
    const sverka = ved.kataklar.find((k) => k.ref === `G${sR}`);
    expect(Number(sverka?.v ?? 0)).toBe(0);
    const svod = t.varaqlar[2];
    expect(svod.kataklar.some((k) => /^SUMIF\('LRV'!J\d+:J\d+,"МАТ",'LRV'!H\d+:H\d+\)$/.test(k.f ?? ''))).toBe(true);
  });

  it('narxi noma‘lum resurs: ish va bo‘lim jami bo‘sh (NULL ≠ 0), diqqat ro‘yxatida', () => {
    const rows = AKT246_ROWS.map((r) => (r.id === 601112 ? { ...r, narx: null } : r));
    const r = lrvHujjat(rows, [], { obyektNom: 'X' });
    expect(r.jami).toBeNull();
    const t = hujjatTekshir(r.bytes, { ruxsat: [/.*/] });
    expect(t.matnlar.some((m) => m.startsWith('ПОЗИЦИИ, ТРЕБУЮЩИЕ ВНИМАНИЯ (1)'))).toBe(true);
  });

  it('QAYTA YUKLASH: smeta importi LRV varag‘ini taniydi — 3 ish, barcha resurslar', async () => {
    const wb = await readXlsx(yasa().bytes);
    const a = kitobAnatomiyasi({ fayl: 'lrv.xlsx', varaqlar: wb.sheets.map((s) => ({ nom: s.name, rows: s.rows })) } as never);
    const lrv = a.varaqlar.find((v) => v.varaq === 'LRV')!;
    expect(lrv.rol).toBe('lrv');
    expect(lrv.ishlar.map((i) => i.shifr)).toEqual(['Е1202-001-01', 'Е1501-026-01 ДОП. 6', 'Е0904-002-03']);
    expect(lrv.ishlar.map((i) => i.hajm)).toEqual([0.1344, 0.092, 120]);
  });
});
