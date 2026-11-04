import { describe, expect, it } from 'vitest';
import { TENDER_AMALLAR, tenderYuk } from './tender-yuk';
import { dataPermission } from './permission-policy';
import { writeCommandPermission } from './write-command-policy';

const OP = '123e4567-e89b-42d3-a456-426614174000';
const b = (o: Record<string, unknown>) => ({ kompaniya_id: 5, operation_id: OP, ...o });

describe('tender yozuv argumentlari (oq ro\'yxat)', () => {
  it('actor faqat sessiyadan; operation_id majburiy; kompaniya tekshiriladi', () => {
    expect(tenderYuk('tender_otish_v1', b({}), null).ok).toBe(false);
    expect(tenderYuk('tender_otish_v1', { kompaniya_id: 5, rfq_id: 1, kutilgan_versiya: 1, ga: 'elon' }, 7).ok).toBe(false);
    const r = tenderYuk('tender_otish_v1', b({ rfq_id: 1, kutilgan_versiya: 2, ga: 'elon', p_actor_id: 999 }), 7);
    expect(r.ok && r.yuk.p_actor_id).toBe(7);   // mijoz yuborgan p_actor_id e'tiborsiz
  });
  it('saqla: maydonlar oq ro\'yxatdan, ortiqcha kalitlar tashlanadi, qatorlar tekshiriladi', () => {
    const r = tenderYuk('tender_saqla_v1', b({ tur: 'material', doira: 'ochiq', muddat: '2026-12-01T10:00:00Z', maydonlar: { sarlavha: 'X', xavfli: 'DROP', meyor: { narx: 100, yomon: 5 }, byudjet_qqs_bilan: 1000 },
      qatorlar: [{ nom: 'Sement', birlik: 'tonna', miqdor: 3, lot_no: 1, talab_sana: '2027-01-01', hack: 1 }] }), 7);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(JSON.stringify(r.yuk)).not.toMatch(/xavfli|yomon|hack/);
      expect((r.yuk.p_maydonlar as Record<string, unknown>).meyor).toEqual({ narx: 100 });
      expect(r.yuk.p_muddat).toBe('2026-12-01T10:00:00.000Z');
    }
    expect(tenderYuk('tender_saqla_v1', b({ tur: 'Material!', doira: 'ochiq', maydonlar: {}, qatorlar: [{}] }), 7).ok).toBe(false);
    expect(tenderYuk('tender_saqla_v1', b({ tur: 'material', doira: 'x', maydonlar: {}, qatorlar: [{ nom: 'a' }] }), 7).ok).toBe(false);
    expect(tenderYuk('tender_saqla_v1', b({ tur: 'material', doira: 'ochiq', maydonlar: {}, qatorlar: [{ nom: 'a', birlik: 'b', miqdor: -1 }] }), 7).ok).toBe(false);
    expect(tenderYuk('tender_saqla_v1', b({ rfq_id: 4, tur: 'material', doira: 'ochiq', maydonlar: {}, qatorlar: [{ nom: 'a', birlik: 'b', miqdor: 1 }] }), 7).ok).toBe(false); // tahrirda versiya majburiy
  });
  it('taklif: narxsiz qator yuborilmaydi (NULL ≠ 0), noto\'g\'ri raqam rad', () => {
    expect(tenderYuk('tender_taklif_v2', b({ rfq_id: 1, qatorlar: [{ rfq_qator_id: 1 }] }), 7).ok).toBe(false);
    expect(tenderYuk('tender_taklif_v2', b({ rfq_id: 1, qatorlar: [{ rfq_qator_id: 1, narx: 'abc' }] }), 7).ok).toBe(false);
    expect(tenderYuk('tender_taklif_v2', b({ rfq_id: 1, qatorlar: [{ rfq_qator_id: 1, narx: 0 }] }), 7).ok).toBe(true);   // haqiqiy 0 (bepul) — mijoz ongli kiritgan
    const r = tenderYuk('tender_taklif_v2', b({ rfq_id: 1, qatorlar: [{ rfq_qator_id: 1, narx: 100, muddat_kun: 0 }], shart: { kafolat_oy: 0, amal_kun: 30, qqs_foiz: 0, x: 1 } }), 7);
    expect(r.ok && (r.yuk.p_shart as Record<string, unknown>)).toEqual({ yetkazish_narx: null, qqs_foiz: 0, tolov_sharti: null, amal_kun: 30, kafolat_oy: 0 });
  });
  it('g\'olib: asos majburiy (>=10 belgi), tanlov tekshiriladi', () => {
    const t = [{ taklif_id: 3, qator_idlar: [1, 2] }];
    expect(tenderYuk('tender_golib_v2', b({ rfq_id: 1, kutilgan_versiya: 1, tanlov: t, asos: 'qisqa' }), 7).ok).toBe(false);
    expect(tenderYuk('tender_golib_v2', b({ rfq_id: 1, kutilgan_versiya: 1, tanlov: [{ taklif_id: 'x' }], asos: 'yetarlicha uzun asos' }), 7).ok).toBe(false);
    const r = tenderYuk('tender_golib_v2', b({ rfq_id: 1, kutilgan_versiya: 1, tanlov: t, asos: 'yetarlicha uzun asos', yakun: false }), 7);
    expect(r.ok && r.yuk.p_yakun).toBe(false);
  });
  it('ball 0..100, reyting 1..5, savol uzunligi', () => {
    expect(tenderYuk('tender_baholash_saqla_v1', b({ rfq_id: 1, kutilgan_versiya: 1, ballar: [{ taklif_id: 1, ballar: { narx: 120 } }] }), 7).ok).toBe(false);
    expect(tenderYuk('tender_baholash_saqla_v1', b({ rfq_id: 1, kutilgan_versiya: 1, ballar: [{ taklif_id: 1, ballar: { narx: 90, muddat: 70 } }] }), 7).ok).toBe(true);
    expect(tenderYuk('tender_baho_ber_v1', b({ buyurtma_id: 1, ball: 6 }), 7).ok).toBe(false);
    expect(tenderYuk('tender_savol_ber_v1', b({ rfq_id: 1, savol: 'ha' }), 7).ok).toBe(false);
  });
  it('fayl havolasi: faqat hujjat id lari (R2), 1–10 ta', () => {
    const r = tenderYuk('tender_fayl_bogla_v1', b({ rfq_id: 3, hujjat_idlar: [5, 6], icerik: 'BASE64...' }), 7);
    expect(r.ok && r.yuk).toEqual({ p_actor_id: 7, p_kompaniya_id: 5, p_operation_id: OP, p_rfq_id: 3, p_hujjat_idlar: [5, 6] });
    expect(tenderYuk('tender_taklif_fayl_bogla_v1', b({ taklif_id: 9, hujjat_idlar: [1] }), 7).ok).toBe(true);
    expect(tenderYuk('tender_fayl_bogla_v1', b({ rfq_id: 3, hujjat_idlar: [] }), 7).ok).toBe(false);
    expect(tenderYuk('tender_fayl_bogla_v1', b({ rfq_id: 3, hujjat_idlar: Array.from({ length: 11 }, (_, i) => i + 1) }), 7).ok).toBe(false);
    expect(tenderYuk('tender_fayl_bogla_v1', b({ rfq_id: 3, hujjat_idlar: ['x'] }), 7).ok).toBe(false);
  });
  it('har tender amali uchun ruxsat: dataPermission == writeCommandPermission (xarid capability lari)', () => {
    for (const a of TENDER_AMALLAR) {
      expect(writeCommandPermission(a)).toBe(dataPermission(a, true));
      expect(['procurement.write', 'procurement.approve', 'supply.offer']).toContain(writeCommandPermission(a));
    }
    expect(dataPermission('tender_tafsilot_v2', false)).toBe('procurement.read');
    expect(writeCommandPermission('tender_taklif_v2')).toBe('supply.offer');
    expect(writeCommandPermission('tender_golib_v2')).toBe('procurement.approve');
  });
});
