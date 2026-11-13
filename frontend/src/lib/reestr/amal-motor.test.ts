import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AMAL_MAP } from './amal';
import { AmalTasdiqXato, amalKeshTozala, amalRoyxati, amalTopish, bajar, holat, javobQabul, korinish, ruxsatMatni, sessiyaBosh, sonAjrat, type AmalKontekst, type Ijrochi } from './amal-motor';

const ctxQur = (o: Partial<AmalKontekst> = {}): AmalKontekst => ({
  kompaniyaId: 7, obyektId: null, joriyShartnomaId: null,
  obyektlar: [{ id: 11, nom: 'Amfiteatr' }, { id: 12, nom: 'Yevropa 1' }],
  shartnomalar: [{ id: 301, raqam: '12/2026', nom: 'Beton ishlari' }, { id: 302, raqam: '7', nom: null }],
  permissions: ['warehouse.write', 'financial.write', 'smeta.write'], superadmin: false, bugun: new Date(2026, 10, 12), ...o,
});
const zayavka = AMAL_MAP.get('zayavka.yaratish')!;
const tolov = AMAL_MAP.get('moliya.tolov')!;

beforeEach(() => amalKeshTozala());

describe('amalTopish (matn -> amal)', () => {
  it('zayavka / tolov / sinonim (ru) topiladi; sahifa ochish va fakt (model) hijack qilinmaydi', () => {
    expect(amalTopish('КР-5 uchun zayavka och')).toMatchObject({ tur: 'aniq', amal: { kalit: 'zayavka.yaratish' } });
    expect(amalTopish('tolov kiritish 5 mln')).toMatchObject({ tur: 'aniq', amal: { kalit: 'moliya.tolov' } });
    expect(amalTopish('внести оплату по договору')).toMatchObject({ tur: 'aniq', amal: { kalit: 'moliya.tolov' } });
    expect(amalTopish('zayavkalar sahifasini och')).toBeNull();
    expect(amalTopish('Amfiteatrda 5-qatorga 12 m3 fakt yoz')).toMatchObject({ tur: 'aniq', amal: { kalit: 'fakt.kiritish' } });
    expect(amalTopish('salom')).toBeNull();
  });
});

describe('sonAjrat: pul/hajm taxmin qilinmaydi', () => {
  it('aniq bitta son; mln/ming; kod ichidagi raqam va bir nechta son — null', () => {
    expect(sonAjrat('5 mln')).toBe(5_000_000);
    expect(sonAjrat('500 ming so‘m')).toBe(500_000);
    expect(sonAjrat('12,5')).toBe(12.5);
    expect(sonAjrat('КР-5 uchun zayavka och')).toBeNull();
    expect(sonAjrat('5 va 7')).toBeNull();
    expect(sonAjrat('hech qancha')).toBeNull();
  });
});

describe('parametrlarni hal qilish: matn -> kontekst -> BITTA savol', () => {
  it('zayavka: material matndan, obyekt kontekstdan; miqdor so‘raladi (taxmin yo‘q)', () => {
    const ctx = ctxQur({ obyektId: 11 });
    const s = sessiyaBosh(zayavka, 'КР-5 uchun zayavka och', ctx);
    expect(s.params).toMatchObject({ material: 'КР-5' });
    const h = holat(zayavka, s, ctx);
    expect(h).toMatchObject({ tur: 'savol', param: 'miqdor' });
    expect(s.params.obyekt).toBe(11);
    expect(javobQabul(zayavka, s, 'ko‘p', ctx)).toMatchObject({ ok: false });
    expect(javobQabul(zayavka, s, '40', ctx)).toEqual({ ok: true });
    expect(holat(zayavka, s, ctx)).toEqual({ tur: 'tayyor' });
    expect(s.params.miqdor).toBe(40);
  });
  it('obyekt kontekstda yo‘q: matndan nomi bilan, aks holda savol', () => {
    const ctx = ctxQur({ obyektId: null });
    const a = sessiyaBosh(zayavka, 'Amfiteatr uchun zayavka och', ctx);
    expect(a.params.obyekt).toBe(11);
    const b = sessiyaBosh(zayavka, 'zayavka och', ctx);
    expect(holat(zayavka, b, ctx)).toMatchObject({ tur: 'savol', param: 'obyekt' });
  });
  it('to‘lov: shartnoma raqami va summa matndan; sana bugun; summa va shartnoma hech qachon taxmin qilinmaydi', () => {
    const ctx = ctxQur();
    const s = sessiyaBosh(tolov, '12/2026 shartnomaga 5 mln tolov kiritish bugun', ctx);
    expect(s.params).toMatchObject({ shartnoma: 301, summa: 5_000_000 });
    expect(holat(tolov, s, ctx)).toEqual({ tur: 'tayyor' });
    expect(s.params.sana).toBe('2026-11-12');
    const t = sessiyaBosh(tolov, 'tolov kiritish', ctx);
    expect(holat(tolov, t, ctx)).toMatchObject({ tur: 'savol', param: 'shartnoma' });
    expect(javobQabul(tolov, t, '12/2026', ctx)).toEqual({ ok: true });
    expect(holat(tolov, t, ctx)).toMatchObject({ tur: 'savol', param: 'summa' });
  });
});

describe('ruxsat: yo‘q bo‘lsa tushuntiriladi', () => {
  it('capability yo‘q: sababi va nima qilish aytiladi, amal yashirilmaydi', () => {
    const ctx = ctxQur({ permissions: ['fakt.read'] });
    const s = sessiyaBosh(tolov, 'tolov kiritish', ctx);
    const h = holat(tolov, s, ctx);
    expect(h.tur).toBe('ruxsatYoq');
    expect((h as { matn: string }).matn).toContain('ruxsati yo‘q');
    expect(ruxsatMatni(tolov)).toContain('Moliyaviy ma’lumotlarni tahrirlash');
    expect(amalRoyxati(ctx).some((a) => a.kalit === 'moliya.tolov')).toBe(false);
    expect(amalRoyxati(ctxQur()).some((a) => a.kalit === 'moliya.tolov')).toBe(true);
    expect(amalRoyxati(ctxQur({ permissions: [], superadmin: true })).length).toBeGreaterThan(10);
  });
});

describe('tasdiq darajalari va idempotentlik', () => {
  const ij = (): { ij: Ijrochi; ijro: ReturnType<typeof vi.fn> } => {
    const ijro = vi.fn(async () => ({ ok: true, xabar: 'yozildi', havola: '/admin/x' }));
    return { ij: { korinish: () => ({ matn: 'ko‘rinish' }), ijro }, ijro };
  };
  it('pul amali BITTA tasdiq bilan bajarilmaydi', async () => {
    const ctx = ctxQur(); const { ij: i, ijro } = ij();
    const s = sessiyaBosh(tolov, '12/2026 shartnomaga 5 mln tolov kiritish', ctx); holat(tolov, s, ctx);
    await expect(bajar(tolov, s, { karta: false, ikkinchi: false }, ctx, i)).rejects.toMatchObject({ kod: 'TASDIQ_KERAK' });
    await expect(bajar(tolov, s, { karta: true, ikkinchi: false }, ctx, i)).rejects.toMatchObject({ kod: 'IKKI_TASDIQ_KERAK' });
    expect(ijro).not.toHaveBeenCalled();
    const n = await bajar(tolov, s, { karta: true, ikkinchi: true }, ctx, i);
    expect(n.ok).toBe(true);
    expect(ijro).toHaveBeenCalledTimes(1);
  });
  it('oddiy yozuv (karta) bitta tasdiq bilan; tasdiqsiz — yo‘q', async () => {
    const ctx = ctxQur({ obyektId: 11 }); const { ij: i, ijro } = ij();
    const s = sessiyaBosh(zayavka, 'КР-5 uchun zayavka och', ctx); s.params.miqdor = 5; holat(zayavka, s, ctx);
    await expect(bajar(zayavka, s, { karta: false, ikkinchi: false }, ctx, i)).rejects.toBeInstanceOf(AmalTasdiqXato);
    await bajar(zayavka, s, { karta: true, ikkinchi: false }, ctx, i);
    expect(ijro).toHaveBeenCalledTimes(1);
  });
  it('ruxsatsiz bajarilmaydi (ijro chaqirilmaydi)', async () => {
    const ctx = ctxQur({ permissions: [] }); const { ij: i, ijro } = ij();
    const s = sessiyaBosh(zayavka, 'zayavka och', ctx);
    await expect(bajar(zayavka, s, { karta: true, ikkinchi: true }, ctx, i)).rejects.toMatchObject({ kod: 'RUXSAT_YOQ' });
    expect(ijro).not.toHaveBeenCalled();
  });
  it('IDEMPOTENT qayta urinish: xuddi shu operation_id ikkinchi marta yozmaydi', async () => {
    const ctx = ctxQur({ obyektId: 11 }); const { ij: i, ijro } = ij();
    const s = sessiyaBosh(zayavka, 'КР-5 uchun zayavka och', ctx, 'op-1'); s.params.miqdor = 5; holat(zayavka, s, ctx);
    const a = await bajar(zayavka, s, { karta: true, ikkinchi: false }, ctx, i);
    const b = await bajar(zayavka, s, { karta: true, ikkinchi: false }, ctx, i);
    expect(ijro).toHaveBeenCalledTimes(1);
    expect(a.takror).toBeUndefined();
    expect(b.takror).toBe(true);
  });
  it('muvaffaqiyatsiz ijro keshlanmaydi: qayta urinish yana chaqiradi (server operation_id bilan idempotent)', async () => {
    const ctx = ctxQur({ obyektId: 11 });
    const ijro = vi.fn().mockResolvedValueOnce({ ok: false, xabar: 'tarmoq' }).mockResolvedValueOnce({ ok: true, xabar: 'ok' });
    const i: Ijrochi = { korinish: () => ({ matn: '' }), ijro };
    const s = sessiyaBosh(zayavka, 'КР-5 uchun zayavka och', ctx, 'op-2'); s.params.miqdor = 5; holat(zayavka, s, ctx);
    expect((await bajar(zayavka, s, { karta: true, ikkinchi: false }, ctx, i)).ok).toBe(false);
    expect((await bajar(zayavka, s, { karta: true, ikkinchi: false }, ctx, i)).ok).toBe(true);
    expect(ijro).toHaveBeenCalledTimes(2);
    expect(korinish(zayavka, s, ctx).matn).toContain('Zayavka');
  });
});