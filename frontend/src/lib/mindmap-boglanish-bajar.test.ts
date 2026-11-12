import { describe, expect, it, vi } from 'vitest';
import { boglanishQoidasi, type BoglanishKontekst, type TugunTavsif } from './mindmap-boglanish';
import { qoidaniBajar, uzishniBajar, type BajarDeps } from './mindmap-boglanish-bajar';

const k: BoglanishKontekst = { tahrir: true, yopiqSabab: null, masulMumkin: true };
const T = (id: string, nom = id, meta: Record<string, unknown> | null = { versiya: 3 }): TugunTavsif => ({ id, tur: id.split(':')[0] as TugunTavsif['tur'], nom, meta });
const ok = async () => ({ ok: true });
const deps = (): BajarDeps => ({ bog: vi.fn(ok), bogOchir: vi.fn(ok), taklif: vi.fn(ok), grantSaqla: vi.fn(ok), grantBekor: vi.fn(ok), aloqaToxtat: vi.fn(ok), masul: vi.fn(ok) });
const q = (a: TugunTavsif, b: TugunTavsif) => { const r = boglanishQoidasi(a, b, k); if (r.holat !== 'ishlaydi') throw new Error('qoida ishlamaydi'); return r; };

describe('qoidaniBajar: to‘g‘ri yozuvchi, to‘g‘ri argumentlar', () => {
  it('shartnoma → obyekt: mindmap_bog(shartnoma_obyekt, shartnoma, obyekt, maqsad versiyasi)', async () => {
    const d = deps();
    const r = await qoidaniBajar(q(T('obyekt:2'), T('shartnoma:3')), {}, d);
    expect(r.ok).toBe(true);
    expect(d.bog).toHaveBeenCalledWith('shartnoma_obyekt', 3, 2, 3);
  });

  it('kontragent → loyiha: rol majburiy; rol bilan qatnashchi', async () => {
    const d = deps();
    const qo = q(T('kontragent:9'), T('loyiha:1'));
    expect((await qoidaniBajar(qo, {}, d)).ok).toBe(false);
    expect(d.bog).not.toHaveBeenCalled();
    await qoidaniBajar(qo, { rol: 'subpudratchi' }, d);
    expect(d.bog).toHaveBeenCalledWith('qatnashchi', 9, 1, 3, 'subpudratchi');
  });

  it('kompaniya → kontragent: taklif STIR va tanlangan rol bilan', async () => {
    const d = deps();
    await qoidaniBajar(q(T('kompaniya:1'), T('kontragent:9', 'Nazorat MChJ', { inn: '123 456 789' })), { rol: 'texnadzor' }, d);
    expect(d.taklif).toHaveBeenCalledWith({ qabulInn: '123456789', qabulNom: 'Nazorat MChJ', taklifRol: 'pudratchi', qabulRol: 'texnadzor' });
  });

  it('tomon → obyekt: grantSaqla(aloqa, [{resurs, amallar, obyekt_id}]); bo‘sh tanlov — yozilmaydi', async () => {
    const d = deps();
    const qo = q(T('tomon:7', 'Buyurtmachi', { holat: 'faol' }), T('obyekt:2'));
    expect((await qoidaniBajar(qo, { grantlar: [] }, d)).ok).toBe(false);
    expect(d.grantSaqla).not.toHaveBeenCalled();
    await qoidaniBajar(qo, { grantlar: [{ resurs: 'f2', amallar: ['korish'] }, { resurs: 'aosr', amallar: [] }] }, d);
    expect(d.grantSaqla).toHaveBeenCalledWith(7, [{ resurs: 'f2', amallar: ['korish'], obyekt_id: 2 }]);
  });

  it('tomon → loyiha: grant loyiha_id bilan', async () => {
    const d = deps();
    await qoidaniBajar(q(T('tomon:7', 'B', { holat: 'faol' }), T('loyiha:1')), { grantlar: [{ resurs: 'f2', amallar: ['korish'] }] }, d);
    expect(d.grantSaqla).toHaveBeenCalledWith(7, [{ resurs: 'f2', amallar: ['korish'], loyiha_id: 1 }]);
  });

  it('odam → obyekt: mas’ul (yozish ruxsati)', async () => {
    const d = deps();
    await qoidaniBajar(q(T('foydalanuvchi:5'), T('obyekt:2')), {}, d);
    expect(d.masul).toHaveBeenCalledWith({ obyektId: 2, foydalanuvchiId: 5, ruxsat: 'write' });
  });

  it('server xatosi — xabar bilan qaytadi', async () => {
    const d = deps(); (d.bog as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, error: 'Versiya eskirgan' });
    expect(await qoidaniBajar(q(T('obyekt:2'), T('shartnoma:3')), {}, d)).toEqual({ ok: false, error: 'Versiya eskirgan' });
  });
});

describe('uzishniBajar', () => {
  it('grantlar bekor, aloqa to‘xtatiladi, mas’ul olinadi (ruxsat null)', async () => {
    const d = deps();
    await uzishniBajar('tomon_grant_bekor', { grantIdlar: [11, 12] }, d);
    expect(d.grantBekor).toHaveBeenCalledTimes(2);
    await uzishniBajar('tomon_aloqa_toxtat', { aloqaId: 7 }, d);
    expect(d.aloqaToxtat).toHaveBeenCalledWith(7);
    await uzishniBajar('masul_ol', { obyektId: 2, foydalanuvchiId: 5 }, d);
    expect(d.masul).toHaveBeenCalledWith({ obyektId: 2, foydalanuvchiId: 5, ruxsat: null });
  });
});