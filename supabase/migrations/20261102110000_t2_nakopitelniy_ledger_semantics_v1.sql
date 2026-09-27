-- SOURCE ONLY. Productionga qo'llash bu task scope'ida YO'Q.
--
-- Existing t2_nakopitelniy_v2 is kept intact for compatibility. This additive
-- wrapper gives the PTO UI explicit names for the three different balances:
--   smeta_qoldiq_*    = baseline estimate - effective Fakt
--   f2_mumkin_*       = effective Fakt - approved F2
--   contract_qoldiq_* = approved entitlement - approved F2
--
-- The wrapper does not create business truth, recalculate certified amounts,
-- or change historical F2. It decorates the canonical v2 read model only.

begin;

create or replace function public.t2_nakopitelniy_ledger_v1(
  p_obyekt_id bigint, p_actor_id bigint, p_davr date default null,
  p_limit integer default 500, p_faqat_faol boolean default true,
  p_offset integer default 0)
returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare
  v_base jsonb;
  v_rows jsonb;
  v_jami jsonb;
begin
  v_base := public.t2_nakopitelniy_v2(
    p_obyekt_id, p_actor_id, p_davr, p_limit, p_faqat_faol, p_offset
  );

  if coalesce((v_base ->> 'ok')::boolean, false) is not true then
    return v_base;
  end if;

  select coalesce(jsonb_agg(
    r || jsonb_build_object(
      'smeta_qoldiq_hajm', case
        when r ->> 'smeta_hajm' is null then null
        else (r ->> 'smeta_hajm')::numeric - coalesce((r ->> 'fakt_hajm')::numeric, 0)
      end,
      'smeta_qoldiq_summa', case
        when r ->> 'smeta_summa' is null then null
        else (r ->> 'smeta_summa')::numeric - coalesce((r ->> 'fakt_summa')::numeric, 0)
      end,
      'f2_mumkin_summa',
        coalesce((r ->> 'fakt_summa')::numeric, 0)
          - coalesce((r ->> 'jami_summa')::numeric, 0),
      'contract_qoldiq_hajm', case
        when r ->> 'smeta_hajm' is null then null
        else (r ->> 'smeta_hajm')::numeric - coalesce((r ->> 'jami_hajm')::numeric, 0)
      end,
      'contract_qoldiq_summa', case
        when r ->> 'smeta_summa' is null then null
        else (r ->> 'smeta_summa')::numeric - coalesce((r ->> 'jami_summa')::numeric, 0)
      end,
      'ledger_semantics', 'v1'
    ) order by (r ->> 'tartib')::numeric, (r ->> 'qator_id')::bigint
  ), '[]'::jsonb)
  into v_rows
  from jsonb_array_elements(coalesce(v_base -> 'qatorlar', '[]'::jsonb)) as x(r);

  v_base := jsonb_set(v_base, '{qatorlar}', v_rows, true);
  v_jami := v_base -> 'jami';

  if v_jami is not null and jsonb_typeof(v_jami) = 'object' then
    v_jami := v_jami || jsonb_build_object(
      'smeta_qoldiq_summa', case
        when v_jami ->> 'smeta_summa' is null then null
        else (v_jami ->> 'smeta_summa')::numeric
          - coalesce((v_jami ->> 'fakt_summa')::numeric, 0)
      end,
      'contract_qoldiq_summa', case
        when v_jami ->> 'smeta_summa' is null then null
        else (v_jami ->> 'smeta_summa')::numeric
          - coalesce((v_jami ->> 'jami_tasdiqlangan_summa')::numeric, 0)
      end,
      'ledger_semantics', 'v1'
    );
    v_base := jsonb_set(v_base, '{jami}', v_jami, true);
  end if;

  return v_base;
end;
$$;

revoke all on function public.t2_nakopitelniy_ledger_v1(bigint,bigint,date,integer,boolean,integer)
  from public, anon, authenticated;

comment on function public.t2_nakopitelniy_ledger_v1(bigint,bigint,date,integer,boolean,integer) is
  'PTO ledger wrapper: explicit smeta-Fakt, Fakt-approved-F2 and contract-approved-F2 balances; v2 remains the compatibility source.';

commit;
