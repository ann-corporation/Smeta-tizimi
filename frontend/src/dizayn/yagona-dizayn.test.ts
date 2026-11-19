import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { f2LifecycleLabels } from '../lib/f2-lifecycle-workflow';
import { foizMatni, hajmMatni, pulMatni } from '../lib/format-yagona';
import { ASOSIY_ISH_JOYLARI, ISH_JOYI_META } from '../lib/reestr/ishJoyi';

const ildiz = resolve(__dirname, '../../..');
type Namuna = { in: number | null; out: string };
const fixtures = JSON.parse(readFileSync(resolve(ildiz, 'design/fixtures/format.json'), 'utf8')) as Record<'money' | 'volume' | 'percent', Namuna[]>;
const tokens = JSON.parse(readFileSync(resolve(ildiz, 'design/tokens.json'), 'utf8'));

describe('yagona dizayn: tokens generatori', () => {
  it('generatsiya qilingan fayllar eskirmagan (node scripts/gen-design-tokens.mjs --check)', () => {
    expect(() => execFileSync(process.execPath, [resolve(ildiz, 'scripts/gen-design-tokens.mjs'), '--check'], { stdio: 'pipe' })).not.toThrow();
  });

  it('rang tokenlari har ikki mavzuda bir xil kalitlarga ega va to‘g‘ri hex', () => {
    const tun = Object.keys(tokens.color.dark).sort();
    expect(Object.keys(tokens.color.light).sort()).toEqual(tun);
    for (const m of ['dark', 'light']) for (const v of Object.values<string>(tokens.color[m])) expect(v).toMatch(/^#[0-9a-f]{6}([0-9a-f]{2})?$/);
  });

  it('navigatsiya bo‘lim nomlari va tartibi saytning ish joylari bilan bir xil (Android/Windows shu tokenlardan)', () => {
    expect(tokens.nav.map((s: { id: string }) => s.id)).toEqual([...ASOSIY_ISH_JOYLARI]);
    for (const s of tokens.nav as { id: keyof typeof ISH_JOYI_META; title: string }[]) expect(s.title).toBe(ISH_JOYI_META[s.id].nom);
  });

  it('F-2 holat yorliqlari saytning lifecycle yorliqlari bilan bir xil', () => {
    const f2 = tokens.status.f2 as Record<string, { label: string }>;
    expect(Object.keys(f2).sort()).toEqual(Object.keys(f2LifecycleLabels).sort());
    for (const [k, v] of Object.entries(f2)) expect(v.label).toBe((f2LifecycleLabels as Record<string, string>)[k]);
  });
});

describe('yagona dizayn: raqam formati (design/fixtures/format.json)', () => {
  it.each(fixtures.money)('pul $in', ({ in: v, out }) => expect(pulMatni(v)).toBe(out));
  it.each(fixtures.volume)('hajm $in', ({ in: v, out }) => expect(hajmMatni(v)).toBe(out));
  it.each(fixtures.percent)('foiz $in', ({ in: v, out }) => expect(foizMatni(v)).toBe(out));
  it('NaN va undefined — «—», nol emas', () => {
    expect(pulMatni(undefined)).toBe('—');
    expect(pulMatni(Number.NaN)).toBe('—');
  });
});
