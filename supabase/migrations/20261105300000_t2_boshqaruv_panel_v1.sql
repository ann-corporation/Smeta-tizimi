-- T2-BOSHQARUV-001 — egasining platforma boshqaruv paneli (egasi, 2026-10-02: "alohida login bilan kirganimda tanib
-- superadmin bersin; foydalanuvchilar, obunalar, hisob, audit, sozlamalar, funksiyalar — hammasi bitta panelda").
-- Qonunlar: har funksiya BIRINCHI qatorda platforma superadminini tekshiradi (t2_platforma_superadmin); faqat
-- service_role (server shlyuzi /api/boshqaruv) chaqiradi; har o'zgarish t2_audit_log ga yoziladi; o'zini bloklash va
-- oxirgi superadminni olib tashlash mumkin emas.
begin;

-- ═══ 0. Egasining Google hisobi = platforma superadmini (eski "Anvar" hisobi bilan bir xil kompaniyada) ═══
insert into public.t2_azolik(foydalanuvchi_id, kompaniya_id, rol, holat)
select f.id, a.kompaniya_id, 'superadmin', 'faol'
  from public.t2_foydalanuvchi f
  cross join lateral (select kompaniya_id from public.t2_azolik where foydalanuvchi_id = (select id from public.t2_foydalanuvchi where login = 'Anvar') and rol = 'superadmin' and holat = 'faol' order by id limit 1) a
 where lower(f.email) = 'anvar.ahatqulov@gmail.com' and f.google_sub is not null
   and not exists (select 1 from public.t2_azolik x where x.foydalanuvchi_id = f.id and x.kompaniya_id = a.kompaniya_id and x.holat = 'faol');

-- Sessiya roli: superadmin a'zoligi bo'lsa — u birinchi (aks holda eng eski a'zolik).
create or replace function public._t2_asosiy_rol(p_foydalanuvchi_id bigint) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select a.rol from public.t2_azolik a where a.foydalanuvchi_id = p_foydalanuvchi_id and a.holat = 'faol'
   order by (a.rol = 'superadmin') desc, a.id limit 1 $$;
revoke all on function public._t2_asosiy_rol(bigint) from public, anon, authenticated;

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

-- Google kirishi ham superadmin a'zoligini birinchi oladi.
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
  insert into public.t2_token_harakat(kompaniya_id, foydalanuvchi_id, miqdor, tur, izoh, operation_id)
  values (v_kid, v_u.id, (select oylik_token from public.t2_tarif where kod = 'free'), 'oylik', 'Bepul sinov — 1-oy', gen_random_uuid());
  select obyekt_id into v_manba from public.t2_demo_manba where id = 1;
  if v_manba is not null then v_demo := public._t2_demo_nusxa(v_kid, v_manba); end if;
  insert into public.t2_ozi_royxat_log(ip_belgi, foydalanuvchi_id, kompaniya_id, operation_id) values (p_ip_belgi, v_u.id, v_kid, p_operation_id);
  perform public.t2_audit_yoz(v_kid, 'ozi_royxat', 'kompaniya', v_demo, format('google login=%s', v_email), 'google', p_ip_belgi);
  return jsonb_build_object('ok', true, 'yangi', true, 'login', v_email, 'foydalanuvchi_id', v_u.id, 'rol', 'boss', 'demo_obyekt_id', v_demo);
end $$;

-- ═══ 1. Qo'riqchi ═══
create or replace function public._t2_boshqaruv_tekshir(p_actor_id bigint) returns bigint
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_k bigint;
begin
  if p_actor_id is null or not public.t2_platforma_superadmin(p_actor_id) then raise exception 'SUPERADMIN_KERAK' using errcode = '42501'; end if;
  select kompaniya_id into v_k from public.t2_azolik where foydalanuvchi_id = p_actor_id and rol = 'superadmin' and holat = 'faol' order by id limit 1;
  return v_k; -- platforma auditlari shu kompaniyaga yoziladi
end $$;
revoke all on function public._t2_boshqaruv_tekshir(bigint) from public, anon, authenticated;

-- ═══ 2. Umumiy ko'rinish ═══
create or replace function public.t2_boshqaruv_umumiy_v1(p_actor_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._t2_boshqaruv_tekshir(p_actor_id);
  return jsonb_build_object(
    'foydalanuvchi', jsonb_build_object(
      'jami', (select count(*) from t2_foydalanuvchi), 'faol', (select count(*) from t2_foydalanuvchi where holat = 'faol'),
      'google', (select count(*) from t2_foydalanuvchi where google_sub is not null),
      'yangi_7', (select count(*) from t2_foydalanuvchi where yaratildi > now() - interval '7 days'),
      'yangi_30', (select count(*) from t2_foydalanuvchi where yaratildi > now() - interval '30 days')),
    'kompaniya', jsonb_build_object('jami', (select count(*) from t2_kompaniya), 'yangi_30', (select count(*) from t2_kompaniya where yaratildi > now() - interval '30 days')),
    'obyekt', (select count(*) from t2_obyekt),
    'smeta_qator_taxmin', (select greatest(reltuples, 0)::bigint from pg_class where oid = 'public.t2_qator'::regclass),
    'obunalar', (select coalesce(jsonb_agg(jsonb_build_object('kod', t.kod, 'nom', t.nom, 'narx_som', t.narx_som,
        'soni', (select count(*) from t2_obuna o where o.tarif_kod = t.kod and o.holat = 'faol')) order by t.tartib), '[]') from t2_tarif t),
    'oylik_tushum_som', (select coalesce(sum(t.narx_som), 0) from t2_obuna o join t2_tarif t on t.kod = o.tarif_kod where o.holat = 'faol'),
    'token', jsonb_build_object(
      'berilgan', (select coalesce(sum(miqdor), 0) from t2_token_harakat where tur in ('oylik', 'toldirish', 'bonus')),
      'sotilgan', (select coalesce(sum(miqdor), 0) from t2_token_harakat where tur = 'toldirish'),
      'sarflangan', (select coalesce(-sum(miqdor), 0) from t2_token_harakat where tur in ('sarf', 'qaytarish')),
      'sarf_30', (select coalesce(-sum(miqdor), 0) from t2_token_harakat where tur in ('sarf', 'qaytarish') and yaratildi > now() - interval '30 days'),
      'qoldiq', (select coalesce(sum(miqdor), 0) from t2_token_harakat)),
    'token_amal', (select coalesce(jsonb_agg(x order by (x->>'token')::numeric desc), '[]') from (
        select jsonb_build_object('amal', amal, 'token', -sum(miqdor), 'soni', count(*)) x from t2_token_harakat where tur = 'sarf' group by amal) q),
    'royxat_oxirgi', (select coalesce(jsonb_agg(x order by (x->>'id')::bigint desc), '[]') from (
        select jsonb_build_object('id', l.id, 'vaqt', l.yaratildi, 'login', f.login, 'ism', f.ism, 'kompaniya', k.nom, 'google', f.google_sub is not null) x
          from t2_ozi_royxat_log l join t2_foydalanuvchi f on f.id = l.foydalanuvchi_id left join t2_kompaniya k on k.id = l.kompaniya_id
         order by l.id desc limit 10) q),
    'demo_obyekt', (select jsonb_build_object('id', d.obyekt_id, 'nom', o.nom) from t2_demo_manba d left join t2_obyekt o on o.id = d.obyekt_id where d.id = 1));
end $$;

-- ═══ 3. Foydalanuvchilar ═══
create or replace function public.t2_boshqaruv_foydalanuvchilar_v1(p_actor_id bigint, p_qidiruv text default null) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_q text := nullif(btrim(coalesce(p_qidiruv, '')), '');
begin
  perform public._t2_boshqaruv_tekshir(p_actor_id);
  return (select coalesce(jsonb_agg(x order by (x->>'id')::bigint desc), '[]') from (
    select jsonb_build_object('id', f.id, 'login', f.login, 'ism', f.ism, 'email', f.email, 'holat', f.holat, 'yaratildi', f.yaratildi,
        'google', f.google_sub is not null, 'parol', f.parol_hash is not null,
        'ozi_royxat', exists (select 1 from t2_ozi_royxat_log l where l.foydalanuvchi_id = f.id),
        'azoliklar', (select coalesce(jsonb_agg(jsonb_build_object('azolik_id', a.id, 'kompaniya_id', a.kompaniya_id, 'kompaniya', k.nom, 'rol', a.rol) order by a.id), '[]')
                        from t2_azolik a join t2_kompaniya k on k.id = a.kompaniya_id where a.foydalanuvchi_id = f.id and a.holat = 'faol')) x
      from t2_foydalanuvchi f
     where v_q is null or f.login ilike '%' || v_q || '%' or f.ism ilike '%' || v_q || '%' or f.email ilike '%' || v_q || '%'
     order by f.id desc limit 300) q);
end $$;

create or replace function public.t2_boshqaruv_foydalanuvchi_holat_v1(p_actor_id bigint, p_foydalanuvchi_id bigint, p_holat text, p_sabab text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_ak bigint; v_login text;
begin
  v_ak := public._t2_boshqaruv_tekshir(p_actor_id);
  if p_holat not in ('faol', 'bekor') then return jsonb_build_object('ok', false, 'code', 'HOLAT_NOTOGRI'); end if;
  if p_foydalanuvchi_id = p_actor_id then return jsonb_build_object('ok', false, 'code', 'OZINI_BLOKLASH_MUMKIN_EMAS'); end if;
  if nullif(btrim(coalesce(p_sabab, '')), '') is null then return jsonb_build_object('ok', false, 'code', 'IZOH_MAJBURIY'); end if;
  if p_holat = 'bekor' and public.t2_platforma_superadmin(p_foydalanuvchi_id)
     and (select count(distinct a.foydalanuvchi_id) from t2_azolik a join t2_foydalanuvchi f on f.id = a.foydalanuvchi_id
           where a.rol = 'superadmin' and a.holat = 'faol' and f.holat = 'faol') <= 1 then
    return jsonb_build_object('ok', false, 'code', 'OXIRGI_SUPERADMIN');
  end if;
  update t2_foydalanuvchi set holat = p_holat where id = p_foydalanuvchi_id returning login into v_login;
  if v_login is null then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
  perform public.t2_audit_yoz(v_ak, 'foydalanuvchi_' || p_holat, 'boshqaruv', null, format('login=%s sabab=%s', v_login, left(p_sabab, 200)), 'actor:' || p_actor_id, null);
  return jsonb_build_object('ok', true);
end $$;

/* A'zolik: istalgan kompaniyada rol berish/o'zgartirish yoki olib tashlash (p_rol = null). */
create or replace function public.t2_boshqaruv_azolik_v1(p_actor_id bigint, p_foydalanuvchi_id bigint, p_kompaniya_id bigint, p_rol text, p_sabab text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_ak bigint; v_eski public.t2_azolik%rowtype;
begin
  v_ak := public._t2_boshqaruv_tekshir(p_actor_id);
  if nullif(btrim(coalesce(p_sabab, '')), '') is null then return jsonb_build_object('ok', false, 'code', 'IZOH_MAJBURIY'); end if;
  if p_rol is not null and p_rol not in ('superadmin', 'admin', 'boss', 'rahbar', 'bugalter', 'pto', 'prorab', 'kuzatuvchi') then
    return jsonb_build_object('ok', false, 'code', 'ROL_NOTOGRI');
  end if;
  if not exists (select 1 from t2_foydalanuvchi where id = p_foydalanuvchi_id) or not exists (select 1 from t2_kompaniya where id = p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'code', 'TOPILMADI');
  end if;
  select * into v_eski from t2_azolik where foydalanuvchi_id = p_foydalanuvchi_id and kompaniya_id = p_kompaniya_id and holat = 'faol';
  -- Superadmin huquqini olib tashlash: o'zidan va oxirgisidan emas.
  if v_eski.rol = 'superadmin' and coalesce(p_rol, '') <> 'superadmin' then
    if p_foydalanuvchi_id = p_actor_id then return jsonb_build_object('ok', false, 'code', 'OZINI_PASAYTIRISH_MUMKIN_EMAS'); end if;
    if (select count(distinct foydalanuvchi_id) from t2_azolik where rol = 'superadmin' and holat = 'faol') <= 1 then return jsonb_build_object('ok', false, 'code', 'OXIRGI_SUPERADMIN'); end if;
  end if;
  if v_eski.id is not null then
    if p_rol is null then update t2_azolik set holat = 'bekor' where id = v_eski.id;
    else update t2_azolik set rol = p_rol where id = v_eski.id; end if;
  elsif p_rol is not null then
    insert into t2_azolik(foydalanuvchi_id, kompaniya_id, rol, holat) values (p_foydalanuvchi_id, p_kompaniya_id, p_rol, 'faol');
  end if;
  perform public.t2_audit_yoz(p_kompaniya_id, 'azolik_' || coalesce(p_rol, 'olib_tashlandi'), 'boshqaruv', null,
    format('foydalanuvchi=%s eski=%s sabab=%s', p_foydalanuvchi_id, coalesce(v_eski.rol, '-'), left(p_sabab, 200)), 'actor:' || p_actor_id, null);
  return jsonb_build_object('ok', true);
end $$;

-- ═══ 4. Kompaniyalar va obunalar ═══
create or replace function public.t2_boshqaruv_kompaniyalar_v1(p_actor_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._t2_boshqaruv_tekshir(p_actor_id);
  return (select coalesce(jsonb_agg(x order by (x->>'id')::bigint desc), '[]') from (
    select jsonb_build_object('id', k.id, 'nom', k.nom, 'kod', k.kod, 'faol', k.faol, 'inn', k.inn, 'telefon', k.telefon, 'yaratildi', k.yaratildi,
        'boss', (select string_agg(f.login, ', ') from t2_azolik a join t2_foydalanuvchi f on f.id = a.foydalanuvchi_id where a.kompaniya_id = k.id and a.holat = 'faol' and a.rol = 'boss'),
        'azolar', (select count(*) from t2_azolik a where a.kompaniya_id = k.id and a.holat = 'faol'),
        'obyektlar', (select count(*) from t2_obyekt o where o.kompaniya_id = k.id),
        'tarif', (select jsonb_build_object('kod', o.tarif_kod, 'nom', t.nom, 'tugaydi', o.tugaydi) from t2_obuna o join t2_tarif t on t.kod = o.tarif_kod
                   where o.kompaniya_id = k.id and o.holat = 'faol' order by o.id desc limit 1),
        'balans', public.t2_token_balans(k.id),
        'sarf_30', (select coalesce(-sum(miqdor), 0) from t2_token_harakat h where h.kompaniya_id = k.id and h.tur in ('sarf', 'qaytarish') and h.yaratildi > now() - interval '30 days')) x
      from t2_kompaniya k) q);
end $$;

-- ═══ 5. Token hisobi (butun platforma) ═══
create or replace function public.t2_boshqaruv_token_daftar_v1(p_actor_id bigint, p_kompaniya_id bigint default null) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._t2_boshqaruv_tekshir(p_actor_id);
  return jsonb_build_object(
    'harakatlar', (select coalesce(jsonb_agg(x order by (x->>'id')::bigint desc), '[]') from (
        select jsonb_build_object('id', h.id, 'vaqt', h.yaratildi, 'kompaniya_id', h.kompaniya_id, 'kompaniya', k.nom, 'tur', h.tur, 'amal', h.amal,
            'miqdor', h.miqdor, 'birlik_soni', h.birlik_soni, 'izoh', h.izoh, 'kim', f.login) x
          from t2_token_harakat h join t2_kompaniya k on k.id = h.kompaniya_id left join t2_foydalanuvchi f on f.id = h.foydalanuvchi_id
         where p_kompaniya_id is null or h.kompaniya_id = p_kompaniya_id
         order by h.id desc limit 300) q),
    'oylar', (select coalesce(jsonb_agg(x order by x->>'oy' desc), '[]') from (
        select jsonb_build_object('oy', to_char(date_trunc('month', yaratildi), 'YYYY-MM'),
            'berilgan', coalesce(sum(miqdor) filter (where tur in ('oylik', 'bonus')), 0),
            'sotilgan', coalesce(sum(miqdor) filter (where tur = 'toldirish'), 0),
            'sarflangan', coalesce(-sum(miqdor) filter (where tur in ('sarf', 'qaytarish')), 0)) x
          from t2_token_harakat where p_kompaniya_id is null or kompaniya_id = p_kompaniya_id
         group by date_trunc('month', yaratildi)) q));
end $$;

-- ═══ 6. Audit ═══
create or replace function public.t2_boshqaruv_audit_v1(p_actor_id bigint, p_qidiruv text default null, p_kompaniya_id bigint default null, p_oldin_id bigint default null) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_q text := nullif(btrim(coalesce(p_qidiruv, '')), '');
begin
  perform public._t2_boshqaruv_tekshir(p_actor_id);
  return (select coalesce(jsonb_agg(x order by (x->>'id')::bigint desc), '[]') from (
    select jsonb_build_object('id', a.id, 'vaqt', a.yaratilgan_vaqt, 'kompaniya_id', a.kompaniya_id, 'kompaniya', k.nom, 'obyekt_id', a.obyekt_id,
        'kim', a.kim, 'amal', a.amal_turi, 'modul', a.modul, 'tafsilot', left(a.tafsilot, 500)) x
      from t2_audit_log a left join t2_kompaniya k on k.id = a.kompaniya_id
     where (p_kompaniya_id is null or a.kompaniya_id = p_kompaniya_id)
       and (p_oldin_id is null or a.id < p_oldin_id)
       and (v_q is null or a.amal_turi ilike '%' || v_q || '%' or a.modul ilike '%' || v_q || '%' or a.tafsilot ilike '%' || v_q || '%' or a.kim ilike '%' || v_q || '%')
     order by a.id desc limit 200) q);
end $$;

-- ═══ 7. Sozlamalar: token narxlari va tariflar ═══
create or replace function public.t2_boshqaruv_narx_saqla_v1(p_actor_id bigint, p_amal text, p_narx numeric, p_birlik int, p_minimum numeric, p_faol boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_ak bigint; v_eski public.t2_token_narx%rowtype;
begin
  v_ak := public._t2_boshqaruv_tekshir(p_actor_id);
  select * into v_eski from t2_token_narx where amal = p_amal;
  if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
  if p_narx is null or p_narx < 0 or p_birlik is null or p_birlik < 1 or p_minimum is null or p_minimum < 0 then return jsonb_build_object('ok', false, 'code', 'QIYMAT_NOTOGRI'); end if;
  update t2_token_narx set narx = p_narx, birlik = p_birlik, minimum = p_minimum, faol = coalesce(p_faol, true), yangilandi = now() where amal = p_amal;
  perform public.t2_audit_yoz(v_ak, 'token_narx', 'boshqaruv', null,
    format('%s: %s/%s min %s -> %s/%s min %s faol=%s', p_amal, v_eski.narx, v_eski.birlik, v_eski.minimum, p_narx, p_birlik, p_minimum, coalesce(p_faol, true)), 'actor:' || p_actor_id, null);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.t2_boshqaruv_tarif_saqla_v1(p_actor_id bigint, p_kod text, p_nom text, p_oylik_token numeric, p_narx_som numeric, p_faol boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_ak bigint; v_eski public.t2_tarif%rowtype;
begin
  v_ak := public._t2_boshqaruv_tekshir(p_actor_id);
  if p_kod !~ '^[a-z_]{2,30}$' or length(btrim(coalesce(p_nom, ''))) < 2 or p_oylik_token is null or p_oylik_token < 0 or p_narx_som is null or p_narx_som < 0 then
    return jsonb_build_object('ok', false, 'code', 'QIYMAT_NOTOGRI');
  end if;
  select * into v_eski from t2_tarif where kod = p_kod;
  if p_kod = 'free' and coalesce(p_faol, true) is false then return jsonb_build_object('ok', false, 'code', 'BEPUL_TARIF_KERAK'); end if;
  insert into t2_tarif(kod, nom, oylik_token, narx_som, faol, tartib)
  values (p_kod, btrim(p_nom), p_oylik_token, p_narx_som, coalesce(p_faol, true), coalesce((select max(tartib) + 1 from t2_tarif), 0))
  on conflict (kod) do update set nom = excluded.nom, oylik_token = excluded.oylik_token, narx_som = excluded.narx_som, faol = excluded.faol;
  perform public.t2_audit_yoz(v_ak, 'tarif_saqla', 'boshqaruv', null,
    format('%s: %s token / %s so''m -> %s token / %s so''m faol=%s', p_kod, v_eski.oylik_token, v_eski.narx_som, p_oylik_token, p_narx_som, coalesce(p_faol, true)), 'actor:' || p_actor_id, null);
  return jsonb_build_object('ok', true);
end $$;

-- ═══ 8. Huquqlar — faqat server shlyuzi ═══
do $$
declare f text;
begin
  foreach f in array array[
    'public.t2_boshqaruv_umumiy_v1(bigint)', 'public.t2_boshqaruv_foydalanuvchilar_v1(bigint, text)',
    'public.t2_boshqaruv_foydalanuvchi_holat_v1(bigint, bigint, text, text)', 'public.t2_boshqaruv_azolik_v1(bigint, bigint, bigint, text, text)',
    'public.t2_boshqaruv_kompaniyalar_v1(bigint)', 'public.t2_boshqaruv_token_daftar_v1(bigint, bigint)',
    'public.t2_boshqaruv_audit_v1(bigint, text, bigint, bigint)', 'public.t2_boshqaruv_narx_saqla_v1(bigint, text, numeric, int, numeric, boolean)',
    'public.t2_boshqaruv_tarif_saqla_v1(bigint, text, text, numeric, numeric, boolean)']
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

commit;
 then return jsonb_build_object('ok', false, 'code', 'GOOGLE_MALUMOT_NOTOGRI'); end if;
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
  insert into public.t2_token_harakat(kompaniya_id, foydalanuvchi_id, miqdor, tur, izoh, operation_id)
  values (v_kid, v_u.id, (select oylik_token from public.t2_tarif where kod = 'free'), 'oylik', 'Bepul sinov — 1-oy', gen_random_uuid());
  select obyekt_id into v_manba from public.t2_demo_manba where id = 1;
  if v_manba is not null then v_demo := public._t2_demo_nusxa(v_kid, v_manba); end if;
  insert into public.t2_ozi_royxat_log(ip_belgi, foydalanuvchi_id, kompaniya_id, operation_id) values (p_ip_belgi, v_u.id, v_kid, p_operation_id);
  perform public.t2_audit_yoz(v_kid, 'ozi_royxat', 'kompaniya', v_demo, format('google login=%s', v_email), 'google', p_ip_belgi);
  return jsonb_build_object('ok', true, 'yangi', true, 'login', v_email, 'foydalanuvchi_id', v_u.id, 'rol', 'boss', 'demo_obyekt_id', v_demo);
end $;

-- ═══ 1. Qo'riqchi ═══
create or replace function public._t2_boshqaruv_tekshir(p_actor_id bigint) returns bigint
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_k bigint;
begin
  if p_actor_id is null or not public.t2_platforma_superadmin(p_actor_id) then raise exception 'SUPERADMIN_KERAK' using errcode = '42501'; end if;
  select kompaniya_id into v_k from public.t2_azolik where foydalanuvchi_id = p_actor_id and rol = 'superadmin' and holat = 'faol' order by id limit 1;
  return v_k; -- platforma auditlari shu kompaniyaga yoziladi
end $$;
revoke all on function public._t2_boshqaruv_tekshir(bigint) from public, anon, authenticated;

-- ═══ 2. Umumiy ko'rinish ═══
create or replace function public.t2_boshqaruv_umumiy_v1(p_actor_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._t2_boshqaruv_tekshir(p_actor_id);
  return jsonb_build_object(
    'foydalanuvchi', jsonb_build_object(
      'jami', (select count(*) from t2_foydalanuvchi), 'faol', (select count(*) from t2_foydalanuvchi where holat = 'faol'),
      'google', (select count(*) from t2_foydalanuvchi where google_sub is not null),
      'yangi_7', (select count(*) from t2_foydalanuvchi where yaratildi > now() - interval '7 days'),
      'yangi_30', (select count(*) from t2_foydalanuvchi where yaratildi > now() - interval '30 days')),
    'kompaniya', jsonb_build_object('jami', (select count(*) from t2_kompaniya), 'yangi_30', (select count(*) from t2_kompaniya where yaratildi > now() - interval '30 days')),
    'obyekt', (select count(*) from t2_obyekt),
    'smeta_qator_taxmin', (select greatest(reltuples, 0)::bigint from pg_class where oid = 'public.t2_qator'::regclass),
    'obunalar', (select coalesce(jsonb_agg(jsonb_build_object('kod', t.kod, 'nom', t.nom, 'narx_som', t.narx_som,
        'soni', (select count(*) from t2_obuna o where o.tarif_kod = t.kod and o.holat = 'faol')) order by t.tartib), '[]') from t2_tarif t),
    'oylik_tushum_som', (select coalesce(sum(t.narx_som), 0) from t2_obuna o join t2_tarif t on t.kod = o.tarif_kod where o.holat = 'faol'),
    'token', jsonb_build_object(
      'berilgan', (select coalesce(sum(miqdor), 0) from t2_token_harakat where tur in ('oylik', 'toldirish', 'bonus')),
      'sotilgan', (select coalesce(sum(miqdor), 0) from t2_token_harakat where tur = 'toldirish'),
      'sarflangan', (select coalesce(-sum(miqdor), 0) from t2_token_harakat where tur in ('sarf', 'qaytarish')),
      'sarf_30', (select coalesce(-sum(miqdor), 0) from t2_token_harakat where tur in ('sarf', 'qaytarish') and yaratildi > now() - interval '30 days'),
      'qoldiq', (select coalesce(sum(miqdor), 0) from t2_token_harakat)),
    'token_amal', (select coalesce(jsonb_agg(x order by (x->>'token')::numeric desc), '[]') from (
        select jsonb_build_object('amal', amal, 'token', -sum(miqdor), 'soni', count(*)) x from t2_token_harakat where tur = 'sarf' group by amal) q),
    'royxat_oxirgi', (select coalesce(jsonb_agg(x order by (x->>'id')::bigint desc), '[]') from (
        select jsonb_build_object('id', l.id, 'vaqt', l.yaratildi, 'login', f.login, 'ism', f.ism, 'kompaniya', k.nom, 'google', f.google_sub is not null) x
          from t2_ozi_royxat_log l join t2_foydalanuvchi f on f.id = l.foydalanuvchi_id left join t2_kompaniya k on k.id = l.kompaniya_id
         order by l.id desc limit 10) q),
    'demo_obyekt', (select jsonb_build_object('id', d.obyekt_id, 'nom', o.nom) from t2_demo_manba d left join t2_obyekt o on o.id = d.obyekt_id where d.id = 1));
end $$;

-- ═══ 3. Foydalanuvchilar ═══
create or replace function public.t2_boshqaruv_foydalanuvchilar_v1(p_actor_id bigint, p_qidiruv text default null) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_q text := nullif(btrim(coalesce(p_qidiruv, '')), '');
begin
  perform public._t2_boshqaruv_tekshir(p_actor_id);
  return (select coalesce(jsonb_agg(x order by (x->>'id')::bigint desc), '[]') from (
    select jsonb_build_object('id', f.id, 'login', f.login, 'ism', f.ism, 'email', f.email, 'holat', f.holat, 'yaratildi', f.yaratildi,
        'google', f.google_sub is not null, 'parol', f.parol_hash is not null,
        'ozi_royxat', exists (select 1 from t2_ozi_royxat_log l where l.foydalanuvchi_id = f.id),
        'azoliklar', (select coalesce(jsonb_agg(jsonb_build_object('azolik_id', a.id, 'kompaniya_id', a.kompaniya_id, 'kompaniya', k.nom, 'rol', a.rol) order by a.id), '[]')
                        from t2_azolik a join t2_kompaniya k on k.id = a.kompaniya_id where a.foydalanuvchi_id = f.id and a.holat = 'faol')) x
      from t2_foydalanuvchi f
     where v_q is null or f.login ilike '%' || v_q || '%' or f.ism ilike '%' || v_q || '%' or f.email ilike '%' || v_q || '%'
     order by f.id desc limit 300) q);
end $$;

create or replace function public.t2_boshqaruv_foydalanuvchi_holat_v1(p_actor_id bigint, p_foydalanuvchi_id bigint, p_holat text, p_sabab text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_ak bigint; v_login text;
begin
  v_ak := public._t2_boshqaruv_tekshir(p_actor_id);
  if p_holat not in ('faol', 'bekor') then return jsonb_build_object('ok', false, 'code', 'HOLAT_NOTOGRI'); end if;
  if p_foydalanuvchi_id = p_actor_id then return jsonb_build_object('ok', false, 'code', 'OZINI_BLOKLASH_MUMKIN_EMAS'); end if;
  if nullif(btrim(coalesce(p_sabab, '')), '') is null then return jsonb_build_object('ok', false, 'code', 'IZOH_MAJBURIY'); end if;
  if p_holat = 'bekor' and public.t2_platforma_superadmin(p_foydalanuvchi_id)
     and (select count(distinct a.foydalanuvchi_id) from t2_azolik a join t2_foydalanuvchi f on f.id = a.foydalanuvchi_id
           where a.rol = 'superadmin' and a.holat = 'faol' and f.holat = 'faol') <= 1 then
    return jsonb_build_object('ok', false, 'code', 'OXIRGI_SUPERADMIN');
  end if;
  update t2_foydalanuvchi set holat = p_holat where id = p_foydalanuvchi_id returning login into v_login;
  if v_login is null then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
  perform public.t2_audit_yoz(v_ak, 'foydalanuvchi_' || p_holat, 'boshqaruv', null, format('login=%s sabab=%s', v_login, left(p_sabab, 200)), 'actor:' || p_actor_id, null);
  return jsonb_build_object('ok', true);
end $$;

/* A'zolik: istalgan kompaniyada rol berish/o'zgartirish yoki olib tashlash (p_rol = null). */
create or replace function public.t2_boshqaruv_azolik_v1(p_actor_id bigint, p_foydalanuvchi_id bigint, p_kompaniya_id bigint, p_rol text, p_sabab text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_ak bigint; v_eski public.t2_azolik%rowtype;
begin
  v_ak := public._t2_boshqaruv_tekshir(p_actor_id);
  if nullif(btrim(coalesce(p_sabab, '')), '') is null then return jsonb_build_object('ok', false, 'code', 'IZOH_MAJBURIY'); end if;
  if p_rol is not null and p_rol not in ('superadmin', 'admin', 'boss', 'rahbar', 'bugalter', 'pto', 'prorab', 'kuzatuvchi') then
    return jsonb_build_object('ok', false, 'code', 'ROL_NOTOGRI');
  end if;
  if not exists (select 1 from t2_foydalanuvchi where id = p_foydalanuvchi_id) or not exists (select 1 from t2_kompaniya where id = p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'code', 'TOPILMADI');
  end if;
  select * into v_eski from t2_azolik where foydalanuvchi_id = p_foydalanuvchi_id and kompaniya_id = p_kompaniya_id and holat = 'faol';
  -- Superadmin huquqini olib tashlash: o'zidan va oxirgisidan emas.
  if v_eski.rol = 'superadmin' and coalesce(p_rol, '') <> 'superadmin' then
    if p_foydalanuvchi_id = p_actor_id then return jsonb_build_object('ok', false, 'code', 'OZINI_PASAYTIRISH_MUMKIN_EMAS'); end if;
    if (select count(distinct foydalanuvchi_id) from t2_azolik where rol = 'superadmin' and holat = 'faol') <= 1 then return jsonb_build_object('ok', false, 'code', 'OXIRGI_SUPERADMIN'); end if;
  end if;
  if v_eski.id is not null then
    if p_rol is null then update t2_azolik set holat = 'bekor' where id = v_eski.id;
    else update t2_azolik set rol = p_rol where id = v_eski.id; end if;
  elsif p_rol is not null then
    insert into t2_azolik(foydalanuvchi_id, kompaniya_id, rol, holat) values (p_foydalanuvchi_id, p_kompaniya_id, p_rol, 'faol');
  end if;
  perform public.t2_audit_yoz(p_kompaniya_id, 'azolik_' || coalesce(p_rol, 'olib_tashlandi'), 'boshqaruv', null,
    format('foydalanuvchi=%s eski=%s sabab=%s', p_foydalanuvchi_id, coalesce(v_eski.rol, '-'), left(p_sabab, 200)), 'actor:' || p_actor_id, null);
  return jsonb_build_object('ok', true);
end $$;

-- ═══ 4. Kompaniyalar va obunalar ═══
create or replace function public.t2_boshqaruv_kompaniyalar_v1(p_actor_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._t2_boshqaruv_tekshir(p_actor_id);
  return (select coalesce(jsonb_agg(x order by (x->>'id')::bigint desc), '[]') from (
    select jsonb_build_object('id', k.id, 'nom', k.nom, 'kod', k.kod, 'faol', k.faol, 'inn', k.inn, 'telefon', k.telefon, 'yaratildi', k.yaratildi,
        'boss', (select string_agg(f.login, ', ') from t2_azolik a join t2_foydalanuvchi f on f.id = a.foydalanuvchi_id where a.kompaniya_id = k.id and a.holat = 'faol' and a.rol = 'boss'),
        'azolar', (select count(*) from t2_azolik a where a.kompaniya_id = k.id and a.holat = 'faol'),
        'obyektlar', (select count(*) from t2_obyekt o where o.kompaniya_id = k.id),
        'tarif', (select jsonb_build_object('kod', o.tarif_kod, 'nom', t.nom, 'tugaydi', o.tugaydi) from t2_obuna o join t2_tarif t on t.kod = o.tarif_kod
                   where o.kompaniya_id = k.id and o.holat = 'faol' order by o.id desc limit 1),
        'balans', public.t2_token_balans(k.id),
        'sarf_30', (select coalesce(-sum(miqdor), 0) from t2_token_harakat h where h.kompaniya_id = k.id and h.tur in ('sarf', 'qaytarish') and h.yaratildi > now() - interval '30 days')) x
      from t2_kompaniya k) q);
end $$;

-- ═══ 5. Token hisobi (butun platforma) ═══
create or replace function public.t2_boshqaruv_token_daftar_v1(p_actor_id bigint, p_kompaniya_id bigint default null) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._t2_boshqaruv_tekshir(p_actor_id);
  return jsonb_build_object(
    'harakatlar', (select coalesce(jsonb_agg(x order by (x->>'id')::bigint desc), '[]') from (
        select jsonb_build_object('id', h.id, 'vaqt', h.yaratildi, 'kompaniya_id', h.kompaniya_id, 'kompaniya', k.nom, 'tur', h.tur, 'amal', h.amal,
            'miqdor', h.miqdor, 'birlik_soni', h.birlik_soni, 'izoh', h.izoh, 'kim', f.login) x
          from t2_token_harakat h join t2_kompaniya k on k.id = h.kompaniya_id left join t2_foydalanuvchi f on f.id = h.foydalanuvchi_id
         where p_kompaniya_id is null or h.kompaniya_id = p_kompaniya_id
         order by h.id desc limit 300) q),
    'oylar', (select coalesce(jsonb_agg(x order by x->>'oy' desc), '[]') from (
        select jsonb_build_object('oy', to_char(date_trunc('month', yaratildi), 'YYYY-MM'),
            'berilgan', coalesce(sum(miqdor) filter (where tur in ('oylik', 'bonus')), 0),
            'sotilgan', coalesce(sum(miqdor) filter (where tur = 'toldirish'), 0),
            'sarflangan', coalesce(-sum(miqdor) filter (where tur in ('sarf', 'qaytarish')), 0)) x
          from t2_token_harakat where p_kompaniya_id is null or kompaniya_id = p_kompaniya_id
         group by date_trunc('month', yaratildi)) q));
end $$;

-- ═══ 6. Audit ═══
create or replace function public.t2_boshqaruv_audit_v1(p_actor_id bigint, p_qidiruv text default null, p_kompaniya_id bigint default null, p_oldin_id bigint default null) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_q text := nullif(btrim(coalesce(p_qidiruv, '')), '');
begin
  perform public._t2_boshqaruv_tekshir(p_actor_id);
  return (select coalesce(jsonb_agg(x order by (x->>'id')::bigint desc), '[]') from (
    select jsonb_build_object('id', a.id, 'vaqt', a.yaratilgan_vaqt, 'kompaniya_id', a.kompaniya_id, 'kompaniya', k.nom, 'obyekt_id', a.obyekt_id,
        'kim', a.kim, 'amal', a.amal_turi, 'modul', a.modul, 'tafsilot', left(a.tafsilot, 500)) x
      from t2_audit_log a left join t2_kompaniya k on k.id = a.kompaniya_id
     where (p_kompaniya_id is null or a.kompaniya_id = p_kompaniya_id)
       and (p_oldin_id is null or a.id < p_oldin_id)
       and (v_q is null or a.amal_turi ilike '%' || v_q || '%' or a.modul ilike '%' || v_q || '%' or a.tafsilot ilike '%' || v_q || '%' or a.kim ilike '%' || v_q || '%')
     order by a.id desc limit 200) q);
end $$;

-- ═══ 7. Sozlamalar: token narxlari va tariflar ═══
create or replace function public.t2_boshqaruv_narx_saqla_v1(p_actor_id bigint, p_amal text, p_narx numeric, p_birlik int, p_minimum numeric, p_faol boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_ak bigint; v_eski public.t2_token_narx%rowtype;
begin
  v_ak := public._t2_boshqaruv_tekshir(p_actor_id);
  select * into v_eski from t2_token_narx where amal = p_amal;
  if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
  if p_narx is null or p_narx < 0 or p_birlik is null or p_birlik < 1 or p_minimum is null or p_minimum < 0 then return jsonb_build_object('ok', false, 'code', 'QIYMAT_NOTOGRI'); end if;
  update t2_token_narx set narx = p_narx, birlik = p_birlik, minimum = p_minimum, faol = coalesce(p_faol, true), yangilandi = now() where amal = p_amal;
  perform public.t2_audit_yoz(v_ak, 'token_narx', 'boshqaruv', null,
    format('%s: %s/%s min %s -> %s/%s min %s faol=%s', p_amal, v_eski.narx, v_eski.birlik, v_eski.minimum, p_narx, p_birlik, p_minimum, coalesce(p_faol, true)), 'actor:' || p_actor_id, null);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.t2_boshqaruv_tarif_saqla_v1(p_actor_id bigint, p_kod text, p_nom text, p_oylik_token numeric, p_narx_som numeric, p_faol boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_ak bigint; v_eski public.t2_tarif%rowtype;
begin
  v_ak := public._t2_boshqaruv_tekshir(p_actor_id);
  if p_kod !~ '^[a-z_]{2,30}$' or length(btrim(coalesce(p_nom, ''))) < 2 or p_oylik_token is null or p_oylik_token < 0 or p_narx_som is null or p_narx_som < 0 then
    return jsonb_build_object('ok', false, 'code', 'QIYMAT_NOTOGRI');
  end if;
  select * into v_eski from t2_tarif where kod = p_kod;
  if p_kod = 'free' and coalesce(p_faol, true) is false then return jsonb_build_object('ok', false, 'code', 'BEPUL_TARIF_KERAK'); end if;
  insert into t2_tarif(kod, nom, oylik_token, narx_som, faol, tartib)
  values (p_kod, btrim(p_nom), p_oylik_token, p_narx_som, coalesce(p_faol, true), coalesce((select max(tartib) + 1 from t2_tarif), 0))
  on conflict (kod) do update set nom = excluded.nom, oylik_token = excluded.oylik_token, narx_som = excluded.narx_som, faol = excluded.faol;
  perform public.t2_audit_yoz(v_ak, 'tarif_saqla', 'boshqaruv', null,
    format('%s: %s token / %s so''m -> %s token / %s so''m faol=%s', p_kod, v_eski.oylik_token, v_eski.narx_som, p_oylik_token, p_narx_som, coalesce(p_faol, true)), 'actor:' || p_actor_id, null);
  return jsonb_build_object('ok', true);
end $$;

-- ═══ 8. Huquqlar — faqat server shlyuzi ═══
do $$
declare f text;
begin
  foreach f in array array[
    'public.t2_boshqaruv_umumiy_v1(bigint)', 'public.t2_boshqaruv_foydalanuvchilar_v1(bigint, text)',
    'public.t2_boshqaruv_foydalanuvchi_holat_v1(bigint, bigint, text, text)', 'public.t2_boshqaruv_azolik_v1(bigint, bigint, bigint, text, text)',
    'public.t2_boshqaruv_kompaniyalar_v1(bigint)', 'public.t2_boshqaruv_token_daftar_v1(bigint, bigint)',
    'public.t2_boshqaruv_audit_v1(bigint, text, bigint, bigint)', 'public.t2_boshqaruv_narx_saqla_v1(bigint, text, numeric, int, numeric, boolean)',
    'public.t2_boshqaruv_tarif_saqla_v1(bigint, text, text, numeric, numeric, boolean)']
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

commit;
