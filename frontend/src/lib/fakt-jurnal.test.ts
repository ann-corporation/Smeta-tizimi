import { describe, expect, it } from 'vitest';
import type { T2Qator } from '../api/supabase';
import { bolimSummalari, bolimTarkibi, nakopitelniyMoslik, holatTur, jurnalPaket, jurnalQur, qoldiqUlushi, sonOqi, zamenaTartibla } from './fakt-jurnal';

const q = (o: Partial<T2Qator> & { id: number; tur: string }): T2Qator => ({
  obyekt_id: 1, obyekt: null, kompaniya_id: 1, ota_id: null, daraja: 0, tartib: o.id, kod: null, nom: 'n', birlik: 'м3',
  hajm: null, narx: null, summa: null, kat: null, narx_usul: null, qoshimcha: false, zamena: false,
  d1: null, d2: null, d3: null, xom_qator: null, yangilandi: null, manba_id: null, versiya: 1, ...o,
} as T2Qator);

const rows = [
  q({ id: 1, tur: 'rz', kod: '1', nom: 'Земляные', versiya: 4 }),
  q({ id: 2, tur: 'bl', ota_id: 1, daraja: 1, nom: 'Разработка грунта', hajm: 100 }),
  q({ id: 3, tur: 'rs', ota_id: 2, daraja: 2, nom: 'Затраты труда', hajm: 50 }),
  q({ id: 4, tur: 'mat', ota_id: 2, daraja: 2, nom: 'Песок', hajm: 10 }),
  q({ id: 5, tur: 'rz', ota_id: 1, daraja: 1, kod: '1.1', nom: 'Ичкари' }),
  q({ id: 6, tur: 'bl', ota_id: 5, daraja: 2, nom: 'Засыпка', hajm: 20 }),
  q({ id: 7, tur: 'mat', ota_id: 1, daraja: 1, nom: 'Щебень (мустақил)', hajm: 5 }),
];
const states = [
  { qator_id: 2, smeta_hajm: 100, fakt_hajm: 40, smeta_summa: 1000, fakt_summa: 400 },
  { qator_id: 3, smeta_hajm: 50, fakt_hajm: 20 },
  { qator_id: 6, smeta_hajm: 20, fakt_hajm: 20, smeta_summa: 1000, fakt_summa: 1000 },
  { qator_id: 7, smeta_hajm: 5, fakt_hajm: 6 },
];

describe('fakt jurnali', () => {
  it('bo‘limlar daraxt tartibida, ichki bo‘lim bilan foiz (summa bo‘yicha)', () => {
    const { bolimlar } = jurnalQur(rows, states);
    expect(bolimlar.map((b) => [b.id, b.daraja])).toEqual([[1, 0], [5, 1]]);
    expect(bolimlar[0].ulush).toBeCloseTo(0.8);          // hajm ulushi × smeta summasi: (0.4·1000 + 1·1000 + 1·1000) / 3000
    expect(bolimlar[0]).toMatchObject({ ishSoni: 3, tugaganSoni: 2, versiya: 4 });
    expect(bolimlar[1].ulush).toBe(1);
  });

  it('ish → resurslar (mat) va avtomatik (rs); mustaqil resurs ham ish qatori', () => {
    const { bolimIshlari } = jurnalQur(rows, states);
    const ishlar = bolimIshlari.get(1)!;
    expect(ishlar.map((x) => x.id)).toEqual([2, 7]);
    expect(ishlar[0]).toMatchObject({ holat: 'qisman', qoldiq: 60, otaId: 1, otaVersiya: 4 });
    expect(ishlar[0].resurslar.map((x) => x.id)).toEqual([4]);
    expect(ishlar[0].avtomatik.map((x) => [x.id, x.fakt])).toEqual([[3, 20]]);
    expect(ishlar[1].holat).toBe('oshdi');
  });

  it('hamma ishi 100% bo‘lgan bo‘lim — 100% (ish qatorining fakt summasi 0 bo‘lsa ham)', () => {
    // Real holat (obyekt 81): bl narxsiz → fakt_summa 0; avval 12% ko‘rinardi.
    const r = [q({ id: 1, tur: 'rz', nom: 'Стена' }), q({ id: 2, tur: 'bl', ota_id: 1, hajm: 0.2 }), q({ id: 3, tur: 'mat', ota_id: 1, hajm: 0.037 })];
    const h = [{ qator_id: 2, smeta_hajm: 0.2, fakt_hajm: 0.2, smeta_summa: 2246153, fakt_summa: 0 }, { qator_id: 3, smeta_hajm: 0.037, fakt_hajm: 0.037, smeta_summa: 285084, fakt_summa: 285084 }];
    expect(jurnalQur(r, h).bolimlar[0].ulush).toBe(1);
  });

  it('holatTur', () => {
    expect(holatTur(10, 0)).toBe('yangi');
    expect(holatTur(10, 10)).toBe('tugadi');
    expect(holatTur(null, 3)).toBe('smetasiz');
  });

  it('"+" va "=" rejimlari bitta delta paketiga', () => {
    const faktlar = new Map([[2, 40], [4, 0], [6, 20]]);
    const p = jurnalPaket({ 2: { rejim: '=', qiymat: '55' }, 4: { rejim: '+', qiymat: '2,5' }, 6: { rejim: '=', qiymat: '20' } }, faktlar);
    expect(p).toMatchObject({ ok: true, qatorlar: [{ qator_id: 2, hajm: 15 }, { qator_id: 4, hajm: 2.5 }] });
    const bad = jurnalPaket({ 2: { rejim: '=', qiymat: '-1' }, 4: { rejim: '+', qiymat: 'x' }, 6: { rejim: '+', qiymat: '0' } }, faktlar);
    expect(bad.ok).toBe(false);
    expect([...bad.xatolar.values()].sort()).toEqual(['MANFIY', 'NOL', 'SON_EMAS']);
    expect(jurnalPaket({ 2: { rejim: '=', qiymat: '30' } }, faktlar).qatorlar).toEqual([{ qator_id: 2, hajm: -10 }]);
  });

  it('qoldiq ulushi va sonOqi', () => {
    expect(qoldiqUlushi({ qoldiq: 60 }, 25)).toBe('15');
    expect(qoldiqUlushi({ qoldiq: 0 }, 100)).toBeNull();
    expect(sonOqi(' 1 000,5 ')).toBe(1000.5);
  });
});

describe('Fakt jurnali — ierarxiya, zamena tartibi, summalar (2026-10-25)', () => {
  it('bolimTarkibi: tanlangan bo‘lim + barcha avlodlar; ishsiz shox tashlanadi', () => {
    const r = [
      q({ id: 1, tur: 'rz', nom: 'A' }), q({ id: 2, tur: 'rz', ota_id: 1, nom: 'A.1' }), q({ id: 3, tur: 'rz', ota_id: 2, nom: 'A.1.1' }),
      q({ id: 4, tur: 'bl', ota_id: 3, nom: 'Ish', hajm: 1 }), q({ id: 5, tur: 'rz', ota_id: 1, nom: 'A.2 (bo‘sh)' }),
    ];
    const { bolimlar, bolimIshlari } = jurnalQur(r, []);
    const t = bolimTarkibi(1, bolimlar, bolimIshlari);
    expect(t.map((x) => [x.bolim.id, x.nisbiy, x.ishlar.map((i) => i.id)])).toEqual([[1, 0, []], [2, 1, []], [3, 2, [4]]]);
    expect(bolimlar.find((b) => b.id === 1)?.ishSoni).toBe(1);
  });

  it('zamena asl qatoridan keyin; resurs zamenasi ham ish ichida aslidan keyin; kat va asl nomi', () => {
    const r = [
      q({ id: 1, tur: 'rz', nom: 'A' }),
      q({ id: 2, tur: 'bl', ota_id: 1, kod: 'E1', nom: 'Asl ish', hajm: 10 }),
      q({ id: 3, tur: 'bl', ota_id: 1, nom: 'Boshqa ish', hajm: 5 }),
      q({ id: 4, tur: 'bl', ota_id: 1, nom: 'Zamena ish', hajm: 10, zamena: true, qoshimcha: true }),
      q({ id: 5, tur: 'mat', ota_id: 2, nom: 'Blok', kat: 'МАТ', hajm: 3 }),
      q({ id: 6, tur: 'mat', ota_id: 2, nom: 'Kabel', kat: 'КАБ', hajm: 2 }),
      q({ id: 7, tur: 'mat', ota_id: 2, nom: 'G‘isht', kat: 'МАТ', hajm: 300, zamena: true }),
    ];
    const zbog = { almashtiradi: new Map([[4, 2], [7, 5]]), almashtirilgan: new Map([[2, 4]]) };
    const ishlar = jurnalQur(r, [], zbog).bolimIshlari.get(1)!;
    expect(ishlar.map((x) => x.id)).toEqual([2, 4, 3]);
    expect(ishlar[1]).toMatchObject({ almashtiradi: 2, aslNom: 'E1 Asl ish' });
    expect(ishlar[0].almashtirilgan).toBe(4);
    expect(ishlar[0].resurslar.map((x) => x.id)).toEqual([5, 7, 6]);
    expect(ishlar[0].resurslar[2].kat).toBe('КАБ');
    expect(zamenaTartibla([{ id: 1, almashtiradi: 2 }, { id: 2, almashtiradi: 1 }]).map((x) => x.id).sort()).toEqual([1, 2]);
  });

  it('bolimSummalari: bo‘lim (ichki bilan) va obyekt; smeta faqat asl; NULL 0 emas', () => {
    const r = [
      q({ id: 1, tur: 'rz', nom: 'A' }), q({ id: 2, tur: 'rz', ota_id: 1, nom: 'A.1' }),
      q({ id: 3, tur: 'bl', ota_id: 2, hajm: 1 }), q({ id: 4, tur: 'mat', ota_id: 3, kat: 'МАТ' }), q({ id: 5, tur: 'rs', ota_id: 3, kat: 'ЧЕЛ' }),
      q({ id: 6, tur: 'bl', ota_id: 2, hajm: 1, zamena: true }), q({ id: 7, tur: 'mat', ota_id: 6, kat: 'МАТ' }),
    ];
    const h = [
      { qator_id: 4, smeta_hajm: 1, fakt_hajm: 1, smeta_summa: 100, fakt_summa: 50, f2_summa: 40, qoldiq_summa: 60 },
      { qator_id: 5, smeta_hajm: 1, fakt_hajm: 0, smeta_summa: null, fakt_summa: null, f2_summa: null, qoldiq_summa: null },
      { qator_id: 7, smeta_hajm: 1, fakt_hajm: 1, smeta_summa: 30, fakt_summa: 30, f2_summa: 0, qoldiq_summa: 30 },
    ];
    const s = bolimSummalari(r, h);
    expect(s.get(1)?.smeta.ustamasiz).toBe(100);
    expect(s.get(1)?.smeta.kesim.summasizSoni).toBe(1);
    expect(s.get(2)?.fakt.ustamasiz).toBe(80);
    expect(s.get(0)?.qoldiq.ustamasiz).toBe(90);
    expect(s.get(0)?.f2.ustamasiz).toBe(40);
    expect(s.get(0)?.qoshimcha.ustamasiz).toBe(30); // zamena ostidagi smeta — alohida («smeta» ga kirmaydi)
    // Ishdan chiqarilgan resurs (4): fakt summasi bo'lim/obyekt jamisiga kirmaydi; smeta va F2 o'zgarmaydi.
    const c = bolimSummalari(r, h, new Set([4]));
    expect(c.get(2)?.fakt.ustamasiz).toBe(30);
    expect(c.get(0)?.fakt.ustamasiz).toBe(30);
    expect(c.get(1)?.smeta.ustamasiz).toBe(100);
    expect(c.get(0)?.f2.ustamasiz).toBe(40);
  });

  it('bolimSummalari: ISH qatorining O‘Z F2/fakt summasi bo‘limga qo‘shiladi, bolalarniki alohida — ikki marta sanalmaydi (L0, Sun‘iy ko‘l 5,51 mlrd)', () => {
    const r = [
      q({ id: 1, tur: 'rz', nom: 'A' }), q({ id: 2, tur: 'rz', ota_id: 1, nom: 'A.1' }),
      q({ id: 3, tur: 'bl', ota_id: 2, hajm: 10 }), q({ id: 4, tur: 'mat', ota_id: 3, kat: 'МАТ' }),
      q({ id: 8, tur: 'bl', ota_id: 1, hajm: 5, qoshimcha: true }),                       // bolasiz ish, F2 to'g'ridan-to'g'ri ishga
      q({ id: 9, tur: 'bl', ota_id: 2, hajm: 2 }), q({ id: 10, tur: 'rs', ota_id: 9, kat: 'ЧЕЛ' }), // ishga ham, bolasiga ham F2
    ];
    const h = [
      { qator_id: 3, smeta_hajm: 10, fakt_hajm: 2, smeta_summa: 1000, f2_summa: 0, fakt_summa: 0 },          // ish smetasi = bolalar yig'indisi (takror) — olinmaydi
      { qator_id: 4, smeta_hajm: 1, fakt_hajm: 1, smeta_summa: 1000, fakt_summa: 200, f2_summa: 300, qoldiq_summa: 700 },
      { qator_id: 8, smeta_hajm: 5, fakt_hajm: 0, smeta_summa: null, f2_summa: 5000, fakt_summa: 0 },
      { qator_id: 9, smeta_hajm: 2, fakt_hajm: 1, smeta_summa: 400, f2_summa: 70, fakt_summa: 10 },
      { qator_id: 10, smeta_hajm: 2, fakt_hajm: 1, smeta_summa: 400, fakt_summa: 100, f2_summa: 30, qoldiq_summa: 370 },
    ];
    const s = bolimSummalari(r, h);
    expect(s.get(0)?.f2.ustamasiz).toBe(300 + 5000 + 70 + 30);
    expect(s.get(2)?.f2.ustamasiz).toBe(300 + 70 + 30);
    expect(s.get(1)?.f2.ustamasiz).toBe(5400);
    expect(s.get(0)?.fakt.ustamasiz).toBe(200 + 10 + 100);
    expect(s.get(0)?.smeta.ustamasiz).toBe(1400);          // faqat barglar (asl)
    expect(s.get(0)?.qoldiq.ustamasiz).toBe(700 + 370 - 5000 - 70);
    // Nakopitelniy bilan muvofiqlik: smeta = daraxt + qo'shimcha; F2 = jami tasdiqlangan.
    expect(nakopitelniyMoslik(s.get(0)!, { smeta_summa: 1400, jami_tasdiqlangan_summa: 5400 }).mos).toBe(true);
    const f = nakopitelniyMoslik(s.get(0)!, { smeta_summa: 1400, jami_tasdiqlangan_summa: 5500 });
    expect(f).toMatchObject({ mos: false, f2Farq: -100, smetaFarq: 0 });
    expect(nakopitelniyMoslik(s.get(0)!, null)).toMatchObject({ mos: true, f2Farq: null, smetaJami: 1400 });
  });
});

describe('Fakt jurnali — chegirma ishi (manfiy reja), 2026-10-20', () => {
  it('holat va foiz absolyut qiymat bo‘yicha', () => {
    expect(holatTur(-4, 0)).toBe('yangi');
    expect(holatTur(-4, -2)).toBe('qisman');
    expect(holatTur(-4, -4)).toBe('tugadi');
    expect(holatTur(-4, -5)).toBe('oshdi');
  });
  it('manfiy rejaga manfiy fakt yoziladi; musbat jami — ISHORA; musbat rejada manfiy jami — MANFIY', () => {
    const faktlar = new Map([[1, 0], [2, 0]]);
    const smetalar = new Map<number, number | null>([[1, -4], [2, 10]]);
    const ok = jurnalPaket({ 1: { rejim: '=', qiymat: '-3' } }, faktlar, smetalar);
    expect(ok.ok).toBe(true); expect(ok.qatorlar).toEqual([{ qator_id: 1, hajm: -3 }]);
    const bad = jurnalPaket({ 1: { rejim: '=', qiymat: '2' }, 2: { rejim: '=', qiymat: '-1' } }, faktlar, smetalar);
    expect(bad.xatolar.get(1)).toBe('ISHORA'); expect(bad.xatolar.get(2)).toBe('MANFIY');
  });
  it('qoldiq ulushi manfiy rejada manfiy qiymat beradi; oshib ketgan qoldiqda tugma yo‘q', () => {
    expect(qoldiqUlushi({ qoldiq: -4, smeta: -4 }, 50)).toBe('-2');
    expect(qoldiqUlushi({ qoldiq: 1, smeta: -4 }, 50)).toBeNull();
    expect(qoldiqUlushi({ qoldiq: -1, smeta: 10 }, 50)).toBeNull();
  });
});
