/**
 * t2-shartnoma-rekvizit.test.ts — egasi (2026-09-28): "rekvizit masalasi eng
 * baland iyerarxiyada — tomonlar (ЗАКАЗЧИК/ПОДРЯДЧИК) bog'langanida hal
 * qilinadigan narsa". `zakazchikRekvizit()` kanonik yo'lni (t2_kompaniya
 * registriga bog'lanish) matn zaxirasidan ustun qo'yishini tekshiradi.
 */
import { describe, expect, it } from 'vitest';
import { zakazchikRekvizit, type KompaniyaRekvizitManbasi, type Shartnoma } from './t2-shartnoma';

function sh(p: Partial<Shartnoma>): Parameters<typeof zakazchikRekvizit>[0] {
  return {
    zakazchik_kompaniya_id: null, zakazchik_toliq_nom: null, zakazchik_manzil: null, zakazchik_telefon: null,
    zakazchik_hisob_raqam: null, zakazchik_bank: null, zakazchik_mfo: null, zakazchik_inn: null, zakazchik_oked: null,
    ...p,
  };
}
const KOMP: KompaniyaRekvizitManbasi = {
  toliq_nom: 'Дирекция "Янги Навоий шахарчаси"', manzil: 'г.Навои', telefon: '95-000-00-00',
  hisob_raqam: '4600 1086', bank: 'Марказий банк', mfo: '00014', inn: '311311785', oked: '84130',
};

describe('zakazchikRekvizit — kanonik bog\'lanish matn zaxirasidan ustun', () => {
  it('zakazchik_kompaniya_id bog\'langan bo\'lsa — registrdan (bir joyda kiritilgan) o\'qiydi', () => {
    const r = zakazchikRekvizit(sh({ zakazchik_kompaniya_id: 21, zakazchik_toliq_nom: 'ESKI QOLDIQ MATN' }), (id) => (id === 21 ? KOMP : undefined));
    expect(r).toMatchObject({ toliqNom: KOMP.toliq_nom, inn: KOMP.inn, oked: KOMP.oked });
  });

  it('bog\'lanish yo\'q — shartnomaning o\'z (zaxira) matn maydonlariga tushadi', () => {
    const r = zakazchikRekvizit(sh({ zakazchik_toliq_nom: 'Qo\'lda kiritilgan ZAKAZCHIK', zakazchik_inn: '999' }), () => undefined);
    expect(r).toMatchObject({ toliqNom: 'Qo\'lda kiritilgan ZAKAZCHIK', inn: '999' });
  });

  it('bog\'langan kompaniya topilmasa (o\'chirilgan/xato ID) — zaxiraga qaytadi, jim tashlab ketmaydi', () => {
    const r = zakazchikRekvizit(sh({ zakazchik_kompaniya_id: 999, zakazchik_toliq_nom: 'Zaxira nom' }), () => undefined);
    expect(r.toliqNom).toBe('Zaxira nom');
  });

  it('hech narsa yo\'q (shartnoma null yoki hamma maydon bo\'sh) — bo\'sh obyekt, chiziq to\'qilmaydi', () => {
    expect(zakazchikRekvizit(null, () => undefined)).toEqual({});
    expect(zakazchikRekvizit(sh({}), () => undefined)).toMatchObject({ toliqNom: null, inn: null });
  });
});
