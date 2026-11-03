import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  dalilMatni, dalilYigish, obosnovanieModeli, obosnovanieXlsx, sonOqi, uchlikHisobla,
  type AktQatorXom, type AktXom, type ObosnovanieKirish,
} from './fakt-obosnovanie';
import { hujjatTekshir } from './hujjat-yozuvchi';
import type { T2Qator, T2QatorHolat } from '../api/supabase';

// Sintetik ma'lumot: haqiqiy summa, nom yoki INN yo'q.
function q(id: number, ota_id: number | null, tur: string, hajm: number | null, extra: Partial<T2Qator> = {}): T2Qator {
  return {
    id, obyekt_id: 1, obyekt: 'X', kompaniya_id: 1, ota_id, daraja: 0, tartib: id, tur, kod: 'К' + id, nom: 'Позиция ' + id,
    birlik: 'м3', hajm, narx: 100, summa: null, kat: tur === 'bl' || tur === 'rz' ? null : 'МАТ', narx_usul: null, qoshimcha: false, zamena: false,
    d1: null, d2: null, d3: null, xom_qator: id, yangilandi: null, manba_id: null, versiya: 1, raqam: null, norma: null, ...extra,
  };
}
function h(qator_id: number, fakt_hajm: number, extra: Partial<T2QatorHolat> = {}): T2QatorHolat {
  return {
    id: qator_id, qator_id, obyekt_id: 1, tur: null, kod: null, nom: null, birlik: null, kat: null, smeta_hajm: null,
    smeta_summa: null, fakt_hajm, fakt_summa: 0, f2_hajm: 0, f2_summa: 0, qoldiq_hajm: null, qoldiq_summa: null, ...extra,
  };
}

// 1 SMETA → 2 RAZDEL A → bl3 (10 м3; mat4 10×100, rs5 20×50 ЧЕЛ)           fakt 6 (mat 6, rs 12), F2 yo'q
//                       → bl6 (5; mat7 5×200)                               fakt 3, F2 5 (summa 1100 → F2 narxi 220): F2 > fakt
//        → 8 RAZDEL B  → bl9 (4; mat10 4×1000)                              fakt 0 — kirmaydi
//                       → bl11 (2; mat12 2×narxsiz)                         fakt 1 — fakt summasi noma'lum
//                       → bl13 (10; mat14 10×100)                           fakt 10 = F2 10 (summa 1200, F2 narxi 120) — qoldiq 0, kirmaydi
const QATORLAR = [
  q(1, null, 'rz', null, { nom: 'СМЕТА 1' }), q(2, 1, 'rz', null, { nom: 'РАЗДЕЛ А' }),
  q(3, 2, 'bl', 10), q(4, 3, 'mat', 10, { narx: 100 }), q(5, 3, 'rs', 20, { narx: 50, kat: 'ЧЕЛ' }),
  q(6, 2, 'bl', 5), q(7, 6, 'mat', 5, { narx: 200 }),
  q(8, 1, 'rz', null, { nom: 'РАЗДЕЛ Б' }),
  q(9, 8, 'bl', 4), q(10, 9, 'mat', 4, { narx: 1000 }),
  q(11, 8, 'bl', 2), q(12, 11, 'mat', 2, { narx: null }),
  q(13, 8, 'bl', 10), q(14, 13, 'mat', 10, { narx: 100 }),
];
const HOLAT = [
  h(3, 6), h(4, 6), h(5, 12),
  h(6, 3, { f2_hajm: 5, f2_summa: 1100 }), h(7, 3, { f2_hajm: 5, f2_summa: 1100 }),
  h(9, 0), h(10, 0),
  h(11, 1), h(12, 1),
  h(13, 10, { f2_hajm: 10, f2_summa: 1200 }), h(14, 10, { f2_hajm: 10, f2_summa: 1200 }),
];
const kirish = (extra: Partial<ObosnovanieKirish> = {}): ObosnovanieKirish => ({ obyektId: 1, obyektNomi: 'Тест-объект', qatorlar: QATORLAR, holatlar: HOLAT, ...extra });

// NDS 12 %, qolgan ustamalar 0 — hisob oson tekshiriladi.
const NK = { ТРАНСПОРТ_МАТЕРИАЛ: 0, СКЛАДСКИЕ_МАТЕРИАЛ: 0, СКЛАДСКИЕ_МК: 0, ТРАНСПОРТ_КАБЕЛЬ: 0, ПРОЧИЕ_ПОДРЯДЧИК: 0, ТРАНСПОРТ_ОБОРУД: 0, ЗАГОТ_СКЛАД_ОБОРУД: 0, СТРАХОВАНИЕ: 0, РИСК: 0, НДС: 12 };
const poz = (m: ReturnType<typeof obosnovanieModeli>) => m.qatorlar.filter((r) => r.tur === 'poz');

describe('Obosnovanie — qoldiq matematikasi', () => {
  it('qoldiq = fakt − F2 (hajm va pul); F2 narxi, minus va noma\'lum saqlanadi; qoldiqsiz qatorlar kirmaydi', () => {
    const m = obosnovanieModeli(kirish());
    const p = poz(m);
    expect(p.map((r) => r.id)).toEqual([3, 6, 11]);   // 9 (fakt yo'q) va 13 (fakt = F2) kirmadi
    // bl3: fakt 6×100 + 12×50 = 1200, smeta 10×100 + 20×50 = 2000, F2 yo'q → qoldiq 1200 / 6
    expect(p[0]).toMatchObject({ smetaSumma: 2000, faktSumma: 1200, f2Summa: 0, qoldiqSumma: 1200, qoldiqHajm: 6, smetaHajm: 10, faktHajm: 6 });
    expect(p[0].foiz).toBeCloseTo(60, 9);
    // bl6: F2 bor → fakt F2 narxida (3 × 220 = 660), F2 1100 → qoldiq −440, hajm −2 (minus saqlanadi), izohda «F2 faktdan oshgan»
    expect(p[1]).toMatchObject({ faktSumma: 660, f2Summa: 1100, qoldiqSumma: -440, qoldiqHajm: -2 });
    expect(p[1].izoh).toContain('F2 faktdan oshgan');
    // bl11: narxsiz resurs, fakt bor → fakt summasi noma'lum: bo'sh (0 emas), izohda aytilgan; hajm qoldig'i ma'lum
    expect(p[2].faktSumma).toBeNull();
    expect(p[2].qoldiqSumma).toBeNull();
    expect(p[2].qoldiqHajm).toBe(1);
    expect(p[2].izoh).toContain('нет сметной цены');
  });

  it('F2 > fakt qatorlarni o\'chirish mumkin (ixtiyoriy); svod baribir barcha pozitsiyalar bo\'yicha', () => {
    const m = obosnovanieModeli(kirish(), { f2OshganKorsat: false });
    expect(poz(m).map((r) => r.id)).toEqual([3, 11]);
    expect(m.svod.f2FaktdanKop).toBe(1);
  });

  it('fakt F2 narxida: qoldiq summa = fakt(F2 narxida) − F2 summa; fakt = F2 → qoldiq 0', () => {
    const m = obosnovanieModeli(kirish());
    expect(m.svod.pozJami).toBe(5);
    // bl13: fakt 10 F2 narxida 120 → 1200, F2 1200 → 0 (qatorlarda yo'q, svodga 0 qo'shadi)
    const s = m.svod;
    // ustamasiz: fakt = 1200 (bl3) + 660 (bl6) + 0 (bl9) + [bl11 noma'lum → kirmaydi] + 1200 (bl13) = 3060
    expect(s.fakt.ustamasiz).toBe(3060);
    expect(s.f2.ustamasiz).toBe(2300);
    expect(s.qoldiq.ustamasiz).toBe(760);   // 1200 − 440 + 0
    expect(s.nomalum.fakt).toBe(1);
  });

  it('F2 summasi yozilmagan (f2_summa_yoq) — F2 summasi noma\'lum: bo\'sh, izohda', () => {
    const hol = HOLAT.map((x) => (x.qator_id === 7 ? { ...x, f2_summa_yoq: 1 } : x));
    const m = obosnovanieModeli(kirish({ holatlar: hol }));
    const p6 = poz(m).find((r) => r.id === 6)!;
    expect(p6.f2Summa).toBeNull();
    expect(p6.qoldiqSumma).toBeNull();
    expect(p6.izoh).toContain('сумма Ф-2 не указана');
  });

  it('holat qatori yo\'q — fakt noma\'lum (0 emas), izoh bilan; ma\'lum hajmsiz qatorlar kirmaydi', () => {
    const m = obosnovanieModeli(kirish({ holatlar: HOLAT.filter((x) => x.qator_id !== 11 && x.qator_id !== 12) }));
    expect(poz(m).map((r) => r.id)).toEqual([3, 6]);
  });
});

describe('Obosnovanie — guruhlash va jamilar', () => {
  it('RZ ichma-ich saqlanadi, ITOGO qatori faqat ko\'rsatilgan pozitsiyalar (ma\'lum summalar) yig\'indisi', () => {
    const m = obosnovanieModeli(kirish());
    expect(m.qatorlar.map((r) => [r.tur, r.id])).toEqual([
      ['rz', 1], ['rz', 2], ['poz', 3], ['poz', 6], ['itogo', 2],
      ['rz', 8], ['poz', 11], ['itogo', 8], ['itogo', 1],
    ]);
    const a = m.qatorlar.find((r) => r.tur === 'itogo' && r.id === 2)!;
    expect(a).toMatchObject({ faktSumma: 1860, f2Summa: 1100, qoldiqSumma: 760, smetaSumma: 3000 });
    const b = m.qatorlar.find((r) => r.tur === 'itogo' && r.id === 8)!;
    // bl11 summalari noma'lum → razdel jamisi ham bo'sh (0 emas)
    expect(b.qoldiqSumma).toBeNull();
    const vsego = m.qatorlar.find((r) => r.tur === 'itogo' && r.id === 1)!;
    expect(vsego.qoldiqSumma).toBe(760);   // ma'lum summalar yig'indisi
  });

  it('uchlik: ustamasiz = ma\'lum summalar; QQS bilan / ustamali — podval kaskadidan; podval yo\'q — bo\'sh', () => {
    const m = obosnovanieModeli(kirish({ kontekst: { nakrutka: NK } }));
    expect(m.svod.smeta).toEqual({ qqsBilan: 8960, ustamali: 8000, ustamasiz: 8000 });
    expect(m.svod.qoldiq.ustamasiz).toBe(760);
    expect(m.svod.qoldiq.qqsBilan).toBe(851.2);
    const bosh = obosnovanieModeli(kirish());
    expect(bosh.svod.smeta.ustamasiz).toBe(8000);
    expect(bosh.svod.smeta.qqsBilan).toBeNull();
    expect(bosh.svod.smeta.ustamali).toBeNull();
    expect(bosh.svod.ustamaIzoh).not.toBe('');
  });

  it('ustama foizi kiritilmagan — ustamali va QQS bilan bo\'sh (0 deb olinmaydi)', () => {
    const { uchlik, izoh } = uchlikHisobla([{ kat: 'МАТ', yax: false, v: 100 }], { podval: undefined as never, nk: {}, nds: null });
    expect(uchlik.ustamasiz).toBe(100);
    expect(uchlik.qqsBilan).toBeNull();
    expect(izoh).not.toBe('');
  });
});

describe('Obosnovanie — svod ko\'rsatkichlari', () => {
  it('faktsiz qoldiq, faktli pozitsiyalar ulushi, faktli-F2siz va F2>fakt sonlari', () => {
    const s = obosnovanieModeli(kirish({ kontekst: { nakrutka: NK } })).svod;
    expect(s.pozJami).toBe(5);
    expect(s.faktBor).toBe(4);                    // bl3, bl6, bl11, bl13
    expect(s.faktulush).toBeCloseTo(80, 9);
    expect(s.faktBorF2Yoq).toBe(2);               // bl3, bl11
    expect(s.f2FaktdanKop).toBe(1);               // bl6
    // smeta − fakt: ustamasiz 8000 − 3060 = 4940; smeta/fakt noma'lum resurs (mat12) hisobga olinmaydi
    expect(s.faktsizQoldiq.ustamasiz).toBe(4940);
    expect(s.smeta.ustamasiz).toBe(8000);
  });
});

describe('Obosnovanie — asos (Manba / основание)', () => {
  const aktlar: AktXom[] = [
    { id: 1, tur: 'fakt', raqam: 'F-1', sana: '2026-10-24', izoh: 'Fakt jurnali: 9 qator', holat: 'qoralama' },
    { id: 2, tur: 'fakt', raqam: 'F-2', sana: '2026-10-25', izoh: 'Qamrov 100%: СТЕНЫ', holat: 'qoralama' },
    { id: 3, tur: 'f2', raqam: '12', sana: '2026-10-26', izoh: null, holat: 'tasdiqlangan' },
    { id: 4, tur: 'f2', raqam: null, sana: null, izoh: null, holat: 'qoralama' },
    { id: 5, tur: 'f2', raqam: '99', sana: null, izoh: null, holat: 'bekor' },
  ];
  const aq: AktQatorXom[] = [
    { akt_id: 1, qator_id: 3 }, { akt_id: 1, qator_id: 3 }, { akt_id: 2, qator_id: 4 }, { akt_id: 3, qator_id: 7 }, { akt_id: 4, qator_id: 7 }, { akt_id: 5, qator_id: 7 },
  ];
  it('dalilYigish: jurnal / foizli qamrov / F2 / F2 qoralama; bekor va takror kirmaydi', () => {
    const d = dalilYigish(aktlar, aq);
    expect(d.get(3)!.map((x) => x.tur)).toEqual(['jurnal']);
    expect(d.get(4)![0]).toMatchObject({ tur: 'foiz', foiz: 100 });
    expect(d.get(7)!.map((x) => x.tur).sort()).toEqual(['f2', 'f2_qoralama']);
  });
  it('dalilMatni: F2 oldin, qoralama «проект», uzun ro\'yxat «и ещё N»', () => {
    const d = dalilYigish(aktlar, aq);
    expect(dalilMatni(d.get(7)!)).toBe('Ф-2 № 12 от 26.10.2026 (утверждён); Ф-2 б/н (проект, не утверждён)');
    expect(dalilMatni(d.get(3)!)).toBe('Журнал факта № F-1 от 24.10.2026');
    expect(dalilMatni(d.get(4)!)).toContain('Процент выполнения 100%');
    const kop = Array.from({ length: 5 }, (_, i) => ({ akt: i, tur: 'jurnal' as const, raqam: String(i), sana: null, foiz: null }));
    expect(dalilMatni(kop)).toMatch(/и ещё 2$/);
  });
  it('qatorda asos: bl o\'z va resurs hujjatlari birlashadi; faktli, lekin jurnalsiz qatorda — «не найдена»', () => {
    const m = obosnovanieModeli(kirish({ dalil: dalilYigish(aktlar, aq) }));
    const p3 = poz(m).find((r) => r.id === 3)!;
    expect(p3.dalil).toContain('Журнал факта № F-1 от 24.10.2026');
    expect(p3.dalil).toContain('Процент выполнения 100%');
    const p6 = poz(m).find((r) => r.id === 6)!;
    expect(p6.dalil).toContain('Ф-2 № 12');
    expect(p6.dalil).toContain('запись факта в журнале не найдена');
    const p11 = poz(m).find((r) => r.id === 11)!;
    expect(p11.dalil).toBe('запись факта в журнале не найдена');
    expect(obosnovanieModeli(kirish()).qatorlar.every((r) => r.dalil === '')).toBe(true);
  });
});

describe('Obosnovanie — Excel hujjat', () => {
  const mA = obosnovanieModeli(kirish({ obyektNomi: 'Объект А', kontekst: { nakrutka: NK } }));
  const mB = obosnovanieModeli(kirish({ obyektId: 2, obyektNomi: 'Объект Б', kontekst: { nakrutka: NK } }));

  it('Svod + har obyekt varag\'i; formulalar tirik ($ yo\'q, kesh bor); asosiy matnlar rus tilida', () => {
    const { bytes, faylNomi, varaqlar } = obosnovanieXlsx([mA, mB], { nom: 'Проект', sana: '2026-11-03', tuzilgan: '2026-11-03' });
    expect(varaqlar).toBe(3);
    expect(faylNomi).toContain('ОБОСНОВАНИЕ');
    const t = hujjatTekshir(bytes);
    expect(t.dollarFormulalar).toEqual([]);
    expect(t.keshsizFormulalar).toEqual([]);
    expect(t.taqiqlangan).toEqual([]);
    expect(t.varaqlar.map((v) => v.nom)).toEqual(['Свод', 'Объект А', 'Объект Б']);
    expect(t.matnlar.some((x) => x.includes('ОБОСНОВАНИЕ ВЫПОЛНЕННЫХ ОБЪЁМОВ, НЕ ЗАКРЫТЫХ Ф-2'))).toBe(true);
    // QQS bilan birinchi
    const matn = t.matnlar.join('\n');
    expect(matn.indexOf('ВСЕГО С НДС')).toBeGreaterThan(-1);
    expect(matn.indexOf('ВСЕГО С НДС')).toBeLessThan(matn.indexOf('ВСЕГО С НАКЛАДНЫМИ'));
    expect(matn).toContain('Позиций: факт есть, Ф-2 нет'.toUpperCase());
  });

  it('eski hisobot raqami qo\'lda kiritilsa — svodda farq qatori; kiritilmasa yo\'q', () => {
    const e = new Map([[1, { qoldiq: 1000 }]]);
    const bilan = hujjatTekshir(obosnovanieXlsx([mA], { nom: 'A', sana: '2026-11-03', eski: e }).bytes).matnlar.join('\n');
    expect(bilan).toContain('РАЗНИЦА: СИСТЕМА − ПРЕЖНИЙ ОТЧЁТ');
    const yoq = hujjatTekshir(obosnovanieXlsx([mA], { nom: 'A', sana: '2026-11-03' }).bytes).matnlar.join('\n');
    expect(yoq).not.toContain('РАЗНИЦА');
    expect(sonOqi('1 234,5')).toBe(1234.5);
    expect(sonOqi('')).toBeNull();
    expect(sonOqi('abc')).toBeNull();
  });

  it('varaq nomlari takrorlanmaydi va 31 belgidan oshmaydi', () => {
    const uzun = 'Очень длинное название объекта строительства номер один';
    const a = obosnovanieModeli(kirish({ obyektNomi: uzun }));
    const b = obosnovanieModeli(kirish({ obyektId: 2, obyektNomi: uzun }));
    const nomlar = hujjatTekshir(obosnovanieXlsx([a, b], { nom: 'П', sana: '2026-11-03' }).bytes).varaqlar.map((v) => v.nom);
    expect(new Set(nomlar).size).toBe(3);
    expect(nomlar.every((n) => n.length <= 31)).toBe(true);
  });
});

describe('Obosnovanie — token qoidasi', () => {
  it('panel hujjatni faqat hujjatTokenBilan orqali beradi', () => {
    const src = readFileSync(join(process.cwd(), 'src/admin/sahifalar/ObosnovaniePanel.tsx'), 'utf8');
    expect(src).toMatch(/hujjatTokenBilan\(/);
    const tokenIdx = src.indexOf('hujjatTokenBilan(');
    const dl = src.indexOf('downloadBlob(bytes');
    expect(dl).toBeGreaterThan(tokenIdx);   // yuklab berish token callback ichida
  });
});
