import { describe, expect, it } from 'vitest';
import { identifikator, oqishSorovi, oralaMumkin, overloadTanla, parametrQiymati, qoshishSorovi, rpcSorovi, sanoqSorovi, yangilashSorovi, type FunksiyaTavsif } from '../src/sql';

describe('identifikator', () => {
  it('nom va sxema.nom qo\'shtirnoqqa olinadi', () => {
    expect(identifikator('t2_qator')).toBe('"t2_qator"');
    expect(identifikator('snapshot.ol')).toBe('"snapshot"."ol"');
  });
  it('in\'ektsiya urinishi — xato', () => {
    expect(() => identifikator('t2_qator; drop table x')).toThrow();
    expect(() => identifikator('a"b')).toThrow();
    expect(() => identifikator('a.b.c')).toThrow();
  });
});

describe('sql_oqish o\'rash', () => {
  it('SELECT/WITH o\'raladi, limit+1 va offset', () => {
    const q = oqishSorovi('select * from t2_obyekt;', 50, 100);
    expect(q.oralgan).toBe(true);
    expect(q.sql).toContain('limit 51 offset 100');
    expect(q.sql).not.toMatch(/;\s*\n\) as _mcp_q/);
    expect(oqishSorovi('with x as (select 1) select * from x', 10, 0).oralgan).toBe(true);
  });
  it('ko\'p statement / SHOW / EXPLAIN o\'ralmaydi', () => {
    expect(oralaMumkin('select 1; select 2')).toBe(false);
    expect(oralaMumkin('show search_path')).toBe(false);
    expect(oralaMumkin('explain select 1')).toBe(false);
    expect(oqishSorovi('show search_path', 10, 0).oralgan).toBe(false);
  });
  it('izoh va satr ichidagi ; chalg\'itmaydi', () => {
    expect(oralaMumkin("select ';' as x -- ; izoh\n")).toBe(true);
    expect(oralaMumkin('/* ; */ select 1')).toBe(true);
  });
  it('sanoq so\'rovi', () => {
    expect(sanoqSorovi('select id from t2_qator where obyekt_id = $1')).toContain('count(*)');
    expect(sanoqSorovi('show x')).toBeNull();
  });
});

const fakt: FunksiyaTavsif = {
  oid: 1, nom: 't2_fakt_yoz_v2', toplam: false, defaultSoni: 3,
  argNomlar: ['p_obyekt_id', 'p_sana', 'p_qatorlar', 'p_actor_id', 'p_operation_id', 'p_izoh', 'p_raqam', 'p_actor_label'],
  argTurlar: ['bigint', 'date', 'jsonb', 'bigint', 'uuid', 'text', 'text', 'text'],
};

describe('RPC quruvchi', () => {
  it('named notation, tur katalogdan, jsonb — JSON matn', () => {
    const q = rpcSorovi(fakt, { p_obyekt_id: 153, p_sana: '2026-10-26', p_qatorlar: [{ qator_id: 1, hajm: 2 }] });
    expect(q.sql).toBe('select * from "public"."t2_fakt_yoz_v2"("p_obyekt_id" => $1::bigint, "p_sana" => $2::date, "p_qatorlar" => $3::jsonb)');
    expect(q.params).toEqual([153, '2026-10-26', '[{"qator_id":1,"hajm":2}]']);
  });
  it('overload: majburiy argumentlar berilmasa — null; ortiqcha nom — null', () => {
    expect(overloadTanla([fakt], ['p_obyekt_id', 'p_sana', 'p_qatorlar', 'p_actor_id', 'p_operation_id'])).toBe(fakt);
    expect(overloadTanla([fakt], ['p_obyekt_id'])).toBeNull();
    expect(overloadTanla([fakt], ['p_obyekt_id', 'p_sana', 'p_qatorlar', 'p_actor_id', 'p_operation_id', 'p_yoq'])).toBeNull();
  });
  it('jsonb: tayyor JSON matn o\'zgarmaydi, oddiy matn JSON satrga', () => {
    expect(parametrQiymati('jsonb', '{"a":1}')).toBe('{"a":1}');
    expect(parametrQiymati('jsonb', 'salom')).toBe('"salom"');
    expect(parametrQiymati('bigint[]', [1, 2])).toEqual([1, 2]);
    expect(parametrQiymati('text', null)).toBeNull();
  });
});

describe('UPDATE/INSERT quruvchi', () => {
  const turlar = new Map([['hajm', 'numeric'], ['nom', 'text'], ['versiya', 'integer']]);
  it('faqat katalogdagi ustunlar; qiymatlar parametr', () => {
    const q = yangilashSorovi('public.t2_qator', 5, { hajm: 10, nom: "x'; drop" }, turlar, 3);
    expect(q.sql).toBe('update "public"."t2_qator" set "hajm" = $2::numeric, "nom" = $3::text where id = $1 and versiya = $4 returning *');
    expect(q.params).toEqual([5, 10, "x'; drop", 3]);
    expect(() => yangilashSorovi('public.t2_qator', 5, { yoq: 1 }, turlar)).toThrow(/Ustun yo'q/);
  });
  it('INSERT', () => {
    const q = qoshishSorovi('public.t2_qator', { nom: 'a', hajm: 1 }, turlar);
    expect(q.sql).toBe('insert into "public"."t2_qator" ("nom", "hajm") values ($1::text, $2::numeric) returning *');
  });
});
