/**
 * 20261203001300 — «smeta — const» (egasi 2026-11-06) migratsiya kontrakti (repo darajasi; bazadagi qabul — .acceptance.sql).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dir = resolve(__dirname, '../../../supabase/migrations');
const NOM = '20261203001300_t2_smeta_asl_const_v1';
const oqi = (f: string) => readFileSync(resolve(dir, f), 'utf8');
const migr = oqi(`${NOM}.sql`);
const rb = oqi(`${NOM}.rollback.sql`);
const acc = oqi(`${NOM}.acceptance.sql`);

describe('20261203001300 — smeta (asl) const + o‘zgarishlar qatlami', () => {
  it('yagona asl predikati va smeta o‘qishlari faqat asl', () => {
    expect(migr).toMatch(/create or replace function public\.t2_qator_asl_v1\(p_change_type text, p_qoshimcha boolean, p_zamena boolean\)/);
    expect(migr).toMatch(/p_change_type is null and not coalesce\(p_qoshimcha, false\) and not coalesce\(p_zamena, false\)/);
    // _t2_summa_agg_v1 'smeta' tarmog'i asl filtri bilan; 'smeta_joriy' — yagona qatlamdan.
    expect(migr).toMatch(/where p_olchov = 'smeta' and q\.obyekt_id = any\(p_obyekt_ids\) and q\.versiya_holat = 'faol'\s+and public\.t2_qator_asl_v1\(q\.change_type, q\.qoshimcha, q\.zamena\)/);
    expect(migr).toMatch(/from public\._t2_smeta_qatlam_qator_v1\(p_obyekt_ids\) l\s+where p_olchov = 'smeta_joriy'/);
    // obyekt jamisi, PTO kartasi, ustama kesimi.
    expect(migr).toMatch(/CREATE OR REPLACE VIEW public\.t2_obyekt_jami/);
    expect(migr).toMatch(/t2_object_financials_v1/);
    expect(migr).toMatch(/t2_obyekt_nakrutka_v1/);
    // F2 / fakt / nakopitelniy puliga tegilmaydi.
    expect(migr).not.toMatch(/create or replace function public\.t2_nakopitelniy_v2/i);
    expect(migr).not.toMatch(/create or replace view public\.t2_qator_holat/i);
  });

  it('o‘zgarishlar RPC: smeta.read, tenant, faqat service_role', () => {
    expect(migr).toMatch(/create or replace function public\.t2_smeta_ozgarish_qatlam_v1\(p_obyekt_id bigint, p_actor_id bigint\)/);
    expect(migr).toMatch(/t2_actor_kompaniya_azo_tekshir\(v_k, p_actor_id\)/);
    expect(migr).toMatch(/t2_require_permission_v2\(v_k, p_actor_id, 'smeta\.read'\)/);
    expect(migr).toMatch(/revoke all on function public\.t2_smeta_ozgarish_qatlam_v1\(bigint, bigint\) from public, anon, authenticated/);
    expect(migr).toMatch(/grant execute on function public\.t2_smeta_ozgarish_qatlam_v1\(bigint, bigint\) to service_role/);
    // Zamena farqi: zamena − almashtirilgan (ikki marta emas); narxsiz zamena aslni kamaytirmaydi.
    expect(migr).toMatch(/'zamena_farq', round\(j\.zamena - j\.almashtirilgan, 2\)/);
    expect(migr).toMatch(/join zs on zs\.zamena_id = z\.id and zs\.narxli > 0/);
  });

  it('rollback avvalgi ta’riflarni tiklaydi va yangi funksiyalarni olib tashlaydi', () => {
    expect(rb).toMatch(/CREATE OR REPLACE FUNCTION public\._t2_summa_agg_v1/);
    expect(rb).not.toMatch(/smeta_joriy/);
    expect(rb).toMatch(/sum\(q\.summa\) FILTER \(WHERE q\.tur = 'rz'::text\) AS jami/);
    for (const f of ['t2_smeta_ozgarish_qatlam_v1(bigint, bigint)', '_t2_smeta_qatlam_qator_v1(bigint[])', 't2_qator_asl_v1(text, boolean, boolean)']) {
      expect(rb).toContain(`drop function if exists public.${f};`);
    }
  });

  it('qabul: sintetik, ROLLBACK, PASS belgisi, asl o‘zgarmasligi va o‘zgarish qatlami tekshiriladi', () => {
    expect(acc.trim().startsWith('--')).toBe(true);
    expect(acc).toMatch(/^begin;/m);
    expect(acc.trim().endsWith('rollback;')).toBe(true);
    expect(acc).toMatch(/SMETA_ASL_CONST_ACCEPTANCE_PASS/);
    expect(acc).toMatch(/_TEST_SMASL_/);
    expect(acc).toMatch(/t2_versiya_xabardorlik_audit_v1\(\)/);
    expect(acc).toMatch(/is distinct from 2300/);
    expect(acc).toMatch(/smeta_joriy/);
    // Real obyekt id lari ishlatilmaydi (repo PUBLIC).
    expect(acc).not.toMatch(/\b(151|162|163|167)\b/);
  });
});
