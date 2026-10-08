-- Shadow acceptance for 20261106340000_t2_f2_null_semantika_v1 (run as: BEGIN; <PRE>; <migration>; <POST>; — the final
-- RAISE aborts the transaction, so nothing persists). Actor 183 = platform superadmin (read access to every company).
-- <PRE>
create temp table _old_holat on commit drop as
  select qator_id, obyekt_id, f2_summa, f2_mumkin_summa, qoldiq_summa from public.t2_qator_holat;
create temp table _old_nak on commit drop as
  select o.id as obyekt_id, public.t2_nakopitelniy_v2(o.id, 183, null, 5000, false, 0) as j from public.t2_obyekt o where o.id in (5, 79);
create temp table _unknown on commit drop as
  select distinct aq.qator_id from public.t2_akt_qator aq join public.t2_akt a on a.id = aq.akt_id
   where a.tur = 'f2' and a.holat = 'tasdiqlangan' and coalesce(aq.certified_amount, aq.summa) is null
     and coalesce(aq.certified_quantity, aq.hajm, 0) <> 0;
-- </PRE>

-- <POST>
do $$
declare n_unknown int; n_null int; n_changed int; n_fixed int; n_bad_mumkin int; n_katoy int; j_old jsonb; j_new jsonb;
begin
  select count(*) into n_unknown from _unknown;
  if n_unknown = 0 then raise exception 'ACCEPTANCE_FAIL: test data has no unknown F2 lines'; end if;
  -- 1. every qator with an unknown approved F2 line now has f2_summa NULL (was 0)
  select count(*) into n_null from public.t2_qator_holat h join _unknown u on u.qator_id = h.qator_id where h.f2_summa is null;
  if n_null <> n_unknown then raise exception 'ACCEPTANCE_FAIL 1: % of % unknown qator are NULL', n_null, n_unknown; end if;
  -- 2. every other qator keeps EXACTLY the old values
  select count(*) into n_changed from public.t2_qator_holat h join _old_holat o on o.qator_id = h.qator_id
   where h.qator_id not in (select qator_id from _unknown)
     and (h.f2_summa is distinct from o.f2_summa or h.qoldiq_summa is distinct from o.qoldiq_summa or h.f2_mumkin_summa is distinct from o.f2_mumkin_summa)
     -- the only allowed change: unknown fakt amount no longer turns f2_mumkin_summa into 0 (GREATEST(NULL, 0) = 0 bug)
     and not (o.f2_mumkin_summa = 0 and h.f2_mumkin_summa is null and h.fakt_summa is null
              and h.f2_summa is not distinct from o.f2_summa and h.qoldiq_summa is not distinct from o.qoldiq_summa);
  if n_changed <> 0 then raise exception 'ACCEPTANCE_FAIL 2: % known rows changed', n_changed; end if;
  -- 3. unknown never becomes 0 downstream
  select count(*) into n_bad_mumkin from public.t2_qator_holat h join _unknown u on u.qator_id = h.qator_id
   where h.f2_mumkin_summa is not null or h.qoldiq_summa is not null or h.f2_summa_nomalum = 0;
  if n_bad_mumkin <> 0 then raise exception 'ACCEPTANCE_FAIL 3: % unknown rows leak a number', n_bad_mumkin; end if;
  -- 4. category/month view: unknown → NULL total, known part kept separately
  select count(*) into n_katoy from public.t2_f2_kat_oy where (nomalum_soni > 0 and jami_summa is not null) or (nomalum_soni = 0 and jami_summa is distinct from malum_summa and jami_summa is not null);
  if n_katoy <> 0 then raise exception 'ACCEPTANCE_FAIL 4: % kat_oy rows wrong', n_katoy; end if;
  -- 5. Nakopitelniy: object with unknowns → totals NULL + count; clean object → identical totals
  j_new := public.t2_nakopitelniy_v2(79, 183, null, 5000, false, 0);
  if (j_new->'jami'->'jami_tasdiqlangan_summa') <> 'null'::jsonb or (j_new->'jami'->>'f2_summa_nomalum')::int = 0 then
    raise exception 'ACCEPTANCE_FAIL 5a: nakopitelniy 79 jami=% nomalum=%', j_new->'jami'->'jami_tasdiqlangan_summa', j_new->'jami'->'f2_summa_nomalum';
  end if;
  select j into j_old from _old_nak where obyekt_id = 5;
  j_new := public.t2_nakopitelniy_v2(5, 183, null, 5000, false, 0);
  if (j_new->'jami'->'jami_tasdiqlangan_summa') is distinct from (j_old->'jami'->'jami_tasdiqlangan_summa')
     or (j_new->'jami'->'qoldiq_summa') is distinct from (j_old->'jami'->'qoldiq_summa')
     or (j_new->'jami'->'f2_mumkin_summa') is distinct from (j_old->'jami'->'f2_mumkin_summa') then
    raise exception 'ACCEPTANCE_FAIL 5b: clean object totals changed % → %', j_old->'jami'->'jami_tasdiqlangan_summa', j_new->'jami'->'jami_tasdiqlangan_summa';
  end if;
  select count(*) into n_fixed from public.t2_qator_holat h join _old_holat o on o.qator_id = h.qator_id where o.f2_mumkin_summa = 0 and h.f2_mumkin_summa is null and h.fakt_summa is null;
  raise exception 'ACCEPTANCE_PASS_ALL_CHECKS unknown_qator=% fakt_unknown_mumkin_fixed=% known_unchanged=yes', n_unknown, n_fixed;
end $$;
-- </POST>
