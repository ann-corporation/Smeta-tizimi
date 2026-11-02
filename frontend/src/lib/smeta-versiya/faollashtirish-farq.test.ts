import { describe, expect, it } from 'vitest';
import { faollashtirishFarqi, type FPozitsiya, type VQator } from './faollashtirish-farq';
import type { MoslikQator } from './turlar';

/* Sintetik: eski smeta — ИШ БИР (10 м3: ЦЕМЕНТ 1000) + ИШ ИККИ (5 м2: ГВОЗДИ 500); eski ЦЕМЕНТ da tasdiqlangan F2 4 м3 / 400.
   Yangi (faol) — ИШ БИР 8 м3 (ЦЕМЕНТ 800) + ИШ УЧ 3 м3 (ПЕСОК 300). */
const eski: VQator[] = [
  { id: 1, ota_id: null, tur: 'rz', kat: null, hajm: null, narx: null, summa: 1500 },
  { id: 2, ota_id: 1, tur: 'bl', kat: null, hajm: 10, narx: null, summa: 1000 },
  { id: 3, ota_id: 2, tur: 'rs', kat: 'МАТ', hajm: 10, narx: 100, summa: 1000 },
  { id: 4, ota_id: 1, tur: 'bl', kat: null, hajm: 5, narx: null, summa: 500 },
  { id: 5, ota_id: 4, tur: 'rs', kat: 'МАТ', hajm: 5, narx: 100, summa: 500 },
  { id: 6, ota_id: 4, tur: 'rs', kat: 'МАТ', hajm: 2, narx: null, summa: null },
];
const yangi: VQator[] = [
  { id: 11, ota_id: null, tur: 'rz', kat: null, hajm: null, narx: null, summa: 1100 },
  { id: 12, ota_id: 11, tur: 'bl', kat: null, hajm: 8, narx: null, summa: 800 },
  { id: 13, ota_id: 12, tur: 'rs', kat: 'МАТ', hajm: 8, narx: 100, summa: 800 },
  { id: 14, ota_id: 11, tur: 'bl', kat: null, hajm: 3, narx: null, summa: 300 },
  { id: 15, ota_id: 14, tur: 'rs', kat: 'ЧЕЛ', hajm: 3, narx: 100, summa: 300 },
];
const poz = (id: number, qatorId: number, kod: string, nom: string, hajm: number): FPozitsiya => ({
  id, versiya_id: 9, tartib: id, ls_kod: null, ls_nom: 'ЭСКИ', razdel: 'РАЗДЕЛ', blok: null, raqam: null, kod, nom, birlik: 'М3', hajm, resurslar: null,
  manba: { qator_id: qatorId, tur: 'bl' },
});
const mos = (id: number, pozitsiya_id: number | null, qator_id: number | null, holat: MoslikQator['holat'], eski_hajm: number | null, joriy_hajm: number | null): MoslikQator => ({
  id, versiya_id: 9, pozitsiya_id, qator_id, holat, ishonch: 100, usul: 'kod_nom_birlik', birlik_farq: false, eski_hajm, joriy_hajm,
  joriy_kod: null, joriy_nom: qator_id === 14 ? 'ИШ УЧ' : null, joriy_birlik: null, tasdiq: 'avto', qaror: 'kutilmoqda', qurilgan_hajm: null, qaror_izoh: null, qaror_vaqt: null, versiya: 1,
});

describe('faollashtirishFarqi — eski (almashtirilgan) ↔ joriy (faol) smeta', () => {
  const r = faollashtirishFarqi({
    pozitsiyalar: [poz(101, 2, 'E1-1', 'ИШ БИР', 10), poz(102, 4, 'E2-2', 'ИШ ИККИ', 5)],
    mosliklar: [mos(1, 101, 12, 'kamaygan', 10, 8), mos(2, 102, null, 'ochirilgan', 5, null), mos(3, null, 14, 'yangi', null, 3)],
    eskiQatorlar: eski, yangiQatorlar: yangi, f2: [{ qator_id: 3, f2_hajm: 4, f2_summa: 400 }, { qator_id: 2, f2_hajm: 4, f2_summa: 0 }],
  });

  it('jamilar: eski va joriy alohida (qo‘shilmaydi), farq = joriy − eski; kategoriya kesimi barg qatorlardan', () => {
    expect(r.jami.eski).toBe(1500);
    expect(r.jami.yangi).toBe(1100);
    expect(r.jami.farq).toBe(-400);
    const jamla = (k: { summalar: Record<string, number> }) => Object.values(k.summalar).reduce((s, x) => s + x, 0);
    expect(jamla(r.jami.eskiKesim)).toBe(1500);
    expect(jamla(r.jami.yangiKesim)).toBe(1100);
    expect(jamla(r.jami.farqKesim)).toBe(-400);
    expect(r.jami.eskiNarxsiz).toBe(1);
    expect(r.jami.yangiNarxsiz).toBe(0);
    expect(r.jami.holatlar.kamaygan).toBe(1);
    expect(r.jami.holatlar.ochirilgan).toBe(1);
    expect(r.jami.holatlar.yangi).toBe(1);
  });

  it('pozitsiya: eski va joriy hajm / narx / summa, farq', () => {
    const k = r.qatorlar.find((q) => q.mosId === 1)!;
    expect(k.eski).toEqual({ hajm: 10, narx: 100, summa: 1000 });
    expect(k.yangi).toEqual({ hajm: 8, narx: 100, summa: 800 });
    expect(k.farq).toBe(-200);
    const o = r.qatorlar.find((q) => q.mosId === 2)!;
    expect(o.yangi).toBeNull();
    expect(o.farq).toBe(-500);
    const y = r.qatorlar.find((q) => q.mosId === 3)!;
    expect(y.eski).toBeNull();
    expect(y.farq).toBe(300);
    expect(y.nom).toBe('ИШ УЧ');
  });

  it('eski qatordagi F2 (ish + resurslari) va pereraschet ishorasi: eski F2 minus, joriy narxda plus', () => {
    const k = r.qatorlar.find((q) => q.mosId === 1)!;
    expect(k.f2).toEqual({ hajm: 4, summa: 400 });
    expect(k.pereraschet).toEqual({ minus: 400, plus: 400, ortiqchaHajm: 0 });
    expect(r.jami.f2Summa).toBe(400);
    expect(r.jami.minus).toBe(400);
    expect(r.jami.plus).toBe(400);
    expect(r.qatorlar.find((q) => q.mosId === 2)!.pereraschet).toBeNull();
  });

  it('F2 hajmi yangi hajmdan oshsa — plus yangi hajmgacha, ortiqcha alohida; o‘chirilgan pozitsiyada plus 0', () => {
    const r2 = faollashtirishFarqi({
      pozitsiyalar: [poz(101, 2, 'E1-1', 'ИШ БИР', 10), poz(102, 4, 'E2-2', 'ИШ ИККИ', 5)],
      mosliklar: [mos(1, 101, 12, 'kamaygan', 10, 8), mos(2, 102, null, 'ochirilgan', 5, null)],
      eskiQatorlar: eski, yangiQatorlar: yangi,
      f2: [{ qator_id: 2, f2_hajm: 9, f2_summa: 0 }, { qator_id: 3, f2_hajm: 9, f2_summa: 900 }, { qator_id: 4, f2_hajm: 2, f2_summa: 0 }, { qator_id: 5, f2_hajm: 2, f2_summa: 200 }],
    });
    expect(r2.qatorlar[0].pereraschet).toEqual({ minus: 900, plus: 800, ortiqchaHajm: 1 });
    expect(r2.qatorlar[1].pereraschet).toEqual({ minus: 200, plus: 0, ortiqchaHajm: 2 });
    expect(r2.jami.minus).toBe(1100);
    expect(r2.jami.plus).toBe(800);
  });

  it('narxsiz yangi qator: plus noma’lum (0 deb to‘qilmaydi)', () => {
    const r3 = faollashtirishFarqi({
      pozitsiyalar: [poz(101, 2, 'E1-1', 'ИШ БИР', 10)],
      mosliklar: [mos(1, 101, 12, 'kamaygan', 10, 8)],
      eskiQatorlar: eski, yangiQatorlar: yangi.map((q) => (q.id === 12 ? { ...q, summa: null } : q)),
      f2: [{ qator_id: 2, f2_hajm: 4, f2_summa: 0 }, { qator_id: 3, f2_hajm: 4, f2_summa: 400 }],
    });
    expect(r3.qatorlar[0].pereraschet).toEqual({ minus: 400, plus: null, ortiqchaHajm: 0 });
    expect(r3.qatorlar[0].farq).toBeNull();
    expect(r3.jami.plusNomalum).toBe(1);
  });
});
