-- Возврат точных определений до mandatory_import_rollup_v2; данные не удаляются.
begin;
CREATE OR REPLACE FUNCTION public.t2_smeta_import_yakunla_unlocked_v1(p_kompaniya_id bigint, p_actor_id bigint, p_sessiya_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_sessiya public.t2_smeta_import_sessiya; v_prev jsonb; v_soni integer;
begin
  perform public.t2_smeta_import_ruxsat(p_kompaniya_id, p_actor_id);

  select * into v_sessiya from public.t2_smeta_import_sessiya
   where id = p_sessiya_id and kompaniya_id = p_kompaniya_id;
  if not found then return jsonb_build_object('ok',false,'code','IMPORT_SESSION_NOT_FOUND'); end if;

  select natija into v_prev from public.t2_onboarding_command_log where operation_id = v_sessiya.operation_id;
  if found then return v_prev; end if;
  if v_sessiya.holat <> 'ochiq' then return jsonb_build_object('ok',false,'code','IMPORT_SESSION_CLOSED'); end if;

  if not exists (select 1 from public.t2_smeta_import_bolak where sessiya_id = p_sessiya_id) then
    return jsonb_build_object('ok',false,'code','IMPORT_EMPTY');
  end if;
  if exists (select 1 from public.t2_qator where obyekt_id = v_sessiya.obyekt_id) then
    return jsonb_build_object('ok',false,'code','SMETA_ALREADY_EXISTS');
  end if;

  perform set_config('t2.manba', 'import', true);

  create temporary table t2_imp_qator(
    local_id text primary key, parent_local_id text, tur text, kod text, nom text,
    birlik text, hajm numeric, narx numeric, summa numeric, kat text, norma numeric,
    ordinal integer, new_id bigint, ota_id bigint, daraja integer
  ) on commit drop;

  insert into t2_imp_qator(local_id, parent_local_id, tur, kod, nom, birlik,
                           hajm, narx, summa, kat, norma, ordinal, new_id)
  select x->>'local_id', nullif(x->>'parent_local_id',''), x->>'tur',
         nullif(x->>'kod',''), nullif(x->>'nom',''), nullif(x->>'birlik',''),
         public.t2_son_tez(x->>'hajm'), public.t2_son_tez(x->>'narx'), public.t2_son_tez(x->>'summa'),
         case when (x->>'tur') in ('rs','mat','ob') then
           coalesce((select rk.kategoriya from public.t2_resurs_kategoriya rk
                      where rk.kompaniya_id = p_kompaniya_id
                        and rk.nom_key = public.t2_resurs_nom_kalit(x->>'nom')
                        and rk.birlik_key = public.t2_resurs_birlik_kalit(x->>'birlik')),
                    public.t2_kat_birlik(x->>'birlik', x->>'nom')) end,
         -- Faqat 'rs' qatorida ma'noli; 0/manfiy/bo'sh -- haqiqiy norma emas.
         case when (x->>'tur') = 'rs' and public.t2_son_tez(x->>'norma') > 0
              then public.t2_son_tez(x->>'norma') end,
         (row_number() over (order by b.bolak, t.ordinality))::integer,
         nextval(pg_get_serial_sequence('public.t2_qator','id'))
  from public.t2_smeta_import_bolak b
  cross join lateral jsonb_array_elements(b.qatorlar) with ordinality as t(x, ordinality)
  where b.sessiya_id = p_sessiya_id;

  update t2_imp_qator m set ota_id = p.new_id
    from t2_imp_qator p where p.local_id = m.parent_local_id;

  with recursive d as (
    select local_id, 0 as lvl from t2_imp_qator where parent_local_id is null
    union all
    select r.local_id, d.lvl + 1 from t2_imp_qator r join d on r.parent_local_id = d.local_id
  )
  update t2_imp_qator m set daraja = d.lvl from d where d.local_id = m.local_id;

  insert into public.t2_qator(id, obyekt_id, kompaniya_id, tur, kod, nom, birlik,
    hajm, narx, summa, source_document_id, tartib, daraja, kat, ota_id, norma)
  overriding system value
  select new_id, v_sessiya.obyekt_id, p_kompaniya_id, tur, kod, nom, birlik,
    hajm, narx, summa, v_sessiya.source_document_id, ordinal, coalesce(daraja,0), kat, ota_id, norma
  from t2_imp_qator order by ordinal;

  select count(*) into v_soni from t2_imp_qator;

  update public.t2_smeta_import_sessiya
     set holat = 'yakunlandi', qator_soni = v_soni, yangilandi = now()
   where id = p_sessiya_id;
  delete from public.t2_smeta_import_bolak where sessiya_id = p_sessiya_id;

  if v_soni < 5000 then
    begin
      -- ⚠️ T2-SMETA-IMPORT-ROLLUP-002: bu funksiyada `p_obyekt_id` DEGAN
      -- PARAMETR YO'Q -- to'g'ri obyekt id manbai FAQAT `v_sessiya.obyekt_id`.
      perform public.t2_rollup(v_sessiya.obyekt_id);
      perform public.t2_signal_refresh_object(p_kompaniya_id, v_sessiya.obyekt_id);
    exception when others then
      raise warning 't2_smeta_import_yakunla_v1: rollup/signal refresh failed (non-fatal): %', sqlerrm;
    end;
  end if;

  perform public.t2_audit_yoz(p_kompaniya_id,'smeta_import_bolakli','smeta',v_sessiya.obyekt_id,
    format('qator_soni=%s; source_document_id=%s',v_soni,v_sessiya.source_document_id),'actor:'||p_actor_id,null);

  v_prev := jsonb_build_object('ok',true,'obyekt_id',v_sessiya.obyekt_id,'qator_soni',v_soni);
  insert into public.t2_onboarding_command_log (operation_id, actor_id, command, natija)
    values (v_sessiya.operation_id, p_actor_id, 'smeta_import_bolakli', v_prev);
  return v_prev;
end $function$
;

CREATE OR REPLACE FUNCTION public.t2_smeta_paket_import_yakunla_unlocked_v1(p_kompaniya_id bigint, p_actor_id bigint, p_sessiya_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_session public.t2_smeta_paket_import_sessiya; v_prev jsonb; v_soni integer;
begin
  perform public.t2_smeta_import_ruxsat(p_kompaniya_id,p_actor_id);
  select * into v_session from public.t2_smeta_paket_import_sessiya
   where id=p_sessiya_id and kompaniya_id=p_kompaniya_id for update;
  if not found or v_session.actor_id<>p_actor_id then return jsonb_build_object('ok',false,'code','IMPORT_SESSION_NOT_FOUND'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id=v_session.operation_id;
  if found then return v_prev; end if;
  if v_session.holat<>'ochiq' then return jsonb_build_object('ok',false,'code','IMPORT_SESSION_CLOSED'); end if;
  if not exists(select 1 from public.t2_smeta_paket_import_bolak where sessiya_id=p_sessiya_id) then
    return jsonb_build_object('ok',false,'code','IMPORT_EMPTY'); end if;
  if exists(select 1 from public.t2_qator where obyekt_id=v_session.obyekt_id) then
    return jsonb_build_object('ok',false,'code','SMETA_ALREADY_EXISTS'); end if;

  -- PK xatosini mijozga sizdirmaymiz: barcha bolaklar bo'ylab local_id
  -- takrorlanishini insertdan OLDIN kontrakt darajasida tekshiramiz.
  if exists(
    select 1 from (
      select x->>'local_id' as local_id, count(*) as n
      from public.t2_smeta_paket_import_bolak b
      cross join lateral jsonb_array_elements(b.qatorlar) x
      where b.sessiya_id=p_sessiya_id
      group by x->>'local_id'
    ) d where d.local_id is null or d.local_id='' or d.n>1
  ) then return jsonb_build_object('ok',false,'code','PACKAGE_DUPLICATE_LOCAL_ID'); end if;

  create temporary table t2_pkg_imp_qator(
    local_id text primary key, parent_local_id text, source_member_id bigint, source_document_id bigint,
    tur text, kod text, nom text, birlik text, hajm numeric, narx numeric, summa numeric, norma numeric,
    kat text, ordinal integer, new_id bigint, ota_id bigint, daraja integer
  ) on commit drop;

  insert into t2_pkg_imp_qator(local_id,parent_local_id,source_member_id,source_document_id,tur,kod,nom,birlik,hajm,narx,summa,norma,kat,ordinal,new_id)
  select x->>'local_id',nullif(x->>'parent_local_id',''),pm.id,pm.lrv_document_id,
    x->>'tur',nullif(x->>'kod',''),nullif(x->>'nom',''),nullif(x->>'birlik',''),
    public.t2_son_tez(x->>'hajm'),public.t2_son_tez(x->>'narx'),public.t2_son_tez(x->>'summa'),public.t2_son_tez(x->>'norma'),
    case when x->>'tur' in ('rs','mat','ob') then coalesce(
      (select rk.kategoriya from public.t2_resurs_kategoriya rk where rk.kompaniya_id=p_kompaniya_id
        and rk.nom_key=public.t2_resurs_nom_kalit(x->>'nom') and rk.birlik_key=public.t2_resurs_birlik_kalit(x->>'birlik')),
      public.t2_kat_birlik(x->>'birlik',x->>'nom')) end,
    row_number() over(order by b.bolak,t.ordinality)::integer,nextval(pg_get_serial_sequence('public.t2_qator','id'))
  from public.t2_smeta_paket_import_bolak b
  cross join lateral jsonb_array_elements(b.qatorlar) with ordinality t(x,ordinality)
  join public.t2_smeta_paket_manba pm on pm.paket_id=v_session.paket_id and pm.manba_kalit=x->>'source_key'
  where b.sessiya_id=p_sessiya_id;

  -- Parent manbada bo'lishi shart; yo'qolgan parentni nullga aylantirib
  -- yashirish mumkin emas.
  if exists(
    select 1 from t2_pkg_imp_qator c
    left join t2_pkg_imp_qator p on p.local_id=c.parent_local_id
    where c.parent_local_id is not null and p.local_id is null
  ) then return jsonb_build_object('ok',false,'code','PACKAGE_PARENT_NOT_FOUND'); end if;
  if exists(
    select 1 from public.t2_smeta_paket_manba pm
    where pm.paket_id=v_session.paket_id
      and not exists(select 1 from t2_pkg_imp_qator q where q.source_member_id=pm.id)
  ) then return jsonb_build_object('ok',false,'code','PACKAGE_MEMBER_EMPTY'); end if;
  if exists(select 1 from t2_pkg_imp_qator c join t2_pkg_imp_qator p on p.local_id=c.parent_local_id where c.source_member_id<>p.source_member_id) then
    return jsonb_build_object('ok',false,'code','PACKAGE_CROSS_SOURCE_PARENT'); end if;
  update t2_pkg_imp_qator c set ota_id=p.new_id from t2_pkg_imp_qator p where p.local_id=c.parent_local_id;
  with recursive depth as (
    select local_id,0 as lvl from t2_pkg_imp_qator where parent_local_id is null
    union all select c.local_id,depth.lvl+1 from t2_pkg_imp_qator c join depth on c.parent_local_id=depth.local_id
  ) update t2_pkg_imp_qator q set daraja=depth.lvl from depth where q.local_id=depth.local_id;

  perform set_config('t2.manba','import',true);
  insert into public.t2_qator(id,obyekt_id,kompaniya_id,tur,kod,nom,birlik,hajm,narx,summa,source_document_id,smeta_paket_manba_id,tartib,daraja,kat,ota_id,norma)
  overriding system value
  select new_id,v_session.obyekt_id,p_kompaniya_id,tur,kod,nom,birlik,hajm,narx,summa,source_document_id,source_member_id,ordinal,coalesce(daraja,0),kat,ota_id,
    case when tur='rs' then norma else null end
  from t2_pkg_imp_qator order by ordinal;
  select count(*) into v_soni from t2_pkg_imp_qator;
  update public.t2_smeta_paket_import_sessiya set holat='yakunlandi',qator_soni=v_soni,yangilandi=now() where id=p_sessiya_id;
  update public.t2_smeta_paket set holat='faol',yangilandi=now(),versiya=versiya+1 where id=v_session.paket_id;
  delete from public.t2_smeta_paket_import_bolak where sessiya_id=p_sessiya_id;
  if v_soni<5000 then
    begin
      perform public.t2_rollup(v_session.obyekt_id);
      perform public.t2_signal_refresh_object(p_kompaniya_id,v_session.obyekt_id);
    exception when others then raise warning 't2_smeta_paket_import_yakunla_v1: rollup/signal failed: %',sqlerrm;
    end;
  end if;
  perform public.t2_audit_yoz(p_kompaniya_id,'smeta_paket_import','smeta',v_session.obyekt_id,
    format('paket_id=%s; qator_soni=%s',v_session.paket_id,v_soni),'actor:'||p_actor_id,null);
  v_prev:=jsonb_build_object('ok',true,'obyekt_id',v_session.obyekt_id,'paket_id',v_session.paket_id,'qator_soni',v_soni);
  insert into public.t2_onboarding_command_log(operation_id,actor_id,command,natija)
    values(v_session.operation_id,p_actor_id,'smeta_paket_import',v_prev);
  return v_prev;
end $function$
;
commit;
