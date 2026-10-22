-- T2-MUTAXASSIS (T6, egasi 2026-10-22: «PTO bo'lib qaysidir kompaniyaga xizmatlarimni taklif qilish darajasidagi kuch kerak»).
-- 1) Mutaxassis profili (ixtiyoriy ochiq): kasb, hudud, tajriba, xizmatlar, matn. Profilda TIZIM TASDIQLAGAN tajriba —
--    o'zi tuzgan F2 soni, obyektlar, jami summa (t2_akt.kim = 'actor:<id>'); ko'rsatish egasining tanlovi.
-- 2) Kompaniya «xizmat takliflarini qabul qilaman» (ochiq_profil) — nom bo'yicha qidiruvda ko'rinadi; STIR bo'yicha har doim.
-- 3) Xizmat taklifi: mutaxassis → kompaniya (rol + xabar). Kompaniya rahbari (company.member.manage) qabul qiladi —
--    mutaxassis o'sha rol bilan a'zo bo'ladi (boss/admin hech qachon); rad etadi. Kuniga 10 ta, bitta kompaniyaga bitta faol.
-- 4) Kompaniya tomoni: ochiq profillar katalogi (mutaxassis qidirish).
begin;

alter table public.t2_kompaniya add column if not exists ochiq_profil boolean not null default false;

create table if not exists public.t2_mutaxassis_profil (
  foydalanuvchi_id bigint primary key references public.t2_foydalanuvchi(id) on delete cascade,
  ochiq boolean not null default false,
  kasb text not null default 'pto' check (kasb in ('pto', 'smetachi', 'prorab', 'loyihachi', 'bugalter', 'muhandis')),
  hudud text check (hudud is null or length(hudud) <= 80),
  tajriba_yil int check (tajriba_yil is null or tajriba_yil between 0 and 60),
  xizmatlar text[] not null default '{}' check (cardinality(xizmatlar) <= 20),
  haqida text check (haqida is null or length(haqida) <= 1500),
  statistika_korsat boolean not null default true,
  yangilandi timestamptz not null default now()
);
alter table public.t2_mutaxassis_profil enable row level security;
revoke all on public.t2_mutaxassis_profil from public, anon, authenticated;

create table if not exists public.t2_xizmat_taklif (
  id bigserial primary key,
  mutaxassis_id bigint not null references public.t2_foydalanuvchi(id) on delete cascade,
  kompaniya_id bigint not null references public.t2_kompaniya(id) on delete cascade,
  rol text not null check (rol in ('pto', 'prorab', 'bugalter', 'kuzatuvchi')),
  xabar text check (xabar is null or length(xabar) <= 1000),
  holat text not null default 'yuborildi' check (holat in ('yuborildi', 'qabul', 'rad', 'bekor')),
  javob_actor_id bigint, javob_vaqti timestamptz, javob_izoh text,
  yaratildi timestamptz not null default now()
);
create unique index if not exists t2_xizmat_taklif_bitta_faol on public.t2_xizmat_taklif (mutaxassis_id, kompaniya_id) where holat = 'yuborildi';
create index if not exists t2_xizmat_taklif_komp_idx on public.t2_xizmat_taklif (kompaniya_id, holat);
alter table public.t2_xizmat_taklif enable row level security;
revoke all on public.t2_xizmat_taklif from public, anon, authenticated;

-- Tizim tasdiqlagan tajriba (faqat F2 muallifligi: bekor qilinmagan aktlar).
create or replace function public._t2_mutaxassis_statistika(p_uid bigint)
 returns jsonb language sql stable security definer set search_path to 'public', 'pg_temp'
as $function$
  select jsonb_build_object('f2_soni', count(*), 'tasdiqlangan_f2', count(*) filter (where a.lifecycle_status = 'approved'),
    'obyektlar', count(distinct a.obyekt_id), 'kompaniyalar', count(distinct a.kompaniya_id), 'jami_summa', coalesce(round(sum(a.hujjat_jami)), 0),
    'birinchi', min(a.yaratildi), 'oxirgi', max(a.yaratildi))
  from public.t2_akt a where a.tur = 'f2' and a.holat <> 'bekor' and a.kim = 'actor:' || p_uid
$function$;

create or replace function public._t2_mutaxassis_karta(p_uid bigint, p_toliq boolean)
 returns jsonb language sql stable security definer set search_path to 'public', 'pg_temp'
as $function$
  select jsonb_build_object('foydalanuvchi_id', u.id, 'ism', coalesce(nullif(btrim(u.ism), ''), split_part(u.login, '@', 1)),
    'kasb', p.kasb, 'hudud', p.hudud, 'tajriba_yil', p.tajriba_yil, 'xizmatlar', to_jsonb(p.xizmatlar), 'haqida', p.haqida, 'ochiq', p.ochiq,
    'statistika_korsat', p.statistika_korsat,
    'statistika', case when p_toliq or p.statistika_korsat then public._t2_mutaxassis_statistika(u.id) end,
    'yangilandi', p.yangilandi)
  from public.t2_foydalanuvchi u join public.t2_mutaxassis_profil p on p.foydalanuvchi_id = u.id where u.id = p_uid
$function$;

create or replace function public.t2_mutaxassis_profil_ol_v1(p_actor_id bigint)
 returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $function$
begin
  if not exists (select 1 from public.t2_foydalanuvchi where id = p_actor_id and holat = 'faol') then return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED'); end if;
  return jsonb_build_object('ok', true, 'profil', public._t2_mutaxassis_karta(p_actor_id, true),
    'statistika', public._t2_mutaxassis_statistika(p_actor_id));
end $function$;

create or replace function public.t2_mutaxassis_profil_saqla_v1(p_actor_id bigint, p_ochiq boolean, p_kasb text, p_hudud text, p_tajriba_yil int,
  p_xizmatlar text[], p_haqida text, p_statistika_korsat boolean)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
begin
  if not exists (select 1 from public.t2_foydalanuvchi where id = p_actor_id and holat = 'faol') then return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED'); end if;
  if p_kasb not in ('pto', 'smetachi', 'prorab', 'loyihachi', 'bugalter', 'muhandis') then return jsonb_build_object('ok', false, 'code', 'KASB_NOTOGRI'); end if;
  insert into public.t2_mutaxassis_profil as m (foydalanuvchi_id, ochiq, kasb, hudud, tajriba_yil, xizmatlar, haqida, statistika_korsat, yangilandi)
  values (p_actor_id, coalesce(p_ochiq, false), p_kasb, left(nullif(btrim(p_hudud), ''), 80), p_tajriba_yil,
          coalesce((select array_agg(left(btrim(x), 60)) from unnest(coalesce(p_xizmatlar, '{}')) x where btrim(x) <> ''), '{}'),
          left(nullif(btrim(p_haqida), ''), 1500), coalesce(p_statistika_korsat, true), now())
  on conflict (foydalanuvchi_id) do update set ochiq = excluded.ochiq, kasb = excluded.kasb, hudud = excluded.hudud, tajriba_yil = excluded.tajriba_yil,
    xizmatlar = excluded.xizmatlar, haqida = excluded.haqida, statistika_korsat = excluded.statistika_korsat, yangilandi = now();
  return jsonb_build_object('ok', true, 'profil', public._t2_mutaxassis_karta(p_actor_id, true));
end $function$;

-- Kompaniya: ochiq profillar katalogi (faqat ochiq=true; kompaniya a'zo boshqaruvi huquqi bilan).
create or replace function public.t2_mutaxassislar_qidir_v1(p_actor_id bigint, p_kompaniya_id bigint, p_kasb text, p_matn text)
 returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $function$
declare v_m text := lower(btrim(coalesce(p_matn, '')));
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'company.member.manage');
  return jsonb_build_object('ok', true, 'mutaxassislar', coalesce((select jsonb_agg(public._t2_mutaxassis_karta(p.foydalanuvchi_id, false) order by p.yangilandi desc)
    from (select p.* from public.t2_mutaxassis_profil p join public.t2_foydalanuvchi u on u.id = p.foydalanuvchi_id and u.holat = 'faol'
           where p.ochiq and (nullif(p_kasb, '') is null or p.kasb = p_kasb)
             and (v_m = '' or lower(coalesce(p.hudud, '') || ' ' || coalesce(p.haqida, '') || ' ' || array_to_string(p.xizmatlar, ' ') || ' ' || coalesce(u.ism, '')) like '%' || v_m || '%')
           order by p.yangilandi desc limit 100) p), '[]'::jsonb));
end $function$;

-- Mutaxassis: xizmat taklif qilish uchun kompaniya topish — STIR aniq bo'yicha har doim; nom bo'yicha faqat ochiq_profil.
create or replace function public.t2_xizmat_kompaniya_qidir_v1(p_actor_id bigint, p_matn text)
 returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $function$
declare v_m text := btrim(coalesce(p_matn, ''));
begin
  if not exists (select 1 from public.t2_foydalanuvchi where id = p_actor_id and holat = 'faol') then return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED'); end if;
  if length(v_m) < 3 then return jsonb_build_object('ok', true, 'kompaniyalar', '[]'::jsonb); end if;
  return jsonb_build_object('ok', true, 'kompaniyalar', coalesce((select jsonb_agg(jsonb_build_object('kompaniya_id', k.id, 'nom', k.nom, 'manzil', k.manzil,
      'azo', exists (select 1 from public.t2_azolik a where a.kompaniya_id = k.id and a.foydalanuvchi_id = p_actor_id and a.holat = 'faol'),
      'kutilmoqda', exists (select 1 from public.t2_xizmat_taklif x where x.kompaniya_id = k.id and x.mutaxassis_id = p_actor_id and x.holat = 'yuborildi')))
    from (select * from public.t2_kompaniya k where k.faol and k.turi = 'tashkilot'
            and ((v_m ~ '^[0-9]{9}$' and k.inn = v_m) or (k.ochiq_profil and lower(k.nom) like '%' || lower(v_m) || '%'))
          order by k.nom limit 20) k), '[]'::jsonb));
end $function$;

create or replace function public.t2_xizmat_taklif_yubor_v1(p_actor_id bigint, p_kompaniya_id bigint, p_rol text, p_xabar text)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare v_id bigint;
begin
  if not exists (select 1 from public.t2_foydalanuvchi where id = p_actor_id and holat = 'faol') then return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED'); end if;
  if p_rol not in ('pto', 'prorab', 'bugalter', 'kuzatuvchi') then return jsonb_build_object('ok', false, 'code', 'ROL_NOTOGRI'); end if;
  if not exists (select 1 from public.t2_kompaniya where id = p_kompaniya_id and faol and turi = 'tashkilot') then return jsonb_build_object('ok', false, 'code', 'KOMPANIYA_TOPILMADI'); end if;
  if exists (select 1 from public.t2_azolik where kompaniya_id = p_kompaniya_id and foydalanuvchi_id = p_actor_id and holat = 'faol') then
    return jsonb_build_object('ok', false, 'code', 'ALLAQACHON_AZO', 'xabar', 'Siz bu kompaniyada allaqachon ishlaysiz.');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('t2_xizmat_taklif:' || p_actor_id, 0));
  if (select count(*) from public.t2_xizmat_taklif where mutaxassis_id = p_actor_id and yaratildi > now() - interval '24 hours') >= 10 then
    return jsonb_build_object('ok', false, 'code', 'LIMIT_KUN', 'xabar', 'Bir kunda 10 tadan ortiq taklif yuborib bo''lmaydi.');
  end if;
  if exists (select 1 from public.t2_xizmat_taklif where mutaxassis_id = p_actor_id and kompaniya_id = p_kompaniya_id and holat = 'yuborildi') then
    return jsonb_build_object('ok', false, 'code', 'KUTILMOQDA', 'xabar', 'Bu kompaniyaga taklifingiz javob kutmoqda.');
  end if;
  insert into public.t2_xizmat_taklif (mutaxassis_id, kompaniya_id, rol, xabar) values (p_actor_id, p_kompaniya_id, p_rol, left(nullif(btrim(p_xabar), ''), 1000)) returning id into v_id;
  perform public.t2_audit_yoz(p_kompaniya_id, 'xizmat_taklif_keldi', 'kompaniya', null, format('taklif=%s mutaxassis=%s rol=%s', v_id, p_actor_id, p_rol), 'actor:' || p_actor_id, null);
  return jsonb_build_object('ok', true, 'taklif_id', v_id);
end $function$;

create or replace function public.t2_xizmat_takliflarim_v1(p_actor_id bigint)
 returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $function$
begin
  return jsonb_build_object('ok', true, 'takliflar', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'kompaniya_id', x.kompaniya_id, 'kompaniya_nom', k.nom,
      'rol', x.rol, 'xabar', x.xabar, 'holat', x.holat, 'javob_izoh', x.javob_izoh, 'yaratildi', x.yaratildi, 'javob_vaqti', x.javob_vaqti) order by x.id desc)
    from public.t2_xizmat_taklif x join public.t2_kompaniya k on k.id = x.kompaniya_id where x.mutaxassis_id = p_actor_id), '[]'::jsonb));
end $function$;

create or replace function public.t2_xizmat_taklif_bekor_v1(p_actor_id bigint, p_taklif_id bigint)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
begin
  update public.t2_xizmat_taklif set holat = 'bekor', javob_vaqti = now() where id = p_taklif_id and mutaxassis_id = p_actor_id and holat = 'yuborildi';
  if not found then return jsonb_build_object('ok', false, 'code', 'TAKLIF_TOPILMADI'); end if;
  return jsonb_build_object('ok', true);
end $function$;

-- Kompaniya tomoni: kelgan takliflar (mutaxassis kartasi bilan).
create or replace function public.t2_xizmat_takliflar_kelgan_v1(p_actor_id bigint, p_kompaniya_id bigint)
 returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $function$
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'company.member.manage');
  return jsonb_build_object('ok', true, 'ochiq_profil', (select ochiq_profil from public.t2_kompaniya where id = p_kompaniya_id),
    'takliflar', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'rol', x.rol, 'xabar', x.xabar, 'holat', x.holat,
      'yaratildi', x.yaratildi, 'mutaxassis', coalesce(public._t2_mutaxassis_karta(x.mutaxassis_id, false),
        (select jsonb_build_object('foydalanuvchi_id', u.id, 'ism', coalesce(nullif(btrim(u.ism), ''), split_part(u.login, '@', 1))) from public.t2_foydalanuvchi u where u.id = x.mutaxassis_id)))
      order by (x.holat = 'yuborildi') desc, x.id desc)
    from public.t2_xizmat_taklif x where x.kompaniya_id = p_kompaniya_id and x.yaratildi > now() - interval '180 days'), '[]'::jsonb));
end $function$;

create or replace function public.t2_xizmat_taklif_javob_v1(p_actor_id bigint, p_kompaniya_id bigint, p_taklif_id bigint, p_qabul boolean, p_izoh text)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare v_x public.t2_xizmat_taklif%rowtype; v_azolik bigint;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'company.member.manage');
  select * into v_x from public.t2_xizmat_taklif where id = p_taklif_id and kompaniya_id = p_kompaniya_id for update;
  if not found or v_x.holat <> 'yuborildi' then return jsonb_build_object('ok', false, 'code', 'TAKLIF_TOPILMADI'); end if;
  update public.t2_xizmat_taklif set holat = case when p_qabul then 'qabul' else 'rad' end, javob_actor_id = p_actor_id, javob_vaqti = now(),
         javob_izoh = left(nullif(btrim(p_izoh), ''), 500) where id = v_x.id;
  if p_qabul then
    select id into v_azolik from public.t2_azolik where kompaniya_id = p_kompaniya_id and foydalanuvchi_id = v_x.mutaxassis_id and holat = 'faol';
    if v_azolik is null then
      insert into public.t2_azolik (foydalanuvchi_id, kompaniya_id, rol, holat) values (v_x.mutaxassis_id, p_kompaniya_id, v_x.rol, 'faol') returning id into v_azolik;
    end if;
  end if;
  perform public.t2_audit_yoz(p_kompaniya_id, case when p_qabul then 'xizmat_taklif_qabul' else 'xizmat_taklif_rad' end, 'kompaniya', null,
    format('taklif=%s mutaxassis=%s rol=%s', v_x.id, v_x.mutaxassis_id, v_x.rol), 'actor:' || p_actor_id, null);
  return jsonb_build_object('ok', true, 'holat', case when p_qabul then 'qabul' else 'rad' end, 'azolik_id', v_azolik);
end $function$;

create or replace function public.t2_kompaniya_ochiq_profil_v1(p_actor_id bigint, p_kompaniya_id bigint, p_ochiq boolean)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'company.profile.update');
  update public.t2_kompaniya set ochiq_profil = coalesce(p_ochiq, false) where id = p_kompaniya_id;
  return jsonb_build_object('ok', true, 'ochiq_profil', coalesce(p_ochiq, false));
end $function$;

revoke all on function public.t2_mutaxassis_profil_ol_v1(bigint) from public, anon, authenticated;
grant execute on function public.t2_mutaxassis_profil_ol_v1(bigint) to service_role;
revoke all on function public.t2_mutaxassis_profil_saqla_v1(bigint, boolean, text, text, int, text[], text, boolean) from public, anon, authenticated;
grant execute on function public.t2_mutaxassis_profil_saqla_v1(bigint, boolean, text, text, int, text[], text, boolean) to service_role;
revoke all on function public.t2_mutaxassislar_qidir_v1(bigint, bigint, text, text) from public, anon, authenticated;
grant execute on function public.t2_mutaxassislar_qidir_v1(bigint, bigint, text, text) to service_role;
revoke all on function public.t2_xizmat_kompaniya_qidir_v1(bigint, text) from public, anon, authenticated;
grant execute on function public.t2_xizmat_kompaniya_qidir_v1(bigint, text) to service_role;
revoke all on function public.t2_xizmat_taklif_yubor_v1(bigint, bigint, text, text) from public, anon, authenticated;
grant execute on function public.t2_xizmat_taklif_yubor_v1(bigint, bigint, text, text) to service_role;
revoke all on function public.t2_xizmat_takliflarim_v1(bigint) from public, anon, authenticated;
grant execute on function public.t2_xizmat_takliflarim_v1(bigint) to service_role;
revoke all on function public.t2_xizmat_taklif_bekor_v1(bigint, bigint) from public, anon, authenticated;
grant execute on function public.t2_xizmat_taklif_bekor_v1(bigint, bigint) to service_role;
revoke all on function public.t2_xizmat_takliflar_kelgan_v1(bigint, bigint) from public, anon, authenticated;
grant execute on function public.t2_xizmat_takliflar_kelgan_v1(bigint, bigint) to service_role;
revoke all on function public.t2_xizmat_taklif_javob_v1(bigint, bigint, bigint, boolean, text) from public, anon, authenticated;
grant execute on function public.t2_xizmat_taklif_javob_v1(bigint, bigint, bigint, boolean, text) to service_role;
revoke all on function public.t2_kompaniya_ochiq_profil_v1(bigint, bigint, boolean) from public, anon, authenticated;
grant execute on function public.t2_kompaniya_ochiq_profil_v1(bigint, bigint, boolean) to service_role;
revoke all on function public._t2_mutaxassis_statistika(bigint) from public, anon, authenticated;
grant execute on function public._t2_mutaxassis_statistika(bigint) to service_role;
revoke all on function public._t2_mutaxassis_karta(bigint, boolean) from public, anon, authenticated;
grant execute on function public._t2_mutaxassis_karta(bigint, boolean) to service_role;

commit;
