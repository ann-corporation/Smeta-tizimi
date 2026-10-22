-- T2-ISH-JOYI («Telegram modeli», egasi 2026-10-22; ARXITEKTURA_TELEGRAM_MODELI T1–T3).
-- T1: ish joyi turi — 'shaxsiy' (o'zi ro'yxatdan o'tganda yaratiladi) | 'tashkilot'. Mavjud kompaniyalar 'tashkilot',
--     o'zi ro'yxatdan o'tganlarniki 'shaxsiy'. t2_men_v1 ro'yxatida turi qaytadi.
-- T2: yangi ish joyini DARHOL ochish (superadmin tasdig'isiz, Telegram'da guruh ochgandek). Suiiste'molga qarshi: kuniga 3,
--     jami 20 ta ish joyi (boss sifatida); bepul tarif 1 oy; sinov bonusi YO'Q (faqat birinchi ro'yxatda).
-- T3: taklif havolasi — rol (boss/admin/superadmin emas), muddat, foydalanish soni; kod shlyuzda yaratiladi, bazada faqat
--     SHA-256 xeshi. Qo'shilish ham tasdiqsiz; bekor qilingan/muddati o'tgan/to'lgan havola ishlamaydi.
begin;

-- ── T1 ────────────────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.t2_kompaniya add column if not exists turi text not null default 'tashkilot';
alter table public.t2_kompaniya drop constraint if exists t2_kompaniya_turi_check;
alter table public.t2_kompaniya add constraint t2_kompaniya_turi_check check (turi in ('shaxsiy', 'tashkilot'));
update public.t2_kompaniya k set turi = 'shaxsiy'
 where turi <> 'shaxsiy' and exists (select 1 from public.t2_ozi_royxat_log l where l.kompaniya_id = k.id);

create or replace function public.t2_ozi_royxat_shaxsiy_trg_v1()
 returns trigger language plpgsql set search_path to 'public', 'pg_temp'
as $function$
begin
  if new.kompaniya_id is not null then update public.t2_kompaniya set turi = 'shaxsiy' where id = new.kompaniya_id; end if;
  return new;
end $function$;
drop trigger if exists t2_ozi_royxat_shaxsiy on public.t2_ozi_royxat_log;
create trigger t2_ozi_royxat_shaxsiy after insert on public.t2_ozi_royxat_log
  for each row execute function public.t2_ozi_royxat_shaxsiy_trg_v1();

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

-- Ish joyi turini almashtirish (shaxsiy → tashkilot: jamoa qo'shmoqchi bo'lganda). Faqat profil huquqi bilan.
create or replace function public.t2_ish_joyi_turi_v1(p_actor_id bigint, p_kompaniya_id bigint, p_turi text)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
begin
  if p_turi not in ('shaxsiy', 'tashkilot') then return jsonb_build_object('ok', false, 'code', 'TURI_NOTOGRI'); end if;
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'company.profile.update');
  update public.t2_kompaniya set turi = p_turi where id = p_kompaniya_id;
  perform public.t2_audit_yoz(p_kompaniya_id, 'ish_joyi_turi', 'kompaniya', null, format('turi=%s', p_turi), 'actor:' || p_actor_id, null);
  return jsonb_build_object('ok', true, 'kompaniya_id', p_kompaniya_id, 'turi', p_turi);
end $function$;

-- ── T2 ────────────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.t2_ish_joyi_yarat_v1(p_actor_id bigint, p_nom text, p_turi text, p_operation_id uuid)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare v_prev jsonb; v_k jsonb; v_kid bigint; v_res jsonb;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev || '{"takror":true}'::jsonb; end if;
  if p_turi not in ('shaxsiy', 'tashkilot') then return jsonb_build_object('ok', false, 'code', 'TURI_NOTOGRI'); end if;
  if not exists (select 1 from public.t2_foydalanuvchi where id = p_actor_id and coalesce(holat, 'faol') = 'faol') then
    return jsonb_build_object('ok', false, 'code', 'ACTOR_NOT_FOUND');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('t2_ish_joyi_yarat:' || p_actor_id, 0));
  if (select count(*) from public.t2_onboarding_command_log where actor_id = p_actor_id and command = 'ish_joyi_yarat'
        and created_at > now() - interval '24 hours') >= 3 then
    return jsonb_build_object('ok', false, 'code', 'LIMIT_KUN', 'xabar', 'Bir kunda 3 tadan ortiq ish joyi ochib bo''lmaydi.');
  end if;
  if (select count(*) from public.t2_azolik where foydalanuvchi_id = p_actor_id and holat = 'faol' and rol = 'boss') >= 20 then
    return jsonb_build_object('ok', false, 'code', 'LIMIT_JAMI', 'xabar', 'Bitta foydalanuvchida 20 tadan ortiq ish joyi bo''lmaydi.');
  end if;
  v_k := public._t2_kompaniya_yarat_asosiy(p_actor_id, p_nom, null, null);
  if coalesce((v_k->>'ok')::boolean, false) is not true then return v_k; end if;
  v_kid := (v_k->>'kompaniya_id')::bigint;
  update public.t2_kompaniya set turi = p_turi where id = v_kid;
  insert into public.t2_obuna(kompaniya_id, tarif_kod, boshlandi, tugaydi, kim)
    values (v_kid, 'free', current_date, (current_date + interval '1 month')::date, 'ish_joyi_yarat');
  perform public.t2_audit_yoz(v_kid, 'ish_joyi_yarat', 'kompaniya', null, format('nom=%s turi=%s', btrim(p_nom), p_turi), 'actor:' || p_actor_id, null);
  v_res := jsonb_build_object('ok', true, 'kompaniya_id', v_kid, 'kod', v_k->>'kod', 'turi', p_turi);
  insert into public.t2_onboarding_command_log (operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'ish_joyi_yarat', v_res);
  return v_res;
end $function$;

-- ── T3 ────────────────────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.t2_ish_joyi_taklif (
  id bigserial primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id) on delete cascade,
  kod_xesh text not null unique,
  rol text not null check (rol in ('rahbar', 'bugalter', 'pto', 'prorab', 'buyurtmachi', 'pudratchi', 'kuzatuvchi')),
  muddat timestamptz not null,
  max_soni int not null check (max_soni between 1 and 500),
  foydalanildi int not null default 0,
  holat text not null default 'faol' check (holat in ('faol', 'bekor')),
  izoh text,
  yaratdi_actor_id bigint not null,
  yaratildi timestamptz not null default now(),
  bekor_actor_id bigint,
  bekor_vaqti timestamptz
);
create index if not exists t2_ish_joyi_taklif_komp_idx on public.t2_ish_joyi_taklif (kompaniya_id, holat);
alter table public.t2_ish_joyi_taklif enable row level security;
revoke all on public.t2_ish_joyi_taklif from public, anon, authenticated;

create or replace function public.t2_ish_joyi_taklif_yarat_v1(p_actor_id bigint, p_kompaniya_id bigint, p_kod_xesh text, p_rol text,
  p_muddat_soat int, p_max_soni int, p_izoh text, p_operation_id uuid)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare v_prev jsonb; v_id bigint; v_res jsonb;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev || '{"takror":true}'::jsonb; end if;
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'company.member.manage');
  if p_kod_xesh !~ '^[0-9a-f]{64}$' then return jsonb_build_object('ok', false, 'code', 'KOD_NOTOGRI'); end if;
  if p_rol not in ('rahbar', 'bugalter', 'pto', 'prorab', 'buyurtmachi', 'pudratchi', 'kuzatuvchi') then
    return jsonb_build_object('ok', false, 'code', 'ROL_NOTOGRI', 'xabar', 'Havola orqali rahbar (boss) yoki admin berilmaydi.');
  end if;
  if p_muddat_soat is null or p_muddat_soat < 1 or p_muddat_soat > 24 * 30 then return jsonb_build_object('ok', false, 'code', 'MUDDAT_NOTOGRI'); end if;
  if p_max_soni is null or p_max_soni < 1 or p_max_soni > 500 then return jsonb_build_object('ok', false, 'code', 'SONI_NOTOGRI'); end if;
  insert into public.t2_ish_joyi_taklif (kompaniya_id, kod_xesh, rol, muddat, max_soni, izoh, yaratdi_actor_id)
    values (p_kompaniya_id, p_kod_xesh, p_rol, now() + make_interval(hours => p_muddat_soat), p_max_soni, left(nullif(btrim(p_izoh), ''), 200), p_actor_id)
    returning id into v_id;
  perform public.t2_audit_yoz(p_kompaniya_id, 'ish_joyi_taklif_yarat', 'kompaniya', null, format('taklif=%s rol=%s soni=%s', v_id, p_rol, p_max_soni), 'actor:' || p_actor_id, null);
  v_res := jsonb_build_object('ok', true, 'taklif_id', v_id);
  insert into public.t2_onboarding_command_log (operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'ish_joyi_taklif_yarat', v_res);
  return v_res;
end $function$;

create or replace function public.t2_ish_joyi_taklif_bekor_v1(p_actor_id bigint, p_kompaniya_id bigint, p_taklif_id bigint)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'company.member.manage');
  update public.t2_ish_joyi_taklif set holat = 'bekor', bekor_actor_id = p_actor_id, bekor_vaqti = now()
   where id = p_taklif_id and kompaniya_id = p_kompaniya_id and holat = 'faol';
  if not found then return jsonb_build_object('ok', false, 'code', 'TAKLIF_TOPILMADI'); end if;
  perform public.t2_audit_yoz(p_kompaniya_id, 'ish_joyi_taklif_bekor', 'kompaniya', null, format('taklif=%s', p_taklif_id), 'actor:' || p_actor_id, null);
  return jsonb_build_object('ok', true);
end $function$;

create or replace function public.t2_ish_joyi_takliflar_v1(p_actor_id bigint, p_kompaniya_id bigint)
 returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $function$
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'company.member.manage');
  return jsonb_build_object('ok', true, 'takliflar', coalesce((select jsonb_agg(jsonb_build_object(
      'id', t.id, 'rol', t.rol, 'muddat', t.muddat, 'max_soni', t.max_soni, 'foydalanildi', t.foydalanildi, 'izoh', t.izoh,
      'holat', case when t.holat = 'bekor' then 'bekor' when t.muddat < now() then 'muddati_otgan'
                    when t.foydalanildi >= t.max_soni then 'toldi' else 'faol' end,
      'yaratildi', t.yaratildi) order by t.id desc)
    from public.t2_ish_joyi_taklif t where t.kompaniya_id = p_kompaniya_id), '[]'::jsonb));
end $function$;

create or replace function public.t2_ish_joyi_qoshil_v1(p_actor_id bigint, p_kod_xesh text, p_operation_id uuid)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare v_prev jsonb; v_t public.t2_ish_joyi_taklif%rowtype; v_res jsonb; v_azolik bigint; v_nom text;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev || '{"takror":true}'::jsonb; end if;
  if not exists (select 1 from public.t2_foydalanuvchi where id = p_actor_id and coalesce(holat, 'faol') = 'faol') then
    return jsonb_build_object('ok', false, 'code', 'ACTOR_NOT_FOUND');
  end if;
  select * into v_t from public.t2_ish_joyi_taklif where kod_xesh = p_kod_xesh for update;
  if not found or v_t.holat <> 'faol' then return jsonb_build_object('ok', false, 'code', 'TAKLIF_YAROQSIZ', 'xabar', 'Havola topilmadi yoki bekor qilingan.'); end if;
  if v_t.muddat < now() then return jsonb_build_object('ok', false, 'code', 'TAKLIF_MUDDATI_OTGAN', 'xabar', 'Havolaning muddati tugagan.'); end if;
  select nom into v_nom from public.t2_kompaniya where id = v_t.kompaniya_id and faol;
  if v_nom is null then return jsonb_build_object('ok', false, 'code', 'TAKLIF_YAROQSIZ'); end if;
  select id into v_azolik from public.t2_azolik where foydalanuvchi_id = p_actor_id and kompaniya_id = v_t.kompaniya_id and holat = 'faol';
  if v_azolik is not null then
    return jsonb_build_object('ok', true, 'mavjud', true, 'kompaniya_id', v_t.kompaniya_id, 'nom', v_nom);
  end if;
  if v_t.foydalanildi >= v_t.max_soni then return jsonb_build_object('ok', false, 'code', 'TAKLIF_TOLDI', 'xabar', 'Havola bo''yicha joylar tugagan.'); end if;
  insert into public.t2_azolik (foydalanuvchi_id, kompaniya_id, rol, holat) values (p_actor_id, v_t.kompaniya_id, v_t.rol, 'faol') returning id into v_azolik;
  update public.t2_ish_joyi_taklif set foydalanildi = foydalanildi + 1 where id = v_t.id;
  perform public.t2_audit_yoz(v_t.kompaniya_id, 'ish_joyi_qoshildi', 'kompaniya', null, format('taklif=%s azolik=%s rol=%s', v_t.id, v_azolik, v_t.rol), 'actor:' || p_actor_id, null);
  v_res := jsonb_build_object('ok', true, 'mavjud', false, 'kompaniya_id', v_t.kompaniya_id, 'nom', v_nom, 'rol', v_t.rol);
  insert into public.t2_onboarding_command_log (operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'ish_joyi_qoshil', v_res);
  return v_res;
end $function$;

revoke all on function public.t2_ish_joyi_turi_v1(bigint, bigint, text) from public, anon, authenticated;
revoke all on function public.t2_ish_joyi_yarat_v1(bigint, text, text, uuid) from public, anon, authenticated;
revoke all on function public.t2_ish_joyi_taklif_yarat_v1(bigint, bigint, text, text, int, int, text, uuid) from public, anon, authenticated;
revoke all on function public.t2_ish_joyi_taklif_bekor_v1(bigint, bigint, bigint) from public, anon, authenticated;
revoke all on function public.t2_ish_joyi_takliflar_v1(bigint, bigint) from public, anon, authenticated;
revoke all on function public.t2_ish_joyi_qoshil_v1(bigint, text, uuid) from public, anon, authenticated;
grant execute on function public.t2_ish_joyi_turi_v1(bigint, bigint, text) to service_role;
grant execute on function public.t2_ish_joyi_yarat_v1(bigint, text, text, uuid) to service_role;
grant execute on function public.t2_ish_joyi_taklif_yarat_v1(bigint, bigint, text, text, int, int, text, uuid) to service_role;
grant execute on function public.t2_ish_joyi_taklif_bekor_v1(bigint, bigint, bigint) to service_role;
grant execute on function public.t2_ish_joyi_takliflar_v1(bigint, bigint) to service_role;
grant execute on function public.t2_ish_joyi_qoshil_v1(bigint, text, uuid) to service_role;

commit;
