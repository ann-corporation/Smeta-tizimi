import { afterEach, describe, expect, it, vi } from 'vitest';
import { m29Bajar, m29ChiqimTaklifi } from './t2-m29';

/* Egasi 2026-10-21 (ADR-3): ombor M-29 orqali kamayadi; eski trigger chiqimlari va yetmaydigan qoldiq — aniq tasdiq bilan. */
afterEach(() => vi.unstubAllGlobals());
function server(javob: Record<string, unknown>) {
  const yuborilgan: Array<Record<string, unknown>> = [];
  vi.stubGlobal('fetch', vi.fn(async (_u: string, init?: RequestInit) => {
    yuborilgan.push(JSON.parse(String(init?.body ?? '{}')));
    return new Response(JSON.stringify(javob), { status: 200 });
  }));
  return yuborilgan;
}

describe('M-29 chiqim', () => {
  it('taklif — faqat davrda norma sarfi bor materiallar', () => {
    expect(m29ChiqimTaklifi([{ nom: 'Sement', birlik: 't', normaOy: 1.2345678 }, { nom: 'Qum', birlik: 'm3', normaOy: 0 }]))
      .toEqual([{ nomi: 'Sement', birligi: 't', miqdor: 1.234568 }]);
  });
  it('bayroqlar sukut bo‘yicha o‘chiq; yuborilgan so‘rovda aniq qiymat', async () => {
    const y = server({ ok: true, hujjat_id: 5, qator_soni: 1, trigger_bekor_soni: 0 });
    const r = await m29Bajar({ kompaniyaId: 17, obyektId: 80, davr: '2026-10', qatorlar: [{ nomi: 'Sement', birligi: 't', miqdor: 2 }] });
    expect(r).toMatchObject({ ok: true, hujjat_id: 5 });
    expect(y[0]).toMatchObject({ amal: 'm29_bajar_v1', obyekt_id: 80, davr: '2026-10', manfiyga_ruxsat: false, trigger_bekor: false });
  });
  it('eski trigger chiqimlari va yetmaydigan qoldiq ro‘yxati qaytariladi (UI tasdiq so‘raydi)', async () => {
    server({ ok: false, code: 'TRIGGER_CHIQIM_BOR', trigger: [{ nomi: 'Plyonka', birligi: 'm2', sof: 264.5 }] });
    const a = await m29Bajar({ kompaniyaId: 17, obyektId: 80, davr: '2026-10', qatorlar: [{ nomi: 'Plyonka', birligi: 'm2', miqdor: 100 }] });
    expect(a).toMatchObject({ ok: false, code: 'TRIGGER_CHIQIM_BOR', trigger: [{ sof: 264.5 }] });
    server({ ok: false, code: 'QOLDIQ_YETMAYDI', yetmaydi: [{ nomi: 'Plyonka', birligi: 'm2', kerak: 100, bor: 0 }] });
    const b = await m29Bajar({ kompaniyaId: 17, obyektId: 80, davr: '2026-10', qatorlar: [{ nomi: 'Plyonka', birligi: 'm2', miqdor: 100 }], triggerBekor: true });
    expect(b).toMatchObject({ ok: false, code: 'QOLDIQ_YETMAYDI', yetmaydi: [{ kerak: 100, bor: 0 }] });
  });
  it('davr allaqachon bajarilgan — tushunarli xabar', async () => {
    server({ ok: false, code: 'DAVR_BAJARILGAN', hujjat_id: 1 });
    const r = await m29Bajar({ kompaniyaId: 17, obyektId: 80, davr: '2026-10', qatorlar: [{ nomi: 'x', birligi: null, miqdor: 1 }] });
    expect(r).toMatchObject({ ok: false, code: 'DAVR_BAJARILGAN', hujjat_id: 1, xato: 'Bu davr uchun M-29 allaqachon bajarilgan.' });
  });
});
