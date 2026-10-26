import { describe, expect, it } from 'vitest';
import type { PQator } from './pereraschet';
import { faktJurnalHavola, faktPereraschetHisobla, faktPozitsiya, farqYuk, qaytaYuk, stornoYuk } from './pereraschet-fakt';
import { pereraschetFaktXlsx } from './pereraschet-export';

// Sun'iy (to'qima) ma'lumot — real obyekt raqamlari yo'q.
const Q = (id: number, ota: number | null, tur: string, p: Partial<PQator> = {}): PQator => ({
  qator_id: id, ota_id: ota, tur, kod: `K${id}`, nom: `Qator ${id}`, birlik: 'м3', kat: tur === 'mat' ? 'МАТ' : tur === 'rs' ? 'ЧЕЛ' : null,
  smeta_hajm: 10, smeta_narx: 1000, fakt_hajm: 0, f2_hajm: 0, f2_summa: 0, f2_summa_nomalum: 0, almashtirilgan_hajm: 0, fakt_manbasi: 'DIRECT', ...p,
});
const O = { eski: false, qoshimcha: false, bolimId: 1, bolimYol: ['R'], ajdodlar: [1] };

describe('fakt asosidagi pozitsiya', () => {
  it('arzon F2 olingan, fakt to‘liq: kerak = fakt × smeta narx, farq = kerak − olingan', () => {
    const p = faktPozitsiya(Q(5, 2, 'mat', { f2_hajm: 10, f2_summa: 4000, fakt_hajm: 10 }), O)!;
    expect(p.boglangan).toBe(true);
    expect([p.kerak, p.f2Summa, p.farq]).toEqual([10000, 4000, 6000]);
  });

  it('smetadan oshgan fakt pulga kirmaydi (eslatma); almashtirilgan hajm chegarani kamaytiradi', () => {
    const p = faktPozitsiya(Q(5, 2, 'mat', { f2_hajm: 2, f2_summa: 2000, fakt_hajm: 14, almashtirilgan_hajm: 3 }), O)!;
    expect(p.hisobFakt).toBe(7);
    expect(p.tashqariHajm).toBe(7);
    expect(p.eslatma).toContain('smetadan_tashqari');
    expect(p.farq).toBe(5000);
  });

  it('fakti yo‘q, F2 olingan — to‘liq minus va «faktsiz F2» belgisi', () => {
    const p = faktPozitsiya(Q(5, 2, 'rs', { f2_hajm: 3, f2_summa: 2500 }), O)!;
    expect(p.faktsizF2).toBe(true);
    expect(p.farq).toBe(-2500);
  });

  it('NULL ≠ 0: smeta narxi NULL yoki F2 summasi noma’lum — tekshirish, pulga kirmaydi', () => {
    const a = faktPozitsiya(Q(5, 2, 'mat', { smeta_narx: null, f2_hajm: 2, f2_summa: 900, fakt_hajm: 5 }), O)!;
    expect(a.tekshir).toEqual(['narx_yoq']);
    expect([a.hisobda, a.farq, a.kerak]).toEqual([false, 0, 0]);
    const b = faktPozitsiya(Q(5, 2, 'mat', { f2_hajm: 2, f2_summa: 900, f2_summa_nomalum: 1, fakt_hajm: 5 }), O)!;
    expect(b.tekshir).toEqual(['f2_summa_nomalum']);
    expect(b.hisobda).toBe(false);
  });

  it('narx 0 = 0: kerak 0, olingan to‘liq minus', () => {
    const p = faktPozitsiya(Q(5, 2, 'mat', { smeta_narx: 0, f2_hajm: 2, f2_summa: 300, fakt_hajm: 2 }), O)!;
    expect([p.hisobda, p.kerak, p.farq]).toEqual([true, 0, -300]);
  });

  it('smetaga bog‘lanmagan: eski bo‘lim, smetada hajm yo‘q, F2 importida qo‘shilgan narxsiz qator — to‘liq minus', () => {
    expect(faktPozitsiya(Q(5, 2, 'mat', { f2_hajm: 4, f2_summa: 800, fakt_hajm: 4 }), { ...O, eski: true })!.boglanmaganSabab).toBe('eski_smeta');
    const b = faktPozitsiya(Q(5, 2, 'mat', { smeta_hajm: 0, f2_hajm: 4, f2_summa: 800 }), O)!;
    expect([b.boglangan, b.boglanmaganSabab, b.farq]).toEqual([false, 'smeta_hajm_yoq', -800]);
    const c = faktPozitsiya(Q(5, 2, 'mat', { smeta_narx: null, f2_hajm: 4, f2_summa: 800, fakt_hajm: 1 }), { ...O, qoshimcha: true })!;
    expect([c.boglanmaganSabab, c.hisobda, c.farq]).toEqual(['qoshimcha_narxsiz', true, -800]);
    expect(c.eslatma).toContain('fakt_bor_smetada_yoq');
    // bog'lanmagan, F2 olinmagan — ro'yxatga kirmaydi
    expect(faktPozitsiya(Q(5, 2, 'mat', { smeta_hajm: null, fakt_hajm: 3 }), O)).toBeNull();
  });

  it('chegirma (manfiy smeta) — tekshirish; mashinist mehnati va ish (bl) chiqariladi', () => {
    expect(faktPozitsiya(Q(5, 2, 'mat', { smeta_hajm: -5, f2_hajm: -2, f2_summa: -2000 }), O)!.tekshir).toEqual(['chegirma']);
    expect(faktPozitsiya(Q(5, 2, 'rs', { nom: 'ЗАТРАТЫ ТРУДА МАШИНИСТОВ', f2_hajm: 9, f2_summa: 9 }), O)).toBeNull();
    expect(faktPozitsiya(Q(5, 2, 'bl', { f2_hajm: 9, f2_summa: 9 }), O)).toBeNull();
  });
});

describe('fakt asosidagi pereraschet — butun obyekt', () => {
  const rows: PQator[] = [
    Q(1, null, 'rz', { nom: 'Uchastka 1' }), Q(2, 1, 'bl'),
    Q(3, 2, 'mat', { f2_hajm: 10, f2_summa: 4000, fakt_hajm: 10 }), // +6000
    Q(4, 2, 'rs', { f2_hajm: 6, f2_summa: 6600, fakt_hajm: 5 }), // 5000 − 6600 = −1600
    Q(5, 2, 'rs', { f2_hajm: 2, f2_summa: 1500 }), // faktsiz: −1500
    Q(6, 2, 'mat', { f2_hajm: 4, f2_summa: 4400, fakt_hajm: 4 }), // narx farqi faqat: 4000 − 4400 = −400 (hajm farqi 0)
    Q(7, 2, 'mat', { fakt_hajm: 3 }), // olinmagan: +3000
    Q(8, null, 'rz', { nom: 'Qurilish (ekspertizagacha)' }), Q(9, 8, 'bl'),
    Q(10, 9, 'mat', { f2_hajm: 5, f2_summa: 2000 }), // eski: −2000
    Q(11, 1, 'bl', { smeta_narx: null }),
    Q(12, 11, 'mat', { smeta_narx: null, f2_hajm: 7, f2_summa: 700 }), // qoshimcha (ota bl): −700
    Q(13, 2, 'mat', { smeta_narx: null, f2_hajm: 1, f2_summa: 100, fakt_hajm: 1 }), // tekshirish
  ];
  const n = faktPereraschetHisobla(rows, { qoshimchaIdlar: new Set([11]) });

  it('jami: kerak, olingan, plus/minus, bog‘lanmagan va tekshirish', () => {
    expect(n.jami).toEqual({ kerak: 22000, olingan: 19200, olinganBoglanmagan: 2700, plus: 9000, minus: 6200, sof: 2800, soni: 7 });
    expect(n.boglanmagan.map((p) => p.qatorId)).toEqual([10, 12]);
    expect(n.tekshirish.map((p) => p.qatorId)).toEqual([13]);
    expect(n.tekshirOlingan).toBe(100);
    expect(n.faktsizF2.map((p) => p.qatorId)).toEqual([5]);
    expect(n.bolimlar.find((b) => b.bolimId === 8)).toMatchObject({ olingan: 2000, sof: -2000 });
  });

  it('(a) to‘liq storno + qayta = (b) faqat farq (jami bir xil)', () => {
    const s = stornoYuk(n); const q = qaytaYuk(n); const f = farqYuk(n);
    expect(s.jami).toBe(-n.jami.olingan);
    expect(q.jami).toBe(n.jami.kerak);
    expect(s.jami + q.jami).toBe(n.jami.sof);
    expect(f.jami + f.sigmadi.summa).toBe(n.jami.sof);
    expect(n.jami.kerak - n.jami.olingan).toBe(n.jami.plus - n.jami.minus);
    // hajm farqi 0 (faqat narx farqi: 3 — arzon olingan, 6 — qimmat) — (b) qoralamaga sig'maydi (server hajm ≠ 0 talab
    // qiladi), alohida ko'rsatiladi; (a) da esa to'liq ifodalanadi.
    expect(f.sigmadi).toEqual({ soni: 2, summa: 5600, idlar: [3, 6] });
    // storno — barcha olingan qatorlar manfiy hajm bilan; qayta — faqat bog'langan, fakti bor
    expect(s.qatorlar.every((x) => x.certifiedQuantity < 0)).toBe(true);
    expect(q.qatorlar.map((x) => x.qatorId).sort((a, b) => a - b)).toEqual([3, 4, 6, 7]);
    for (const x of [...s.qatorlar, ...q.qatorlar, ...f.qatorlar]) expect(Math.abs(x.certifiedQuantity * x.certifiedUnitPrice - x.certifiedAmount)).toBeLessThan(0.006);
  });

  it('razdel filtri', () => {
    expect(faktPereraschetHisobla(rows, { bolimId: 8 }).hisobda.map((p) => p.qatorId)).toEqual([10]);
  });

  it('Excel: ikki varaq (storno + farq), formulalar bor', () => {
    const x = pereraschetFaktXlsx(n, { obyektNomi: 'Sinov', ndsFoiz: 12, ustamali: { kerak: 30000, olingan: 29000, plus: 12000, minus: 11000 }, sana: '2026-10-26' });
    expect(x.bytes.length).toBeGreaterThan(1000);
    expect(x.yacheykalar).toBeGreaterThan(10);
    expect(x.faylNomi).toMatch(/ПЕРЕРАСЧЁТ/);
  });

  it('fakt jurnali havolasi', () => {
    expect(faktJurnalHavola(7, 3)).toBe('/admin/fakt?obyekt=7&filtr=faktsiz_f2&bolim=3');
  });
});
