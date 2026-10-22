-- T4 «Telegram modeli» (egasi 2026-10-21/22): modul holati server tomonda — HAR SO'ROVDA BAZAGA BORMASDAN.
-- t2_men_v1 javobidagi har kompaniya konteksti `modullar_off` (o'chirilgan modul kodlari) ni qaytaradi. Shlyuz bu javobni
-- allaqachon 60 s keshlaydi (role-authority.ts), shuning uchun modul tekshiruvi qo'shimcha so'rovsiz bo'ladi.
-- Faqat shu maydon qo'shildi; qolgan javob 20261106740000 dagi bilan bir xil. Superadmin uchun hisoblanmaydi (cheklanmaydi).
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
    'azolik_id',a.id,'kompaniya_id',k.id,'nom',k.nom,'kod',k.kod,'turi',k.turi,
    'rol',a.rol,'is_director',a.rol in ('boss','admin','superadmin'),
    'holat',a.holat,'faol',k.faol) order by k.nom),'[]'::jsonb) into v_az
    from public.t2_azolik a join public.t2_kompaniya k on k.id=a.kompaniya_id
    where a.foydalanuvchi_id=p_actor_id and a.holat='faol';
  -- Context access is NOT membership. Never create synthetic memberships.
  select coalesce(jsonb_agg(jsonb_build_object(
    'kompaniya_id',k.id,'nom',k.nom,'kod',k.kod,'faol',k.faol,'turi',k.turi,
    'membership_role',a.rol,'effective_role',case when v_super then 'superadmin' else a.rol end,
    'permissions',case when v_super then public.t2_permission_catalog_v2() else public.t2_azolik_permissions_v2(a.id) end,
    'explicit_denials',case when v_super or a.rol in ('boss','admin','superadmin') then '[]'::jsonb else coalesce((select jsonb_agg(q.ruxsat) from public.t2_azolik_ruxsat_qoshimcha q where q.azolik_id=a.id and not q.berilgan),'[]'::jsonb) end,
    'modullar_off',case when v_super then '[]'::jsonb else coalesce((
        select jsonb_agg(c.kod order by c.kod) from public.t2_capability c
         cross join lateral public.t2_capability_effective_v1(c.kod, k.id, null) e
         where c.turi = 'module' and e->>'holat' = 'off'), '[]'::jsonb) end,
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
