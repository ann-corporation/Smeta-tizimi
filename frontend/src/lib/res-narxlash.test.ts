import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resBirlikKalit, resNarxlashPreview, resNomKalit, resQatorlariniOl, resUstunlariniAniqla } from './res-narxlash';

describe('RES narxlash kalitlari', () => {
  it('bazadagi nom va birlik normalizatorlari bilan moslashadi', () => {
    expect(resNomKalit('«Вода Ё»')).toBe(resNomKalit(' вода е '));
    expect(resBirlikKalit('м³')).toBe(resBirlikKalit('М3'));
    expect(resBirlikKalit('ЧЕЛ.-Ч')).toBe(resBirlikKalit('чел-ч'));
  });

  it('haqiqiy RES ikki qatorli narx sarlavhasini o‘qiydi', () => {
    const rows = [
      ['N', 'Шифр номера нормативов и коды ресурсов', 'Наименование работ и затрат', 'Единица измерения', 'Количество', 'Сметная стоимость', ''],
      ['', '', '', '', '', 'на.ед.изм.', 'общая'],
      ['1', 'B-25', 'Бетон Ё 25', 'м³', '10', '123.45', '1234.5'],
    ];
    const cols = resUstunlariniAniqla(rows);
    expect(cols).not.toBeNull();
    expect(resQatorlariniOl(rows, cols!)).toEqual([{ kod: 'B-25', nom: 'Бетон Ё 25', birlik: 'м³', narx: 123.45 }]);
  });

  it('faqat NULL narxni nom+birlik bilan to‘ldiradi, kod farqiga qaramaydi', () => {
    const result = resNarxlashPreview([
      { id: 1, tur: 'mat', kod: 'B25', nom: 'Бетон Ё 25', birlik: 'м3', narx: null },
      { id: 2, tur: 'mat', kod: 'B30', nom: 'Бетон Ё 25', birlik: 'м3', narx: null },
      { id: 3, tur: 'mat', kod: 'B25', nom: 'Бетон Ё 25', birlik: 'м3', narx: 99 },
      { id: 4, tur: 'mat', kod: 'B25', nom: 'Бетон Ё 25', birlik: 'м3', narx: 0 },
    ], [{ kod: 'b 25', nom: 'бетон е 25', birlik: 'м³', narx: 123.45 }]);
    expect(result.narxsiz).toBe(2);
    expect(result.mos).toBe(2);
    expect(result.qatorNarxlari.get(1)).toBe(123.45);
    expect(result.qatorNarxlari.get(2)).toBe(123.45);
    expect(result.qatorNarxlari.has(3)).toBe(false);
    expect(result.qatorNarxlari.has(4)).toBe(false);
  });

  it('bir manba kalitida ikki narx bo‘lsa avtomatik yozishni bloklaydi', () => {
    const result = resNarxlashPreview(
      [{ id: 1, tur: 'mat', kod: 'C', nom: 'Maxsus resurs', birlik: 'шт', narx: null }],
      [{ kod: 'C', nom: 'Maxsus resurs', birlik: 'шт', narx: 100 }, { kod: 'C', nom: 'Maxsus resurs', birlik: 'шт', narx: 200 }],
    );
    expect(result.ziddiyatliManba).toBe(1);
    expect(result.mos).toBe(0);
  });

  it('kodsiz RES manbasi nom+birlik bo\'yicha xavfsiz moslashadi', () => {
    const result = resNarxlashPreview([
      { id: 10, tur: 'mat', kod: 'SMETA-1', nom: 'бетон b25', birlik: 'м3', narx: null },
    ], [{ nom: 'бетон b25', birlik: 'м³', narx: 321.5 }]);
    expect(result.mos).toBe(1);
    expect(result.qatorNarxlari.get(10)).toBe(321.5);
    expect(result.moslashmagan).toEqual([]);
  });

  it('narxsiz qatorni turiga va aniq sababiga ajratadi', () => {
    const result = resNarxlashPreview([
      { id: 11, tur: 'rs', kod: 'A', nom: 'Ishchi kuchi', birlik: 'soat', narx: null },
      { id: 12, tur: 'ob', kod: 'B', nom: null, birlik: 'dona', narx: null },
    ], [{ kod: 'C', nom: 'Boshqa resurs', birlik: 'dona', narx: 5 }]);
    expect(result.turBoyicha).toEqual({
      rs: { narxsiz: 1, mos: 0 },
      mat: { narxsiz: 0, mos: 0 },
      ob: { narxsiz: 1, mos: 0 },
    });
    expect(result.moslashmagan.map((x) => x.sabab)).toEqual(['RES_MANBASI_TOPILMADI', 'QATOR_IDENTIYASI_YOQ']);
  });

  it('kodli va kodsiz mos manbalar turli narx bersa avtomatik tanlamaydi', () => {
    const result = resNarxlashPreview([
      { id: 13, tur: 'mat', kod: 'C', nom: 'Maxsus resurs', birlik: 'шт', narx: null },
    ], [
      { kod: 'C', nom: 'Maxsus resurs', birlik: 'шт', narx: 100 },
      { nom: 'Maxsus resurs', birlik: 'шт', narx: 200 },
    ]);
    expect(result.mos).toBe(0);
    expect(result.ziddiyatliManba).toBe(1);
    expect(result.moslashmagan[0]?.sabab).toBe('RES_MANBA_ZIDDIYATI');
  });

  it('boshqa kodli bir xil mahsulotning qarama-qarshi narxlari fail-closed', () => {
    const result = resNarxlashPreview([
      { id: 20, tur: 'mat', kod: 'SOURCE-A', nom: 'Бетон Ё25', birlik: 'м³', narx: null },
      { id: 21, tur: 'mat', kod: 'SOURCE-B', nom: 'Бетон Ё25', birlik: 'м³', narx: null },
      { id: 22, tur: 'mat', kod: null, nom: 'Бетон Ё25', birlik: 'м³', narx: null },
    ], [
      { kod: 'SOURCE-A', nom: 'бетон е25', birlik: 'М3', narx: 100 },
      { kod: 'SOURCE-B', nom: 'Бетон Ё25', birlik: 'м³', narx: 200 },
    ]);
    expect(result).toMatchObject({ narxsiz: 3, mos: 0, narxsizQoldi: 3, ziddiyatliManba: 1 });
    expect(result.qatorNarxlari.size).toBe(0);
    expect(result.moslashmagan.every(x => x.sabab === 'RES_MANBA_ZIDDIYATI')).toBe(true);
  });

  it('takrorlangan bir xil narxli boshqa kodlar ziddiyat emas', () => {
    const result = resNarxlashPreview([
      { id: 23, tur: 'ob', kod: null, nom: 'Насос', birlik: 'шт', narx: null },
    ], [{ kod: 'A', nom: 'Насос', birlik: 'шт', narx: 500 }, { kod: 'B', nom: 'насос', birlik: 'ШТ', narx: 500 }]);
    expect(result).toMatchObject({ mos: 1, ziddiyatliManba: 0 });
    expect(result.qatorNarxlari.get(23)).toBe(500);
  });

  it('kod bir xil bo‘lsa ham boshqa nom yoki birlik mos emas', () => {
    const result = resNarxlashPreview([
      { id: 24, tur: 'mat', kod: 'A', nom: 'Бетон B25', birlik: 'т', narx: null },
      { id: 25, tur: 'mat', kod: 'A', nom: 'Бетон B30', birlik: 'м3', narx: null },
      { id: 26, tur: 'mat', kod: 'A', nom: null, birlik: 'м3', narx: null },
      { id: 27, tur: 'mat', kod: 'A', nom: 'Бетон B25', birlik: null, narx: null },
    ], [{ kod: 'A', nom: 'Бетон B25', birlik: 'м3', narx: 100 }]);
    expect(result.mos).toBe(0);
    expect(result.moslashmagan.map(x => x.sabab)).toEqual([
      'RES_MANBASI_TOPILMADI', 'RES_MANBASI_TOPILMADI', 'QATOR_IDENTIYASI_YOQ', 'QATOR_IDENTIYASI_YOQ',
    ]);
  });

  it('RES o‘qish nolni saqlaydi, bo‘sh va manfiy narxni olmaydi', () => {
    const rows = [
      ['Шифр', 'Наименование', 'Единица', 'Цена'],
      ['Z', 'Нулевой тариф', 'чел-ч', 0],
      ['B', 'Пустой тариф', 'чел-ч', ''],
      ['N', 'Отрицательный тариф', 'чел-ч', -1],
    ];
    const values = resQatorlariniOl(rows, { kod: 0, nom: 1, birlik: 2, narx: 3, sarlavha: 0 });
    expect(values).toEqual([{ kod: 'Z', nom: 'Нулевой тариф', birlik: 'чел-ч', narx: 0 }]);
    const result = resNarxlashPreview([
      { id: 28, tur: 'rs', kod: 'OTHER', nom: 'Нулевой тариф', birlik: 'чел-ч', narx: null },
    ], values);
    expect(result.qatorNarxlari.get(28)).toBe(0);
    expect(result.mos).toBe(1);
  });

  it('nol va musbat manba narxlari ham bir nom+birlikda ziddiyat', () => {
    const result = resNarxlashPreview([
      { id: 29, tur: 'rs', kod: 'A', nom: 'Тариф', birlik: 'чел-ч', narx: null },
    ], [{ kod: 'A', nom: 'Тариф', birlik: 'чел-ч', narx: 0 }, { kod: 'B', nom: 'Тариф', birlik: 'чел-ч', narx: 10 }]);
    expect(result).toMatchObject({ mos: 0, ziddiyatliManba: 1 });
  });

  it('preview targets only resource NULLs and leaves inputs unchanged', () => {
    const targets = [
      { id: 30, tur: 'rs', kod: 'A', nom: 'Тариф', birlik: 'чел-ч', narx: null },
      { id: 31, tur: 'rs', kod: 'A', nom: 'Тариф', birlik: 'чел-ч', narx: 0 },
      { id: 32, tur: 'rs', kod: 'A', nom: 'Тариф', birlik: 'чел-ч', narx: 99 },
      { id: 33, tur: 'ish', kod: 'A', nom: 'Тариф', birlik: 'чел-ч', narx: null },
    ];
    const sources = [{ kod: 'B', nom: 'Тариф', birlik: 'чел-ч', narx: 10 }];
    const before = JSON.stringify({ targets, sources });
    const result = resNarxlashPreview(targets, sources);
    expect([...result.qatorNarxlari]).toEqual([[30, 10]]);
    expect(result.narxsiz).toBe(1);
    expect(JSON.stringify({ targets, sources })).toBe(before);
  });
});

describe('RES v2 migration source gates (not database execution)', () => {
  const dir = resolve(__dirname, '../../../supabase/migrations');
  const forward = readFileSync(resolve(dir, '20261106410000_t2_smeta_price_name_unit_v2.sql'), 'utf8');
  const rollback = readFileSync(resolve(dir, '20261106410000_t2_smeta_price_name_unit_v2.rollback.sql'), 'utf8');
  const acceptance = readFileSync(resolve(dir, '20261106410000_t2_smeta_price_name_unit_v2.acceptance.sql'), 'utf8');

  it('all three source CTEs group name+unit and retain zero; code never selects a price', () => {
    expect(forward.match(/group by nom_key, birlik_key/g)).toHaveLength(3);
    expect(forward.match(/narx is not null and narx >= 0/g)).toHaveLength(3);
    expect(forward).not.toMatch(/kod_key|x\.kod|q\.kod/);
    expect(forward.match(/having count\(distinct narx\) = 1/g)).toHaveLength(4);
    expect(forward.match(/q\.narx is null/g)).toHaveLength(3);
    expect(forward).not.toMatch(/q\.narx\s*=\s*0/);
  });

  it('retains authorization and strengthens operation scope without changing unknown quantity handling', () => {
    expect(forward).toContain('public.t2_actor_kompaniya_azo_tekshir');
    expect(forward).toContain('v_obyekt_kompaniya <> p_kompaniya_id');
    expect(forward).toContain('v_old_actor is distinct from p_actor_id');
    expect(forward).toContain("(v_old->>'obyekt_id')::bigint is distinct from p_obyekt_id");
    expect(forward).toContain('pg_advisory_xact_lock');
    expect(forward).toContain('summa = case when q.hajm is null then null else q.hajm * u.narx end');
    expect(forward).toContain('perform public.t2_rollup(p_obyekt_id)');
    expect(forward).toContain('perform public.t2_signal_refresh_object(p_kompaniya_id, p_obyekt_id)');
    expect(forward).toContain('perform public.t2_audit_yoz(p_kompaniya_id');
    expect(forward).toContain("values (p_operation_id, p_actor_id, 't2_smeta_narxla_res_v2', v_natija)");
    expect(forward).toContain('from public, anon, authenticated');
    expect(forward).toContain('grant execute on function public.t2_smeta_narxla_res_v2(bigint, bigint, bigint, uuid, jsonb) to service_role');
  });

  it('rollback removes only v2 and acceptance fixtures are enclosed by BEGIN/ROLLBACK', () => {
    expect(rollback).toContain('drop function if exists public.t2_smeta_narxla_res_v2(');
    expect(rollback).not.toMatch(/(?:drop|delete|update).*\bt2_(?:qator|smeta_narxla_res_v1)\b/i);
    expect(acceptance).toMatch(/begin;\s+do \$test\$/i);
    expect(acceptance.trim()).toMatch(/rollback;$/i);
    expect(acceptance).not.toMatch(/\bcommit\s*;/i);
  });
});
