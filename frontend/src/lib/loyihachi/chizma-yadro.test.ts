import { describe, expect, it } from 'vitest';
import { LOYIHACHI_AMALLAR } from './amallar';
import { aosrLoyihaHujjatiMatni, bugunTomoni, bugunTugmalari, chizmaXulosaMatni, joriyRevizyasi, revizyaHolatlari, varaqlarga } from './chizma-yadro';

const t = (revizyalar: Array<{ id: number; revizya: number; holat: 'qoralama' | 'ruxsat' | 'bekor' }>, o: Record<string, unknown> = {}) => ({
  id: 1, bosqich: 'RD' as const, marka: 'КЖ', varaq: '12', nom: null,
  revizyalar: revizyalar.map((r) => ({ ...r, ozgarish_izohi: r.revizya ? 'o‘zgardi' : null, ruxsat_vaqti: r.holat === 'ruxsat' ? '2026-11-12T10:00:00Z' : null })), ...o,
});

describe('revizya holatlari (mavjud chizma-revizya mantig‘i)', () => {
  it('joriy / eskirgan / ruxsatsiz', () => {
    const x = t([{ id: 1, revizya: 0, holat: 'ruxsat' }, { id: 2, revizya: 1, holat: 'ruxsat' }, { id: 3, revizya: 2, holat: 'qoralama' }]);
    const h = revizyaHolatlari([x]);
    expect(h.get(1)).toBe('eskirgan'); expect(h.get(2)).toBe('joriy'); expect(h.get(3)).toBe('ruxsatsiz');
    expect(joriyRevizyasi(x.revizyalar)?.revizya).toBe(1);
    expect(varaqlarga([x])).toHaveLength(3);
  });
});

describe('АОСР «loyiha hujjati» matni', () => {
  it('tartiblangan, joriy revizya va sana bilan', () => {
    const m = aosrLoyihaHujjatiMatni([
      { marka: 'КЖ', varaq: '12', bosqich: 'RD', revizya: 3, sana: '2026-11-12T10:00:00Z' },
      { marka: 'АР', varaq: '2', bosqich: 'PD', revizya: 0 },
    ]);
    expect(m).toBe('АР-2 (PD), рев. 0; КЖ-12 (RD), рев. 3 от 12.11.2026');
    expect(aosrLoyihaHujjatiMatni([])).toBe('');
  });
});

describe('rol uyi «Bugun»', () => {
  it('rol → tomon', () => {
    expect(bugunTomoni('loyihachi')).toBe('loyihachi'); expect(bugunTomoni('inspektor')).toBe('texnadzor'); expect(bugunTomoni('pto')).toBe('pudratchi');
  });
  it('4–6 tugma har tomonga; sanoq yo‘q — son null (0 emas); ogohlantirish kechikkan/eskirganda', () => {
    for (const tomon of ['loyihachi', 'pudratchi', 'texnadzor'] as const) {
      const l = bugunTugmalari(tomon, null);
      expect(l.length).toBeGreaterThanOrEqual(3); expect(l.length).toBeLessThanOrEqual(6);
      expect(l.every((x) => x.son === null && x.yol.startsWith('/admin/'))).toBe(true);
    }
    const lo = bugunTugmalari('loyihachi', { savol_menga: 3, savol_kechikkan: 1, remark_ochiq: 0 });
    expect(lo.find((x) => x.kalit === 'savol')).toMatchObject({ son: 3, ogoh: true });
    expect(lo.find((x) => x.kalit === 'remark')).toMatchObject({ son: 0, ogoh: false });
    expect(bugunTugmalari('pudratchi', { eskirgan_boglanish: 2 }).find((x) => x.kalit === 'eskirgan')).toMatchObject({ son: 2, ogoh: true });
    expect(bugunTugmalari('loyihachi', null).some((x) => x.yol.includes('turi=savol'))).toBe(true);
    expect(bugunTugmalari('loyihachi', null).some((x) => x.yol.includes('turi=mualliflik_remark'))).toBe(true);
  });
});

describe('AI xulosa va amallar reyestri', () => {
  it('chizmaXulosaMatni: eskirgan bog‘lanish belgilanadi, summa yo‘q', () => {
    const x = t([{ id: 1, revizya: 0, holat: 'ruxsat' }, { id: 2, revizya: 1, holat: 'ruxsat' }]);
    const s = chizmaXulosaMatni([x], [{ toplam_id: 1, ishlatilgan: 0, joriy: 1, qator_id: 5, aosr_raqam: null, aosr_id: null }]);
    expect(s).toContain('КЖ-12 (RD): joriy rev. 1'); expect(s).toContain('ESKIRGAN revizyaga: 1');
    expect(chizmaXulosaMatni([])).toMatch(/chizma yo‘q/);
  });
  it('har amal capability va RPC (_v1) bilan; yozuvchi — dryRun; kalitlar yagona', () => {
    expect(new Set(LOYIHACHI_AMALLAR.map((a) => a.kalit)).size).toBe(LOYIHACHI_AMALLAR.length);
    for (const a of LOYIHACHI_AMALLAR) { expect(a.rpc).toMatch(/^t2_[a-z_]+_v1$/); expect(a.capability).toMatch(/^[a-z]+\.[a-z]+$/); expect(a.ai.dryRun).toBe(a.turi === 'yozish'); }
  });
});
