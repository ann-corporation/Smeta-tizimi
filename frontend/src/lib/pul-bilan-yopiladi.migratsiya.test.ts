import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pulBilanYopiladi } from './hisob-yadro';

const sql = readFileSync(resolve(__dirname, '../../../supabase/migrations/20261221950000_t2_pul_bilan_yopiladi_v2.sql'), 'utf8');

describe('20261221950000 — pul bo‘yicha yopiladigan ish: SQL va TS bir xil qoida', () => {
  it('SQL birliklari ro‘yxati TS predikatida ham pul', () => {
    const m = /in \(('[^)]*)\)\s*\n\$f\$/.exec(sql);
    expect(m).not.toBeNull();
    const birliklar = m![1]!.split(',').map((x) => x.trim().replace(/^'|'$/g, ''));
    expect(birliklar.length).toBeGreaterThanOrEqual(5);
    for (const b of birliklar) expect(pulBilanYopiladi(b, 1), b).toBe(true);
  });
  it('SQL narx = 1 shartini talab qiladi (NULL narx — emas)', () => {
    expect(sql).toMatch(/p_narx is not null and p_narx = 1/);
  });
  it('nakopitelniy: farq/baseline pul qatorida NULL, smeta_asl/smeta_joriy qo‘shilgan, drift himoyasi (yamoq 1 marta) va rollback mavjud', () => {
    expect(sql).toMatch(/'narx_variance_summa', case when public\.t2_pul_bilan_yopiladi_v1\(q\.birlik, q\.narx\) or/);
    expect(sql).toMatch(/'jami_baseline_summa', case when public\.t2_pul_bilan_yopiladi_v1/);
    expect(sql).toMatch(/'smeta_asl', v_asl, 'smeta_joriy', v_joriy/);
    expect(sql).toMatch(/yamoq topilmadi yoki takror/);
    expect(existsSync(resolve(__dirname, '../../../supabase/migrations/20261221950000_t2_pul_bilan_yopiladi_v2.rollback.sql'))).toBe(true);
  });
  it('versiya qoidasi (§2c): smeta jami o‘quvchisi faol qatorlar bilan cheklangan; yangi t2_qator o‘quvchisi yo‘q', () => {
    expect(sql).not.toMatch(/from public\.t2_qator\s+where\s+obyekt_id\s*=\s*p_obyekt_id\s*;/);
  });
});
