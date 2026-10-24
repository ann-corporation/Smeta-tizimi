-- JONLI_SINOV_TOPILMALARI #12 (P0): import qilingan QORALAMA smetani (F2/fakt/hujjat bog'lanmagan) bekor qilish va qayta yuklash.
-- Asl smeta CONST: bog'langan smeta hech qachon o'chirilmaydi. Bu migratsiya:
--  1) t2_smeta_bogliqlik_v1  -- obyekt smetasiga bog'langan hamma narsani sanaydi (faqat o'qish) va qoralama/bog'langan ni aytadi;
--  2) t2_smeta_tozalash_v1   -- eski ikki tekshiruv (fakt, narx-asos) o'rniga shu YAGONA tekshiruv; bog'liqlik bo'lsa rad etadi
--     (avval aosr_bog / lab_protokol_bog / F2 / m29 / bajarilmadi bog'lanishlari jim cascade/yo'qolib ketardi).
begin;

create or replace function public.t2_smeta_bogliqlik_v1(p_kompaniya_id bigint, p_actor_id bigint, p_obyekt_id bigint)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare
  v jsonb;
  v_qator bigint; v_jami bigint;
begin
  perform public.t2_smeta_import_ruxsat(p_kompaniya_id, p_actor_id);
  if not exists (select 1 from public.t2_obyekt where id=p_obyekt_id and kompaniya_id=p_kompaniya_id) then
    return jsonb_build_object('ok',false,'code','OBJECT_ACCESS_DENIED');
  end if;
  select count(*) into v_qator from public.t2_qator where obyekt_id=p_obyekt_id;
  v := jsonb_build_object(
    'akt',           (select count(*) from public.t2_akt where obyekt_id=p_obyekt_id),
    'akt_qator',     (select count(*) from public.t2_akt_qator where obyekt_id=p_obyekt_id),
    'f2_import',     (select count(*) from public.t2_f2_import_job where obyekt_id=p_obyekt_id and status<>'cancelled'),
    'aosr',          (select count(*) from public.t2_aosr where obyekt_id=p_obyekt_id),
    'aosr_qator',    (select count(*) from public.t2_aosr_bog b join public.t2_qator q on q.id=b.qator_id where q.obyekt_id=p_obyekt_id),
    'laboratoriya',  (select count(*) from public.t2_lab_protokol_bog b join public.t2_qator q on q.id=b.qator_id where q.obyekt_id=p_obyekt_id),
    'm29',           (select count(*) from public.t2_m29_hujjat where obyekt_id=p_obyekt_id and bekor_vaqt is null),
    'bajarilmadi',   (select count(*) from public.t2_qator_bajarilmadi where obyekt_id=p_obyekt_id and bekor_vaqt is null),
    'shartnoma_hajm',(select count(*) from public.t2_contract_scope_event where obyekt_id=p_obyekt_id),
    'narx_asos',     (select count(*) from public.t2_price_basis_line pl join public.t2_qator q on q.id=pl.qator_id where q.obyekt_id=p_obyekt_id)
  );
  select coalesce(sum(value::bigint),0) into v_jami from jsonb_each_text(v);
  return jsonb_build_object('ok',true,'obyekt_id',p_obyekt_id,'qator_soni',v_qator,'bogliq',v,
    'bogliq_jami',v_jami,'qoralama',(v_jami=0));
end $$;
revoke all on function public.t2_smeta_bogliqlik_v1(bigint,bigint,bigint) from public, anon, authenticated;
grant execute on function public.t2_smeta_bogliqlik_v1(bigint,bigint,bigint) to service_role;

create or replace function public.t2_smeta_tozalash_v1(
  p_kompaniya_id bigint, p_actor_id bigint, p_obyekt_id bigint, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_prev jsonb; v_soni integer; v_b jsonb;
begin
  if p_operation_id is null then return jsonb_build_object('ok',false,'code','OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;

  v_b := public.t2_smeta_bogliqlik_v1(p_kompaniya_id, p_actor_id, p_obyekt_id);
  if (v_b->>'ok')::boolean is not true then return v_b; end if;
  if (v_b->>'qoralama')::boolean is not true then
    return jsonb_build_object('ok',false,'code','SMETA_HAS_DEPENDENT_DATA','bogliq',v_b->'bogliq',
      'xato','Bu smeta F2/fakt/hujjatlarga bog''langan -- o''chirib bo''lmaydi (asl smeta o''zgarmas). Faqat farq (diff) ko''rinadi.');
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

commit;
