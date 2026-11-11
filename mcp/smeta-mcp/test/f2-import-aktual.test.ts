/** f2_import: aktual (faol) smetaga moslash, voris zanjiri, fakt rejimi (delta), dry run preview xatoda ham — sun'iy fixture, mock pg. */
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { toolChaqir } from '../src/tool';
import { f2Import } from '../src/tools/f2-import';
import { mockMuhit, type Javobchi } from './mock';

const ROWS: unknown[][] = [
  ['АКТ'], ['За июль месяц 2026 года'],
  ['№№', 'ОБОСНОВАНИЕ', 'НАИМЕНОВАНИЕ РАБОТ И РЕСУРСОВ', 'ЕД.ИЗМ', 'КОЛ-ВО', null, 'Сметная стоимость', null],
  [null, null, null, null, 'НА ЕДИНИЦУ', 'ПО ПРОЕКТУ', 'на.ед.изм.', 'общая'],
  [1, 2, 3, 4, 5, 6, 7, 8],
  [1, 'Е1-1-1-1', 'ТЕСТОВАЯ РАБОТА', 'М3', 10, null, null, 1000],
  [1.1, '000001', 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', 'ЧЕЛ-Ч', 5, 50, 20, 1000],
  [null, null, 'ИТОГО ПРЯМЫЕ ЗАТРАТЫ', 'СУМ', null, null, 1000, null],
  [null, null, 'ВСЕГО СТОИМОСТЬ СТРОИТЕЛЬСТВА В ТЕКУЩИХ ЦЕНАХ', 'СУМ', null, null, 1000, null],
];

function faylYoz(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'smeta-mcp-f2a-'));
  const p = path.join(dir, 'eski-lrv.xlsx');
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ROWS), 'F2');
  XLSX.writeFile(wb, p);
  return p;
}

// Eski (almashtirilgan) qatorlar OLDIN turadi (tartib kichik) — eski xatti-harakatda matcher aynan shularni tanlardi.
const q = (id: number, ota: number | null, tur: string, kod: string | null, nom: string, birlik: string | null, hajm: number | null, tartib: number, holat: 'faol' | 'almashtirilgan', norma: number | null = null, kat: string | null = null) =>
  ({ id, obyekt_id: 900, ota_id: ota, daraja: 0, tartib, tur, kod, nom, birlik, hajm, narx: tur === 'rs' ? 20 : null, kat, versiya: 1, norma, versiya_holat: holat });
const SMETA = [
  q(5, null, 'rz', null, 'РАЗДЕЛ 1', null, null, 1, 'almashtirilgan'),
  q(11, 5, 'bl', 'Е1-1-1-1', 'ТЕСТОВАЯ РАБОТА', 'М3', 100, 2, 'almashtirilgan'),
  q(12, 11, 'rs', '000001', 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', 'ЧЕЛ-Ч', 500, 3, 'almashtirilgan', 5, 'ЧЕЛ'),
  q(13, 5, 'bl', 'Х-9-9', 'УДАЛЕННАЯ РАБОТА ЭКСПЕРТИЗОЙ', 'ШТ', 3, 4, 'almashtirilgan'),
  q(10, null, 'rz', null, 'РАЗДЕЛ 1', null, null, 5, 'faol'),
  q(21, 10, 'bl', 'Е1-1-1-1', 'ТЕСТОВАЯ РАБОТА', 'М3', 100, 6, 'faol'),
  q(22, 21, 'rs', '000001', 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', 'ЧЕЛ-Ч', 500, 7, 'faol', 5, 'ЧЕЛ'),
];
const MOSLIK = [{ eski_id: 11, yangi_id: 21 }];
const tavsif = (nom: string, arg_nomlar: string[], arg_turlar: string[]) => ({ oid: 2, nom, default_soni: 0, toplam: false, arg_nomlar, arg_turlar });
const AKT_TAVSIF = tavsif('t2_akt_yarat_v2', ['p_obyekt_id', 'p_oy', 'p_qatorlar', 'p_actor_id', 'p_raqam', 'p_operation_id', 'p_manba'], ['bigint', 'date', 'jsonb', 'bigint', 'text', 'uuid', 'text']);
const FAKT_TAVSIF = tavsif('t2_fakt_yoz_v2', ['p_obyekt_id', 'p_sana', 'p_qatorlar', 'p_actor_id', 'p_operation_id', 'p_izoh', 'p_raqam', 'p_actor_label'], ['bigint', 'date', 'jsonb', 'bigint', 'uuid', 'text', 'text', 'text']);

function baza(qism: { fakt?: Array<{ qator_id: number; hajm: number }>; aktRpc?: Array<Record<string, unknown>> | Error; faktRpc?: Array<Record<string, unknown>> | Error } = {}): Javobchi {
  return (sql, params) => {
    if (sql.includes('from public.t2_obyekt where id')) return [{ id: 900, nom: 'Sinov', kompaniya_id: 1 }];
    if (sql.includes('from public.t2_qator where obyekt_id')) return SMETA;
    if (sql.includes('t2_smeta_versiya_moslik')) return MOSLIK;
    if (sql.includes('t2_nakopitelniy_v2')) return [{ n: { ok: true, qatorlar: [], keyingi_offset: null } }];
    if (sql.includes("a.tur = 'fakt'")) return qism.fakt ?? [];
    if (sql.includes('from public.t2_akt_qator')) return [];
    if (sql.includes('from public.t2_akt where obyekt_id')) return [];
    if (sql.includes('proargnames')) return [params[1] === 't2_fakt_yoz_v2' ? FAKT_TAVSIF : AKT_TAVSIF];
    if (sql.includes('"t2_akt_yarat_v2"(')) return qism.aktRpc ?? [{ t2_akt_yarat_v2: { ok: true, akt_id: 4242 } }];
    if (sql.includes('"t2_fakt_yoz_v2"(')) return qism.faktRpc ?? [{ t2_fakt_yoz_v2: { ok: true, akt_id: 777 } }];
    return [];
  };
}
const chaqir = async (javob: Javobchi, args: Record<string, unknown>) => {
  const { mu, h } = mockMuhit(javob);
  const j = await toolChaqir(f2Import, mu, { obyekt_id: 900, fayl_yoli: faylYoz(), raqam: '1', ...args });
  expect(j.isError, j.content[0].text).toBeFalsy();
  return { n: JSON.parse(j.content[0].text).natija, h };
};

describe('f2_import — aktual smeta', () => {
  it('moslash faqat faol qatorlarga: eski (almashtirilgan) qator tanlanmaydi', async () => {
    const { n, h } = await chaqir(baza(), { taklif_qabul: true, dry_run: true });
    expect(n.aktual.faol_qatorlar).toBe(3);
    expect(n.aktual.almashtirilgan_qatorlar).toBe(4);
    const yarat = h.sorovlar.find((x) => x.sql.includes('"t2_akt_yarat_v2"('));
    const ids = (JSON.parse(String(yarat!.params[2])) as Array<{ qator_id: number }>).map((x) => x.qator_id).sort();
    expect(ids).toEqual([21, 22]);
    expect(n.mos.map((x: { qator_id: number }) => x.qator_id)).toContain(21);
    expect(n.mos[0]).toHaveProperty('ishonch');
  });

  it('qo\'lda bog\'lash eski qatorga: voris zanjiri bo\'yicha faol qatorga; zanjirsiz — «eski versiya, aktual qator yo\'q»', async () => {
    const { n: p } = await chaqir(baza(), { dry_run: true });
    const uidRs = p.takliflar[0].uid as string;
    const uidIsh = p.mos[0].uid as string;
    // resurs → eski 12 (ota 11 → 21 vorisi ostida 22), ish → eski 13 (voris yo'q).
    const { n } = await chaqir(baza(), { dry_run: true, boglar: [{ uid: uidRs, qator_id: 12 }, { uid: uidIsh, qator_id: 13 }] });
    const rs = n.mos.find((x: { uid: string }) => x.uid === uidRs);
    expect(rs.qator_id).toBe(22);
    expect(rs.usul).toBe('qolda:aktual_voris');
    expect(n.aktual.eski_versiya_rad).toEqual([{ uid: uidIsh, eski_qator_id: 13, sabab: "eski versiya, aktual qator yo'q" }]);
    expect(n.qolgan.find((x: { uid: string }) => x.uid === uidIsh).sabab).toBe("eski versiya, aktual qator yo'q");
  });

  it('dry run: yozish rad etilsa ham preview to\'liq, xato qator bo\'yicha', async () => {
    const xato = new Error('t2_akt_yarat_v2 rad etdi: QATOR_ALMASHTIRILGAN: qator 11 almashtirilgan; qatorlar [11,12]');
    const { n, h } = await chaqir(baza({ aktRpc: xato }), { taklif_qabul: true, dry_run: true });
    expect(n.yozildi).toBe(false);
    expect(n.moslash).toBeTruthy();
    expect(n.mos_soni).toBeGreaterThan(0);
    expect(n.qator_xatolari).toEqual([
      { qator_id: 11, sabab: "eski versiya, aktual qator yo'q" }, { qator_id: 12, sabab: "eski versiya, aktual qator yo'q" }]);
    expect(h.sorovlar.some((x) => x.sql === 'ROLLBACK TO SAVEPOINT f2_import_yoz')).toBe(true);
    expect(h.sorovlar.at(-1)!.sql).toBe('ROLLBACK');
  });
});

describe('f2_import — maqsad: fakt', () => {
  it('musbat delta yoziladi (eski qatordagi fakt hisobga olinadi); delta semantikasi', async () => {
    const { n, h } = await chaqir(baza({ fakt: [{ qator_id: 11, hajm: 4 }] }), { maqsad: 'fakt', taklif_qabul: true });
    expect(n.maqsad).toBe('fakt');
    expect(n.fakt.yoziladi.map((x: { qatorId: number; delta: number; mavjud: number }) => [x.qatorId, x.mavjud, x.delta])).toEqual([[21, 4, 6]]);
    // rs qator fakt sifatida alohida yozilmaydi (ish normasidan ergashadi).
    expect(n.fakt.tizimda_bor.find((x: { qatorId: number }) => x.qatorId === 22).sabab).toMatch(/resurs/);
    expect(n.yozildi).toBe(true);
    const c = h.sorovlar.find((x) => x.sql.includes('"t2_fakt_yoz_v2"('));
    expect(c).toBeTruthy();
    expect(JSON.parse(String(c!.params[2]))).toEqual([{ qator_id: 21, hajm: 6 }]);
    expect(String(c!.params.find((p) => typeof p === 'string' && p.includes('eski-lrv.xlsx')))).toContain('delta');
    expect(h.sorovlar.some((x) => x.sql === 'COMMIT')).toBe(true);
  });

  it('fakt allaqachon tizimda bor (fayl ≤ mavjud) — yozilmaydi, RPC chaqirilmaydi', async () => {
    const { n, h } = await chaqir(baza({ fakt: [{ qator_id: 11, hajm: 7 }, { qator_id: 21, hajm: 3 }] }), { maqsad: 'fakt', taklif_qabul: true });
    expect(n.yozildi).toBe(false);
    expect(n.fakt.yoziladi_soni).toBe(0);
    expect(n.fakt.tizimda_bor.find((x: { qatorId: number }) => x.qatorId === 21).sabab).toBe('tizimda bor — yozilmaydi');
    expect(h.sorovlar.some((x) => x.sql.includes('"t2_fakt_yoz_v2"('))).toBe(false);
  });

  it('dry_run: ROLLBACK, yozilgan hisob qaytadi; yozish xatosi — qator bo\'yicha', async () => {
    const { n, h } = await chaqir(baza({ faktRpc: new Error('QATOR_ALMASHTIRILGAN: qatorlar [21]') }), { maqsad: 'fakt', taklif_qabul: true, dry_run: true });
    expect(n.yozildi).toBe(false);
    expect(n.fakt.yoziladi_soni).toBe(1);
    expect(n.qator_xatolari).toEqual([{ qator_id: 21, sabab: expect.stringContaining('QATOR_ALMASHTIRILGAN') }]);
    expect(h.sorovlar.at(-1)!.sql).toBe('ROLLBACK');
  });
});
