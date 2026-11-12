import { describe, expect, it } from 'vitest';
import { boglanishQoidasi, uzishQoidasi, type BoglanishKontekst, type TugunTavsif } from './mindmap-boglanish';

const k: BoglanishKontekst = { tahrir: true, yopiqSabab: null, masulMumkin: true };
const T = (id: string, nom = id, meta: Record<string, unknown> | null = null): TugunTavsif => ({ id, tur: id.split(':')[0] as TugunTavsif['tur'], nom, meta });

describe('boglanishQoidasi: juftlik → amal', () => {
  it.each([
    ['loyiha:1', 'obyekt:2', 'obyekt_loyiha'], ['loyiha:1', 'shartnoma:3', 'shartnoma_loyiha'], ['shartnoma:3', 'obyekt:2', 'shartnoma_obyekt'],
    ['sklad:4', 'obyekt:2', 'sklad_obyekt'], ['texnika:5', 'obyekt:2', 'texnika_obyekt'], ['kadr:6', 'obyekt:2', 'kadr_obyekt'],
  ])('%s — %s → mindmap_bog %s', (a, b, tur) => {
    const q = boglanishQoidasi(T(a), T(b), k);
    expect(q.holat).toBe('ishlaydi');
    if (q.holat === 'ishlaydi') { expect(q.amal).toBe('mindmap_bog'); expect(q.bogTur).toBe(tur); expect(q.tavsif.length).toBeGreaterThan(10); }
  });

  it('teskari yo‘nalishda ham to‘g‘ri tomon manba bo‘ladi', () => {
    const q = boglanishQoidasi(T('obyekt:2'), T('shartnoma:3'), k);
    expect(q.holat === 'ishlaydi' && q.manba.id).toBe('shartnoma:3');
  });

  it('kontragent → loyiha: qatnashchi (rol so‘raladi)', () => {
    const q = boglanishQoidasi(T('kontragent:9'), T('loyiha:1'), k);
    expect(q.holat === 'ishlaydi' && q.amal).toBe('qatnashchi');
  });

  it('kompaniya → loyiha: tuzilmaviy, rad', () => {
    const q = boglanishQoidasi(T('kompaniya:1'), T('loyiha:1'), k);
    expect(q.holat).toBe('rad');
  });

  it('kompaniya → kontragent: STIR bor — tomon taklifi; STIR yo‘q — sabab bilan rad', () => {
    const yaxshi = boglanishQoidasi(T('kompaniya:1'), T('kontragent:9', 'MChJ', { inn: '123456789' }), k);
    expect(yaxshi.holat === 'ishlaydi' && yaxshi.amal).toBe('tomon_taklif');
    const yomon = boglanishQoidasi(T('kompaniya:1'), T('kontragent:9', 'MChJ', {}), k);
    expect(yomon.holat === 'rad' && yomon.sabab).toMatch(/STIR/);
  });

  it('tomon → obyekt/loyiha/shartnoma: faol aloqada ko‘rish huquqi; faol bo‘lmasa rad', () => {
    for (const d of ['obyekt:2', 'loyiha:1', 'shartnoma:3']) {
      const q = boglanishQoidasi(T('tomon:7', 'Nazorat', { holat: 'faol' }), T(d), k);
      expect(q.holat === 'ishlaydi' && q.amal).toBe('tomon_grant');
    }
    const r = boglanishQoidasi(T('tomon:7', 'Nazorat', { holat: 'taklif' }), T('obyekt:2'), k);
    expect(r.holat).toBe('rad');
  });

  it('odam → obyekt/loyiha: mas’ul; ruxsat yo‘q — rad', () => {
    expect(boglanishQoidasi(T('foydalanuvchi:3'), T('obyekt:2'), k).holat).toBe('ishlaydi');
    expect(boglanishQoidasi(T('foydalanuvchi:3'), T('loyiha:1'), k).holat).toBe('ishlaydi');
    expect(boglanishQoidasi(T('foydalanuvchi:3'), T('obyekt:2'), { ...k, masulMumkin: false }).holat).toBe('rad');
  });

  it('tomon ↔ tomon (pudratchi → subpudratchi topshirish): back-end ulanmagan — «yoq», soxta emas', () => {
    expect(boglanishQoidasi(T('tomon:7'), T('tomon:8'), k).holat).toBe('yoq');
  });

  it('qoidasiz juftlik: «bog‘lab bo‘lmaydi» + sabab; o‘zi bilan; tahrir ruxsati yo‘q', () => {
    const q = boglanishQoidasi(T('sklad:4'), T('texnika:5'), k);
    expect(q.holat === 'rad' && q.sabab).toMatch(/bog‘lab bo‘lmaydi/);
    expect(boglanishQoidasi(T('obyekt:2'), T('obyekt:2'), k).holat).toBe('rad');
    const y = boglanishQoidasi(T('loyiha:1'), T('obyekt:2'), { ...k, tahrir: false, yopiqSabab: 'ruxsat yo‘q' });
    expect(y.holat === 'rad' && y.sabab).toBe('ruxsat yo‘q');
  });
});

describe('uzishQoidasi: chiziqni o‘chirish = aloqani tugatish', () => {
  it('amallar turiga qarab; tuzilmaviy — rad; ruxsat yo‘q — rad', () => {
    expect(uzishQoidasi({ tur: 'tomon_grant', uzsa_boladi: true }, k)).toMatchObject({ holat: 'ishlaydi', amal: 'tomon_grant_bekor' });
    expect(uzishQoidasi({ tur: 'tomon_aloqa', uzsa_boladi: true }, k)).toMatchObject({ amal: 'tomon_aloqa_toxtat' });
    expect(uzishQoidasi({ tur: 'masul_obyekt', uzsa_boladi: true }, k)).toMatchObject({ amal: 'masul_ol' });
    expect(uzishQoidasi({ tur: 'masul_obyekt', uzsa_boladi: true }, { ...k, masulMumkin: false }).holat).toBe('rad');
    expect(uzishQoidasi({ tur: 'shartnoma_obyekt', uzsa_boladi: true }, k)).toMatchObject({ amal: 'mindmap_bog_ochir' });
    expect(uzishQoidasi({ tur: 'loyiha_kompaniya', uzsa_boladi: false }, k).holat).toBe('rad');
    expect(uzishQoidasi({ tur: 'shartnoma_obyekt', uzsa_boladi: true }, { ...k, tahrir: false }).holat).toBe('rad');
  });
});