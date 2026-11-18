import { describe, expect, it } from 'vitest';
import type { T2Qator } from '../api/supabase';
import { f2Hujjat } from './f2-hujjat';
import { bosKiritma, f2Qatorlar, f2Qur, type F2Holat } from './f2-tayyor';
import { hujjatTekshir } from './hujjat-yozuvchi';
import { matJoyBogla } from './mat-joy';

const q = (o: Partial<T2Qator> & { id: number; tur: string; norma?: number | null }): T2Qator => ({
  obyekt_id: 8, obyekt: null, kompaniya_id: 1, ota_id: null, daraja: 0, tartib: o.id, kod: null, nom: `q${o.id}`, birlik: 'м3',
  hajm: null, narx: null, summa: null, kat: null, narx_usul: null, qoshimcha: false, zamena: false,
  d1: null, d2: null, d3: null, xom_qator: null, yangilandi: null, manba_id: null, versiya: 1, ...o,
} as T2Qator);

/** Sintetik «СТЕНЫ» namunasi (real tuzilma, raqamlar to'qilgan): karkas BL + teskari BL + mat razdel ostida. */
const rows: T2Qator[] = [
  q({ id: 1, tur: 'rz', nom: 'СТЕНЫ' }),
  q({ id: 10, tur: 'bl', ota_id: 1, kod: 'E6-2-11-3', nom: 'ИЗГОТОВЛЕНИЕ ПЛОСКИХ И ОБЪЕМНЫХ АРМАТУРНЫХ КАРКАСОВ', birlik: 'Т', hajm: 9.5 }),
  q({ id: 11, tur: 'rs', ota_id: 10, kat: 'ЧЕЛ', nom: 'ЗАТРАТЫ ТРУДА', birlik: 'ЧЕЛ-Ч', norma: 2, narx: 1000 }),
  q({ id: 12, tur: 'bl', ota_id: 1, kod: 'E6-1-97-1', nom: 'УСТАНОВКА АРМАТУРЫ/ИСКЛЮЧИТЬ ЗАТ/ТРУДА/', birlik: 'Т', hajm: -9.5 }),
  q({ id: 20, tur: 'mat', ota_id: 1, kod: 'С124-10-8', kat: 'МАТ', nom: 'АРМАТУРАЯ ДЛЯ КОЛОННА', birlik: 'Т', hajm: 9.5, narx: 5000 }),
  q({ id: 30, tur: 'bl', ota_id: 1, kod: 'E6-1-34-9', nom: 'УСТРОЙСТВО ПЕРЕМЫЧЕК', birlik: '100М3', hajm: 0.0028 }),
  q({ id: 31, tur: 'rs', ota_id: 30, kat: 'ЧЕЛ', nom: 'ЗАТРАТЫ ТРУДА', birlik: 'ЧЕЛ-Ч', norma: 4, narx: 1000 }),
  q({ id: 40, tur: 'mat', ota_id: 1, kod: 'С124-6-2', kat: 'МАТ', nom: 'АРМАТУРАЯ ДЛЯ ПЕРЕМЫЧКА', birlik: 'Т', hajm: 0.07, narx: 5000 }),
  q({ id: 50, tur: 'mat', ota_id: 1, kod: 'ЦЕНА', kat: 'МАТ', nom: 'КИРПИЧ', birlik: 'ШТ', hajm: 100, narx: 10 }),
];

describe('mat-joy: razdel darajasidagi mat -> o‘z BL', () => {
  it('hajm teng (ishorasi bilan) — aniq; teskari ishorali BL ga emas', () => {
    const j = matJoyBogla(rows);
    expect(j.get(20)).toMatchObject({ blId: 10, manba: 'avto', shubhali: false, sabab: 'hajm' });
  });
  it('nom o‘zagi (ПЕРЕМЫЧ) — hajm mos emas, lekin bitta nomzod', () => {
    expect(matJoyBogla(rows).get(40)).toMatchObject({ blId: 30, sabab: 'nom', shubhali: false });
  });
  it('dalil yo‘q — bog‘lanmaydi (joyida qoladi)', () => {
    expect(matJoyBogla(rows).has(50)).toBe(false);
  });
  it('noaniq: bir nechta nomzod — eng yaqin oldingi, shubhali', () => {
    const r2 = [
      q({ id: 1, tur: 'rz' }),
      q({ id: 2, tur: 'bl', ota_id: 1, nom: 'КЛАДКА СТЕН', birlik: 'М3', hajm: 5 }),
      q({ id: 3, tur: 'bl', ota_id: 1, nom: 'КЛАДКА СТЕН', birlik: 'М3', hajm: 5 }),
      q({ id: 4, tur: 'mat', ota_id: 1, nom: 'КИРПИЧ', birlik: 'М3', hajm: 5 }),
    ];
    expect(matJoyBogla(r2).get(4)).toMatchObject({ blId: 3, shubhali: true, nomzodlar: 2 });
  });
  it('qo‘lda tanlov avto qoidadan ustun; null — joyida; boshqa razdel BL i yaroqsiz', () => {
    expect(matJoyBogla(rows, new Map([[20, 30]])).get(20)).toMatchObject({ blId: 30, manba: 'qol' });
    expect(matJoyBogla(rows, new Map([[20, null]])).has(20)).toBe(false);
    expect(matJoyBogla(rows, new Map([[20, 999]])).has(20)).toBe(false);
  });
  it('asl qatorlar o‘zgarmaydi (kirish mutatsiyasiz)', () => {
    const before = JSON.stringify(rows);
    matJoyBogla(rows);
    expect(JSON.stringify(rows)).toBe(before);
  });
});

describe('mat-joy: F-2 hujjat — tartib o‘zgaradi, jami o‘zgarmaydi', () => {
  const holat: F2Holat[] = rows.filter((r) => r.tur !== 'rz').map((r) => ({ qator_id: r.id, f2_mumkin_hajm: Math.abs(Number(r.hajm ?? 1)) || 1 }));
  const yoz = (qol?: Map<number, number | null>) => {
    const b = f2Qur(rows, holat);
    const k = bosKiritma();
    for (const r of rows) if (r.tur === 'bl' || r.tur === 'mat') k.hajm[r.id] = String(Math.abs(Number(r.hajm ?? 0)));
    const qs = f2Qatorlar(b, k);
    const r = f2Hujjat(b, qs, { obyektNom: 'Sinov', davr: '2026-10-01', raqam: '1', ndsFoiz: 12, rows, matJoyQol: qol });
    const t = hujjatTekshir(r.bytes);
    const v = t.varaqlar.find((x) => x.nom === 'Ф-2')!;
    const matn = (ref: string) => v.kataklar.find((c) => c.ref === ref)?.matn ?? '';
    const qatorlar = new Map<number, string>();
    for (const c of v.kataklar) if (c.ref.startsWith('C')) qatorlar.set(Number(c.ref.slice(1)), c.matn ?? '');
    return { r, qatorlar, matn };
  };
  const joyi = (m: Map<number, string>, s: string) => [...m.entries()].find(([, x]) => x.includes(s))?.[0] ?? -1;

  it('mat o‘z BL ning RS laridan keyin; oldin razdel oxirida edi', () => {
    const yoq = yoz(new Map([[20, null], [40, null]]));
    const bor = yoz();
    // Oldin: КОЛОННА mat ПЕРЕМЫЧЕК BL dan keyin (razdel oxiri); endi — КАРКАС BL dan keyin, ПЕРЕМЫЧЕК BL dan oldin.
    expect(joyi(yoq.qatorlar, 'КОЛОННА')).toBeGreaterThan(joyi(yoq.qatorlar, 'ПЕРЕМЫЧЕК'));
    expect(joyi(bor.qatorlar, 'КОЛОННА')).toBeLessThan(joyi(bor.qatorlar, 'ПЕРЕМЫЧЕК'));
    expect(joyi(bor.qatorlar, 'КОЛОННА')).toBeGreaterThan(joyi(bor.qatorlar, 'КАРКАС'));
  });
  it('invariant: barcha pul kataklari yig‘indisi oldin = keyin', () => {
    const jami = (x: ReturnType<typeof yoz>) => {
      const v = hujjatTekshir(x.r.bytes).varaqlar.find((s) => s.nom === 'Ф-2')!;
      return v.kataklar.filter((c) => c.ref.startsWith('H') && c.v != null && c.v !== '' && Number.isFinite(Number(c.v))).map((c) => Number(c.v)).sort((a, b) => a - b);
    };
    const yoq = jami(yoz(new Map([[20, null], [40, null]])));
    const bor = jami(yoz());
    expect(bor).toEqual(yoq);
    expect(bor.length).toBeGreaterThan(0);
  });
});
