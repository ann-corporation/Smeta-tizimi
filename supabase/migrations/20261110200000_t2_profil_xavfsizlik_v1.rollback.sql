-- Rollback: 20261110200000 — profil / xavfsizlik / hisob birlashtirish.
-- DIQQAT: (1) 'birlashtirildi' holatidagi hisoblar 'bekor' ga o'tkaziladi (eski holat check ga mos), ko'chirilgan a'zoliklar
-- QAYTARILMAYDI (qo'lda tiklash kerak — migratsiya natijalari audit da). (2) telefon / telefon_tasdiqlangan ustunlari
-- 20261108000000 ga tegishli — bu yerda o'chirilmaydi.
begin;

-- Funksiyalarning eski tanalari (t2_men_v1 — 20261106780000; t2_parol_tekshir_v1 — 20261105300000; t2_google_kirish_v1 — 20261105310000)
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

create or replace function public.t2_parol_tekshir_v1(p_login text, p_parol text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_id bigint; v_hash text; v_holat text;
begin
  if coalesce(btrim(p_login),'') = '' or coalesce(p_parol,'') = '' then return jsonb_build_object('ok',false,'code','LOGIN_PAROL_MAJBURIY'); end if;
  select id, parol_hash, holat into v_id, v_hash, v_holat from public.t2_foydalanuvchi where lower(login) = lower(btrim(p_login));
  if v_id is null or v_hash is null then return jsonb_build_object('ok',false,'code','NO_PASSWORD_SET'); end if;
  if v_holat is distinct from 'faol' then return jsonb_build_object('ok',false,'code','FOYDALANUVCHI_FAOL_EMAS'); end if;
  if v_hash <> extensions.crypt(p_parol, v_hash) then return jsonb_build_object('ok',false,'code','PAROL_NOTOGRI'); end if;
  return jsonb_build_object('ok',true,'foydalanuvchi_id',v_id,'rol',coalesce(public._t2_asosiy_rol(v_id),'kuzatuvchi'));
end $$;

create or replace function public.t2_google_kirish_v1(p_email text, p_ism text, p_sub text, p_ip_belgi text, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_email text := lower(btrim(coalesce(p_email, ''))); v_u public.t2_foydalanuvchi%rowtype; v_rol text;
  v_k jsonb; v_kid bigint; v_demo bigint; v_manba bigint; v_ism text;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  if coalesce(btrim(p_sub), '') = '' or v_email !~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' then return jsonb_build_object('ok', false, 'code', 'GOOGLE_MALUMOT_NOTOGRI'); end if;
  perform pg_advisory_xact_lock(hashtextextended('t2_google_kirish:' || p_sub, 0));

  select * into v_u from public.t2_foydalanuvchi where google_sub = p_sub;
  if not found then
    select * into v_u from public.t2_foydalanuvchi where lower(email) = v_email or lower(login) = v_email order by id limit 1;
    if found then
      if v_u.google_sub is not null and v_u.google_sub <> p_sub then return jsonb_build_object('ok', false, 'code', 'GOOGLE_BOSHQA_HISOB'); end if;
      -- O'zi ro'yxatdan (parol bilan) o'tgan hisobning emaili TASDIQLANMAGAN: begona odam birovning emailini login qilib
      -- oldindan band qilgan bo'lishi mumkin — avtomatik ulamaymiz (egasi qo'shgan a'zolar emaili — ishonchli).
      if exists (select 1 from public.t2_ozi_royxat_log where foydalanuvchi_id = v_u.id) then
        return jsonb_build_object('ok', false, 'code', 'EMAIL_PAROL_BILAN', 'xabar', 'Bu email parol bilan ro''yxatdan o''tgan. Login va parol bilan kiring.');
      end if;
      update public.t2_foydalanuvchi set google_sub = p_sub, email = coalesce(email, v_email) where id = v_u.id;
    end if;
  end if;

  if v_u.id is not null then
    if v_u.holat is distinct from 'faol' then return jsonb_build_object('ok', false, 'code', 'FOYDALANUVCHI_FAOL_EMAS'); end if;
    v_rol := public._t2_asosiy_rol(v_u.id);
    return jsonb_build_object('ok', true, 'yangi', false, 'login', v_u.login, 'foydalanuvchi_id', v_u.id, 'rol', coalesce(v_rol, 'kuzatuvchi'));
  end if;

  -- Yangi hisob: o'zi ro'yxat qoidalari (qurilma limiti, bepul tarif, demo).
  perform pg_advisory_xact_lock(hashtextextended('t2_ozi_royxat', 0));
  if (select count(*) from public.t2_ozi_royxat_log where ip_belgi = p_ip_belgi and yaratildi > now() - interval '24 hours') >= 5 then
    return jsonb_build_object('ok', false, 'code', 'LIMIT', 'xabar', 'Bu qurilmadan bugun ro''yxatdan o''tish limiti tugadi. Ertaga urinib ko''ring.');
  end if;
  v_ism := coalesce(nullif(btrim(left(coalesce(p_ism, ''), 200)), ''), split_part(v_email, '@', 1));
  insert into public.t2_foydalanuvchi(login, email, ism, holat, google_sub)
  values (v_email, v_email, v_ism, 'faol', p_sub) returning * into v_u;
  v_k := public._t2_kompaniya_yarat_asosiy(v_u.id, v_ism || ' — PTO', null, null);
  if coalesce((v_k->>'ok')::boolean, false) is not true then raise exception 'KOMPANIYA_YARATILMADI: %', v_k; end if;
  v_kid := (v_k->>'kompaniya_id')::bigint;
  insert into public.t2_obuna(kompaniya_id, tarif_kod, boshlandi, tugaydi, kim) values (v_kid, 'free', current_date, (current_date + interval '1 month')::date, 'google');
  perform public._t2_sinov_bonus(v_kid, v_u.id);
  select obyekt_id into v_manba from public.t2_demo_manba where id = 1;
  if v_manba is not null then v_demo := public._t2_demo_nusxa(v_kid, v_manba); end if;
  insert into public.t2_ozi_royxat_log(ip_belgi, foydalanuvchi_id, kompaniya_id, operation_id) values (p_ip_belgi, v_u.id, v_kid, p_operation_id);
  perform public.t2_audit_yoz(v_kid, 'ozi_royxat', 'kompaniya', v_demo, format('google login=%s', v_email), 'google', p_ip_belgi);
  return jsonb_build_object('ok', true, 'yangi', true, 'login', v_email, 'foydalanuvchi_id', v_u.id, 'rol', 'boss', 'demo_obyekt_id', v_demo);
end $$;

drop function if exists public.t2_hisob_birlashtir_v1(bigint,text,text);
drop function if exists public.t2_google_ulash_v1(bigint,text,text);
drop function if exists public.t2_google_uzish_v1(bigint);
drop function if exists public.t2_sessiya_bekor_v1(bigint);
drop function if exists public.t2_parol_ozgartir_v1(bigint,text,text);
drop function if exists public.t2_profil_yangila_v1(bigint,text,text,text,text);
drop function if exists public.t2_profil_ol_v1(bigint);
drop function if exists public._t2_profil_audit(bigint,text,text);
drop function if exists public._t2_profil_json(bigint);
drop function if exists public._t2_hisob_oxirgi(bigint);

update public.t2_foydalanuvchi set holat = 'bekor' where holat = 'birlashtirildi';
alter table public.t2_foydalanuvchi drop constraint if exists t2_foydalanuvchi_holat_check;
alter table public.t2_foydalanuvchi add constraint t2_foydalanuvchi_holat_check check (holat = any (array['faol','bekor']));

drop index if exists public.t2_foydalanuvchi_birlashgan_idx;
alter table public.t2_foydalanuvchi drop constraint if exists t2_foydalanuvchi_birlashgan_check;
alter table public.t2_foydalanuvchi drop constraint if exists t2_foydalanuvchi_til_check;
alter table public.t2_foydalanuvchi drop constraint if exists t2_foydalanuvchi_avatar_rang_check;
alter table public.t2_foydalanuvchi
  drop column if exists birlashgan_id,
  drop column if exists sessiya_bekor_dan,
  drop column if exists avatar_rang,
  drop column if exists til;

commit;
