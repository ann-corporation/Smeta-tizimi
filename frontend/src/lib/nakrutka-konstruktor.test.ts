import { describe, expect, it } from 'vitest';
import { kategoriyaKf, nakrutkaKaskadJS, NAKRUTKA_KATLAR, type KatSummalar } from './nakrutka-podval';
import { podvalHisobla, podvalKf, podvalTekshir, standartPodval, standartmi, podvalBelgilanganSumma, yangiKod, type Podval } from './nakrutka-konstruktor';

const NK = {
  ТРАНСПОРТ_МАТЕРИАЛ: 3.5, СКЛАДСКИЕ_МАТЕРИАЛ: 2, СКЛАДСКИЕ_МК: 0.75, ТРАНСПОРТ_КАБЕЛЬ: 1.5,
  ПРОЧИЕ_ПОДРЯДЧИК: 12, ТРАНСПОРТ_ОБОРУД: 1.2, ЗАГОТ_СКЛАД_ОБОРУД: 1.2, СТРАХОВАНИЕ: 0.5, РИСК: 0, НДС: 12,
};

function tasodifiy(seed: number): KatSummalar {
  let x = seed;
  const r = () => { x = (x * 1103515245 + 12345) % 2147483648; return Math.round((x / 2147483648) * 1e9) / 100; };
  return Object.fromEntries(NAKRUTKA_KATLAR.map((k) => [k, r()])) as KatSummalar;
}

describe('Nakrutka podval konstruktori', () => {
  it('standart podval — hozirgi kaskad bilan AYNAN (tiyingacha, 50 tasodifiy holat)', () => {
    const p = standartPodval(NK);
    expect(podvalTekshir(p)).toEqual([]);
    for (let i = 1; i <= 50; i++) {
      const s = tasodifiy(i);
      const eski = nakrutkaKaskadJS(s, NK);
      const yangi = podvalHisobla(p, s);
      for (const kod of Object.keys(yangi.qiymat)) expect(yangi.qiymat[kod]).toBe(eski[kod]);
      expect(yangi.vsego).toBe(eski.vsego);
    }
  });

  it('standart koeffitsientlar — kategoriyaKf bilan bir xil (БЕЗ СКЛАД — transport bor, ombor yo‘q)', () => {
    const a = podvalKf(standartPodval(NK));
    const b = kategoriyaKf(NK);
    for (const k of NAKRUTKA_KATLAR) expect(a[k]).toBeCloseTo(b[k], 12);
    expect(b['БЕЗ СКЛАД']).toBeLessThan(b.МАТ);
  });

  it('maxsus qator: vremenniy zdaniya — ИТОГО-2 dan 1.5 % (ИТОГО-3 ga qo‘shiladi)', () => {
    const p = standartPodval(NK);
    const i = p.qatorlar.findIndex((q) => q.kod === 'itogo2');
    const yangi: Podval = structuredClone(p);
    yangi.qatorlar.splice(i + 1, 0, { kod: 'vrem', nom: 'Временные здания и сооружения, %', tur: 'foiz', foiz: 1.5, baza: [{ qator: 'itogo2' }], izoh: 'по договору' });
    const it3 = yangi.qatorlar.find((q) => q.kod === 'itogo3')!;
    it3.baza = [...(it3.baza ?? []), { qator: 'vrem' }];
    expect(podvalTekshir(yangi)).toEqual([]);
    const s = tasodifiy(7);
    const eski = podvalHisobla(p, s);
    const n = podvalHisobla(yangi, s);
    expect(n.qiymat.vrem).toBe(Math.round(eski.qiymat.itogo2! * 1.5) / 100);
    expect(n.vsego!).toBeGreaterThan(eski.vsego!);
    expect(standartmi(yangi, NK)).toBe(false);
    expect(standartmi(p, NK)).toBe(true);
  });

  it('belgilangan summa qatori: ВСЕГО ga kiradi, Kf ga kirmaydi; noma’lum summa — ВСЕГО noma’lum (NULL ≠ 0)', () => {
    const p = standartPodval(NK);
    const q: Podval = structuredClone(p);
    const i = q.qatorlar.findIndex((x) => x.kod === 'itogo4');
    q.qatorlar.splice(i, 0, { kod: 'mob', nom: 'Мобилизация (фиксированная сумма)', tur: 'summa', summa: 1_000_000 });
    q.qatorlar[i + 1] = { ...q.qatorlar[i + 1], baza: [...(q.qatorlar[i + 1].baza ?? []), { qator: 'mob' }] };
    const s = tasodifiy(3);
    const n = podvalHisobla(q, s);
    const eski = podvalHisobla(p, s);
    expect(n.qiymat.itogo4! - eski.qiymat.itogo4!).toBeCloseTo(1_000_000, 2);
    expect(podvalKf(q)).toEqual(podvalKf(p));
    expect(podvalBelgilanganSumma(q)).toBe(1_000_000);
    q.qatorlar[i] = { ...q.qatorlar[i], summa: null };
    expect(podvalHisobla(q, s).vsego).toBeNull();
    expect(podvalBelgilanganSumma(q)).toBeNull();
  });

  it('tekshiruv: oldinga havola, takror kod, oxirgi qator jami emas', () => {
    const p: Podval = { versiya: 1, qatorlar: [
      { kod: 'a', nom: 'A', tur: 'foiz', foiz: 1, baza: [{ qator: 'b' }] },
      { kod: 'a', nom: 'A2', tur: 'summa', summa: 5 },
    ] };
    const x = podvalTekshir(p).map((e) => e.xabar);
    expect(x.some((m) => m.includes('YUQORIDAGI'))).toBe(true);
    expect(x.some((m) => m.includes('takrorlangan'))).toBe(true);
    expect(x.some((m) => m.includes('ВСЕГО'))).toBe(true);
    expect(yangiKod(standartPodval(NK))).toBe('qator_1');
  });
});
