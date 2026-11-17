// @vitest-environment node
import { expect, it } from 'vitest';
import { kartaMatni, omborCallback } from './telegram-ombor';

// Sintetik kartalar; haqiqiy ma'lumot yo'q.
it('chiqim preview kartasi: material, miqdor, ostatka o\'zgarishi, ogohlantirish', () => {
  const m = kartaMatni({ holat: 'tasdiq_kerak', preview: { tur: 'chiqim', nomi: 'Тест песок', birligi: 'м3', miqdor: 9, sana: '2026-11-17', kontragent: 'Brigada 1',
    qoldiq_hozir: 20, qoldiq_keyin: 11, ogohlantirish: ['Kimga berilgani aytilmadi'] } }, 'uz');
  expect(m).toContain('CHIQIM'); expect(m).toContain('Тест песок'); expect(m).toContain('20 → 11'); expect(m).toContain('⚠');
});
it('tuzatish kartasi aniq yozuv raqamini ko\'rsatadi', () => {
  const m = kartaMatni({ holat: 'tasdiq_kerak', preview: { amal: 'tuzat', harakat_id: 42, asl: { sana: '2026-11-01', operatsiya: 'prixod', nomi: 'Тест', obyomi: 5, birligi: 'шт' }, yangi: { miqdor: 7 } } }, 'uz');
  expect(m).toContain('#42'); expect(m).toContain('"miqdor":7');
});
it('noaniq material: nomzodlar ro\'yxati, tasdiq tugmasiz holat', () => {
  const m = kartaMatni({ holat: 'material_tanlang', nomzodlar: [{ nomi: 'Тест труба ф25', birligi: 'м', qoldiq: 3 }] }, 'uz');
  expect(m).toContain('Тест труба ф25');
});
it('callback: tokensiz yoki eskirgan xabar tasdiqlanmaydi (tarmoqqa chiqmaydi)', async () => {
  const r = await omborCallback({} as never, 1, 'uz', { data: 'ob:y', message: { text: 'oddiy matn, token yo\'q' } });
  expect(r.amal).toBe('ombor_eskirgan');
  expect((await omborCallback({} as never, 1, 'uz', { data: 'ob:n' })).amal).toBe('ombor_bekor');
  const buzuq = await omborCallback({} as never, 1, 'uz', { data: 'ob:y', message: { text: '#OB:AAAA.BBBB' } });
  expect(buzuq.amal).toBe('ombor_eskirgan');
});
