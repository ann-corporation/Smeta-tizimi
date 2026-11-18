// @vitest-environment node
import { expect, it } from 'vitest';
import { hisobotMatni, kartaMatni, omborCallback } from './telegram-ombor';

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

it('kirim kartasi: narx QQS siz va QQS bilan birga; narx yumshoq so\'rovi ogohlantirishda', () => {
  const m = kartaMatni({ holat: 'tasdiq_kerak', preview: { tur: 'prixod', nomi: 'Тест', birligi: 'кг', miqdor: 5, sana: '2026-11-17', narx: 1000, narx_bilan: 1120, ogohlantirish: [] } }, 'uz');
  expect(m).toContain('QQS siz'); expect(m).toMatch(/1\s?000/); expect(m).toMatch(/1\s?120/);
  const s = kartaMatni({ holat: 'tasdiq_kerak', preview: { tur: 'prixod', nomi: 'Тест', birligi: 'кг', miqdor: 5, sana: '2026-11-17', narx: null, ogohlantirish: ['Narxi ma’lummi? (o‘tkazib yuborish mumkin)'] } }, 'uz');
  expect(s).toContain('Narxi ma’lummi'); expect(s).not.toContain('QQS siz');
  expect(kartaMatni({ holat: 'tasdiq_kerak', preview: { tur: 'prixod', nomi: 'Т', birligi: 'кг', miqdor: 1, narx: 1000, narx_bilan: 1120, ogohlantirish: [] } }, 'ru')).toContain('без НДС');
});
it('hisobot kartasi: davr, jami birlik bo\'yicha, summa QQS siz/bilan, narxsiz soni', () => {
  const m = hisobotMatni({ davr: { dan: '2026-10-01', gacha: '2026-10-31' }, chetlatilgan: 0, qator_soni: 2,
    jami: { kirim_soni: 1, chiqim_soni: 1, birliklar: [{ birligi: 'кг', kirim: 1000, chiqim: 300 }], kirim_summa: 1_000_000, kirim_summa_qqs: 1_120_000, chiqim_summa: null, narxsiz_soni: 2, qqs_foiz: 12 },
    qatorlar: [{ sana: '2026-10-05', operatsiya: 'prixod', nomi: 'Цемент', birligi: 'кг', obyomi: 1000, kontragent: 'Альфа' }, { sana: '2026-10-25', operatsiya: 'rasxod', nomi: 'Цемент', birligi: 'кг', obyomi: 300, kontragent: null }] }, 'uz');
  expect(m).toContain('2026-10-01'); expect(m).toContain('Narxi yozilmagan kirim: 2'); expect(m).toMatch(/1\s?120\s?000/); expect(m).toContain('+1000 кг Цемент · Альфа');
  expect(hisobotMatni({ davr: { dan: null, gacha: null }, chetlatilgan: 0, qator_soni: 0, jami: { kirim_soni: 0, chiqim_soni: 0, birliklar: [], kirim_summa: 0, kirim_summa_qqs: 0, chiqim_summa: null, narxsiz_soni: 0, qqs_foiz: 12 }, qatorlar: [] }, 'uz')).toContain('yozuv yo‘q');
});