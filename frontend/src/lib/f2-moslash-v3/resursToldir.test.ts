/**
 * F2 import: qo'shimcha ish (BL) aktga kirganda uning resurslari ham kirishi shart (2026-11-18 prod audit xatosi).
 * SINTETIK fikstura - real nom/summa yo'q.
 */
import { describe, expect, it } from 'vitest';
import type { F2Tugun } from '../smeta-anatomiya/f2';
import { f2Indeks, type IshJoyi } from './ishJoyi';
import { f2QoralamaYozish } from '../f2-ishchi-qoralama';
import { exactWrite } from '../f2-exact-write';
import { ijniAlmashtir, rejaliBuyruqQosh, rejaliniYoz, type RejaliBuyruq } from './rejali';
import { resursToldir, type ToldirSmetaQator } from './resursToldir';

let fu = 0;
function f(tur: F2Tugun['tur'], kod: string | null, nom: string, birlik: string | null, hajm: number | null, bolalar: F2Tugun[] = [], summa: number | null = hajm): F2Tugun {
  const u = `SINT!${++fu}`;
  return { uid: u, tur, kod, nom, birlik, hajm, narx: null, summa, manzil: { fayl: 'sint.xlsx', varaq: 'SINT', qator: fu }, yol: [], bolalar, barg: !bolalar.length };
}

const bosh = (): IshJoyi => ({ bog: new Map(), otkaz: new Set() });
const OTA_RZ = 500; // smetadagi bo'lim
const sabab = { sabab: 's', resurslar: [] };

function fixtura() {
  const rs = [f('rs', 'R1', 'RESURS 1', 'M3', 10, [], 100), f('rs', 'R2', 'RESURS 2', 'CHEL-CH', 4, [], 40), f('rs', 'R3', 'RESURS 3', 'M2', 6, [], 60)];
  const bl = f('bl', 'E1', 'YANGI ISH', 'M3', 2, rs, null);
  const rz = { ...f('rz', null, 'BOLIM', null, null, [bl]), barg: false };
  return { rs, bl, ind: f2Indeks([rz]) };
}

/** guruhniTashla bilan bir xil: ish + F2 resurslari bitta rejali buyruq (kind: additional, tur: bl). */
function buyruqQosh(bl: F2Tugun, rs: F2Tugun[]) {
  const b = { ...sabab, kind: 'additional', tur: 'bl', otaQatorId: OTA_RZ, nom: bl.nom, birlik: 'M3', hajm: 2, operationId: 'op-1',
    resurslar: rs.map((r) => ({ tur: 'mat' as const, nom: r.nom, birlik: r.birlik ?? 'sht', hajm: r.hajm })) } as Omit<RejaliBuyruq, 'tempId' | 'resursTempIds' | 'f2Uid' | 'f2ResursUidlar'>;
  return rejaliBuyruqQosh([], bosh(), { uid: bl.uid, tur: 'bl', bolalar: rs }, b);
}

/** Serverdan keyingi smeta: yangi ish (qoshimcha) + 3 ta bola (qatorlari norma/narx bilan). */
const smetaDan = (blId: number, bolaIdlar: number[]): ToldirSmetaQator[] => [
  { id: blId, ota_id: OTA_RZ, tur: 'bl', hajm: 2, narx: null, qoshimcha: true },
  ...bolaIdlar.map((id, i) => ({ id, ota_id: blId, tur: 'mat', hajm: [10, 4, 6][i], narx: [5, 7, 9][i], norma: [5, 2, 3][i], qoshimcha: true })),
];

describe('F2 import - qo\'shimcha ish va uning resurslari aktga birga tushadi', () => {
  it('BL + 3 RS: rejali yozilgach akt qatorlarida ish ham, 3 resurs ham bor', async () => {
    const { bl, rs, ind } = fixtura();
    const { buyruq, ij } = buyruqQosh(bl, rs);
    expect(buyruq.resursTempIds).toHaveLength(3);
    const natija = await rejaliniYoz([buyruq], {
      yarat: async () => ({ qatorId: 900, resursIdlar: [901, 902, 903] }), versiya: async () => 1,
    });
    expect(natija.xato).toBeUndefined();
    const yozish = f2QoralamaYozish(ind, ijniAlmashtir(ij, natija.map));
    expect(yozish.toxtatish).toEqual([]);
    const rows = exactWrite(yozish.nodes, yozish.mapping);
    expect(rows.map((r) => r.qatorId).sort()).toEqual([900, 901, 902, 903]);
    const t = resursToldir(rows, smetaDan(900, [901, 902, 903]));
    expect(t.bloklovchi).toEqual([]);
    expect(t.qoshiladi).toEqual([]); // hammasi F2 hujjatining o'z qatorlari bilan kirgan
  });

  it('server javobi qisqa (resurs id lari yo\'q): bolalar zaxira o\'qish bilan bog\'lanadi', async () => {
    const { bl, rs, ind } = fixtura();
    const { buyruq, ij } = buyruqQosh(bl, rs);
    const natija = await rejaliniYoz([buyruq], {
      yarat: async () => ({ qatorId: 900, resursIdlar: [] }), versiya: async () => 1,
      bolalar: async (id) => (id === 900 ? [901, 902, 903] : []),
    });
    const yozish = f2QoralamaYozish(ind, ijniAlmashtir(ij, natija.map));
    const rows = exactWrite(yozish.nodes, yozish.mapping);
    expect(rows.map((r) => r.qatorId).sort()).toEqual([900, 901, 902, 903]);
  });

  it('zaxira ham yo\'q: vaqtinchalik id aktga tushadi - yozish BLOKLANADI (jim tashlanmaydi)', async () => {
    const { bl, rs, ind } = fixtura();
    const { buyruq, ij } = buyruqQosh(bl, rs);
    const natija = await rejaliniYoz([buyruq], { yarat: async () => ({ qatorId: 900, resursIdlar: [] }), versiya: async () => 1 });
    const yozish = f2QoralamaYozish(ind, ijniAlmashtir(ij, natija.map));
    const rows = exactWrite(yozish.nodes, yozish.mapping);
    expect(rows.some((r) => r.qatorId < 0)).toBe(true);
    const t = resursToldir(rows, smetaDan(900, [901, 902, 903]));
    expect(t.bloklovchi.join(' ')).toMatch(/vaqtinchalik id/);
  });

  it('ish aktda, resurslari F2 hujjatida yo\'q: norma x ish hajmi, smeta narxi, manba avto_resurs', () => {
    const rows = [{ qatorId: 900, certifiedQuantity: 2, priceIntentionallyAbsent: true }];
    const t = resursToldir(rows, smetaDan(900, [901, 902, 903]));
    expect(t.bloklovchi).toEqual([]);
    expect(t.qoshiladi.map((q) => [q.qatorId, q.certifiedQuantity, q.certifiedUnitPrice, q.certifiedAmount, q.manba])).toEqual([
      [901, 10, 5, 50, 'avto_resurs'], [902, 4, 7, 28, 'avto_resurs'], [903, 6, 9, 54, 'avto_resurs'],
    ]);
  });

  it('F2 qatori bor resurs qayta qo\'shilmaydi; zamena qilingan asl bola hisobga olinmaydi; hajmi aniqlanmasa - blok', () => {
    const smeta: ToldirSmetaQator[] = [
      ...smetaDan(900, [901, 902]),
      { id: 903, ota_id: 900, tur: 'mat', hajm: null, narx: 3, norma: null, qoshimcha: true },
      { id: 904, ota_id: 900, tur: 'mat', hajm: 1, narx: 3, norma: 1, qoshimcha: true },
      { id: 905, ota_id: 500, tur: 'mat', hajm: 1, narx: 3, zamena: true, replaces_line_id: 904 },
    ];
    const rows = [{ qatorId: 900, certifiedQuantity: 2, priceIntentionallyAbsent: true }, { qatorId: 901, certifiedQuantity: 10, certifiedUnitPrice: 5, certifiedAmount: 50, priceIntentionallyAbsent: false }];
    const t = resursToldir(rows, smeta);
    expect(t.qoshiladi.map((q) => q.qatorId)).toEqual([902]); // 901 bor, 904 almashtirilgan
    expect(t.bloklovchi.join(' ')).toMatch(/#903/);
  });

  it('asl smeta ishi (qo\'shimcha emas) resursi tushmagan bo\'lsa - faqat ogohlantirish, avtomatik qo\'shilmaydi', () => {
    const smeta: ToldirSmetaQator[] = [
      { id: 10, ota_id: 500, tur: 'bl', hajm: 2, narx: null },
      { id: 11, ota_id: 10, tur: 'mat', hajm: 4, narx: 5, norma: 2 },
    ];
    const t = resursToldir([{ qatorId: 10, certifiedQuantity: 2, priceIntentionallyAbsent: true }], smeta);
    expect(t.qoshiladi).toEqual([]);
    expect(t.bloklovchi).toEqual([]);
    expect(t.ogohlantirish).toHaveLength(1);
  });
});
