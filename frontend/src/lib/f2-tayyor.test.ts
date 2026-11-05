import { describe, expect, it } from 'vitest';
import type { T2Qator } from '../api/supabase';
import { bolimDaraxti, bosKiritma, f2Jami, f2Qatorlar, f2Qur, f2Yuk, ishBirlikNarxi, korinadiganBolimlar, narxsizNomzodlar, ulushHajm, ishoraliQoldiq, ortiqchaXulosa, type F2Holat } from './f2-tayyor';

const q = (o: Partial<T2Qator> & { id: number; tur: string; norma?: number | null }): T2Qator => ({
  obyekt_id: 8, obyekt: null, kompaniya_id: 1, ota_id: null, daraja: 0, tartib: o.id, kod: null, nom: `q${o.id}`, birlik: 'м3',
  hajm: null, narx: null, summa: null, kat: null, narx_usul: null, qoshimcha: false, zamena: false,
  d1: null, d2: null, d3: null, xom_qator: null, yangilandi: null, manba_id: null, versiya: 1, ...o,
} as T2Qator);

// Bo'lim → ish (beton 10 m3) → ЧЕЛ (norma 2), МАШ (norma 0.5, smetada narxsiz), МАТ (norma 1.02, oldingi F2 narxi bor)
//        + ish ichidagi mustaqil material (mat) + bo'lim darajasidagi material
const rows = [
  q({ id: 1, tur: 'rz', nom: 'Poydevor' }),
  q({ id: 2, tur: 'bl', ota_id: 1, nom: 'Beton', hajm: 10 }),
  q({ id: 3, tur: 'rs', ota_id: 2, kat: 'ЧЕЛ', nom: 'Ishchi', birlik: 'чел.-ч', norma: 2, narx: 25000 }),
  q({ id: 4, tur: 'rs', ota_id: 2, kat: 'МАШ', nom: 'Kran', birlik: 'маш.-ч', norma: 0.5, narx: null }),
  q({ id: 5, tur: 'rs', ota_id: 2, kat: 'МАТ', nom: 'Beton B25', norma: 1.02, narx: 900000 }),
  q({ id: 6, tur: 'mat', ota_id: 2, kat: 'МАТ', nom: 'Armatura', birlik: 'т', narx: 9000000 }),
  q({ id: 7, tur: 'mat', ota_id: 1, kat: 'МАТ', nom: 'Gidroizolyatsiya', birlik: 'м2', narx: 50000 }),
  q({ id: 8, tur: 'bl', ota_id: 1, nom: 'Bajarilmagan ish', hajm: 5 }),
];
const holat: F2Holat[] = [
  { qator_id: 2, f2_mumkin_hajm: 6, f2_hajm: 4, smeta_hajm: 10 },
  { qator_id: 3, f2_mumkin_hajm: 12 }, { qator_id: 4, f2_mumkin_hajm: 3 }, { qator_id: 5, f2_mumkin_hajm: 6.12, f2_narx: 880000 },
  { qator_id: 6, f2_mumkin_hajm: 0.8 }, { qator_id: 7, f2_mumkin_hajm: 40 }, { qator_id: 8, f2_mumkin_hajm: 0 },
];

describe('F2 tayyorlash mantig‘i', () => {
  it('daraxt: faqat F2 olish mumkin bo‘lgan ishlar; rs avtomatik, mat mustaqil', () => {
    const b = f2Qur(rows, holat);
    expect(b).toHaveLength(1);
    expect(b[0].ishlar.map((x) => x.id)).toEqual([2]);
    expect(b[0].ishlar[0].resurslar.map((r) => [r.id, r.avto, r.taklifManba])).toEqual([[3, true, 'smeta'], [4, true, 'yoq'], [5, true, 'oldingi_f2'], [6, false, 'smeta']]);
    expect(b[0].alohida.map((r) => r.id)).toEqual([7]);
  });

  it('ish hajmi → resurslar hajm × norma, narx manbasi bilan, summa avtomatik', () => {
    const b = f2Qur(rows, holat);
    const k = bosKiritma(); k.hajm[2] = '6';
    expect(f2Qatorlar(b, k).find((x) => x.id === 4)?.xato).toBe('NARX');   // narxsiz — faqat ongli tanlov
    expect(narxsizNomzodlar(f2Qatorlar(b, k))).toEqual([4]);
    k.narxsiz[4] = true;
    const r = f2Qatorlar(b, k);
    expect(r.map((x) => [x.id, x.hajm, x.narx, x.summa, x.manba])).toEqual([
      [2, 6, null, null, 'yoq'], [3, 12, 25000, 300000, 'smeta'], [4, 3, null, null, 'yoq'], [5, 6.12, 880000, 5385600, 'oldingi_f2'],
    ]);
    expect(r[0].narxsiz && r[2].narxsiz).toBe(true);
    const j = f2Jami(r);
    expect(j).toMatchObject({ ish: 1, xato: 0, narxsiz: 1, summa: 5685600 });
    expect(j.kat).toEqual({ ЧЕЛ: 300000, МАТ: 5385600 });
  });

  it('fakt qoldig‘idan oshgan hajm — faqat ogohlantirish (blok yo‘q); smetadan oshgan jami — SMETADAN_OSHDI', () => {
    const b = f2Qur(rows, holat);
    const k = bosKiritma(); k.hajm[2] = '7';
    const oshgan = f2Qatorlar(b, Object.assign(k, { narxsiz: { 4: true } }));
    expect(oshgan[0].xato).toBeUndefined();
    expect(oshgan[0].ogoh).toBe('SMETADAN_OSHDI'); // 4 + 7 > smeta 10
    expect(f2Jami(oshgan).xato).toBe(0);
    // Ish hajmi fakt qoldig'idan oshgan (ongli) - resurslar normadan to'liq, qirqilmaydi.
    expect(oshgan.find((x) => x.id === 3)).toMatchObject({ hajm: 14, ogoh: 'QOLDIQDAN_OSHDI' });
    const b2 = f2Qur(rows, holat.map((h) => (h.qator_id === 2 ? { ...h, f2_mumkin_hajm: 8 } : h)));
    const r = f2Qatorlar(b2, Object.assign(bosKiritma(), { hajm: { 2: '7' }, narxsiz: { 4: true } }));
    expect(r[0].xato).toBeUndefined();
    expect(r[0].ogoh).toBe('SMETADAN_OSHDI');
    expect(r.find((x) => x.id === 4)).toMatchObject({ hajm: 3, ogoh: 'RESURS_CHEGARA' });   // ish ichida (7 ≤ 8): 7 × 0.5 = 3.5 > 3 → resurs fakt qoldig'i bilan cheklanadi
  });

  it('qoralamadagi F2 hajmi qoldiqdan ayriladi; qoralama bilan ikki marta olish - QORALAMA_TAKROR ogohlantirishi', () => {
    const qor = new Map([[2, 4]]);
    const holat20 = holat.map((h) => (h.qator_id === 2 ? { ...h, smeta_hajm: 20 } : h)); // smeta katta - faqat qoralama ta'siri sinaladi
    const b = f2Qur(rows, holat20, undefined, 'fakt', qor);
    const ish = b[0].ishlar[0];
    expect(ish).toMatchObject({ id: 2, mumkin: 2, olingan: 4, qoralama: 4 });
    const r = f2Qatorlar(b, Object.assign(bosKiritma(), { hajm: { 2: '5' }, narxsiz: { 4: true } }));
    expect(r[0].xato).toBeUndefined();
    expect(r[0].ogoh).toBe('QORALAMA_TAKROR');
    const ichida = f2Qatorlar(b, Object.assign(bosKiritma(), { hajm: { 2: '2' }, narxsiz: { 4: true } }));
    expect(ichida[0].ogoh).toBeUndefined();
    // Qoralama butun qoldiqni yeb qo'ysa ham ish ro'yxatda qoladi (mumkin 0).
    const hammasi = f2Qur(rows, holat, undefined, 'fakt', new Map([[2, 6]]));
    expect(hammasi[0].ishlar[0]).toMatchObject({ id: 2, mumkin: 0 });
    // Faktsiz rejim: smeta - tasdiqlangan - qoralama.
    const fs = f2Qur(rows, [{ qator_id: 2, f2_mumkin_hajm: 0, f2_hajm: 4, smeta_hajm: 10 }], undefined, 'smeta', qor);
    expect(fs[0].ishlar.find((x) => x.id === 2)).toMatchObject({ mumkin: 2, qoralama: 4 });
  });

  it('qo‘lda narx/summa, mustaqil material, narxsiz → qayta narx', () => {
    const b = f2Qur(rows, holat);
    const k = bosKiritma();
    k.hajm[2] = '1'; k.narx[3] = '30000'; k.summa[5] = '900000'; k.narxsiz[4] = false; k.narx[4] = '120000';
    k.hajm[6] = '0,5'; k.hajm[7] = '40';
    const r = f2Qatorlar(b, k);
    const by = new Map(r.map((x) => [x.id, x]));
    expect(by.get(3)).toMatchObject({ hajm: 2, narx: 30000, summa: 60000, manba: 'qolda' });
    expect(by.get(4)).toMatchObject({ hajm: 0.5, narx: 120000, summa: 60000, manba: 'qolda', narxsiz: false });
    expect(by.get(5)).toMatchObject({ hajm: 1.02, summa: 900000, ogoh: 'ARIFMETIKA' });
    expect(by.get(6)).toMatchObject({ hajm: 0.5, narx: 9000000, summa: 4500000 });
    expect(by.get(7)).toMatchObject({ hajm: 40, summa: 2000000, ishId: null });
  });

  it('smetada aniq 0 narx (mashinist mehnati) — 0 summa, narxsiz emas', () => {
    const r0 = rows.map((x) => (x.id === 4 ? { ...x, narx: 0 } : x));
    const r = f2Qatorlar(f2Qur(r0, holat), Object.assign(bosKiritma(), { hajm: { 2: '2' } }));
    expect(r.find((x) => x.id === 4)).toMatchObject({ hajm: 1, narx: 0, summa: 0, manba: 'smeta', narxsiz: false });
    expect(f2Jami(r).xato).toBe(0);
  });

  it('faktsiz rejim: chegara = smeta qoldig‘i; fakt yo‘q bo‘lsa ham F2 yasaladi; oshsa faqat ogohlantirish (blok yo‘q)', () => {
    // Fakt umuman yo'q: f2_mumkin_hajm 0, lekin smeta hajmi bor.
    const faktsiz: F2Holat[] = [
      { qator_id: 2, f2_mumkin_hajm: 0, f2_hajm: 4, smeta_hajm: 10 }, { qator_id: 8, f2_mumkin_hajm: 0, f2_hajm: 0, smeta_hajm: 5 },
      { qator_id: 6, f2_mumkin_hajm: 0, f2_hajm: 0, smeta_hajm: 1 }, { qator_id: 7, f2_mumkin_hajm: 0, f2_hajm: 0, smeta_hajm: 40 },
    ];
    expect(f2Qur(rows, faktsiz)).toEqual([]); // fakt rejimi: hech narsa yo'q
    const b = f2Qur(rows, faktsiz, undefined, 'smeta');
    expect(b[0].ishlar.map((x) => [x.id, x.mumkin, x.erkin])).toEqual([[2, 6, true], [8, 5, true]]);
    expect(b[0].alohida.map((r) => [r.id, r.mumkin])).toEqual([[7, 40]]);
    const ok = f2Qatorlar(b, Object.assign(bosKiritma(), { hajm: { 2: '6' }, narxsiz: { 4: true } }));
    expect(ok.find((x) => x.id === 2)?.xato).toBeUndefined();
    expect(ok.find((x) => x.id === 3)).toMatchObject({ hajm: 12, narx: 25000, summa: 300000 }); // resurs: norma × ish, qirqilmaydi
    // Smeta qoldig'idan oshirib kiritish — blok emas, ogohlantirish.
    const osh = f2Qatorlar(b, Object.assign(bosKiritma(), { hajm: { 2: '9' }, narxsiz: { 4: true } }));
    expect(osh.find((x) => x.id === 2)).toMatchObject({ hajm: 9, ogoh: 'SMETADAN_OSHDI' });
    expect(osh.find((x) => x.id === 2)?.xato).toBeUndefined();
    expect(osh.find((x) => x.id === 3)).toMatchObject({ hajm: 18, ogoh: 'SMETADAN_OSHDI' });
    expect(f2Jami(osh).xato).toBe(0);
    // Smeta qoldig'i tugagan ish ham ko'rinadi (qo'shimcha hajm kiritish mumkin).
    const tugagan = f2Qur(rows, faktsiz.map((h) => (h.qator_id === 2 ? { ...h, f2_hajm: 10 } : h)), undefined, 'smeta');
    expect(tugagan[0].ishlar.find((x) => x.id === 2)).toMatchObject({ mumkin: 0, erkin: true });
  });

  it('server yuki: ish narxsiz, resurs hujjat narxi bilan, manba — hujjat raqami', () => {
    const b = f2Qur(rows, holat);
    const y = f2Yuk(f2Qatorlar(b, Object.assign(bosKiritma(), { hajm: { 2: '6' }, narxsiz: { 4: true } })), '12');
    expect(y[0]).toMatchObject({ qatorId: 2, certifiedQuantity: 6, priceIntentionallyAbsent: true, certifiedUnitPrice: undefined });
    expect(y[1]).toMatchObject({ qatorId: 3, certifiedUnitPrice: 25000, certifiedAmount: 300000, priceIntentionallyAbsent: false });
    expect(y[0].rawSnapshot.sourceReference).toBe('Ф-2 № 12');
    expect(y[1].rawSnapshot.sourceReference).toBe('Ф-2 № 12; цена по смете');
    expect(ulushHajm(6, 50)).toBe('3');
  });

  it('minus hajm (egasi: plyus-minus foydalanuvchi ishi): ish va resurslar minus, narx plyus, summa minus; 0 va son emas — xato', () => {
    const b = f2Qur(rows, holat);
    const r = f2Qatorlar(b, Object.assign(bosKiritma(), { hajm: { 2: '-3' }, narxsiz: { 4: true } }));
    expect(r.every((x) => !x.xato)).toBe(true);
    expect(r.map((x) => [x.id, x.hajm, x.narx, x.summa])).toEqual([
      [2, -3, null, null], [3, -6, 25000, -150000], [4, -1.5, null, null], [5, -3.06, 880000, -2692800],
    ]);
    expect(f2Jami(r).summa).toBe(-2842800);
    expect(r[0].ogoh).toBeUndefined(); // minus — qoldiq/smeta chegarasiga tegmaydi
    // F2 yuki: minus hajm, plyus narx, minus summa serverga ketadi.
    const y = f2Yuk(r, '12');
    expect(y[1]).toMatchObject({ qatorId: 3, certifiedQuantity: -6, certifiedUnitPrice: 25000, certifiedAmount: -150000 });
    for (const bad of ['0', '-0', 'abc']) {
      const x = f2Qatorlar(b, Object.assign(bosKiritma(), { hajm: { 2: bad }, narxsiz: { 4: true } }));
      expect(x[0].xato, bad).toBe('HAJM');
    }
  });

  it('minus hajm fakt qoldig‘i 0 bo‘lgan ishda ham resurslari bilan minus yoziladi (qoldiqqa bog‘lanmaydi)', () => {
    const b = f2Qur(rows, holat.map((h) => (h.qator_id === 3 ? { ...h, f2_mumkin_hajm: 0 } : h)));
    const plus = f2Qatorlar(b, Object.assign(bosKiritma(), { hajm: { 2: '2' }, narxsiz: { 4: true } }));
    expect(plus.find((x) => x.id === 3)).toBeUndefined(); // plyusda qoldiq 0 resurs F2 ga kirmaydi (eski xulq o'zgarmadi)
    const r = f2Qatorlar(b, Object.assign(bosKiritma(), { hajm: { 2: '-2' }, narxsiz: { 4: true } }));
    expect(r.find((x) => x.id === 3)).toMatchObject({ hajm: -4, summa: -100000 });
  });

  it('bo‘lim daraxti yig‘iq: ajdodlar ochilmaguncha farzandlar ko‘rinmaydi; tanlangan bo‘lim ajdodlari doim ochiq', () => {
    const bo = (id: number, daraja: number) => ({ id, nom: `b${id}`, daraja, ishlar: [], alohida: [] });
    const d = bolimDaraxti([bo(1, 0), bo(2, 1), bo(3, 2), bo(4, 1), bo(5, 0)]);
    expect(d.map((x) => [x.kalit, x.ota, x.farzand])).toEqual([[1, null, true], [2, 1, true], [3, 2, false], [4, 1, false], [5, null, false]]);
    expect(korinadiganBolimlar(d, new Set(), null).map((x) => x.kalit)).toEqual([1, 5]);
    expect(korinadiganBolimlar(d, new Set([1]), null).map((x) => x.kalit)).toEqual([1, 2, 4, 5]);
    expect(korinadiganBolimlar(d, new Set(), 3).map((x) => x.kalit)).toEqual([1, 2, 3, 4, 5]);
  });

  it('ishning 1 birlik taklif narxi: Σ norma × narx; narxsiz resurs 0 deb olinmaydi, alohida sanaladi', () => {
    const b = f2Qur(rows, holat);
    // Ishchi 2 × 25000 = 50000; Kran narxsiz; Beton 1.02 × 880000 = 897600
    expect(ishBirlikNarxi(b[0].ishlar[0])).toEqual({ summa: 947600, narxsiz: 1 });
  });
});

describe('pereraschet: shu qoralamadagi storno eski F2 ni sof 0 qiladi', () => {
  const r2 = (o: Partial<T2Qator> & { id: number; tur: string }): T2Qator => ({ obyekt_id: 1, ota_id: null, tartib: o.id, kod: null, nom: 'q' + o.id, birlik: 'м3', hajm: null, narx: null, ...o } as T2Qator);
  const qs = [r2({ id: 1, tur: 'rz', nom: 'B' }), r2({ id: 2, tur: 'bl', ota_id: 1, hajm: 20 }), r2({ id: 3, tur: 'bl', ota_id: 1, hajm: 20 })];
  // Fakt to'g'rilangan: 12. Tasdiqlangan F2: eski (stornolanadigan) 10 + boshqa 3 = 13 → server f2_mumkin = max(0, 12 − 13) = 0.
  const h: F2Holat[] = [{ qator_id: 2, fakt_hajm: 12, f2_hajm: 13, f2_mumkin_hajm: 0, smeta_hajm: 20 }, { qator_id: 3, fakt_hajm: 5, f2_hajm: 2, f2_mumkin_hajm: 3, smeta_hajm: 20 }];
  const ish = (b: ReturnType<typeof f2Qur>, id: number) => b.flatMap((x) => x.ishlar).find((i) => i.id === id);
  it('yangi hajm = to‘liq fakt − BOSHQA tasdiqlangan F2 (eski F2 sof 0); storno yo‘q qator o‘zgarmaydi', () => {
    const b = f2Qur(qs, h, undefined, 'fakt', undefined, { stornoQaytar: new Map([[2, 10]]) });
    expect(ish(b, 2)).toMatchObject({ mumkin: 9, olingan: 3 }); // 12 − 3
    expect(ish(b, 3)).toMatchObject({ mumkin: 3, olingan: 2 });
  });
  it('storno bo‘lmasa — avvalgidek server qoldig‘i', () => {
    const b = f2Qur(qs, h, undefined, 'fakt');
    expect(ish(b, 2)).toBeUndefined(); // mumkin 0 — ro'yxatda yo'q
    expect(ish(b, 3)).toMatchObject({ mumkin: 3 });
  });
  it('faktsiz (smeta) rejim: smeta − BOSHQA F2', () => {
    const b = f2Qur(qs, h, undefined, 'smeta', undefined, { stornoQaytar: new Map([[2, 10]]) });
    expect(ish(b, 2)).toMatchObject({ mumkin: 17 }); // 20 − 3
  });
});

describe('chegirma (manfiy fakt) qatorlari F2 ga ishorasi bilan kiradi', () => {
  const r3 = (o: Partial<T2Qator> & { id: number; tur: string }): T2Qator => ({ obyekt_id: 1, ota_id: null, tartib: o.id, kod: null, nom: 'q' + o.id, birlik: 'м2', hajm: null, narx: null, ...o } as T2Qator);
  // A — asosiy ish (fakt 10); C — qalinlik tuzatishi (smeta −5, fakt −4,6535) va uning rs bolasi (norma 2, narx 100).
  const qs = [r3({ id: 1, tur: 'rz', nom: 'B' }), r3({ id: 2, tur: 'bl', ota_id: 1, hajm: 10, nom: 'A' }), r3({ id: 3, tur: 'bl', ota_id: 1, hajm: -5, nom: 'C' }),
    r3({ id: 4, tur: 'rs', ota_id: 3, kat: 'ЧЕЛ', nom: 'Ishchi', norma: 2, narx: 100 } as Partial<T2Qator> & { id: number; tur: string }),
    r3({ id: 5, tur: 'rs', ota_id: 2, kat: 'ЧЕЛ', nom: 'Ishchi A', norma: 2, narx: 100 } as Partial<T2Qator> & { id: number; tur: string })];
  const holat = (f2C = 0): F2Holat[] => [
    { qator_id: 2, fakt_hajm: 10, f2_hajm: 0, f2_mumkin_hajm: 10, smeta_hajm: 10 },
    { qator_id: 3, fakt_hajm: -4.6535, f2_hajm: f2C, f2_mumkin_hajm: 0, smeta_hajm: -5 }, // server f2_mumkin >= 0 — manfiyni 0 qiladi
    { qator_id: 4, fakt_hajm: -9.307, f2_hajm: 0, f2_mumkin_hajm: 0, smeta_hajm: -10 },
    { qator_id: 5, fakt_hajm: 20, f2_hajm: 0, f2_mumkin_hajm: 20, smeta_hajm: 20 },
  ];
  it('yangi F2 da asosiy ham, manfiy tuzatish ham (rs bolasi bilan); sof to‘g‘ri', () => {
    const b = f2Qur(qs, holat());
    const ishlar = new Map(b.flatMap((x) => x.ishlar).map((i) => [i.id, i]));
    expect(ishlar.get(3)?.mumkin).toBe(-4.6535);
    const k = bosKiritma(); k.hajm[2] = ulushHajm(ishlar.get(2)!.mumkin, 100); k.hajm[3] = ulushHajm(ishlar.get(3)!.mumkin, 100);
    const q = f2Qatorlar(b, k);
    const by = new Map(q.map((x) => [x.id, x]));
    expect(by.get(3)).toMatchObject({ hajm: -4.6535 });
    expect(by.get(3)!.ogoh).toBeUndefined();
    expect(by.get(4)).toMatchObject({ hajm: -9.307, summa: -930.7 }); // rs ishorasi bilan
    expect(by.get(5)).toMatchObject({ hajm: 20, summa: 2000 });
    expect(f2Jami(q).summa).toBe(1069.3); // 2000 − 930,7
  });
  it('|F2| ≤ |fakt|, ishora bir xil: qisman olingan qoldiq; to‘liq/ortiq olingan — chiqmaydi', () => {
    expect(f2Qur(qs, holat(-2)).flatMap((x) => x.ishlar).find((i) => i.id === 3)?.mumkin).toBeCloseTo(-2.6535, 9);
    expect(f2Qur(qs, holat(-5)).flatMap((x) => x.ishlar).find((i) => i.id === 3)).toBeUndefined();
    expect(ishoraliQoldiq(-4, 3)).toBe(-4); // teskari ishorali olingan — chegaradan oshmaydi
  });
  it('chegirmadan «ko‘proq manfiy» yoki teskari ishorali kiritma — ogohlantirish', () => {
    const b = f2Qur(qs, holat());
    const k = bosKiritma(); k.hajm[3] = '-6';
    expect(f2Qatorlar(b, k).find((x) => x.id === 3)?.ogoh).toBeTruthy();
  });
});

describe('fakt F2 dan kam: ortiqcha F2 ni minus bilan chegirish (ixtiyoriy)', () => {
  const r4 = (o: Partial<T2Qator> & { id: number; tur: string; norma?: number | null }): T2Qator => ({ obyekt_id: 1, ota_id: null, tartib: o.id, kod: null, nom: 'q' + o.id, birlik: 'м3', hajm: null, narx: null, ...o } as T2Qator);
  // Ish (smeta 100) + avto rs (norma 2; smeta narxi 100, F2 narxi 120) + bo'lim darajasidagi mat (smeta 50, F2 70).
  const qs = [r4({ id: 1, tur: 'rz', nom: 'B' }), r4({ id: 2, tur: 'bl', ota_id: 1, hajm: 100 }),
    r4({ id: 3, tur: 'rs', ota_id: 2, kat: 'ЧЕЛ', norma: 2, narx: 100 }), r4({ id: 4, tur: 'mat', ota_id: 1, kat: 'МАТ', narx: 50, hajm: 10 })];
  const hol = (fakt: number | null, f2 = 100): F2Holat[] => [
    { qator_id: 2, fakt_hajm: fakt, f2_hajm: f2, f2_mumkin_hajm: 0, smeta_hajm: 100 },
    { qator_id: 3, fakt_hajm: 160, f2_hajm: 200, f2_mumkin_hajm: 0, f2_narx: 120 },
    { qator_id: 4, fakt_hajm: 8, f2_hajm: 10, f2_mumkin_hajm: 0, f2_narx: 70, smeta_hajm: 10 },
  ];
  const ON = { ortiqchaChegir: true };
  const ish = (b: ReturnType<typeof f2Qur>, id: number) => b.flatMap((x) => x.ishlar).find((i) => i.id === id);
  const mat = (b: ReturnType<typeof f2Qur>, id: number) => b.flatMap((x) => x.alohida).find((r) => r.id === id);

  it('sukut (o‘chiq): F2 faktdan oldinda — normal, hech narsa chegirilmaydi', () => {
    const b = f2Qur(qs, hol(80));
    expect(ish(b, 2)).toBeUndefined();
    expect(mat(b, 4)).toBeUndefined();
  });
  it('yoqilgan: fakt 80, F2 100 → −20 (belgi bilan); mustaqil mat ham', () => {
    const b = f2Qur(qs, hol(80), undefined, 'fakt', undefined, ON);
    expect(ish(b, 2)).toMatchObject({ mumkin: -20, ortiqchaF2: true });
    expect(ish(b, 2)?.faktNol).toBeUndefined();
    expect(mat(b, 4)).toMatchObject({ mumkin: -2, ortiqchaF2: true });
  });
  it('minus qator narxi — F2 narxi (smeta narxi emas); rs ishorasi bilan, summa = hajm × narx', () => {
    const b = f2Qur(qs, hol(80), undefined, 'fakt', undefined, ON);
    const k = bosKiritma(); k.hajm[2] = ulushHajm(ish(b, 2)!.mumkin, 100); k.hajm[4] = ulushHajm(mat(b, 4)!.mumkin, 100);
    const by = new Map(f2Qatorlar(b, k).map((x) => [x.id, x]));
    expect(by.get(2)).toMatchObject({ hajm: -20 }); expect(by.get(2)?.ogoh).toBeUndefined();
    expect(by.get(3)).toMatchObject({ hajm: -40, narx: 120, manba: 'oldingi_f2', summa: -4800 });
    expect(by.get(4)).toMatchObject({ hajm: -2, narx: 70, manba: 'oldingi_f2', summa: -140 });
    expect(by.get(4)?.ogoh).toBeUndefined();
    expect(ortiqchaXulosa(b)).toEqual({ soni: 2, faktNol: 0, summa: -4940, nomalum: 0 });
  });
  it('fakt NULL — qator yo‘q (NULL ≠ 0); fakt 0 — butun F2 minus (faktNol belgisi)', () => {
    expect(ish(f2Qur(qs, hol(null), undefined, 'fakt', undefined, ON), 2)).toBeUndefined();
    expect(ish(f2Qur(qs, hol(0), undefined, 'fakt', undefined, ON), 2)).toMatchObject({ mumkin: -100, ortiqchaF2: true, faktNol: true });
  });
  it('F2 ≤ fakt — chegirma yo‘q (avvalgi musbat qoldiq)', () => {
    const h = hol(100); h[0].f2_mumkin_hajm = 0;
    expect(ish(f2Qur(qs, h, undefined, 'fakt', undefined, ON), 2)).toBeUndefined();
  });
  it('qoralamada −5 bor → −15; ishora teskariga o‘tmaydi', () => {
    expect(ish(f2Qur(qs, hol(80), undefined, 'fakt', new Map([[2, -5]]), ON), 2)?.mumkin).toBe(-15);
    expect(ish(f2Qur(qs, hol(80), undefined, 'fakt', new Map([[2, -25]]), ON), 2)?.mumkin ?? 0).toBe(0);
  });
  it('qoralamada +10 bor → −30 (sof F2 = fakt: 100 + 10 − 30 = 80); manfiy fakt qatori musbat qoralamani avvalgidek e’tiborsiz qoldiradi', () => {
    expect(ish(f2Qur(qs, hol(80), undefined, 'fakt', new Map([[2, 10]]), ON), 2)).toMatchObject({ mumkin: -30, ortiqchaF2: true, qoralama: 10 });
    expect(ish(f2Qur(qs, hol(0), undefined, 'fakt', new Map([[2, 10]]), ON), 2)?.mumkin).toBe(-110); // |…| ≤ olingan + qoralama
    const h = hol(-4); h[0].f2_hajm = 0;
    expect(ish(f2Qur(qs, h, undefined, 'fakt', new Map([[2, 10]]), ON), 2)?.mumkin).toBe(-4);
  });
  it('storno bilan: stornolanayotgan eski F2 chiqarilgach hisoblanadi', () => {
    // F2 130, shundan 30 shu qoralamada storno → boshqa F2 100 > fakt 80 → −20.
    expect(ish(f2Qur(qs, hol(80, 130), undefined, 'fakt', undefined, { ...ON, stornoQaytar: new Map([[2, 30]]) }), 2)).toMatchObject({ mumkin: -20, ortiqchaF2: true });
    // F2 100, storno 30 → boshqa F2 70 < fakt 80 → +10 (chegirma emas).
    const b = ish(f2Qur(qs, hol(80, 100), undefined, 'fakt', undefined, { ...ON, stornoQaytar: new Map([[2, 30]]) }), 2);
    expect(b).toMatchObject({ mumkin: 10 }); expect(b?.ortiqchaF2).toBeUndefined();
  });
  it('manfiy fakt (chegirma) qatori va smeta rejimi o‘zgarmaydi', () => {
    const h = hol(-4); h[0].f2_hajm = 0;
    expect(ish(f2Qur(qs, h, undefined, 'fakt', undefined, ON), 2)).toMatchObject({ mumkin: -4 });
    expect(ish(f2Qur(qs, h, undefined, 'fakt', undefined, ON), 2)?.ortiqchaF2).toBeUndefined();
    const s = ish(f2Qur(qs, hol(80), undefined, 'smeta', undefined, ON), 2);
    expect(s?.mumkin).toBe(0); expect(s?.ortiqchaF2).toBeUndefined();
  });
});
