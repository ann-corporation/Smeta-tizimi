import { describe, expect, it } from 'vitest';
import { forma3YaratTekshir } from './forma3-skop';

const asos = { akt_ids: [1, 2, '3'], davr_boshi: '2026-03-01', davr_oxiri: '2026-03-31' };

describe('forma3YaratTekshir — obyekt yoki shartnoma scope', () => {
  it('shartnoma rejimi: obyekt yo‘q + shartnoma_id yetarli', () => {
    const r = forma3YaratTekshir({ ...asos, shartnoma_id: 25, loyiha_id: 22 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.p).toMatchObject({ obyektId: null, shartnomaId: 25, loyihaId: 22, aktIds: [1, 2, 3] });
  });
  it('obyekt rejimi o‘zgarmagan', () => {
    const r = forma3YaratTekshir({ ...asos, obyekt_id: '7' });
    expect(r.ok && r.p.obyektId === 7 && r.p.shartnomaId === null).toBe(true);
  });
  it('na obyekt, na shartnoma — rad', () => {
    expect(forma3YaratTekshir({ ...asos })).toEqual({ ok: false, code: 'PARAMS' });
  });
  it('noto‘g‘ri id / bo‘sh aktlar / noto‘g‘ri sana / teskari davr — rad', () => {
    expect(forma3YaratTekshir({ ...asos, shartnoma_id: 'abc' }).ok).toBe(false);
    expect(forma3YaratTekshir({ ...asos, shartnoma_id: -1 }).ok).toBe(false);
    expect(forma3YaratTekshir({ ...asos, shartnoma_id: 1, akt_ids: [] }).ok).toBe(false);
    expect(forma3YaratTekshir({ ...asos, shartnoma_id: 1, akt_ids: [1, 'x'] }).ok).toBe(false);
    expect(forma3YaratTekshir({ ...asos, shartnoma_id: 1, davr_boshi: '31.03.2026' }).ok).toBe(false);
    expect(forma3YaratTekshir({ ...asos, shartnoma_id: 1, davr_boshi: '2026-04-01', davr_oxiri: '2026-03-01' }).ok).toBe(false);
  });
  it('takror akt idlari bir marta', () => {
    const r = forma3YaratTekshir({ ...asos, shartnoma_id: 1, akt_ids: [5, 5, 6] });
    expect(r.ok && r.p.aktIds).toEqual([5, 6]);
  });
});
