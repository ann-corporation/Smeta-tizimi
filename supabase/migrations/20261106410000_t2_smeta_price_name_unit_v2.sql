-- T2-SMETACHI-RELIABILITY-20261009: additive name + unit pricing.
-- Clone of t2_smeta_narxla_res_v1; v1 remains available for rollback.
-- Codes are source metadata only. Explicit zero is a known price.
-- Only NULL resource prices are filled; conflicts fail closed across all codes.
-- Auth, tenant, audit, idempotency, rollup and service-role grants are retained.

begin;

create or replace function public.t2_smeta_narxla_res_v2(
  p_kompaniya_id bigint,
  p_actor_id bigint,
  p_obyekt_id bigint,
  p_operation_id uuid,
  p_narxlar jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_rol text;
  v_obyekt_kompaniya bigint;
  v_old jsonb;
  v_old_actor bigint;
  v_old_command text;
  v_kiritilgan integer := 0;
  v_yaroqli integer := 0;
  v_ziddiyatli integer := 0;
  v_narxsiz integer := 0;
  v_mos integer := 0;
  v_yozildi integer := 0;
  v_natija jsonb;
begin
  if p_kompaniya_id is null or p_kompaniya_id <= 0
     or p_actor_id is null or p_actor_id <= 0
     or p_obyekt_id is null or p_obyekt_id <= 0
     or p_operation_id is null then
    raise exception 'kompaniya, actor, obyekt va operation_id majburiy' using errcode = '22023';
  end if;
  if p_narxlar is null or jsonb_typeof(p_narxlar) <> 'array' then
    raise exception 'p_narxlar JSON array bo''lishi shart' using errcode = '22023';
  end if;
  if jsonb_array_length(p_narxlar) = 0 or jsonb_array_length(p_narxlar) > 10000 then
    raise exception 'p_narxlar 1..10000 qator bo''lishi shart' using errcode = '22023';
  end if;

  select o.kompaniya_id into v_obyekt_kompaniya
    from public.t2_obyekt o
   where o.id = p_obyekt_id and o.holat <> 'bekor';
  if not found or v_obyekt_kompaniya <> p_kompaniya_id then
    raise exception 'obyekt boshqa tenantga tegishli yoki faol emas' using errcode = '42501';
  end if;

  v_rol := public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  if v_rol not in ('admin', 'superadmin', 'boss', 'director', 'pto') then
    raise exception 'bu rol RES narxlashga ruxsatli emas' using errcode = '42501';
  end if;

  -- Idempotent javob faqat actor + tenant tekshirilgandan keyin qaytariladi.
  --
  -- ⚠️ 2026-09-08 (Claude, ko'rib chiqishda topildi): bu yerda avval
  -- `return v_old;` turardi — ya'ni takroriy chaqiruvda ham saqlangan
  -- javobdagi `takror: false` qaytardi. Yozuv takrorlanmasdi (bu to'g'ri
  -- ishlagan), lekin CHAQIRUVCHI buni yangi narxlash deb o'qirdi va
  -- ekranda "N qator narxlandi" ni QAYTA ko'rsatardi. Shu sabab bu
  -- fayl bilan birga kelgan acceptance testining o'zi ham yiqilardi
  -- (u aynan `takror = true` ni talab qiladi). Endi bayroq to'g'ri.
  perform pg_advisory_xact_lock(hashtextextended('t2_smeta_narxla_res_v2:' || p_operation_id::text, 0));
  select natija, actor_id, command into v_old, v_old_actor, v_old_command
    from public.t2_onboarding_command_log
   where operation_id = p_operation_id;
  if found then
    if v_old_actor is distinct from p_actor_id or v_old_command is distinct from 't2_smeta_narxla_res_v2'
       or (v_old->>'obyekt_id')::bigint is distinct from p_obyekt_id then
      raise exception 'operation_id boshqa actor, obyekt yoki amalga tegishli' using errcode = '42501';
    end if;
    return v_old || jsonb_build_object('takror', true);
  end if;

  perform set_config('t2.manba', 'narxlash', true);
  perform set_config('t2.kim', 'actor:' || p_actor_id::text, true);

  with source_raw as (
    select
      public.t2_resurs_nom_kalit(x.nom) as nom_key,
      public.t2_resurs_birlik_kalit(x.birlik) as birlik_key,
      x.narx
    from jsonb_to_recordset(p_narxlar) as x(nom text, birlik text, narx numeric)
  ), source_valid as (
    select * from source_raw
     where nom_key <> '' and birlik_key <> '' and narx is not null and narx >= 0 and narx not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
  ), source_grouped as (
    select nom_key, birlik_key, min(narx) as narx, count(distinct narx) as narx_soni
      from source_valid
     group by nom_key, birlik_key
  )
  select (select count(*) from source_raw),
         (select count(*) from source_grouped where narx_soni = 1),
         (select count(*) from source_grouped where narx_soni <> 1)
    into v_kiritilgan, v_yaroqli, v_ziddiyatli;

  with source_raw as (
    select
      public.t2_resurs_nom_kalit(x.nom) as nom_key,
      public.t2_resurs_birlik_kalit(x.birlik) as birlik_key,
      x.narx
    from jsonb_to_recordset(p_narxlar) as x(nom text, birlik text, narx numeric)
  ), source_grouped as (
    select nom_key, birlik_key, min(narx) as narx
      from source_raw
     where nom_key <> '' and birlik_key <> '' and narx is not null and narx >= 0 and narx not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
     group by nom_key, birlik_key
    having count(distinct narx) = 1
  ), target as (
    select q.id, q.hajm
      from public.t2_qator q
     where q.kompaniya_id = p_kompaniya_id and q.obyekt_id = p_obyekt_id
       and q.tur in ('rs', 'mat', 'ob') and q.narx is null
  ), candidate as (
    select t.id, s.narx
      from target t
      join public.t2_qator q on q.id = t.id
      join source_grouped s
        on public.t2_resurs_nom_kalit(q.nom) = s.nom_key
       and public.t2_resurs_birlik_kalit(q.birlik) = s.birlik_key
  ), target_unique as (
    select id, min(narx) as narx
      from candidate
     group by id
    having count(distinct narx) = 1
  )
  select (select count(*) from target), (select count(*) from target_unique)
    into v_narxsiz, v_mos;

  with source_raw as (
    select
      public.t2_resurs_nom_kalit(x.nom) as nom_key,
      public.t2_resurs_birlik_kalit(x.birlik) as birlik_key,
      x.narx
    from jsonb_to_recordset(p_narxlar) as x(nom text, birlik text, narx numeric)
  ), source_grouped as (
    select nom_key, birlik_key, min(narx) as narx
      from source_raw
     where nom_key <> '' and birlik_key <> '' and narx is not null and narx >= 0 and narx not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
     group by nom_key, birlik_key
    having count(distinct narx) = 1
  ), candidate as (
    select q.id, s.narx
      from public.t2_qator q
      join source_grouped s
        on public.t2_resurs_nom_kalit(q.nom) = s.nom_key
       and public.t2_resurs_birlik_kalit(q.birlik) = s.birlik_key
     where q.kompaniya_id = p_kompaniya_id and q.obyekt_id = p_obyekt_id
       and q.tur in ('rs', 'mat', 'ob') and q.narx is null
  ), target_unique as (
    select id, min(narx) as narx
      from candidate
     group by id
    having count(distinct narx) = 1
  ), updated as (
    update public.t2_qator q
       set narx = u.narx,
           summa = case when q.hajm is null then null else q.hajm * u.narx end,
           narx_usul = 'RES'
      from target_unique u
     where q.id = u.id and q.narx is null
    returning q.id
  )
  select count(*) into v_yozildi from updated;

  perform public.t2_rollup(p_obyekt_id);
  if v_narxsiz < 5000 then
    perform public.t2_signal_refresh_object(p_kompaniya_id, p_obyekt_id);
  end if;

  v_natija := jsonb_build_object(
    'ok', true, 'takror', false, 'obyekt_id', p_obyekt_id,
    'kiritilgan', v_kiritilgan, 'yaroqli_manba', v_yaroqli,
    'ziddiyatli_manba', v_ziddiyatli, 'narxsiz', v_narxsiz,
    'mos', v_mos, 'yozildi', v_yozildi, 'narxsiz_qoldi', greatest(v_narxsiz - v_yozildi, 0)
  );

  insert into public.t2_onboarding_command_log(operation_id, actor_id, command, natija)
  values (p_operation_id, p_actor_id, 't2_smeta_narxla_res_v2', v_natija);
  perform public.t2_audit_yoz(p_kompaniya_id, 'smeta_narxla_res', 'smeta', p_obyekt_id,
    format('RES qator=%s; mos=%s; yozildi=%s', v_kiritilgan, v_mos, v_yozildi),
    'actor:' || p_actor_id::text, null);
  return v_natija;
end;
$function$;

revoke all on function public.t2_smeta_narxla_res_v2(bigint, bigint, bigint, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.t2_smeta_narxla_res_v2(bigint, bigint, bigint, uuid, jsonb) to service_role;

commit;
