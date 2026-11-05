import { describe, expect, it } from 'vitest';
import type { T2Qator } from '../api/supabase';
import { almashtirilganHajmlar, ochiqQoldiq, zamenaProgress, type ZamenaQator } from './zamena-qoldiq';
import { qoldiqUlushi } from './fakt-jurnal';
import { stornoQaytarHajm } from './f2-storno';
import { f2Qur, ulushHajm, type F2Holat } from './f2-tayyor';

/*
 * Sintetik fixture (SQL acceptance 20261203000000 bilan bir xil): asl A (100), zamena R (A ni almashtiradi, almashtirish_hajm 40),
 * qo'shimcha D. F2#1 (tasdiqlangan): R = 40, D = 10. Qoralama F2#2: storno bloki −R, −D.
 */
const A = 1, R = 2, D = 3;
const qoralama = [
  { qator_id: R, certified_quantity: -40, raw_snapshot: { source: 'storno', stornoOf: 11 } },
  { qator_id: D, certified_quantity: -10, raw_snapshot: { source: 'storno', stornoOf: 11 } },
];
const stornoKut = new Map([...stornoQaytarHajm(qoralama)].map(([k, v]) => [k, -v] as const)); // qoralamadagi storno (ishorali)
const zamenaQatorlar = (faktR: number | null): ZamenaQator[] => [
  { id: A, tur: 'bl', birlik: 'm3', hajm: 100, f2Hajm: 0 },
  { id: R, tur: 'bl', birlik: 'm3', hajm: 40, change_type: 'REPLACEMENT', replaces_line_id: A, almashtirish_hajm: 40,
    progress: zamenaProgress({ f2Tasdiq: 40, stornoKutilayotgan: stornoKut.get(R), fakt: faktR }) },
];
const q = (o: Partial<T2Qator> & { id: number; tur: string }): T2Qator => ({ obyekt_id: 8, ota_id: 9, tartib: o.id, kod: null, nom: 'q' + o.id, birlik: 'м3', hajm: null, narx: null, ...o } as T2Qator);
const rows = [q({ id: 9, tur: 'rz', ota_id: null }), q({ id: A, tur: 'bl', hajm: 100 }), q({ id: R, tur: 'bl', hajm: 40 }), q({ id: D, tur: 'bl', hajm: 10 })];

describe('pereraschet: stornolangan zamena aslni qulflamaydi', () => {
  it('R va D sof olingan 0; A 100% ochiq; A ga 60% fakt → plyus blokda 60', () => {
    expect(stornoKut.get(R)).toBe(-40);
    const alm = almashtirilganHajmlar(zamenaQatorlar(null)); // fakt R — NULL (yozuv yo'q)
    expect(alm.get(A)).toBeUndefined(); // A yopilmagan
    const ochiq = ochiqQoldiq({ smeta: 100, fakt: 0, almashtirilgan: alm.get(A) ?? null }, 'fakt');
    expect(ochiq).toBe(100);
    const faktA = Number(qoldiqUlushi({ qoldiq: ochiq, smeta: 100 }, 60));
    expect(faktA).toBe(60);
    // F2 tayyorlash (qoralama F2#2): tasdiqlangan F2 R=40, D=10; fakt R=0, D=0, A=60.
    const holat: F2Holat[] = [
      { qator_id: A, fakt_hajm: faktA, f2_hajm: 0, f2_mumkin_hajm: faktA, smeta_hajm: 100 },
      { qator_id: R, fakt_hajm: 0, f2_hajm: 40, f2_mumkin_hajm: 0, smeta_hajm: 40 },
      { qator_id: D, fakt_hajm: 0, f2_hajm: 10, f2_mumkin_hajm: 0, smeta_hajm: 10 },
    ];
    const b = f2Qur(rows, holat, undefined, 'fakt', undefined, { stornoQaytar: stornoQaytarHajm(qoralama) });
    const ishlar = new Map(b.flatMap((x) => x.ishlar).map((i) => [i.id, i]));
    expect(ishlar.get(A)).toMatchObject({ mumkin: 60, olingan: 0 });
    expect(ulushHajm(ishlar.get(A)!.mumkin, 100)).toBe('60');
    expect(ishlar.has(R)).toBe(false); // fakti 0 — sof olingan 0, F2 ga olinadigan narsa yo'q
    expect(ishlar.has(D)).toBe(false);
    // Fakti bor D stornodan keyin qayta olinadi (o'z fakti bo'yicha), «olingan 0 (storno qilingan 10)».
    const b2 = f2Qur(rows, holat.map((h) => (h.qator_id === D ? { ...h, fakt_hajm: 8 } : h)), undefined, 'fakt', undefined, { stornoQaytar: stornoQaytarHajm(qoralama) });
    expect(b2.flatMap((x) => x.ishlar).find((i) => i.id === D)).toMatchObject({ mumkin: 8, olingan: 0, storno: 10 });
  });

  it('teskari holat: R kuchda (fakti bor) — A yopiq qoladi', () => {
    const alm = almashtirilganHajmlar(zamenaQatorlar(40));
    expect(alm.get(A)).toBe(40);
    const ochiq = ochiqQoldiq({ smeta: 100, fakt: 0, almashtirilgan: alm.get(A) }, 'fakt');
    expect(ochiq).toBe(60);
    expect(qoldiqUlushi({ qoldiq: ochiq, smeta: 100 }, 60)).toBe('36');
  });

  it('storno qoralamasi yo‘q — tasdiqlangan F2 bilan R kuchda (eski xatti-harakat)', () => {
    const z = zamenaQatorlar(null); z[1].progress = zamenaProgress({ f2Tasdiq: 40, fakt: null });
    expect(almashtirilganHajmlar(z).get(A)).toBe(40);
    expect(zamenaProgress({ f2Tasdiq: 40, stornoKutilayotgan: -40, fakt: 0 })).toBe(0);
    expect(zamenaProgress({ f2Tasdiq: 0, fakt: null })).toBe(0); // hech bajarilmagan rejali zamena aslni yopmaydi
  });
});
