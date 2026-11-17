import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ARXIV_SIYOSATLARI, TARIX_NAQSHI, siyosatOl } from '../../../functions/_shared/arxiv-siyosat';
import { arxivKalit, yuklashTekshir } from '../../../functions/_shared/r2-saqlash';

const ILDIZ = join(process.cwd(), '..');
const MIG = join(ILDIZ, 'supabase', 'migrations');
const ASOS = '20261224300000_t2_arxiv_platforma_v1.sql';
const migratsiyalar = () => readdirSync(MIG).filter((f) => f.endsWith('.sql') && !/\.(rollback|acceptance)\.sql$/.test(f)).sort();

describe('saqlash siyosati reyestri', () => {
  it('TS reyestri DB seed (migratsiya + keyingi saqlash_kun yangilanishlari) bilan aynan mos', () => {
    const sql = readFileSync(join(MIG, ASOS), 'utf8');
    const kun = new Map<string, string>();
    const rejim = new Map<string, string>();
    for (const m of sql.matchAll(/^\s*\('([a-z0-9_.]+)',\s*'(qator-arxiv|snapshot-sovuq|saqlanadi)',\s*(null|\d+),/gm)) { rejim.set(m[1], m[2]); kun.set(m[1], m[3] === 'null' ? '' : m[3]); }
    for (const f of migratsiyalar().filter((x) => x > ASOS)) {
      const s = readFileSync(join(MIG, f), 'utf8').replace(/--.*$/gm, '');
      /* Keyingi migratsiyalarda qo'shilgan yangi siyosat qatorlari (insert ... values ('jadval', 'rejim', kun, ...)). */
      for (const m of s.matchAll(/^\s*\('([a-z0-9_.]+)',\s*'(qator-arxiv|snapshot-sovuq|saqlanadi)',\s*(null|\d+),/gm)) {
        if (/insert\s+into\s+public\.t2_arxiv_siyosat/i.test(s)) { rejim.set(m[1], m[2]); kun.set(m[1], m[3] === 'null' ? '' : m[3]); }
      }
      for (const m of s.matchAll(/update\s+public\.t2_arxiv_siyosat\s+set\s+saqlash_kun\s*=\s*(\d+)\s+where\s+jadval\s*=\s*'([a-z0-9_.]+)'/gi)) kun.set(m[2], m[1]);
    }
    const seed = [...rejim.keys()].map((j) => `${j}|${rejim.get(j)}|${kun.get(j)}`).sort();
    const ts = ARXIV_SIYOSATLARI.map((s) => `${s.jadval}|${s.rejim}|${s.saqlashKun ?? ''}`).sort();
    expect(seed).toEqual(ts);
  });

  it('muddatlar: 4 ta jurnal/qoralama 7 kun, t2_ozgarish 30 kun (muhr farq ko\'rinishi o\'qiydi)', () => {
    for (const j of ['t2_onboarding_command_log', 't2_addrepl_command', 't2_audit_log', 't2_f2_import_draft_qator']) expect(siyosatOl(j)?.saqlashKun, j).toBe(7);
    expect(siyosatOl('t2_ozgarish')?.saqlashKun).toBe(30);
    expect(siyosatOl('snapshot.bolak_mazmun')?.saqlashKun).toBe(30);
  });
  it('qator-arxiv yozuvlarida kalit, vaqt va muddat bor; takror jadval yo\'q', () => {
    for (const s of ARXIV_SIYOSATLARI.filter((x) => x.rejim === 'qator-arxiv')) expect([s.kalit, s.kalitTur, s.vaqt, s.saqlashKun].every(Boolean), s.jadval).toBe(true);
    expect(new Set(ARXIV_SIYOSATLARI.map((s) => s.jadval)).size).toBe(ARXIV_SIYOSATLARI.length);
  });

  it('GUARD: ASOS dan keyingi migratsiyada yaratilgan tarix/log/versiya/snapshot/qoralama jadvali reyestrda bo\'lishi SHART', () => {
    const buzilgan: string[] = [];
    for (const f of migratsiyalar().filter((x) => x > ASOS)) {
      const sql = readFileSync(join(MIG, f), 'utf8').replace(/--.*$/gm, '');
      for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:(\w+)\.)?"?(\w+)"?/gi)) {
        const sxema = (m[1] ?? 'public').toLowerCase(); const nom = m[2].toLowerCase();
        const tarix = sxema === 'snapshot' || TARIX_NAQSHI.test(nom);
        const kalit = sxema === 'public' ? nom : `${sxema}.${nom}`;
        if (tarix && !siyosatOl(kalit)) buzilgan.push(`${f}: ${kalit}`);
      }
    }
    expect(buzilgan, 'Yangi tarix/log-ga o\'xshash jadval functions/_shared/arxiv-siyosat.ts (va t2_arxiv_siyosat seed) da e\'lon qilinishi kerak:\n' + buzilgan.join('\n')).toEqual([]);
  });

  it('arxiv kaliti sxemasi va yuklash tekshiruvi', () => {
    expect(arxivKalit('t2_ozgarish', new Date('2026-03-09T00:00:00Z'), '1-9-abcd1234')).toBe('arxiv/t2_ozgarish/2026/03/1-9-abcd1234.ndjson.gz');
    expect(() => arxivKalit('../x', new Date(), 'abc')).toThrow();
    expect(yuklashTekshir({ nom: 'a.xlsx', mime: 'application/octet-stream', bayt: 10 }).ok).toBe(true);
    expect(yuklashTekshir({ nom: 'a.exe', bayt: 10 })).toEqual({ ok: false, code: 'MIME_REJECTED' });
    expect(yuklashTekshir({ nom: 'a.pdf', bayt: 0 })).toEqual({ ok: false, code: 'EMPTY_FILE' });
    expect(yuklashTekshir({ nom: 'a.pdf', bayt: 11, maxBayt: 10 })).toEqual({ ok: false, code: 'FILE_TOO_LARGE' });
  });

  it('rollback va acceptance fayllari mavjud', () => {
    for (const s of ['.rollback.sql', '.acceptance.sql']) expect(existsSync(join(MIG, ASOS.replace('.sql', s)))).toBe(true);
  });
});
