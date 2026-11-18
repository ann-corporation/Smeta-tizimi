import { describe, expect, it } from 'vitest';
import { hamilton, tugunDaraxti, tugunSummalari, tugunSummalariXom, ustamaBor, type TugunQator, type UstamaKirish } from './tugun-summa';
import { svodKorinishKesimi } from './svod-yaxlit';
import { qiymatUchligi, ustamaliHisobla } from './ustamali-summa';
import { yaxlit2 } from './hisob-yadro';

/** Sintetik fixture (haqiqiy nom/summa yo'q): 2 razdel, 3 ish, har ishda resurs barglari; bitta minus F-2 qatori. */
const NK = { ТРАНСПОРТ_МАТЕРИАЛ: 5, СКЛАДСКИЕ_МАТЕРИАЛ: 2, СКЛАДСКИЕ_МК: 0.75, ТРАНСПОРТ_КАБЕЛЬ: 1.5, ПРОЧИЕ_ПОДРЯДЧИК: 18, ТРАНСПОРТ_ОБОРУД: 2, ЗАГОТ_СКЛАД_ОБОРУД: 1.2, СТРАХОВАНИЕ: 0.32, РИСК: 0, НДС: 12 };
const UST: UstamaKirish = { koeffitsientlar: NK as never, podval: null, svodYaxlit: null };

let id = 0;
const q = (tur: string, ota: number | null, kat: string | null, smeta: number | null, fakt: number | null, f2: number | null): TugunQator => ({ id: ++id, ota_id: ota, tur, kat, smeta, fakt, f2 });

function fixture(): TugunQator[] {
  id = 0;
  const rows: TugunQator[] = [];
  const rz = (ota: TugunQator[]) => ota;
  // Razdel 1
  const r1 = q('rz', null, null, 0, 0, 0); rows.push(r1);
  const b1 = q('bl', r1.id, null, 0, 0, 0); rows.push(b1);
  rows.push(q('rs', b1.id, 'ЧЕЛ', 1_000_000, 400_000, 250_000), q('mat', b1.id, 'МАТ', 3_000_000, 1_200_000, 900_000), q('rs', b1.id, 'МАШ', 500_000, 100_000, 100_000));
  const b2 = q('bl', r1.id, null, 0, 0, 0); rows.push(b2);
  rows.push(q('mat', b2.id, 'МАТ', 2_000_000, 0, 0), q('ob', b2.id, 'ОБ', 800_000, 800_000, -50_000)); // minus F-2: ishora saqlanadi
  // Razdel 2
  const r2 = q('rz', null, null, 0, 0, 0); rows.push(r2);
  const b3 = q('bl', r2.id, null, 0, 0, 0); rows.push(b3);
  rows.push(q('mat', b3.id, 'МАТ', 4_500_000, 1_500_000, 1_500_000), q('rs', b3.id, 'ЧЕЛ', 1_250_000, 625_000, 625_000));
  // Tugun summalari - serverning yig'indisi (rollup): bl = barglar, rz = bl lar.
  const sum = (n: TugunQator, k: 'smeta' | 'fakt' | 'f2'): number => {
    const ch = rows.filter((x) => x.ota_id === n.id);
    return ch.reduce((t, x) => t + ((x.tur === 'bl' ? sum(x, k) : x[k]) ?? 0), 0);
  };
  for (const n of rows.filter((x) => x.tur === 'bl')) { n.smeta = sum(n, 'smeta'); n.fakt = sum(n, 'fakt'); n.f2 = sum(n, 'f2'); }
  for (const n of rows.filter((x) => x.tur === 'rz')) { n.smeta = sum(n, 'smeta'); n.fakt = sum(n, 'fakt'); n.f2 = sum(n, 'f2'); }
  void rz;
  return rows;
}

describe('tugunSummalari - yagona yadro, uch shakl', () => {
  it('har RZ/BL tuguni uchun uchlik; QQS bilan >= ustamali >= ustamasiz; barglarga tegmaydi', () => {
    const rows = fixture();
    const m = tugunSummalari(rows, UST);
    expect([...m.keys()].sort()).toEqual(rows.filter((x) => x.tur === 'rz' || x.tur === 'bl').map((x) => x.id).sort());
    for (const t of m.values()) for (const k of ['smeta', 'fakt', 'f2'] as const) {
      const u = t[k];
      if (u.ustamasiz != null && u.ustamasiz > 0) { expect(u.ustamali).not.toBeNull(); expect(u.qqsBilan! >= u.ustamali!).toBe(true); expect(u.ustamali! >= u.ustamasiz).toBe(true); }
    }
  });

  it('ustamali = yadro (kf QQS ni o\'z ichiga oladi, SUMMA x kf / 1.12): qo\'lda kesim bilan bir xil', () => {
    const rows = fixture();
    const bl = rows.find((x) => x.tur === 'bl')!;
    const leaves = rows.filter((x) => x.ota_id === bl.id);
    const daraxt = rows.map((x) => ({ id: x.id, ota_id: x.ota_id }));
    const kesim = svodKorinishKesimi(daraxt, leaves, { id: (x) => x.id, kat: (x) => x.kat, summa: (x) => x.smeta, smeta: (x) => x.smeta }, null, { jami: bl.smeta, masshtab: true, f2: false });
    const kutilgan = qiymatUchligi(ustamaliHisobla(kesim, NK as never, null), bl.smeta);
    expect(tugunSummalari(rows, UST).get(bl.id)!.smeta).toEqual(kutilgan);
    expect(kutilgan.ustamali).not.toBeNull();
    expect(kutilgan.qqsBilan).toBeCloseTo(kutilgan.ustamali! * 1.12, 1);
  });

  it('minus F-2 qatori ishorasi saqlanadi; F-2 yo\'q qator 0 emas, null', () => {
    const rows = fixture();
    const b2 = rows.filter((x) => x.tur === 'bl')[1];
    const t = tugunSummalari(rows, UST).get(b2.id)!;
    expect(t.f2.ustamasiz).toBe(-50_000);
    expect(t.f2.ustamali!).toBeLessThan(0);
    const bosh = [q('rz', null, null, null, null, null)];
    const e = tugunSummalari(bosh, UST).get(bosh[0].id)!;
    expect(e.smeta.ustamasiz).toBeNull(); expect(e.smeta.sabab).toBe('SUMMA_YOQ');
  });

  it('ustama manbai yo\'q: faqat ustamasiz, ustamali/QQS bilan null (0 emas)', () => {
    const rows = fixture();
    expect(ustamaBor(null)).toBe(false);
    expect(ustamaBor({ koeffitsientlar: null, podval: null, svodYaxlit: null })).toBe(false);
    const t = [...tugunSummalari(rows, null).values()][0];
    expect(t.smeta.ustamasiz).not.toBeNull();
    expect(t.smeta.ustamali).toBeNull(); expect(t.smeta.qqsBilan).toBeNull();
  });
});

describe('RECONCILIATION: tugunlar yig\'indisi === obyekt jami, TIYINGACHA (Hamilton taqsimoti)', () => {
  const SHAKL = ['ustamasiz', 'ustamali', 'qqsBilan'] as const;
  const KOR = ['smeta', 'fakt', 'f2'] as const;

  it('obyekt -> RZ: har ko\'rinish va shakl uchun aynan teng', () => {
    const rows = fixture();
    const d = tugunDaraxti(rows, UST);
    const rzlar = rows.filter((x) => x.tur === 'rz');
    for (const k of KOR) for (const sh of SHAKL) expect(yaxlit2(rzlar.reduce((t, x) => t + (d.tugunlar.get(x.id)![k][sh] ?? 0), 0))).toBe(d.obyekt[k][sh]);
  });

  it('RZ -> BL: har RZ o\'z BL lari yig\'indisiga aynan teng', () => {
    const rows = fixture();
    const d = tugunDaraxti(rows, UST);
    for (const rz of rows.filter((x) => x.tur === 'rz')) {
      const bl = rows.filter((x) => x.ota_id === rz.id && x.tur === 'bl');
      for (const k of KOR) for (const sh of SHAKL) expect(yaxlit2(bl.reduce((t, x) => t + (d.tugunlar.get(x.id)![k][sh] ?? 0), 0))).toBe(d.tugunlar.get(rz.id)![k][sh]);
    }
  });

  it('obyekt jami = butun daraxt yadro natijasi (bir marta yaxlitlangan), taqsimot uni o\'zgartirmaydi', () => {
    const rows = fixture();
    const leaves = rows.filter((x) => x.tur !== 'rz' && x.tur !== 'bl');
    const daraxt = rows.map((x) => ({ id: x.id, ota_id: x.ota_id }));
    const jami = rows.filter((x) => x.tur === 'rz').reduce((t, x) => t + (x.smeta ?? 0), 0);
    const kesim = svodKorinishKesimi(daraxt, leaves, { id: (x) => x.id, kat: (x) => x.kat, summa: (x) => x.smeta, smeta: (x) => x.smeta }, null, { jami, masshtab: true, f2: false });
    expect(tugunDaraxti(rows, UST).obyekt.smeta).toEqual(qiymatUchligi(ustamaliHisobla(kesim, NK as never, null), jami));
  });

  it('har tugun o\'z yaxlitlangan qiymatidan bir necha tiyindan (<= 5) ortiq farq qilmaydi va ishorasi o\'zgarmaydi (minus qator saqlanadi)', () => {
    const rows = fixture();
    const xom = tugunSummalariXom(rows, UST);
    const d = tugunDaraxti(rows, UST);
    for (const [id, t] of d.tugunlar) for (const k of KOR) for (const sh of SHAKL) {
      const a = t[k][sh], b = xom.get(id)![k][sh];
      if (a == null || b == null) { expect(a).toBe(b); continue; }
      expect(Math.abs(a - b)).toBeLessThanOrEqual(0.05);
      if (b !== 0) expect(Math.sign(a)).toBe(Math.sign(b));
    }
    const b2 = rows.filter((x) => x.tur === 'bl')[1];
    expect(d.tugunlar.get(b2.id)!.f2.ustamali!).toBeLessThan(0);
  });

  it('hamilton: tiyinlar eng katta kasr qoldig\'iga; yig\'indi aynan; ishora almashmaydi; yaroqsiz kirish null', () => {
    expect(hamilton(10, [3.33, 3.33, 3.34])).toEqual([333, 333, 334]);
    expect(hamilton(10.01, [3.33, 3.33, 3.34])!.reduce((a, b) => a + b, 0)).toBe(1001);
    expect(hamilton(-0.03, [-0.01, -0.01, -0.01])).toEqual([-1, -1, -1]);
    const r = hamilton(100, [-0.2, 50.2, 50.0])!; // minus og'irlik minusligicha qoladi
    expect(r.reduce((a, b) => a + b, 0)).toBe(10000); expect(r[0]).toBeLessThanOrEqual(0);
    expect(hamilton(5, [1, -1])).toBeNull(); // og'irliklar yig'indisi 0
    expect(hamilton(5, [])).toBeNull();
  });

  it('tasodifiy daraxtlar (100 ta, urug\'li): har ota = bolalar yig\'indisi, tiyingacha, ishora saqlanadi', () => {
    let s = 12345; const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    for (let it = 0; it < 100; it++) {
      id = 0;
      const rows: TugunQator[] = [];
      const kats = ['ЧЕЛ', 'МАШ', 'МАТ', 'ОБ'];
      const nrz = 1 + Math.floor(rnd() * 4);
      for (let a = 0; a < nrz; a++) {
        const rz = q('rz', null, null, 0, 0, 0); rows.push(rz);
        const nbl = 1 + Math.floor(rnd() * 5);
        for (let b = 0; b < nbl; b++) {
          const bl = q('bl', rz.id, null, 0, 0, 0); rows.push(bl);
          const nl = 1 + Math.floor(rnd() * 4);
          for (let l = 0; l < nl; l++) {
            const sm = Math.round(rnd() * 5_000_000) / 100 * 100 / 100;
            rows.push(q(rnd() > 0.5 ? 'mat' : 'rs', bl.id, kats[Math.floor(rnd() * 4)], sm, Math.round(rnd() * sm * 100) / 100, rnd() > 0.85 ? -Math.round(rnd() * sm * 50) / 100 : Math.round(rnd() * sm * 100) / 100));
          }
        }
      }
      const tot = (n: TugunQator, k: 'smeta' | 'fakt' | 'f2'): number => rows.filter((x) => x.ota_id === n.id).reduce((t, x) => t + ((x.tur === 'bl' ? tot(x, k) : x[k]) ?? 0), 0);
      for (const n of rows.filter((x) => x.tur === 'bl')) { n.smeta = tot(n, 'smeta'); n.fakt = tot(n, 'fakt'); n.f2 = tot(n, 'f2'); }
      for (const n of rows.filter((x) => x.tur === 'rz')) { n.smeta = tot(n, 'smeta'); n.fakt = tot(n, 'fakt'); n.f2 = tot(n, 'f2'); }
      const d = tugunDaraxti(rows, UST); const xom = tugunSummalariXom(rows, UST);
      const rzlar = rows.filter((x) => x.tur === 'rz');
      for (const k of KOR) for (const sh of ['ustamali', 'qqsBilan'] as const) {
        if (d.obyekt[k][sh] == null) continue;
        expect(yaxlit2(rzlar.reduce((t, x) => t + (d.tugunlar.get(x.id)![k][sh] ?? 0), 0))).toBe(d.obyekt[k][sh]);
        for (const rz of rzlar) {
          const bl = rows.filter((x) => x.ota_id === rz.id && x.tur === 'bl');
          expect(yaxlit2(bl.reduce((t, x) => t + (d.tugunlar.get(x.id)![k][sh] ?? 0), 0))).toBe(d.tugunlar.get(rz.id)![k][sh]);
        }
        for (const [nid, t] of d.tugunlar) { const a = t[k][sh], b = xom.get(nid)![k][sh]; if (a != null && b != null && b !== 0) expect(Math.sign(a)).toBe(Math.sign(b)); }
      }
    }
  });
});