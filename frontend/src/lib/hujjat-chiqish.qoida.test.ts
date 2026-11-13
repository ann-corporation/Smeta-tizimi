/**
 * TIZIMDAN CHIQADIGAN HUJJATLAR — UMUMIY QOIDALAR (egasi 2026-11-13).
 * Har hujjat SINTETIK fixture dan yasaladi (haqiqiy mijoz ma'lumoti yo'q) va bir xil qoidalardan o'tadi:
 *   - matn katagida shrinkToFit YO'Q (o'raladi);
 *   - yashirin ustun (Тип / Кат. / КАЛИТ …) katagi o'ralmagan va qator balandligiga ta'sir qilmaydi;
 *   - bir qatorli qator — sukut balandlik (ht yo'q);
 *   - chop: bir sahifa eniga sig'ish, yo'nalish, takrorlanadigan sarlavha qatorlari.
 * Qolgan rasmiy generatorlar (Forma-3, M-29, slichitelniy, АОСР, LRV …) har biri o'z testida `kitobKuzatuvchi` orqali
 * AYNAN shu qoidalarni (hujjatDizaynTekshir) tekshiradi — qarang docs/architecture/HUJJAT_CHIQISH_INVENTAR_2026-11.md.
 */
import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { dizaynOqi, hujjatDizaynTekshir, joriyHujjatDizayni, rasmiyKitob } from './hujjat-yozuvchi';
import { xlsxQoidaTekshir } from './hujjat-yozuvchi/xlsx-qoida';
import { SUKUT_QATOR_PT } from './hujjat-yozuvchi/qator-balandlik';
import { f2Hujjat } from './f2-hujjat';
import { bosKiritma, f2Qatorlar, f2Qur, type F2Holat } from './f2-tayyor';
import { ostatkaHujjatModeli, ostatkaHujjatXlsx } from './ostatka-export';
import { nakopitelniyVedomostHujjat } from './nakopitelniy-vedomost-export';
import { oylikReestrXlsx, mundarijaXlsx } from './f2-oylik-paket/eksport';
import { portfelGuruhla } from './f2-oylik-paket/portfel';
import { portfelSvodVaraq } from './f2-oylik-paket/portfel-eksport';
import { paketReestriXlsx, paketRejasi } from './f2-oylik-paket/portfel-zip';
import { bajarilmadiXlsx } from './bajarilmadi-export';
import { moliyaXlsx } from './moliya-tahlil';
import { omborDavrExcel } from './ombor-prixod/davr-eksport';
import { qarzdorlikXlsxYarat } from './qarzdorlik/eksport';
import type { AktMoliya, PaketAkt } from './f2-oylik-paket/oylik';
import type { NakopitelniyQator } from '../api/t2-nakopitelniy';
import type { T2Qator, T2QatorHolat } from '../api/supabase';
import type { BajarilmadiQator } from '../api/t2-bajarilmadi';

/* ───────── SINTETIK fixture'lar ───────── */
const UZUN_NOM = 'Устройство монолитных железобетонных фундаментных плит с армированием, бетонированием, уплотнением и уходом за бетоном в опалубке при положительных температурах наружного воздуха';
const UZUN_SHIFR = 'ТССЦ-101-0856-СИНТЕТИК-ШИФР-ОЧЕНЬ-ДЛИННЫЙ-КОД';

let id = 0;
const sq = (ota_id: number | null, tur: string, hajm: number | null, extra: Partial<T2Qator> = {}): T2Qator => {
  id++;
  return { id, obyekt_id: 1, obyekt: 'X', kompaniya_id: 1, ota_id, daraja: 0, tartib: id, tur, kod: 'К' + id, nom: 'Позиция ' + id, birlik: 'м3', hajm, narx: 1000,
    summa: null, kat: 'МАТ', narx_usul: null, qoshimcha: false, zamena: false, d1: null, d2: null, d3: null, xom_qator: id, yangilandi: null, manba_id: null, versiya: 1, raqam: null, norma: null, ...extra } as T2Qator;
};
function smetaQatorlari(): T2Qator[] {
  id = 0;
  const rz = sq(null, 'rz', null, { nom: 'РАЗДЕЛ 1. ФУНДАМЕНTЫ'.replace('T', 'Т'), kod: null });
  const bl = sq(rz.id, 'bl', 10, { nom: UZUN_NOM, kod: UZUN_SHIFR });
  return [rz, bl,
    sq(bl.id, 'rs', 5, { norma: 0.5, nom: 'ВОДА', kod: '9219', kat: 'МАТ', birlik: 'м3', narx: 1850 }),
    sq(bl.id, 'rs', 3, { norma: 0.3, nom: 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', kod: '1', kat: 'ЧЕЛ', birlik: 'чел.-ч', narx: 29421 }),
    sq(bl.id, 'mat', 7, { norma: 0.7, nom: 'ПЕСОК ПРИРОДНЫЙ ДЛЯ СТРОИТЕЛЬНЫХ РАБОТ СИНТЕТИЧЕСКИЙ ОЧЕНЬ ДЛИННОЕ НАИМЕНОВАНИЕ МАТЕРИАЛА', kod: 'С101', kat: 'МАТ', narx: 12000 })];
}
const holatlar = (rows: T2Qator[]): F2Holat[] => rows.filter((r) => r.tur !== 'rz').map((r) => ({ qator_id: r.id, f2_mumkin_hajm: (r.hajm ?? 0) * 2, f2_hajm: 0, smeta_hajm: r.hajm, f2_narx: null }));
const NK = { ТРАНСПОРТ_МАТЕРИАЛ: 5, СКЛАДСКИЕ_МАТЕРИАЛ: 2, СКЛАДСКИЕ_МК: 0.75, ТРАНСПОРТ_КАБЕЛЬ: 1.5, ПРОЧИЕ_ПОДРЯДЧИК: 18, ТРАНСПОРТ_ОБОРУД: 2, ЗАГОТ_СКЛАД_ОБОРУД: 1.2, СТРАХОВАНИЕ: 0.32, РИСК: 0 };

function f2Fayl(): Uint8Array {
  const rows = smetaQatorlari();
  const b = f2Qur(rows, holatlar(rows));
  const bl = rows.find((r) => r.tur === 'bl')!;
  const q = f2Qatorlar(b, { ...bosKiritma(), hajm: { [bl.id]: '2' } });
  return f2Hujjat(b, q, { obyektNom: 'Объект синтетический', davr: '2026-10-01', raqam: '1', ndsFoiz: 12, nakrutka: NK,
    imzo: { zakazchik: 'Заказчик Тест', pudratchi: 'Подрядчик Тест' }, shartnoma: '№ 1 от 01.01.2026' }).bytes;
}
function ostatkaFayl(): Uint8Array {
  const rows = smetaQatorlari();
  const hs = rows.filter((r) => r.tur !== 'rz').map((r) => ({ qator_id: r.id, fakt_hajm: 1 } as unknown as T2QatorHolat));
  return ostatkaHujjatXlsx(ostatkaHujjatModeli(rows, hs), { obyektNomi: 'Объект синтетический', sana: '2026-09-25' }).bytes;
}
let nq = 0;
const nk = (p: Partial<NakopitelniyQator> & { tur: NakopitelniyQator['tur'] }): NakopitelniyQator => {
  nq++;
  return { qator_id: nq, tartib: nq, kod: null, nom: null, birlik: null, kat: null, qoshimcha: false, zamena: false, smeta_hajm: null, smeta_narx: null, smeta_summa: null, fakt_hajm: 0, fakt_summa: 0,
    oldingi_hajm: 0, oldingi_summa: 0, joriy_hajm: 0, joriy_summa: 0, joriy_qoralama_summa: 0, jami_hajm: 0, jami_summa: 0, f2_mumkin_hajm: 0, qoldiq_hajm: 0, qoldiq_summa: 0,
    jami_baseline_summa: 0, jami_actual_summa: null, narx_variance_summa: 0, bajarilish_foiz: null, ...p };
};
function nakopitelniyFayl(): Uint8Array {
  nq = 0;
  return nakopitelniyVedomostHujjat([
    nk({ tur: 'rz', nom: 'РАЗДЕЛ 1. СИНТЕТИЧЕСКИЙ', smeta_summa: 1_600_000 }),
    nk({ tur: 'bl', kod: UZUN_SHIFR, nom: UZUN_NOM, birlik: 'м3', smeta_hajm: 100, smeta_summa: 1_600_000, fakt_hajm: 60, oldingi_hajm: 30, joriy_hajm: 20 }),
    nk({ tur: 'rs', kat: 'МАТ', kod: '9219', nom: 'ВОДА', birlik: 'м3', smeta_hajm: 200, smeta_narx: 1850, smeta_summa: 370_000, fakt_hajm: 120, oldingi_hajm: 60, joriy_hajm: 40, joriy_summa: 74_000 }),
  ], { obyektNom: 'Объект синтетический', davr: '2026-09-01', imzo: { zakazchik: 'Заказчик Тест' } }).bytes;
}

const mol = (ustamasiz: number | null, jami: number | null): AktMoliya =>
  ({ ustamasiz, ustamali: jami == null ? null : jami / 1.12, taxminiy: false, nds: jami == null ? null : jami - jami / 1.12, jami, narxsizQator: 0, qatorSoni: 1, sabab: null });
const paketAkt = (aktId: number, obyekt_id: number, obyektNom: string, oy: string, raqam: string | null, bosqich: PaketAkt['bosqich'], m: AktMoliya | null): PaketAkt =>
  ({ akt: { id: aktId, obyekt_id, oy, raqam, holat: bosqich === 'tasdiqlangan' ? 'tasdiqlangan' : 'qoralama', lifecycle_status: null, hujjat_jami: 1000, farq: null, qator_soni: 1, narxsiz_qator: 0, manba: 'tizim' },
    obyektNom, loyiha: null, bosqich, moliya: m, moliyaXato: false, uchastkalar: null } as PaketAkt);
const PAKET_AKTLAR: PaketAkt[] = [
  paketAkt(1, 1, UZUN_NOM.slice(0, 90), '2026-03-01', '1', 'tasdiqlangan', mol(1000, 1232)),
  paketAkt(2, 2, 'Объект Б', '2026-03-01', null, 'jarayonda', mol(null, null)),
];

function bajarilmadiQ(i: number): BajarilmadiQator {
  return { id: i, obyekt_id: 8, qator_id: i, kod: 'E' + i, nom: UZUN_NOM + ' ' + i, birlik: 'м3', smeta_hajm: 123456789.123, fakt_hajm: 3, hajm: null, bajarilmagan_hajm: 7, sabab_kod: 'zamena', sabab_izoh: null,
    hujjat_id: null, hujjat_nom: null, sana: '2026-10-24', zamena_qator_id: null, holat: 'faol', kim: 'Test', yaratildi: '2026-10-24T05:00:00Z' } as BajarilmadiQator;
}

type Hujjat = { nom: string; rasmiy: boolean; bytes: () => Uint8Array | Promise<Uint8Array> };
const HUJJATLAR: Hujjat[] = [
  { nom: 'Ф-2 akt + Ведомость ресурсов', rasmiy: true, bytes: f2Fayl },
  { nom: 'Остаток работ', rasmiy: true, bytes: ostatkaFayl },
  { nom: 'Накопительная ведомость', rasmiy: true, bytes: nakopitelniyFayl },
  { nom: 'Реестр и Свод Ф-2 (oylik)', rasmiy: true, bytes: () => oylikReestrXlsx(PAKET_AKTLAR, { oy: '2026-03', tashkilot: 'Подрядчик Тест' }).bytes },
  { nom: 'Содержание пакета (MUNDARIJA)', rasmiy: true, bytes: () => mundarijaXlsx([{ yol: '01/a.xlsx', hujjat: 'Ф-2', obyekt: 'А', oy: '2026-03', holat: 'утверждён', akt: PAKET_AKTLAR[0] }], { sarlavha: 'Т' }).bytes },
  { nom: 'Свод F2 portfeli', rasmiy: true, bytes: () => rasmiyKitob([portfelSvodVaraq(portfelGuruhla(PAKET_AKTLAR), { kesimMatni: 'по договору № 1', varaqlar: new Map() })], { tur: 'f2' }).bytes },
  { nom: 'Реестр пакета (ZIP)', rasmiy: true, bytes: () => paketReestriXlsx(paketRejasi([{ tur: 'akt', obyekt: 'А', hujjat: 'Акт Ф-2', raqam: '1', davr: 'Март 2026', oyKalit: '2026-03', holat: 'утверждён', summa: 1, bytes: new Uint8Array([1]) }], { svodKesim: 'k' }), { kesimMatni: 'к' }) },
  { nom: 'Bajarilmadi (exceljs)', rasmiy: false, bytes: async () => (await bajarilmadiXlsx([bajarilmadiQ(1), bajarilmadiQ(2)], { obyektNomi: 'Obyekt', sana: '2026-10-24' })).bytes },
  { nom: 'Moliya tahlili (exceljs)', rasmiy: false, bytes: async () => (await moliyaXlsx({ ok: true, generated_at: '2026-10-27T00:00:00Z', qqs: 'bilan', qamrov: { kompaniya_id: 1, obyekt_id: null, obyektlar: [1] },
    korsatkichlar: [{ n: 1, kod: 'fakt', qiymat: 1_500_000_000, manba: 'tizim', formula: UZUN_NOM, qolda: null }], obyekt_yoyilma: null, zanjir_xato_soni: 0 } as never, { qamrovNomi: 'Obyekt', sana: '2026-10-24' })).bytes },
  { nom: 'Ombor reestri (exceljs, yashirin K ustun)', rasmiy: false, bytes: () => omborDavrExcel([
    { id: '1', sana: '2026-10-02', operatsiya: 'prixod', nom: UZUN_NOM, birlik: 'м3', miqdor: 12.5, tomon: 'Поставщик Тест', hujjat: 'Накладная № 1', manbaQator: null, tasdiqlangan: true },
    { id: '2', sana: '2026-10-03', operatsiya: 'rasxod', nom: UZUN_NOM, birlik: 'м3', miqdor: 2, tomon: 'Бригада', hujjat: 'Требование № 2', manbaQator: null, tasdiqlangan: true },
  ], { bosh: '2026-10-01', oxir: '2026-10-31', kompaniya: 'ООО Тест', ombor: 'Склад 1', holat: 'jurnal', rasxodKiritilgan: true }) },
  { nom: 'Qarzdorlik (exceljs, yashirin tur ustuni)', rasmiy: false, bytes: async () => new Uint8Array(await qarzdorlikXlsxYarat([
    { kontragent: 'ТЕСТ ПОСТАВЩИК', nom: 'Поставка по договору', raqam: '1', summa: 2000, spravkaQarz: 1200, qatorlar: [
      { tur: 'oplata', hujjat_raqam: 'ПП-1', sana: '2026-01-15', nomi: UZUN_NOM, birlik: null, hajm: null, narx: null, summa: 600, izoh: null },
      { tur: 'yetkazma', hujjat_raqam: 'Н-1', sana: '2026-01-12', nomi: 'Материал', birlik: 'шт', hajm: 10, narx: 100, summa: null, izoh: null },
    ] },
  ] as never)) },
];

describe.each(HUJJATLAR)('hujjat qoidalari — $nom', (h) => {
  it('shrinkToFit yo‘q, yashirin ustun o‘ralmagan, balandlik va chop sozlamasi to‘g‘ri (har qanday generator)', async () => {
    const bytes = await h.bytes();
    expect(await xlsxQoidaTekshir(bytes)).toEqual([]);
  });
  it.runIf(h.rasmiy)('rasmiy yozuvchi: dizayn tekshiruvi toza; styles.xml da shrinkToFit yo‘q', async () => {
    const bytes = await h.bytes();
    expect(hujjatDizaynTekshir(bytes, joriyHujjatDizayni())).toEqual([]);
    const z = unzipSync(bytes);
    expect(strFromU8(z['xl/styles.xml'])).not.toContain('shrinkToFit');
    expect(dizaynOqi(bytes).xflar.some((x) => x.shrink)).toBe(false);
  });
});

describe('Ф-2 akt — egasi shikoyatlari (B, C) sonlarda', () => {
  const o = dizaynOqi(f2Fayl());
  const v = o.varaqlar[0];
  const qatorOl = (matn: string) => v.qatorlar.find((q) => q.kataklar.some((k) => k.matn === matn))!;

  it('Тип / Кат. / КАЛИТ — yashirin, o‘ralmagan', () => {
    for (const c of [8, 9, 10]) expect(v.ustunlar[c].yashirin).toBe(true);
    for (const q of v.qatorlar) for (const k of q.kataklar) if (k.col >= 8) expect(o.xflar[k.s].wrap).toBe(false);
  });
  it('«ВОДА» resursi — bir qatorli: balandlik sukut (ht yo‘q), KALIT uzun bo‘lsa ham', () => {
    expect(qatorOl('ВОДА').ht).toBeNull();
    expect(SUKUT_QATOR_PT).toBeCloseTo(13.2, 5);
  });
  it('uzun nom: o‘ralgan, balandlik hisoblangan (3 qatorgacha), shrift o‘lchami standart (kichraytirilmagan)', () => {
    const q = v.qatorlar.find((x) => x.kataklar.some((k) => (k.matn ?? '').startsWith('УСТРОЙСТВО МОНОЛИТНЫХ')))!;
    expect(q.ht ?? 0).toBeGreaterThan(SUKUT_QATOR_PT);
    expect(q.ht ?? 0).toBeLessThanOrEqual(3 * 13 + 2 + 0.01);
    const nomKatak = q.kataklar.find((k) => (k.matn ?? '').startsWith('УСТРОЙСТВО'))!;
    expect(o.xflar[nomKatak.s].wrap).toBe(true);
    expect(o.xflar[nomKatak.s].shrink).toBe(false);
    expect(o.fontlar[o.xflar[nomKatak.s].fontId].sz).toBeGreaterThanOrEqual(10);
  });
  it('uzun shifr kichraymaydi — o‘raladi', () => {
    const q = v.qatorlar.find((x) => x.kataklar.some((k) => (k.matn ?? '').startsWith('ТССЦ')))!;
    const sh = q.kataklar.find((k) => (k.matn ?? '').startsWith('ТССЦ'))!;
    expect(o.xflar[sh.s].shrink).toBe(false);
    expect(o.xflar[sh.s].wrap).toBe(true);
  });
  it('tartib raqami (son) o‘ralmaydi va kichraymaydi', () => {
    const q = qatorOl('ВОДА');
    const son = q.kataklar.find((k) => k.col === 0)!;
    expect(son.son).not.toBeNull();
    expect(o.xflar[son.s].wrap).toBe(false);
    expect(o.xflar[son.s].shrink).toBe(false);
  });
});
