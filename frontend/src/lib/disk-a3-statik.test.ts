import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Disk A3 migratsiya (statik invariantlar)', () => {
  const MIG = join(process.cwd(), '..', 'supabase', 'migrations');
  const s = (q: string) => readFileSync(join(MIG, `20270113400000_t2_disk_a3_v1${q}.sql`), 'utf8');
  it('royxat A1 nusxasi + yangi maydonlar; faqat service_role; o‘z begin/commit yo‘q', () => {
    const sql = s('');
    for (const k of ["'manba_turi', f.manba_turi", "'obyekt_id', rg.obyekt_id", "'tizim_hujjat', f.hujjat_kalit is not null", "'tizim', p.tizim"]) expect(sql).toContain(k);
    expect(sql).toContain('t2_hm_registry_joy_v1');
    expect(sql).toMatch(/revoke all on function public\.%s from public, anon, authenticated/);
    expect(sql).toMatch(/grant execute on function public\.%s to service_role/);
    expect(sql).not.toMatch(/^\s*(begin|commit)\s*;/im);
  });
  it('rollback A1 shakliga qaytaradi; acceptance ruxsat va maydonlarni tekshiradi', () => {
    const rb = s('.rollback');
    expect(rb).toContain('drop function if exists public.t2_hm_registry_joy_v1');
    expect(rb).not.toContain("'manba_turi'");
    const a = s('.acceptance');
    for (const k of ['ACC1', 'ACC2', 'ACC3', 'ACC4', 'RUXSAT_YOQ']) expect(a).toContain(k);
  });
});

describe('Disk A3: UI invariantlari (statik)', () => {
  const src = (...p: string[]) => readFileSync(join(process.cwd(), 'src', ...p), 'utf8');
  it('eski FaylMenejer foydalanuvchi sahifasida yo‘q; R2/DB panellari faqat BoshqaruvBolim ichida va superadmin sharti bilan', () => {
    const sahifa = src('hujjat-maydoni', 'HujjatMaydoni.tsx').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(sahifa).not.toMatch(/FaylMenejer|R2DublikatPanel|DbHajmPanel/);
    const bosh = src('hujjat-maydoni', 'BoshqaruvBolim.tsx');
    expect(bosh).toMatch(/\{superadmin && \(\s*<section[\s\S]*<DbHajmPanel \/>[\s\S]*<R2DublikatPanel \/>/);
  });
});