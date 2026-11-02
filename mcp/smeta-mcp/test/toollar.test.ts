/** Integratsiya: toollar mock pg bilan (haqiqiy ulanish yo'q; ma'lumotlar sun'iy — real mijoz ma'lumoti emas). */
import { describe, expect, it } from 'vitest';
import { serverYasa, TOOLLAR } from '../src/server';
import { toolChaqir } from '../src/tool';
import { obyektHolat, pereraschet } from '../src/tools/obyekt';
import { sqlOqish } from '../src/tools/oqish';
import { faktQamrov, qamrovMavjud } from '../src/tools/qamrov';
import { qatorTahrir, rpc } from '../src/tools/yozish';
import { mockMuhit } from './mock';

const FAKT_TAVSIF = {
  oid: 1, nom: 't2_fakt_yoz_v2', default_soni: 3, toplam: false,
  arg_nomlar: ['p_obyekt_id', 'p_sana', 'p_qatorlar', 'p_actor_id', 'p_operation_id', 'p_izoh', 'p_raqam', 'p_actor_label'],
  arg_turlar: ['bigint', 'date', 'jsonb', 'bigint', 'uuid', 'text', 'text', 'text'],
};

const umumiy = (sql: string): Array<Record<string, unknown>> | undefined => {
  if (sql.includes("n.nspname = 'snapshot' and p.proname")) return [{ bor: true }];
  if (sql.startsWith('select snapshot.ol(')) return [{ id: 77 }];
  if (sql.includes("to_regprocedure('public.t2_audit_yoz")) return [{ bor: false }];
  if (sql.includes('t2_obyekt_nakrutka_v1')) return [{ n: { ok: false, code: 'TEST' } }];
  return undefined;
};

describe('tool ro\'yxati', () => {
  it('kerakli toollar ro\'yxatdan o\'tgan, nomlar takrorlanmaydi, server quriladi', () => {
    const nomlar = TOOLLAR.map((t) => t.nom);
    expect(new Set(nomlar).size).toBe(nomlar.length);
    for (const n of ['sql_oqish', 'sxema', 'obyektlar', 'obyekt_holat', 'qator', 'qator_qidir', 'f2_royxat', 'f2', 'pereraschet', 'rpc', 'fakt_qamrov', 'f2_import',
      'qator_tahrir', 'qator_qosh', 'qator_ochir', 'sql_yozish', 'snapshot_ol', 'snapshot_royxat', 'snapshot_farq', 'snapshot_qaytar', 'aktor', 'aktor_tanla']) expect(nomlar).toContain(n);
    // Har yozuvchi tool (snapshot_ol'dan tashqari — u o'zi snapshot) dry_run qabul qiladi.
    for (const t of TOOLLAR) if (t.yozadi && t.nom !== 'snapshot_ol') expect(Object.keys(t.kirish)).toContain('dry_run');
    const { mu } = mockMuhit(() => []);
    expect(() => serverYasa(mu)).not.toThrow();
  });
  it('noma\'lum argument — aniq xato (strict)', async () => {
    const { mu } = mockMuhit(() => []);
    const j = await toolChaqir(sqlOqish, mu, { sql: 'select 1', yoq: 1 });
    expect(j.isError).toBe(true);
    expect(j.content[0].text).toMatch(/Argument xatosi/);
  });
});

describe('sql_oqish', () => {
  it('sahifalash: limit+1 qator → yana_bor', async () => {
    const { mu, h } = mockMuhit((sql) => (sql.includes('_mcp_q') ? [{ id: 1 }, { id: 2 }, { id: 3 }] : []));
    const j = await toolChaqir(sqlOqish, mu, { sql: 'select id from t2_obyekt', limit: 2 });
    const r = JSON.parse(j.content[0].text);
    expect(r.korsatildi).toBe(2);
    expect(r.yana_bor).toBe(true);
    expect(r.keyingi_offset).toBe(2);
    expect(h.sorovlar[0].sql).toBe('BEGIN TRANSACTION READ ONLY');
  });
});

describe('rpc', () => {
  it('aktor, label va operation_id avtomatik; obyekt p_obyekt_id dan; snapshot avval', async () => {
    const { mu, h } = mockMuhit((sql) => umumiy(sql) ?? (sql.includes('proargnames') ? [FAKT_TAVSIF] : sql.includes('"t2_fakt_yoz_v2"(') ? [{ t2_fakt_yoz_v2: { ok: true, akt_id: 555 } }] : []));
    const j = await toolChaqir(rpc, mu, { nom: 't2_fakt_yoz_v2', args: { p_obyekt_id: 153, p_sana: '2026-10-26', p_qatorlar: [{ qator_id: 9, hajm: 1.5 }] } });
    expect(j.isError).toBeFalsy();
    const r = JSON.parse(j.content[0].text);
    expect(r.snapshot_id).toBe(77);
    expect(r.obyekt_id).toBe(153);
    expect(r.natija.javob).toEqual({ ok: true, akt_id: 555 });
    const chaqiruv = h.sorovlar.find((x) => x.sql.includes('"t2_fakt_yoz_v2"('))!;
    expect(chaqiruv.sql).toContain('"p_actor_id" => $4::bigint');
    expect(chaqiruv.params[3]).toBe(7);
    expect(String(chaqiruv.params[4])).toMatch(/^[0-9a-f-]{36}$/);
    expect(chaqiruv.params[5]).toBe('mcp:actor:7');
    const iSnap = h.sorovlar.findIndex((x) => x.sql.startsWith('select snapshot.ol('));
    expect(iSnap).toBeLessThan(h.sorovlar.indexOf(chaqiruv));
    expect(h.sorovlar.at(-1)!.sql).toBe('COMMIT');
  });
  it('aktor yo\'q — aniq ko\'rsatma, ROLLBACK', async () => {
    const { mu, h } = mockMuhit((sql) => umumiy(sql) ?? (sql.includes('proargnames') ? [FAKT_TAVSIF] : []), { aktorId: null });
    const j = await toolChaqir(rpc, mu, { nom: 't2_fakt_yoz_v2', args: { p_obyekt_id: 1, p_sana: '2026-10-26', p_qatorlar: [] } });
    expect(j.isError).toBe(true);
    expect(j.content[0].text).toMatch(/aktor_tanla/);
    expect(h.sorovlar.at(-1)!.sql).toBe('ROLLBACK');
  });
  it('dry_run — ROLLBACK, snapshot yo\'q', async () => {
    const { mu, h } = mockMuhit((sql) => umumiy(sql) ?? (sql.includes('proargnames') ? [FAKT_TAVSIF] : [{ x: 1 }]));
    const j = await toolChaqir(rpc, mu, { nom: 't2_fakt_yoz_v2', args: { p_obyekt_id: 1, p_sana: '2026-10-26', p_qatorlar: [] }, dry_run: true });
    const r = JSON.parse(j.content[0].text);
    expect(r.dry_run).toBe(true);
    expect(h.sorovlar.some((x) => x.sql.startsWith('select snapshot.ol('))).toBe(false);
    expect(h.sorovlar.at(-1)!.sql).toBe('ROLLBACK');
  });
});

describe('qator_tahrir', () => {
  it('asl smeta qatori — rad etilmaydi, ogohlantirish; oldin/keyin', async () => {
    const { mu, h } = mockMuhit((sql) => umumiy(sql)
      ?? (sql.startsWith('select obyekt_id from public.t2_qator') ? [{ obyekt_id: 153 }]
        : sql.includes('for update') ? [{ id: 5, obyekt_id: 153, hajm: 10, qoshimcha: false, zamena: false, replaces_line_id: null, versiya: 3 }]
          : sql.includes('pg_attribute') ? [{ nom: 'hajm', tur: 'numeric' }, { nom: 'versiya', tur: 'integer' }]
            : sql.startsWith('update') ? [{ id: 5, hajm: 12, versiya: 4 }] : []));
    const j = await toolChaqir(qatorTahrir, mu, { id: 5, maydonlar: { hajm: 12 } });
    const r = JSON.parse(j.content[0].text);
    expect(r.natija.oldin).toEqual({ hajm: 10 });
    expect(r.natija.keyin).toEqual({ hajm: 12, versiya: 4 });
    expect(r.ogohlantirishlar.join(' ')).toMatch(/asl smeta/);
    expect(r.snapshot_id).toBe(77);
    const up = h.sorovlar.find((x) => x.sql.startsWith('update'))!;
    expect(up.params).toEqual([5, 12]);
  });
});

/** Sun'iy obyekt: bo'lim → ish → mehnat (ЧЕЛ). */
const QATORLAR = [
  { id: 1, obyekt_id: 900, ota_id: null, daraja: 0, tartib: 1, tur: 'rz', kod: null, nom: 'BO\'LIM A', birlik: null, hajm: null, narx: null, kat: null, qoshimcha: false, zamena: false, versiya: 1, norma: null, replaces_line_id: null },
  { id: 2, obyekt_id: 900, ota_id: 1, daraja: 1, tartib: 2, tur: 'bl', kod: 'E1-1', nom: 'ISH', birlik: 'м3', hajm: 10, narx: null, kat: null, qoshimcha: false, zamena: false, versiya: 1, norma: null, replaces_line_id: null },
  { id: 3, obyekt_id: 900, ota_id: 2, daraja: 2, tartib: 3, tur: 'rs', kod: '1-1', nom: 'MEHNAT', birlik: 'чел.-ч', hajm: 10, narx: 10, kat: 'ЧЕЛ', qoshimcha: false, zamena: false, versiya: 1, norma: 1, replaces_line_id: null },
];
const HOLAT = [
  { qator_id: 1, ota_id: null, tur: 'rz', smeta_hajm: null, smeta_summa: null },
  { qator_id: 2, ota_id: 1, tur: 'bl', smeta_hajm: 10, fakt_hajm: 5, smeta_summa: null },
  { qator_id: 3, ota_id: 2, tur: 'rs', kod: '1-1', nom: 'MEHNAT', birlik: 'чел.-ч', kat: 'ЧЕЛ', smeta_hajm: 10, smeta_narx: 10, smeta_summa: 100, fakt_hajm: 5, fakt_summa: 50, f2_hajm: 12, f2_summa: 120, qoldiq_hajm: -2, qoldiq_summa: -20, almashtirilgan_hajm: 0 },
];

describe('obyekt_holat va pereraschet (frontend mantig\'i bilan)', () => {
  const javob = (sql: string) => umumiy(sql)
    ?? (sql.includes('from public.t2_obyekt where id') ? [{ id: 900, nom: 'Sinov obyekti', kompaniya_id: 1 }]
      : sql.includes('from public.t2_qator where obyekt_id') && sql.includes('replaces_line_id is not null') ? []
        : sql.includes('from public.t2_qator where obyekt_id') ? QATORLAR
          : sql.includes('from public.t2_qator_holat') ? HOLAT : []);
  it('obyekt_holat: bo\'lim summalari ustamasiz (ustama yo\'q — izoh bilan)', async () => {
    const { mu } = mockMuhit(javob);
    const j = await toolChaqir(obyektHolat, mu, { obyekt_id: 900, nakopitelniy: false });
    expect(j.isError).toBeFalsy();
    const r = JSON.parse(j.content[0].text);
    expect(r.jami.smeta.ustamasiz).toBe(100);
    expect(r.jami.f2.ustamasiz).toBe(120);
    expect(r.jami.fakt.ustamasiz).toBe(50);
    expect(r.jami.smeta.ustamali).toBeNull();
    expect(r.bolimlar[0].id).toBe(1);
    expect(r.bolimlar[0].smeta.ustamasiz).toBe(100);
  });
  it('pereraschet: F2 smetadan oshgan — ortiqcha (minus)', async () => {
    const { mu } = mockMuhit(javob);
    const j = await toolChaqir(pereraschet, mu, { obyekt_id: 900 });
    expect(j.isError).toBeFalsy();
    const r = JSON.parse(j.content[0].text);
    expect(r.jami.minus).toBeGreaterThan(0);
    expect(r.tur_boyicha.ortiqcha.minus).toBe(20);
    expect(r.hisobda.qatorlar[0].qator_id).toBe(3);
  });
});

describe('fakt_qamrov', () => {
  it.runIf(qamrovMavjud())('bo\'lim 50% — ochiq qoldiqning yarmi, t2_fakt_yoz_v2 bitta tranzaksiyada', async () => {
    const { mu, h } = mockMuhit((sql) => umumiy(sql)
      ?? (sql.includes('from public.t2_obyekt where id') ? [{ id: 900, nom: 'Sinov', kompaniya_id: 1 }]
        : sql.includes('from public.t2_qator where obyekt_id') ? QATORLAR
          : sql.includes('from public.t2_qator_holat') ? HOLAT
            : sql.includes('proargnames') ? [FAKT_TAVSIF]
              : sql.includes('"t2_fakt_yoz_v2"(') ? [{ t2_fakt_yoz_v2: { ok: true, akt_id: 31 } }] : []));
    const j = await toolChaqir(faktQamrov, mu, { obyekt_id: 900, qamrov_id: 1, foiz: 50, sana: '2026-10-26' });
    expect(j.isError, j.content[0].text).toBeFalsy();
    const r = JSON.parse(j.content[0].text);
    expect(r.natija.yozildi).toBe(true);
    const yoz = h.sorovlar.find((x) => x.sql.includes('"t2_fakt_yoz_v2"('))!;
    expect(JSON.parse(String(yoz.params[2]))).toEqual([{ qator_id: 2, hajm: 2.5 }]);
    expect(r.natija.istisno_soni.faktli).toBe(1);
    expect(h.sorovlar.at(-1)!.sql).toBe('COMMIT');
  });

  it.skipIf(qamrovMavjud())('fakt-qamrov.ts bu checkoutda yo\'q — aniq xabar, bazaga tegmaydi', async () => {
    const { mu, h } = mockMuhit(() => []);
    const j = await toolChaqir(faktQamrov, mu, { obyekt_id: 1, qamrov_id: 1, foiz: 50 });
    expect(j.isError).toBe(true);
    expect(j.content[0].text).toMatch(/fakt-qamrov\.ts/);
    expect(h.sorovlar.length).toBe(0);
  });
});
