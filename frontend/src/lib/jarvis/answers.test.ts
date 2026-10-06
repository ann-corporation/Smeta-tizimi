import { expect, it } from 'vitest';
import { jarvisHelp, jarvisMoney, jarvisEvidenceAnswer } from './answers';
const data = { ok: true, izoh: '', obyektlar: [
  { id: 1, nom: 'Fast Food 1-etaj', smeta: 742939195, fakt: 354450336, f2: 241983934.96, toliq: true, narxsiz: 0 },
  { id: 2, nom: 'Amfiteatr', smeta: null, fakt: 54433474.13, f2: 0, toliq: false, narxsiz: 40 },
] };
it('capabilities narxga bog‘liq emas va bajarilmagan yozuvlarni va’da qilmaydi', () => {
  expect(jarvisHelp('nimalar qila olasan?')).toContain('faqat o‘qiydi');
  expect(jarvisHelp('Fast Food qancha?')).toBeNull();
});
it('tiyinlar saqlanadi; NULL va 0 farqlanadi', () => {
  expect(jarvisMoney(241983934.96).replace(/\s/g, '')).toBe('241983934,96so‘m');
  expect(jarvisMoney(null)).toBe('noma’lum');
  expect(jarvisMoney(0)).toContain('0,00');
});
it('obyekt F2 jami deterministic, qayta hisoblanmaydi', () => {
  expect(jarvisEvidenceAnswer('Fast Food 1-etaj bo‘yicha tasdiqlangan F2 jami qancha?', data)?.replace(/\s/g, '')).toContain('241983934,96');
});
it('obyekt holati haqiqiy narxsiz sonni chiqaradi; N placeholder emas', () => {
  const a = jarvisEvidenceAnswer('amfiteatrda holat qanday', data)!;
  expect(a).toContain('40 qatorda'); expect(a).toContain('noma’lum'); expect(a).not.toContain('N qatorda');
});
it('noaniq/period/mumkin/two-object savol aggregate bilan almashtirilmaydi', () => {
  for (const s of ['Fast Food holat qanday', 'Amfiteatr bu oy F2 qancha?', 'Amfiteatr F2 mumkin qancha?', 'Amfiteatr va Fast Food 1-etaj holat qanday']) expect(jarvisEvidenceAnswer(s, data)).toBeNull();
});
