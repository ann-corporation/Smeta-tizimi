import { describe, expect, it } from 'vitest';
import { qabulQadamlari, takliflarXulosasi } from './pto';

const K = { aktId: 41, obyektId: 80, versiya: 3 };
describe('qabulQadamlari: Qabul mavjud preview->tasdiq vositalariga aylanadi', () => {
  it('hajm taklifi -> f2_qoralama_tahrir ozgartir (versiya bilan)', () => {
    expect(qabulQadamlari({ qator_id: 7, bayroq: 'hajm_notogri', taklif_hajm: 1, qosh: false, izoh: null }, K)).toEqual([{ nom: 'f2_qoralama_tahrir', args: { akt_id: 41, ozgartir: [{ qator_id: 7, hajm: 1 }], kutilgan_versiya: 3 } }]);
  });
  it('olib tashlansin -> qoralamadan olib tashlash + bajarilmadi belgisi (asl smeta qatori ochirilmaydi)', () => {
    const q = qabulQadamlari({ qator_id: 7, bayroq: 'olib_tashlansin', taklif_hajm: null, qosh: false, izoh: 'x' }, K);
    expect(q.map((x) => x.nom)).toEqual(['f2_qoralama_tahrir', 'bajarilmadi']);
    expect(q[0].args).toMatchObject({ olib_tashla: [7], kutilgan_versiya: 3 });
    expect(q[1].args).toMatchObject({ amal: 'belgila', qatorlar: [{ qator_id: 7 }], sabab_kod: 'texnik_sabab' });
  });
  it('izoh/hujjat/qabul/qo\'shish taklifi va qoralama bo\'lmagan F-2 - yozuvsiz', () => {
    expect(qabulQadamlari({ qator_id: 7, bayroq: 'hujjat_kerak', taklif_hajm: null, qosh: false, izoh: null }, K)).toEqual([]);
    expect(qabulQadamlari({ qator_id: 7, bayroq: null, taklif_hajm: 2, qosh: true, izoh: null }, K)).toEqual([]);
    expect(qabulQadamlari({ qator_id: 7, bayroq: 'olib_tashlansin', taklif_hajm: null, qosh: false, izoh: null }, { ...K, qoralama: false })).toEqual([]);
  });
  it('xulosa: jami, hal qilingan, hujjat kutilmoqda', () => {
    expect(takliflarXulosasi([{ qaror: 'qabul', bayroq: null, hujjat_id: null }, { qaror: 'kutilmoqda', bayroq: 'hujjat_kerak', hujjat_id: null }, { qaror: 'kutilmoqda', bayroq: 'hujjat_kerak', hujjat_id: 5 }, { qaror: 'rad', bayroq: 'hujjat_kerak', hujjat_id: null }])).toEqual({ jami: 4, hal: 2, hujjatKutilmoqda: 1 });
  });
});