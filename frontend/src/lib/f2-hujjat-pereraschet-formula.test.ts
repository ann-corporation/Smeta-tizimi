/**
 * Pereraschet Ф-2 Excel (egasi 2026-11-06, qoralama «№ 23-С» fikri) — SINTETIK ma'lumot (repo public):
 *  1. storno bloki eski F2 qiymatlari AYNAN (qatorlarda formula yo'q);
 *  2. yangi hajmlar bloki TIRIK formulalar; butun kitob formulalardan NOLDAN qayta hisoblanganda natija yadro
 *     (`f2AktBaho` → `f2Baholash`) bilan tiyingacha teng; texnadzor hajmni o'zgartirsa resurs va jamilar o'zgaradi;
 *  3. qator balandligi «Hujjat dizayni» `qatorMaks` ga bo'ysunadi;
 *  4. storno bloki razdel sarlavhalari (ichki razdelda to'liq yo'l) va razdel jamilari bilan, smeta daraxti tartibida.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import type { T2Qator } from '../api/supabase';
import type { F2Tafsilot } from '../api/t2-narx';
import { kompaniyaDizayniniQoy } from '../api/f2-hujjat-kontekst';
import { f2AktBaho, f2AktTayyorla, type F2AktEksportKirish } from './f2-akt-eksport';
import { f2Hujjat } from './f2-hujjat';
import { bajar, formulaniOqi, type Qiymat as FQiymat, type Ref } from './hujjat-tekshir/formula';
import { dizaynTozala, hujjatDizayniniSaqla, joriyHujjatDizayni } from './hujjat-yozuvchi';
import { NARX_ANIQLANMAGAN } from './narx-bildirishnoma';
import { STORNO_MANBA } from './f2-storno';
import { NAKRUTKA_STANDART } from './nakrutka-kaskad';
import { namunaSaqla } from './hujjat-yozuvchi/test-yordam';
import type { AktPodvalNk } from './hisob-yadro';

const q = (o: Partial<T2Qator> & { id: number; tur: string; norma?: number | null }): T2Qator => ({
  obyekt_id: 8, obyekt: null, kompaniya_id: 1, ota_id: null, daraja: 0, tartib: o.id, kod: null, nom: `q${o.id}`, birlik: 'м3',
  hajm: null, narx: null, summa: null, kat: null, narx_usul: null, qoshimcha: false, zamena: false,
  d1: null, d2: null, d3: null, xom_qator: null, yangilandi: null, manba_id: null, versiya: 1, ...o,
} as T2Qator);

const UZUN = 'УСТРОЙСТВО МОНОЛИТНЫХ ЖЕЛЕЗОБЕТОННЫХ КОНСТРУКЦИЙ ПЕРЕКРЫТИЙ, БАЛОК, РИГЕЛЕЙ И ПЛИТ ПРИ ВЫСОТЕ ОТ ОПОРНОЙ ПЛОЩАДКИ ДО 6 М С ПРИМЕНЕНИЕМ ИНВЕНТАРНОЙ ОПАЛУБКИ, АРМИРОВАНИЕМ, БЕТОНИРОВАНИЕМ И УХОДОМ ЗА БЕТОНОМ В ЗИМНИХ УСЛОВИЯХ';
const SMETA: T2Qator[] = [
  q({ id: 1, tur: 'rz', nom: 'УЧАСТОК 1' }),
  q({ id: 2, tur: 'rz', ota_id: 1, nom: 'РАЗДЕЛ 1. ЗЕМЛЯНЫЕ' }),
  q({ id: 3, tur: 'bl', ota_id: 2, kod: 'Е1', nom: 'Выемка грунта', hajm: 10 }),
  q({ id: 4, tur: 'rs', ota_id: 3, kod: '1', kat: 'ЧЕЛ', nom: 'Затраты труда рабочих', birlik: 'чел-ч', norma: 2, narx: 1000 }),
  q({ id: 5, tur: 'rs', ota_id: 3, kod: '2', kat: 'МАШ', nom: 'Экскаватор', birlik: 'маш-ч', norma: 0.5, narx: 3000 }),
  q({ id: 6, tur: 'mat', ota_id: 2, kod: 'М1', kat: 'МАТ', nom: 'Цемент', birlik: 'т', hajm: 3, narx: 800000 }),
  q({ id: 7, tur: 'rz', nom: 'УЧАСТОК 2' }),
  q({ id: 8, tur: 'bl', ota_id: 7, kod: 'Е2', nom: UZUN, hajm: 5 }),
  q({ id: 9, tur: 'rs', ota_id: 8, kod: '1', kat: 'ЧЕЛ', nom: 'Затраты труда рабочих', birlik: 'чел-ч', norma: 3, narx: 1200 }),
  q({ id: 10, tur: 'rs', ota_id: 8, kod: '9', kat: 'МАТ', nom: 'Арматура', birlik: 'т', norma: 1, narx: null }),
];
const NK = NAKRUTKA_STANDART;
/** Eski F2 (storno manbasi) ning O'Z hujjat podvali — sintetik foizlar. */
const NK_ESKI: AktPodvalNk = { ЗТР_СОЦСТРАХ: 0, ТРАНСПОРТ_МАТЕРИАЛ: 0, СКЛАДСКИЕ_МАТЕРИАЛ: 0, СКЛАДСКИЕ_МК: 0, ТРАНСПОРТ_КАБЕЛЬ: 0, ПРОЧИЕ_ПОДРЯДЧИК: 10, ТРАНСПОРТ_ОБОРУД: 0, ЗАГОТ_СКЛАД_ОБОРУД: 0, СТРАХОВАНИЕ: 0, РИСК: 0, НДС: 12 };

type L = { id: number; hajm: number; narx: number | null; summa: number | null; storno?: boolean };
const YANGI: L[] = [
  { id: 3, hajm: 4, narx: null, summa: null }, { id: 4, hajm: 8, narx: 1000, summa: 8000 }, { id: 5, hajm: 2, narx: 3000, summa: 6000 },
  { id: 6, hajm: 1.5, narx: 800000, summa: 1200000 }, { id: 8, hajm: 5, narx: null, summa: null }, { id: 9, hajm: 15, narx: 1200, summa: 18000 },
  { id: 10, hajm: 5, narx: null, summa: null },
];
const STORNO: L[] = [
  // ataylab aralash tartib — hujjat smeta daraxti tartibida chiqarishi shart
  { id: 9, hajm: -3, narx: 1200, summa: -3600 }, { id: 6, hajm: -1, narx: 800000, summa: -800000 }, { id: 3, hajm: -3, narx: null, summa: null },
  { id: 4, hajm: -6, narx: 1000, summa: -6000 }, { id: 5, hajm: -1.5, narx: 3000, summa: -4500 },
].map((x) => ({ ...x, storno: true }));

function kirish(holat: string, ozPodval = false): F2AktEksportKirish {
  const row = new Map(SMETA.map((r) => [r.id, r]));
  const hamma = [...STORNO, ...YANGI];
  const lines = hamma.map((l, i) => {
    const r = row.get(l.id)!;
    return {
      akt_id: 900, obyekt_id: 8, kompaniya_id: 1, tur: 'f2', oy: '2026-11-01', akt_holat: holat, raqam: '23-С', akt_kim: null, akt_sana: '2026-11-06',
      akt_qator_id: 5000 + i, qator_id: l.id, kod: r.kod, nom: r.nom, birlik: r.birlik, kat: r.kat, qator_tur: r.tur,
      hajm: l.hajm, narx: l.narx, summa: l.summa, izoh: null, certified_quantity: l.hajm, certified_unit_price: l.narx, certified_amount: l.summa,
    } as F2Tafsilot;
  });
  return {
    smeta: SMETA, lines,
    aktQatorlar: hamma.map((l) => ({ qator_id: l.id, hajm: l.hajm, certified_quantity: l.hajm, certified_unit_price: l.narx, certified_amount: l.summa,
      raw_snapshot: l.storno ? { source: STORNO_MANBA, stornoOf: 500 } : { source: 'native_f2_preparation' } })),
    podvallar: new Map(ozPodval ? [['900:500', { nk: NK_ESKI }]] : []), kontekst: { imzo: {}, shartnoma: null, nakrutka: NK, podval: null },
    akt: { id: 900, oy: '2026-11-01', raqam: '23-С', holat }, obyektNom: 'Синтетический объект', raqamlar: new Map([[500, '22']]),
  };
}

/* ── Minimal xlsx o'quvchi + NOLDAN qayta hisoblovchi (kesh e'tiborsiz) ── */
type Katak = { f?: string; v: FQiymat };
const unesc = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
function kitobOqi(bytes: Uint8Array): { varaqlar: Map<string, Map<string, Katak>>; nomlar: string[] } {
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
  return { varaqlar, nomlar };
}
const refMatn = (r: Ref) => { let s = ''; for (let n = r.c + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return `${s}${r.r + 1}`; };
/** Har formula kesh o'rniga formulalardan qayta hisoblanadi (rekursiv, memo). `ozgar` — qo'lda kiritilgan qiymatlar (texnadzor). */
function qaytaHisobla(k: ReturnType<typeof kitobOqi>, ozgar: Record<string, number> = {}) {
  const memo = new Map<string, FQiymat>();
  const ol = (varaq: string, ref: string): FQiymat => {
    const kalit = `${varaq.toUpperCase()}!${ref}`;
    if (kalit in ozgar) return ozgar[kalit];
    if (memo.has(kalit)) return memo.get(kalit)!;
    const c = k.varaqlar.get(varaq.toUpperCase())?.get(ref);
    if (!c) return null;
    if (!c.f) return c.v;
    memo.set(kalit, null); // sikl himoyasi
    const x = bajar(formulaniOqi(c.f), (r) => ol(r.varaq ?? varaq, refMatn(r)), varaq);
    memo.set(kalit, x);
    return x;
  };
  return ol;
}
const qatorTop = (m: Map<string, Katak>, matn: string): number[] => [...m.entries()]
  .filter(([, c]) => typeof c.v === 'string' && c.v.toUpperCase().includes(matn.toUpperCase())).map(([r]) => Number(r.replace(/[A-Z]+/, ''))).sort((a, b) => a - b);

afterEach(() => hujjatDizayniniSaqla(null));

describe('Pereraschet Ф-2 Excel: storno — qiymat, yangi blok — tirik formula (egasi 2026-11-06)', () => {
  it.each([['smeta podvali', false], ['storno — eski F2 ning o‘z podvali', true]] as const)('qoralama (%s): kitob formulalardan noldan qayta hisoblanganda har katak keshga, sof jami yadroga tiyingacha teng', (_n, ozPodval) => {
    const t = f2AktTayyorla(kirish('qoralama', ozPodval))!;
    expect(t.opsiya.formulasiz).toBe(false);
    const h = f2Hujjat(t.bolimlar, t.qatorlar, t.opsiya);
    namunaSaqla(`F2_pereraschet_sintetik_${ozPodval ? 'oz' : 'smeta'}.xlsx`, h.bytes);
    const k = kitobOqi(h.bytes);
    const ol = qaytaHisobla(k);
    let formulalar = 0;
    for (const [nom, m] of k.varaqlar) for (const [ref, c] of m) {
      if (!c.f) continue;
      formulalar++;
      const x = ol(nom, ref);
      if (typeof c.v === 'number') expect(Math.abs(Number(x) - c.v), `${nom}!${ref} ${c.f}`).toBeLessThanOrEqual(0.005);
      else expect(x ?? '', `${nom}!${ref} ${c.f}`).toBe(c.v ?? '');
    }
    expect(formulalar).toBeGreaterThan(20);
    const f2 = k.varaqlar.get('Ф-2')!;
    const baho = f2AktBaho(t, { podval: null, nakrutka: NK });
    const [per] = qatorTop(f2, 'ИТОГО ПЕРЕРАСЧЕТ');
    expect(f2.get(`H${per}`)?.f).toMatch(/^SUM\(/);
    expect(Number(ol('Ф-2', `H${per}`))).toBeCloseTo(baho.qqsBilan!, 2);
    // Ustamasiz yangi blok (ИТОГО ПРЯМЫЕ) = yangi qatorlar summasi
    const [pr] = qatorTop(f2, 'ИТОГО ПРЯМЫЕ ЗАТРАТЫ ПО АКТУ');
    expect(Number(ol('Ф-2', `H${pr}`))).toBeCloseTo(8000 + 6000 + 1200000 + 18000, 2);
  });

  it('yangi blokda formulalar: resurs = ROUND(norma × ish hajmi), summa = ROUND(hajm × narx), ish = SUM, podval SUMIF; texnadzor hajmni o‘zgartirsa qayta hisoblanadi', () => {
    const t = f2AktTayyorla(kirish('qoralama'))!;
    const k = kitobOqi(f2Hujjat(t.bolimlar, t.qatorlar, t.opsiya).bytes);
    const f2 = k.varaqlar.get('Ф-2')!;
    const [itogo] = qatorTop(f2, 'ИТОГО ПРЯМЫЕ ЗАТРАТЫ ПО АКТУ');
    // Yangi blokdagi «Выемка грунта» (storno blokidan keyingi)
    const ish = qatorTop(f2, 'ВЫЕМКА ГРУНТА').filter((r) => r < itogo).at(-1)!;
    expect(f2.get(`F${ish}`)?.v).toBe(4);
    expect(f2.get(`H${ish}`)?.f).toBe(`SUM(H${ish + 1}:H${ish + 2})`);
    expect(f2.get(`F${ish + 1}`)?.f).toBe(`ROUND(E${ish + 1}*F${ish},6)`);
    expect(f2.get(`H${ish + 1}`)?.f).toBe(`ROUND(F${ish + 1}*G${ish + 1},2)`);
    expect([...f2.values()].some((c) => c.f?.startsWith('SUMIF(J'))).toBe(true);
    // Narxsiz resurs — summa katagida belgi (0 emas), formula emas
    const arm = qatorTop(f2, 'АРМАТУРА').filter((r) => r < itogo).at(-1)!;
    expect(f2.get(`H${arm}`)?.v).toBe(NARX_ANIQLANMAGAN);
    // Texnadzor: ish hajmi 4 → 6
    const ol = qaytaHisobla(k, { [`Ф-2!F${ish}`]: 6 });
    expect(Number(ol('Ф-2', `F${ish + 1}`))).toBeCloseTo(12, 6);
    expect(Number(ol('Ф-2', `H${itogo}`))).toBeCloseTo(8000 + 6000 + 1200000 + 18000 + 2 * (2 * 1000 + 0.5 * 3000), 2);
  });

  it('storno bloki: qatorlar eski F2 qiymatlari aynan (formula yo‘q), razdel sarlavhalari to‘liq yo‘l bilan, ish ostida resurslar, razdel jamilari, daraxt tartibida', () => {
    const t = f2AktTayyorla(kirish('qoralama'))!;
    const k = kitobOqi(f2Hujjat(t.bolimlar, t.qatorlar, t.opsiya).bytes);
    const f2 = k.varaqlar.get('Ф-2')!;
    const [bosh] = qatorTop(f2, 'СТОРНО Ф-2 № 22');
    const [oxir] = qatorTop(f2, 'ИТОГО ПО СТОРНО Ф-2 № 22');
    expect(bosh).toBeLessThan(oxir);
    const ichida = (s: string) => qatorTop(f2, s).filter((r) => r > bosh && r < oxir);
    const [u1] = ichida('УЧАСТОК 1 / РАЗДЕЛ 1. ЗЕМЛЯНЫЕ');
    const [u1Jami] = ichida('ИТОГО ПО РАЗДЕЛУ «РАЗДЕЛ 1. ЗЕМЛЯНЫЕ»');
    const [u1Ildiz] = ichida('ИТОГО ПО «УЧАСТОК 1»');
    const [u2] = ichida('УЧАСТОК 2');
    const [u2Jami] = ichida('ИТОГО ПО «УЧАСТОК 2»');
    expect(u1).toBeLessThan(u1Jami); expect(u1Jami).toBeLessThan(u1Ildiz); expect(u1Ildiz).toBeLessThan(u2); expect(u2).toBeLessThan(u2Jami);
    // Ish → resurslari darhol ostida (aralash keltirilgan tartibdan qat'i nazar)
    const [ish] = ichida('ВЫЕМКА ГРУНТА');
    expect(ish).toBeGreaterThan(u1);
    expect(f2.get(`F${ish}`)?.v).toBe(-3);
    expect(f2.get(`H${ish}`)?.f).toBe(`SUM(H${ish + 1}:H${ish + 2})`);
    expect([f2.get(`H${ish + 1}`), f2.get(`H${ish + 2}`)].map((c) => [c?.f, c?.v])).toEqual([[undefined, -6000], [undefined, -4500]]);
    expect(ichida('ЦЕМЕНТ')[0]).toBeGreaterThan(ish + 2);
    // Qator kataklarida (F/G/H) formula yo'q — eski hujjat qiymatlari
    for (const r of [...ichida('ЦЕМЕНТ'), ...ichida('ЗАТРАТЫ ТРУДА РАБОЧИХ'), ...ichida('ЭКСКАВАТОР')]) for (const c of 'FGH') expect(f2.get(`${c}${r}`)?.f).toBeUndefined();
    // Razdel jamilari va blok jami — yadro bilan bir xil
    const ol = qaytaHisobla(k);
    expect(Number(ol('Ф-2', `H${u1Ildiz}`))).toBeCloseTo(-6000 - 4500 - 800000, 2);
    expect(Number(ol('Ф-2', `H${u2Jami}`))).toBeCloseTo(-3600, 2);
    expect(Number(ol('Ф-2', `H${oxir}`))).toBeCloseTo(-814100, 2);
  });

  it('tasdiqlangan akt — muzlatilgan tarix: bitta ham formula yo‘q, sof jami o‘zgarmaydi', () => {
    const t = f2AktTayyorla(kirish('tasdiqlangan'))!;
    expect(t.opsiya.formulasiz).toBe(true);
    const h = f2Hujjat(t.bolimlar, t.qatorlar, t.opsiya);
    const z = unzipSync(h.bytes);
    expect(strFromU8(z['xl/worksheets/sheet1.xml'])).not.toContain('<f>');
    const f2 = kitobOqi(h.bytes).varaqlar.get('Ф-2')!;
    const [per] = qatorTop(f2, 'ИТОГО ПЕРЕРАСЧЕТ');
    expect(f2.get(`H${per}`)?.v).toBeCloseTo(f2AktBaho(t, { podval: null, nakrutka: NK }).qqsBilan!, 2);
  });
});

describe('Ф-2 qator balandligi — «Hujjat dizayni» qatorMaks', () => {
  const ht = (bytes: Uint8Array): number => {
    const xml = strFromU8(unzipSync(bytes)['xl/worksheets/sheet1.xml']);
    const k = kitobOqi(bytes).varaqlar.get('Ф-2')!;
    const r = qatorTop(k, UZUN.slice(0, 40)).at(-1)!;
    return Number(new RegExp(`<row r="${r}"[^>]*? ht="([\\d.]+)"`).exec(xml)?.[1] ?? 13.2);
  };
  const yasa = () => { const t = f2AktTayyorla(kirish('qoralama'))!; return f2Hujjat(t.bolimlar, t.qatorlar, t.opsiya).bytes; };

  it('sukut 3 qator; 1 — bir qator; 0 — to‘liq o‘raladi (uzun nom barcha qatorni shishirmaydi)', () => {
    expect(joriyHujjatDizayni().qatorMaks).toBe(3);
    const sukut = ht(yasa());
    expect(sukut).toBeLessThanOrEqual(3 * 13 + 2);
    hujjatDizayniniSaqla(dizaynTozala({ qatorMaks: 0 }));
    const toliq = ht(yasa());
    expect(toliq).toBeGreaterThan(sukut);
    hujjatDizayniniSaqla(dizaynTozala({ qatorMaks: 1 }));
    expect(ht(yasa())).toBe(13.2); // bir qator — maxsus balandlik yozilmaydi
  });

  it('kompaniya sozlamasi (server `hujjat.dizayn._uslub`) hujjat yozuvchiga qo‘llanadi', () => {
    kompaniyaDizayniniQoy({ sozlamalar: { 'hujjat.dizayn': { qiymat: { f2: 'kok', _uslub: { preset: 'minimal', qatorMaks: 2 } } } } });
    expect(joriyHujjatDizayni().qatorMaks).toBe(2);
    expect(joriyHujjatDizayni().preset).toBe('minimal');
    expect(ht(yasa())).toBeLessThanOrEqual(2 * 13 + 2);
    kompaniyaDizayniniQoy({ sozlamalar: {} }); // server qiymati yo'q — joriy nusxa o'zgarmaydi
    expect(joriyHujjatDizayni().qatorMaks).toBe(2);
  });
});
