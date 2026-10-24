-- Rollback: 20261107100000 -- t2_smeta_tozalash_v1 avvalgi (20261021140000) ta'rifiga qaytariladi; t2_smeta_bogliqlik_v1 olib tashlanadi.
begin;

create or replace function public.t2_smeta_tozalash_v1(
  p_kompaniya_id bigint, p_actor_id bigint, p_obyekt_id bigint, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_prev jsonb; v_soni integer;
begin
  if p_operation_id is null then return jsonb_build_object('ok',false,'code','OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;

  perform public.t2_smeta_import_ruxsat(p_kompaniya_id, p_actor_id);

  if not exists (select 1 from public.t2_obyekt where id=p_obyekt_id and kompaniya_id=p_kompaniya_id) then
    return jsonb_build_object('ok',false,'code','OBJECT_ACCESS_DENIED');
  end if;

  if exists (
    select 1 from public.t2_akt_qator ak
    join public.t2_qator q on q.id = ak.qator_id
    where q.obyekt_id = p_obyekt_id
  ) then
    return jsonb_build_object('ok',false,'code','SMETA_HAS_DEPENDENT_DATA',
      'xato','Bu smetada allaqachon fakt (bajarilgan ish) yozuvlari bor -- tozalab bo''lmaydi.');
  end if;
  if exists (
    select 1 from public.t2_price_basis_line pl
    join public.t2_qator q on q.id = pl.qator_id
    where q.obyekt_id = p_obyekt_id
  ) then
    return jsonb_build_object('ok',false,'code','SMETA_HAS_DEPENDENT_DATA',
      'xato','Bu smetada allaqachon narx-asos yozuvlari bor -- tozalab bo''lmaydi.');
  end if;

  delete from public.t2_smeta_import_bolak
    where sessiya_id in (select id from public.t2_smeta_import_sessiya where obyekt_id = p_obyekt_id);
  delete from public.t2_smeta_import_sessiya where obyekt_id = p_obyekt_id;

  select count(*) into v_soni from public.t2_qator where obyekt_id = p_obyekt_id;

  perform set_config('t2.manba', 'import', true);
  delete from public.t2_qator where obyekt_id = p_obyekt_id;

  begin
    perform public.t2_signal_refresh_object(p_kompaniya_id, p_obyekt_id);
  exception when others then
    raise warning 't2_smeta_tozalash_v1: signal refresh failed (non-fatal): %', sqlerrm;
  end;

  perform public.t2_audit_yoz(p_kompaniya_id,'smeta_tozalash','smeta',p_obyekt_id,
    format('actor_id=%s',p_actor_id),'actor:'||p_actor_id,null);

  v_prev := jsonb_build_object('ok',true,'obyekt_id',p_obyekt_id,'ochirilgan_qator_soni',v_soni);
  insert into public.t2_onboarding_command_log (operation_id, actor_id, command, natija)
    values (p_operation_id, p_actor_id, 'smeta_tozalash', v_prev);
  return v_prev;
end $$;

drop function if exists public.t2_smeta_bogliqlik_v1(bigint,bigint,bigint);

commit;
