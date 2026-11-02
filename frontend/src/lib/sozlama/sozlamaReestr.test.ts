import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SOZLAMALAR, mavqeMos, qatlamSoni, ruxsatMos, sozlamaFiltr } from './sozlamaReestr';

const app = readFileSync(resolve(process.cwd(), 'src', 'App.tsx'), 'utf8');
const marshrutlar = new Set([...app.matchAll(/<Route\s+path="([^"]+)"/g)].map((m) => m[1]));

describe('sozlamaReestr', () => {
  it('id lar noyob', () => {
    const ids = SOZLAMALAR.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('har yol App.tsx dagi marshrutga olib boradi', () => {
    const yoq = SOZLAMALAR.map((s) => s.yol.split('?')[0]).filter((y) => {
      const m = y.match(/^\/admin\/(.+)$/);
      return !m || !marshrutlar.has(m[1]);
    });
    expect(yoq).toEqual([]);
  });
  it('tizim qatlami faqat superadmin uchun', () => {
    const tizim = SOZLAMALAR.filter((s) => s.qatlam === 'tizim');
    expect(tizim.length).toBeGreaterThan(0);
    expect(tizim.every((s) => s.faqatSuperadmin === true)).toBe(true);
    expect(SOZLAMALAR.filter((s) => s.qatlam !== 'tizim').some((s) => s.faqatSuperadmin)).toBe(false);
  });
  it('filtr: oddiy a‘zo tizimni va ruxsatli kompaniya sozlamalarini ko‘rmaydi', () => {
    const usta = sozlamaFiltr({ superadmin: false, permissions: ['company.read', 'document.read'] });
    expect(usta.some((s) => s.qatlam === 'tizim')).toBe(false);
    expect(usta.some((s) => s.id === 'kompaniya.azolar')).toBe(false);
    expect(usta.some((s) => s.id === 'kompaniya.rekvizit')).toBe(false);
    expect(usta.some((s) => s.id === 'akkaunt.til')).toBe(true);
    expect(usta.some((s) => s.id === 'kompaniya.tokenlar')).toBe(true);
    const boss = sozlamaFiltr({ superadmin: false, permissions: ['company.read', 'company.member.manage', 'company.profile.update'] });
    expect(boss.some((s) => s.id === 'kompaniya.azolar')).toBe(true);
  });
  it('filtr: superadmin hammasini ko‘radi', () => {
    expect(sozlamaFiltr({ superadmin: true, permissions: [] }).length).toBe(SOZLAMALAR.length);
  });
  it('filtr: mavqe berilsa mos kelmaganlar tushadi, null — yashirmaydi', () => {
    const z = sozlamaFiltr({ superadmin: true, permissions: [], mavqe: 'zakazchik' });
    expect(z.some((s) => s.id === 'kompaniya.nakrutka')).toBe(false);
    expect(z.some((s) => s.id === 'kompaniya.taqdimlar')).toBe(true);
    expect(sozlamaFiltr({ superadmin: true, permissions: [], mavqe: null }).length).toBe(SOZLAMALAR.length);
  });
  it('ruxsatMos: bo‘sh = hamma; a+b ikkalasi kerak', () => {
    expect(ruxsatMos([], [])).toBe(true);
    expect(ruxsatMos(['a+b'], ['a'])).toBe(false);
    expect(ruxsatMos(['a+b'], ['a', 'b'])).toBe(true);
    expect(ruxsatMos(['x', 'a+b'], ['x'])).toBe(true);
    expect(mavqeMos({ mavqe: ['pudratchi'] }, null)).toBe(true);
  });
  it('har qatlamda sozlama bor va hisob mos', () => {
    const n = qatlamSoni(SOZLAMALAR);
    expect(n.akkaunt).toBeGreaterThan(0);
    expect(n.kompaniya).toBeGreaterThan(0);
    expect(n.tizim).toBeGreaterThan(0);
    expect(n.akkaunt + n.kompaniya + n.tizim).toBe(SOZLAMALAR.length);
  });
});
