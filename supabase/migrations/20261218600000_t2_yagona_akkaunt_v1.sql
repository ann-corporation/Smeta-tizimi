-- T2-YAGONA-AKKAUNT-V1 (2026-11-13): BITTA ODAM = BITTA AKKAUNT, unga bir necha KIRISH USULI (parol, email, google, telegram, telefon).
-- Muammo: email-kod, Google va Telegram bilan kirgan odam 3 ta alohida t2_foydalanuvchi oladi; parolsiz hisoblarni birlashtirish yo'li yo'q edi
-- (t2_hisob_birlashtir_v1 faqat parol bilan). Bu migratsiya additiv; mavjud ustunlar (login, email, google_sub, telefon_e164, parol_hash, telegram ulanish)
-- O'ZGARMAYDI va manba bo'lib qoladi — t2_kirish_usul ulardan TRIGGER orqali sinxron saqlanadi (manba='ustun'); birlashtirishdan ko'chgan qatorlar manba='birlashtirish'.
-- BEGIN/COMMIT yo'q. Faqat service_role. t2_qator o'quvchisi YO'Q (versiya: texnik).
--
-- Qoidalar: (a) usul identifikatori ulangan bo'lsa — o'sha akkaunt; (b) Google/email-kod provayder TASDIQLAGAN email mavjud hisob email/login'iga teng bo'lsa — o'shanga ulanadi
-- (t2_google_kirish_v1 avvaldan shunday; endi email_tasdiqlandi_at ham belgilanadi, ulanish haqida `ulandi` belgisi qaytadi); (c) Telegram tasdiqlangan kontakt telefoni = mavjud hisobning
-- TASDIQLANGAN (telefon_manba='telegram') telefoni bo'lsa — ulanadi; admin kiritgan (tasdiqlanmagan) telefon bo'yicha AVTO-ULANMAYDI → TELEFON_HISOB_BOR; (d) aks holda yangi akkaunt.
-- Tasdiqlanmagan identifikator bo'yicha jim birlashtirilmaydi. Birlashtirish: ikkala hisobga egalik isboti (joriy sessiya + ikkinchisi: parol/email-kod/Google — shlyuz tasdiqlaydi).
-- Token/balans kompaniyaga tegishli (t2_token_harakat.foydalanuvchi_id — faqat muallif belgisi) — shaxsiy balans YO'Q, ko'chirilmaydi. Tarixiy yozuvlardagi muallif id lari O'ZGARMAYDI.
set local statement_timeout = '300s';

create table if not exists public.t2_kirish_usul (
  id bigserial primary key,
  foydalanuvchi_id bigint not null references public.t2_foydalanuvchi(id) on delete cascade,
  tur text not null check (tur in ('parol', 'email', 'google', 'telegram', 'telefon')),
  tashqi_id text not null,
  tasdiqlangan boolean not null default false,
  manba text not null default 'ustun' check (manba in ('ustun', 'birlashtirish')),
  ulangan_at timestamptz not null default now(),
  oxirgi_kirish_at timestamptz,
  unique (tur, tashqi_id)
);
create index if not exists t2_kirish_usul_foyd_idx on public.t2_kirish_usul (foydalanuvchi_id);
alter table public.t2_kirish_usul enable row level security;
revoke all on public.t2_kirish_usul from public, anon, authenticated;
revoke all on sequence public.t2_kirish_usul_id_seq from public, anon, authenticated;

-- ───────── sinxronlash: ustunlar → t2_kirish_usul (faqat FAOL hisob; birlashtirilganning qatorlari asosiyga ko'chirilgan) ─────────
create or replace function public._t2_usul_want_v1(p_uid bigint) returns table(tur text, tashqi text, tasdiq boolean)
language sql stable security definer set search_path = public, pg_temp as $f$
  select 'parol'::text, lower(u.login), true from public.t2_foydalanuvchi u where u.id = p_uid and u.holat = 'faol' and u.parol_hash is not null
  union all select 'email', lower(btrim(u.email)), u.email_tasdiqlandi_at is not null from public.t2_foydalanuvchi u where u.id = p_uid and u.holat = 'faol' and coalesce(btrim(u.email), '') <> ''
  union all select 'google', u.google_sub, true from public.t2_foydalanuvchi u where u.id = p_uid and u.holat = 'faol' and u.google_sub is not null
  union all select 'telefon', u.telefon_e164, coalesce(u.telefon_tasdiqlangan, false) from public.t2_foydalanuvchi u where u.id = p_uid and u.holat = 'faol' and u.telefon_e164 is not null
  union all select 'telegram', t.telegram_user_id::text, true from public.t2_telegram_ulanish t join public.t2_foydalanuvchi u on u.id = t.foydalanuvchi_id
    where t.foydalanuvchi_id = p_uid and t.holat = 'faol' and u.holat = 'faol';
$f$;

create or replace function public._t2_usul_sinxron_v1(p_uid bigint) returns void
language plpgsql security definer set search_path = public, pg_temp as $f$
begin
  if not exists (select 1 from public.t2_foydalanuvchi where id = p_uid and holat = 'faol') then return; end if;
  delete from public.t2_kirish_usul k where k.foydalanuvchi_id = p_uid and k.manba = 'ustun'
    and not exists (select 1 from public._t2_usul_want_v1(p_uid) w where w.tur = k.tur and w.tashqi = k.tashqi_id);
  insert into public.t2_kirish_usul (foydalanuvchi_id, tur, tashqi_id, tasdiqlangan)
    select p_uid, w.tur, w.tashqi, w.tasdiq from public._t2_usul_want_v1(p_uid) w
  on conflict (tur, tashqi_id) do update set tasdiqlangan = excluded.tasdiqlangan
    where public.t2_kirish_usul.foydalanuvchi_id = p_uid;
end $f$;
create or replace function public._t2_usul_trg_foyd_v1() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $f$
begin perform public._t2_usul_sinxron_v1(new.id); return null; end $f$;
create or replace function public._t2_usul_trg_tg_v1() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $f$
begin
  perform public._t2_usul_sinxron_v1(new.foydalanuvchi_id);
  if tg_op = 'UPDATE' and old.foydalanuvchi_id is distinct from new.foydalanuvchi_id then perform public._t2_usul_sinxron_v1(old.foydalanuvchi_id); end if;
  return null;
end $f$;
drop trigger if exists t2_usul_sinxron_foyd on public.t2_foydalanuvchi;
create trigger t2_usul_sinxron_foyd after insert or update of login, email, email_tasdiqlandi_at, google_sub, parol_hash, telefon_e164, telefon_tasdiqlangan, holat
  on public.t2_foydalanuvchi for each row execute function public._t2_usul_trg_foyd_v1();
drop trigger if exists t2_usul_sinxron_tg on public.t2_telegram_ulanish;
create trigger t2_usul_sinxron_tg after insert or update of holat, foydalanuvchi_id, telegram_user_id
  on public.t2_telegram_ulanish for each row execute function public._t2_usul_trg_tg_v1();

select public._t2_usul_sinxron_v1(id) from public.t2_foydalanuvchi where holat = 'faol';

-- ───────── rol darajasi (birlashtirishda to'qnashuv: yuqori daraja qoladi) ─────────
create or replace function public._t2_rol_daraja_v1(p_rol text) returns integer
language sql immutable set search_path = public, pg_temp as $f$
  select case p_rol when 'superadmin' then 100 when 'boss' then 90 when 'admin' then 80 when 'rahbar' then 70
    when 'pto' then 50 when 'prorab' then 50 when 'bugalter' then 50 when 'kadr' then 40 when 'taminotchi' then 40 when 'loyihachi' then 40
    when 'omborchi' then 30 when 'mexanik' then 30 when 'inspektor' then 30 when 'sotuvchi' then 30 when 'buyurtmachi' then 30 when 'pudratchi' then 30
    when 'brigadir' then 20 when 'usta' then 15 when 'haydovchi' then 15 else 10 end;
$f$;

-- ───────── ikkinchi hisobga egalik isboti (shlyuz provayderni tekshirgach chaqiradi; sessiya BERMAYDI) ─────────
create or replace function public.t2_email_kod_dokaz_v1(p_tasdiqlash_id uuid, p_kod_xesh text, p_email text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $f$
declare v public.t2_royxat_email_tasdiq%rowtype; v_email text := lower(btrim(coalesce(p_email, ''))); v_id bigint; v_final bigint;
begin
  select * into v from public.t2_royxat_email_tasdiq where id = p_tasdiqlash_id for update;
  if not found or v.maqsad <> 'kirish' or v.bekor_qilindi_at is not null or v.yuborildi_at is null or v.ishlatildi_at is not null or v.tugaydi <= now() or v.urinishlar >= 5 or v.email <> v_email then
    return jsonb_build_object('ok', false, 'code', 'KOD_YAROQSIZ');
  end if;
  if v.kod_xesh <> coalesce(p_kod_xesh, '') then
    update public.t2_royxat_email_tasdiq set urinishlar = urinishlar + 1 where id = v.id;
    return jsonb_build_object('ok', false, 'code', 'KOD_YAROQSIZ');
  end if;
  update public.t2_royxat_email_tasdiq set ishlatildi_at = now() where id = v.id;
  select id into v_id from public.t2_foydalanuvchi where lower(email) = v_email or lower(login) = v_email order by (holat = 'faol') desc, id limit 1;
  if v_id is null then return jsonb_build_object('ok', false, 'code', 'HISOB_YOQ'); end if;
  v_final := public._t2_hisob_oxirgi(v_id);
  if v_final is null then return jsonb_build_object('ok', false, 'code', 'HISOB_YOQ'); end if;
  return jsonb_build_object('ok', true, 'foydalanuvchi_id', v_final);
end $f$;

create or replace function public.t2_google_dokaz_v1(p_email text, p_sub text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $f$
declare v_email text := lower(btrim(coalesce(p_email, ''))); v_id bigint; v_final bigint;
begin
  if coalesce(btrim(p_sub), '') = '' or v_email = '' then return jsonb_build_object('ok', false, 'code', 'GOOGLE_MALUMOT_NOTOGRI'); end if;
  select id into v_id from public.t2_foydalanuvchi where google_sub = p_sub;
  if v_id is null then select id into v_id from public.t2_foydalanuvchi where lower(email) = v_email or lower(login) = v_email order by (holat = 'faol') desc, id limit 1; end if;
  if v_id is null then return jsonb_build_object('ok', false, 'code', 'HISOB_YOQ'); end if;
  v_final := public._t2_hisob_oxirgi(v_id);
  if v_final is null then return jsonb_build_object('ok', false, 'code', 'HISOB_YOQ'); end if;
  return jsonb_build_object('ok', true, 'foydalanuvchi_id', v_final);
end $f$;

-- ───────── AKKAUNTLARNI BIRLASHTIRISH (v2): actor = sessiyadagi asosiy hisob; p_boshqa_id = isbot bilan tasdiqlangan ikkinchi hisob ─────────
create or replace function public.t2_hisob_birlashtir_v2(p_actor_id bigint, p_boshqa_id bigint, p_dokaz text, p_operation_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $f$
declare
  v_prev public.t2_onboarding_command_log%rowtype; v_a public.t2_foydalanuvchi%rowtype; v_o public.t2_foydalanuvchi%rowtype;
  v_r public.t2_azolik%rowtype; v_ex public.t2_azolik%rowtype; v_koch jsonb := '[]'::jsonb; v_qolgan jsonb := '[]'::jsonb; v_boshqa jsonb := '{}'::jsonb; v_res jsonb;
  v_spec text; v_t text; v_c text; v_k text; v_q text; v_n bigint; v_sa boolean; v_so boolean; v_tg public.t2_telegram_ulanish%rowtype; v_atg boolean;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select * into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then
    if v_prev.actor_id <> p_actor_id or v_prev.command <> 'hisob_birlashtir_v2' then return jsonb_build_object('ok', false, 'code', 'OPERATION_CONFLICT'); end if;
    return (v_prev.natija - 'request') || '{"takror":true}'::jsonb;
  end if;
  -- ISBOT turi: aniq oq ro'yxat (email-kod | google | telegram — shlyuz har birini serverda tekshirgach; parol isboti eski v1 orqali); null/bo'sh/noma'lum — rad (NULL NOT IN (...) NULL beradi, shuning uchun is null alohida). Hech narsa yozilmaydi.
  if p_dokaz is null or p_dokaz not in ('email', 'google', 'telegram') then return jsonb_build_object('ok', false, 'code', 'DOKAZ_NOTOGRI'); end if;
  if p_actor_id is null or p_actor_id <= 0 or p_boshqa_id is null or p_boshqa_id <= 0 then return jsonb_build_object('ok', false, 'code', 'ACTOR_NOT_FOUND'); end if;
  if p_actor_id = p_boshqa_id then return jsonb_build_object('ok', false, 'code', 'OZI'); end if;
  perform 1 from public.t2_foydalanuvchi where id in (p_actor_id, p_boshqa_id) order by id for update;
  select * into v_a from public.t2_foydalanuvchi where id = p_actor_id and holat = 'faol';
  if not found then return jsonb_build_object('ok', false, 'code', 'ACTOR_NOT_FOUND'); end if;
  select * into v_o from public.t2_foydalanuvchi where id = p_boshqa_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'HISOB_YOQ'); end if;
  if v_o.holat = 'birlashtirildi' and v_o.birlashgan_id = p_actor_id then return jsonb_build_object('ok', true, 'allaqachon', true, 'birlashtirilgan_id', p_boshqa_id, 'kochirilgan_kompaniyalar', '[]'::jsonb, 'qolgan_rollar', '[]'::jsonb); end if;
  if v_o.holat is distinct from 'faol' then return jsonb_build_object('ok', false, 'code', 'HISOB_YOQ'); end if;
  -- superadmin belgisi: faqat IKKALASI yoki HECH BIRI platforma superadmini bo'lsa (belgi yo'qolmaydi ham, yangi paydo ham bo'lmaydi).
  v_sa := public.t2_platforma_superadmin(p_actor_id); v_so := public.t2_platforma_superadmin(p_boshqa_id);
  if v_sa is distinct from v_so then return jsonb_build_object('ok', false, 'code', 'SUPERADMIN_FARQI', 'xato', 'Platforma superadmini belgisi bitta hisobda — bunday hisoblarni platforma administratori qo''lda birlashtiradi.'); end if;

  for v_r in select * from public.t2_azolik where foydalanuvchi_id = p_boshqa_id and holat = 'faol' order by id loop
    select * into v_ex from public.t2_azolik where foydalanuvchi_id = p_actor_id and kompaniya_id = v_r.kompaniya_id order by (holat = 'faol') desc, id limit 1;
    if not found then
      update public.t2_azolik set foydalanuvchi_id = p_actor_id where id = v_r.id;
      v_koch := v_koch || jsonb_build_object('kompaniya_id', v_r.kompaniya_id, 'rol', v_r.rol);
    elsif v_ex.holat = 'faol' then
      if public._t2_rol_daraja_v1(v_r.rol) > public._t2_rol_daraja_v1(v_ex.rol) then
        update public.t2_azolik set rol = v_r.rol, ruxsat_versiya = coalesce(ruxsat_versiya, 0) + 1 where id = v_ex.id;
        v_koch := v_koch || jsonb_build_object('kompaniya_id', v_r.kompaniya_id, 'rol', v_r.rol);
      else
        v_qolgan := v_qolgan || jsonb_build_object('kompaniya_id', v_r.kompaniya_id, 'rol', v_ex.rol);
      end if;
      update public.t2_azolik set holat = 'bekor' where id = v_r.id;
      insert into public.t2_azolik_ruxsat_qoshimcha (azolik_id, ruxsat, berdi_actor_id, berilgan)
        select v_ex.id, q.ruxsat, q.berdi_actor_id, coalesce(q.berilgan, true) from public.t2_azolik_ruxsat_qoshimcha q where q.azolik_id = v_r.id
      on conflict (azolik_id, ruxsat) do update set berilgan = (coalesce(public.t2_azolik_ruxsat_qoshimcha.berilgan, true) or excluded.berilgan);
      update public.t2_azolik set ruxsat_versiya = coalesce(ruxsat_versiya, 0) + 1 where id = v_ex.id;
    else
      update public.t2_azolik set holat = 'faol', rol = v_r.rol where id = v_ex.id;
      insert into public.t2_azolik_ruxsat_qoshimcha (azolik_id, ruxsat, berdi_actor_id, berilgan)
        select v_ex.id, q.ruxsat, q.berdi_actor_id, coalesce(q.berilgan, true) from public.t2_azolik_ruxsat_qoshimcha q where q.azolik_id = v_r.id
      on conflict (azolik_id, ruxsat) do update set berilgan = (coalesce(public.t2_azolik_ruxsat_qoshimcha.berilgan, true) or excluded.berilgan);
      update public.t2_azolik set ruxsat_versiya = coalesce(ruxsat_versiya, 0) + 1 where id = v_ex.id;
      update public.t2_azolik set holat = 'bekor' where id = v_r.id;
      v_koch := v_koch || jsonb_build_object('kompaniya_id', v_r.kompaniya_id, 'rol', v_r.rol);
    end if;
  end loop;

  foreach v_spec in array array[
    't2_loyiha_foydalanuvchi_ruxsat|foydalanuvchi_id|loyiha_id', 't2_obyekt_foydalanuvchi_ruxsat|foydalanuvchi_id|obyekt_id', 't2_shaxs_yonalish|foydalanuvchi_id|yonalish',
    't2_mutaxassis_profil|foydalanuvchi_id|*', 't2_bildirishnoma|foydalanuvchi_id|outbox_id', 't2_kadr_mustaqil|foydalanuvchi_id|', 't2_topshiriq|ijrochi_foydalanuvchi_id|'
  ] loop
    v_t := split_part(v_spec, '|', 1); v_c := split_part(v_spec, '|', 2); v_k := split_part(v_spec, '|', 3);
    if to_regclass('public.' || v_t) is null then continue; end if;
    if v_k = '' then v_q := format('update public.%I set %I = $1 where %I = $2', v_t, v_c, v_c);
    elsif v_k = '*' then v_q := format('update public.%I set %I = $1 where %I = $2 and not exists (select 1 from public.%I y where y.%I = $1)', v_t, v_c, v_c, v_t, v_c);
    else v_q := format('update public.%I x set %I = $1 where x.%I = $2 and not exists (select 1 from public.%I y where y.%I = $1 and y.%I is not distinct from x.%I)', v_t, v_c, v_c, v_t, v_c, v_k, v_k);
    end if;
    execute v_q using p_actor_id, p_boshqa_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_boshqa := v_boshqa || jsonb_build_object(v_t, v_n); end if;
  end loop;

  -- kirish usullari: asosiyda yo'q bo'lsa — ko'chadi; bor bo'lsa — ikkinchisiniki asosiyga YO'NALTIRILADI (birlashgan_id orqali)
  if coalesce(btrim(v_a.email), '') = '' and coalesce(btrim(v_o.email), '') <> '' then
    update public.t2_foydalanuvchi set email = v_o.email, email_tasdiqlandi_at = case when p_dokaz in ('email', 'google') then coalesce(v_o.email_tasdiqlandi_at, now()) else v_o.email_tasdiqlandi_at end where id = p_actor_id;
  end if;
  if v_a.google_sub is null and v_o.google_sub is not null then
    update public.t2_foydalanuvchi set google_sub = null where id = p_boshqa_id;
    update public.t2_foydalanuvchi set google_sub = v_o.google_sub where id = p_actor_id;
  end if;
  if v_a.telefon_e164 is null and v_o.telefon_e164 is not null then
    update public.t2_foydalanuvchi set telefon_e164 = null, telefon_manba = null, telefon_tasdiqlangan = false where id = p_boshqa_id;
    update public.t2_foydalanuvchi set telefon_e164 = v_o.telefon_e164, telefon_manba = v_o.telefon_manba, telefon_tasdiqlangan = coalesce(v_o.telefon_tasdiqlangan, false) where id = p_actor_id;
  end if;
  select * into v_tg from public.t2_telegram_ulanish where foydalanuvchi_id = p_boshqa_id and holat = 'faol';
  if found then
    v_atg := exists (select 1 from public.t2_telegram_ulanish where foydalanuvchi_id = p_actor_id and holat = 'faol');
    if v_atg then update public.t2_telegram_ulanish set holat = 'uzildi', uzildi_at = now(), uzish_manba = 'almashtirildi' where id = v_tg.id;
    else update public.t2_telegram_ulanish set foydalanuvchi_id = p_actor_id where id = v_tg.id; end if;
  end if;

  update public.t2_foydalanuvchi set holat = 'birlashtirildi', birlashgan_id = p_actor_id, sessiya_bekor_dan = now() where id = p_boshqa_id;
  update public.t2_kirish_usul set foydalanuvchi_id = p_actor_id, manba = 'birlashtirish' where foydalanuvchi_id = p_boshqa_id;
  perform public._t2_usul_sinxron_v1(p_actor_id);
  perform public._t2_profil_audit(p_actor_id, 'hisob_birlashtir_v2', format('hisob %s birlashtirildi (dokaz=%s); kochirilgan=%s; qolgan=%s', p_boshqa_id, p_dokaz, jsonb_array_length(v_koch), jsonb_array_length(v_qolgan)));
  v_res := jsonb_build_object('ok', true, 'birlashtirilgan_id', p_boshqa_id, 'kochirilgan_kompaniyalar', v_koch, 'qolgan_rollar', v_qolgan, 'boshqa_jadvallar', v_boshqa);
  insert into public.t2_onboarding_command_log (operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'hisob_birlashtir_v2', v_res);
  return v_res;
end $f$;

-- ───────── kirish usullari ro'yxati (niqoblangan) va uzish ─────────
create or replace function public.t2_kirish_usullari_v1(p_actor_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $f$
begin
  if p_actor_id is null or not exists (select 1 from public.t2_foydalanuvchi where id = p_actor_id and holat = 'faol') then return jsonb_build_object('ok', false, 'code', 'ACTOR_NOT_FOUND'); end if;
  return jsonb_build_object('ok', true, 'usullar', coalesce((select jsonb_agg(jsonb_build_object(
      'id', k.id, 'tur', k.tur, 'tasdiqlangan', k.tasdiqlangan, 'ulangan_at', k.ulangan_at, 'oxirgi_kirish_at', k.oxirgi_kirish_at, 'manba', k.manba,
      'niqob', case k.tur when 'email' then left(split_part(k.tashqi_id, '@', 1), 1) || '***@' || split_part(k.tashqi_id, '@', 2)
                          when 'telefon' then left(k.tashqi_id, 4) || ' ** *** ' || right(k.tashqi_id, 4)
                          when 'telegram' then '••••' || right(k.tashqi_id, 3)
                          when 'google' then 'Google'
                          else left(k.tashqi_id, 1) || '***' end) order by k.id)
    from public.t2_kirish_usul k where k.foydalanuvchi_id = p_actor_id), '[]'::jsonb));
end $f$;

create or replace function public.t2_usul_uz_v1(p_actor_id bigint, p_usul_id bigint, p_operation_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $f$
declare v_k public.t2_kirish_usul%rowtype; v_u public.t2_foydalanuvchi%rowtype; v_qoldi integer; v_prev public.t2_onboarding_command_log%rowtype;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select * into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then
    if v_prev.actor_id <> p_actor_id or v_prev.command <> 'usul_uz' then return jsonb_build_object('ok', false, 'code', 'OPERATION_CONFLICT'); end if;
    return v_prev.natija || '{"takror":true}'::jsonb;
  end if;
  select * into v_u from public.t2_foydalanuvchi where id = p_actor_id and holat = 'faol' for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'ACTOR_NOT_FOUND'); end if;
  select * into v_k from public.t2_kirish_usul where id = p_usul_id and foydalanuvchi_id = p_actor_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'USUL_TOPILMADI'); end if;
  if v_k.tur = 'email' and lower(v_u.login) = v_k.tashqi_id then return jsonb_build_object('ok', false, 'code', 'EMAIL_LOGIN'); end if;
  if v_k.manba = 'birlashtirish' then
    -- birlashtirilgan ikkinchi hisobning usuli: uzish = o'sha hisob ustunini tozalash emas, balki ko'rsatkichni olib tashlash mumkin emas
    return jsonb_build_object('ok', false, 'code', 'USUL_BIRLASHTIRILGAN');
  end if;
  select count(*) into v_qoldi from public.t2_kirish_usul k where k.foydalanuvchi_id = p_actor_id and k.id <> v_k.id
    and (k.tur in ('parol', 'google', 'telegram') or (k.tur in ('email', 'telefon') and k.tasdiqlangan));
  if v_qoldi < 1 then return jsonb_build_object('ok', false, 'code', 'OXIRGI_USUL', 'xato', 'Oxirgi kirish usulini uzib bo''lmaydi.'); end if;
  if v_k.tur = 'google' then update public.t2_foydalanuvchi set google_sub = null where id = p_actor_id;
  elsif v_k.tur = 'parol' then update public.t2_foydalanuvchi set parol_hash = null where id = p_actor_id;
  elsif v_k.tur = 'telegram' then update public.t2_telegram_ulanish set holat = 'uzildi', uzildi_at = now(), uzish_manba = 'web' where foydalanuvchi_id = p_actor_id and holat = 'faol';
  elsif v_k.tur = 'telefon' then update public.t2_foydalanuvchi set telefon_e164 = null, telefon_manba = null, telefon_tasdiqlangan = false where id = p_actor_id;
  elsif v_k.tur = 'email' then update public.t2_foydalanuvchi set email = null, email_tasdiqlandi_at = null where id = p_actor_id;
  end if;
  perform public._t2_usul_sinxron_v1(p_actor_id);
  perform public._t2_profil_audit(p_actor_id, 'usul_uz', 'tur=' || v_k.tur);
  insert into public.t2_onboarding_command_log (operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'usul_uz', jsonb_build_object('ok', true, 'tur', v_k.tur));
  return jsonb_build_object('ok', true, 'tur', v_k.tur);
end $f$;

-- ───────── Google: tasdiqlangan email belgisi + «usul qo'shildi» belgisi (prod tanasi AYNAN; faqat shu qo'shimchalar) ─────────
create or replace function public.t2_google_kirish_v1(p_email text, p_ism text, p_sub text, p_ip_belgi text, p_operation_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $f$
declare v_email text := lower(btrim(coalesce(p_email, ''))); v_u public.t2_foydalanuvchi%rowtype; v_rol text;
  v_k jsonb; v_final bigint; v_kid bigint; v_demo bigint; v_manba bigint; v_ism text; v_ulandi boolean := false;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  if coalesce(btrim(p_sub), '') = '' or v_email !~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' then return jsonb_build_object('ok', false, 'code', 'GOOGLE_MALUMOT_NOTOGRI'); end if;
  perform pg_advisory_xact_lock(hashtextextended('t2_google_kirish:' || p_sub, 0));
  select * into v_u from public.t2_foydalanuvchi where google_sub = p_sub;
  if not found then
    select * into v_u from public.t2_foydalanuvchi where lower(email) = v_email or lower(login) = v_email order by id limit 1;
    if found then
      if v_u.holat = 'birlashtirildi' then
        v_final := public._t2_hisob_oxirgi(v_u.id);
        if v_final is null then return jsonb_build_object('ok', false, 'code', 'FOYDALANUVCHI_FAOL_EMAS'); end if;
        select * into v_u from public.t2_foydalanuvchi where id = v_final;
      end if;
      if v_u.google_sub is not null and v_u.google_sub <> p_sub then return jsonb_build_object('ok', false, 'code', 'GOOGLE_BOSHQA_HISOB'); end if;
      if v_u.email_tasdiqlandi_at is null and exists (select 1 from public.t2_ozi_royxat_log where foydalanuvchi_id = v_u.id) then
        return jsonb_build_object('ok', false, 'code', 'EMAIL_PAROL_BILAN', 'xabar', 'Bu email parol bilan ro''yxatdan o''tgan. Login va parol bilan kiring.');
      end if;
      update public.t2_foydalanuvchi set google_sub = p_sub, email = coalesce(email, v_email) where id = v_u.id;
      v_ulandi := true;
    end if;
  end if;
  if v_u.id is not null then
    if v_u.holat = 'birlashtirildi' then
      v_final := public._t2_hisob_oxirgi(v_u.id);
      if v_final is null then return jsonb_build_object('ok', false, 'code', 'FOYDALANUVCHI_FAOL_EMAS'); end if;
      select * into v_u from public.t2_foydalanuvchi where id = v_final;
    end if;
    if v_u.holat is distinct from 'faol' then return jsonb_build_object('ok', false, 'code', 'FOYDALANUVCHI_FAOL_EMAS'); end if;
    -- Google email_verified (shlyuzda tekshirilgan) — hisobdagi shu email endi TASDIQLANGAN.
    update public.t2_foydalanuvchi set email_tasdiqlandi_at = now() where id = v_u.id and email_tasdiqlandi_at is null and lower(coalesce(email, '')) = v_email;
    v_rol := public._t2_asosiy_rol(v_u.id);
    update public.t2_kirish_usul set oxirgi_kirish_at = now() where tur = 'google' and tashqi_id = p_sub;
    return jsonb_build_object('ok', true, 'yangi', false, 'ulandi', v_ulandi, 'login', v_u.login, 'foydalanuvchi_id', v_u.id, 'rol', coalesce(v_rol, 'kuzatuvchi'));
  end if;
  perform pg_advisory_xact_lock(hashtextextended('t2_ozi_royxat', 0));
  if (select count(*) from public.t2_ozi_royxat_log where ip_belgi = p_ip_belgi and yaratildi > now() - interval '24 hours') >= 5 then
    return jsonb_build_object('ok', false, 'code', 'LIMIT', 'xabar', 'Bu qurilmadan bugun ro''yxatdan o''tish limiti tugadi. Ertaga urinib ko''ring.');
  end if;
  v_ism := coalesce(nullif(btrim(left(coalesce(p_ism, ''), 200)), ''), split_part(v_email, '@', 1));
  insert into public.t2_foydalanuvchi(login, email, ism, holat, google_sub, email_tasdiqlandi_at)
  values (v_email, v_email, v_ism, 'faol', p_sub, now()) returning * into v_u;
  insert into public.t2_ozi_royxat_log(ip_belgi, foydalanuvchi_id, kompaniya_id, operation_id) values (p_ip_belgi, v_u.id, null, p_operation_id);
  return jsonb_build_object('ok', true, 'yangi', true, 'login', v_email, 'foydalanuvchi_id', v_u.id, 'rol', 'kuzatuvchi', 'demo_obyekt_id', null);
end $f$;

-- ───────── Telegram (rule c): admin kiritgan telefon bo'yicha avto-ulanmaydi ─────────
create or replace function public.t2_tg_kirish_holat_v1(p_nonce_xesh text, p_brauzer_xesh text, p_ip_belgi text, p_operation_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $f$
declare v public.t2_kirish_nonce%rowtype; v_tg public.t2_telegram_ulanish%rowtype; v_u public.t2_foydalanuvchi%rowtype; v_uid bigint; v_yangi boolean := false;
  v_az jsonb; v_rol text; v_ism text; v_boshqa bigint;
begin
  if p_operation_id is null or coalesce(p_nonce_xesh, '') !~ '^[0-9a-f]{64}$' or coalesce(p_brauzer_xesh, '') !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'code', 'TOPILMADI');
  end if;
  select * into v from public.t2_kirish_nonce where nonce_xesh = p_nonce_xesh for update;
  if not found or v.maqsad <> 'kirish' then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
  if v.brauzer_xesh <> p_brauzer_xesh then
    -- faqat havolani bilgan, lekin brauzer sirini bilmagan: umumiy javob; 5 xatodan keyin nonce o'ladi.
    update public.t2_kirish_nonce set xato_urinish = xato_urinish + 1, holat = case when xato_urinish + 1 >= 5 and holat <> 'ishlatildi' then 'bekor' else holat end where id = v.id;
    return jsonb_build_object('ok', false, 'code', 'TOPILMADI');
  end if;
  if v.holat in ('ishlatildi', 'bekor') then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
  if v.sorov_soni >= 400 then
    update public.t2_kirish_nonce set holat = 'bekor' where id = v.id;
    return jsonb_build_object('ok', false, 'code', 'LIMIT');
  end if;
  update public.t2_kirish_nonce set sorov_soni = sorov_soni + 1 where id = v.id;
  if v.tugaydi <= now() then
    update public.t2_kirish_nonce set holat = 'bekor' where id = v.id;
    return jsonb_build_object('ok', false, 'code', 'MUDDATI_OTGAN');
  end if;
  if v.holat <> 'tasdiqlandi' then return jsonb_build_object('ok', true, 'holat', 'kutmoqda'); end if;

  -- Tasdiqlangan: hisobni aniqlash. Hisobni egallab olish YO'Q.
  perform pg_advisory_xact_lock(hashtextextended('t2_kirish_tel:' || v.telefon_e164, 0));
  perform pg_advisory_xact_lock(hashtextextended('t2_telegram_tg:' || v.telegram_user_id, 0));
  select * into v_tg from public.t2_telegram_ulanish where telegram_user_id = v.telegram_user_id and holat = 'faol';
  select id into v_boshqa from public.t2_foydalanuvchi where telefon_e164 = v.telefon_e164 or login = v.telefon_e164 order by (telefon_e164 = v.telefon_e164) desc limit 1;
  if found and v_tg.id is null then
    -- telefon bo'yicha mavjud hisob: faqat TASDIQLANGAN (telefon_manba='telegram') hisobga ulanadi; admin kiritgan telefon bo'yicha AVTO-ULANMAYDI (TELEFON_HISOB_BOR).
    v_uid := public._t2_hisob_oxirgi(v_boshqa);
    select * into v_u from public.t2_foydalanuvchi where id = v_uid;
    if v_uid is null or v_u.holat is distinct from 'faol' or v_u.telefon_manba is distinct from 'telegram' or v_u.telefon_e164 is distinct from v.telefon_e164 then
      update public.t2_kirish_nonce set holat = 'bekor' where id = v.id;
      return jsonb_build_object('ok', false, 'code', 'TELEFON_HISOB_BOR');
    end if;
    update public.t2_telegram_ulanish set holat = 'uzildi', uzildi_at = now(), uzish_manba = 'almashtirildi' where foydalanuvchi_id = v_uid and holat = 'faol';
    insert into public.t2_telegram_ulanish (foydalanuvchi_id, telegram_user_id, chat_id, til) values (v_uid, v.telegram_user_id, v.chat_id, v.til);
  elsif v_tg.id is not null then
    -- Telegram allaqachon bog'langan: o'sha hisob (Mini App bilan bir xil). Telefon boshqa hisobniki bo'lsa — rad.
    v_uid := public._t2_hisob_oxirgi(v_tg.foydalanuvchi_id);
    select * into v_u from public.t2_foydalanuvchi where id = v_uid;
    if v_uid is null or v_u.holat is distinct from 'faol' or (v_boshqa is not null and v_boshqa <> v_tg.foydalanuvchi_id and v_boshqa <> v_uid) then
      update public.t2_kirish_nonce set holat = 'bekor' where id = v.id;
      return jsonb_build_object('ok', false, 'code', 'KIRISH_RAD');
    end if;
  else
    -- yangi hisob: email ro'yxatidagi bilan bir xil abuse limiti (qurilma bo'yicha sutkasiga 5); kompaniya/a'zolik YO'Q.
    if (select count(*) from public.t2_ozi_royxat_log where ip_belgi = v.ip_belgi and yaratildi > now() - interval '24 hours') >= 5 then
      update public.t2_kirish_nonce set holat = 'bekor' where id = v.id;
      return jsonb_build_object('ok', false, 'code', 'LIMIT');
    end if;
    v_ism := coalesce(nullif(btrim(v.ism), ''), 'Foydalanuvchi');
    begin
      insert into public.t2_foydalanuvchi (login, ism, holat, telefon, telefon_e164, telefon_manba, telefon_tasdiqlangan)
        values (v.telefon_e164, v_ism, 'faol', v.telefon_e164, v.telefon_e164, 'telegram', true) returning * into v_u;
    exception when unique_violation then
      update public.t2_kirish_nonce set holat = 'bekor' where id = v.id;
      return jsonb_build_object('ok', false, 'code', 'KIRISH_RAD');
    end;
    v_uid := v_u.id; v_yangi := true;
    insert into public.t2_ozi_royxat_log (ip_belgi, foydalanuvchi_id, kompaniya_id, operation_id) values (v.ip_belgi, v_uid, null, p_operation_id);
    insert into public.t2_telegram_ulanish (foydalanuvchi_id, telegram_user_id, chat_id, til) values (v_uid, v.telegram_user_id, v.chat_id, v.til);
  end if;

  update public.t2_kirish_nonce set holat = 'ishlatildi', ishlatildi_at = now() where id = v.id and holat = 'tasdiqlandi';
  insert into public.t2_telegram_hodisa (foydalanuvchi_id, telegram_user_id, amal, manba, operation_id) values (v_uid, v.telegram_user_id, 'telefon_kirish', 'nonce', p_operation_id);
  perform public._t2_telegram_audit(v_uid, 'telegram_telefon_kirish', format('yangi=%s', v_yangi));
  update public.t2_kirish_usul set oxirgi_kirish_at = now() where tur = 'telegram' and tashqi_id = v.telegram_user_id::text;
  v_rol := public._t2_asosiy_rol(v_uid);
  select coalesce(jsonb_agg(jsonb_build_object('kompaniya_id', a.kompaniya_id, 'rol', a.rol)), '[]'::jsonb) into v_az
    from public.t2_azolik a where a.foydalanuvchi_id = v_uid and a.holat = 'faol';
  return jsonb_build_object('ok', true, 'holat', 'tayyor', 'yangi', v_yangi, 'foydalanuvchi_id', v_uid, 'login', v_u.login, 'rol', coalesce(v_rol, 'kuzatuvchi'), 'azoliklar', v_az);
end $f$;



-- ───────── oxirgi_kirish_at: parol / email-kod / Telegram Mini App (prod tanalari AYNAN; faqat bitta update qo'shilgan) ─────────
CREATE OR REPLACE FUNCTION public.t2_email_kod_kirish_v1(p_tasdiqlash_id uuid, p_kod_xesh text, p_email text, p_ism text, p_ip_belgi text, p_operation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v public.t2_royxat_email_tasdiq%rowtype; v_email text := lower(btrim(coalesce(p_email,'')));
  v_u public.t2_foydalanuvchi%rowtype; v_final bigint; v_rol text; v_k jsonb; v_kid bigint; v_demo bigint; v_manba bigint; v_ism text; v_az jsonb;
begin
  if p_operation_id is null then return jsonb_build_object('ok',false,'code','OPERATION_ID_REQUIRED'); end if;
  select * into v from public.t2_royxat_email_tasdiq where id = p_tasdiqlash_id for update;
  if not found or v.maqsad <> 'kirish' or v.bekor_qilindi_at is not null or v.yuborildi_at is null then
    return jsonb_build_object('ok',false,'code','KOD_TOPILMADI','xabar','Kod topilmadi. Yangisini so''rang.');
  end if;
  if v.ishlatildi_at is not null then return jsonb_build_object('ok',false,'code','KOD_ISHLATILGAN','xabar','Bu kod allaqachon ishlatilgan. Yangisini so''rang.'); end if;
  if v.tugaydi <= now() then return jsonb_build_object('ok',false,'code','KOD_MUDDATI_OTGAN','xabar','Kodning muddati tugagan. Yangisini so''rang.'); end if;
  if v.urinishlar >= 5 then return jsonb_build_object('ok',false,'code','KOD_URINISH_LIMITI','xabar','Urinishlar tugadi. Yangi kod so''rang.'); end if;
  if v.email <> v_email then return jsonb_build_object('ok',false,'code','EMAIL_MOS_EMAS','xabar','Kod boshqa email uchun yuborilgan.'); end if;
  if v.kod_xesh <> coalesce(p_kod_xesh,'') then
    update public.t2_royxat_email_tasdiq set urinishlar = urinishlar + 1 where id = v.id;
    return jsonb_build_object('ok',false,'code','KOD_NOTOGRI','xabar','Kod noto''g''ri.','qolgan_urinish', 4 - v.urinishlar);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('t2_royxat_email:' || v_email, 0));
  select * into v_u from public.t2_foydalanuvchi where lower(email) = v_email or lower(login) = v_email
   order by (holat = 'faol') desc, id limit 1;
  if found then
    if v_u.holat = 'birlashtirildi' then
      v_final := public._t2_hisob_oxirgi(v_u.id);
      if v_final is null then return jsonb_build_object('ok',false,'code','FOYDALANUVCHI_FAOL_EMAS','xabar','Hisob faol emas.'); end if;
      select * into v_u from public.t2_foydalanuvchi where id = v_final;
    end if;
    if v_u.holat is distinct from 'faol' then return jsonb_build_object('ok',false,'code','FOYDALANUVCHI_FAOL_EMAS','xabar','Hisob faol emas.'); end if;
    -- PRECLAIM-HIMOYA: email tasdiqlanmagan parolli / o'zi ro'yxatdan o'tgan hisobni email kod bilan egallab bo'lmaydi.
    if v_u.email_tasdiqlandi_at is null and (v_u.parol_hash is not null
       or (v_u.google_sub is null and exists (select 1 from public.t2_ozi_royxat_log where foydalanuvchi_id = v_u.id))) then
      return jsonb_build_object('ok',false,'code','EMAIL_TASDIQLANMAGAN_PAROLLI_HISOB','xabar','Bu email bilan parolli hisob bor. Parol bilan kiring yoki administratorga murojaat qiling.');
    end if;
    update public.t2_royxat_email_tasdiq set ishlatildi_at = now() where id = v.id;
    update public.t2_foydalanuvchi set email = coalesce(nullif(btrim(email),''), v_email), email_tasdiqlandi_at = coalesce(email_tasdiqlandi_at, now()) where id = v_u.id;
    update public.t2_kirish_usul set oxirgi_kirish_at = now() where tur = 'email' and tashqi_id = v_email;
    v_rol := public._t2_asosiy_rol(v_u.id);
    select coalesce(jsonb_agg(jsonb_build_object('kompaniya_id', a.kompaniya_id, 'rol', a.rol)), '[]'::jsonb) into v_az
      from public.t2_azolik a where a.foydalanuvchi_id = v_u.id and a.holat = 'faol';
    return jsonb_build_object('ok',true,'yangi',false,'foydalanuvchi_id',v_u.id,'login',v_u.login,'rol',coalesce(v_rol,'kuzatuvchi'),'azoliklar',v_az);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('t2_ozi_royxat', 0));
  if (select count(*) from public.t2_ozi_royxat_log where ip_belgi = p_ip_belgi and yaratildi > now() - interval '24 hours') >= 5 then
    return jsonb_build_object('ok', false, 'code', 'LIMIT', 'xabar', 'Bu qurilmadan bugun ro''yxatdan o''tish limiti tugadi. Ertaga urinib ko''ring.');
  end if;
  v_ism := coalesce(nullif(btrim(left(coalesce(p_ism, ''), 200)), ''), split_part(v_email, '@', 1));
  insert into public.t2_foydalanuvchi(login, email, ism, holat, email_tasdiqlandi_at)
  values (v_email, v_email, v_ism, 'faol', now()) returning * into v_u;
  insert into public.t2_ozi_royxat_log(ip_belgi, foydalanuvchi_id, kompaniya_id, operation_id) values (p_ip_belgi, v_u.id, null, p_operation_id);
  update public.t2_royxat_email_tasdiq set ishlatildi_at = now() where id = v.id;
  select coalesce(jsonb_agg(jsonb_build_object('kompaniya_id', a.kompaniya_id, 'rol', a.rol)), '[]'::jsonb) into v_az
    from public.t2_azolik a where a.foydalanuvchi_id = v_u.id and a.holat = 'faol';
  update public.t2_kirish_usul set oxirgi_kirish_at = now() where tur = 'email' and tashqi_id = v_email;
  return jsonb_build_object('ok',true,'yangi',true,'foydalanuvchi_id',v_u.id,'login',v_email,'rol','kuzatuvchi','azoliklar',v_az,'demo_obyekt_id',null);
end $function$;

create or replace function public.t2_kirish_royxatga_ol(p_login text, p_rol text, p_email text DEFAULT NULL::text, p_gas_verified_parol text DEFAULT NULL::text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $f$
declare v_id bigint; v_komp jsonb; v_hash text;
begin
  insert into t2_foydalanuvchi (login, email)
  values (p_login, p_email)
  on conflict (login) do update set email = coalesce(excluded.email, t2_foydalanuvchi.email)
  returning id, parol_hash into v_id, v_hash;

  if p_gas_verified_parol is not null and v_hash is null then
    update t2_foydalanuvchi
      set parol_hash = extensions.crypt(p_gas_verified_parol, extensions.gen_salt('bf')),
          parol_yangilandi = now()
      where id = v_id;
  end if;
  update public.t2_kirish_usul set oxirgi_kirish_at = now() where tur = 'parol' and tashqi_id = lower(p_login);

  select jsonb_agg(jsonb_build_object('kompaniya_id', a.kompaniya_id, 'rol', a.rol))
    into v_komp
  from t2_azolik a where a.foydalanuvchi_id = v_id and a.holat = 'faol';

  return jsonb_build_object('ok', true, 'foydalanuvchi_id', v_id, 'azoliklar', coalesce(v_komp, '[]'::jsonb));
end $f$;

create or replace function public.t2_telegram_kirish_v1(p_telegram_user_id bigint, p_operation_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $f$
declare v public.t2_telegram_ulanish%rowtype; v_u public.t2_foydalanuvchi%rowtype; v_uid bigint; v_rol text; v_az jsonb;
begin
  if p_operation_id is null then return jsonb_build_object('ok',false,'code','OPERATION_ID_REQUIRED'); end if;
  if p_telegram_user_id is null or p_telegram_user_id <= 0 then return jsonb_build_object('ok',false,'code','TELEGRAM_MALUMOT_NOTOGRI'); end if;
  if (select count(*) from public.t2_telegram_hodisa where telegram_user_id = p_telegram_user_id and amal = 'miniapp_kirish'
        and yaratildi > now() - interval '1 minute') >= 10 then
    return jsonb_build_object('ok',false,'code','LIMIT');
  end if;
  select * into v from public.t2_telegram_ulanish where telegram_user_id = p_telegram_user_id and holat = 'faol';
  if not found then return jsonb_build_object('ok',false,'code','ULANMAGAN'); end if;
  v_uid := public._t2_hisob_oxirgi(v.foydalanuvchi_id);
  if v_uid is null then return jsonb_build_object('ok',false,'code','FOYDALANUVCHI_FAOL_EMAS'); end if;
  select * into v_u from public.t2_foydalanuvchi where id = v_uid;
  v_rol := public._t2_asosiy_rol(v_uid);
  select coalesce(jsonb_agg(jsonb_build_object('kompaniya_id', a.kompaniya_id, 'rol', a.rol)), '[]'::jsonb) into v_az
    from public.t2_azolik a where a.foydalanuvchi_id = v_uid and a.holat = 'faol';
  insert into public.t2_telegram_hodisa (foydalanuvchi_id, telegram_user_id, amal, manba, operation_id) values (v_uid, p_telegram_user_id, 'miniapp_kirish', 'miniapp', p_operation_id);
  update public.t2_kirish_usul set oxirgi_kirish_at = now() where tur = 'telegram' and tashqi_id = p_telegram_user_id::text;
  return jsonb_build_object('ok',true,'foydalanuvchi_id',v_uid,'login',v_u.login,'rol',coalesce(v_rol,'kuzatuvchi'),'azoliklar',v_az);
end $f$;

-- ───────── Telegram — ikkinchi hisobga egalik ISBOTI (kirgan foydalanuvchi uchun; sessiya BERMAYDI) ─────────
alter table public.t2_kirish_nonce add column if not exists maqsad text not null default 'kirish';
alter table public.t2_kirish_nonce add column if not exists actor_id bigint;
do $b$ begin
  if not exists (select 1 from pg_constraint where conname = 't2_kirish_nonce_maqsad_chk') then
    alter table public.t2_kirish_nonce add constraint t2_kirish_nonce_maqsad_chk check (maqsad in ('kirish', 'dokaz'));
  end if;
end $b$;

create or replace function public.t2_tg_dokaz_boshla_v1(p_actor_id bigint, p_nonce_xesh text, p_brauzer_xesh text, p_belgi text, p_ip_belgi text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $f$
declare v_tugaydi timestamptz := now() + interval '5 minutes';
begin
  if p_actor_id is null or not exists (select 1 from public.t2_foydalanuvchi where id = p_actor_id and holat = 'faol') then return jsonb_build_object('ok', false, 'code', 'ACTOR_NOT_FOUND'); end if;
  if coalesce(p_nonce_xesh, '') !~ '^[0-9a-f]{64}$' or coalesce(p_brauzer_xesh, '') !~ '^[0-9a-f]{64}$' or coalesce(p_belgi, '') !~ '^[0-9]{4}$' then
    return jsonb_build_object('ok', false, 'code', 'NOTOGRI');
  end if;
  if not public._t2_kirish_limit_v1('tg_dokaz_actor', p_actor_id::text, interval '1 hour', 10) then return jsonb_build_object('ok', false, 'code', 'LIMIT'); end if;
  insert into public.t2_kirish_nonce (nonce_xesh, brauzer_xesh, belgi, ip_belgi, tugaydi, maqsad, actor_id)
    values (p_nonce_xesh, p_brauzer_xesh, p_belgi, p_ip_belgi, v_tugaydi, 'dokaz', p_actor_id);
  return jsonb_build_object('ok', true, 'tugaydi', v_tugaydi);
end $f$;

create or replace function public.t2_tg_dokaz_holat_v1(p_actor_id bigint, p_nonce_xesh text, p_brauzer_xesh text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $f$
declare v public.t2_kirish_nonce%rowtype; v_x bigint;
begin
  if p_actor_id is null or coalesce(p_nonce_xesh, '') !~ '^[0-9a-f]{64}$' or coalesce(p_brauzer_xesh, '') !~ '^[0-9a-f]{64}$' then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
  select * into v from public.t2_kirish_nonce where nonce_xesh = p_nonce_xesh for update;
  if not found or v.maqsad <> 'dokaz' or v.actor_id is distinct from p_actor_id then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
  if v.brauzer_xesh <> p_brauzer_xesh then
    update public.t2_kirish_nonce set xato_urinish = xato_urinish + 1, holat = case when xato_urinish + 1 >= 5 and holat <> 'ishlatildi' then 'bekor' else holat end where id = v.id;
    return jsonb_build_object('ok', false, 'code', 'TOPILMADI');
  end if;
  if v.holat in ('ishlatildi', 'bekor') then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
  if v.sorov_soni >= 400 then
    update public.t2_kirish_nonce set holat = 'bekor' where id = v.id;
    return jsonb_build_object('ok', false, 'code', 'LIMIT');
  end if;
  update public.t2_kirish_nonce set sorov_soni = sorov_soni + 1 where id = v.id;
  if v.tugaydi <= now() then
    update public.t2_kirish_nonce set holat = 'bekor' where id = v.id;
    return jsonb_build_object('ok', false, 'code', 'MUDDATI_OTGAN');
  end if;
  if v.holat <> 'tasdiqlandi' then return jsonb_build_object('ok', true, 'holat', 'kutmoqda'); end if;
  -- Telegram shu foydalanuvchiga ulangan hisob; yo'q bo'lsa — Telegram TASDIQLAGAN telefonli hisob. Boshqa hech narsa bo'yicha EMAS.
  select public._t2_hisob_oxirgi(t.foydalanuvchi_id) into v_x from public.t2_telegram_ulanish t where t.telegram_user_id = v.telegram_user_id and t.holat = 'faol';
  if v_x is null then
    select public._t2_hisob_oxirgi(u.id) into v_x from public.t2_foydalanuvchi u
     where u.telefon_e164 = v.telefon_e164 and u.telefon_manba = 'telegram' and coalesce(u.telefon_tasdiqlangan, false);
  end if;
  update public.t2_kirish_nonce set holat = case when v_x is null then 'bekor' else 'ishlatildi' end, ishlatildi_at = now() where id = v.id;
  if v_x is null then return jsonb_build_object('ok', false, 'code', 'TELEGRAM_HISOB_YOQ'); end if;
  return jsonb_build_object('ok', true, 'holat', 'tayyor', 'foydalanuvchi_id', v_x);
end $f$;
-- ───────── ruxsatlar: faqat service_role ─────────
revoke all on function public._t2_usul_want_v1(bigint), public._t2_usul_sinxron_v1(bigint), public._t2_usul_trg_foyd_v1(), public._t2_usul_trg_tg_v1(), public._t2_rol_daraja_v1(text) from public, anon, authenticated;
revoke all on function public.t2_email_kod_dokaz_v1(uuid, text, text), public.t2_google_dokaz_v1(text, text), public.t2_hisob_birlashtir_v2(bigint, bigint, text, uuid), public.t2_kirish_usullari_v1(bigint), public.t2_usul_uz_v1(bigint, bigint, uuid), public.t2_google_kirish_v1(text, text, text, text, uuid), public.t2_tg_kirish_holat_v1(text, text, text, uuid), public.t2_telegram_kirish_v1(bigint, uuid), public.t2_kirish_royxatga_ol(text, text, text, text), public.t2_email_kod_kirish_v1(uuid, text, text, text, text, uuid), public.t2_tg_dokaz_boshla_v1(bigint, text, text, text, text), public.t2_tg_dokaz_holat_v1(bigint, text, text) from public, anon, authenticated;
grant execute on function public._t2_usul_want_v1(bigint), public._t2_usul_sinxron_v1(bigint), public._t2_rol_daraja_v1(text) to service_role;
grant execute on function public.t2_email_kod_dokaz_v1(uuid, text, text), public.t2_google_dokaz_v1(text, text), public.t2_hisob_birlashtir_v2(bigint, bigint, text, uuid), public.t2_kirish_usullari_v1(bigint), public.t2_usul_uz_v1(bigint, bigint, uuid), public.t2_google_kirish_v1(text, text, text, text, uuid), public.t2_tg_kirish_holat_v1(text, text, text, uuid), public.t2_telegram_kirish_v1(bigint, uuid), public.t2_kirish_royxatga_ol(text, text, text, text), public.t2_email_kod_kirish_v1(uuid, text, text, text, text, uuid), public.t2_tg_dokaz_boshla_v1(bigint, text, text, text, text), public.t2_tg_dokaz_holat_v1(bigint, text, text) to service_role;
notify pgrst, 'reload schema';
