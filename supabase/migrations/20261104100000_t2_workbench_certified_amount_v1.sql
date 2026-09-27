-- T2-PTO-EXACT-F2-WORKBENCH-001
--
-- The existing workbench read model exposes F2 quantity and valuation price,
-- but its period JSON did not carry t2_akt_qator.certified_amount.  That
-- allowed a generic client to accidentally reconstruct an approved amount as
-- quantity * price.  This additive RPC keeps the existing read model and
-- overlays the canonical exact source triplet, including certified_amount.
--
-- Supabase remains the source of truth.  No Drive/Sheets/GAS dependency is
-- introduced.  The existing t2_workbench_v1 performs actor/lineage checks;
-- this wrapper returns its guarded result and only re-materializes the period
-- rows from the same authorized object.

create or replace function public.t2_workbench_exact_v1(
  p_obyekt_id bigint,
  p_actor_id bigint,
  p_davr date default null,
  p_limit integer default 800
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_base jsonb;
  v_periods jsonb;
begin
  v_base := public.t2_workbench_v1(p_obyekt_id, p_actor_id, p_davr, p_limit);

  -- Preserve the guarded error shape from the canonical workbench.
  if coalesce((v_base->>'ok')::boolean, false) is not true then
    return v_base;
  end if;

  -- One output line per canonical approved F2 source row.  certified_amount
  -- is deliberately not coalesced with hajm * narx or legacy summa.
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'periodId', to_char(s.oy, 'YYYY-MM'),
      'label', to_char(s.oy, 'YYYY-MM'),
      'revisionId', 'rev-' || coalesce(s.revision_id::text, '0'),
      'frozen', true,
      'documentIds', s.document_ids,
      'lines', s.lines
    ) order by s.oy
  ), '[]'::jsonb)
  into v_periods
  from (
    select
      date_trunc('month', a.oy)::date as oy,
      max(a.revision_id) as revision_id,
      jsonb_agg(distinct format('akt-%s', a.id)) as document_ids,
      jsonb_agg(
        jsonb_build_object(
          'lineId', aq.qator_id::text,
          'quantity', coalesce(aq.certified_quantity, aq.hajm),
          'certifiedAmount', aq.certified_amount,
          'f2ValuationPrice', aq.narx,
          'actualProcurementPrice', aq.actual_narx,
          'referencePriceSourceId', 'baseline-' || coalesce(aq.revision_id::text, '0'),
          'actualPriceSourceId', case when aq.actual_narx is not null
            then coalesce(aq.narx_manba, 'qol') || '-' || coalesce(aq.narx_manba_id::text, '?')
            else null end
        ) order by a.id, aq.id
      ) as lines
    from public.t2_akt a
    join public.t2_akt_qator aq on aq.akt_id = a.id
    where a.obyekt_id = p_obyekt_id
      and a.tur = 'f2'
      and a.holat = 'tasdiqlangan'
    group by date_trunc('month', a.oy)::date
  ) s;

  return jsonb_set(v_base, '{valuation,periods}', v_periods, true);
end;
$$;

revoke all on function public.t2_workbench_exact_v1(bigint,bigint,date,integer) from public, anon, authenticated;
grant execute on function public.t2_workbench_exact_v1(bigint,bigint,date,integer) to service_role;

comment on function public.t2_workbench_exact_v1(bigint,bigint,date,integer) is
  'T2 PTO exact workbench: approved F2 period rows expose certified_quantity and certified_amount from t2_akt_qator. certified_amount is never recomputed from quantity*price.';
