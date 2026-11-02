import { describe, expect, it } from 'vitest';
import type { T2Qator } from '../api/supabase';
import { jurnalQur, ochiqBor, qoldiqUlushi } from './fakt-jurnal';
import { bajarilmadiTaklif } from './fakt-studio';
import { ochiqdanOrtiqcha, ochiqQoldiq, qoldiqHajmi } from './zamena-qoldiq';

const q = (o: Partial<T2Qator> & { id: number; tur: string }): T2Qator => ({
  obyekt_id: 1, obyekt: null, kompaniya_id: 1, ota_id: null, daraja: 0, tartib: o.id, kod: null, nom: 'n', birlik: 'м3',
  hajm: null, narx: null, summa: null, kat: null, narx_usul: null, qoshimcha: false, zamena: false,
  d1: null, d2: null, d3: null, xom_qator: null, yangilandi: null, manba_id: null, versiya: 1, ...o,
} as T2Qator);

describe('yagona «ochiq qoldiq» formulasi', () => {
  it('fakt rejimi: smeta − fakt − almashtirilgan − bajarilmaydi', () => {
    expect(ochiqQoldiq({ smeta: 100, fakt: 40, almashtirilgan: 30, bajarilmaydi: 10 })).toBe(20);
    expect(ochiqQoldiq({ smeta: 100, fakt: 40 })).toBe(60);
    expect(ochiqQoldiq({ smeta: 100, fakt: 0, f2: 90 }, 'fakt')).toBe(100); // F2 fakt rejimida ayrilmaydi
  });
  it('F2 rejimi: smeta − F2 − almashtirilgan (bajarilmaydi ayrilmaydi) — qoldiqHajmi bilan bir xil', () => {
    expect(ochiqQoldiq({ smeta: 100, fakt: 99, f2: 20, almashtirilgan: 30, bajarilmaydi: 10 }, 'f2')).toBe(50);
    expect(qoldiqHajmi(100, 20, 30)).toBe(50);
  });
  it('NULL ≠ 0: smeta noma’lum — null', () => {
    expect(ochiqQoldiq({ smeta: null, fakt: 5 })).toBeNull();
    expect(ochiqQoldiq({ smeta: undefined }, 'f2')).toBeNull();
    expect(qoldiqHajmi(null, 0, 5)).toBeNull();
  });
  it('chegirma (manfiy smeta): yopilgan hajm smeta ishorasida ayriladi', () => {
    expect(ochiqQoldiq({ smeta: -10, fakt: -4, bajarilmaydi: 2 })).toBe(-4);
  });
  it('ortiqcha: kiritmadan keyingi jami ochiq qoldiqdan oshsa musbat; aks holda 0; smeta yo‘q — null', () => {
    expect(ochiqdanOrtiqcha({ smeta: 100, fakt: 90, almashtirilgan: 30 })).toBe(20);
    expect(ochiqdanOrtiqcha({ smeta: 100, fakt: 60, almashtirilgan: 30, bajarilmaydi: 10 })).toBe(0);
    expect(ochiqdanOrtiqcha({ smeta: -10, fakt: -12 })).toBe(2);
    expect(ochiqdanOrtiqcha({ smeta: null, fakt: 1 })).toBeNull();
  });
  it('«bajarilmaydi» taklifi ham shu formuladan (zamena ayriladi, manfiy emas)', () => {
    expect(bajarilmadiTaklif(100, 40, 10, 30)).toBe(20);
    expect(bajarilmadiTaklif(100, 90, 0, 30)).toBe(0);
  });

  it('jurnal: ustun, 25/50/100% va filtr — bitta qiymat (zamena + bajarilmaydi bor qatorda 100% ortiqcha bermaydi)', () => {
    const rows = [q({ id: 1, tur: 'rz' }), q({ id: 2, tur: 'bl', ota_id: 1, hajm: 100 }), q({ id: 3, tur: 'bl', ota_id: 1, hajm: 10 })];
    const states = [
      { qator_id: 2, smeta_hajm: 100, fakt_hajm: 40, almashtirilgan_hajm: 30 },
      { qator_id: 3, smeta_hajm: 10, fakt_hajm: 4 },
    ];
    const { bolimIshlari } = jurnalQur(rows, states, null, new Map([[2, 10], [3, 6]]));
    const [a, b] = bolimIshlari.get(1)!;
    expect(a).toMatchObject({ qoldiq: 20, almashtirilgan: 30, bajarilmaydi: 10 });
    expect(qoldiqUlushi(a, 100)).toBe('20');
    expect(qoldiqUlushi(a, 50)).toBe('10');
    expect(ochiqdanOrtiqcha({ smeta: a.smeta, fakt: a.fakt + 20, almashtirilgan: a.almashtirilgan, bajarilmaydi: a.bajarilmaydi })).toBe(0);
    expect(ochiqBor(a)).toBe(true);
    // Qolgani butunlay «bajarilmaydi» — ochiq 0: filtrda yashiriladi, %-tugma yo'q.
    expect(b.qoldiq).toBe(0);
    expect(ochiqBor(b)).toBe(false);
    expect(qoldiqUlushi(b, 100)).toBeNull();
  });
  it('ochiqBor: smeta noma’lum — yashirilmaydi; manfiy reja ishorasi bilan', () => {
    expect(ochiqBor({ qoldiq: null })).toBe(true);
    expect(ochiqBor({ qoldiq: -3, smeta: -5 })).toBe(true);
    expect(ochiqBor({ qoldiq: -3, smeta: 5 })).toBe(false);
  });
});
