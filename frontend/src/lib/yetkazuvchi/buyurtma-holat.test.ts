import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BUYURTMA_HOLATLAR, BUYURTMA_OTISHLAR, IJROCHI_QADAM, keyingiHolatlar, mumkinOtish, qabulOgohlantirish, tolovHolati } from './buyurtma-holat';

const sql = readFileSync(join(process.cwd(), '..', 'supabase', 'migrations', '20261108410000_t2_buyurtma_p3_v1.sql'), 'utf8');

describe('buyurtma holat (bazadagi mashina bilan bir xil)', () => {
  it('holatlar - t2_buyurtma.holat CHECK ro\'yxati', () => {
    const m = sql.match(/holat text not null default 'yuborildi' check \(holat in \(([^)]*)\)\)/);
    const baza = [...(m?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
    expect([...BUYURTMA_HOLATLAR].sort()).toEqual(baza.sort());
  });
  it('o\'tishlar - _t2_buyurtma_otish_ruxsat jadvali bilan aynan', () => {
    const blok = sql.slice(sql.indexOf('_t2_buyurtma_otish_ruxsat(p_dan'), sql.indexOf('Dalil hujjatlari'));
    const baza = [...blok.matchAll(/\('([a-z_]+)','([a-z_]+)','(xaridor|ijrochi)'\)/g)].map((x) => `${x[1]}>${x[2]}:${x[3]}`).sort();
    expect(BUYURTMA_OTISHLAR.map(([a, b, t]) => `${a}>${b}:${t}`).sort()).toEqual(baza);
    expect(baza.length).toBe(15);
  });
  it('asosiy yo\'l va tomonlar', () => {
    expect(mumkinOtish('yuborildi', 'qabul_qilindi', 'ijrochi')).toBe(true);
    expect(mumkinOtish('yuborildi', 'qabul_qilindi', 'xaridor')).toBe(false);
    expect(mumkinOtish('tayyor', 'topshirildi', 'ijrochi')).toBe(true);
    expect(mumkinOtish('topshirildi', 'nizo', 'xaridor')).toBe(true);
    expect(mumkinOtish('yuborildi', 'topshirildi', 'ijrochi')).toBe(false);
    expect(mumkinOtish('bekor', 'bekor', 'xaridor')).toBe(false);
  });
  it('keyingi tugmalar (bosqich almashtirish hisobga olinmaydi)', () => {
    expect(keyingiHolatlar('yuborildi', 'ijrochi')).toEqual(['qabul_qilindi', 'rad']);
    expect(keyingiHolatlar('tayyor', 'ijrochi')).toEqual(['topshirildi']);
    expect(keyingiHolatlar('topshirildi', 'ijrochi')).toEqual([]);
    expect(keyingiHolatlar('topshirildi', 'xaridor')).toEqual(['qabul_qilindi_yakuniy', 'qisman', 'nizo']);
  });
  it('yetkazuvchining har holatdagi yagona asosiy qadami bazadagi o\'tishga mos', () => {
    for (const [dan, q] of Object.entries(IJROCHI_QADAM)) expect(mumkinOtish(dan as never, q!.ga, 'ijrochi'), dan).toBe(true);
  });
  it("to'lov: noma'lum taxmin qilinmaydi", () => {
    expect(tolovHolati(null, 5)).toBeNull();
    expect(tolovHolati(100, 0)).toBe('tolanmagan');
    expect(tolovHolati(100, 40)).toBe('qisman');
    expect(tolovHolati(100, 100)).toBe('tolangan');
  });
  it('qabul ogohlantirish', () => {
    expect(qabulOgohlantirish({ sertifikatSoni: 0, qabulMiqdor: 9, buyurtmaMiqdor: 10 })).toHaveLength(2);
    expect(qabulOgohlantirish({ sertifikatSoni: 1, qabulMiqdor: 10, buyurtmaMiqdor: 10 })).toHaveLength(0);
  });
});
