import { expect, it } from 'vitest';
import { pozitsiyaPul, qatorPul } from './hisob';

const eskiPul = (hajm: number, narx: number | null) => pozitsiyaPul(
  { kod: 'SYN-01', nom: 'Synthetic signed work', birlik: 'м3', hajm, resurslar: [] },
  new Map(narx == null ? [] : [['SYN-01', { narx, kat: 'МАТ' }]]),
);

const ochirilganQator = (eskiHajm: number, qaror: 'qurilgan' | 'qisman', qurilganHajm: number | null = null) => ({
  holat: 'ochirilgan' as const, qaror, eskiHajm, qurilganHajm,
  joriyHajm: null, birlikFarq: false,
});

it('negative old quantity -2 at price 10 keeps known deleted claim amount -20', () => {
  const direct = eskiPul(-2, 10);
  expect(direct).toMatchObject({ summa: -20, narxsiz: 0 });

  const claim = qatorPul(ochirilganQator(-2, 'qurilgan'), direct, null);
  expect(claim.davaHajm).toBe(-2);
  expect(claim.dava).toBe(-20);
});

it('negative old quantity -2 at price -10 keeps known deleted claim amount +20', () => {
  const direct = eskiPul(-2, -10);
  expect(direct).toMatchObject({ summa: 20, narxsiz: 0 });

  const claim = qatorPul(ochirilganQator(-2, 'qurilgan'), direct, null);
  expect(claim.davaHajm).toBe(-2);
  expect(claim.dava).toBe(20);
});

it('ordinary positive quantity and price remain a positive control', () => {
  const direct = eskiPul(2, 10);
  const claim = qatorPul(ochirilganQator(2, 'qurilgan'), direct, null);

  expect(direct.summa).toBe(20);
  expect(claim.dava).toBe(20);
});

it('positive partial deleted claim scales the known old amount by the entered volume', () => {
  const direct = eskiPul(2, 10);
  const claim = qatorPul(ochirilganQator(2, 'qisman', 1), direct, null);

  expect(claim.davaHajm).toBe(1);
  expect(claim.dava).toBe(10);
});

it('NULL source price remains unknown for a nonzero claim volume', () => {
  const direct = eskiPul(2, null);
  const claim = qatorPul(ochirilganQator(2, 'qurilgan'), direct, null);

  expect(direct).toMatchObject({ summa: null, narxsiz: 1 });
  expect(claim.dava).toBeNull();
});

it('known zero direct amount with zero old quantity remains a known zero claim', () => {
  const direct = eskiPul(0, 10);
  const claim = qatorPul(ochirilganQator(0, 'qurilgan'), direct, null);

  expect(direct).toMatchObject({ summa: 0, narxsiz: 0 });
  expect(claim.davaHajm).toBe(0);
  expect(claim.dava).toBe(0);
});

it('nonzero positive partial volume over a zero old quantity has no derivable unit amount', () => {
  const direct = eskiPul(0, 10);
  const claim = qatorPul(ochirilganQator(0, 'qisman', 1), direct, null);

  expect(direct.summa).toBe(0);
  expect(claim.davaHajm).toBe(1);
  expect(claim.dava).toBeNull();
});

// Signed partial volume is intentionally not an acceptance case: the persisted
// qurilgan_hajm constraint rejects values below zero, so that path is unsupported.

it('negative current quantity supplies the current unit price without losing category amounts', () => {
  const claim = qatorPul({ holat: 'oshgan', qaror: 'qurilgan', eskiHajm: -2,
    joriyHajm: -3, qurilganHajm: null, birlikFarq: false }, eskiPul(-2, 10), eskiPul(-3, 20));
  expect(claim.davaHajm).toBe(1);
  expect(claim.dava).toBe(20);
  expect(claim.davaKesim?.summalar['МАТ']).toBe(20);
});

it('negative old quantity with unknown price is still unknown', () => {
  const claim = qatorPul(ochirilganQator(-2, 'qurilgan'), eskiPul(-2, null), null);
  expect(claim.davaHajm).toBe(-2);
  expect(claim.dava).toBeNull();
  expect(claim.davaKesim).toBeNull();
});

