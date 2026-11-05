/**
 * Oylik paket = F2 portfeli = F2 tarixi (egasi 2026-11-05): bir xil akt uchun bir xil summa va bir xil Ф-2 bayti.
 * Akt 246 — real tuzilmali fixture (sonlar fixture'dan); podval foizlari SINTETIK.
 */
import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { NAKRUTKA_STANDART } from '../nakrutka-kaskad';
import { bosKiritma, f2Qatorlar, f2Qur, f2Yuk } from '../f2-tayyor';
import { AKT246_HAJM, AKT246_HOLAT, AKT246_ROWS } from '../f2-hujjat.fixture';
import type { F2Tafsilot } from '../../api/t2-narx';
import type { AktPodvalNk } from '../hisob-yadro';
import { f2Hujjat } from '../f2-hujjat';
import { f2AktTayyorla } from '../f2-akt-eksport';
import type { ReestrAkt, ReestrObyekt, ReestrShartnoma } from '../f2-reestr/reestr';
import { oyAktlari, oyJami, paketTekshiruvlari, type PaketAkt } from './oylik';
import { paketAktExcel, paketAktHisobi, portfelAktMoliya, portfelAktlari, portfelGuruhla, type PortfelObyektKirish } from './portfel';
import { mundarijaXlsx } from './eksport';
import { oyPapkalarigaYigish, paketEskirganmi, paketF2FaylNomi } from './shartnoma';

const b = f2Qur(AKT246_ROWS, AKT246_HOLAT);
const q = f2Qatorlar(b, { ...bosKiritma(), hajm: AKT246_HAJM });
const rowMap = new Map(AKT246_ROWS.map((r) => [r.id, r]));
const tafsilot = f2Yuk(q, '1').map((p, i) => {
  const r = rowMap.get(p.qatorId)!;
  return { akt_id: 246, obyekt_id: 79, kompaniya_id: 17, tur: 'f2', oy: '2026-10-01', akt_holat: 'tasdiqlangan', raqam: '1', akt_kim: null, akt_sana: '2026-10-02', akt_qator_id: 1000 + i,
    qator_id: p.qatorId, kod: r.kod, nom: r.nom, birlik: r.birlik, kat: r.kat, qator_tur: r.tur, hajm: p.certifiedQuantity ?? 0, narx: p.certifiedUnitPrice ?? null, summa: p.certifiedAmount ?? null, izoh: null,
    certified_quantity: p.certifiedQuantity ?? null, certified_unit_price: p.certifiedUnitPrice ?? null, certified_amount: p.certifiedAmount ?? null } as F2Tafsilot;
});
const NK_HUJJAT: AktPodvalNk = { ЗТР_СОЦСТРАХ: 0, ТРАНСПОРТ_МАТЕРИАЛ: 0, СКЛАДСКИЕ_МАТЕРИАЛ: 0, СКЛАДСКИЕ_МК: 0, ТРАНСПОРТ_КАБЕЛЬ: 0, ПРОЧИЕ_ПОДРЯДЧИК: 10, ТРАНСПОРТ_ОБОРУД: 0, ЗАГОТ_СКЛАД_ОБОРУД: 0, СТРАХОВАНИЕ: 0, РИСК: 0, НДС: 12 };
const kontekst = { imzo: {}, shartnoma: null, nakrutka: NAKRUTKA_STANDART, podval: null };
const obyekt = (podvallar: Map<string, { nk: AktPodvalNk }>): PortfelObyektKirish => ({ smeta: AKT246_ROWS, tafsilot, kontekst, aktQatorlar: new Map(), podvallar });
const akt: ReestrAkt = { id: 246, obyekt_id: 79, oy: '2026-10-01', raqam: '1', holat: 'tasdiqlangan', lifecycle_status: 'approved', hujjat_jami: 150026606.32, farq: 0, qator_soni: 1, narxsiz_qator: 0, manba: 'tizim' };
const raqamlar = new Map([[246, '1']]);
const malumot = {
  aktlar: [akt], obyektlar: [{ id: 79, nom: 'Fast Food 1-etaj', loyiha_id: null, jami: null, narxsiz: null }] as ReestrObyekt[],
  shartnomalar: new Map<number, ReestrShartnoma[]>([[79, [{ id: 5, raqam: 'L-2', nom: null, jami_nds_bilan: null, summa_bez_nds: null }]]]), loyihalar: new Map<number, string>(),
};

describe('paket ↔ portfel ↔ F2 tarixi — bir xil hisob', () => {
  for (const [nom, pv] of [['smeta podvali', new Map()], ['aktning o‘z podvali', new Map([['246:', { nk: NK_HUJJAT }]])]] as const) {
    it(`${nom}: paket va portfel summalari aynan teng`, () => {
      const m = obyekt(pv as Map<string, { nk: AktPodvalNk }>);
      const paket = paketAktHisobi(m, akt, 'Fast Food 1-etaj', raqamlar).moliya;
      const portfel = portfelAktMoliya(m, akt, 'Fast Food 1-etaj', raqamlar);
      expect(paket).toEqual(portfel);
      expect(paket.ustamasiz).toBe(150026606.32);
      expect(paket.jami).not.toBeNull();
      // Jamilar ham teng: paket (oy jami) va portfel (shartnoma jami).
      const paketRows: PaketAkt[] = oyAktlari(malumot, { oy: '2026-10', loyihaId: null, shartnomaId: 5 }).map((r) => ({ ...r, moliya: paket }));
      const portfelRows: PaketAkt[] = portfelAktlari(malumot, { tur: 'shartnoma', id: 5 }).map((r) => ({ ...r, moliya: portfel }));
      expect(oyJami(paketRows)).toEqual(portfelGuruhla(portfelRows).jami.tasdiqlangan);
    });
  }

  it('o‘z podvali hisobni haqiqatan o‘zgartiradi (smeta podvali bilan teng emas)', () => {
    const a = portfelAktMoliya(obyekt(new Map()), akt, 'X', raqamlar);
    const o = portfelAktMoliya(obyekt(new Map([['246:', { nk: NK_HUJJAT }]])), akt, 'X', raqamlar);
    expect(o.ustamali).toBeCloseTo(150026606.32 * 1.1, 1);
    expect(o.ustamali).not.toBe(a.ustamali);
  });

  it('paket Ф-2 Excel i F2 tarixi generatori bilan bayt-ma-bayt bir xil', () => {
    const m = obyekt(new Map([['246:', { nk: NK_HUJJAT }]]));
    const p = paketAktExcel(m, akt, 'Fast Food 1-etaj', raqamlar)!;
    const k = f2AktTayyorla({ smeta: AKT246_ROWS, lines: tafsilot, aktQatorlar: [], podvallar: m.podvallar, kontekst, akt, obyektNom: 'Fast Food 1-etaj', raqamlar })!;
    const tarix = f2Hujjat(k.bolimlar, k.qatorlar, k.opsiya);
    expect([...p.bytes]).toEqual([...tarix.bytes]);
    expect(p.yacheykalar).toBe(tarix.yacheykalar);
    expect(paketAktExcel({ ...m, tafsilot: [] }, akt, 'X', raqamlar)).toBeNull();
  });
});

describe('oylik paket — oraliq, nomlar, papkalar, eskirish, mundarija', () => {
  const a = (id: number, oy: string, raqam: string, holat = 'tasdiqlangan', lc = 'approved'): ReestrAkt => ({ ...akt, id, oy, raqam, holat, lifecycle_status: lc, hujjat_jami: 100 });
  const m2 = { ...malumot, aktlar: [a(1, '2026-08-01', '1'), a(2, '2026-09-01', '1'), a(3, '2026-10-01', '2'), a(4, '2026-10-01', '3', 'bekor', 'cancelled')] };

  it('oraliq va barcha oylar: oy tartibida, bekor kirmaydi; turli oylardagi bir xil raqam takror emas', () => {
    expect(oyAktlari(m2, { oy: '2026-09', gacha: '2026-10', loyihaId: null, shartnomaId: 5 }).map((r) => r.akt.id)).toEqual([2, 3]);
    const hammasi = oyAktlari(m2, { oy: '2026-09', barcha: true, loyihaId: null, shartnomaId: 5 });
    expect(hammasi.map((r) => r.akt.id)).toEqual([1, 2, 3]);
    expect(paketTekshiruvlari(hammasi).filter((x) => x.kod === 'raqam_takror')).toEqual([]);
  });

  it('F2 fayl nomi: <oy>_<shartnoma>_<obyekt>_F2_<raqam>.xlsx; qoralama belgisi', () => {
    expect(paketF2FaylNomi({ oy: '2026-10-01', shartnoma: 'L-2', obyekt: 'Fast Food 1-etaj', raqam: '1', aktId: 246 })).toBe('2026-10_L-2_Fast_Food_1-etaj_F2_1.xlsx');
    expect(paketF2FaylNomi({ oy: '2026-10', shartnoma: null, obyekt: 'A/B: "x"', raqam: null, aktId: 7, qoralama: true })).toBe('2026-10_A_B_x_F2_id7_QORALAMA.xlsx');
  });

  it('oy papkalari: ildiz fayllari tepada, har oy o‘z papkasida', () => {
    const f = (yol: string) => ({ yol, bytes: new Uint8Array([1]), tur: 'f2' as const, obyektId: null });
    const z = oyPapkalarigaYigish([{ oy: '2026-10', fayllar: [f('Obj/a.xlsx')] }, { oy: '2026-09', fayllar: [f('Obj/a.xlsx'), f('reestr.xlsx')] }],
      [{ nom: 'sverka.xlsx', bytes: new Uint8Array([2]), tur: 'sverka' }]);
    expect(z.map((x) => x.yol)).toEqual(['sverka.xlsx', '2026-09/Obj/a.xlsx', '2026-09/reestr.xlsx', '2026-10/Obj/a.xlsx']);
  });

  it('paket eskirgan: so‘nggi versiya izi hozirgidan farq qilsa', () => {
    const iz = (versiya: number) => [{ obyekt_id: 1, f2: [{ akt_id: 1, versiya, holat: 'tasdiqlangan' }], fakt: { soni: 0, maks_id: null, xesh: '' } }];
    const p = [
      { oy: '2026-10', versiya: 1, manifest: { iz: iz(1) }, hozirgi_iz: iz(3) },
      { oy: '2026-10', versiya: 2, manifest: { iz: iz(3) }, hozirgi_iz: iz(3) },
    ];
    expect(paketEskirganmi(p, '2026-10')).toMatchObject({ eskirgan: false, paket: { versiya: 2 } });
    expect(paketEskirganmi([{ ...p[1], hozirgi_iz: iz(4) }], '2026-10')?.eskirgan).toBe(true);
    expect(paketEskirganmi(p, '2026-09')).toBeNull();
  });

  it('MUNDARIJA: har fayl, F2 summalari (QQS bilan birinchi), tasdiqlangan va qoralama jamilari alohida', () => {
    const r = (id: number, jami: number, qoralama = false): PaketAkt => ({ akt: a(id, '2026-10-01', String(id)), obyektNom: 'A', loyiha: null, bosqich: qoralama ? 'jarayonda' : 'tasdiqlangan',
      moliya: { ustamasiz: 100, ustamali: 110, nds: jami - 110, jami, taxminiy: false, narxsizQator: 0, qatorSoni: 1, sabab: null }, moliyaXato: false, uchastkalar: null });
    const x = mundarijaXlsx([
      { yol: '2026-10/A/2026-10_A_F2_1.xlsx', hujjat: 'Ф-2', akt: r(1, 123.2) },
      { yol: '2026-10/A/2026-10_A_F2_2_QORALAMA.xlsx', hujjat: 'Ф-2', akt: r(2, 50), qoralama: true },
      { yol: 'Акт_сверки.xlsx', hujjat: 'Акт сверки' },
    ], { sarlavha: 'договор № L-2' });
    const s = strFromU8(unzipSync(x.bytes)['xl/worksheets/sheet1.xml']);
    expect(s.toUpperCase()).toContain('2026-10_A_F2_2_QORALAMA.XLSX');
    expect(s).toContain('<f>');
    expect(s).toContain('123.2');
    expect(s.toUpperCase()).toContain('ВСЕГО С НДС');
  });
});
