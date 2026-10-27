-- T2-NAKRUTKA-SMETA-PODVAL-V1 acceptance (faqat o'qish; BEGIN..ROLLBACK).
-- 1) metadata: funksiya, view ustunlari, RPC; 2) invariant: smeta podvali yo'q obyektlarda
--    koeffitsientlar AYNAN sukut || kompaniya || shartnoma (avvalgi natija o'zgarmagan).
begin;
do $$
declare v text; f text; n_xato int; n_podvalli int;
begin
  if to_regprocedure('public.t2_nakrutka_podval_smeta_nk_v1(jsonb)') is null then
    raise exception 'SMETA_NK_FN_MISSING';
  end if;
  select pg_get_viewdef('public.t2_obyekt_nakrutka'::regclass, true) into v;
  if position('nk_manba' in v) = 0 or position('t2_nakrutka_podval_smeta_nk_v1' in v) = 0 then
    raise exception 'VIEW_SMETA_PODVAL_MISSING';
  end if;
  select p.prosrc into f from pg_proc p join pg_namespace s on s.oid = p.pronamespace
  where s.nspname = 'public' and p.proname = 't2_obyekt_nakrutka_v1';
  if position('t2_nakrutka_podval_smeta_nk_v1' in f) = 0 or position('nk_manba' in f) = 0 then
    raise exception 'RPC_SMETA_PODVAL_MISSING';
  end if;

  -- Invariant: podvalsiz obyektlarda amaldagi foizlar = sukut || kompaniya || shartnoma.
  select count(*) into n_xato
  from public.t2_obyekt_nakrutka n
  join public.t2_obyekt o on o.id = n.obyekt_id
  where n.nk_manba <> 'smeta_podvali'
    and (n.nakrutka_podval_id is not null
      or n.koeffitsientlar <> public.t2_nakrutka_default_v1()
        || coalesce((select jsonb_object_agg(k.koef_kod, to_jsonb(k.qiymat)) from public.t2_nakrutka_koef k
                     where k.kompaniya_id = o.kompaniya_id and k.shartnoma_id is null), '{}'::jsonb)
        || coalesce((select jsonb_object_agg(k.koef_kod, to_jsonb(k.qiymat)) from public.t2_nakrutka_koef k
                     where k.kompaniya_id = o.kompaniya_id and k.shartnoma_id = n.shartnoma_id), '{}'::jsonb));
  if n_xato > 0 then raise exception 'NO_PODVAL_INVARIANT_BROKEN: % obyekt', n_xato; end if;

  -- Podvalli obyektlar: nakrutka_podval_id faol podvalga ishora qiladi.
  select count(*) into n_podvalli from public.t2_obyekt_nakrutka n
  where n.nk_manba = 'smeta_podvali'
    and not exists (select 1 from public.t2_nakrutka_podval p where p.id = n.nakrutka_podval_id and p.faol and p.obyekt_id = n.obyekt_id);
  if n_podvalli > 0 then raise exception 'PODVAL_ID_DANGLING: %', n_podvalli; end if;
  raise notice 'T2-NAKRUTKA-SMETA-PODVAL-V1 acceptance: OK';
end $$;
rollback;
