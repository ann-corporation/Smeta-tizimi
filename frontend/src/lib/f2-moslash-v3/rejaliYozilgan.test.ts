import { describe, expect, it } from 'vitest';
import { ijniAlmashtir, rejaliniYoz, rejaliniYozilganlardanTozala, type RejaliBuyruq, type YozilganQator } from './rejali';
import type { IshJoyi } from './ishJoyi';

const buyruq = (tempId: number, op: string, o: Partial<RejaliBuyruq> = {}): RejaliBuyruq => ({
  tempId, resursTempIds: [], f2Uid: 'u' + tempId, f2ResursUidlar: [], kind: 'additional', tur: 'bl', otaQatorId: 900, nom: 'Ish ' + tempId, birlik: 'm3', sabab: 's',
  resurslar: [], operationId: op, ...o,
});

describe('tiklangan qoralamada allaqachon yozilgan rejali buyruqlar (Stella dublikati)', () => {
  // Oldingi «F2 ni yozish» urinishi: bo'lim (-1) + 2 ish (-2 resurs -3,-4; -5) smetaga yozilgan, 4-qadam yiqilgan.
  const rejali = [
    buyruq(-1, 'op-bolim', { kind: 'bolim', tur: 'rz', otaQatorId: 0 }),
    buyruq(-2, 'op-A', { otaQatorId: -1, resursTempIds: [-3, -4], resurslar: [{ tur: 'mat', nom: 'm', birlik: 'kg' }, { tur: 'rs', nom: 'r', birlik: 'soat' }] }),
    buyruq(-5, 'op-B', { otaQatorId: -1 }),
    buyruq(-6, 'op-C', { otaQatorId: -1 }),            // bu hali yozilmagan
  ];
  const yozilgan: YozilganQator[] = [
    { id: 500, ota_id: null, operation_id: null, tur: 'rz', nom: 'Bo‘lim', tartib: 1 },
    { id: 501, ota_id: 500, operation_id: 'op-A', tur: 'bl', tartib: 1 },
    { id: 502, ota_id: 501, operation_id: 'x1', tur: 'mat', tartib: 1 },
    { id: 503, ota_id: 501, operation_id: 'x2', tur: 'rs', tartib: 2 },
    { id: 504, ota_id: 500, operation_id: 'op-B', tur: 'bl', tartib: 2 },
  ];

  it('bajarilganlar rejali ro‘yxatdan chiqadi, vaqtinchalik id lar haqiqiyga xaritalanadi (resurslar tartibida)', () => {
    const { qolgan, map } = rejaliniYozilganlardanTozala(rejali, yozilgan);
    expect(Object.fromEntries(map)).toEqual({ '-2': 501, '-3': 502, '-4': 503, '-5': 504, '-1': 500 });
    expect(qolgan.map((b) => b.tempId)).toEqual([-6]);
    expect(qolgan[0].otaQatorId).toBe(500);                    // yozilmagan buyruq ham haqiqiy bo'limga tayanadi
  });

  it('F2 qatorlari bog‘lanishi haqiqiy id ga o‘tadi', () => {
    const ij: IshJoyi = { bog: new Map([['f', { qatorId: -2, holat: 'qolda', usul: 'qolda' }], ['g', { qatorId: -6, holat: 'qolda', usul: 'qolda' }]]), otkaz: new Set() };
    const { map } = rejaliniYozilganlardanTozala(rejali, yozilgan);
    const y = ijniAlmashtir(ij, map);
    expect(y.bog.get('f')?.qatorId).toBe(501);
    expect(y.bog.get('g')?.qatorId).toBe(-6);
  });

  it('«F2 ni yozish» faqat yozilmagan buyruqni yaratadi: bajarilganlar qayta yaratilmaydi', async () => {
    const { qolgan } = rejaliniYozilganlardanTozala(rejali, yozilgan);
    const yaratilgan: string[] = [];
    const r = await rejaliniYoz(qolgan, {
      versiya: async () => 1,
      yarat: async (b) => { yaratilgan.push(b.operationId); return { qatorId: 777, resursIdlar: [] }; },
    });
    expect(yaratilgan).toEqual(['op-C']);
    expect(r.qolgan).toEqual([]);
  });

  it('hech narsa yozilmagan bo‘lsa — o‘zgarishsiz', () => {
    const { qolgan, map } = rejaliniYozilganlardanTozala(rejali, []);
    expect(map.size).toBe(0);
    expect(qolgan.map((b) => b.tempId)).toEqual([-1, -2, -5, -6]);
  });
});
