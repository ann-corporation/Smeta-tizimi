import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { NAKRUTKA_STANDART } from '../nakrutka-kaskad';
import { bosKatKesim, katKesimgaQosh, ustamaliHisobla } from '../ustamali-summa';
import { bosKiritma, f2Qatorlar, f2Qur, f2Yuk, type F2Qator } from '../f2-tayyor';
import { AKT246_HAJM, AKT246_HOLAT, AKT246_ROWS } from '../f2-hujjat.fixture';
import type { F2Tafsilot } from '../../api/t2-narx';
import type { ReestrAkt, ReestrObyekt, ReestrShartnoma } from '../f2-reestr/reestr';
import type { SvodF3, SvodShartnoma } from '../nakopitelniy-svod';
import { oylikReestrXlsx, paketTarkibiMatni, paketZip } from './eksport';
import {
  aktExcel, aktHisob, aktMoliya, mavjudOylar, oyAktlari, oyF3lar, oyJami, oyKaliti, paketFayllari, paketTekshiruvlari, sukutTanlov, takrorsizYol,
  uchastkalarSoni, type PaketAkt,
} from './oylik';

const qator = (id: number, kat: string | null, summa: number | null, ozgar: Partial<F2Qator> = {}): F2Qator => ({
  id, ishId: null, tur: 'rs', kat, nom: `R${id}`, birlik: 'шт', hajm: 1, narx: summa, summa, manba: 'oldingi_f2', narxsiz: summa == null, ...ozgar,
});
const akt = (id: number, o: Partial<ReestrAkt> = {}): ReestrAkt => ({
  id, obyekt_id: 1, oy: '2026-09-01', raqam: String(id), holat: 'tasdiqlangan', lifecycle_status: 'approved', hujjat_jami: 1000, farq: 0,
  qator_soni: 3, narxsiz_qator: 0, manba: 'tizim', ...o,
});
const OB: ReestrObyekt[] = [
  { id: 1, nom: 'Obyekt A', loyiha_id: 7, jami: null, narxsiz: null },
  { id: 2, nom: 'Obyekt B', loyiha_id: 8, jami: null, narxsiz: null },
];
const SH = new Map<number, ReestrShartnoma[]>([[1, [{ id: 100, raqam: 'T-1', nom: null, jami_nds_bilan: null, summa_bez_nds: null }]]]);
const LOY = new Map([[7, 'Loyiha 7'], [8, 'Loyiha 8']]);
const sozlama = (aktlar: ReestrAkt[]) => ({ aktlar, obyektlar: OB, shartnomalar: SH, loyihalar: LOY });

function row(a: ReestrAkt, o: Partial<PaketAkt> = {}): PaketAkt {
  return { akt: a, obyektNom: OB.find((x) => x.id === a.obyekt_id)?.nom ?? '?', loyiha: null, bosqich: 'tasdiqlangan', moliya: null, moliyaXato: false, uchastkalar: null, ...o };
}

describe('oylik F2 paketi — summalar', () => {
  it('oyKaliti', () => {
    expect(oyKaliti('2026-09-01')).toBe('2026-09');
    expect(oyKaliti('2026-13')).toBeNull();
    expect(oyKaliti(null)).toBeNull();
  });

  it('ustamali = mavjud kaskad (ИТОГО-4, NDS siz); NDS faqat oxirida 12%; jami = ustamali + NDS', () => {
    const q = [qator(1, 'ЧЕЛ', 100000), qator(2, 'МАТ', 250000.5), qator(3, 'ОБ', 40000)];
    const m = aktMoliya({ qatorlar: q, hujjatJami: 390000.5, koef: NAKRUTKA_STANDART });
    const k = bosKatKesim(); katKesimgaQosh(k, 'ЧЕЛ', 100000); katKesimgaQosh(k, 'МАТ', 250000.5); katKesimgaQosh(k, 'ОБ', 40000);
    const orakul = ustamaliHisobla(k, NAKRUTKA_STANDART);
    expect(m.ustamasiz).toBe(390000.5);
    expect(m.ustamali).toBe(orakul.ustamali);
    expect(m.nds).toBe(Math.round((orakul.ustamali! * 12) / 100 * 100) / 100);
    expect(m.jami).toBe(Math.round((m.ustamali! + m.nds!) * 100) / 100);
    expect(m.ustamali!).toBeGreaterThan(m.ustamasiz!);
    expect(m.taxminiy).toBe(false);
    expect(m.sabab).toBeNull();
  });

  it('koeffitsient yo‘q — ustamali, NDS, jami NOMA’LUM (0 emas); ustamasiz ma’lum', () => {
    const m = aktMoliya({ qatorlar: [qator(1, 'МАТ', 500)], hujjatJami: 500, koef: null });
    expect(m).toMatchObject({ ustamasiz: 500, ustamali: null, nds: null, jami: null, sabab: 'KOEF_YOQ' });
  });

  it('qator yo‘q — faqat hujjat jami; hujjat jami ham yo‘q — hammasi noma’lum', () => {
    expect(aktMoliya({ qatorlar: [], hujjatJami: 700, koef: NAKRUTKA_STANDART })).toMatchObject({ ustamasiz: 700, ustamali: null, sabab: 'QATOR_YOQ' });
    expect(aktMoliya({ qatorlar: [], hujjatJami: null, koef: NAKRUTKA_STANDART }).ustamasiz).toBeNull();
  });

  it('kat noma’lum qism ustamasiz qo‘shiladi va taxminiy deb belgilanadi; hammasi kat siz — ustamali noma’lum', () => {
    const q = [qator(1, 'МАТ', 1000), qator(2, 'XXX', 300)];
    const m = aktMoliya({ qatorlar: q, hujjatJami: 1300, koef: NAKRUTKA_STANDART });
    expect(m.taxminiy).toBe(true);
    expect(m.ustamasiz).toBe(1300);
    const faqat = aktMoliya({ qatorlar: [qator(1, 'XXX', 300)], hujjatJami: 300, koef: NAKRUTKA_STANDART });
    expect(faqat).toMatchObject({ ustamali: null, sabab: 'KAT_NOMALUM' });
  });

  it('narxsiz qator 0 bo‘lib qo‘shilmaydi, soni hisoblanadi', () => {
    const m = aktMoliya({ qatorlar: [qator(1, 'МАТ', 1000), qator(2, 'МАТ', null)], hujjatJami: 1000, koef: NAKRUTKA_STANDART });
    expect(m.narxsizQator).toBe(1);
    expect(m.ustamasiz).toBe(1000);
  });

  it('akt 246 (real fixture): ustamasiz = F2 Excel jami 150 026 606,32', () => {
    const b = f2Qur(AKT246_ROWS, AKT246_HOLAT);
    const q = f2Qatorlar(b, { ...bosKiritma(), hajm: AKT246_HAJM });
    const row2 = new Map(AKT246_ROWS.map((r) => [r.id, r]));
    const tafsilot = f2Yuk(q, '1').map((p, i) => {
      const r = row2.get(p.qatorId)!;
      return { akt_id: 246, obyekt_id: 79, kompaniya_id: 17, tur: 'f2', oy: '2026-10-01', akt_holat: 'tasdiqlangan', raqam: '1', akt_kim: null, akt_sana: '2026-10-02', akt_qator_id: 1000 + i,
        qator_id: p.qatorId, kod: r.kod, nom: r.nom, birlik: r.birlik, kat: r.kat, qator_tur: r.tur, hajm: p.certifiedQuantity ?? 0, narx: p.certifiedUnitPrice ?? null, summa: p.certifiedAmount ?? null, izoh: null,
        certified_quantity: p.certifiedQuantity ?? null, certified_unit_price: p.certifiedUnitPrice ?? null, certified_amount: p.certifiedAmount ?? null } as F2Tafsilot;
    });
    const m = { smeta: AKT246_ROWS, tafsilot, kontekst: { imzo: {}, shartnoma: null, nakrutka: NAKRUTKA_STANDART, podval: null } };
    const h = aktHisob(m, { id: 246, hujjat_jami: 150026606.32 });
    expect(h.moliya.ustamasiz).toBe(150026606.32);
    expect(h.moliya.ustamali).not.toBeNull();
    expect(h.moliya.jami).toBeCloseTo(h.moliya.ustamali! * 1.12, 1);
    const x = aktExcel(m, { id: 246, oy: '2026-10-01', raqam: '1' }, 'Fast Food 1-etaj');
    expect(x?.faylNomi).toContain('Fast Food 1-etaj');
    expect(x?.faylNomi).toContain('№1');
    expect(aktExcel({ ...m, tafsilot: [] }, { id: 246, oy: '2026-10-01', raqam: '1' }, 'X')).toBeNull();
  });
});

describe('oylik F2 paketi — jadval, jami, tekshiruvlar', () => {
  it('oyAktlari: oy, loyiha va shartnoma bo‘yicha; bekor chiqmaydi; obyekt/raqam tartibida', () => {
    const aktlar = [
      akt(1, { raqam: '10' }), akt(2, { raqam: '9' }), akt(3, { oy: '2026-08-01' }),
      akt(4, { obyekt_id: 2 }), akt(5, { lifecycle_status: 'cancelled', holat: 'bekor' }),
    ];
    const hammasi = oyAktlari(sozlama(aktlar), { oy: '2026-09', loyihaId: null, shartnomaId: null });
    expect(hammasi.map((r) => r.akt.id)).toEqual([2, 1, 4]);
    expect(oyAktlari(sozlama(aktlar), { oy: '2026-09', loyihaId: 8, shartnomaId: null }).map((r) => r.akt.id)).toEqual([4]);
    expect(oyAktlari(sozlama(aktlar), { oy: '2026-09', loyihaId: null, shartnomaId: 100 }).map((r) => r.akt.id)).toEqual([2, 1]);
    expect(mavjudOylar(aktlar)).toEqual(['2026-09', '2026-08']);
  });

  it('oy jami har ustun alohida: noma’lum summa 0 bo‘lib qo‘shilmaydi', () => {
    const a = row(akt(1), { moliya: { ustamasiz: 100, ustamali: 130, taxminiy: false, nds: 15.6, jami: 145.6, narxsizQator: 0, qatorSoni: 2, sabab: null } });
    const b = row(akt(2), { moliya: { ustamasiz: 50, ustamali: null, taxminiy: false, nds: null, jami: null, narxsizQator: 0, qatorSoni: 1, sabab: 'KOEF_YOQ' } });
    const c = row(akt(3, { hujjat_jami: null }));
    const j = oyJami([a, b, c]);
    expect(j.soni).toBe(3);
    expect(j.ustamasiz).toEqual({ malum: 150, nomalum: 1, soni: 3 });
    expect(j.ustamali).toEqual({ malum: 130, nomalum: 2, soni: 3 });
    expect(j.jami).toEqual({ malum: 145.6, nomalum: 2, soni: 3 });
    expect(oyJami([a, b, c], new Set([1])).ustamali).toEqual({ malum: 130, nomalum: 0, soni: 1 });
  });

  it('sukut tanlov — faqat tasdiqlanganlar', () => {
    expect([...sukutTanlov([row(akt(1)), row(akt(2), { bosqich: 'jarayonda' })])]).toEqual([1]);
  });

  it('tekshiruvlar: qoralama, raqamsiz, takror raqam, noma’lum summa, uchastka aralash', () => {
    const toliq = { ustamasiz: 1, ustamali: 1, taxminiy: false, nds: 1, jami: 1, narxsizQator: 0, qatorSoni: 1, sabab: null } as const;
    const rows = [
      row(akt(1, { raqam: '5' }), { moliya: toliq }),
      row(akt(2, { raqam: ' 5 ' }), { moliya: toliq }),
      row(akt(3, { raqam: null }), { bosqich: 'jarayonda', moliya: toliq }),
      row(akt(4, { raqam: '7', hujjat_jami: null }), { moliya: toliq }),
      row(akt(5, { raqam: '8' }), { moliya: { ...toliq, ustamali: null, nds: null, jami: null, sabab: 'KOEF_YOQ' } }),
      row(akt(6, { raqam: '9' }), { moliya: { ...toliq, narxsizQator: 2 } }),
      row(akt(7, { raqam: '10' }), { moliya: toliq, uchastkalar: 3 }),
      row(akt(8, { raqam: '5', obyekt_id: 2 }), { moliya: toliq }),
    ];
    const t = paketTekshiruvlari(rows);
    const kod = (k: string) => t.filter((x) => x.kod === k).map((x) => x.aktId);
    expect(kod('qoralama')).toEqual([3]);
    expect(kod('raqamsiz')).toEqual([3]);
    expect(kod('raqam_takror')).toEqual([1, 2]);
    expect(kod('summa_nomalum')).toEqual([4, 5, 6]);
    expect(kod('uchastka_aralash')).toEqual([7]);
  });

  it('uchastkalarSoni: faqat uchastkaga o‘xshash yuqori bo‘limlar sanaladi', () => {
    const smeta = [
      { id: 1, ota_id: null, nom: 'УЧАСТОК 1' }, { id: 2, ota_id: null, nom: 'Участок 2' }, { id: 3, ota_id: null, nom: 'Общестроительные' },
      { id: 11, ota_id: 1, nom: 'Раздел' }, { id: 111, ota_id: 11, nom: 'Работа' }, { id: 21, ota_id: 2, nom: 'Раздел' }, { id: 31, ota_id: 3, nom: 'Раздел' },
    ];
    expect(uchastkalarSoni(smeta, [111, 21])).toBe(2);
    expect(uchastkalarSoni(smeta, [111, 11])).toBe(1);
    expect(uchastkalarSoni(smeta, [31])).toBe(0);
  });
});

describe('oylik F2 paketi — tarkib, reestr, ZIP, Forma-3', () => {
  it('takrorsizYol: bir xil nom _2, _3 bilan ajraladi', () => {
    const f = paketFayllari([
      { papka: 'F2', nom: 'A.xlsx', bytes: new Uint8Array([1]), tur: 'f2' },
      { papka: 'F2', nom: 'a.xlsx', bytes: new Uint8Array([2]), tur: 'f2' },
      { papka: 'F2', nom: 'A.xlsx', bytes: new Uint8Array([3]), tur: 'f2' },
      { papka: '', nom: 'R.xlsx', bytes: new Uint8Array([4]), tur: 'reestr' },
    ]);
    expect(f.map((x) => x.yol)).toEqual(['F2/A.xlsx', 'F2/a_2.xlsx', 'F2/A_3.xlsx', 'R.xlsx']);
    expect(takrorsizYol('x.xlsx', new Set())).toBe('x.xlsx');
  });

  it('oylik reestr Excel: tanlangan F2 lar, noma’lum summa bo‘sh katak + izoh', () => {
    const tolik = row(akt(1, { raqam: '11' }), { moliya: { ustamasiz: 1000, ustamali: 1300, taxminiy: false, nds: 156, jami: 1456, narxsizQator: 0, qatorSoni: 1, sabab: null } });
    const nomalum = row(akt(2, { raqam: '12', hujjat_jami: null }));
    const { bytes, faylNomi } = oylikReestrXlsx([tolik, nomalum], { oy: '2026-09', tashkilot: 'NEW TIMES BUILDINGS' });
    expect(faylNomi).toContain('РЕЕСТР_Ф-2_СВОД');
    expect(faylNomi.endsWith('.xlsx')).toBe(true);
    const z = unzipSync(bytes);
    const matn = Object.entries(z).filter(([k]) => /sharedStrings|worksheets\/sheet/.test(k)).map(([, v]) => strFromU8(v)).join('\n');
    expect(matn).toContain('Obyekt A'.toUpperCase());
    expect(matn).toContain('НДС 12%');
    expect(matn).toContain('1456');
    expect(matn).toMatch(/итог акта неизвестен/i);
    expect(Object.keys(z).filter((k) => /worksheets\/sheet\d+\.xml$/.test(k))).toHaveLength(2);
  });

  it('ZIP: F2 fayllari, reestr, Forma-3 va ПАКЕТ_СОСТАВ.txt (ogohlantirishlar bilan)', () => {
    const fayllar = paketFayllari([
      { papka: 'F2', nom: 'A_F2.xlsx', bytes: new Uint8Array([1, 2]), tur: 'f2' },
      { papka: '', nom: 'REESTR.xlsx', bytes: new Uint8Array([3]), tur: 'reestr' },
      { papka: 'Forma-3', nom: 'F3.xlsx', bytes: new Uint8Array([4]), tur: 'forma3' },
    ]);
    const tek = paketTekshiruvlari([row(akt(1, { raqam: null }), { bosqich: 'jarayonda' })]);
    const matn = paketTarkibiMatni({ oy: '2026-09', fayllar, tekshiruvlar: tek, otkazilgan: ['Obyekt B · F2 № 3: token yetmaydi'] });
    const z = unzipSync(paketZip(fayllar, matn));
    expect(Object.keys(z).sort()).toEqual(['F2/A_F2.xlsx', 'Forma-3/F3.xlsx', 'REESTR.xlsx', 'ПАКЕТ_СОСТАВ.txt'].sort());
    expect([...z['F2/A_F2.xlsx']]).toEqual([1, 2]);
    const tarkib = strFromU8(z['ПАКЕТ_СОСТАВ.txt']);
    expect(tarkib).toContain('Forma-3/F3.xlsx');
    expect(tarkib).toContain('token yetmaydi');
    expect(tarkib).toContain('Ф-2 без номера');
    // Bir xil kirish — bir xil baytlar (barqaror vaqt).
    expect([...paketZip(fayllar, matn)]).toEqual([...paketZip(fayllar, matn)]);
  });

  it('oyF3lar: shu oy, tanlangan shartnoma, qoralama kirmaydi, takrorsiz', () => {
    const f3 = (id: number, sana: string, summa: number, holat: SvodF3['holat']): SvodF3 => ({
      id, manba: 'sotuv', raqam: String(id), sotuv_sana: sana, sotuv_summa: summa, nds_foiz: 12, davr_boshi: sana, davr_oxiri: sana, holat, bajarilgan_f2_summa: null, izoh: null, versiya: 1,
    });
    const sh = (id: number, f: SvodF3[]): SvodShartnoma => ({ id, loyiha_id: 1, raqam: `T-${id}`, nom: null, asosiy: true, holat: 'faol', jami_nds_bilan: 5_000_000,
      obyektlar: [{ id: 1, nom: 'Obyekt A' }], ds: [], f2: [], f3: f, tolovlar: [] });
    const svod = [
      sh(100, [f3(1, '2026-09-10', 1_120_000, 'tayyor'), f3(2, '2026-09-20', 560_000, 'qoralama'), f3(3, '2026-08-10', 100, 'imzolangan'), f3(4, '2026-09-25', 224_000, 'imzolangan')]),
      sh(200, [f3(5, '2026-09-11', 112_000, 'tayyor')]),
    ];
    const r = oyF3lar(svod, new Set([100]), '2026-09');
    expect(r.tayyor.map((x) => x.f3.id)).toEqual([1, 4]);
    expect(r.qoralama).toBe(1);
    expect(oyF3lar(svod, new Set([300]), '2026-09')).toEqual({ tayyor: [], qoralama: 0 });
  });
});
