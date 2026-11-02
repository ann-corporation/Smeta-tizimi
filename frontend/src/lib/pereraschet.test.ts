import { describe, expect, it } from 'vitest';
import { pereraschetBolimlari, pereraschetHisobla, qatorTasnif, tuzatuvchiYuk, type PQator } from './pereraschet';
import { pereraschetXlsx } from './pereraschet-export';

const Q = (id: number, ota: number | null, tur: string, p: Partial<PQator> = {}): PQator => ({
  qator_id: id, ota_id: ota, tur, kod: `K${id}`, nom: `Qator ${id}`, birlik: 'м3', kat: tur === 'mat' ? 'МАТ' : tur === 'rs' ? 'ЧЕЛ' : null,
  smeta_hajm: 10, smeta_narx: 1000, fakt_hajm: 0, f2_hajm: 0, f2_summa: 0, f2_summa_nomalum: 0, almashtirilgan_hajm: 0, fakt_manbasi: 'DIRECT', ...p,
});
const O = { eski: false, zamena: false, bolimId: 1, bolimYol: ['R'], ajdodlar: [1] };

describe('pereraschet tasnifi', () => {
  it('ortiqcha olingan: (F2 − smeta) × smeta narx — minus', () => {
    const r = qatorTasnif(Q(5, 2, 'mat', { f2_hajm: 12, f2_summa: 12000, fakt_hajm: 12 }), O)!;
    expect(r.hisobda).toBe(true);
    expect(r.bandlar).toEqual([{ tur: 'ortiqcha', hajm: -2, summa: -2000 }]);
    expect(r.sof).toBe(-2000);
    expect(r.eslatma).not.toContain('smetadan_tashqari'); // fakt = F2: smetadan oshgan qism allaqachon F2 da (minus)
  });

  it('narx farqi: F2 qimmatroq — qaytarish, arzonroq — olish', () => {
    expect(qatorTasnif(Q(5, 2, 'mat', { f2_hajm: 5, f2_summa: 5500, fakt_hajm: 5 }), O)!.bandlar).toEqual([{ tur: 'narx_farqi', hajm: 0, summa: -500 }]);
    expect(qatorTasnif(Q(5, 2, 'mat', { f2_hajm: 5, f2_summa: 4800, fakt_hajm: 5 }), O)!.bandlar).toEqual([{ tur: 'narx_farqi', hajm: 0, summa: 200 }]);
  });

  it('olinmay qolgan: fakt > F2 — plyus, smetadan oshgani kirmaydi; BL norma fakt belgilanadi', () => {
    const r = qatorTasnif(Q(5, 2, 'rs', { f2_hajm: 4, f2_summa: 4000, fakt_hajm: 13, fakt_manbasi: 'BL_NORMA' }), O)!;
    expect(r.bandlar).toEqual([{ tur: 'olinmagan', hajm: 6, summa: 6000 }]);
    expect(r.eslatma).toEqual(expect.arrayContaining(['fakt_norma', 'smetadan_tashqari']));
    expect(r.tashqariHajm).toBe(3);
  });

  it('birlik shubhasi (F2/smeta > 5 yoki narx nisbati < 0,2) — pulga kirmaydi', () => {
    const a = qatorTasnif(Q(5, 2, 'mat', { f2_hajm: 80, f2_summa: 80000 }), O)!;
    expect(a.tekshir).toContain('birlik_shubha');
    expect(a.hisobda).toBe(false);
    const b = qatorTasnif(Q(5, 2, 'mat', { f2_hajm: 5, f2_summa: 500 }), O)!; // F2 narxi 100 / smeta 1000
    expect(b.tekshir).toContain('birlik_shubha');
  });

  it('narx NULL — pul to‘qilmaydi; smetada hajm 0 lekin F2 bor — tekshirish', () => {
    const a = qatorTasnif(Q(5, 2, 'mat', { smeta_narx: null, f2_hajm: 12, f2_summa: 0 }), O)!;
    expect(a.tekshir).toContain('narx_yoq');
    expect(a.bandlar).toEqual([]);
    expect(a.hisobda).toBe(false);
    const b = qatorTasnif(Q(5, 2, 'mat', { smeta_hajm: 0, f2_hajm: 3, f2_summa: 3000 }), O)!;
    expect(b.tekshir).toEqual(['smeta_hajm_yoq']);
    expect(b.hisobda).toBe(false);
  });

  it('narx 0 = 0: ortiqcha summasi 0 — band yo‘q', () => {
    expect(qatorTasnif(Q(5, 2, 'mat', { smeta_narx: 0, f2_hajm: 12, f2_summa: 0 }), O)).toBeNull();
  });

  it('F2 summasi noma’lum — narx farqi hisoblanmaydi (eslatma)', () => {
    const r = qatorTasnif(Q(5, 2, 'mat', { f2_hajm: 12, f2_summa: 9000, f2_summa_nomalum: 1 }), O)!;
    expect(r.bandlar.map((b) => b.tur)).toEqual(['ortiqcha']);
    expect(r.eslatma).toContain('narx_farqi_hisoblanmadi');
  });

  it('mashinist mehnati va ish (bl) qatorlari chiqariladi', () => {
    expect(qatorTasnif(Q(5, 2, 'rs', { nom: 'ЗАТРАТЫ ТРУДА МАШИНИСТОВ', f2_hajm: 99, f2_summa: 1 }), O)).toBeNull();
    expect(qatorTasnif(Q(5, 2, 'bl', { f2_hajm: 99 }), O)).toBeNull();
  });
});

describe('chegirma (manfiy smeta, «исключать»)', () => {
  // Sun'iy ko'l holati: asosiy ish E27-6-2-17 to'liq olingan; chegirma E27-6-2-18 smeta −66,31, F2 −45,69 (69%).
  const rows: PQator[] = [
    Q(1, null, 'rz', { nom: '03-03 БЛОГОУСТРОЙСТВА' }),
    Q(2, 1, 'bl', { kod: 'E27-6-2-17', nom: 'Покрытие толщиной 4 см', smeta_hajm: 100, f2_hajm: 100 }),
    Q(3, 2, 'mat', { smeta_hajm: 100, f2_hajm: 100, f2_summa: 100000 }),
    Q(4, 1, 'bl', { kod: 'Е27-6-2-18 К=8', nom: 'ПРИ ИЗМЕНЕНИИ ТОЛЩИНЫ СЛОЯ НА 1 СМ ИСКЛЮЧАТЬ К НОРМЕ 27-6-2-17', smeta_hajm: -66.31, f2_hajm: -45.69 }),
    Q(5, 4, 'mat', { smeta_hajm: -66.31, smeta_narx: 1000, f2_hajm: -45.69, f2_summa: -45690 }),
    Q(6, 1, 'bl', { kod: 'E27-4-5-1 К=10', nom: 'Исключать', smeta_hajm: -8.87, f2_hajm: 0 }),
    Q(7, 6, 'mat', { smeta_hajm: -8.87, smeta_narx: 1000 }), // umuman olinmagan
    Q(8, null, 'rz', { nom: 'Boshqa' }),
    Q(9, 8, 'bl', { kod: 'X1', smeta_hajm: -5 }),
    Q(10, 9, 'mat', { smeta_hajm: -5, f2_hajm: -1, f2_summa: -1000 }), // asosiy ish yo'q
  ];

  it('soxta «ortiqcha» yo‘q: qo‘llanmagan chegirma (X − Y) × smeta — MINUS', () => {
    const n = pereraschetHisobla(rows);
    const q5 = n.qatorlar.find((q) => q.qatorId === 5)!;
    expect(q5.bandlar.map((b) => b.tur)).toEqual(['chegirma']);
    expect(q5.bandlar[0].hajm).toBeCloseTo(-20.62, 6);
    expect(q5.bandlar[0].summa).toBe(-20620);
    expect(q5.chegirma?.asosiy?.qatorId).toBe(2);
    expect(n.turBoyicha.ortiqcha.minus).toBe(0);
  });

  it('F2 da umuman olinmagan chegirma ham hisobga kiradi (asosiy — oldingi musbat ish)', () => {
    const q7 = pereraschetHisobla(rows).qatorlar.find((q) => q.qatorId === 7)!;
    expect(q7.bandlar).toEqual([{ tur: 'chegirma', hajm: -8.87, summa: -8870 }]);
    expect(q7.hisobda).toBe(true);
  });

  it('chegirma ortiqcha qo‘llangan bo‘lsa — PLYUS', () => {
    const r = rows.map((x) => (x.qator_id === 2 ? { ...x, f2_hajm: 50 } : x));
    const q5 = pereraschetHisobla(r).qatorlar.find((q) => q.qatorId === 5)!;
    expect(q5.bandlar[0].summa).toBeCloseTo(12535, 0); // (0,5 − 0,689) × −66,31 × 1000
  });

  it('asosiy ish topilmasa — tekshirish, pulga kirmaydi', () => {
    const q10 = pereraschetHisobla(rows).qatorlar.find((q) => q.qatorId === 10)!;
    expect(q10.tekshir).toEqual(['chegirma_asosiy_yoq']);
    expect(q10.hisobda).toBe(false);
  });
});

describe('pereraschet butun obyekt', () => {
  const rows: PQator[] = [
    Q(1, null, 'rz', { nom: 'Uchastka 1' }), Q(2, 1, 'rz', { nom: 'Yer ishlari' }), Q(3, 2, 'bl'),
    Q(4, 3, 'mat', { f2_hajm: 12, f2_summa: 12000, fakt_hajm: 12 }), // −2000
    Q(5, 3, 'rs', { f2_hajm: 4, f2_summa: 4000, fakt_hajm: 8 }), // +4000
    Q(6, null, 'rz', { nom: 'Qurilish (ekspertizagacha)' }), Q(7, 6, 'bl'),
    Q(8, 7, 'mat', { f2_hajm: 12, f2_summa: 12000 }), // eski — tekshirish
    Q(9, 3, 'mat', { f2_hajm: 3, f2_summa: 3000, fakt_hajm: 5 }), // zamena asl — tekshirish
  ];

  it('jami, tur kesimi, razdel jamisi va tekshirish ajratiladi', () => {
    const n = pereraschetHisobla(rows, { aslIdlar: new Set([9]) });
    expect(n.jami).toEqual({ plus: 4000, minus: 2000, sof: 2000, soni: 2 });
    expect(n.hisobda.map((q) => q.qatorId)).toEqual([5, 4]);
    expect(n.tekshirish.map((q) => [q.qatorId, q.tekshir])).toEqual([[8, ['eski_smeta']], [9, ['zamena']]]);
    expect(n.bolimlar).toEqual([{ bolimId: 2, yol: ['Uchastka 1', 'Yer ishlari'], plus: 4000, minus: 2000, sof: 2000, soni: 2 }]);
    expect(n.plusKesim.summalar.ЧЕЛ).toBe(4000);
    expect(n.minusKesim.summalar.МАТ).toBe(2000);
    expect(n.tekshirTaxminiy.soni).toBe(2);
  });

  it('razdel filtri faqat avlodlarni oladi; razdellar ro‘yxati', () => {
    expect(pereraschetHisobla(rows, { bolimId: 6 }).qatorlar.map((q) => q.qatorId)).toEqual([8]);
    expect(pereraschetBolimlari(rows).map((b) => [b.id, b.daraja])).toEqual([[1, 0], [2, 1], [6, 0]]);
  });

  it('tuzatuvchi F2 yuki: minus — manfiy hajm, tekshirish qatorlari kirmaydi', () => {
    const n = pereraschetHisobla(rows, { aslIdlar: new Set([9]) });
    const yuk = tuzatuvchiYuk(n.qatorlar, new Set([4, 5, 8, 9]));
    expect(yuk.map((y) => [y.qatorId, y.certifiedQuantity, y.certifiedUnitPrice, y.certifiedAmount])).toEqual([[4, -2, 1000, -2000], [5, 4, 1000, 4000]]);
  });

  it('Excel: yasaladi, formulalar bor (token sanog‘i)', () => {
    const n = pereraschetHisobla(rows, { aslIdlar: new Set([9]) });
    const x = pereraschetXlsx(n, { obyektNomi: 'Sinov', ndsFoiz: 12, ustamali: { plus: 5000, minus: 2500 }, sana: '2026-10-25' });
    expect(x.bytes.length).toBeGreaterThan(1000);
    expect(x.yacheykalar).toBeGreaterThan(5);
    expect(x.faylNomi).toMatch(/ПЕРЕРАСЧЁТ/);
  });
});
