import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { bosKesim, kesimgaQosh, type AktPodvalNk, type Kesim } from '../hisob-yadro';
import { RasmiyVaraq } from '../hujjat-yozuvchi';
import { bahoMoliya, f2AktBaho, type F2AktTayyor } from '../f2-akt-eksport';
import type { F2Qator } from '../f2-tayyor';
import type { ReestrAkt, ReestrObyekt, ReestrShartnoma } from '../f2-reestr/reestr';
import type { AktMoliya, PaketAkt } from './oylik';
import { aktVaraqNomi, portfelAktlari, portfelEksportAktlari, portfelGuruhla, portfelJami } from './portfel';
import { portfelKitob, portfelSvodVaraq } from './portfel-eksport';

/* Barcha sonlar SINTETIK. */
const akt = (id: number, obyekt_id: number, oy: string, raqam: string | null, holat: string, lifecycle_status: string | null, hujjat_jami: number | null): ReestrAkt =>
  ({ id, obyekt_id, oy, raqam, holat, lifecycle_status, hujjat_jami, farq: null, qator_soni: 1, narxsiz_qator: 0, manba: 'tizim' });
const obyektlar: ReestrObyekt[] = [
  { id: 1, nom: 'Б-объект', loyiha_id: null, jami: null, narxsiz: null },
  { id: 2, nom: 'А-объект', loyiha_id: null, jami: null, narxsiz: null },
  { id: 3, nom: 'Чужой', loyiha_id: null, jami: null, narxsiz: null },
];
const sh: ReestrShartnoma = { id: 7, raqam: '7', nom: null, jami_nds_bilan: null, summa_bez_nds: null };
const shartnomalar = new Map<number, ReestrShartnoma[]>([[1, [sh]], [2, [sh]]]);
const aktlar = [
  akt(11, 1, '2026-03-01', '2', 'tasdiqlangan', 'approved', 1000),
  akt(12, 1, '2026-02-01', '1', 'tasdiqlangan', 'approved', 500),
  akt(13, 1, '2026-03-01', '3', 'qoralama', 'draft', 300),
  akt(14, 1, '2026-01-01', '0', 'bekor', 'cancelled', 900),
  akt(21, 2, '2026-03-01', '5', 'tasdiqlangan', 'approved', -200), // storno (minus) akt
  akt(31, 3, '2026-03-01', '9', 'tasdiqlangan', 'approved', 7777),
];
const malumot = { aktlar, obyektlar, shartnomalar, loyihalar: new Map<number, string>() };
const mol = (ustamasiz: number | null, jami: number | null): AktMoliya =>
  ({ ustamasiz, ustamali: jami == null ? null : jami / 1.12, taxminiy: false, nds: jami == null ? null : jami - jami / 1.12, jami, narxsizQator: 0, qatorSoni: 1, sabab: null });
const hisobla = (rows: PaketAkt[], m: Record<number, AktMoliya | null>) => rows.map((r) => ({ ...r, moliya: m[r.akt.id] ?? null }));

describe('F2 portfeli — tanlov va guruhlash', () => {
  it('shartnoma kesimi: barcha oylar, faqat shartnoma obyektlari, obyekt → oy tartibida; bekor ham ro‘yxatda', () => {
    const rows = portfelAktlari(malumot, { tur: 'shartnoma', id: 7 });
    expect(rows.map((r) => r.akt.id)).toEqual([21, 14, 12, 11, 13]);
    const p = portfelGuruhla(rows);
    expect(p.obyektlar.map((o) => o.nom)).toEqual(['А-объект', 'Б-объект']);
    expect(p.obyektlar[1].oylar.map((o) => o.oy)).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(p.obyektlar[1].oylar[2].aktlar.map((r) => r.akt.id)).toEqual([11, 13]);
  });

  it('obyekt kesimi faqat shu obyekt', () => {
    expect(portfelAktlari(malumot, { tur: 'obyekt', id: 3 }).map((r) => r.akt.id)).toEqual([31]);
  });

  it('jamilar: tasdiqlangan / qoralama / hammasi alohida; bekor jamiga kirmaydi; minus ishorasi bilan', () => {
    const rows = hisobla(portfelAktlari(malumot, { tur: 'shartnoma', id: 7 }), {
      11: mol(1000, 1232), 12: mol(500, 616), 13: mol(300, 369.6), 14: mol(900, 1108.8), 21: mol(-200, -246.4),
    });
    const p = portfelGuruhla(rows);
    expect(p.jami.tasdiqlangan.soni).toBe(3);
    expect(p.jami.tasdiqlangan.jami.malum).toBeCloseTo(1232 + 616 - 246.4, 6);
    expect(p.jami.qoralama.soni).toBe(1);
    expect(p.jami.qoralama.jami.malum).toBeCloseTo(369.6, 6);
    expect(p.jami.hammasi.soni).toBe(4);
    expect(p.jami.hammasi.jami.malum).toBeCloseTo(1232 + 616 - 246.4 + 369.6, 6);
    expect(p.jami.bekorSoni).toBe(1);
    const b = p.obyektlar.find((o) => o.obyektId === 1)!;
    expect(b.jami.tasdiqlangan.ustamasiz.malum).toBe(1500);
    expect(b.jami.bekorSoni).toBe(1);
  });

  it('NULL ≠ 0: summasi noma’lum akt jamiga 0 bo‘lib qo‘shilmaydi, alohida sanaladi', () => {
    const rows = hisobla(portfelAktlari(malumot, { tur: 'obyekt', id: 1 }), { 11: mol(1000, null), 12: mol(500, 616) });
    const j = portfelJami(rows);
    expect(j.tasdiqlangan.jami.malum).toBe(616);
    expect(j.tasdiqlangan.jami.nomalum).toBe(1);
    // Hali hisoblanmagan qoralama (moliya null): QQS bilan noma'lum, ustamasiz — reestrdagi hujjat jami.
    expect(j.qoralama.jami.nomalum).toBe(1);
    expect(j.qoralama.ustamasiz.malum).toBe(300);
  });

  it('yuklab olish tarkibi: sukut — faqat tasdiqlangan; belgi bilan qoralamalar ham; bekor hech qachon', () => {
    const rows = portfelAktlari(malumot, { tur: 'shartnoma', id: 7 });
    expect(portfelEksportAktlari(rows, false).map((r) => r.akt.id)).toEqual([21, 12, 11]);
    expect(portfelEksportAktlari(rows, true).map((r) => r.akt.id)).toEqual([21, 12, 11, 13]);
  });

  it('varaq nomi: 31 belgidan qisqa, taqiqlangan belgilarsiz', () => {
    expect(aktVaraqNomi({ akt: akt(1, 1, '2026-03-01', '12/A', 'x', null, null) })).toBe('Ф-2 №12-A 2026-03');
    expect(aktVaraqNomi({ akt: akt(5, 1, '2026-03-01', null, 'x', null, null) })).toBe('Ф-2 id5 2026-03');
    expect(aktVaraqNomi({ akt: akt(1, 1, '2026-03-01', 'x'.repeat(50), 'x', null, null) }).length).toBeLessThanOrEqual(31);
  });
});

/* ───────────── akt bahosi: o'z podvali vs smeta podvali, storno ishorasi ───────────── */
const NK_HUJJAT: AktPodvalNk = { ЗТР_СОЦСТРАХ: 0, ТРАНСПОРТ_МАТЕРИАЛ: 0, СКЛАДСКИЕ_МАТЕРИАЛ: 0, СКЛАДСКИЕ_МК: 0, ТРАНСПОРТ_КАБЕЛЬ: 0, ПРОЧИЕ_ПОДРЯДЧИК: 10, ТРАНСПОРТ_ОБОРУД: 0, ЗАГОТ_СКЛАД_ОБОРУД: 0, СТРАХОВАНИЕ: 0, РИСК: 0, НДС: 12 };
const kesim = (kat: string, summa: number): Kesim => kesimgaQosh(bosKesim(), kat, summa);
const qator = (id: number, summa: number | null): F2Qator => ({ id, ishId: null, tur: 'rs', kat: 'ЧЕЛ', nom: 'x', birlik: 'чел-ч', hajm: 1, narx: summa, summa, manba: 'oldingi_f2', narxsiz: summa == null });
const tayyor = (p: Partial<F2AktTayyor>): F2AktTayyor => ({ bolimlar: [], qatorlar: [], eskiBloklar: [], topilmagan: 0, ozNk: null, blokNk: () => null, opsiya: { obyektNom: '', davr: '' }, ...p });

describe('F2 portfeli — akt bahosi (yagona yadro)', () => {
  it('aktning o‘z podvali bo‘lsa — o‘shaniki: 1000 → 1100 / 132 / 1232', () => {
    const m = bahoMoliya(f2AktBaho(tayyor({ qatorlar: [qator(1, 1000)], ozNk: NK_HUJJAT }), { podval: null, nakrutka: null }), 1000);
    expect(m.ustamali).toBe(1100);
    expect(m.nds).toBe(132);
    expect(m.jami).toBe(1232);
    expect(m.sabab).toBeNull();
  });

  it('storno bloki o‘z podvali bilan, ishora saqlanadi: −1000 → −1232', () => {
    const blok = { manbaAktId: 5, raqam: '5', qatorlar: [], kesim: kesim('ЧЕЛ', -1000), jami: -1000, nomalum: 0 };
    const m = bahoMoliya(f2AktBaho(tayyor({ eskiBloklar: [blok], blokNk: () => NK_HUJJAT }), { podval: null, nakrutka: null }), -1000);
    expect(m.ustamasiz).toBe(-1000);
    expect(m.jami).toBe(-1232);
  });

  it('podval yo‘q (o‘zi ham, smetada ham) — ustamali va QQS noma’lum (0 emas)', () => {
    const m = bahoMoliya(f2AktBaho(tayyor({ qatorlar: [qator(1, 1000)] }), { podval: null, nakrutka: null }), 1000);
    expect(m.ustamasiz).toBe(1000);
    expect(m.ustamali).toBeNull();
    expect(m.jami).toBeNull();
    expect(m.sabab).not.toBeNull();
  });

  it('qatorsiz akt — faqat hujjat jami', () => {
    const m = bahoMoliya(f2AktBaho(tayyor({}), { podval: null, nakrutka: null }), 555);
    expect(m).toMatchObject({ ustamasiz: 555, ustamali: null, jami: null, sabab: 'QATOR_YOQ' });
  });
});

/* ───────────── bitta Excel: Свод + akt varaqlari ───────────── */
describe('F2 portfeli — Excel kitob', () => {
  it('1-varaq «Свод» formulali, akt varaqlari formulasiz; bekor kulrang, jamida yo‘q', () => {
    const rows = hisobla(portfelAktlari(malumot, { tur: 'shartnoma', id: 7 }), {
      11: mol(1000, 1232), 12: mol(500, 616), 13: mol(300, 369.6), 14: mol(900, 1108.8), 21: mol(-200, -246.4),
    });
    const p = portfelGuruhla(rows);
    const svod = portfelSvodVaraq(p, { kesimMatni: 'по договору № 7', varaqlar: new Map([[11, 'Ф-2 №2 2026-03']]), kirmadi: new Map([[12, 'лист не сформирован']]) });
    const aktV = new RasmiyVaraq({ nom: 'Ф-2 №2 2026-03', sarlavha: 'АКТ', ustunlar: [{ sarlavha: 'Сумма', kenglik: 10, tur: 'pul' }] });
    aktV.qator('oddiy', [5]);
    aktV.qator('vsego', [{ f: 'SUM(A5:A5)', v: 5 }]);
    const k = portfelKitob(svod, [aktV], { nom: '№ 7' });
    expect(k.faylNomi).toMatch(/\.xlsx$/);
    const z = unzipSync(k.bytes);
    const wb = strFromU8(z['xl/workbook.xml']);
    expect(wb.indexOf('name="Свод"')).toBeLessThan(wb.indexOf('name="Ф-2 №2 2026-03"'));
    const s1 = strFromU8(z['xl/worksheets/sheet1.xml']);
    const s2 = strFromU8(z['xl/worksheets/sheet2.xml']);
    expect(s1).toMatch(/<f>/);
    expect(s2).not.toMatch(/<f>/);
    // Shartnoma jami (tasdiqlangan, QQS bilan): 1232 + 616 − 246.4 = 1601.6; bekor (1108.8) kirmaydi.
    expect(s1).toContain('1601.6');
    expect(s1).not.toContain('2710.4');
  });

  // Egasi (2026-11-06): narxsiz qatorlar svodda ham bildiriladi; bekor akt sanalmaydi.
  it('svod: narxsiz qatorli akt — izohda «строк без цены», ИТОГО yonida «итог неполный»; yo‘q — ogohlantirish yo‘q', () => {
    const svodXml = (m: Record<number, AktMoliya | null>) => {
      const p = portfelGuruhla(hisobla(portfelAktlari(malumot, { tur: 'shartnoma', id: 7 }), m));
      const svod = portfelSvodVaraq(p, { kesimMatni: 'по договору № 7', varaqlar: new Map() });
      return strFromU8(unzipSync(portfelKitob(svod, [], { nom: 'T' }).bytes)['xl/worksheets/sheet1.xml']);
    };
    expect(svodXml({ 11: mol(1000, 1232) })).not.toContain('итог неполный');
    const x = svodXml({ 11: { ...mol(1000, 1232), narxsizQator: 2 }, 14: { ...mol(900, 1108.8), narxsizQator: 5 } });
    expect(x).toMatch(/строк без цены: 2/i);
    expect(x).toContain('Внимание: 2 строки без цены — итог неполный');
  });
});
