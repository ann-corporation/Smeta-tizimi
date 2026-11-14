/**
 * 20261221620000 — «smetadan tashqari» (egasi 2026-11-14) migratsiya kontrakti (repo darajasi; bazadagi qabul — .acceptance.sql).
 * Belgi t2_svod_yaxlit da (parallel jadval yo'q); smeta o'lchovlari chiqaradi, fakt/F-2 o'zgarmaydi.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dir = resolve(__dirname, '../../../supabase/migrations');
const NOM = '20261221620000_t2_smetadan_tashqari_v1';
const oqi = (f: string) => readFileSync(resolve(dir, f), 'utf8');
const migr = oqi(`${NOM}.sql`);
const rb = oqi(`${NOM}.rollback.sql`);
const acc = oqi(`${NOM}.acceptance.sql`);

describe('20261221620000 — smetadan tashqari', () => {
  it('belgi mavjud jadvalda (turi ga ortogonal ustun), yangi jadval yo‘q, BEGIN/COMMIT yo‘q', () => {
    expect(migr).toMatch(/alter table public\.t2_svod_yaxlit add column if not exists smetadan_tashqari boolean not null default false/);
    expect(migr).not.toMatch(/create table (if not exists )?public\.t2_(?!svod_yaxlit)/i);
    expect(migr).not.toMatch(/^\s*(begin|commit)\s*;/im);
  });

  it('agg yamog‘i faqat smeta / smeta_joriy o‘lchovlarini chiqaradi; fakt / F-2 tarmoqlariga tegmaydi', () => {
    expect(migr).toContain(`(y.smetadan_tashqari and p_olchov in ('smeta', 'smeta_joriy')) as tsh`);
    expect(migr).toContain('from r where not r.tsh group by r.obyekt_id');
    expect(migr).toContain(`'smetadan_tashqari', coalesce(tq.qqssiz, 0), 'smetadan_tashqari_soni', coalesce(tq.soni, 0)`);
    // fakt / f2 / aktlar tarmoqlari uchun yangi shart qo'shilmaydi.
    expect(migr).not.toMatch(/p_olchov\s*=\s*'(fakt|f2|f2_qoralama|aktlar)'[^\n]*tsh/);
  });

  it('har langar aynan 1 marta (drift himoyasi) va asl matn zaxirada; paket va RPC yamalgan', () => {
    expect(migr).toMatch(/n <> 1 then raise exception 'SMETADAN_TASHQARI/);
    expect(migr).toMatch(/insert into public\._t2_fn_zaxira \(nom, tarif\) values \(v_nomlar\[i\] \|\| ':20261221620000', v_eski\)/);
    expect(migr).toContain('public._t2_summa_paket_tashqari_v1(a.agg, n.x->\'nk\') as paket');
    expect(migr).toContain('l as materialized (select x.* from l0 x where not exists (select 1 from tq where tq.id = x.qator_id)),');
  });

  it('belgilash RPC: CAS, sabab, narx.write, faqat service_role', () => {
    expect(migr).toMatch(/create or replace function public\.t2_svod_yaxlit_tashqari_v1\(\s*p_kompaniya_id bigint, p_actor_id bigint, p_id bigint, p_belgi boolean, p_kutilgan_versiya integer, p_sabab text\)/);
    expect(migr).toMatch(/t2_require_permission_v2\(p_kompaniya_id, p_actor_id, 'narx\.write'\)/);
    expect(migr).toMatch(/p_kutilgan_versiya <> v_eski\.versiya/);
    expect(migr).toMatch(/revoke all on function public\.t2_svod_yaxlit_tashqari_v1\(bigint, bigint, bigint, boolean, integer, text\) from public, anon, authenticated/);
    expect(migr).toMatch(/grant execute on function public\.t2_svod_yaxlit_tashqari_v1\(bigint, bigint, bigint, boolean, integer, text\) to service_role/);
  });

  it('kirill faqat U& bilan; real ma‘lumot yo‘q', () => {
    expect(migr).toContain(`U&'\\041D\\0414\\0421'`);
    for (const s of [migr, rb, acc]) expect(s).not.toMatch(/[А-Яа-яЁё]{4,}/);
  });

  it('rollback: zaxiradan tiklaydi, keyin yangi obyektlar va ustunni olib tashlaydi', () => {
    expect(rb).toMatch(/_t2_summa_agg_v1', '_t2_summa_paket_v1', 't2_smeta_ozgarish_qatlam_v1/);
    expect(rb).toMatch(/drop function if exists public\._t2_summa_paket_tashqari_v1/);
    expect(rb).toMatch(/drop function if exists public\.t2_svod_yaxlit_tashqari_v1/);
    expect(rb).toMatch(/drop column if exists smetadan_tashqari/);
  });

  it('acceptance: F-2 / fakt / akt paketlari belgidan keyin AYNAN teng; smeta_joriy kamayadi', () => {
    expect(acc).toMatch(/f1 is distinct from f0 or fk1 is distinct from fk0 or ak1 is distinct from ak0/);
    expect(acc).toMatch(/SMETADAN_TASHQARI_ACCEPTANCE_PASS/);
    expect(acc).toMatch(/^begin;/m);
    expect(acc).toMatch(/^rollback;/m);
  });
});
