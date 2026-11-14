-- Rollback: 20261214200000_t2_loyihachi_chizma_v1
-- Diqqat: chizma ma'lumoti o'chadi (jadvallar). Avval kerak bo'lsa nusxa oling. _t2_tomon_rol_ok dagi 'loyihachi'/'murojaat'
-- tuzatishi ATAYIN qaytarilmaydi (u prodda murojaat oqimini tiklaydi; qaytarish uni yana buzadi).
do $$
declare f text;
begin
  foreach f in array array[
    '_t2_chizma_xabar(bigint,text,bigint,bigint,bigint,bigint,bigint[],text[],jsonb)',
    't2_chizma_toplam_saqla_v1(bigint,bigint,bigint,bigint,text,text,text,text,uuid)',
    't2_chizma_revizya_yarat_v1(bigint,bigint,bigint,bigint,text,text,uuid)',
    't2_chizma_revizya_tahrir_v1(bigint,bigint,bigint,bigint,text,text)',
    't2_chizma_taklif_yoz_v1(bigint,bigint,bigint,text,text,text,numeric,text)',
    't2_chizma_chiqar_v1(bigint,bigint,bigint,bigint[],text)', 't2_chizma_bekor_v1(bigint,bigint,bigint,text)',
    't2_chizma_royxat_v1(bigint,bigint,bigint)', 't2_chizma_taklif_royxat_v1(bigint,bigint,bigint)',
    't2_chizma_qaror_v1(bigint,bigint,bigint,text,text)', 't2_chizma_boglash_v1(bigint,bigint,bigint,integer,bigint,bigint,bigint,text)',
    't2_chizma_taasir_v1(bigint,bigint,bigint)', 't2_chizma_taklif_pto_v1(bigint,bigint,bigint,text,bigint,bigint,text,uuid)',
    't2_chizma_fayl_ol_v1(bigint,bigint)', 't2_loyihachi_bugun_v1(bigint,bigint)',
    '_t2_chizma_oluvchi(bigint,bigint)', '_t2_chizma_obyekt_ok(bigint,public.t2_tomon_aloqa,bigint)'
  ] loop
    execute format('drop function if exists public.%s', f);
  end loop;
end $$;

delete from public.t2_tomon_taqdim where manba_jadval = 't2_chizma_revizya';
delete from public.t2_tomon_resurs where kalit = 'chizma' and not exists (select 1 from public.t2_tomon_grant g where g.resurs = 'chizma');

drop table if exists public.t2_chizma_taklif;
drop table if exists public.t2_chizma_boglanish;
drop table if exists public.t2_chizma_revizya;
drop table if exists public.t2_chizma_toplam;

do $c$
declare c record; v_list text[]; v_def text;
begin
  select conname, pg_get_constraintdef(oid) as def into c from pg_constraint
   where conrelid = 'public.t2_tomon_taqdim'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%manba_jadval%' limit 1;
  if c.conname is null then return; end if;
  select array_agg(distinct m[1]) into v_list from regexp_matches(c.def, '''([a-z0-9_]+)''', 'g') as m;
  v_list := array(select x from unnest(v_list) x where x <> 't2_chizma_revizya' order by 1);
  select string_agg(quote_literal(x), ', ') into v_def from unnest(v_list) x;
  execute format('alter table public.t2_tomon_taqdim drop constraint %I', c.conname);
  execute format('alter table public.t2_tomon_taqdim add constraint t2_tomon_taqdim_manba_jadval_check check (manba_jadval in (%s))', v_def);
end $c$;
