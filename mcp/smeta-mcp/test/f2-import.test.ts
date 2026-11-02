/** f2_import: sun'iy F2 fayli (xlsx) → frontend parser/moslash → t2_akt_yarat_v2 yuki; mock pg, dry_run (ROLLBACK). */
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { toolChaqir } from '../src/tool';
import { f2Import } from '../src/tools/f2-import';
import { mockMuhit } from './mock';

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
  const dir = mkdtempSync(path.join(os.tmpdir(), 'smeta-mcp-f2-'));
  const p = path.join(dir, 'sinov-f2.xlsx');
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ROWS), 'F2');
  XLSX.writeFile(wb, p);
  return p;
}

const SMETA = [
  { id: 10, obyekt_id: 900, ota_id: null, daraja: 0, tartib: 1, tur: 'rz', kod: null, nom: 'РАЗДЕЛ 1', birlik: null, hajm: null, narx: null, kat: null, versiya: 1, norma: null },
  { id: 11, obyekt_id: 900, ota_id: 10, daraja: 1, tartib: 2, tur: 'bl', kod: 'Е1-1-1-1', nom: 'ТЕСТОВАЯ РАБОТА', birlik: 'М3', hajm: 100, narx: null, kat: null, versiya: 1, norma: null },
  { id: 12, obyekt_id: 900, ota_id: 11, daraja: 2, tartib: 3, tur: 'rs', kod: '000001', nom: 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', birlik: 'ЧЕЛ-Ч', hajm: 500, narx: 20, kat: 'ЧЕЛ', versiya: 1, norma: 5 },
];
const AKT_TAVSIF = {
  oid: 2, nom: 't2_akt_yarat_v2', default_soni: 0, toplam: false,
  arg_nomlar: ['p_obyekt_id', 'p_oy', 'p_qatorlar', 'p_actor_id', 'p_raqam', 'p_operation_id', 'p_manba'],
  arg_turlar: ['bigint', 'date', 'jsonb', 'bigint', 'text', 'uuid', 'text'],
};

describe('f2_import (dry_run)', () => {
  it('fayl o\'qiladi, smeta bilan moslanadi, akt yuki quriladi va ROLLBACK', async () => {
    const fayl = faylYoz();
    const { mu, h } = mockMuhit((sql) => {
      if (sql.includes('from public.t2_obyekt where id')) return [{ id: 900, nom: 'Sinov', kompaniya_id: 1 }];
      if (sql.includes('from public.t2_qator where obyekt_id')) return SMETA;
      if (sql.includes('t2_nakopitelniy_v2')) return [{ n: { ok: true, qatorlar: [], keyingi_offset: null } }];
      if (sql.includes('from public.t2_akt_qator')) return [];
      if (sql.includes('from public.t2_akt where obyekt_id')) return [];
      if (sql.includes('proargnames')) return [AKT_TAVSIF];
      if (sql.includes('"t2_akt_yarat_v2"(')) return [{ t2_akt_yarat_v2: { ok: true, akt_id: 4242 } }];
      return [];
    });
    const j = await toolChaqir(f2Import, mu, { obyekt_id: 900, fayl_yoli: fayl, raqam: '1', taklif_qabul: true, dry_run: true });
    expect(j.isError, j.content[0].text).toBeFalsy();
    const r = JSON.parse(j.content[0].text);
    expect(r.dry_run).toBe(true);
    const n = r.natija;
    expect(n.aktlar).toHaveLength(1);
    expect(n.tanlangan.davr).toBe('2026-07');
    // Ish — aniq (kod+nom), resurs — ◐ taklif → taklif_qabul bilan tasdiqlanadi.
    expect(n.moslash).toEqual({ aniq: 1, xotira: 0, taklif: 1, topilmadi: 0 });
    expect(n.yozildi).toBe(true);
    expect(n.yoziladi).toBe(2);
    const yarat = h.sorovlar.find((x) => x.sql.includes('"t2_akt_yarat_v2"('));
    expect(yarat).toBeTruthy();
    const qatorlar = JSON.parse(String(yarat!.params[2])) as Array<{ qator_id: number; raw_snapshot: { manba: string; fayl_sha256: string } }>;
    expect(qatorlar.map((q) => q.qator_id).sort()).toEqual([11, 12]);
    expect(qatorlar[0].raw_snapshot.manba).toBe('f2_v3');
    expect(qatorlar[0].raw_snapshot.fayl_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(yarat!.params[1]).toBe('2026-07-01');
    expect(yarat!.params[3]).toBe(7); // aktor
    expect(n.akt).toEqual({ ok: true, akt_id: 4242 });
    expect(h.sorovlar.at(-1)!.sql).toBe('ROLLBACK');
    expect(h.sorovlar.some((x) => x.sql === 'COMMIT')).toBe(false);
  });

  it('qo\'lda bog\'lash: noma\'lum uid — aniq xato', async () => {
    const fayl = faylYoz();
    const { mu } = mockMuhit((sql) => (sql.includes('from public.t2_obyekt where id') ? [{ id: 900, nom: 'S', kompaniya_id: 1 }]
      : sql.includes('from public.t2_qator where obyekt_id') ? SMETA : sql.includes('t2_nakopitelniy_v2') ? [{ n: { ok: true, qatorlar: [], keyingi_offset: null } }] : []));
    const j = await toolChaqir(f2Import, mu, { obyekt_id: 900, fayl_yoli: fayl, boglar: [{ uid: 'YOQ!1', qator_id: 11 }], dry_run: true });
    expect(j.isError).toBe(true);
    expect(j.content[0].text).toMatch(/uid topilmadi/);
  });
});
