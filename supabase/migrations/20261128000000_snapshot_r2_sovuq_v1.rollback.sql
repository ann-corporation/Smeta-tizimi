-- Rollback 20261128000000 (snapshot R2 sovuq). XAVFSIZLIK: sovuq (qatorlar IS NULL) blok bo'lsa rollback RAD ETILADI —
-- avval hammasini tiklang: node ops/scripts/snapshot-r2-sovut.mjs --hammasini-tikla (R2 dan o'qiydi, sha256 tekshiradi).
-- R2 obyektlari o'chirilmaydi (yetim qolsa zarar yo'q, faqat joy).
begin;

do $g$
begin
  if exists (select 1 from snapshot.bolak_mazmun where qatorlar is null) then
    raise exception 'ROLLBACK RAD ETILDI: snapshot.bolak_mazmun da sovuq (R2) bloklar bor — avval --hammasini-tikla';
  end if;
end $g$;

drop function if exists public.t2_db_hajm_v1(bigint);

-- Asl funksiyalar (prod 2026-11-04 holati).
create or replace function snapshot.tozala()
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_s bigint; v_b bigint;
begin
  perform pg_advisory_xact_lock(hashtext('snapshot.tozala'));
  delete from snapshot.obyekt_snapshot s
   where ((s.sabab = 'kunlik' and s.olingan_vaqt < now() - interval '90 days')
       or (s.sabab <> 'kunlik' and s.olingan_vaqt < now() - interval '30 days'))
     and s.id <> (select max(x.id) from snapshot.obyekt_snapshot x where x.obyekt_id = s.obyekt_id);
  get diagnostics v_s = row_count;
  delete from snapshot.bolak_mazmun m where not exists (select 1 from snapshot.obyekt_snapshot_bolak b where b.xesh = m.xesh);
  get diagnostics v_b = row_count;
  return jsonb_build_object('snapshot_ochirildi', v_s, 'bolak_ochirildi', v_b);
end $function$;

create or replace function snapshot.ol(p_obyekt_id bigint, p_sabab text default 'qolda'::text, p_izoh text default null::text, p_muallif text default null::text)
 returns bigint
 language plpgsql
 security definer
 set search_path to ''
 set "TimeZone" to 'UTC'
 set extra_float_digits to '1'
 set "IntervalStyle" to 'postgres'
 set work_mem to '64MB'
as $function$
declare
  v_komp bigint; v_id bigint; v_sh bigint[]; r record; b record;
  v_meta jsonb := '{}'::jsonb; v_bx text[]; v_soni bigint; v_bayt bigint; v_jbayt bigint;
  v_yangi bigint := 0; v_jami bigint := 0; v_umumiy text := ''; v_x text; v_ins integer;
  v_t0 timestamptz := clock_timestamp();
begin
  if p_sabab is null or p_sabab not in ('kunlik', 'mcp_oldi', 'restore_oldi', 'qolda') then
    raise exception 'snapshot.ol: sabab noto''g''ri: % (kunlik|mcp_oldi|restore_oldi|qolda)', p_sabab using errcode = '22023';
  end if;
  select o.kompaniya_id into v_komp from public.t2_obyekt o where o.id = p_obyekt_id;
  if not found then raise exception 'snapshot.ol: obyekt % topilmadi', p_obyekt_id using errcode = 'P0002'; end if;

  perform pg_advisory_xact_lock_shared(hashtext('snapshot.tozala'));
  perform pg_advisory_xact_lock(hashtext('snapshot.obyekt'), p_obyekt_id::integer);

  v_sh := snapshot._shartnomalar(p_obyekt_id);
  insert into snapshot.obyekt_snapshot (kompaniya_id, obyekt_id, sabab, izoh, muallif)
  values (v_komp, p_obyekt_id, p_sabab, p_izoh, p_muallif) returning id into v_id;

  for r in select j.jadval from snapshot.jadval_royxat j order by j.tartib loop
    v_bx := '{}'; v_soni := 0; v_jbayt := 0;
    for b in select * from snapshot._jadval_bolaklar(r.jadval, p_obyekt_id, v_sh) loop
      insert into snapshot.bolak_mazmun (xesh, jadval, qator_soni, qatorlar)
      values (b.o_xesh, r.jadval, b.o_soni, b.o_qatorlar) on conflict (xesh) do nothing;
      get diagnostics v_ins = row_count;
      select pg_column_size(m.qatorlar) into v_bayt from snapshot.bolak_mazmun m where m.xesh = b.o_xesh;
      if v_ins > 0 then v_yangi := v_yangi + v_bayt; end if;
      insert into snapshot.obyekt_snapshot_bolak (snapshot_id, jadval, bolak, qator_soni, xesh)
      values (v_id, r.jadval, b.o_bolak, b.o_soni, b.o_xesh);
      v_bx := v_bx || b.o_xesh; v_soni := v_soni + b.o_soni; v_jbayt := v_jbayt + v_bayt;
    end loop;
    v_x := snapshot._jadval_xesh(r.jadval, v_bx);
    v_meta := v_meta || jsonb_build_object(r.jadval, jsonb_build_object('soni', v_soni, 'xesh', v_x, 'bayt', v_jbayt));
    v_umumiy := v_umumiy || r.jadval || '=' || v_x || ';';
    v_jami := v_jami + v_jbayt;
  end loop;

  update snapshot.obyekt_snapshot s
     set jadvallar = v_meta,
         umumiy_xesh = encode(sha256(convert_to(v_umumiy, 'UTF8')), 'hex'),
         hajm_bayt = v_jami, yangi_bayt = v_yangi,
         davomiylik_ms = (extract(epoch from clock_timestamp() - v_t0) * 1000)::integer
   where s.id = v_id;
  return v_id;
end $function$;

create or replace function snapshot._yukla(p_snapshot_id bigint, p_obyekt_id bigint, p_sh bigint[], p_jadvallar text[])
 returns void
 language plpgsql
 security definer
 set search_path to ''
 set "TimeZone" to 'UTC'
 set extra_float_digits to '1'
 set "IntervalStyle" to 'postgres'
 set work_mem to '64MB'
as $function$
declare r record;
begin
  drop table if exists pg_temp._snap_s;
  drop table if exists pg_temp._snap_j;
  create temp table _snap_s (jadval text not null, pk text not null, h text not null, r jsonb not null) on commit drop;
  create temp table _snap_j (jadval text not null, pk text not null, h text not null) on commit drop;
  for r in select j.jadval, j.doira from snapshot.jadval_royxat j where j.jadval = any (p_jadvallar) order by j.tartib loop
    execute format(
      $q$insert into pg_temp._snap_s (jadval, pk, h, r)
         select %L, %s, md5(e::text), e
         from snapshot.obyekt_snapshot_bolak b
         join snapshot.bolak_mazmun m on m.xesh = b.xesh
         cross join lateral jsonb_array_elements(m.qatorlar) e
         where b.snapshot_id = $1 and b.jadval = %L$q$,
      r.jadval, snapshot._pk_json(r.jadval, 'e'), r.jadval)
    using p_snapshot_id;
    execute format(
      $q$insert into pg_temp._snap_j (jadval, pk, h)
         select %L, %s, md5(z.r::text) from (select to_jsonb(t) r from public.%I t where %s) z$q$,
      r.jadval, snapshot._pk_json(r.jadval, 'z.r'), r.jadval, r.doira)
    using p_obyekt_id, p_sh;
  end loop;
  create index on pg_temp._snap_s (jadval, h);
  create index on pg_temp._snap_s (jadval, pk);
  create index on pg_temp._snap_j (jadval, h);
  create index on pg_temp._snap_j (jadval, pk);
  analyze pg_temp._snap_s;
  analyze pg_temp._snap_j;
end $function$;

drop function if exists snapshot._sovuq_tekshir(bigint);
drop function if exists snapshot.sovuq_statistika();
drop function if exists snapshot.sovuq_bolaklar(bigint);
drop function if exists snapshot.sovuq_tikla(text, text, text);
drop function if exists snapshot.sovuq_sovut(text, text);
drop function if exists snapshot.sovuq_tasdiq(text, text);
drop function if exists snapshot.sovuq_yoz(text, text, text, bigint);
drop function if exists snapshot.sovuq_oqi(text);
drop function if exists snapshot.sovuq_nomzod(integer, integer, boolean);
drop table if exists snapshot.r2_yetim;

alter table snapshot.bolak_mazmun drop constraint if exists bolak_mazmun_mazmun_yoki_r2;
alter table snapshot.bolak_mazmun drop constraint if exists bolak_mazmun_r2_shakl;
alter table snapshot.bolak_mazmun alter column qatorlar set not null;
alter table snapshot.bolak_mazmun
  drop column if exists sovutildi, drop column if exists r2_tasdiqlangan, drop column if exists bayt,
  drop column if exists r2_bayt, drop column if exists r2_sha256, drop column if exists r2_key;

commit;
