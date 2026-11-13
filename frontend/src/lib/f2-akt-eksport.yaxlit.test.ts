import { describe, expect, it } from 'vitest';
import type { T2Qator } from '../api/supabase';
import type { F2Tafsilot } from '../api/t2-narx';
import type { F2HujjatKonteksti } from '../api/f2-hujjat-kontekst';
import { bahoMoliya, f2AktBaho, f2AktTayyorla } from './f2-akt-eksport';
import { f2Hujjat } from './f2-hujjat';
import { hujjatTekshir, summaSozBilan } from './hujjat-yozuvchi';

/**
 * Sinov (bronza VIP ART kabi): svod yaxlit belgili bo'lim ichidagi OB qatori. Imzolangan hujjat: ustama YO'Q, faqat QQS;
 * server `_t2_f2_ustamali` ham shunday (kesim.svod). Mijoz/real ma'lumot emas — sintetik raqamlar.
 */
const NK = { ТРАНСПОРТ_МАТЕРИАЛ: 5, СКЛАДСКИЕ_МАТЕРИАЛ: 2, СКЛАДСКИЕ_МК: 0.75, ТРАНСПОРТ_КАБЕЛЬ: 1.5, ПРОЧИЕ_ПОДРЯДЧИК: 18, ТРАНСПОРТ_ОБОРУД: 2, ЗАГОТ_СКЛАД_ОБОРУД: 1.2, СТРАХОВАНИЕ: 0.32, РИСК: 0, НДС: 12 };
const r = (id: number, ota: number | null, tur: string, nom: string, kat: string | null, hajm: number | null, narx: number | null, tartib: number) => ({
  id, obyekt_id: 1, obyekt: null, kompaniya_id: 1, ota_id: ota, daraja: null, tartib, tur, kod: null, nom, birlik: tur === 'rz' ? null : 'шт', hajm, narx, summa: null, kat,
  narx_usul: null, qoshimcha: false, zamena: false, d1: null, d2: null, d3: null, xom_qator: null, yangilandi: null, manba_id: null, versiya: 1, raqam: null, norma: null,
}) as unknown as T2Qator;

const SMETA: T2Qator[] = [
  r(10, null, 'rz', 'БРОНЗА', null, null, null, 1),
  r(11, 10, 'ob', 'ПЕРЕВОД В БРОНЗУ', 'ОБ', 1, 5803571.43, 2),
  r(20, null, 'rz', 'ОБЫЧНЫЙ', null, null, null, 3),
  r(21, 20, 'mat', 'МАТЕРИАЛ', 'МАТ', 10, 1000, 4),
];
const SVOD = { qqssiz: 5803571.43, barglar: 5803571.43, summasiz: 0, bolimlar: [{ id: 1, qator_id: 10, nom: 'БРОНЗА', svod_summa: 6500000, qqs_stavka: 12, qqssiz: 5803571.43, barglar: 5803571.43, asos: 'svod' as const, dalil: {} }] };
const CTX: F2HujjatKonteksti = { imzo: {}, shartnoma: null, nakrutka: NK, podval: null, svodYaxlit: SVOD };

function line(qid: number, hajm: number, narx: number, i: number): F2Tafsilot {
  const summa = Math.round(hajm * narx * 100) / 100;
  const q = SMETA.find((x) => x.id === qid)!;
  return { akt_id: 1, obyekt_id: 1, kompaniya_id: 1, tur: 'f2', oy: '2026-03-01', akt_holat: 'tasdiqlangan', raqam: '1', akt_kim: null, akt_sana: '2026-03-02', akt_qator_id: 100 + i, qator_id: qid,
    kod: null, nom: q.nom, birlik: q.birlik, kat: q.kat, qator_tur: q.tur, hajm, narx, summa, izoh: null, certified_quantity: hajm, certified_unit_price: narx, certified_amount: summa } as F2Tafsilot;
}
const tayyor = (lines: F2Tafsilot[], ctx = CTX) => f2AktTayyorla({ smeta: SMETA, lines, aktQatorlar: [], podvallar: new Map(), kontekst: ctx, akt: { id: 1, oy: '2026-03-01', raqam: '1', holat: 'tasdiqlangan' }, obyektNom: 'T', raqamlar: new Map() })!;

describe('F2 akti: svod yaxlit bo‘lim ichidagi qator ustamasiz (faqat QQS) — server va imzolangan hujjat bilan bir xil', () => {
  it('yadro bahosi: faqat bronza qatori → ustamali = ustamasiz, QQS bilan = ×1,12', () => {
    const t = tayyor([line(11, 1, 5803571.43, 0)]);
    const b = f2AktBaho(t, CTX);
    expect(b.ustamasiz).toBe(5803571.43);
    expect(b.ustamali).toBe(5803571.43);
    expect(b.qqsBilan).toBe(6500000);
    expect(bahoMoliya(b, 5803571.43).ustamali).toBe(5803571.43);
  });

  it('aralash akt: oddiy qator ustama bilan, bronza — ustamasiz', () => {
    const t = tayyor([line(11, 1, 5803571.43, 0), line(21, 10, 1000, 1)]);
    const b = f2AktBaho(t, CTX);
    const faqatOddiy = f2AktBaho(tayyor([line(21, 10, 1000, 0)]), CTX);
    expect(b.ustamali).toBeCloseTo(5803571.43 + (faqatOddiy.ustamali as number), 2);
  });

  it('storno (pereraschet) bloki: yaxlit qator minus ham ustamasiz — yangi blok bilan bir xil qoida', () => {
    const lines = [line(11, 1, 5803571.43, 0)];
    const aq = [{ qator_id: 11, certified_quantity: -1, certified_unit_price: 5803571.43, certified_amount: -5803571.43, raw_snapshot: { source: 'storno', stornoOf: 7 } }];
    const t = f2AktTayyorla({ smeta: SMETA, lines, aktQatorlar: aq as never, podvallar: new Map(), kontekst: CTX, akt: { id: 1, oy: '2026-03-01', raqam: '1', holat: 'tasdiqlangan' }, obyektNom: 'T', raqamlar: new Map([[7, '7']]) })!;
    expect(t.eskiBloklar.length).toBe(1);
    expect(t.eskiBloklar[0].kesim.yaxlitQator).toBeCloseTo(-5803571.43, 2);
    expect(t.eskiBloklar[0].kesim.summalar.ОБ ?? 0).toBe(0);
  });

  it('propis: «ВСЕГО К ОПЛАТЕ» katagidagi 2 xonaga yaxlitlangan qiymatdan olinadi', () => {
    const t = tayyor([line(11, 1, 5803571.43, 0)]);
    const h = f2Hujjat(t.bolimlar, t.qatorlar, t.opsiya);
    const matn = hujjatTekshir(h.bytes).matnlar.find((m) => m.startsWith('Сумма прописью'));
    expect(matn).toBe(`Сумма прописью: ${summaSozBilan(6500000)} с НДС`);
  });

  it('svod belgisi yo‘q obyekt — avvalgidek (ОБ ustama oladi)', () => {
    const t = tayyor([line(11, 1, 5803571.43, 0)], { ...CTX, svodYaxlit: null });
    const yoq: F2HujjatKonteksti = { ...CTX, svodYaxlit: null };
    const b = f2AktBaho(t, yoq);
    expect(b.ustamali).toBeGreaterThan(5803571.43);
  });

  it('Excel Ф-2: ВСЕГО К ОПЛАТЕ = ×1,12 (ustamasiz), ИТОГО прямые o‘zgarmaydi', () => {
    const t = tayyor([line(11, 1, 5803571.43, 0)]);
    const h = f2Hujjat(t.bolimlar, t.qatorlar, t.opsiya);
    expect(h.jami).toBe(5803571.43);
    const vs = hujjatTekshir(h.bytes).varaqlar[0].kataklar.map((k) => Number(k.v)).filter((x) => Number.isFinite(x));
    expect(vs).toContain(6500000);
    expect(vs).not.toContain(Math.round(5803571.43 * 1.02326 * 1.12 * 100) / 100);
  });

  it('Excel Ф-2 (qoralama, tirik formulalar): yaxlit qator J ustunida SVOD belgisi — SUMIF ustama qo‘shmaydi', () => {
    const t = tayyor([line(11, 1, 5803571.43, 0)]);
    const h = f2Hujjat(t.bolimlar, t.qatorlar, { ...t.opsiya, formulasiz: false });
    const vs = hujjatTekshir(h.bytes).varaqlar[0].kataklar.map((k) => Number(k.v)).filter((x) => Number.isFinite(x));
    expect(vs).toContain(6500000);
  });
});
