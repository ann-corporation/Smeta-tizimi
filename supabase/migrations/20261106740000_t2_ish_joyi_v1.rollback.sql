-- Rollback 20261106740000: t2_men_v1 asl matni (md5 oldin 1e16001b…), yangi funksiyalar va trigger olib tashlanadi.
-- t2_kompaniya.turi ustuni va t2_ish_joyi_taklif jadvali O'CHIRILMAYDI (ma'lumot saqlanadi; ishlatilmay qoladi).
-- Taklif orqali qo'shilgan a'zoliklar ham saqlanadi (ular oddiy a'zolik).
begin;
drop trigger if exists t2_ozi_royxat_shaxsiy on public.t2_ozi_royxat_log;
drop function if exists public.t2_ozi_royxat_shaxsiy_trg_v1();
drop function if exists public.t2_ish_joyi_turi_v1(bigint, bigint, text);
drop function if exists public.t2_ish_joyi_yarat_v1(bigint, text, text, uuid);
drop function if exists public.t2_ish_joyi_taklif_yarat_v1(bigint, bigint, text, text, int, int, text, uuid);
drop function if exists public.t2_ish_joyi_taklif_bekor_v1(bigint, bigint, bigint);
drop function if exists public.t2_ish_joyi_takliflar_v1(bigint, bigint);
drop function if exists public.t2_ish_joyi_qoshil_v1(bigint, text, uuid);

create or replace function public.t2_men_v1(p_actor_id bigint)
 returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $function$
declare v_u public.t2_foydalanuvchi%rowtype; v_az jsonb; v_context jsonb; v_super boolean;
begin
  if p_actor_id is null or p_actor_id<=0 then return jsonb_build_object('ok',false,'code','AUTH_REQUIRED'); end if;
  select * into v_u from public.t2_foydalanuvchi where id=p_actor_id and holat='faol';
  if not found then return jsonb_build_object('ok',false,'code','ACTOR_NOT_FOUND'); end if;
  v_super:=public.t2_platforma_superadmin(p_actor_id);
  select coalesce(jsonb_agg(jsonb_build_object(
    'azolik_id',a.id,'kompaniya_id',k.id,'nom',k.nom,'kod',k.kod,
    'rol',a.rol,'is_director',a.rol in ('boss','admin','superadmin'),
    'holat',a.holat,'faol',k.faol) order by k.nom),'[]'::jsonb) into v_az
    from public.t2_azolik a join public.t2_kompaniya k on k.id=a.kompaniya_id
    where a.foydalanuvchi_id=p_actor_id and a.holat='faol';
  -- Context access is NOT membership. Never create synthetic memberships.
  select coalesce(jsonb_agg(jsonb_build_object(
    'kompaniya_id',k.id,'nom',k.nom,'kod',k.kod,'faol',k.faol,
    'membership_role',a.rol,'effective_role',case when v_super then 'superadmin' else a.rol end,
    'permissions',case when v_super then public.t2_permission_catalog_v2() else public.t2_azolik_permissions_v2(a.id) end,
    'explicit_denials',case when v_super or a.rol in ('boss','admin','superadmin') then '[]'::jsonb else coalesce((select jsonb_agg(q.ruxsat) from public.t2_azolik_ruxsat_qoshimcha q where q.azolik_id=a.id and not q.berilgan),'[]'::jsonb) end,
    'is_director',v_super or a.rol in ('boss','admin','superadmin')) order by k.nom),'[]'::jsonb) into v_context
    from public.t2_kompaniya k left join public.t2_azolik a
      on a.kompaniya_id=k.id and a.foydalanuvchi_id=p_actor_id and a.holat='faol'
    where k.faol=true and (v_super or a.id is not null);
  return jsonb_build_object('ok',true,
    'foydalanuvchi',jsonb_build_object('id',v_u.id,'login',v_u.login,'ism',v_u.ism,'email',v_u.email,'holat',v_u.holat),
    'platform_role',case when v_super then 'superadmin' else 'none' end,
    'context_kompaniyalar',v_context,'azoliklar',v_az,'jami',jsonb_array_length(v_az),
    'onboarding_kerak',not v_super and jsonb_array_length(v_context)=0);
end $function$;
commit;
