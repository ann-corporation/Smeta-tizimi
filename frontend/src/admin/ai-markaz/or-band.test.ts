import { describe, expect, it } from 'vitest';
import { orBand } from './or-band';
import type { Markaz } from '../../api/t2-agent-ish';

const m = (b?: Markaz['openrouter_balans'], openrouter = true) => ({ sozlama: { ai_yoqilgan: true, openrouter, github: false }, openrouter_balans: b }) as unknown as Markaz;
const b = (o: Partial<NonNullable<Markaz['openrouter_balans']>>) => ({ holat: 'ok' as const, qoldiq_usd: null, sarflangan_usd: null, kalit_qoldiq_usd: null, ...o });

describe('AI markazi: OpenRouter balansi bandi', () => {
  it('kalit yo‘q / rad etilgan / kredit tugagan — qizil', () => {
    expect(orBand(m(undefined, false)).holat).toBe('kerak');
    expect(orBand(m(b({ holat: 'rad_etildi' }))).izoh).toMatch(/rad etdi/);
    expect(orBand(m(b({ qoldiq_usd: 0 }))).holat).toBe('kerak');
  });
  it('kam qoldi — sariq; yetarli — yashil va summa ko‘rinadi; kalit limiti kichik bo‘lsa u olinadi', () => {
    expect(orBand(m(b({ qoldiq_usd: 1.5 }))).holat).toBe('ogoh');
    const ok = orBand(m(b({ qoldiq_usd: 12.5, sarflangan_usd: 40 })));
    expect(ok.holat).toBe('ok'); expect(ok.izoh).toMatch(/12/);
    expect(orBand(m(b({ qoldiq_usd: 50, kalit_qoldiq_usd: 0 }))).holat).toBe('kerak');
  });
});
