import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { T2Qator } from '../api/supabase';
import { jurnalQur, type JurnalHolat, type JurnalIsh } from './fakt-jurnal';
import { bolimIshlariYigish, f2NarxYigish, faktF2Reja, obyektF2Reja, tenglashJami, type F2AktQator } from './fakt-f2-tenglash';
import { urinishYarat } from './fakt-qamrov-urinish';

const q = (o: Partial<T2Qator> & { id: number; tur: string }): T2Qator => ({
  obyekt_id: 1, obyekt: null, kompaniya_id: 1, ota_id: null, daraja: 0, tartib: o.id, kod: null, nom: `q${o.id}`, birlik: 'm3',
  hajm: null, narx: null, summa: null, kat: null, narx_usul: null, qoshimcha: false, zamena: false,
  d1: null, d2: null, d3: null, xom_qator: null, yangilandi: null, manba_id: null, versiya: 1, ...o,
} as T2Qator);

const rows = [
  q({ id: 1, tur: 'rz', nom: 'Bo‘lim' }),
  q({ id: 2, tur: 'rz', ota_id: 1, daraja: 1, nom: 'Ichki' }),
  q({ id: 10, tur: 'bl', ota_id: 1, nom: 'Ish A', hajm: 10 }),
  q({ id: 11, tur: 'rs', ota_id: 10, kat: 'ЧЕЛ', nom: 'Ishchi' }),
  q({ id: 12, tur: 'mat', ota_id: 10, nom: 'Beton', hajm: 5 }),
  q({ id: 20, tur: 'bl', ota_id: 2, nom: 'Ish B', hajm: 4 }),
  q({ id: 21, tur: 'bl', ota_id: 1, nom: 'Chegirma', hajm: -3 }),
];
const st = (qator_id: number, smeta: number, fakt: number, f2: number, narx: number | null = 100): JurnalHolat => ({ qator_id, smeta_hajm: smeta, fakt_hajm: fakt, f2_hajm: f2, smeta_narx: narx });
const states = [st(10, 10, 3, 8), st(11, 20, 6, 16), st(12, 5, 5, 4), st(20, 4, 4, 4), st(21, -3, -3, -3)];

describe('Fakt = F2 — reja', () => {
  const { bolimIshlari, bolimlar } = jurnalQur(rows, states);
  const holat = new Map(states.map((s) => [s.qator_id, s]));
  const bolalar = new Map<number, number[]>(); for (const b of bolimlar) if (b.otaId != null) bolalar.set(b.otaId, [...(bolalar.get(b.otaId) ?? []), b.id]);

  it('faqat musbat farq (f2 − fakt) yoziladi; rs (mehnat/mashina) alohida yozilmaydi, norma bo‘yicha ergashadi', () => {
    const r = faktF2Reja(bolimIshlariYigish(1, bolimIshlari, bolalar, true), holat);
    expect(r.paket).toEqual([{ qator_id: 10, hajm: 5 }]);          // Ish A: 8 − 3; Beton: f2<fakt → yozilmaydi; Ish B teng; rs yo'q
    expect(r.qatorlar[0].avtomatik).toBe(1);
    expect(r.jamiSumma).toBe(500);
    expect(r.otkazildi.manfiyReja).toBe(1);                         // chegirma qatori o'tkazib yuboriladi
  });

  it('ichki bo‘limsiz — faqat o‘z bo‘limi; narxsiz qator sanaladi', () => {
    const h = new Map(holat); h.set(10, st(10, 10, 3, 8, null));
    const r = faktF2Reja(bolimIshlariYigish(1, bolimIshlari, bolalar, false), h);
    expect(r.narxsiz).toBe(1);
    expect(r.jamiSumma).toBe(0);
  });

  it('mat/ob resurs alohida sozlanadi: F2 > fakt bo‘lsa o‘z farqi bilan qo‘shiladi', () => {
    const h = new Map(holat); h.set(12, st(12, 5, 1, 4));
    const r = faktF2Reja(bolimIshlariYigish(1, bolimIshlari, bolalar, false), h);
    expect(r.paket).toEqual([{ qator_id: 10, hajm: 5 }, { qator_id: 12, hajm: 3 }]);
  });
});

describe('Fakt = F2 — butun obyekt', () => {
  const { bolimIshlari, bolimlar, ildizIshlari } = jurnalQur(rows, states);
  const holat = new Map(states.map((s) => [s.qator_id, s]));
  const guruhlar = () => [...bolimlar.map((b) => ({ nom: b.nom, ishlar: bolimIshlari.get(b.id) ?? [] })), { nom: 'Bo‘limsiz', ishlar: ildizIshlari }];

  it('barcha bo‘limlar (ichki ham) bir marta; qator bo‘lim nomi bilan; fakt hech qachon kamaymaydi (faqat musbat)', () => {
    const h = new Map(holat); h.set(20, st(20, 4, 1, 4)); h.set(12, st(12, 5, 9, 4));
    const r = obyektF2Reja(guruhlar(), h);
    expect(r.paket).toEqual([{ qator_id: 10, hajm: 5 }, { qator_id: 20, hajm: 3 }]);
    expect(r.qatorlar.map((x) => x.bolim)).toEqual(['Bo‘lim', 'Ichki']);
    expect(r.paket.every((x) => x.hajm > 0)).toBe(true);
  });

  it('tenglashJami: bo‘lim/qator istisnosi, bo‘lim jamisi; NULL summa 0 emas (narxsiz)', () => {
    const h = new Map(holat); h.set(20, st(20, 4, 1, 4, null));
    const r = obyektF2Reja(guruhlar(), h);
    const j0 = tenglashJami(r, new Set(), new Set());
    expect(j0.ustamasiz).toBe(500);
    expect(j0.narxsiz).toBe(1);
    expect(j0.bolimlar.map((b) => [b.nom, b.soni, b.ustamasiz])).toEqual([['Bo‘lim', 1, 500], ['Ichki', 1, null]]);
    const j1 = tenglashJami(r, new Set([10]), new Set());
    expect(j1.paket).toEqual([{ qator_id: 20, hajm: 3 }]);
    expect(j1.ustamasiz).toBeNull();
    expect(tenglashJami(r, new Set(), new Set(['Ichki'])).paket).toEqual([{ qator_id: 10, hajm: 5 }]);
  });

  it('o‘z narxi yo‘q ish: summa — ergashadigan rs (norma bor): delta × norma × rs smeta narxi (view BL_NORMA bilan bir xil); normasiz rs ergashmaydi', () => {
    const h = new Map(holat); h.set(10, st(10, 10, 3, 8, null)); h.set(11, st(11, 20, 6, 16, 100));
    const r0 = obyektF2Reja(guruhlar(), h);
    expect(r0.qatorlar[0].summa).toBeNull();          // rs 11 normasiz — serverda ham ergashmaydi
    const rowsN = rows.map((x) => (x.id === 11 ? { ...x, norma: 2 } as T2Qator : x));
    const j = jurnalQur(rowsN, states);
    const r = obyektF2Reja([...j.bolimlar.map((b) => ({ nom: b.nom, ishlar: j.bolimIshlari.get(b.id) ?? [] }))], h);
    expect(r.qatorlar[0].summa).toBe(1000);           // 5 × 2 × 100
    expect(r.qatorlar[0].narxManba).toBe('smeta');
    expect(r.paket[0]).toEqual({ qator_id: 10, hajm: 5 }); // narx yuborilmaydi
  });

  it('25k qator — tez (chiziqli)', () => {
    const ish = (id: number): JurnalIsh => ({ id, tur: 'bl', kod: null, nom: `I${id}`, birlik: 'm3', smeta: 10, fakt: 0, qoldiq: 10, f2Mumkin: 0, ulush: 0, holat: 'yangi', norma: null,
      qoshimcha: false, zamena: false, otaId: 1, otaVersiya: 1, kat: 'МАТ', almashtiradi: null, aslNom: null, almashtirilgan: null, bajarilmaydi: null, resurslar: [], avtomatik: [] });
    const ishlar = Array.from({ length: 25000 }, (_, i) => ish(i + 1));
    const h = new Map(ishlar.map((x) => [x.id, { qator_id: x.id, smeta_hajm: 10, fakt_hajm: 1, f2_hajm: 3, smeta_narx: 7 } as JurnalHolat]));
    const t0 = performance.now();
    const r = obyektF2Reja([{ nom: 'A', ishlar: ishlar.slice(0, 12000) }, { nom: 'B', ishlar: ishlar.slice(12000) }], h);
    const j = tenglashJami(r, new Set([1]), new Set());
    expect(performance.now() - t0).toBeLessThan(1500);
    expect(j.paket.length).toBe(24999);
    expect(j.ustamasiz).toBe(24999 * 14);
  });
});

describe('Fakt = F2 — F2 narxi faktga (egasi 2026-10-28)', () => {
  const l = (akt_id: number, qator_id: number, hajm: number, narx: number | null, o: Partial<F2AktQator> = {}): F2AktQator => ({
    akt_id, qator_id, hajm, narx, summa: narx == null ? null : hajm * narx, certified_quantity: null, certified_unit_price: null, certified_amount: null, ...o });

  it('f2NarxYigish: bitta narx; turli narx — hajm bo‘yicha o‘rtacha; qisman narxsiz — null (to‘qilmaydi); 0 — 0; sertifikat ustun', () => {
    const m = f2NarxYigish([
      l(7, 1, 2, 50), l(8, 1, 3, 50),
      l(7, 2, 1, 10), l(9, 2, 3, 30),
      l(7, 3, 1, 10), l(8, 3, 1, null),
      l(7, 4, 2, null),
      l(7, 5, 4, 0),
      l(7, 6, 2, 10, { certified_quantity: 4, certified_unit_price: 12, certified_amount: 48 }),
    ]);
    expect(m.get(1)).toEqual({ narx: 50, aktlar: [7, 8], aralash: false, soni: 2, narxsizSoni: 0 });
    expect(m.get(2)?.narx).toBe(25);                  // (10 + 90) / 4
    // Qisman narxli: Σ narxli summa / Σ barcha hajm = 10 / 2 — fakt summasi F2 summasiga teng, narx to'qilmaydi.
    expect(m.get(3)).toEqual({ narx: 5, aktlar: [7, 8], aralash: true, soni: 2, narxsizSoni: 1 });
    expect(m.get(4)).toEqual({ narx: null, aktlar: [7], aralash: false, soni: 1, narxsizSoni: 1 });
    expect(m.get(5)?.narx).toBe(0);
    expect(m.get(6)?.narx).toBe(12);
  });

  const { bolimIshlari, bolimlar } = jurnalQur(rows, states);
  const holat = new Map(states.map((s) => [s.qator_id, s]));
  const bolalar = new Map<number, number[]>(); for (const b of bolimlar) if (b.otaId != null) bolalar.set(b.otaId, [...(bolalar.get(b.otaId) ?? []), b.id]);
  const ishlar = () => bolimIshlariYigish(1, bolimIshlari, bolalar, true);

  it('F2 narxi bor qator: paketda narx + f2_sertifikat + akt id; summa F2 narxida; ko‘rilgan jami = yoziladigan jami', () => {
    const h = new Map(holat); h.set(12, st(12, 5, 1, 4, 100));
    const f2Narx = f2NarxYigish([l(31, 10, 8, 140), l(31, 12, 2, 90), l(32, 12, 2, 110)]);
    const r = faktF2Reja(ishlar(), h, null, { f2Narx });
    expect(r.paket).toEqual([
      { qator_id: 10, hajm: 5, narx: 140, narx_manba: 'f2_sertifikat', narx_manba_id: 31, narx_izoh: 'Fakt = F2: F2 №31 narxi' },
      { qator_id: 12, hajm: 3, narx: 100, narx_manba: 'f2_sertifikat', narx_izoh: "Fakt = F2: F2 №31, №32 — hajm bo'yicha o'rtacha narx" },
    ]);
    const j = tenglashJami(r, new Set(), new Set());
    expect(j.ustamasiz).toBe(5 * 140 + 3 * 100);
    // Serverda yoziladigan summa: hajm × coalesce(narx, smeta narx) — oldindan ko'rish bilan bir xil.
    const smeta = (id: number) => Number(h.get(id)?.smeta_narx);
    expect(j.paket.reduce((s, p) => s + p.hajm * (p.narx ?? smeta(p.qator_id)), 0)).toBe(j.ustamasiz);
    expect([j.f2Narxli, j.smetaNarxli, j.narxsiz]).toEqual([2, 0, 0]);
  });

  it('F2 narxi NULL: bl — narx_yoq (hajm yoziladi, summa yo‘q, smeta narxi to‘qilmaydi); mat/ob — smeta narxi; ikkalasi yo‘q — narxsiz', () => {
    const h = new Map(holat); h.set(12, st(12, 5, 1, 4, 100));
    const r = faktF2Reja(ishlar(), h, null, { f2Narx: f2NarxYigish([l(31, 10, 8, null), l(31, 12, 4, null)]) });
    expect(r.paket).toEqual([
      { qator_id: 10, hajm: 5, narx_yoq: true, narx_manba: 'f2_sertifikat', narx_manba_id: 31, narx_izoh: "Fakt = F2: F2 №31 da narx yo'q" },
      { qator_id: 12, hajm: 3 },
    ]);
    const j = tenglashJami(r, new Set(), new Set());
    expect([j.f2Narxli, j.smetaNarxli, j.narxsiz]).toEqual([0, 1, 1]);
    expect(j.ustamasiz).toBe(300);
    const h2 = new Map(h); h2.set(12, st(12, 5, 1, 4, null));
    expect(tenglashJami(faktF2Reja(ishlar(), h2, null, { f2Narx: f2NarxYigish([l(31, 12, 4, null)]) }), new Set(), new Set()).paket[1]).toEqual({ qator_id: 12, hajm: 3 });
  });

  it('f2NarxYigish: sertifikat summasi birlik × hajmdan farq qilsa — Σ summa / Σ hajm (fakt summasi F2 ga aynan teng)', () => {
    const m = f2NarxYigish([l(5, 1, 3, 10, { certified_quantity: 3, certified_unit_price: 10, certified_amount: 31 })]);
    expect((m.get(1)?.narx ?? 0) * 3).toBeCloseTo(31, 9);
  });

  describe('mehnat/mashina (rs) — F2 hajmi va narxi bilan (T2-FAKT-F2-RS-001)', () => {
    const rowsN = rows.map((x) => (x.id === 11 ? { ...x, norma: 2 } as T2Qator : x));
    const rsQ = (x: number) => q({ id: x, tur: 'rs', ota_id: 10, kat: 'МАШ', nom: `rs${x}`, norma: 1 } as Partial<T2Qator> & { id: number; tur: string });
    const jur = (r: T2Qator[]) => { const j = jurnalQur(r, states); const b = new Map<number, number[]>(); for (const x of j.bolimlar) if (x.otaId != null) b.set(x.otaId, [...(b.get(x.otaId) ?? []), x.id]); return bolimIshlariYigish(1, j.bolimIshlari, b, true); };

    it('rs F2 da bor: delta = F2 − o‘z (DIRECT) fakti, F2 narxi bilan; ish summasiga hosila qo‘shilmaydi; bl narx_yoq', () => {
      const h = new Map(holat); h.set(10, st(10, 10, 3, 8, null)); h.set(11, { ...st(11, 20, 6, 16, 5), f2_summa: 144 });
      const r = faktF2Reja(jur(rowsN), h, null, { f2Narx: f2NarxYigish([l(40, 10, 8, null), l(40, 11, 16, 9)]), directFakt: new Map() });
      expect(r.paket).toEqual([
        { qator_id: 10, hajm: 5, narx_yoq: true, narx_manba: 'f2_sertifikat', narx_manba_id: 40, narx_izoh: "Fakt = F2: F2 №40 da narx yo'q" },
        { qator_id: 11, hajm: 16, narx: 9, narx_manba: 'f2_sertifikat', narx_manba_id: 40, narx_izoh: 'Fakt = F2: F2 №40 narxi' },
      ]);
      const j = tenglashJami(r, new Set(), new Set());
      expect(j.ustamasiz).toBe(144);                     // = Σ F2 (bl summasi yo'q, rs 16 × 9); hosila (5×2×5) yo'q
      expect(j.rsHosila.soni).toBe(0);
      // O'z fakti bor rs: delta = 16 − 10.
      const r2 = faktF2Reja(jur(rowsN), h, null, { f2Narx: f2NarxYigish([l(40, 10, 8, null), l(40, 11, 16, 9)]), directFakt: new Map([[11, 10]]) });
      expect(r2.paket.find((p) => p.qator_id === 11)?.hajm).toBe(6);
    });

    it('F2 da yo‘q rs (norma bor) ishga smeta narxida ergashadi — ish summasida va rsHosila da; directFakt berilmasa rs yozilmaydi', () => {
      const h = new Map(holat); h.set(10, st(10, 10, 3, 8, null)); h.set(11, { ...st(11, 20, 6, 16, 5) }); h.set(13, { qator_id: 13, smeta_hajm: 10, fakt_hajm: 3, f2_hajm: 0, smeta_narx: 4 });
      const r = faktF2Reja(jur([...rowsN, rsQ(13)]), h, null, { f2Narx: f2NarxYigish([l(40, 10, 8, null), l(40, 11, 16, 9)]), directFakt: new Map() });
      // Ish F2 dan ko'chiriladi (f2_sertifikat) — F2 da yo'q rs13 shu ulushga ERGASHMAYDI (view v5): Σ = Σ F2.
      const bl = r.qatorlar.find((x) => x.id === 10)!;
      expect(bl.summa).toBeNull();
      expect(tenglashJami(r, new Set(), new Set()).ustamasiz).toBe(144);
      // Ishning F2 manbasi yo'q (kontekstda bl yo'q) — avvalgidek ergashadi: rs13 5 × 1 × 4.
      const r3 = faktF2Reja(jur([...rowsN, rsQ(13)]), h, null, { f2Narx: f2NarxYigish([l(40, 11, 16, 9)]), directFakt: new Map() });
      expect(r3.qatorlar.find((x) => x.id === 10)?.rsHosila).toEqual({ soni: 1, summa: 20 });
      // Istisno qilingan rs: jamidan chiqadi va ogohlantiriladi.
      const j3 = tenglashJami(r, new Set([11]), new Set());
      expect(j3.ustamasiz).toBeNull();
      expect(j3.rsIstisno).toEqual({ soni: 1, summa: 144 });
      expect(faktF2Reja(jur(rowsN), h).paket.some((p) => p.qator_id === 11)).toBe(false);
    });
  });

  it('F2 minus qatorlari aynan (egasi 2026-10-29): musbat smetada sof manfiy F2 ham yoziladi; manba akt qatori izda; fakt > F2 — signal', () => {
    const h = new Map(holat); h.set(12, { ...st(12, 5, 0, -2, 100), f2_summa: -180 }); h.set(20, { ...st(20, 4, 6, 4), fakt_summa: 600, f2_summa: 400 });
    const r = faktF2Reja(ishlar(), h, null, { f2Narx: f2NarxYigish([{ ...l(60, 12, -2, 90), id: 901 }, { ...l(61, 12, 0, 90), id: 902 }]) });
    const p12 = r.paket.find((p) => p.qator_id === 12);
    expect(p12).toMatchObject({ hajm: -2, narx_manba: 'f2_sertifikat' });
    expect((p12?.hajm ?? 0) * (p12?.narx ?? 0)).toBeCloseTo(-180, 9);
    expect(p12?.narx_izoh).toContain('[qator: 901, 902]');
    const j = tenglashJami(r, new Set(), new Set());
    expect(j.manfiySoni).toBe(1);
    expect(j.faktOrtiq).toEqual({ soni: 1, summa: 200 });   // Ish B: fakt 6 > F2 4 — o'zgarmaydi
    expect(r.paket.some((p) => p.qator_id === 20)).toBe(false);
  });

  it('chegirma (manfiy reja): F2 tomon manfiy farq yoziladi; teskari ishora — o‘tkazib yuboriladi', () => {
    const h = new Map(holat); h.set(21, st(21, -3, -1, -3, 100));
    const r = faktF2Reja(ishlar(), h, null, { f2Narx: f2NarxYigish([l(50, 21, -3, 100)]) });
    expect(r.paket.find((p) => p.qator_id === 21)).toMatchObject({ hajm: -2, narx: 100 });
    expect(r.qatorlar.find((x) => x.id === 21)?.summa).toBe(-200);
    h.set(21, st(21, -3, -3, -1));
    const r2 = faktF2Reja(ishlar(), h);
    expect(r2.paket.some((p) => p.qator_id === 21)).toBe(false);
    expect(r2.otkazildi.manfiyReja).toBe(1);
  });
  it('urinish snapshoti narx maydonlarini saqlaydi (qayta yuborish — aynan shu), boshqa kalitlar tashlanadi', () => {
    const u = urinishYarat({ kompaniyaId: 1, obyektId: 2, sana: '2026-01-01', sarlavha: 's', foiz: 100, tur: 'f2' },
      [[{ qator_id: 1, hajm: 2, narx: 5, narx_manba: 'f2_sertifikat', narx_manba_id: 9, narx_izoh: 'x', boshqa: 1 } as never, { qator_id: 3, hajm: 1, narx_yoq: true }]], () => 'op');
    expect(u.bolaklar[0].qatorlar).toEqual([{ qator_id: 1, hajm: 2, narx: 5, narx_manba: 'f2_sertifikat', narx_manba_id: 9, narx_izoh: 'x' }, { qator_id: 3, hajm: 1, narx_yoq: true }]);
  });
});

describe('Fakt = F2 — smeta qatorlari o‘zgarmas (CONST)', () => {
  const src = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');
  const MAN_ETILGAN = ['t2_qator_tahrir', 't2_smeta_ozgarish_tasdiqlash_v1', 't2_markirovka', 't2_narxla', 't2_smeta_narxla_res', 't2_rollup',
    't2_smeta_ierarxiya_qaytar_v1', 't2_smeta_tozalash_v1', 'sbT2QatorTahrir', 'qator_tahrir'];
  it('Fakt = F2 yo‘li (mantiq + oyna) asl qatorni o‘zgartiruvchi amallarni chaqirmaydi; faqat fakt_yoz_v2 / akt_bekor', () => {
    for (const f of ['./fakt-f2-tenglash.ts', '../admin/sahifalar/FaktF2Tenglash.tsx']) {
      const s = src(f);
      for (const x of MAN_ETILGAN) expect(s, `${f} → ${x}`).not.toContain(x);
    }
    expect(src('../api/t2-fakt.ts')).toContain("amal: 'fakt_yoz_v2'");
    expect(src('../api/supabase.ts')).toContain("amal: 'akt_bekor'");
  });
});
