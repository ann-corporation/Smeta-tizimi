import { describe, expect, it } from 'vitest';
import { bloklovchi, davomMumkinmi, f2YozishXatoMatni, saqlashSabablari, type SababKirish } from './f2-tayyor-sabab';
import { bolimOlRejasi, bosKiritma, f2Qatorlar, f2Yuk, f2ZamenaQolla, sonMatn, sonOqi, ulushHajm, type F2Bolim, type F2Resurs } from './f2-tayyor';
import { dublikatTekshiruv } from './f2-dublikat/tekshiruv';

/** Sintetik ma'lumot (repo ochiq — real summa/obyekt yo'q). */
const toza: SababKirish = {
  validId: true, kompaniya: true, loading: false, error: false,
  tahrir: false, aktBor: false, aktXato: '', aktKorish: false, qatorSoni: 2,
  xatoHajm: [], xatoNarx: [], xatoSumma: [], pul: [], dublikatBlok: null,
  aktlarYuklandi: true, aktlarXato: false, qoshTayyor: true, bajXato: false, zamenaXato: false,
  protokolXato: false, qoralamaXato: false, avtoNarxsiz: [],
};

describe('saqlashSabablari — yagona «nega saqlanmaydi» ro‘yxati', () => {
  it('toza holatda bo‘sh (faqat shunda «toza» va saqlash ochiq)', () => {
    expect(saqlashSabablari(toza)).toEqual([]);
  });
  it('har bir to‘siq o‘z kodi bilan chiqadi — hech biri jim emas', () => {
    const holatlar: Array<[Partial<SababKirish>, string]> = [
      [{ kompaniya: false }, 'kompaniya'], [{ loading: true }, 'yuklanmoqda'], [{ error: true }, 'yuklash_xato'],
      [{ tahrir: true, aktXato: 'x' }, 'akt_xato'], [{ tahrir: true }, 'akt_oqilmoqda'], [{ tahrir: true, aktBor: true, aktKorish: true }, 'muhr'],
      [{ qatorSoni: 0 }, 'bosh'], [{ xatoHajm: [5] }, 'xato_hajm'], [{ xatoNarx: [6] }, 'xato_narx'], [{ xatoSumma: [7] }, 'xato_summa'],
      [{ pul: [8] }, 'pul'], [{ dublikatBlok: 'takror' }, 'dublikat'], [{ aktlarXato: true }, 'aktlar_xato'], [{ aktlarYuklandi: false }, 'aktlar_oqilmoqda'],
      [{ qoshTayyor: false }, 'qosh_kutilmoqda'], [{ bajXato: true }, 'baj_xato'], [{ zamenaXato: true }, 'zamena_xato'],
      [{ protokolXato: true }, 'protokol_xato'], [{ qoralamaXato: true }, 'qoralama_xato'],
    ];
    for (const [ozg, kod] of holatlar) {
      const s = saqlashSabablari({ ...toza, ...ozg });
      expect(bloklovchi(s).map((x) => x.kod), kod).toContain(kod);
    }
    expect(saqlashSabablari({ ...toza, validId: false }).map((x) => x.kod)).toEqual(['obyekt']);
  });
  it('qatorga oid sabab birinchi qatorga o‘tish amali bilan; qayta urinish amallari bor', () => {
    expect(saqlashSabablari({ ...toza, pul: [42, 43] })[0]).toMatchObject({ amal: 'qatorga', id: 42 });
    expect(saqlashSabablari({ ...toza, qoshTayyor: false })[0].amal).toBe('qayta_qosh');
    expect(saqlashSabablari({ ...toza, zamenaXato: true })[0].amal).toBe('qayta_qosh');
    expect(saqlashSabablari({ ...toza, aktlarXato: true })[0].amal).toBe('qayta_aktlar');
  });
  it('egasi qarori: narxsiz resurs qoralamani TO‘SMAYDI — ogohlantirish + bir bosishli «narxsiz» amali', () => {
    const s = saqlashSabablari({ ...toza, avtoNarxsiz: [3, 4] });
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ kod: 'avto_narxsiz', daraja: 'ogoh', amal: 'narxsiz' });
    expect(bloklovchi(s)).toEqual([]);
  });
});

describe('f2YozishXatoMatni — RPC kodi → tushunarli matn', () => {
  it('ma’lum kodlar umumiy xabar emas', () => {
    for (const code of ['DUPLICATE_F2_SOURCE_LINE', 'CERTIFIED_QTY_INVALID', 'MISSING_CERTIFIED_PRICE', 'F2_LINES_REQUIRED', 'F2_HAJM_NOL', 'QATOR_ALMASHTIRILGAN', 'STALE_VERSION', 'STORNO_LINE_INVALID'])
      expect(f2YozishXatoMatni({ code, error: 'UMUMIY' }, 'Z')).not.toMatch(/UMUMIY|^Z$/);
    expect(f2YozishXatoMatni({ code: 'STALE_VERSION' }, 'Z')).toContain('qayta yuklang');
    expect(f2YozishXatoMatni({ code: 'NARXSIZ_QATOR_BOR', soni: 3 }, 'Z')).toContain('3 ta');
    expect(f2YozishXatoMatni({ code: 'DEPENDENTS_EXIST', bogliq: [{ raqam: 'A-1' }, { id: 9 }] }, 'Z')).toContain('A-1, 9');
  });
  it('noma’lum kod — server xabari, u ham yo‘q — zaxira', () => {
    expect(f2YozishXatoMatni({ code: 'X', xabar: 'server' }, 'Z')).toBe('server');
    expect(f2YozishXatoMatni({}, 'Z')).toBe('Z');
  });
});

describe('davomMumkinmi — importdan kelgan qoralama avtomatik ochilmaydi', () => {
  it('faqat native/storno qatorlar', () => {
    expect(davomMumkinmi([{ raw_snapshot: { source: 'native_f2_preparation' } }, { raw_snapshot: { source: 'storno' } }])).toBe(true);
    expect(davomMumkinmi([{ raw_snapshot: { source: 'native_f2_preparation' } }, { raw_snapshot: { manba: 'f2_v3' } }])).toBe(false);
    expect(davomMumkinmi([])).toBe(true);
  });
});

describe('chang va ilmiy yozuv (A-3, A-4)', () => {
  it('sonMatn: 1e-7 → «0.0000001» (yaxlitlanmaydi); sonOqi ilmiy yozuvni ham o‘qiydi', () => {
    expect(sonMatn(1e-7)).toBe('0.0000001');
    expect(sonMatn(-2.5e-7)).toBe('-0.00000025');
    expect(sonMatn(6)).toBe('6');
    expect(sonOqi(sonMatn(1e-7))).toBe(1e-7);
    expect(sonOqi('1e-7')).toBe(1e-7);
    expect(ulushHajm(0.000002, 50)).toBe('0.000001');
  });
  const res = (o: Partial<F2Resurs>): F2Resurs => ({ id: 3, tur: 'rs', kat: 'ЧЕЛ', kod: null, nom: 'R', birlik: 'ч', norma: 1, mumkin: 5, avto: true, taklifNarx: 10, taklifManba: 'smeta', ...o });
  const bolim = (r: F2Resurs, mumkin = 10): F2Bolim[] => [{ id: 1, nom: 'B', daraja: 0, alohida: [], ishlar: [{ id: 2, kod: null, nom: 'Ish', birlik: 'м3', mumkin, smeta: 100, olingan: 0, resurslar: [r] }] }];
  it('normadan chang (y6 → 0) resurs qatori yasalmaydi — serverga hajm 0 ketmaydi', () => {
    const k = bosKiritma(); k.hajm[2] = '1';
    const q = f2Qatorlar(bolim(res({ norma: 1e-7 })), k);
    expect(q.map((x) => x.id)).toEqual([2]);
  });
  it('mumkin = 0, qoralamada bor resurs (min(talab, 0) = 0) — o‘tkaziladi, 0 hajmli qator yo‘q', () => {
    const k = bosKiritma(); k.hajm[2] = '1';
    const q = f2Qatorlar(bolim(res({ mumkin: 0, qoralama: 3 })), k);
    expect(q.filter((x) => x.id === 3)).toEqual([]);
    expect(q.every((x) => x.hajm !== 0)).toBe(true);
  });
  it('zamena qoldig‘i chang bo‘lsa asl qator tashlanadi (0 hajm yuborilmaydi)', () => {
    const k = bosKiritma(); k.hajm[2] = '1';
    const b = bolim(res({ id: 3, mumkin: 10, norma: 1 }));
    const qq = f2Qatorlar(b, k);
    const z = f2ZamenaQolla(qq, b, k, { rows: [{ id: 2, ota_id: null, tur: 'bl', birlik: 'м3', hajm: 100 }, { id: 3, ota_id: 2, tur: 'rs', birlik: 'ч', hajm: 100 }, { id: 4, ota_id: 2, tur: 'rs', birlik: 'ч', hajm: 100 }],
      zamenaAsl: new Map([[4, 3]]), miqdor: new Map(), oldingi: new Map(), serverAlm: new Map() });
    expect(z.qatorlar.every((x) => Math.abs(x.hajm) >= 1e-6)).toBe(true);
  });
});

describe('narxsiz qoralama (egasi 2026-11-06)', () => {
  it('narxi yo‘q resurs xato emas: narxsiz + narxsizSabab avto_qoralama, summa NULL (0 emas); f2Yuk tashlamaydi', () => {
    const r: F2Resurs = { id: 3, tur: 'rs', kat: 'МАШ', kod: null, nom: 'Kran', birlik: 'маш-ч', norma: 0.5, mumkin: 5, avto: true, taklifNarx: null, taklifManba: 'yoq' };
    const b: F2Bolim[] = [{ id: 1, nom: 'B', daraja: 0, alohida: [], ishlar: [{ id: 2, kod: null, nom: 'Ish', birlik: 'м3', mumkin: 10, smeta: 10, olingan: 0, resurslar: [r] }] }];
    const k = bosKiritma(); k.hajm[2] = '4';
    const q = f2Qatorlar(b, k);
    expect(q.find((x) => x.id === 3)).toMatchObject({ narxsiz: true, avtoNarxsiz: true, summa: null });
    const yuk = f2Yuk(q, '7', 'fakt');
    const rr = yuk.find((x) => x.qatorId === 3)!;
    expect(rr).toMatchObject({ certifiedQuantity: 2, priceIntentionallyAbsent: true });
    expect(rr.certifiedAmount).toBeUndefined();
    expect(rr.rawSnapshot).toMatchObject({ narxsizSabab: 'avto_qoralama', hajmManba: 'fakt' });
    // Ongli «narxsiz» — sababsiz.
    k.narxsiz[3] = true;
    expect(f2Yuk(f2Qatorlar(b, k), '7').find((x) => x.qatorId === 3)!.rawSnapshot).not.toHaveProperty('narxsizSabab');
  });
  it('noto‘g‘ri kiritilgan narx (son emas) — baribir xato (blok)', () => {
    const r: F2Resurs = { id: 3, tur: 'rs', kat: 'МАШ', kod: null, nom: 'Kran', birlik: 'маш-ч', norma: 1, mumkin: 5, avto: true, taklifNarx: null, taklifManba: 'yoq' };
    const b: F2Bolim[] = [{ id: 1, nom: 'B', daraja: 0, alohida: [], ishlar: [{ id: 2, kod: null, nom: 'Ish', birlik: 'м3', mumkin: 10, smeta: 10, olingan: 0, resurslar: [r] }] }];
    const k = bosKiritma(); k.hajm[2] = '1'; k.narx[3] = 'abc';
    expect(f2Qatorlar(b, k).find((x) => x.id === 3)?.xato).toBe('NARX');
  });
});

describe('bolimOlRejasi — nima tashlangani jim emas (A-18)', () => {
  it('olindi / chang (< 1 000 so‘m) / qoldiq 0 sanaladi', () => {
    const r = (id: number, mumkin: number, narx: number | null): F2Resurs => ({ id, tur: 'mat', kat: null, kod: null, nom: `m${id}`, birlik: 'т', norma: null, mumkin, avto: false, taklifNarx: narx, taklifManba: narx == null ? 'yoq' : 'smeta' });
    const b: F2Bolim[] = [{ id: 1, nom: 'B', daraja: 0, ishlar: [], alohida: [r(10, 5, 1000), r(11, 0.1, 10), r(12, 0, 500), r(13, 2, null)] }];
    const x = bolimOlRejasi(b);
    expect(x).toMatchObject({ olindi: 2, chang: 1, nol: 1 });
    expect(x.hajm).toEqual({ 10: '5', 13: '2' });
  });
});

describe('dublikat: raqamsiz F2 (A-15)', () => {
  it('shu oyda boshqa raqamsiz faol F2 bo‘lsa — BLOK (baza 23505 bermasin)', () => {
    const aktlar = [{ id: 1, raqam: null, oy: '2026-09-01', holat: 'qoralama' }, { id: 2, raqam: '', oy: '2026-08-01', holat: 'tasdiqlangan' }, { id: 3, raqam: null, oy: '2026-09-01', holat: 'bekor' }];
    const m = dublikatTekshiruv({ aktlar, oy: '2026-09', raqam: '  ', jami: null, ozAktId: null, manbaAktIdlar: [] });
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ daraja: 'blok', kod: 'oy_raqam', aktIdlar: [1] });
    expect(dublikatTekshiruv({ aktlar, oy: '2026-10', raqam: '', jami: null, ozAktId: null, manbaAktIdlar: [] })).toEqual([]);
  });
});

describe('saqlashSabablari — pereraschet storno bloki', () => {
  it('faqat storno bloki tahrirlangan (plyus qator yo‘q) — «bo‘sh» sabab yo‘q, saqlash ochiq', () => {
    expect(bloklovchi(saqlashSabablari({ ...toza, tahrir: true, aktBor: true, qatorSoni: 0, stornoOzgardi: true })).map((x) => x.kod)).not.toContain('bosh');
    expect(bloklovchi(saqlashSabablari({ ...toza, qatorSoni: 0 })).map((x) => x.kod)).toContain('bosh');
  });
  it('storno manbasi tasdiqlanmagan — storno_manba bloklovchi sabab, matn aynan', () => {
    const s = bloklovchi(saqlashSabablari({ ...toza, stornoManbaXato: 'Storno manbasi F2 №1 tasdiqlanmagan' }));
    expect(s.find((x) => x.kod === 'storno_manba')?.matn).toBe('Storno manbasi F2 №1 tasdiqlanmagan');
    expect(saqlashSabablari({ ...toza, stornoManbaXato: null })).toEqual([]);
  });
});