/**
 * QO'RIQCHI (egasi 2026-10-29): «t2_qator o'quvchisi versiyani hisobga olishi shart» (AGENTS.md §2c).
 * 1) 20261114900000 migratsiyasi: A o'quvchilar faqat faol, qo'riqchi (ruxsat jadvali + audit + signal), aniq rollback, qabul.
 * 2) Keyingi har migratsiyadagi yangi funksiya/view t2_qator ni o'qisa — versiya_holat, ruxsat yozuvi yoki «versiya: <toifa>»
 *    izohi bo'lishi shart (bazadagi `t2_versiya_xabardorlik_audit_v1()` ning CI dagi ko'zgusi).
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dir = resolve(__dirname, '../../../../supabase/migrations');
const NOM = '20261114900000_t2_versiya_tizim_darajasi_v1';
const oqi = (f: string) => readFileSync(resolve(dir, f), 'utf8');
const migr = oqi(`${NOM}.sql`);
const rb = oqi(`${NOM}.rollback.sql`);
const acc = oqi(`${NOM}.acceptance.sql`);

/** `create or replace function|view public.<nom>` bloklari: nom → matn (keyingi create gacha). */
function bloklar(sql: string): Array<{ nom: string; matn: string }> {
  const re = /create\s+or\s+replace\s+(?:function|view)\s+public\.([a-z0-9_]+)/gi;
  const joy: Array<{ nom: string; i: number }> = [];
  for (let m = re.exec(sql); m; m = re.exec(sql)) joy.push({ nom: m[1], i: m.index });
  return joy.map((x, k) => ({ nom: x.nom, matn: sql.slice(x.i, k + 1 < joy.length ? joy[k + 1].i : sql.length) }));
}
const T2_QATOR = /\bt2_qator\b(?!_)/;

const A_TUZATILDI = [
  't2_narx_dalil_holat', 't2_narx_markaz', 't2_narx_qol_xavf', 't2_narx_taklif', 't2_topilmaganlar', 'v_sklad_nomlar',
  't2_agent_fakt_v1', 't2_agent_qidiruv_v1', 't2_ai_kontekst', 't2_ai_umumiy', 't2_mindmap_grafi', 't2_agent_ishchi_narx_audit_v1',
  't2_agent_ishchi_ombor_v1', 't2_narxla', 't2_smeta_narxla_res_v1', 't2_smeta_narxla_res_v2', 't2_smeta_narxla_res_v3',
  't2_viborka_smetadan_toldir', 't2_signal_refresh_object', 't2_rollup', 't2_object_financials_v1', 't2_workbench_v1',
  't2_resurs_narx_taklif_v1', 't2_resurs_qidir_v1', 't2_ish_turi_qidir_v1',
];

describe('20261114900000 — smeta versiyasi tizim darajasida', () => {
  const fwd = new Map(bloklar(migr).map((b) => [b.nom, b.matn]));
  const back = new Map(bloklar(rb).map((b) => [b.nom, b.matn]));

  it('har A (smeta asosi) o‘quvchi faqat faol qatorlarni oladi; rollback aynan oldingi ta’rifni tiklaydi', () => {
    for (const nom of A_TUZATILDI) {
      const yangi = fwd.get(nom); const eski = back.get(nom);
      expect(yangi, nom).toBeTruthy();
      expect(eski, nom).toBeTruthy();
      expect(yangi!, nom).toMatch(/versiya_holat\s*(=|<>)\s*'faol'/);
      expect(eski!, nom).not.toMatch(/versiya_holat/);
    }
    expect(bloklar(migr).filter((b) => b.nom !== 't2_versiya_xabardorlik_audit_v1' && b.nom !== 't2_versiya_xabardorlik_signal_v1')).toHaveLength(A_TUZATILDI.length);
  });

  it('F2/fakt tarixi o‘zgarmaydi: tuzatilgan ta’riflarda akt_qator filtrlari olib tashlanmagan', () => {
    for (const nom of ['t2_object_financials_v1', 't2_workbench_v1', 't2_agent_fakt_v1']) {
      const n = (s: string) => (s.match(/t2_akt_qator/g) ?? []).length;
      expect(n(fwd.get(nom)!), nom).toBeGreaterThanOrEqual(n(back.get(nom)!));
    }
  });

  it('qo‘riqchi: ruxsat jadvali (RLS, faqat service_role), audit, signal; rollback olib tashlaydi', () => {
    expect(migr).toMatch(/create table if not exists public\.t2_versiya_xabardorlik_ruxsat/);
    expect(migr).toMatch(/enable row level security/);
    expect(migr).toMatch(/revoke all on public\.t2_versiya_xabardorlik_ruxsat from public, anon, authenticated/);
    expect(migr).toMatch(/grant execute on function public\.t2_versiya_xabardorlik_audit_v1\(\) to service_role/);
    expect(migr).toMatch(/t2_signal_producer_apply\(p_kompaniya_id, 'tizim', 'versiya_xabardorlik', 'data_quality'/);
    expect(rb).toMatch(/drop table if exists public\.t2_versiya_xabardorlik_ruxsat/);
    expect(rb).toMatch(/drop function if exists public\.t2_versiya_xabardorlik_audit_v1\(\)/);
    // B/C ruxsat yozuvlari sabab bilan; A o'quvchi ruxsat ro'yxatiga kirmaydi.
    const ruxsat = [...migr.matchAll(/\('([a-z0-9_]+)','(tarix|texnik|eskirgan|versiya)','([^']|'')+'\)/g)].map((m) => m[1]);
    expect(ruxsat.length).toBeGreaterThanOrEqual(70);
    for (const nom of A_TUZATILDI) expect(ruxsat, nom).not.toContain(nom);
  });

  it('qabul: sintetik, ROLLBACK, audit bo‘sh, A — faqat faol jami, B — F2 tarixi saqlanadi', () => {
    expect(acc.trim().startsWith('--')).toBe(true);
    expect(acc).toMatch(/^begin;/m);
    expect(acc.trim().endsWith('rollback;')).toBe(true);
    expect(acc).toMatch(/t2_versiya_xabardorlik_audit_v1\(\)/);
    expect(acc).toMatch(/t2_smeta_versiya_faollashtir_v1/);
    expect(acc).toMatch(/is distinct from 1100/);
    expect(acc).toMatch(/t2_f2_tafsilot/);
    expect(acc).not.toMatch(/\b(162|163|164|165|166|167|168|170|175)\b/);
  });
});

describe('keyingi migratsiyalar: t2_qator o‘quvchisi versiyani hisobga oladi', () => {
  const keyingi = readdirSync(dir).filter((f) => /^\d{14}_.+\.sql$/.test(f) && !/\.(rollback|acceptance)\.sql$/.test(f) && f.slice(0, 14) > '20261114900000');
  it('har yangi funksiya/view: versiya_holat | ruxsat yozuvi | «versiya: <toifa>» izohi', () => {
    const xato: string[] = [];
    for (const f of keyingi) {
      const sql = oqi(f);
      for (const b of bloklar(sql)) {
        if (!T2_QATOR.test(b.matn) || /versiya_holat/.test(b.matn)) continue;
        const ruxsat = new RegExp(`t2_versiya_xabardorlik_ruxsat[\\s\\S]*'${b.nom}'\\s*,\\s*'(tarix|texnik|eskirgan|versiya)'`).test(sql);
        const izoh = new RegExp(`comment on (function|view) public\\.${b.nom}\\b[\\s\\S]{0,2000}?versiya:\\s*(tarix|texnik|eskirgan|versiya)`, 'i').test(sql);
        if (!ruxsat && !izoh) xato.push(`${f}: ${b.nom}`);
      }
    }
    expect(xato, 't2_qator ni versiyasiz o‘qiydigan yangi obyekt (AGENTS.md §2c)').toEqual([]);
  });
});
