/** PTO qamrovi v1: sof yordamchilar + mock pg integratsiyasi. Ma'lumotlar SUN'IY (real obyekt/summa/id emas). */
import { describe, expect, it } from 'vitest';
import type { MavjudAktQator, MumkinQator } from '../src/ish-oqimi';
import { avlodlar, bolimXarita, birlikNorm, f2CertYuki, f2YangilaYuki, moslash, narxTanla, tarixTahlil } from '../src/pto';
import { TOOLLAR } from '../src/server';
import { toolChaqir } from '../src/tool';
import { aktBekor, f2QoralamaYangila, f2Yarat, ishOchir, ostatka, zamenaQosh } from '../src/tools/pto';
import { mockMuhit } from './mock';

const M = (x: Partial<MumkinQator> & { qator_id: number; tur: string; mumkin: number }): MumkinQator =>
  ({ ota_id: null, kod: null, nom: `q${x.qator_id}`, birlik: 'm3', kat: null, smeta_narx: null, ...x });
const MAV = (x: Partial<MavjudAktQator> & { qator_id: number }): MavjudAktQator =>
  ({ certified_quantity: 1, certified_unit_price: null, certified_amount: null, provenance_status: null, certified_source_hash: null, raw_snapshot: { source: 'native_f2_preparation' }, izoh: null, ...x });

describe('daraxt yordamchilari', () => {
  const d = [{ id: 1, ota_id: null, tur: 'rz' }, { id: 2, ota_id: 1, tur: 'rz' }, { id: 3, ota_id: 2, tur: 'bl' }, { id: 4, ota_id: 3, tur: 'rs' }, { id: 5, ota_id: null, tur: 'bl' }];
  it('bolimXarita — eng yuqori rz; bo\'limsiz — null', () => {
    const b = bolimXarita(d);
    expect(b.get(4)).toBe(1); expect(b.get(2)).toBe(1); expect(b.get(5)).toBeNull();
  });
  it('avlodlar', () => { expect([...avlodlar(d, 2)].sort()).toEqual([2, 3, 4]); });
});

describe('narxTanla / f2YangilaYuki', () => {
  it('max(smeta, xarid); bittasi — o\'sha; ikkalasi yo\'q — null', () => {
    expect(narxTanla(10, 12)).toEqual({ narx: 12, manba: 'berilgan' });
    expect(narxTanla(10, 8)).toEqual({ narx: 10, manba: 'smeta' });
    expect(narxTanla(null, 8)).toEqual({ narx: 8, manba: 'berilgan' });
    expect(narxTanla(null, null)).toEqual({ narx: null, manba: null });
    expect(narxTanla(10, 12, 'smeta')).toEqual({ narx: 10, manba: 'smeta' });
  });
  it('hajm = f2_mumkin; yangi qo\'shiladi, qoldiqsiz olinadi, storno saqlanadi, o\'zgarmagan — aynan', () => {
    const mavjud = [
      MAV({ qator_id: 1, certified_quantity: 2, provenance_status: 'price_intentionally_absent' }),
      MAV({ qator_id: 2, certified_quantity: 3, certified_unit_price: 10, certified_amount: 30 }),
      MAV({ qator_id: 3, certified_quantity: 1, certified_unit_price: 5, certified_amount: 5 }),
      MAV({ qator_id: 9, certified_quantity: -1, certified_unit_price: 5, certified_amount: -5, raw_snapshot: { source: 'storno' } }),
    ];
    const rows = [M({ qator_id: 1, tur: 'bl', mumkin: 2 }), M({ qator_id: 2, tur: 'rs', ota_id: 1, mumkin: 4, smeta_narx: 10 }), M({ qator_id: 4, tur: 'mat', ota_id: 1, mumkin: 1, smeta_narx: 7 })];
    const y = f2YangilaYuki(mavjud, rows, { manba: 'Ф-2 № 1', narxlar: { 4: 9 } });
    expect(y).toMatchObject({ qoshildi: 1, ozgardi: 1, ozgarmadi: 1, olindi: [3], storno: 1, berilgan_narx: 1 });
    const by = new Map(y.yuk.map((q) => [q.qator_id, q]));
    expect(by.get(2)).toMatchObject({ certified_quantity: 4, certified_unit_price: 10, certified_amount: 40 });
    expect(by.get(4)).toMatchObject({ certified_unit_price: 9, certified_amount: 9 });
    expect(by.get(9)).toMatchObject({ certified_quantity: -1 });
    expect(by.has(3)).toBe(false);
  });
  it('faqatMavjud — yangi qator qo\'shilmaydi; mavjudNarxSaqla — qoralama narxi qoladi', () => {
    const mavjud = [MAV({ qator_id: 2, certified_quantity: 3, certified_unit_price: 15, certified_amount: 45 })];
    const rows = [M({ qator_id: 2, tur: 'rs', mumkin: 4, smeta_narx: 10 }), M({ qator_id: 5, tur: 'rs', mumkin: 1, smeta_narx: 1 })];
    const y = f2YangilaYuki(mavjud, rows, { manba: 'x', faqatMavjud: true, mavjudNarxSaqla: true });
    expect(y.yuk).toHaveLength(1);
    expect(y.yuk[0]).toMatchObject({ certified_quantity: 4, certified_unit_price: 15, certified_amount: 60 });
  });
});

describe('f2CertYuki', () => {
  const meta = new Map([[1, { tur: 'bl', smeta_narx: null }], [2, { tur: 'rs', smeta_narx: 10 }], [3, { tur: 'rs', smeta_narx: 0 }], [4, { tur: 'mat', smeta_narx: null }], [5, { tur: 'rz', smeta_narx: null }]]);
  it('bl — narxsiz; narx berilmasa smeta; 0 — ongli narxsiz; null — avto', () => {
    const y = f2CertYuki([{ qator_id: 1, hajm: 2 }, { qator_id: 2, hajm: 3 }, { qator_id: 3, hajm: 1 }, { qator_id: 4, hajm: 1, narx: null }], meta, 'Ф-2 № 7');
    expect(y.xato).toEqual([]);
    expect(y.yuk[0]).toMatchObject({ price_intentionally_absent: true, certified_amount: null });
    expect(y.yuk[1]).toMatchObject({ certified_unit_price: 10, certified_amount: 30, price_intentionally_absent: false });
    expect(y.yuk[2]).toMatchObject({ price_intentionally_absent: true, certified_amount: null, raw_snapshot: { narx0: true } });
    expect(y.yuk[3]).toMatchObject({ price_intentionally_absent: true, raw_snapshot: { narxsizSabab: 'avto_qoralama' } });
    expect(y).toMatchObject({ narx0: 1, avto: 1 });
  });
  it('xatolar: noma\'lum qator, rz, takror, hajm 0', () => {
    const y = f2CertYuki([{ qator_id: 99, hajm: 1 }, { qator_id: 5, hajm: 1 }, { qator_id: 2, hajm: 1 }, { qator_id: 2, hajm: 1 }, { qator_id: 4, hajm: 0 }], meta, 'x');
    expect(y.xato).toHaveLength(4);
  });
});

describe('tarixTahlil', () => {
  it('sof nol fakt — tozalash mumkin; F2 (bekor emas) — rad; bekor e\'tiborsiz', () => {
    const t = tarixTahlil([
      { qator_id: 1, akt_id: 10, tur: 'fakt', holat: 'qoralama', hajm: 5 }, { qator_id: 1, akt_id: 11, tur: 'fakt', holat: 'qoralama', hajm: -5 },
      { qator_id: 2, akt_id: 12, tur: 'f2', holat: 'bekor', hajm: 3 },
    ]);
    expect(t).toMatchObject({ f2_aktlar: [], nolmas: [], toza: false, fakt_qatorlar: 2 });
    const t2 = tarixTahlil([{ qator_id: 1, akt_id: 10, tur: 'fakt', holat: 'qoralama', hajm: 2 }, { qator_id: 1, akt_id: 20, tur: 'f2', holat: 'qoralama', hajm: 2 }]);
    expect(t2.f2_aktlar).toEqual([20]);
    expect(t2.nolmas).toEqual([{ qator_id: 1, net: 2 }]);
    expect(tarixTahlil([]).toza).toBe(true);
  });
});

describe('moslash', () => {
  const qatorlar = [
    { id: 1, obyekt_id: 900, tur: 'mat', kod: '22006', nom: 'БЕТОН ТЯЖЕЛЫЙ, КЛАСС В 15 (М200)', birlik: 'М3', hajm: 100, narx: 100 },
    { id: 2, obyekt_id: 900, tur: 'mat', kod: '22009', nom: 'БЕТОН ТЯЖЕЛЫЙ, КЛАСС В 25 (М350)', birlik: 'М3', hajm: 50, narx: 120 },
    { id: 3, obyekt_id: 900, tur: 'mat', kod: '30001', nom: 'АРМАТУРА А500С Д12', birlik: 'Т', hajm: 5, narx: 1000 },
  ];
  it('nom+birlik+hajm bo\'yicha aniq; QQS siz narx farqi; topilmadi', () => {
    const r = moslash([{ nom: 'Бетон тяжелый класс B25 М350', birlik: 'm3', soni: 50, narx_qqs: 134.4 }, { nom: 'Кирпич керамический' }], qatorlar, { ndsFoiz: 12 });
    expect(r[0].nomzodlar[0].qator_id).toBe(2);
    expect(r[0].nomzodlar[0].narx_farq_foiz).toBe(0);
    expect(r[1].holat).toBe('topilmadi');
  });
  it('kod mos — ball oshadi; birlik normallashadi', () => {
    expect(birlikNorm('m3')).toBe(birlikNorm('М3'));
    const r = moslash([{ nom: 'арматура', kod: '30001' }], qatorlar);
    expect(r[0].nomzodlar[0]).toMatchObject({ qator_id: 3 });
    expect(r[0].nomzodlar[0].sabab).toContain('kod mos');
  });
});

// ───────────── mock pg ─────────────

const tavsif = (nom: string, arg: Array<[string, string]>, def = 0) => ({ oid: 1, nom, default_soni: def, toplam: false, arg_nomlar: arg.map((x) => x[0]), arg_turlar: arg.map((x) => x[1]) });
const TAVSIF: Record<string, ReturnType<typeof tavsif>> = {
  t2_ish_abc_saqla_v1: tavsif('t2_ish_abc_saqla_v1', [['p_actor_id', 'bigint'], ['p_kompaniya_id', 'bigint'], ['p_obyekt_id', 'bigint'], ['p_command', 'text'], ['p_ota_qator_id', 'bigint'], ['p_almashtirilayotgan_qator_id', 'bigint'],
    ['p_ish', 'jsonb'], ['p_resurslar', 'jsonb'], ['p_fakt_hajm', 'numeric'], ['p_sana', 'date'], ['p_sabab', 'text'], ['p_operation_id', 'uuid'], ['p_kutilgan_versiya', 'integer']]),
  t2_ish_abc_ochir_v1: tavsif('t2_ish_abc_ochir_v1', [['p_actor_id', 'bigint'], ['p_kompaniya_id', 'bigint'], ['p_obyekt_id', 'bigint'], ['p_qator_id', 'bigint'], ['p_sabab', 'text'], ['p_operation_id', 'uuid']]),
  t2_ish_abc_ochir_v2: tavsif('t2_ish_abc_ochir_v2', [['p_actor_id', 'bigint'], ['p_kompaniya_id', 'bigint'], ['p_obyekt_id', 'bigint'], ['p_qator_id', 'bigint'], ['p_kutilgan_versiya', 'integer'], ['p_sabab', 'text'], ['p_operation_id', 'uuid']]),
  t2_f2_qoralama_yangila_v1: tavsif('t2_f2_qoralama_yangila_v1', [['p_actor_id', 'bigint'], ['p_kompaniya_id', 'bigint'], ['p_akt_id', 'bigint'], ['p_kutilgan_versiya', 'integer'], ['p_qatorlar', 'jsonb'], ['p_operation_id', 'uuid'], ['p_manba', 'text']]),
  t2_akt_yarat_v2: tavsif('t2_akt_yarat_v2', [['p_obyekt_id', 'bigint'], ['p_oy', 'date'], ['p_qatorlar', 'jsonb'], ['p_actor_id', 'bigint'], ['p_raqam', 'text'], ['p_operation_id', 'uuid'], ['p_manba', 'text']], 3),
  t2_akt_bekor: tavsif('t2_akt_bekor', [['p_akt_id', 'bigint'], ['p_sabab', 'text'], ['p_kutilgan_versiya', 'integer'], ['p_kim', 'text']], 3),
  t2_akt_lifecycle_transition_v1: tavsif('t2_akt_lifecycle_transition_v1', [['p_kompaniya_id', 'bigint'], ['p_akt_id', 'bigint'], ['p_to_status', 'text'], ['p_actor_id', 'bigint'], ['p_expected_version', 'integer'], ['p_operation_id', 'uuid'], ['p_reason', 'text']], 1),
};
const umumiy = (sql: string, p: unknown[]): Array<Record<string, unknown>> | undefined => {
  if (sql.includes("n.nspname = 'snapshot' and p.proname")) return [{ bor: true }];
  if (sql.startsWith('select snapshot.ol(')) return [{ id: 77 }];
  if (sql.includes("to_regprocedure('public.t2_audit_yoz")) return [{ bor: false }];
  if (sql.includes('select to_regclass($1)')) return [{ bor: true }];
  if (sql.includes('from public.t2_obyekt where id')) return [{ id: 900, nom: 'Sinov obyekt', kompaniya_id: 1 }];
  if (sql.includes('from public.t2_obyekt_nakrutka where')) return [{ kf_chel: 1.12, kf_mash: 1.12, kf_mat: 1.12, kf_ob: 1.12, kf_mk: 1.12, kf_kab: 1.12, kf_bezsklad: 1.12, koeffitsientlar: { 'НДС': 12 } }];
  if (sql.includes('proargnames') && TAVSIF[String(p[1])]) return [TAVSIF[String(p[1])]];
  return undefined;
};
const chaqiruv = (h: { sorovlar: Array<{ sql: string; params: unknown[] }> }, nom: string) => h.sorovlar.find((x) => x.sql.includes(`"${nom}"(`));

describe('ro\'yxat', () => {
  it('yangi toollar ro\'yxatda, nomlar takrorlanmaydi, yozuvchilarida dry_run', () => {
    const nomlar = TOOLLAR.map((t) => t.nom);
    for (const n of ['zamena_qosh', 'ish_ochir', 'f2_qoralama_yangila', 'f2_yarat', 'akt_bekor', 'nakopitelniy', 'ostatka', 'shartnoma_moslash', 'fakt_jurnal', 'normativ_qidir', 'forma3']) expect(nomlar).toContain(n);
    expect(new Set(nomlar).size).toBe(nomlar.length);
    for (const t of TOOLLAR) if (t.yozadi && t.nom !== 'snapshot_ol') expect(Object.keys(t.kirish)).toContain('dry_run');
  });
});

describe('zamena_qosh (mock)', () => {
  it('rejim ish: replacement, ota = asl qatorning otasi, kutilgan versiya = ota versiyasi; dry_run standart — ROLLBACK', async () => {
    const { mu, h } = mockMuhit((sql, p) => umumiy(sql, p)
      ?? (sql.includes('versiya_holat from public.t2_qator where id') ? [{ id: 11, ota_id: 10, tur: 'bl', kod: 'E1', nom: 'Asl ish', birlik: 'm3', versiya_holat: 'faol' }]
        : sql.startsWith('select versiya from public.t2_qator') ? [{ versiya: 4 }]
          : sql.includes('from public.t2_qator_holat where qator_id') ? [{ qoldiq_hajm: 10, almashtirilgan_hajm: 0, smeta_hajm: 10 }]
            : sql.includes('"t2_ish_abc_saqla_v1"(') ? [{ x: { ok: true, qator_id: 500, change_id: 9 } }] : []));
    const j = await toolChaqir(zamenaQosh, mu, { obyekt_id: 900, almashtirilayotgan_qator_id: 11, ish: { nom: 'Yangi ish', birlik: 'm3', hajm: 5 }, resurslar: [{ nom: 'Mehnat', birlik: 'chel-soat', kat: 'ЧЕЛ', norma: 2 }], sabab: 'loyiha o\'zgardi' });
    expect(j.isError, j.content[0].text).toBeFalsy();
    const r = JSON.parse(j.content[0].text);
    expect(r).toMatchObject({ dry_run: true, natija: { rejim: 'ish', qator_id: 500 } });
    const c = chaqiruv(h, 't2_ish_abc_saqla_v1')!;
    const ai = TAVSIF.t2_ish_abc_saqla_v1.arg_nomlar;
    expect(c.params[ai.indexOf('p_command')]).toBe('replacement');
    expect(c.params[ai.indexOf('p_ota_qator_id')]).toBe(10);
    expect(c.params[ai.indexOf('p_almashtirilayotgan_qator_id')]).toBe(11);
    expect(c.params[ai.indexOf('p_kutilgan_versiya')]).toBe(4);
    expect(h.sorovlar.at(-1)!.sql).toBe('ROLLBACK');
  });
  it('rejim resurs: bitta resurs shart', async () => {
    const { mu } = mockMuhit((sql, p) => umumiy(sql, p) ?? (sql.includes('versiya_holat from public.t2_qator where id') ? [{ id: 12, ota_id: 11, tur: 'mat', versiya_holat: 'faol' }] : []));
    const j = await toolChaqir(zamenaQosh, mu, { obyekt_id: 900, almashtirilayotgan_qator_id: 12, sabab: 'almashtirildi' });
    expect(j.isError).toBe(true);
    expect(j.content[0].text).toMatch(/aynan bitta resurs/);
  });
});

describe('ish_ochir (mock)', () => {
  const qator = { id: 50, ota_id: 10, tur: 'bl', nom: 'Qo\'shilgan ish', versiya: 2, qoshimcha: true, zamena: false, replaces_line_id: null, change_type: 'ADDITIONAL' };
  const daraxt = [{ id: 10, ota_id: null, tur: 'rz' }, { id: 50, ota_id: 10, tur: 'bl' }, { id: 51, ota_id: 50, tur: 'rs' }];
  const baza = (refs: Array<Record<string, unknown>>) => (sql: string, p: unknown[]) => umumiy(sql, p)
    ?? (sql.includes('change_type from public.t2_qator where id') ? [qator]
      : sql.includes('tartib from public.t2_qator where obyekt_id') ? daraxt
        : sql.includes('from public.t2_akt_qator aq join public.t2_akt a') ? refs
          : sql.includes('"t2_ish_abc_ochir_v1"(') || sql.includes('"t2_ish_abc_ochir_v2"(') ? [{ x: { ok: true, ochirildi: 2, fakt_ochirildi: refs.length } }] : []);
  it('tarixsiz — v2 (versiya bilan)', async () => {
    const { mu, h } = mockMuhit(baza([]));
    const r = JSON.parse((await toolChaqir(ishOchir, mu, { obyekt_id: 900, qator_id: 50, sabab: 'xato qo\'shilgan' })).content[0].text);
    expect(r.natija).toMatchObject({ yol: 't2_ish_abc_ochir_v2', ochirildi: 2 });
    expect(chaqiruv(h, 't2_ish_abc_ochir_v2')!.params).toContain(2);
  });
  it('sof nol fakt — v1 (fakt arxivlanadi)', async () => {
    const { mu, h } = mockMuhit(baza([{ qator_id: 51, akt_id: 1, tur: 'fakt', holat: 'qoralama', hajm: 3 }, { qator_id: 51, akt_id: 2, tur: 'fakt', holat: 'qoralama', hajm: -3 }]));
    const r = JSON.parse((await toolChaqir(ishOchir, mu, { obyekt_id: 900, qator_id: 50, sabab: 'xato qo\'shilgan' })).content[0].text);
    expect(r.natija).toMatchObject({ yol: 't2_ish_abc_ochir_v1', fakt_arxivlandi: 2 });
    expect(chaqiruv(h, 't2_ish_abc_ochir_v2')).toBeUndefined();
  });
  it('sof fakt nol emas — rad; F2 da — rad', async () => {
    const a = await toolChaqir(ishOchir, mockMuhit(baza([{ qator_id: 51, akt_id: 1, tur: 'fakt', holat: 'qoralama', hajm: 3 }])).mu, { obyekt_id: 900, qator_id: 50, sabab: 'xato qo\'shilgan' });
    expect(a.content[0].text).toMatch(/FAKT_NOL_EMAS/);
    const b = await toolChaqir(ishOchir, mockMuhit(baza([{ qator_id: 51, akt_id: 7, tur: 'f2', holat: 'qoralama', hajm: 3 }])).mu, { obyekt_id: 900, qator_id: 50, sabab: 'xato qo\'shilgan' });
    expect(b.content[0].text).toMatch(/F2_DA.*#7/);
  });
});

describe('f2_qoralama_yangila (mock)', () => {
  it('t2_f2_qoralama_yangila_v1 kutilgan versiya va max narx bilan', async () => {
    const { mu, h } = mockMuhit((sql, p) => umumiy(sql, p)
      ?? (sql.includes('from public.t2_akt where id') ? [{ id: 30, obyekt_id: 900, kompaniya_id: 1, tur: 'f2', holat: 'qoralama', lifecycle_status: 'draft', versiya: 5, raqam: '3', oy: '2026-10-01' }]
        : sql.includes("holat = 'qoralama' and id <> $2") ? []
          : sql.includes('from public.t2_akt_qator where akt_id') ? [{ qator_id: 12, hajm: 1, certified_quantity: 1, certified_unit_price: 10, certified_amount: 10, provenance_status: null, certified_source_hash: null, raw_snapshot: {}, izoh: null }]
            : sql.includes('f2_mumkin_hajm > 0.000001') ? [{ qator_id: 12, ota_id: 11, tur: 'rs', kod: null, nom: 'M', birlik: 'kg', kat: 'МАТ', mumkin: 2, smeta_narx: 10 }]
              : sql.includes('select id, kat, tur from public.t2_qator') ? [{ id: 12, kat: 'МАТ', tur: 'rs' }]
                : sql.includes('"t2_f2_qoralama_yangila_v1"(') ? [{ x: { ok: true, versiya: 6 } }] : []));
    const j = await toolChaqir(f2QoralamaYangila, mu, { akt_idlar: [30], narxlar: { 12: 15 } });
    expect(j.isError, j.content[0].text).toBeFalsy();
    const r = JSON.parse(j.content[0].text);
    expect(r.aktlar[0]).toMatchObject({ akt_id: 30, ozgardi: 1, xarid_narxi_qollandi: 1, keyin: { summa: { ustamasiz: 30 } } });
    const c = chaqiruv(h, 't2_f2_qoralama_yangila_v1')!;
    expect(c.params[3]).toBe(5);
    expect(JSON.parse(String(c.params[4]))[0]).toMatchObject({ qator_id: 12, certified_quantity: 2, certified_unit_price: 15, certified_amount: 30 });
  });
});

describe('f2_yarat (mock)', () => {
  it('certified qatorlar, bl narxsiz, t2_akt_yarat_v2', async () => {
    const { mu, h } = mockMuhit((sql, p) => umumiy(sql, p)
      ?? (sql.includes("tur = 'f2' and holat = 'qoralama'") ? []
        : sql.includes('h.f2_mumkin_hajm as mumkin from public.t2_qator q') ? [{ id: 11, tur: 'bl', kat: null, versiya_holat: 'faol', smeta_narx: null, mumkin: 1 }, { id: 12, tur: 'rs', kat: 'ЧЕЛ', versiya_holat: 'faol', smeta_narx: 20, mumkin: 1 }]
          : sql.includes('"t2_akt_yarat_v2"(') ? [{ x: { ok: true, akt_id: 777 } }] : []));
    const j = await toolChaqir(f2Yarat, mu, { obyekt_id: 900, oy: '2026-10', qatorlar: [{ qator_id: 11, hajm: 2 }, { qator_id: 12, hajm: 2 }] });
    const r = JSON.parse(j.content[0].text);
    expect(r.natija).toMatchObject({ akt_id: 777, qatorlar: 2, summa: { ustamasiz: 40, qqs_bilan: 44.8 } });
    expect(r.ogohlantirishlar.join(' ')).toMatch(/f2_mumkin/);
    const yuk = JSON.parse(String(chaqiruv(h, 't2_akt_yarat_v2')!.params[2]));
    expect(yuk[0]).toMatchObject({ qator_id: 11, price_intentionally_absent: true });
  });
});

describe('akt_bekor (mock)', () => {
  const javob = (akt: Record<string, unknown>) => (sql: string, p: unknown[]) => umumiy(sql, p)
    ?? (sql.includes('from public.t2_akt where id') ? [akt]
      : sql.includes('count(*)::int as n from public.t2_akt_qator') ? [{ n: 4 }]
        : sql.includes('"t2_akt_bekor"(') ? [{ x: { ok: true, holat: 'bekor' } }]
          : sql.includes('"t2_akt_lifecycle_transition_v1"(') ? [{ x: { ok: true, version: 9 } }] : []);
  it('fakt — t2_akt_bekor; F2 qoralama — lifecycle cancelled; tasdiqlangan F2 — rad', async () => {
    const f = mockMuhit(javob({ id: 1, obyekt_id: 900, kompaniya_id: 1, tur: 'fakt', holat: 'qoralama', lifecycle_status: 'draft', versiya: 2 }));
    const r1 = JSON.parse((await toolChaqir(aktBekor, f.mu, { akt_idlar: [1], sabab: 'takror kiritilgan' })).content[0].text);
    expect(r1.aktlar[0]).toMatchObject({ tur: 'fakt', keyin: 'bekor', qatorlar: 4 });
    expect(chaqiruv(f.h, 't2_akt_bekor')!.params[2]).toBe(2);
    const g = mockMuhit(javob({ id: 2, obyekt_id: 900, kompaniya_id: 1, tur: 'f2', holat: 'qoralama', lifecycle_status: 'draft', versiya: 8 }));
    await toolChaqir(aktBekor, g.mu, { akt_idlar: [2], sabab: 'qayta tuziladi' });
    expect(chaqiruv(g.h, 't2_akt_lifecycle_transition_v1')!.params[2]).toBe('cancelled');
    const t = mockMuhit(javob({ id: 3, obyekt_id: 900, kompaniya_id: 1, tur: 'f2', holat: 'tasdiqlangan', lifecycle_status: 'approved', versiya: 1 }));
    const r3 = JSON.parse((await toolChaqir(aktBekor, t.mu, { akt_idlar: [3], sabab: 'xato' })).content[0].text);
    expect(r3.aktlar[0].xato).toMatch(/tasdiqlangan/);
  });
});

describe('ostatka (mock)', () => {
  it('bo\'lim kesimi va zamena bog\'lanishi', async () => {
    const { mu } = mockMuhit((sql, p) => umumiy(sql, p)
      ?? (sql.includes('from public.t2_qator q join public.t2_qator_holat h') ? [
        { qator_id: 2, ota_id: 1, tur: 'bl', qoldiq_hajm: 5, replaces_line_id: null },
        { qator_id: 3, ota_id: 2, tur: 'rs', kat: 'ЧЕЛ', qoldiq_hajm: 5, qoldiq_summa: 50, almashtirilgan_hajm: 2, almashtirilgan_summa: 20, f2_summa: 10, smeta_summa: 80, replaces_line_id: null },
        { qator_id: 8, ota_id: 1, tur: 'bl', qoldiq_hajm: 2, replaces_line_id: 2, change_type: 'REPLACEMENT' },
      ] : sql.includes('tartib from public.t2_qator where obyekt_id') ? [{ id: 1, ota_id: null, tur: 'rz', nom: 'B1', tartib: 1 }, { id: 2, ota_id: 1, tur: 'bl' }, { id: 3, ota_id: 2, tur: 'rs' }, { id: 8, ota_id: 1, tur: 'bl' }] : []));
    const r = JSON.parse((await toolChaqir(ostatka, mu, { obyekt_id: 900, faqat: 'zamena' })).content[0].text);
    expect(r.qatorlar_soni).toBe(3);
    expect(r.bolimlar[0]).toMatchObject({ bolim_id: 1, qoldiq: { ustamasiz: 50 }, almashtirilgan: { ustamasiz: 20 } });
    expect(r.qatorlar.find((x: { qator_id: number }) => x.qator_id === 2).zamenalar).toEqual([8]);
    expect(r.qatorlar.find((x: { qator_id: number }) => x.qator_id === 8).almashtiradi).toBe(2);
  });
});
