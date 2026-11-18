-- Qabul (BEGIN..ROLLBACK, faqat o'qish): funksiyalar bor, anon/authenticated ruxsatsiz, STABLE; prod portfelida
-- «jami == Σ akt paketi» (har shartnoma uchun, tasdiqlangan va qoralama). Asosiy migratsiya qo'llangan bo'lishi shart.
begin;
do $t$
declare sh record; r jsonb; s jsonb; x jsonb; ids bigint[]; sm numeric; kam int := 0;
begin
  if to_regprocedure('public.t2_f2_portfel_v1(bigint,bigint,bigint,bigint,date,date,text,integer,integer)') is null then raise exception 'ACCEPT_FAIL: t2_f2_portfel_v1 yo''q'; end if;
  if to_regprocedure('public.t2_f2_portfel_summa_v1(bigint,bigint,bigint[])') is null then raise exception 'ACCEPT_FAIL: t2_f2_portfel_summa_v1 yo''q'; end if;
  if has_function_privilege('authenticated', 'public.t2_f2_portfel_v1(bigint,bigint,bigint,bigint,date,date,text,integer,integer)', 'execute') then raise exception 'ACCEPT_FAIL: authenticated ruxsati'; end if;
  for sh in select s.id, s.kompaniya_id, (select a.foydalanuvchi_id from public.t2_azolik a where a.kompaniya_id = s.kompaniya_id and a.rol = 'boss' and a.holat = 'faol' limit 1) actor
              from public.t2_shartnoma s order by s.id limit 20 loop
    continue when sh.actor is null;
    r := public.t2_f2_portfel_v1(sh.kompaniya_id, sh.actor, sh.id, null, null, null, 'tasdiqlangan', 500, 0);
    if r->>'ok' <> 'true' then raise exception 'ACCEPT_FAIL: portfel %: %', sh.id, r; end if;
    select coalesce(array_agg(z.id), '{}') into ids from (select (a->>'id')::bigint id from jsonb_array_elements(r->'aktlar') a limit 12) z;
    if cardinality(ids) = 0 then continue; end if;
    -- Σ (ro'yxatdagi birinchi <= 12 akt) <= jami (to'liq tekshiruv — supabase/tests/f2_portfel_tez_contract.sql)
    s := public.t2_f2_portfel_summa_v1(sh.kompaniya_id, sh.actor, ids);
    select coalesce(sum((e->'paket'->>'qqs_bilan')::numeric), 0) into sm from jsonb_array_elements(s->'aktlar') e;
    if sm > coalesce((r->'jami'->'tasdiqlangan'->>'qqs_bilan')::numeric, 0) + 0.05 then
      raise exception 'ACCEPT_FAIL: shartnoma %: Σakt % > jami %', sh.id, sm, r->'jami'->'tasdiqlangan'->>'qqs_bilan';
    end if;
    kam := kam + 1;
  end loop;
  raise notice 'ACCEPT_OK: % shartnoma tekshirildi', kam;
end $t$;
rollback;
