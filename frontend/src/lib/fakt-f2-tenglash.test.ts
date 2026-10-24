import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { T2Qator } from '../api/supabase';
import { jurnalQur, type JurnalHolat } from './fakt-jurnal';
import { bolimIshlariYigish, faktF2Reja } from './fakt-f2-tenglash';

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
