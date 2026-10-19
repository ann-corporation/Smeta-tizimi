import { describe, expect, it } from 'vitest';
import type { F2Tugun } from '../smeta-anatomiya/f2';
import type { SmetaQator } from './index';
import { bogla, f2Indeks, ishniBogla, korinish, otkazibYubor, smetaIndeks } from './ishJoyi';
import { qoshilganmi, qoshilganOzgardi, smetaQatorTuri } from './qoshilgan';

// Smeta: 1 razdel; 2 — asl ish (resurs 3, 4); 10 — foydalanuvchi qo'shgan qo'shimcha ish (resurs 11).
const ASOS: SmetaQator[] = [
  { id: 1, otaId: null, tur: 'rz', kod: null, nom: 'РАЗДЕЛ', birlik: null, hajm: null, tartib: 1 },
  { id: 2, otaId: 1, tur: 'bl', kod: 'E6-1-1-22', nom: 'УСТРОЙСТВО ФУНДАМЕНТОВ', birlik: '100М3', hajm: 2, tartib: 2 },
  { id: 3, otaId: 2, tur: 'rs', kod: '000001', nom: 'ЗАТРАТЫ ТРУДА', birlik: 'ЧЕЛ-Ч', hajm: 360, tartib: 3 },
  { id: 4, otaId: 2, tur: 'mat', kod: '12-575-5', nom: 'БЕТОН В25 W6', birlik: 'М3', hajm: 203, tartib: 4 },
  { id: 10, otaId: 1, tur: 'bl', kod: 'E1-1-1', nom: 'РАЗРАБОТКА ГРУНТА', birlik: '1000М3', hajm: 1, tartib: 5 },
  { id: 11, otaId: 10, tur: 'rs', kod: '000001', nom: 'ЗАТРАТЫ ТРУДА', birlik: 'ЧЕЛ-Ч', hajm: 20, tartib: 6 },
];

let q = 0;
function t(tur: F2Tugun['tur'], kod: string | null, nom: string, birlik: string | null, hajm: number | null, bolalar: F2Tugun[] = []): F2Tugun {
  q++;
  return { uid: `A!${q}`, tur, kod, nom, birlik, hajm, narx: null, summa: null, manzil: { fayl: 'f', varaq: 'A', qator: q }, yol: ['РАЗДЕЛ'], bolalar, barg: tur !== 'rz' && !bolalar.length };
}
const asR = t('rs', '000001', 'ЗАТРАТЫ ТРУДА', 'ЧЕЛ-Ч', 180);
const aslIsh = t('bl', 'E6-1-1-22', 'УСТРОЙСТВО ФУНДАМЕНТОВ', '100М3', 1, [asR]);
const qR = t('rs', '000001', 'ЗАТРАТЫ ТРУДА', 'ЧЕЛ-Ч', 10);
const qIsh = t('bl', 'E1-1-1', 'РАЗРАБОТКА ГРУНТА', '1000М3', 0.5, [qR]);
const tashqi = t('bl', 'E14-1-1', 'ПРОВОЛОКА', 'Т', 0.2);
const rz = { ...t('rz', null, 'РАЗДЕЛ', null, null, [aslIsh, qIsh, tashqi]), yol: [], barg: false };
const IND = f2Indeks([rz]);

function boshlangich() {
  let ij = ishniBogla({ bog: new Map(), otkaz: new Set<string>() }, aslIsh, 2, smetaIndeks(ASOS)).ij;
  ij = ishniBogla(ij, qIsh, 10, smetaIndeks(ASOS)).ij;
  return otkazibYubor(ij, tashqi, true);
}

describe('qo‘shilgan smeta qatorlari — tur va boshqaruv', () => {
  it('asl smeta qatori o‘zgarmas; qo‘shilgan qo‘shimcha/zamena boshqariladi; almashtirilgan asl alohida', () => {
    const alm = new Set([4]);
    expect(smetaQatorTuri({ id: 2 }, alm)).toBe('asl');
    expect(smetaQatorTuri({ id: 4 }, alm)).toBe('almashtirilgan');
    expect(smetaQatorTuri({ id: 10, qoshimcha: true }, alm)).toBe('qoshimcha');
    expect(smetaQatorTuri({ id: 12, qoshimcha: true, zamena: true }, alm)).toBe('zamena');
    expect(qoshilganmi({ id: 2 })).toBe(false);
    expect(qoshilganmi({ id: 4, zamena: false })).toBe(false);
    expect(qoshilganmi({ id: 10, qoshimcha: true })).toBe(true);
  });

  it('o‘chirilgan qo‘shimcha ish: unga bog‘langan F2 ishi va resursi ✕ ga qaytadi, boshqalar o‘zgarmaydi', () => {
    const ij = boshlangich();
    const yangiSmeta = ASOS.filter((x) => x.id !== 10 && x.id !== 11);
    const r = qoshilganOzgardi(ij, IND, { eskiIdlar: new Set([10, 11]), mavjud: new Set(yangiSmeta.map((x) => x.id)), S: smetaIndeks(yangiSmeta) });
    expect(korinish(r.ij, qIsh.uid)).toBe('topilmadi');
    expect(korinish(r.ij, qR.uid)).toBe('topilmadi');
    expect(r.ij.bog.get(aslIsh.uid)?.qatorId).toBe(2);
    expect(r.ij.bog.get(asR.uid)?.qatorId).toBe(3);
    expect(korinish(r.ij, tashqi.uid)).toBe('otkazildi');
    expect(r).toMatchObject({ qaytaBoglandi: 0, uzildi: 2 });
  });

  it('tahrirlangan qo‘shimcha ish (yangi id): F2 ishi yangisiga resurslari bilan qayta bog‘lanadi', () => {
    const ij = boshlangich();
    const yangiSmeta = [...ASOS.filter((x) => x.id !== 10 && x.id !== 11),
      { id: 20, otaId: 1, tur: 'bl', kod: 'E1-1-2', nom: 'РАЗРАБОТКА ГРУНТА ЭКСКАВАТОРОМ', birlik: '1000М3', hajm: 1, tartib: 5 },
      { id: 21, otaId: 20, tur: 'rs', kod: '000001', nom: 'ЗАТРАТЫ ТРУДА', birlik: 'ЧЕЛ-Ч', hajm: 25, tartib: 6 }] as SmetaQator[];
    const r = qoshilganOzgardi(ij, IND, { eskiIdlar: new Set([10, 11]), yangiId: 20, mavjud: new Set(yangiSmeta.map((x) => x.id)), S: smetaIndeks(yangiSmeta) });
    expect(r.ij.bog.get(qIsh.uid)?.qatorId).toBe(20);
    expect(r.ij.bog.get(qR.uid)?.qatorId).toBe(21);
    expect(r.ij.bog.get(aslIsh.uid)?.qatorId).toBe(2);
    expect(r).toMatchObject({ qaytaBoglandi: 1, uzildi: 0 });
  });

  it('resurs zamenasi tahrirlandi: F2 resursi yangi resursga bog‘lanadi', () => {
    let ij = boshlangich();
    ij = bogla(ij, asR.uid, 30);                           // F2 resursi oldingi resurs zamenasiga (30)
    const yangiSmeta = [...ASOS, { id: 31, otaId: 2, tur: 'mat', kod: null, nom: 'ГПС (заказчик)', birlik: 'М3', hajm: 5, tartib: 4 }] as SmetaQator[];
    const r = qoshilganOzgardi(ij, IND, { eskiIdlar: new Set([30]), yangiId: 31, mavjud: new Set(yangiSmeta.map((x) => x.id)), S: smetaIndeks(yangiSmeta) });
    expect(r.ij.bog.get(asR.uid)?.qatorId).toBe(31);
    expect(r.ij.bog.get(aslIsh.uid)?.qatorId).toBe(2);
  });
});
