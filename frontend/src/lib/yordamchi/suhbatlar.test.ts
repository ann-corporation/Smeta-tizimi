import { describe, expect, it } from 'vitest';
import { MAX_SUHBAT, MAX_XABAR, SAQLASH_KUN, suhbatArxivla, suhbatKaliti, suhbatOqi, suhbatTozala, suhbatYoz } from './suhbatlar';

const KUN = 86_400_000; const NOW = 1_800_000_000_000;
const x = (rol: 'user' | 'ai', matn: string) => ({ rol, matn });

describe('Jarvis suhbatlari (ixcham arxiv)', () => {
  it('sarlavha birinchi savoldan; oxirgi xabarlar qisqartirilgan; jonli va bo‘sh tashlanadi', () => {
    const r = suhbatArxivla([], 's1', [x('user', 'Yevropa 1 narxsiz qatorlar '.repeat(10)), { ...x('ai', 'jarayonda'), jonli: true }, x('ai', 'a'.repeat(900))], NOW);
    expect(r).toHaveLength(1); expect(r[0].sarlavha.length).toBeLessThanOrEqual(60); expect(r[0].xabarlar).toHaveLength(2); expect(r[0].xabarlar[1].matn.length).toBeLessThanOrEqual(400);
  });
  it('foydalanuvchi xabarisiz suhbat saqlanmaydi; bir xil id yangilanadi; ≤ 12 xabar', () => {
    expect(suhbatArxivla([], 's', [x('ai', 'salom')], NOW)).toEqual([]);
    const a = suhbatArxivla([], 's', [x('user', 'bir')], NOW); const b = suhbatArxivla(a, 's', Array.from({ length: 30 }, (_, i) => x('user', `q${i}`)), NOW + 1);
    expect(b).toHaveLength(1); expect(b[0].xabarlar).toHaveLength(MAX_XABAR);
  });
  it('30 kundan eski o‘chadi; ro‘yxat ≤ 20; eng yangisi birinchi', () => {
    const eski = { id: 'e', sarlavha: 'eski', yangilandi: NOW - (SAQLASH_KUN + 1) * KUN, xabarlar: [x('user', 'a')] };
    expect(suhbatTozala([eski], NOW)).toEqual([]);
    let l = [] as ReturnType<typeof suhbatArxivla>; for (let i = 0; i < 30; i++) l = suhbatArxivla(l, `s${i}`, [x('user', `savol ${i}`)], NOW + i);
    expect(l).toHaveLength(MAX_SUHBAT); expect(l[0].id).toBe('s29');
  });
  it('hajm cheklovi: juda katta ro‘yxat eskilarini tashlaydi', () => {
    let l = [] as ReturnType<typeof suhbatArxivla>;
    for (let i = 0; i < 20; i++) l = suhbatArxivla(l, `s${i}`, Array.from({ length: 12 }, () => x('user', 'x'.repeat(400))), NOW + i);
    expect(JSON.stringify(l).length).toBeLessThanOrEqual(60_000);
  });
  it('saqlash: foydalanuvchi+kompaniya kaliti bo‘yicha ajratilgan; buzuq qiymat bo‘sh', () => {
    const m = new Map<string, string>(); const st = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } };
    suhbatYoz(suhbatKaliti(7, 5), suhbatArxivla([], 'a', [x('user', 'salom')], NOW), st);
    expect(suhbatOqi(suhbatKaliti(7, 5), st, NOW)).toHaveLength(1);
    expect(suhbatOqi(suhbatKaliti(7, 6), st, NOW)).toEqual([]);      // boshqa kompaniya
    expect(suhbatOqi(suhbatKaliti(8, 5), st, NOW)).toEqual([]);      // boshqa foydalanuvchi
    m.set('buzuq', '{x'); expect(suhbatOqi('buzuq', st, NOW)).toEqual([]);
  });
});
