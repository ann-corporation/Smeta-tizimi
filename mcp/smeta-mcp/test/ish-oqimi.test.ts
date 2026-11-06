/** Ish oqimlari: sof yuk quruvchilar + mock pg integratsiyasi. Ma'lumotlar SUN'IY (real obyekt/summa/id emas). */
import { describe, expect, it } from 'vitest';
import {
  blSumma, f2QoralamaYuki, faktNolYuki, Kesim, kfUch, lifecycleYol, narxNusxa, podvalFoizQoy, qoralamaTahrirYuki, qoshimchaTaxmin, uuidHosila, xatoIzoh, yukJami,
  type MavjudAktQator, type MumkinQator,
} from '../src/ish-oqimi';
import { standartPodval, podvalTekshir } from '../src/frontend';
import { TOOLLAR } from '../src/server';
import { toolChaqir } from '../src/tool';
import { f2Holat, f2QoralamaYarat } from '../src/tools/ish-oqimi';
import { mockMuhit } from './mock';

const M = (x: Partial<MumkinQator> & { qator_id: number; tur: string; mumkin: number }): MumkinQator =>
  ({ ota_id: null, kod: null, nom: `q${x.qator_id}`, birlik: 'm3', kat: null, smeta_narx: null, ...x });

describe('f2QoralamaYuki', () => {
  const rows = [
    M({ qator_id: 1, tur: 'bl', mumkin: 2 }),
    M({ qator_id: 2, tur: 'rs', ota_id: 1, kat: 'ЧЕЛ', mumkin: 4, smeta_narx: 10 }),
    M({ qator_id: 3, tur: 'mat', ota_id: 1, kat: 'МАТ', mumkin: 1.5, smeta_narx: null }),
    M({ qator_id: 4, tur: 'rs', ota_id: 9, kat: 'МАШ', mumkin: 0.0000001, smeta_narx: 5 }),
  ];
  it('bl narxsiz; resurs smeta narxida; narxsiz resurs — avto_qoralama; chang hajm tashlanadi', () => {
    const y = f2QoralamaYuki(rows);
    expect(y.qatorlar.map((q) => q.qator_id)).toEqual([1, 2, 3]);
    const [bl, rs, mat] = y.qatorlar;
    expect(bl).toMatchObject({ price_intentionally_absent: true, certified_unit_price: null, raw_snapshot: { source: 'native_f2_preparation', sourceReference: 'Ф-2 (сформирована в системе)' } });
    expect(bl.raw_snapshot.narxsizSabab).toBeUndefined();
    expect(rs).toMatchObject({ certified_quantity: 4, certified_unit_price: 10, certified_amount: 40, price_intentionally_absent: false, raw_snapshot: { sourceReference: 'Ф-2 (сформирована в системе); цена по смете', enteredAmount: 40 } });
    expect(mat).toMatchObject({ price_intentionally_absent: true, certified_amount: null, raw_snapshot: { narxsizSabab: 'avto_qoralama' } });
  });
  it('override narx va manba; raqam → «Ф-2 № …»', () => {
    const y = f2QoralamaYuki(rows, { raqam: '7', override: { 3: { narx: 2, manba: 'цена по протоколу' } } });
    expect(y.qatorlar[2]).toMatchObject({ certified_unit_price: 2, certified_amount: 3, raw_snapshot: { sourceReference: 'Ф-2 № 7; цена по протоколу' } });
  });
  it('chang_pul: noma\'lum narxli guruh tashlanmaydi; kichik ma\'lum guruh tashlanadi', () => {
    const r2 = [...rows, M({ qator_id: 5, tur: 'bl', mumkin: 1 }), M({ qator_id: 6, tur: 'rs', ota_id: 5, kat: 'ЧЕЛ', mumkin: 1, smeta_narx: 3 })];
    const y = f2QoralamaYuki(r2, { changPul: 100 });
    expect(y.qatorlar.map((q) => q.qator_id)).toEqual([1, 2, 3]);
    expect(y.tashlandi).toEqual([{ ish_id: 5, nom: 'q5', qatorlar: 2, qiymat: 3 }]);
  });
});

describe('kfUch / Kesim', () => {
  it('QQS bilan = Σ summa×kf; ustamali = QQS bilan / (1+QQS%); narxsiz sanaladi, 0 deb qo\'shilmaydi', () => {
    const k = new Kesim();
    k.qosh('ЧЕЛ', 100); k.qosh('МАТ', 200); k.qosh('МАТ', null);
    const u = kfUch(k, { kf_chel: 1.12, kf_mash: 1, kf_mat: 2.24, kf_ob: 1, kf_mk: 1, kf_kab: 1, kf_bezsklad: 1 }, 12);
    expect(u).toMatchObject({ ustamasiz: 300, qqs_bilan: 560, ustamali: 500, narxsiz_soni: 1 });
  });
  it('kf noma\'lum — ustamali null (taxmin yo\'q); bo\'sh kesim — hammasi null', () => {
    const k = new Kesim(); k.qosh('ОБ', 10);
    expect(kfUch(k, { kf_chel: 1, kf_mash: 1, kf_mat: 1, kf_ob: null, kf_mk: 1, kf_kab: 1, kf_bezsklad: 1 }, 12).ustamali).toBeNull();
    expect(kfUch(new Kesim(), null, 12)).toMatchObject({ ustamasiz: null, ustamali: null });
  });
});

describe('lifecycle va xato izohlari', () => {
  it('toliq_tasdiq zanjiri', () => {
    expect(lifecycleYol('draft', 'approved', true)).toEqual(['submitted', 'checked', 'approved']);
    expect(lifecycleYol('rejected', 'approved', true)).toEqual(['submitted', 'checked', 'approved']);
    expect(lifecycleYol('checked', 'approved', true)).toEqual(['approved']);
    expect(lifecycleYol('draft', 'submitted')).toEqual(['submitted']);
  });
  it('server kodi o\'qiladigan izohga', () => {
    expect(xatoIzoh({ ok: false, code: 'STALE_VERSION', version: 4 })).toMatch(/^STALE_VERSION — .*version=4/);
    expect(xatoIzoh('NARXSIZ_QATOR_BOR: F2 #1 da 2 ta')).toMatch(/^NARXSIZ_QATOR_BOR — /);
    expect(xatoIzoh({ ok: false, code: 'YANGI_KOD' })).toBe('YANGI_KOD');
  });
  it('uuidHosila barqaror va UUID shaklida', () => {
    const a = uuidHosila('x', 'f2:1');
    expect(a).toBe(uuidHosila('x', 'f2:1'));
    expect(a).not.toBe(uuidHosila('x', 'f2:2'));
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe('qoralamaTahrirYuki', () => {
  const mav: MavjudAktQator[] = [
    { qator_id: 1, certified_quantity: 2, certified_unit_price: null, certified_amount: null, provenance_status: 'price_intentionally_absent', certified_source_hash: null, raw_snapshot: { source: 'native_f2_preparation' }, izoh: null },
    { qator_id: 2, certified_quantity: 4, certified_unit_price: null, certified_amount: null, provenance_status: 'price_intentionally_absent', certified_source_hash: null, raw_snapshot: { source: 'native_f2_preparation', narxsizSabab: 'avto_qoralama', sourceReference: 'Ф-2 (сформирована в системе); без цены' }, izoh: null },
    { qator_id: 3, certified_quantity: 5, certified_unit_price: 10, certified_amount: 50, provenance_status: 'source_certified', certified_source_hash: null, raw_snapshot: { source: 'native_f2_preparation' }, izoh: null },
    { qator_id: 3, certified_quantity: -1, certified_unit_price: 10, certified_amount: -10, provenance_status: 'source_certified', certified_source_hash: null, raw_snapshot: { source: 'storno', manba_akt_qator_id: 99 }, izoh: null },
  ];
  it('narx kiritish avto belgini oladi; hajm o\'zgarsa summa qayta; storno o\'zgarmaydi', () => {
    const t = qoralamaTahrirYuki(mav, { ozgartir: [{ qator_id: 2, narx: 3 }, { qator_id: 3, hajm: 6 }] });
    expect(t.xato).toEqual([]);
    expect(t.yuk[1]).toMatchObject({ certified_unit_price: 3, certified_amount: 12, price_intentionally_absent: false, raw_snapshot: { sourceReference: 'Ф-2 (сформирована в системе); цена по документу' } });
    expect(t.yuk[1].raw_snapshot.narxsizSabab).toBeUndefined();
    expect(t.yuk[2]).toMatchObject({ certified_quantity: 6, certified_amount: 60 });
    expect(t.yuk[3]).toMatchObject({ certified_quantity: -1, certified_amount: -10, manba_akt_qator_id: 99 });
    expect(yukJami(t.yuk)).toMatchObject({ qatorlar: 4, summa: 62, narxsiz: 1, narxsiz_avto: 0 });
  });
  it('ongli narxsiz; olib tashlash; storno/yo\'q qatorga tegish — xato', () => {
    const t = qoralamaTahrirYuki(mav, { ozgartir: [{ qator_id: 2, narxsiz: true }], olibTashla: [1] });
    expect(t.yuk.map((q) => q.qator_id)).toEqual([2, 3, 3]);
    expect(t.yuk[0].raw_snapshot.narxsizSabab).toBeUndefined();
    expect(qoralamaTahrirYuki(mav, { ozgartir: [{ qator_id: 8, hajm: 1 }] }).xato[0]).toMatch(/#8/);
    expect(qoralamaTahrirYuki(mav, { ozgartir: [{ qator_id: 3, hajm: 0 }] }).xato[0]).toMatch(/hajm 0/);
  });
});

describe('podvalFoizQoy', () => {
  it('foiz o\'rnatiladi, manba=smeta; tuzilma to\'g\'ri qoladi; noma\'lum kod — xato', () => {
    const p = standartPodval({ 'НДС': 12 });
    const r = podvalFoizQoy(p.qatorlar as never, { tr_mat: 4.5, nds: 12 }, { dalil: 'smeta podvali', katak: { tr_mat: 'F10' } });
    expect(r.xato).toEqual([]);
    const tr = r.qatorlar.find((q) => q.kod === 'tr_mat')!;
    expect(tr).toMatchObject({ foiz: 4.5, manba: 'smeta', dalil: 'smeta podvali', katak: 'F10' });
    expect(podvalTekshir({ versiya: 1, qatorlar: r.qatorlar } as never)).toEqual([]);
    expect(podvalFoizQoy(p.qatorlar as never, { yoq_kod: 1 }).xato[0]).toMatch(/yoq_kod/);
    expect(podvalFoizQoy(p.qatorlar as never, { itogo1: 1 }).xato[0]).toMatch(/foiz qatori emas/);
  });
});

describe('narx va fakt yordamchilari', () => {
  it('narxNusxa: kalit bo\'yicha × koef; noaniq tashlanadi', () => {
    const r = narxNusxa(
      [{ id: 1, tur: 'mat', kod: 'A-1', nom: 'Sinov material', birlik: 'kg', narx: null }, { id: 2, tur: 'mat', kod: 'B', nom: 'X', birlik: 't', narx: null }, { id: 3, tur: 'rs', kod: 'C', nom: 'Y', birlik: 'h', narx: null }],
      [{ tur: 'mat', kod: 'a-1', nom: 'sinov  material', birlik: 'KG', narx: 10 }, { tur: 'mat', kod: 'B', nom: 'X', birlik: 't', narx: 1 }, { tur: 'mat', kod: 'B', nom: 'X', birlik: 't', narx: 2 }],
      { koef: 1.1 });
    expect(r.narxlar).toEqual([{ qator_id: 1, narx: 11, manba_narx: 10 }]);
    expect(r.noaniq).toEqual([2]);
    expect(r.topilmadi).toEqual([3]);
  });
  it('blSumma: birorta bola null — null', () => {
    expect(blSumma([{ summa: 1.005 }, { summa: 2 }])).toBe(3.01);
    expect(blSumma([{ summa: 1 }, { summa: null }])).toBeNull();
    expect(blSumma([])).toBeNull();
  });
  it('faktNolYuki: to\'g\'ridan fakt −delta; hosila fakt o\'tkaziladi', () => {
    const f = faktNolYuki([{ qator_id: 1, fakt_hajm: 3, direct_fakt_hajm: 3 }, { qator_id: 2, fakt_hajm: 5, fakt_manbasi: 'BL_NORMA', direct_fakt_hajm: null }, { qator_id: 3, fakt_hajm: null }]);
    expect(f.qatorlar).toEqual([{ qator_id: 1, hajm: -3 }]);
    expect(f.otkazildi.map((x) => x.qator_id)).toEqual([2]);
  });
  it('qoshimchaTaxmin: norma × ish hajmi', () => {
    expect(qoshimchaTaxmin(10, [{ norma: 0.5, narx: 4 }, { hajm: 2, narx: null }])).toMatchObject({ summa: 20, narxsiz: 1 });
  });
});

// ───────────── mock pg ─────────────

const tavsif = (nom: string, arg: Array<[string, string]>, def: number) => ({ oid: 1, nom, default_soni: def, toplam: false, arg_nomlar: arg.map((x) => x[0]), arg_turlar: arg.map((x) => x[1]) });
const AKT_YARAT = tavsif('t2_akt_yarat_v2', [['p_obyekt_id', 'bigint'], ['p_oy', 'date'], ['p_qatorlar', 'jsonb'], ['p_actor_id', 'bigint'], ['p_raqam', 'text'], ['p_operation_id', 'uuid'], ['p_manba', 'text']], 3);
const LC = tavsif('t2_akt_lifecycle_transition_v1', [['p_kompaniya_id', 'bigint'], ['p_akt_id', 'bigint'], ['p_to_status', 'text'], ['p_actor_id', 'bigint'], ['p_expected_version', 'integer'], ['p_operation_id', 'uuid'], ['p_reason', 'text']], 1);
const umumiy = (sql: string): Array<Record<string, unknown>> | undefined => {
  if (sql.includes("n.nspname = 'snapshot' and p.proname")) return [{ bor: true }];
  if (sql.startsWith('select snapshot.ol(')) return [{ id: 77 }];
  if (sql.includes("to_regprocedure('public.t2_audit_yoz")) return [{ bor: false }];
  if (sql.includes('select to_regclass($1)')) return [{ bor: true }];
  if (sql.includes('from public.t2_obyekt where id')) return [{ id: 900, nom: 'Sinov obyekt', kompaniya_id: 1 }];
  if (sql.includes('from public.t2_obyekt_nakrutka where')) return [{ kf_chel: 1.12, kf_mash: 1.12, kf_mat: 1.12, kf_ob: 1.12, kf_mk: 1.12, kf_kab: 1.12, kf_bezsklad: 1.12, koeffitsientlar: { 'НДС': 12 } }];
  return undefined;
};

describe('toollar ro\'yxati', () => {
  it('ish oqimi toollari ro\'yxatda, yozuvchilarida dry_run bor', () => {
    const nomlar = TOOLLAR.map((t) => t.nom);
    for (const n of ['f2_qoralama_yarat', 'f2_holat', 'f2_qoralama_tahrir', 'podval_tahrir', 'narx_tuzat', 'bajarilmadi', 'qoshimcha_ish', 'fakt_yoz', 'yoyilma']) expect(nomlar).toContain(n);
    expect(new Set(nomlar).size).toBe(nomlar.length);
  });
});

describe('f2_qoralama_yarat (mock)', () => {
  it('dry_run standart: t2_akt_yarat_v2 frontend_v2 yuki bilan chaqiriladi, ROLLBACK, snapshot olinmaydi', async () => {
    const { mu, h } = mockMuhit((sql, p) => umumiy(sql)
      ?? (sql.includes("holat = 'qoralama'") ? []
        : sql.includes('f2_mumkin_hajm > 0.000001') ? [{ qator_id: 11, ota_id: null, tur: 'bl', kod: 'E1', nom: 'Ish', birlik: 'm3', kat: null, mumkin: 2, smeta_narx: null },
          { qator_id: 12, ota_id: 11, tur: 'rs', kod: null, nom: 'Mehnat', birlik: 'chel-soat', kat: 'ЧЕЛ', mumkin: 4, smeta_narx: 25 }]
          : sql.includes('proargnames') && p[1] === 't2_akt_yarat_v2' ? [AKT_YARAT]
            : sql.includes('"t2_akt_yarat_v2"(') ? [{ t2_akt_yarat_v2: { ok: true, akt_id: 5001 } }] : []));
    const j = await toolChaqir(f2QoralamaYarat, mu, { obyekt_idlar: [900], oy: '2026-10' });
    expect(j.isError).toBeFalsy();
    const r = JSON.parse(j.content[0].text);
    expect(r.dry_run).toBe(true);
    expect(r.obyektlar[0]).toMatchObject({ obyekt_id: 900, yozildi: true, akt_id: 5001, qatorlar: 2, ish: 1, summa: { ustamasiz: 100, qqs_bilan: 112, ustamali: 100 } });
    const c = h.sorovlar.find((x) => x.sql.includes('"t2_akt_yarat_v2"('))!;
    expect(c.params[1]).toBe('2026-10-01');
    expect(JSON.parse(String(c.params[2]))[1]).toMatchObject({ qator_id: 12, certified_amount: 100, raw_snapshot: { source: 'native_f2_preparation' } });
    expect(c.params[6]).toBe('frontend_v2');
    expect(h.sorovlar.some((x) => x.sql.startsWith('select snapshot.ol('))).toBe(false);
    expect(h.sorovlar.at(-1)!.sql).toBe('ROLLBACK');
  });
  it('ochiq qoralama bor — o\'tkaziladi (majburiysiz)', async () => {
    const { mu } = mockMuhit((sql) => umumiy(sql) ?? (sql.includes("holat = 'qoralama'") ? [{ id: 4, raqam: null, oy: '2026-10-01', lifecycle_status: 'draft' }] : []));
    const r = JSON.parse((await toolChaqir(f2QoralamaYarat, mu, { obyekt_idlar: [900], oy: '2026-10' })).content[0].text);
    expect(r.obyektlar[0]).toMatchObject({ yozildi: false });
  });
});

describe('f2_holat (mock)', () => {
  it('toliq_tasdiq: draft → submitted → checked → approved, har qadam yangi versiya bilan; dry_run:false — COMMIT', async () => {
    const { mu, h } = mockMuhit((sql, p) => umumiy(sql)
      ?? (sql.includes('from public.t2_akt where id') ? [{ id: 10, obyekt_id: 900, kompaniya_id: 1, tur: 'f2', holat: 'qoralama', lifecycle_status: 'draft', versiya: 3, raqam: '1', oy: '2026-10-01' }]
        : sql.includes('narxsizSabab') ? [{ n: 0, idlar: null }]
          : sql.includes('proargnames') ? [LC]
            : sql.includes('"t2_akt_lifecycle_transition_v1"(') ? [{ x: { ok: true, status: p[2], version: Number(p[4]) + 1 } }] : []));
    const j = await toolChaqir(f2Holat, mu, { akt_idlar: [10], holat: 'approved', toliq_tasdiq: true, dry_run: false });
    expect(j.isError).toBeFalsy();
    const r = JSON.parse(j.content[0].text);
    expect(r.aktlar[0]).toMatchObject({ akt_id: 10, oldin: 'draft', keyin: 'approved', versiya: 6, qadamlar: 3, snapshot_id: 77 });
    const c = h.sorovlar.filter((x) => x.sql.includes('"t2_akt_lifecycle_transition_v1"('));
    expect(c.map((x) => [x.params[2], x.params[4]])).toEqual([['submitted', 3], ['checked', 4], ['approved', 5]]);
    expect(h.sorovlar.at(-1)!.sql).toBe('COMMIT');
  });
  it('server kodi o\'qiladigan xato; tranzaksiya ROLLBACK', async () => {
    const { mu, h } = mockMuhit((sql) => umumiy(sql)
      ?? (sql.includes('from public.t2_akt where id') ? [{ id: 10, obyekt_id: 900, kompaniya_id: 1, tur: 'f2', holat: 'qoralama', lifecycle_status: 'draft', versiya: 3 }]
        : sql.includes('narxsizSabab') ? [{ n: 2, idlar: [5, 6] }] : []));
    const r = JSON.parse((await toolChaqir(f2Holat, mu, { akt_idlar: [10], holat: 'submitted' })).content[0].text);
    expect(r.aktlar[0].xato).toMatch(/NARXSIZ_QATOR_BOR/);
    expect(h.sorovlar.at(-1)!.sql).toBe('ROLLBACK');
  });
});
