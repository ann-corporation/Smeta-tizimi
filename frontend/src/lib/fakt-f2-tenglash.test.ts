import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { T2Qator } from '../api/supabase';
import { jurnalQur, type JurnalHolat, type JurnalIsh } from './fakt-jurnal';
import { bolimIshlariYigish, faktF2Reja, obyektF2Reja, tenglashJami } from './fakt-f2-tenglash';

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
const states = [st(10, 10, 3, 8), st(11, 20, 6, 16), st(12, 5, 5, 4), st(20, 4, 4, 4), st(21, -3, -1, -3)];

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

  it('o‘z narxi yo‘q ish (F2 summasi resurslarda): summa — rs smeta summasining ish ulushi, 0 to‘qilmaydi', () => {
    const h = new Map(holat); h.set(10, { ...st(10, 10, 3, 8, null), f2_narx: 0 }); h.set(11, { ...st(11, 20, 6, 16), smeta_summa: 2000 });
    const r = obyektF2Reja(guruhlar(), h);
    expect(r.qatorlar[0].summa).toBe(1000); // 2000 × 5/10
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
