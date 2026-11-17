/** minus_fakt: ko'rish/juftlar/qollash (mock pg) + ro'yxatda bor + fakt_yoz MINUS juft ogohlantirishi. Ma'lumotlar SUN'IY. */
import { describe, expect, it } from 'vitest';
import { TOOLLAR } from '../src/server';
import { toolChaqir } from '../src/tool';
import { faktYoz } from '../src/tools/ish-oqimi';
import { korikXulosa, minusFakt, type KorikSatr } from '../src/tools/minus-fakt';
import { mockMuhit } from './mock';

const tavsif = (nom: string, arg: Array<[string, string]>, def: number) => ({ oid: 1, nom, default_soni: def, toplam: false, arg_nomlar: arg.map((x) => x[0]), arg_turlar: arg.map((x) => x[1]) });
const QOLLASH = tavsif('t2_fakt_minus_qollash_v1', [['p_actor_id', 'bigint'], ['p_kompaniya_id', 'bigint'], ['p_obyekt_id', 'bigint'], ['p_sana', 'date'], ['p_dry_run', 'boolean'], ['p_operation_id', 'uuid']], 2);
const FAKT_V2 = tavsif('t2_fakt_yoz_v2', [['p_obyekt_id', 'bigint'], ['p_sana', 'date'], ['p_qatorlar', 'jsonb'], ['p_actor_id', 'bigint'], ['p_operation_id', 'uuid'], ['p_izoh', 'text'], ['p_raqam', 'text'], ['p_actor_label', 'text']], 2);
const umumiy = (sql: string): Array<Record<string, unknown>> | undefined => {
  if (sql.includes("n.nspname = 'snapshot' and p.proname")) return [{ bor: true }];
  if (sql.startsWith('select snapshot.ol(')) return [{ id: 77 }];
  if (sql.includes("to_regprocedure('public.t2_audit_yoz")) return [{ bor: false }];
  if (sql.includes('select to_regclass($1)')) return [{ bor: true }];
  if (sql.includes('from public.t2_obyekt where id')) return [{ id: 900, nom: 'Sinov obyekt', kompaniya_id: 1 }];
  return undefined;
};
const K = (x: Partial<KorikSatr> & { qator_id: number; minus_id: number }): KorikSatr =>
  ({ baza_id: 1, tur: 'bl', qoida: 'hajm_bob', kod: 'E6-1-97-1', nom: 'УСТАНОВКА АРМАТУРЫ', birlik: 'т', smeta_hajm: -2, joriy_fakt: 0, kerakli_fakt: -1, farq: -1, ...x });

describe('minus_fakt yordamchilari', () => {
  it('korikXulosa: qator va minus soni, namuna soni cheklanadi', () => {
    const rows = [K({ qator_id: 11, minus_id: 11 }), K({ qator_id: 12, minus_id: 11, tur: 'mat' }), K({ qator_id: 21, minus_id: 21 })];
    const x = korikXulosa(rows, 2);
    expect(x).toMatchObject({ qator_soni: 3, minus_qator: 2 });
    expect(x.namuna).toHaveLength(2);
    expect(korikXulosa(rows, 0).namuna).toBeUndefined();
  });
  it('toollar ro\'yxatida bor, takrorlanmaydi', () => {
    const nomlar = TOOLLAR.map((t) => t.nom);
    expect(nomlar).toContain('minus_fakt');
    expect(new Set(nomlar).size).toBe(nomlar.length);
  });
});

describe('minus_fakt (mock)', () => {
  it('korik: faqat o\'qiydi (yozuvchi RPC chaqirilmaydi), xulosa qaytaradi', async () => {
    const { mu, h } = mockMuhit((sql) => umumiy(sql)
      ?? (sql.includes('t2_fakt_minus_korik_v1') ? [K({ qator_id: 11, minus_id: 11 }), K({ qator_id: 12, minus_id: 11, tur: 'mat', farq: -0.5 })] : []));
    const j = await toolChaqir(minusFakt, mu, { obyekt_id: 900 });
    expect(j.isError).toBeFalsy();
    const r = JSON.parse(j.content[0].text);
    expect(r).toMatchObject({ obyekt_id: 900, qator_soni: 2, minus_qator: 1 });
    expect(h.sorovlar.some((x) => x.sql.includes('t2_fakt_minus_qollash_v1'))).toBe(false);
  });
  it('juftlar: noaniq/juftsiz hisoboti (taxmin yo\'q)', async () => {
    const { mu } = mockMuhit((sql) => umumiy(sql)
      ?? (sql.includes('group by holat') ? [{ holat: 'aniq', soni: 5 }, { holat: 'noaniq', soni: 1 }, { holat: 'juftsiz', soni: 1 }]
        : sql.includes("j.holat <> 'aniq'") ? [{ minus_id: 31, kod: 'E11-1-11-2', nom: 'MINUS', birlik: 'м2', hajm: -50, holat: 'noaniq', nomzodlar: [3, 4] }, { minus_id: 32, kod: 'Ц3-5-1-7', nom: 'X', birlik: 'м', hajm: -3, holat: 'juftsiz', nomzodlar: null }] : []));
    const r = JSON.parse((await toolChaqir(minusFakt, mu, { obyekt_id: 900, amal: 'juftlar' })).content[0].text);
    expect(r.holatlar).toEqual({ aniq: 5, noaniq: 1, juftsiz: 1 });
    expect(r.aniqlanmagan.map((x: { minus_id: number; holat: string }) => `${x.minus_id}:${x.holat}`)).toEqual(['31:noaniq', '32:juftsiz']);
    expect(r.aniqlanmagan[0].nomzodlar).toEqual([3, 4]);
  });
  it('qollash: dry_run standart true — RPC p_dry_run=true bilan, ROLLBACK', async () => {
    const { mu, h } = mockMuhit((sql, p) => umumiy(sql)
      ?? (sql.includes('proargnames') && p[1] === 't2_fakt_minus_qollash_v1' ? [QOLLASH]
        : sql.includes('"t2_fakt_minus_qollash_v1"(') ? [{ t2_fakt_minus_qollash_v1: { ok: true, dry_run: true, qator_soni: 2, aniqlanmagan_juft: 1, qatorlar: [K({ qator_id: 11, minus_id: 11 }), K({ qator_id: 12, minus_id: 11, tur: 'mat' })] } }] : []));
    const j = await toolChaqir(minusFakt, mu, { obyekt_id: 900, amal: 'qollash' });
    expect(j.isError).toBeFalsy();
    const r = JSON.parse(j.content[0].text);
    expect(r.dry_run).toBe(true);
    expect(r.natija ?? r).toMatchObject({ qator_soni: 2, aniqlanmagan_juft: 1 });
    const c = h.sorovlar.find((x) => x.sql.includes('"t2_fakt_minus_qollash_v1"('))!;
    expect(c.params).toContain(true);
    expect(h.sorovlar.some((x) => x.sql.startsWith('ROLLBACK'))).toBe(true);
    expect(h.sorovlar.some((x) => x.sql.startsWith('COMMIT'))).toBe(false);
  });
});

describe('fakt_yoz: MINUS juft ogohlantirishi', () => {
  it('DB minus_juft_soni qaytarsa — ogohlantirish va javobda son', async () => {
    const { mu } = mockMuhit((sql, p) => umumiy(sql)
      ?? (sql.includes('from public.t2_qator_holat where obyekt_id') ? [{ qator_id: 11, nom: 'Asos', fakt_hajm: 0 }]
        : sql.includes('proargnames') && p[1] === 't2_fakt_yoz_v2' ? [FAKT_V2]
          : sql.includes('"t2_fakt_yoz_v2"(') ? [{ t2_fakt_yoz_v2: { ok: true, akt_id: 6001, minus_juft_soni: 2 } }] : []));
    const j = await toolChaqir(faktYoz, mu, { obyekt_id: 900, qatorlar: [{ qator_id: 11, hajm: 5 }] });
    expect(j.isError).toBeFalsy();
    const r = JSON.parse(j.content[0].text);
    expect(JSON.stringify(r)).toMatch(/MINUS juft: 2 qator/);
    expect(JSON.stringify(r)).toContain('"minus_juft_soni":2');
  });
});
