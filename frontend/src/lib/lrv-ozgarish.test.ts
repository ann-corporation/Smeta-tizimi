import { describe, expect, it } from 'vitest';
import type { T2Qator, T2QatorHolat } from '../api/supabase';
import { lrvHujjat } from './lrv-hujjat';
import { lrvPlusFaylBaytlari } from './lrv-plus-export';
import { hujjatTekshir, uslubniOch } from './hujjat-yozuvchi';
import { lrvPozitsiyaRaqamlari, ozgarishXaritasi, OZGARISH_HEX } from './lrv-ozgarish';
import { podvalliKaskad, NAKRUTKA_KATLAR, type KatSummalar } from './nakrutka-podval';
import { NAMUNA_NAKRUTKA } from './f2-hujjat.fixture';
import { sbT2TreeQur } from '../api/supabase';
import { ozgarishFiltrMos } from '../umumiy/daraxt/smetaTreeFiltr';

/* Sintetik obyekt (mijoz ma'lumoti yo'q): asl ish + uni almashtirgan zamena ishi (resurslari bazada ADDITIONAL),
   qo'shimcha ish va asl bo'limdagi material. */
function q(p: Partial<T2Qator> & { id: number; tur: string }): T2Qator {
  return {
    id: p.id, obyekt_id: 1, obyekt: null, kompaniya_id: 1, ota_id: p.ota_id ?? null, daraja: p.daraja ?? 0, tartib: p.id,
    tur: p.tur, kod: p.kod ?? null, nom: p.nom ?? null, birlik: p.birlik ?? null, hajm: p.hajm ?? null, narx: p.narx ?? null,
    summa: p.summa ?? null, kat: p.kat ?? null, narx_usul: null, qoshimcha: null, zamena: null, d1: null, d2: null, d3: null,
    xom_qator: null, yangilandi: null, manba_id: null, versiya: 1, raqam: null, norma: null,
    change_type: p.change_type ?? null, replaces_line_id: p.replaces_line_id ?? null, almashtirgan_versiya_id: p.almashtirgan_versiya_id ?? null,
  };
}
const ROWS: T2Qator[] = [
  q({ id: 1, tur: 'rz', nom: 'Bo‘lim 1' }),
  q({ id: 2, tur: 'bl', ota_id: 1, daraja: 1, kod: 'E1', nom: 'Устройство стяжки', birlik: 'м2', hajm: 10 }),
  q({ id: 3, tur: 'rs', ota_id: 2, daraja: 2, nom: 'Рабочие', birlik: 'чел-ч', hajm: 5, narx: 100, kat: 'ЧЕЛ' }),
  q({ id: 4, tur: 'mat', ota_id: 2, daraja: 2, nom: 'Раствор', birlik: 'м3', hajm: 2, narx: 1000, kat: 'МАТ' }),
  q({ id: 5, tur: 'bl', ota_id: 1, daraja: 1, kod: 'E2', nom: 'Устройство наливного пола', birlik: 'м2', hajm: 10, change_type: 'REPLACEMENT', replaces_line_id: 2 }),
  q({ id: 6, tur: 'rs', ota_id: 5, daraja: 2, nom: 'Рабочие', birlik: 'чел-ч', hajm: 3, narx: 100, kat: 'ЧЕЛ', change_type: 'ADDITIONAL' }),
  q({ id: 7, tur: 'mat', ota_id: 5, daraja: 2, nom: 'Смесь', birlik: 'кг', hajm: 1, narx: 500, kat: 'МАТ', change_type: 'ADDITIONAL' }),
  q({ id: 8, tur: 'bl', ota_id: 1, daraja: 1, kod: 'E3', nom: 'Грунтовка', birlik: 'м2', hajm: 1, change_type: 'ADDITIONAL' }),
  q({ id: 9, tur: 'rs', ota_id: 8, daraja: 2, nom: 'Рабочие', birlik: 'чел-ч', hajm: 4, narx: 50, kat: 'ЧЕЛ', change_type: 'ADDITIONAL' }),
  q({ id: 10, tur: 'rz', nom: 'Bo‘lim 2' }),
  q({ id: 11, tur: 'mat', ota_id: 10, daraja: 1, nom: 'Песок', birlik: 'м3', hajm: 3, narx: 10, kat: 'МАТ' }),
];
const holat = (qator_id: number, qoldiq_hajm: number | null): T2QatorHolat => ({
  id: qator_id, qator_id, obyekt_id: 1, tur: null, kod: null, nom: null, birlik: null, kat: null, smeta_hajm: null, smeta_summa: null,
  fakt_hajm: 0, fakt_summa: 0, f2_hajm: 0, f2_summa: 0, qoldiq_hajm, qoldiq_summa: null,
});
const HOLAT = [holat(2, 4)];
const JAMI = { asl: 500 + 2000 + 30, qoshimcha: 200, zamena: 300 + 500 };

describe('lrv-ozgarish — tasnif', () => {
  it('zamena ichidagi ADDITIONAL resurslar — zamena; qo‘shimcha ish ichidagilar — qo‘shimcha; asl — asl; almashtirilgan bog‘lanadi', () => {
    const m = ozgarishXaritasi(ROWS);
    expect([1, 2, 3, 4, 10, 11].map((id) => m.get(id)!.guruh)).toEqual(['asl', 'asl', 'asl', 'asl', 'asl', 'asl']);
    expect([5, 6, 7].map((id) => m.get(id)!.guruh)).toEqual(['zamena', 'zamena', 'zamena']);
    expect([8, 9].map((id) => m.get(id)!.guruh)).toEqual(['qoshimcha', 'qoshimcha']);
    expect(m.get(5)!.almashtiradi).toBe(2);
    expect(m.get(2)!.almashtirilgan).toEqual([5]);
  });

  it('ekran filtri: Asl smeta / Qo‘shimcha / Zamena (almashtirilgan asl zamena filtrida ham ko‘rinadi)', () => {
    const tugunlar = new Map<number, ReturnType<typeof sbT2TreeQur>[number]>();
    const yur = (ns: ReturnType<typeof sbT2TreeQur>) => { for (const n of ns) { tugunlar.set(n.id!, n); if (n.children) yur(n.children); } };
    yur(sbT2TreeQur(ROWS, HOLAT));
    const mos = (f: 'asl' | 'qosh' | 'zamena') => [...tugunlar.values()].filter((n) => n.type !== 'rz' && ozgarishFiltrMos(n, f)).map((n) => n.id).sort((a, b) => a! - b!);
    expect(mos('asl')).toEqual([2, 3, 4, 11]);
    expect(mos('qosh')).toEqual([8, 9]);
    expect(mos('zamena')).toEqual([2, 5, 6, 7]);
    const z = tugunlar.get(5)!;
    expect(z.almashtiradi).toEqual({ id: 2, poz: 1, nom: 'Устройство стяжки' });
    expect(tugunlar.get(2)!.almashtirganlar).toEqual([{ id: 5, poz: 4, nom: 'Устройство наливного пола' }]);
    expect(tugunlar.get(2)!.qoldiq).toBe(4);
  });
});

/** Uslub indeksi → qator rangi (rasmiy.ts: baza + 29 × (1 + rang tartibi)). */
const rangi = (xml: string) => { const s = Number(/ s="(\d+)"/.exec(xml)?.[1] ?? 0); return uslubniOch(s).rang; };

describe('LRV Excel — qo‘shimcha / zamena belgilari', () => {
  const r = lrvHujjat(ROWS, HOLAT, { obyektNom: 'Sinov', nakrutka: NAMUNA_NAKRUTKA, ndsFoiz: 12 });
  const v = hujjatTekshir(r.bytes, { ruxsat: [/.*/] }).varaqlar[0];
  const k = (ref: string) => v.kataklar.find((x) => x.ref === ref);
  const qatorMatn = (matn: string) => v.kataklar.find((x) => x.matn === matn)!.ref.replace(/^[A-Z]+/, '');

  it('№ raqami lrvPozitsiyaRaqamlari bilan bir xil; Примечание va yashirin guruh kodi; qatorlar KATTA HARFDA', () => {
    const poz = lrvPozitsiyaRaqamlari(ROWS);
    const r2 = qatorMatn('УСТРОЙСТВО СТЯЖКИ');
    const r5 = qatorMatn('УСТРОЙСТВО НАЛИВНОГО ПОЛА');
    expect(k(`A${r2}`)!.v).toBe(String(poz.get(2)));
    expect(k(`A${r5}`)!.v).toBe(String(poz.get(5)));
    expect(k(`V${r5}`)!.matn).toBe('ЗАМЕНА ПОЗ. 1 (УСТРОЙСТВО СТЯЖКИ)');
    expect(k(`V${r2}`)!.matn).toBe('ЗАМЕНЕНО → ПОЗ. 4, ОСТАТОК 4 М2');
    expect(k(`V${qatorMatn('ГРУНТОВКА')}`)!.matn).toBe('ДОПОЛНИТЕЛЬНАЯ РАБОТА');
    expect(v.kataklar.some((x) => x.matn === 'ЗАМЕНА (В СОСТАВЕ ПОЗ. 4)')).toBe(true);
    expect([r2, r5, qatorMatn('ГРУНТОВКА')].map((x) => k(`W${x}`)!.matn)).toEqual(['АСЛ', 'ЗАМ', 'ДОП']);
    expect(v.yashirinUstunlar).toContain(22); // W
  });

  it('qator rangi: qo‘shimcha — sariq, zamena — ko‘k, almashtirilgan asl — kulrang kursiv', () => {
    expect(rangi(k(`C${qatorMatn('ГРУНТОВКА')}`)!.xml)).toBe('qoshimcha');
    expect(rangi(k(`C${qatorMatn('УСТРОЙСТВО НАЛИВНОГО ПОЛА')}`)!.xml)).toBe('zamena');
    expect(rangi(k(`C${qatorMatn('УСТРОЙСТВО СТЯЖКИ')}`)!.xml)).toBe('almashtirilgan');
    // MAT darajasi: o'z foni dizayn darajasidan (toifa rangi emas)
    expect(uslubniOch(Number(/ s="(\d+)"/.exec(k(`C${qatorMatn('ПЕСОК')}`)!.xml)?.[1])).daraja).toBe('mat');
  });

  it('pastdagi jamlar: har guruh = shu turdagi barglar yig‘indisi; uchtasi = ИТОГО; ustamali — mavjud kaskad', () => {
    const qiymat = (boshi: string) => {
      const c = v.kataklar.find((x) => x.matn?.startsWith(boshi))!;
      return k(`H${c.ref.replace(/^[A-Z]+/, '')}`)!;
    };
    const a = qiymat('АСЛ СМЕТА (ОСНОВНАЯ СМЕТА) — ПРЯМЫЕ');
    expect(Number(a.v)).toBe(JAMI.asl);
    expect(a.f).toMatch(/^SUMIFS\(H\d+:H\d+,T\d+:T\d+,1,W\d+:W\d+,"АСЛ"\)$/);
    expect(Number(qiymat('ДОПОЛНИТЕЛЬНЫЕ РАБОТЫ — ПРЯМЫЕ').v)).toBe(JAMI.qoshimcha);
    expect(Number(qiymat('ЗАМЕНЫ — ПРЯМЫЕ').v)).toBe(JAMI.zamena);
    expect(Number(qiymat('ВСЕГО ПРЯМЫЕ ЗАТРАТЫ ПО ВИДАМ').v)).toBe(r.jami);
    expect(Number(qiymat('СВЕРКА: ПО ВИДАМ').v)).toBe(0);
    const ks = Object.fromEntries(NAKRUTKA_KATLAR.map((x) => [x, 0])) as KatSummalar;
    ks.ЧЕЛ = 200;
    const kaskad = podvalliKaskad(ks, { ...NAMUNA_NAKRUTKA, НДС: 12 }, null);
    expect(Number(qiymat('ДОПОЛНИТЕЛЬНЫЕ РАБОТЫ — С НАКРУТКОЙ, БЕЗ НДС').v)).toBe(kaskad.itogo4);
    expect(Number(qiymat('ДОПОЛНИТЕЛЬНЫЕ РАБОТЫ — С НАКРУТКОЙ И НДС').v)).toBe(kaskad.vsego);
    expect(v.kataklar.some((x) => x.matn === 'УСЛОВНЫЕ ОБОЗНАЧЕНИЯ')).toBe(true);
  });

  it('o‘zgarishsiz obyektda rasmiy shakl o‘zgarmaydi (qo‘shimcha ustun/blok yo‘q)', () => {
    const asl = ROWS.filter((x) => !x.change_type).map((x) => ({ ...x, change_type: null, replaces_line_id: null }));
    const w = hujjatTekshir(lrvHujjat(asl, [], { obyektNom: 'Sinov' }).bytes, { ruxsat: [/.*/] }).varaqlar[0];
    expect(w.kataklar.some((x) => /^[VW]\d+$/.test(x.ref))).toBe(false);
    expect(w.kataklar.some((x) => x.matn?.startsWith('ИТОГИ ПО ВИДАМ'))).toBe(false);
  });

  it('avvalgi (almashtirilgan) versiya — alohida kulrang varaq, ИТОГО ga kirmaydi', () => {
    const eski = [q({ id: 101, tur: 'rz', nom: 'Eski bo‘lim', almashtirgan_versiya_id: 7 }), q({ id: 102, tur: 'mat', ota_id: 101, nom: 'Eski material', hajm: 1, narx: 99999, summa: 99999, almashtirgan_versiya_id: 7 })];
    const r2 = lrvHujjat(ROWS, HOLAT, { obyektNom: 'Sinov', avvalgiVersiya: { qatorlar: eski, versiyaNomi: new Map([[7, 'V2 · 2026-11-01']]) } });
    expect(r2.jami).toBe(r.jami);
    const t = hujjatTekshir(r2.bytes, { ruxsat: [/.*/] });
    const av = t.varaqlar.find((x) => x.nom === 'Пред. версия')!;
    expect(av).toBeTruthy();
    const m = av.kataklar.find((x) => x.matn === 'ESKI MATERIAL')!;
    expect(rangi(m.xml)).toBe('almashtirilgan');
    expect(av.kataklar.some((x) => x.matn === 'V2 · 2026-11-01')).toBe(true);
  });
});

describe('LRV_PLUS Excel — qo‘shimcha / zamena belgilari', () => {
  it('ПРИМЕЧАНИЕ, qator rangi va guruh jamlari', async () => {
    const bytes = await lrvPlusFaylBaytlari(ROWS, 'Sinov', HOLAT);
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    const ws = wb.getWorksheet('LRV_PLUS')!;
    const sarlavha = ws.getRow(2).values as unknown[];
    const izohUstun = sarlavha.indexOf('ПРИМЕЧАНИЕ (ДОП. РАБОТА / ЗАМЕНА)');
    expect(izohUstun).toBeGreaterThan(25);
    const qator = (nom: string) => { let r = 0; ws.eachRow((row, i) => { if (row.getCell(3).value === nom) r = i; }); return r; };
    const r5 = qator('УСТРОЙСТВО НАЛИВНОГО ПОЛА');
    // LRV_PLUS da № — barcha qatorlar ketma-ket (rz ham): asl ish — 2-qator.
    expect(ws.getCell(r5, izohUstun).value).toBe('ЗАМЕНА ПОЗ. 2 (УСТРОЙСТВО СТЯЖКИ)');
    expect(ws.getCell(qator('ГРУНТОВКА'), izohUstun).value).toBe('ДОПОЛНИТЕЛЬНАЯ РАБОТА');
    const fill = (r: number) => ((ws.getCell(r, 3).fill as { fgColor?: { argb?: string } })?.fgColor?.argb ?? '').slice(-6);
    expect(fill(qator('ГРУНТОВКА'))).toBe(OZGARISH_HEX.qoshimcha);
    expect(fill(r5)).toBe(OZGARISH_HEX.zamena);
    expect(fill(qator('УСТРОЙСТВО СТЯЖКИ'))).toBe(OZGARISH_HEX.almashtirilgan);
    expect(ws.getCell(qator('УСТРОЙСТВО СТЯЖКИ'), 3).font?.italic).toBe(true);
    const jam = (boshi: string) => { let v: unknown; ws.eachRow((row) => { if (String(row.getCell(3).value ?? '').startsWith(boshi)) v = row.getCell(8).value; }); return v as { result?: number; formula?: string } | number; };
    const asl = jam('АСЛ СМЕТА (ОСНОВНАЯ СМЕТА) — ПРЯМЫЕ') as { result: number; formula: string };
    expect(asl.result).toBe(JAMI.asl);
    expect(asl.formula).toContain('"АСЛ"');
    expect((jam('ДОПОЛНИТЕЛЬНЫЕ РАБОТЫ — ПРЯМЫЕ') as { result: number }).result).toBe(JAMI.qoshimcha);
    expect((jam('ЗАМЕНЫ — ПРЯМЫЕ') as { result: number }).result).toBe(JAMI.zamena);
    expect(jam('СВЕРКА')).toMatchObject({ formula: expect.stringMatching(/^IF\(H3="","",ROUND\(H\d+-H3,2\)\)$/) });
    expect((jam('ВСЕГО ПРЯМЫЕ ЗАТРАТЫ ПО ВИДАМ') as { result: number }).result).toBe(JAMI.asl + JAMI.qoshimcha + JAMI.zamena);
  });
});
