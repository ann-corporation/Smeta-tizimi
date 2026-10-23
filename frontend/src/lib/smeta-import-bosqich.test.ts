import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** JONLI_SINOV_TOPILMALARI #15: katta import yakunlash — rollup alohida bosqich, ochiq sessiyani davom ettirish/bekor qilish. */
const dir = resolve(__dirname, '../../../supabase/migrations');
const fwd = readFileSync(resolve(dir, '20261106840000_t2_smeta_import_yakunla_bosqich_v1.sql'), 'utf8');
const rb = readFileSync(resolve(dir, '20261106840000_t2_smeta_import_yakunla_bosqich_v1.rollback.sql'), 'utf8');
const acc = readFileSync(resolve(dir, '20261106840000_t2_smeta_import_yakunla_bosqich_v1.acceptance.sql'), 'utf8');
const gw = readFileSync(resolve(__dirname, '../../functions/api/smeta-yukla.ts'), 'utf8');

describe('import yakunlash bosqichlari (#15)', () => {
  it('migratsiya: ikkala yakunla ham patch qilinadi, katta importda rollup kechiktiriladi, kutilmagan ta’rifda to‘xtaydi', () => {
    expect(fwd).toContain("('t2_smeta_import_yakunla_unlocked_v1', 'v_sessiya'");
    expect(fwd).toContain("('t2_smeta_paket_import_yakunla_unlocked_v1', 'v_session'");
    expect(fwd).toContain("raise exception 'Unexpected import definition: %'");
    expect(fwd).toContain("if v_soni < 5000 then perform public.t2_rollup(");
    expect(fwd).toContain("'rollup_kerak'',v_soni >= 5000");
    expect(fwd).toMatch(/create or replace function public\.t2_smeta_import_rollup_v1[\s\S]*t2_smeta_import_ruxsat[\s\S]*t2_smeta_import_object_lock_v1[\s\S]*t2_rollup\(p_obyekt_id\)/);
    expect(fwd).toMatch(/create or replace function public\.t2_smeta_import_bekor_v1[\s\S]*holat <> 'ochiq'[\s\S]*delete from public\.t2_smeta_import_bolak/);
    expect(fwd).toContain("check (holat in ('ochiq', 'yakunlandi', 'bekor'))");
    expect(fwd).toContain("set statement_timeout = '120s'");
    expect(fwd).toMatch(/revoke all on function public\.t2_smeta_import_bekor_v1[\s\S]*from public, anon, authenticated/);
  });

  it('rollback: bekor sessiya bo‘lsa to‘xtaydi, yangi RPC lar olib tashlanadi; acceptance BEGIN…ROLLBACK', () => {
    expect(rb).toContain('ROLLBACK_BLOCKED');
    expect(rb).toContain('drop function if exists public.t2_smeta_import_rollup_v1');
    expect(rb).toContain('drop function if exists public.t2_smeta_import_bekor_v1');
    expect(rb).toContain("'-- mandatory_import_rollup_v2'");
    expect(acc).toMatch(/^[\s\S]*begin;\s+do \$test\$/i);
    expect(acc.trim()).toMatch(/rollback;$/i);
  });

  it('shlyuz: yakunladan keyin rollup alohida chaqiriladi; import_rollup va import_bekor amallari bor', () => {
    expect(gw).toMatch(/async function yakunlaVaRollup[\s\S]*t2_smeta_import_rollup_v1[\s\S]*rollup_xato/);
    expect(gw).toContain("yakunlaVaRollup(env, actorId, body.kompaniyaId, 't2_smeta_import_yakunla_v1', body.sessiyaId)");
    expect(gw).toContain("yakunlaVaRollup(env, actorId, body.kompaniyaId, 't2_smeta_paket_import_yakunla_v1', body.sessiyaId)");
    expect(gw).toContain("if (body.amal === 'import_rollup') return handleImportRollup(ctx.env, actorId, body);");
    expect(gw).toContain("if (body.amal === 'import_bekor') return handleImportBekor(ctx.env, actorId, body);");
  });
});
