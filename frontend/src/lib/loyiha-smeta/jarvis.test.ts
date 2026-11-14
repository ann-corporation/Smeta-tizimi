import { describe, expect, it } from 'vitest';
import { loyihaFarqMatni } from './jarvis';
import type { FarqQator } from './farq';

const f = (o: Partial<FarqQator>): FarqQator => ({ tur: 'hajm_farqi', varaq: 'КР-5', miqdorId: 1, qatorId: 2, nom: 'Бетон', birlik: 'м3', loyiha: 12, smeta: 10, fakt: null, farq: 2, pulQQSsiz: 1000, pulQQSbilan: 1120,
  narxsiz: false, qaror: null, qarorEskirgan: false, izoh: [], ...o });

describe('Jarvis: loyiha_farq', () => {
  const m = { farqlar: [f({}), f({ varaq: 'КР-6', nom: 'Плита', pulQQSsiz: 500, pulQQSbilan: 560 }), f({ varaq: 'КР-5', tur: 'loyihada_bor_smetada_yoq', nom: 'Новая', smeta: null, pulQQSsiz: null, pulQQSbilan: null, narxsiz: true })], taklifSoni: 4, tasdiqlanganSoni: 3 };
  it('«КР-5 da nima farq» (lotin/kirill farqsiz): shu varaq, QQS bilan avval, narxsiz «—»', () => {
    for (const a of ['КР-5', 'kr 5', 'KR-5']) {
      const t = loyihaFarqMatni(m, a).replace(/\u00a0/g, ' ');
      expect(t).toContain('КР-5 bo‘yicha 2 ta farq'); expect(t).toContain('1 120 so‘m QQS bilan'); expect(t).toContain('—'); expect(t).not.toContain('Плита');
    }
  });
  it('«smetaga kirmagan ishlar qancha»: jami QQS bilan va QQS siz, narxsiz soni; taklif sanoq alohida', () => {
    const t = loyihaFarqMatni(m, null).replace(/\u00a0/g, ' ');
    expect(t).toContain('Smetaga kirmagan (hal qilinmagan): 3 ta, 1 680 so‘m QQS bilan (1 500 QQS siz)');
    expect(t).toContain('Narxsiz (summa noma‘lum): 1 ta'); expect(t).toContain('tasdiqlanmagan takliflar (pulga kirmaydi): 4');
  });
  it('ma‘lumot yo‘q yoki tasdiqlanmagan -> tushunarli javob, o‘ylab topilmaydi', () => {
    expect(loyihaFarqMatni(null, null)).toContain('yuklanmadi');
    expect(loyihaFarqMatni({ farqlar: [], taklifSoni: 2, tasdiqlanganSoni: 0 }, null)).toContain('avval chizma miqdorlarini tasdiqlang');
    expect(loyihaFarqMatni(m, 'КР-99')).toContain('farq topilmadi');
  });
});
