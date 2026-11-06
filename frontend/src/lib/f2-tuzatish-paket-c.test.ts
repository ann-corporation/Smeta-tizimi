/**
 * Audit C tuzatish paketi (2026-11-06) — SINTETIK ma'lumot (repo public; real summa/nom yo'q):
 *  B1  — minus (storno emas) qator va hajmi 0 summali qator Excel'da bor, ИТОГО = yadro (`f2AktBaho`);
 *  B3  — resurssiz (barg) ish / М/К o'z summasi: Excel = yadro = F3 «за отчетный месяц» to'g'ri xarajati;
 *  M13 — ishi aktda yo'q resurs Excel'dan tushmaydi;
 *  M2(B) — storno blokida ish summasi + resurslari ikki marta sanalmaydi (server barg qoidasi);
 *  M4(B) — o'z podvali yo'q storno bloki smeta podvali bilan (yangi blok o'z podvali bilan bo'lsa ham), sof jami = yadro;
 *  M11 — portfel qoralama varag'i formulali, tasdiqlangan — formulasiz;
 *  M12 — F3 oy jami = har F2 o'z podvali bilan ВСЕГО lari yig'indisi (tiyingacha);
 *  m9  — F3 da smeta strukturasida yo'q F2 summasi jim tushmaydi;
 *  M5/NARXSIZ — korporativ rad etish rejasi, avto-narxsiz qatorlar soni.
 */
import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import type { T2Qator } from '../api/supabase';
import type { F2Tafsilot } from '../api/t2-narx';
import type { NakopitelniyQator } from '../api/t2-nakopitelniy';
import { f2AktBaho, f2AktTayyorla, type F2AktEksportKirish } from './f2-akt-eksport';
import { f2Hujjat, f2HujjatVaraqlar } from './f2-hujjat';
import { bajar, formulaniOqi, type Qiymat as FQiymat, type Ref } from './hujjat-tekshir/formula';
import { STORNO_MANBA } from './f2-storno';
import { NAKRUTKA_STANDART } from './nakrutka-kaskad';
import type { AktPodvalNk } from './hisob-yadro';
import { forma3Hujjat } from './forma3-export';
import { oyAktlarBahosi } from './f2-oylik-paket/portfel';
import { portfelKitob } from './f2-oylik-paket/portfel-eksport';
import { avtoNarxsizSoni, f2RadRejasi } from './f2-lifecycle-workflow';

const q = (o: Partial<T2Qator> & { id: number; tur: string; norma?: number | null }): T2Qator => ({
  obyekt_id: 8, obyekt: null, kompaniya_id: 1, ota_id: null, daraja: 0, tartib: o.id, kod: null, nom: `q${o.id}`, birlik: 'м3',
  hajm: null, narx: null, summa: null, kat: null, narx_usul: null, qoshimcha: false, zamena: false,
  d1: null, d2: null, d3: null, xom_qator: null, yangilandi: null, manba_id: null, versiya: 1, ...o,
} as T2Qator);

const SMETA: T2Qator[] = [
  q({ id: 1, tur: 'rz', nom: 'РАЗДЕЛ 1' }),
  q({ id: 2, tur: 'bl', ota_id: 1, kod: 'Е1', nom: 'Выемка грунта', hajm: 10 }),
  q({ id: 3, tur: 'rs', ota_id: 2, kod: '1', kat: 'ЧЕЛ', nom: 'Затраты труда рабочих', birlik: 'чел-ч', norma: 2, narx: 1000 }),
  q({ id: 4, tur: 'rs', ota_id: 2, kod: '2', kat: 'МАШ', nom: 'Экскаватор', birlik: 'маш-ч', norma: 0.5, narx: 3000 }),
  q({ id: 5, tur: 'mat', ota_id: 1, kod: 'М1', kat: 'МАТ', nom: 'Цемент', birlik: 'т', narx: 800000 }),
  q({ id: 6, tur: 'bl', ota_id: 1, kod: 'МК1', kat: 'М/К', nom: 'Металлоконструкции каркаса', birlik: 'т', hajm: 3 }),
  q({ id: 7, tur: 'mat', ota_id: 1, kod: 'М2', kat: 'МАТ', nom: 'Песок', birlik: 'м3' }),
];
const NK = NAKRUTKA_STANDART;
/** Sintetik «hujjatning o'z podvali» foizlari (smeta podvalidan farqli). */
const NK_OZ: AktPodvalNk = { ЗТР_СОЦСТРАХ: 0, ТРАНСПОРТ_МАТЕРИАЛ: 0, СКЛАДСКИЕ_МАТЕРИАЛ: 0, СКЛАДСКИЕ_МК: 0, ТРАНСПОРТ_КАБЕЛЬ: 0, ПРОЧИЕ_ПОДРЯДЧИК: 20, ТРАНСПОРТ_ОБОРУД: 0, ЗАГОТ_СКЛАД_ОБОРУД: 0, СТРАХОВАНИЕ: 0, РИСК: 0, НДС: 12 };

type L = { id: number; hajm: number | null; narx: number | null; summa: number | null; storno?: boolean };
const row = new Map(SMETA.map((r) => [r.id, r]));
const tafsilot = (aktId: number, holat: string, ls: readonly L[], oy = '2026-11-01'): F2Tafsilot[] => ls.map((l, i) => {
  const r = row.get(l.id)!;
  return {
    akt_id: aktId, obyekt_id: 8, kompaniya_id: 1, tur: 'f2', oy, akt_holat: holat, raqam: String(aktId), akt_kim: null, akt_sana: '2026-11-06',
    akt_qator_id: aktId * 100 + i, qator_id: l.id, kod: r.kod, nom: r.nom, birlik: r.birlik, kat: r.kat, qator_tur: r.tur,
    hajm: l.hajm as number, narx: l.narx, summa: l.summa, izoh: null, certified_quantity: l.hajm, certified_unit_price: l.narx, certified_amount: l.summa,
  } as F2Tafsilot;
});
function kirish(holat: string, ls: readonly L[], o: { podvallar?: Array<[string, AktPodvalNk]>; aktId?: number } = {}): F2AktEksportKirish {
  const aktId = o.aktId ?? 900;
  return {
    smeta: SMETA, lines: tafsilot(aktId, holat, ls),
    aktQatorlar: ls.map((l) => ({ qator_id: l.id, hajm: l.hajm, certified_quantity: l.hajm, certified_unit_price: l.narx, certified_amount: l.summa,
      raw_snapshot: l.storno ? { source: STORNO_MANBA, stornoOf: 500 } : { source: 'native_f2_preparation' } })),
    podvallar: new Map((o.podvallar ?? []).map(([k, nk]) => [k, { nk }])), kontekst: { imzo: {}, shartnoma: null, nakrutka: NK, podval: null },
    akt: { id: aktId, oy: '2026-11-01', raqam: String(aktId), holat }, obyektNom: 'Синтетический объект', raqamlar: new Map([[500, '22']]),
  };
}

/* ── Minimal xlsx o'quvchi + formulalardan NOLDAN qayta hisoblovchi (f2-hujjat-pereraschet-formula.test bilan bir xil) ── */
type Katak = { f?: string; v: FQiymat };
const unesc = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
function kitobOqi(bytes: Uint8Array): Map<string, Map<string, Katak>> {
  const z = unzipSync(bytes);
  const nomlar = [...strFromU8(z['xl/workbook.xml']).matchAll(/<sheet name="([^"]+)"/g)].map((m) => unesc(m[1]));
  const varaqlar = new Map<string, Map<string, Katak>>();
  nomlar.forEach((nom, i) => {
    const xml = strFromU8(z[`xl/worksheets/sheet${i + 1}.xml`]);
    const m = new Map<string, Katak>();
    for (const c of xml.matchAll(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ichki = c[3] ?? '';
      const f = /<f>([^<]*)<\/f>/.exec(ichki)?.[1];
      const t = /<t[^>]*>([\s\S]*?)<\/t>/.exec(ichki)?.[1];
      const v = /<v>([^<]*)<\/v>/.exec(ichki)?.[1];
      const str = /t="(str|inlineStr)"/.test(c[2]);
      m.set(c[1], { f: f != null ? unesc(f) : undefined, v: t != null ? unesc(t) : v == null ? null : str ? unesc(v) : Number(v) });
    }
    varaqlar.set(nom.toUpperCase(), m);
  });
  return varaqlar;
}
const refMatn = (r: Ref) => { let s = ''; for (let n = r.c + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return `${s}${r.r + 1}`; };
function qaytaHisobla(k: Map<string, Map<string, Katak>>) {
  const memo = new Map<string, FQiymat>();
  const ol = (varaq: string, ref: string): FQiymat => {
    const kalit = `${varaq.toUpperCase()}!${ref}`;
    if (memo.has(kalit)) return memo.get(kalit)!;
    const c = k.get(varaq.toUpperCase())?.get(ref);
    if (!c) return null;
    if (!c.f) return c.v;
    memo.set(kalit, null);
    const x = bajar(formulaniOqi(c.f), (r) => ol(r.varaq ?? varaq, refMatn(r)), varaq);
    memo.set(kalit, x);
    return x;
  };
  return ol;
}
const qatorTop = (m: Map<string, Katak>, matn: string): number[] => [...m.entries()]
  .filter(([, c]) => typeof c.v === 'string' && c.v.toUpperCase().includes(matn.toUpperCase())).map(([r]) => Number(r.replace(/[A-Z]+/, ''))).sort((a, b) => a - b);
/** Varaqning formulalari noldan hisoblanganda har formula keshga teng; qaytaradi: qayta hisoblovchi. */
function izchil(k: Map<string, Map<string, Katak>>) {
  const ol = qaytaHisobla(k);
  for (const [nom, m] of k) for (const [ref, c] of m) {
    if (!c.f) continue;
    const x = ol(nom, ref);
    if (typeof c.v === 'number') expect(Math.abs(Number(x) - c.v), `${nom}!${ref} ${c.f}`).toBeLessThanOrEqual(0.005);
  }
  return ol;
}
const vsego = (f2: Map<string, Katak>, ol: ReturnType<typeof qaytaHisobla>, matn = 'ВСЕГО К ОПЛАТЕ'): number => Number(ol('Ф-2', `H${qatorTop(f2, matn).at(-1)}`));

/** B1 + B3: minus mat, hajm 0 summali mat, barg М/К ish, oddiy ish + resurslar. */
const ASOSIY: L[] = [
  { id: 2, hajm: 4, narx: null, summa: null }, { id: 3, hajm: 8, narx: 1000, summa: 8000 }, { id: 4, hajm: 2, narx: 3000, summa: 6000 },
  { id: 5, hajm: -1, narx: 800000, summa: -800000 },
  { id: 6, hajm: 1.25, narx: 2000000, summa: 2500000 },
  { id: 7, hajm: 0, narx: null, summa: 5000.37 },
];
const ASOSIY_PRYAMYE = 8000 + 6000 - 800000 + 2500000 + 5000.37;

describe('B1/B3: saqlangan aktning har qatori Excel\'da — ИТОГО yadroga tiyingacha teng', () => {
  it.each(['qoralama', 'tasdiqlangan'])('%s: minus qator, hajm 0 summali qator va barg М/К ish chiqadi', (holat) => {
    const t = f2AktTayyorla(kirish(holat, ASOSIY))!;
    const baho = f2AktBaho(t, { podval: null, nakrutka: NK });
    expect(baho.ustamasiz).toBeCloseTo(ASOSIY_PRYAMYE, 2);
    const h = f2Hujjat(t.bolimlar, t.qatorlar, t.opsiya);
    const k = kitobOqi(h.bytes);
    const f2 = k.get('Ф-2')!;
    const ol = izchil(k);
    const sem = qatorTop(f2, 'ЦЕМЕНТ')[0];
    expect(Number(f2.get(`H${sem}`)?.v)).toBe(-800000);
    expect(f2.get(`F${sem}`)?.v).toBe(-1);
    const pesok = qatorTop(f2, 'ПЕСОК')[0];
    expect(pesok).toBeGreaterThan(0);
    expect(Number(f2.get(`H${pesok}`)?.v)).toBe(5000.37);
    const mk = qatorTop(f2, 'МЕТАЛЛОКОНСТРУКЦИИ')[0];
    expect(Number(f2.get(`H${mk}`)?.v)).toBe(2500000);
    expect(f2.get(`J${mk}`)?.v).toBe('М/К');
    expect(Number(ol('Ф-2', `H${qatorTop(f2, 'ИТОГО ПРЯМЫЕ ЗАТРАТЫ ПО АКТУ')[0]}`))).toBeCloseTo(ASOSIY_PRYAMYE, 2);
    expect(vsego(f2, ol)).toBeCloseTo(baho.qqsBilan!, 2);
    if (holat === 'tasdiqlangan') for (const f of Object.keys(unzipSync(h.bytes)).filter((x) => x.startsWith('xl/worksheets/'))) expect(strFromU8(unzipSync(h.bytes)[f])).not.toContain('<f>');
    else expect([...f2.values()].some((c) => c.f)).toBe(true);
  });

  it('m4: hajmi NULL qator — hajm katagi bo‘sh (0 emas), summa qiymat sifatida sanaladi', () => {
    const t = f2AktTayyorla(kirish('qoralama', [{ id: 7, hajm: null, narx: 1000, summa: 7000 }]))!;
    const f2 = kitobOqi(f2Hujjat(t.bolimlar, t.qatorlar, t.opsiya).bytes).get('Ф-2')!;
    const r = qatorTop(f2, 'ПЕСОК')[0];
    expect(f2.get(`F${r}`)?.v ?? null).toBeNull();
    expect(f2.get(`H${r}`)?.v).toBe(7000);
    expect(f2.get(`H${r}`)?.f).toBeUndefined();
  });

  it('M13: ishi aktda yo‘q resurs ham hujjatda (mustaqil qator), ИТОГО = yadro', () => {
    const t = f2AktTayyorla(kirish('qoralama', [{ id: 3, hajm: 8, narx: 1000, summa: 8000 }]))!;
    const k = kitobOqi(f2Hujjat(t.bolimlar, t.qatorlar, t.opsiya).bytes);
    const f2 = k.get('Ф-2')!;
    expect(qatorTop(f2, 'ЗАТРАТЫ ТРУДА РАБОЧИХ').length).toBeGreaterThan(0);
    const ol = izchil(k);
    expect(Number(ol('Ф-2', `H${qatorTop(f2, 'ИТОГО ПРЯМЫЕ ЗАТРАТЫ ПО АКТУ')[0]}`))).toBeCloseTo(8000, 2);
    expect(f2AktBaho(t, { podval: null, nakrutka: NK }).ustamasiz).toBeCloseTo(8000, 2);
  });
});

describe('Storno bloki: barg qoidasi (M2) va smeta podvali (M4)', () => {
  // Import F2 storno: ish summasi (14 000) VA resurslari (8 000 + 6 000) — server faqat barglarni sanaydi.
  const STORNO: L[] = [
    { id: 2, hajm: -4, narx: null, summa: -14000, storno: true }, { id: 3, hajm: -8, narx: 1000, summa: -8000, storno: true }, { id: 4, hajm: -2, narx: 3000, summa: -6000, storno: true },
  ];
  const YANGI: L[] = [{ id: 2, hajm: 5, narx: null, summa: null }, { id: 3, hajm: 10, narx: 1000, summa: 10000 }, { id: 4, hajm: 2.5, narx: 3000, summa: 7500 }];

  it('ish summasi + resurslari ikki marta sanalmaydi: blok jami −14 000 (−28 000 emas), yadro bilan bir xil', () => {
    const t = f2AktTayyorla(kirish('qoralama', [...STORNO, ...YANGI]))!;
    expect(t.eskiBloklar[0].jami).toBe(-14000);
    const k = kitobOqi(f2Hujjat(t.bolimlar, t.qatorlar, t.opsiya).bytes);
    const f2 = k.get('Ф-2')!;
    const ol = izchil(k);
    expect(Number(ol('Ф-2', `H${qatorTop(f2, 'ИТОГО ПО СТОРНО Ф-2 № 22')[0]}`))).toBeCloseTo(-14000, 2);
  });

  it('o‘z podvali yo‘q storno bloki — smeta podvali (yangi blok o‘z podvali bilan): sof jami = yadro tiyingacha', () => {
    const t = f2AktTayyorla(kirish('qoralama', [...STORNO, ...YANGI], { podvallar: [['900:', NK_OZ]] }))!;
    const baho = f2AktBaho(t, { podval: null, nakrutka: NK });
    const k = kitobOqi(f2Hujjat(t.bolimlar, t.qatorlar, t.opsiya).bytes);
    const f2 = k.get('Ф-2')!;
    const ol = izchil(k);
    expect(Number(ol('Ф-2', `H${qatorTop(f2, 'ИТОГО ПЕРЕРАСЧЕТ')[0]}`))).toBeCloseTo(baho.qqsBilan!, 2);
    // Storno bloki ВСЕГО = yadroning smeta birligi (podvalsiz bloklar)
    const smetaBirlik = baho.birliklar.find((u) => u.manba === 'smeta')!;
    expect(Number(ol('Ф-2', `H${qatorTop(f2, 'ВСЕГО К ОПЛАТЕ — СТОРНО Ф-2 № 22')[0]}`))).toBeCloseTo(smetaBirlik.natija.qqsBilan!, 2);
  });
});

describe('M11: portfel kitobi — qoralama varag‘i formulali, tasdiqlangan — formulasiz', () => {
  it('formulali flag bo‘yicha', () => {
    const varaq = (holat: string) => { const t = f2AktTayyorla(kirish(holat, ASOSIY))!; return f2HujjatVaraqlar(t.bolimlar, t.qatorlar, { ...t.opsiya, varaqNomi: holat }).varaqlar[0]; };
    const svod = (() => { const t = f2AktTayyorla(kirish('tasdiqlangan', ASOSIY))!; return f2HujjatVaraqlar(t.bolimlar, t.qatorlar, { ...t.opsiya, varaqNomi: 'Свод' }).varaqlar[0]; })();
    const z = unzipSync(portfelKitob(svod, [{ varaq: varaq('qoralama'), formulali: true }, varaq('tasdiqlangan')], { nom: 'T' }).bytes);
    expect(strFromU8(z['xl/worksheets/sheet2.xml'])).toContain('<f>');
    expect(strFromU8(z['xl/worksheets/sheet3.xml'])).not.toContain('<f>');
  });
});

/* ── F3 ── */
let seq = 0;
const nq = (p: Partial<NakopitelniyQator> & { qator_id: number; tur: NakopitelniyQator['tur'] }): NakopitelniyQator => ({
  tartib: ++seq, kod: null, nom: `n${p.qator_id}`, birlik: null, kat: null, qoshimcha: false, zamena: false,
  smeta_hajm: null, smeta_narx: null, smeta_summa: null, fakt_hajm: 0, fakt_summa: 0, oldingi_hajm: 0, oldingi_summa: 0, joriy_hajm: 0, joriy_summa: 0, joriy_qoralama_summa: 0,
  jami_hajm: 0, jami_summa: 0, f2_mumkin_hajm: 0, qoldiq_hajm: 0, qoldiq_summa: 0, jami_baseline_summa: 0, jami_actual_summa: null, narx_variance_summa: 0, bajarilish_foiz: null, ...p,
});
// F3 tuzilmasi ketma-ket (bl dan keyingi barglar — uning bolalari): barg М/К ish oxirida.
const NAK: NakopitelniyQator[] = [...SMETA.filter((r) => r.id !== 6), SMETA[5]].map((r) => nq({ qator_id: r.id, tur: r.tur as NakopitelniyQator['tur'], kat: r.kat, nom: r.nom, ota_id: r.ota_id, smeta_summa: 1 }));
const f2Oylik = (ls: ReadonlyArray<{ akt: number; l: L }>) => ls.filter((x) => x.l.summa != null).map((x) => ({ obyekt_id: 8, qator_id: x.l.id, oy: '2026-11', summa: x.l.summa as number, akt_id: x.akt }));

describe('F3 (Форма № 3)', () => {
  it('B3: barg М/К ish va minus qator — F3 oy to‘g‘ri xarajati Ф-2 ИТОГО ПРЯМЫЕ bilan teng', () => {
    const t = f2AktTayyorla(kirish('tasdiqlangan', ASOSIY))!;
    const h = forma3Hujjat({ nakopitelniy: [{ obyekt_id: 8, obyektNom: 'X', qatorlar: NAK }], f2Oylik: f2Oylik(ASOSIY.map((l) => ({ akt: 900, l }))) },
      { obyektNom: 'X', davr: '2026-11', asosiyObyektId: 8, nakrutka: NK });
    expect(h.kaskad.J.pryamye).toBeCloseTo(f2AktBaho(t, { podval: null, nakrutka: NK }).ustamasiz, 2);
  });

  it('M12: ikki akt turli podval bilan — F3 «за отчетный месяц» = ikkala F2 ВСЕГО yig‘indisi (tiyingacha)', () => {
    const A: L[] = [{ id: 3, hajm: 8.333, narx: 1000.01, summa: 8333.08 }, { id: 5, hajm: 0.37, narx: 800000, summa: 296000 }];
    const B: L[] = [{ id: 6, hajm: 1.1, narx: 2000000, summa: 2200000 }, { id: 7, hajm: 3.3, narx: 12345.67, summa: 40740.71 }];
    const m = {
      smeta: SMETA, kontekst: { imzo: {}, shartnoma: null, nakrutka: NK, podval: null }, podvallar: new Map([['901:', { nk: NK_OZ }]]),
      tafsilot: [...tafsilot(901, 'tasdiqlangan', A), ...tafsilot(902, 'tasdiqlangan', B)], aktQatorlar: new Map(),
    };
    const aktlar = [{ id: 901, oy: '2026-11-01', raqam: '901' }, { id: 902, oy: '2026-11-01', raqam: '902' }];
    const davrAktlari = oyAktlarBahosi(m, aktlar, 'X', new Map());
    expect(davrAktlari.map((a) => a.hujjatPodvali)).toEqual([true, false]);
    // Har F2 hujjati ВСЕГО (Excel, formulasiz kesh) — yadro bilan bir xil
    const f2Vsego = [901, 902].map((id, i) => {
      const t = f2AktTayyorla({ ...kirish('tasdiqlangan', i ? B : A, { aktId: id, podvallar: id === 901 ? [['901:', NK_OZ]] : [] }) })!;
      const k = kitobOqi(f2Hujjat(t.bolimlar, t.qatorlar, t.opsiya).bytes);
      return Number(k.get('Ф-2')!.get(`H${qatorTop(k.get('Ф-2')!, 'ВСЕГО К ОПЛАТЕ').at(-1)}`)?.v);
    });
    const kut = Math.round((f2Vsego[0] + f2Vsego[1]) * 100) / 100;
    expect(davrAktlari[0].qqsBilan).toBeCloseTo(f2Vsego[0], 2);
    expect(davrAktlari[1].qqsBilan).toBeCloseTo(f2Vsego[1], 2);
    const h = forma3Hujjat({ nakopitelniy: [{ obyekt_id: 8, obyektNom: 'X', qatorlar: NAK }], f2Oylik: f2Oylik([...A.map((l) => ({ akt: 901, l })), ...B.map((l) => ({ akt: 902, l }))]) },
      { obyektNom: 'X', davr: '2026-11', asosiyObyektId: 8, nakrutka: NK, davrAktlari });
    expect(h.oyKOplate).toBe(kut);
    // Hujjatda: per-akt blok jami va «ИТОГО К ОПЛАТЕ ЗА ОТЧЕТНЫЙ МЕСЯЦ» — shu summa (smeta podvali kaskadi emas)
    const v = kitobOqi(h.bytes).get('ФОРМА № 3')!;
    const [r] = qatorTop(v, 'ИТОГО К ОПЛАТЕ ЗА ОТЧЕТНЫЙ МЕСЯЦ ПО АКТАМ');
    expect([...v.entries()].some(([ref, c]) => ref.endsWith(String(r)) && typeof c.v === 'number' && Math.abs(c.v - kut) < 0.005)).toBe(true);
    expect(h.diqqat.some((d) => d.sabab.includes('собственным подвалам'))).toBe(true);
  });

  it('m9: smeta strukturasida yo‘q F2 summasi F3 jamiga kiradi («вне структуры сметы»), jim tushmaydi', () => {
    const asos = { nakopitelniy: [{ obyekt_id: 8, obyektNom: 'X', qatorlar: NAK }], f2Oylik: [{ obyekt_id: 8, qator_id: 5, oy: '2026-11', summa: 1000 }] };
    const bir = forma3Hujjat(asos, { obyektNom: 'X', davr: '2026-11', asosiyObyektId: 8, nakrutka: NK });
    const ikki = forma3Hujjat({ ...asos, f2Oylik: [...asos.f2Oylik, { obyekt_id: 8, qator_id: 99999, oy: '2026-11', summa: 250.5 }] }, { obyektNom: 'X', davr: '2026-11', asosiyObyektId: 8, nakrutka: NK });
    // Vid zatrat noma'lum — ustamasiz (podvalda «без накрутки»), faqat QQS: +250,50 × 1,12.
    expect(ikki.kaskad.J.nomalumQism).toBeCloseTo(250.5, 2);
    expect(ikki.vsegoKOplate.J! - bir.vsegoKOplate.J!).toBeCloseTo(280.56, 2);
    expect(ikki.diqqat.some((d) => d.sabab.includes('вне структуры сметы'))).toBe(true);
  });
});

describe('Tasdiq oqimi (M5, NARXSIZ_QATOR_BOR)', () => {
  it('korporativ: rad etish faqat tekshirilgan hujjatda, bitta qadam; shaxsiy — zanjir', () => {
    expect(f2RadRejasi('korporativ', 'draft')).toBeNull();
    expect(f2RadRejasi('korporativ', 'submitted')).toBeNull();
    expect(f2RadRejasi('korporativ', 'checked')).toEqual(['rejected']);
    expect(f2RadRejasi('shaxsiy', 'draft')).toEqual(['submitted', 'checked', 'rejected']);
    expect(f2RadRejasi('shaxsiy', 'approved')).toBeNull();
  });
  it('avto-narxsiz qoralama qatorlari sanaladi', () => {
    expect(avtoNarxsizSoni([{ raw_snapshot: { narxsizSabab: 'avto_qoralama' } }, { raw_snapshot: { narxsizSabab: 'ongli' } }, { raw_snapshot: null }, {}])).toBe(1);
  });
});
