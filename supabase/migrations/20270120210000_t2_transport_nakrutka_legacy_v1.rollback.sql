-- ROLLBACK 20270120210000_t2_transport_nakrutka_legacy_v1: langar qo'shimchalari olib tashlanadi, so'ng yordamchi funksiya.
do $do$
declare d text; d2 text;
begin
  d := pg_get_functiondef('public.t2_obyekt_nakrutka_v1(bigint,bigint,bigint)'::regprocedure);
  if position('_t2_transport_chiqar_v1' in d) > 0 then
    d2 := regexp_replace(d, '\s*\|\|\s*(public\.)?_t2_transport_chiqar_v1\(p_obyekt_id\)', '', 'g');
    if d2 = d then raise exception 'TRANSPORT_LEGACY_ROLLBACK: t2_obyekt_nakrutka_v1 qo''shimchasi topilmadi'; end if;
    execute d2;
  end if;
  d := pg_get_viewdef('public.t2_obyekt_nakrutka'::regclass, true);
  if position('_t2_transport_chiqar_v1' in d) > 0 then
    d2 := regexp_replace(d, '\s*\|\|\s*(public\.)?_t2_transport_chiqar_v1\(e\.obyekt_id\)', '', 'g');
    if d2 = d then raise exception 'TRANSPORT_LEGACY_ROLLBACK: view qo''shimchasi topilmadi'; end if;
    execute 'create or replace view public.t2_obyekt_nakrutka as ' || rtrim(d2, E'; \n');
  end if;
end $do$;
drop function if exists public._t2_transport_chiqar_v1(bigint);