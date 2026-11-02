-- T2-TELEGRAM-V1 (egasi 2026-10-28): @qur_uz_bot + Telegram Mini App poydevori (PR 1).
--
-- «shu bot orqali hamma o'ziga tegishli tizimdagi maksimal hamma ishini qila olishi kerak va mini app shaklida ham
-- ochib bera olishi kerak». Bu migratsiya faqat POYDEVOR: Telegram hisobi ↔ t2_foydalanuvchi bog'lanishi, bir martalik
-- ulash kodi, webhook idempotentligi + foydalanuvchi bo'yicha limit, bildirishnoma opt-in va superadmin statistikasi.
--
-- QOIDALAR:
--  • Telegram hisobi FAQAT bog'langan t2_foydalanuvchi sifatida ishlaydi — alohida rol/ruxsat tizimi YO'Q. Mini App
--    oddiy sessiya cookie oladi; har so'rovda vakolat t2_men_v1 + middleware (permission-policy) orqali qayta olinadi.
--  • Ulash kodi bazaga faqat SHA-256 xesh ko'rinishida yoziladi; 10 daqiqa; bir martalik.
--  • Jadvallar RLS yoqilgan, siyosatsiz (anon/authenticated hech narsa ko'rmaydi); RPC lar SECURITY DEFINER,
--    EXECUTE faqat service_role. Bot tokeni bazaga HECH QACHON yozilmaydi (Cloudflare Pages secret).
--  • Xabar matni, telefon, username saqlanmaydi (PII minimal): faqat telegram_user_id, chat_id, til.
--  • Audit: t2_telegram_hodisa (har doim) + t2_audit_yoz (foydalanuvchining har faol kompaniyasida).

begin;

-- ─── Jadvallar ───────────────────────────────────────────────────────────
create table if not exists public.t2_telegram_ulanish (
  id bigserial primary key,
  foydalanuvchi_id bigint not null references public.t2_foydalanuvchi(id),
  telegram_user_id bigint not null check (telegram_user_id > 0),
  chat_id bigint not null,
  til text check (til is null or til in ('uz','ru','en')),
  bildirishnoma jsonb not null default '{"topshiriq": true}'::jsonb check (jsonb_typeof(bildirishnoma) = 'object'),
  holat text not null default 'faol' check (holat in ('faol','uzildi')),
  ulandi_at timestamptz not null default now(),
  uzildi_at timestamptz,
  uzish_manba text check (uzish_manba is null or uzish_manba in ('web','bot','almashtirildi'))
);
-- Bir foydalanuvchi ↔ bitta faol Telegram; bitta Telegram ↔ bitta faol foydalanuvchi.
create unique index if not exists t2_telegram_ulanish_foyd_faol_uq on public.t2_telegram_ulanish (foydalanuvchi_id) where holat = 'faol';
create unique index if not exists t2_telegram_ulanish_tg_faol_uq on public.t2_telegram_ulanish (telegram_user_id) where holat = 'faol';

create table if not exists public.t2_telegram_ulash_kod (
  id bigserial primary key,
  foydalanuvchi_id bigint not null references public.t2_foydalanuvchi(id),
  kod_xesh text not null unique check (kod_xesh ~ '^[0-9a-f]{64}$'),
  tugaydi timestamptz not null,
  ishlatildi_at timestamptz,
  bekor_at timestamptz,
  yaratildi timestamptz not null default now()
);
create index if not exists t2_telegram_ulash_kod_foyd_idx on public.t2_telegram_ulash_kod (foydalanuvchi_id, yaratildi desc);

-- Webhook idempotentligi (update_id) + foydalanuvchi bo'yicha daqiqalik limit. Xabar matni saqlanmaydi.
create table if not exists public.t2_telegram_update (
  update_id bigint primary key,
  telegram_user_id bigint,
  olindi timestamptz not null default now()
);
create index if not exists t2_telegram_update_tg_idx on public.t2_telegram_update (telegram_user_id, olindi desc);

create table if not exists public.t2_telegram_hodisa (
  id bigserial primary key,
  foydalanuvchi_id bigint references public.t2_foydalanuvchi(id),
  telegram_user_id bigint,
  amal text not null check (amal in ('ulandi','uzildi','miniapp_kirish','kod_yaratildi')),
  manba text,
  operation_id uuid,
  yaratildi timestamptz not null default now()
);
create index if not exists t2_telegram_hodisa_foyd_idx on public.t2_telegram_hodisa (foydalanuvchi_id, yaratildi desc);
create index if not exists t2_telegram_hodisa_tg_idx on public.t2_telegram_hodisa (telegram_user_id, amal, yaratildi desc);

alter table public.t2_telegram_ulanish enable row level security;
alter table public.t2_telegram_ulash_kod enable row level security;
alter table public.t2_telegram_update enable row level security;
alter table public.t2_telegram_hodisa enable row level security;
revoke all on public.t2_telegram_ulanish, public.t2_telegram_ulash_kod, public.t2_telegram_update, public.t2_telegram_hodisa from public, anon, authenticated;
revoke all on sequence public.t2_telegram_ulanish_id_seq, public.t2_telegram_ulash_kod_id_seq, public.t2_telegram_hodisa_id_seq from public, anon, authenticated;

-- ─── Ichki yordamchi: foydalanuvchining har faol kompaniyasiga audit ─────
create or replace function public._t2_telegram_audit(p_foydalanuvchi_id bigint, p_amal text, p_tafsilot text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare r record;
begin
  for r in select distinct a.kompaniya_id from public.t2_azolik a where a.foydalanuvchi_id = p_foydalanuvchi_id and a.holat = 'faol' loop
    perform public.t2_audit_yoz(r.kompaniya_id, p_amal, 'telegram', null, p_tafsilot, 'actor:' || p_foydalanuvchi_id, null);
  end loop;
end $$;
revoke all on function public._t2_telegram_audit(bigint,text,text) from public, anon, authenticated, service_role;

-- ─── 1) Ulash kodi (web, kirgan foydalanuvchi) ───────────────────────────
create or replace function public.t2_telegram_kod_yarat_v1(p_actor_id bigint, p_kod_xesh text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_tugaydi timestamptz := now() + interval '10 minutes';
begin
  if p_actor_id is null or p_actor_id <= 0 then return jsonb_build_object('ok',false,'code','AUTH_REQUIRED'); end if;
  if not exists (select 1 from public.t2_foydalanuvchi where id = p_actor_id and holat = 'faol') then
    return jsonb_build_object('ok',false,'code','ACTOR_NOT_FOUND');
  end if;
  if coalesce(p_kod_xesh,'') !~ '^[0-9a-f]{64}$' then return jsonb_build_object('ok',false,'code','KOD_FORMAT'); end if;
  perform pg_advisory_xact_lock(hashtextextended('t2_telegram_kod:' || p_actor_id, 0));
  if (select count(*) from public.t2_telegram_ulash_kod where foydalanuvchi_id = p_actor_id and yaratildi > now() - interval '1 hour') >= 10 then
    return jsonb_build_object('ok',false,'code','LIMIT','xabar','Juda ko''p urinish. Bir soatdan keyin qayta urinib ko''ring.');
  end if;
  -- Avvalgi ishlatilmagan kodlar bekor (bir vaqtda bitta yaroqli kod).
  update public.t2_telegram_ulash_kod set bekor_at = now()
   where foydalanuvchi_id = p_actor_id and ishlatildi_at is null and bekor_at is null;
  insert into public.t2_telegram_ulash_kod (foydalanuvchi_id, kod_xesh, tugaydi) values (p_actor_id, p_kod_xesh, v_tugaydi);
  insert into public.t2_telegram_hodisa (foydalanuvchi_id, amal, manba) values (p_actor_id, 'kod_yaratildi', 'web');
  return jsonb_build_object('ok',true,'tugaydi',v_tugaydi);
end $$;

-- ─── 2) Bog'lash (bot: /start <kod>) ─────────────────────────────────────
create or replace function public.t2_telegram_ulash_v1(p_kod_xesh text, p_telegram_user_id bigint, p_chat_id bigint, p_til text, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.t2_telegram_ulash_kod%rowtype; v_uid bigint; v_mavjud public.t2_telegram_ulanish%rowtype; v_ism text; v_bor boolean;
  v_til text := case when p_til in ('uz','ru','en') then p_til else null end;
begin
  if p_operation_id is null then return jsonb_build_object('ok',false,'code','OPERATION_ID_REQUIRED'); end if;
  if p_telegram_user_id is null or p_telegram_user_id <= 0 or p_chat_id is null then return jsonb_build_object('ok',false,'code','TELEGRAM_MALUMOT_NOTOGRI'); end if;
  if coalesce(p_kod_xesh,'') !~ '^[0-9a-f]{64}$' then return jsonb_build_object('ok',false,'code','KOD_TOPILMADI'); end if;
  select * into v from public.t2_telegram_ulash_kod where kod_xesh = p_kod_xesh for update;
  if not found or v.bekor_at is not null then return jsonb_build_object('ok',false,'code','KOD_TOPILMADI'); end if;
  if v.ishlatildi_at is not null then return jsonb_build_object('ok',false,'code','KOD_ISHLATILGAN'); end if;
  if v.tugaydi <= now() then return jsonb_build_object('ok',false,'code','KOD_MUDDATI_OTGAN'); end if;
  v_uid := public._t2_hisob_oxirgi(v.foydalanuvchi_id);
  if v_uid is null then return jsonb_build_object('ok',false,'code','FOYDALANUVCHI_FAOL_EMAS'); end if;
  perform pg_advisory_xact_lock(hashtextextended('t2_telegram_tg:' || p_telegram_user_id, 0));
  perform pg_advisory_xact_lock(hashtextextended('t2_telegram_foyd:' || v_uid, 0));
  -- Bu Telegram boshqa hisobga ulangan — jim almashtirilmaydi: avval o'sha hisobdan /chiqish.
  select * into v_mavjud from public.t2_telegram_ulanish where telegram_user_id = p_telegram_user_id and holat = 'faol';
  v_bor := found;
  if v_bor and v_mavjud.foydalanuvchi_id <> v_uid then return jsonb_build_object('ok',false,'code','TELEGRAM_BOSHQA_HISOBDA'); end if;
  update public.t2_telegram_ulash_kod set ishlatildi_at = now() where id = v.id;
  if v_bor then
    update public.t2_telegram_ulanish set chat_id = p_chat_id, til = coalesce(v_til, til) where id = v_mavjud.id;
  else
    -- Foydalanuvchining eski Telegrami (boshqa akkaunt) — almashtiriladi.
    update public.t2_telegram_ulanish set holat = 'uzildi', uzildi_at = now(), uzish_manba = 'almashtirildi'
     where foydalanuvchi_id = v_uid and holat = 'faol';
    insert into public.t2_telegram_ulanish (foydalanuvchi_id, telegram_user_id, chat_id, til) values (v_uid, p_telegram_user_id, p_chat_id, v_til);
  end if;
  insert into public.t2_telegram_hodisa (foydalanuvchi_id, telegram_user_id, amal, manba, operation_id) values (v_uid, p_telegram_user_id, 'ulandi', 'bot', p_operation_id);
  perform public._t2_telegram_audit(v_uid, 'telegram_ulandi', format('operation_id=%s', p_operation_id));
  select ism into v_ism from public.t2_foydalanuvchi where id = v_uid;
  return jsonb_build_object('ok',true,'foydalanuvchi_id',v_uid,'ism',v_ism);
end $$;

-- ─── 3) Uzish (web yoki bot) ─────────────────────────────────────────────
create or replace function public.t2_telegram_uz_v1(p_actor_id bigint, p_telegram_user_id bigint, p_manba text, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.t2_telegram_ulanish%rowtype;
begin
  if p_operation_id is null then return jsonb_build_object('ok',false,'code','OPERATION_ID_REQUIRED'); end if;
  if p_manba not in ('web','bot') then return jsonb_build_object('ok',false,'code','MANBA_NOTOGRI'); end if;
  if (p_actor_id is null) = (p_telegram_user_id is null) then return jsonb_build_object('ok',false,'code','BITTA_TOMON_KERAK'); end if;
  select * into v from public.t2_telegram_ulanish
   where holat = 'faol' and ((p_actor_id is not null and foydalanuvchi_id = p_actor_id) or (p_telegram_user_id is not null and telegram_user_id = p_telegram_user_id))
   for update;
  if not found then return jsonb_build_object('ok',true,'uzildi',false); end if;
  update public.t2_telegram_ulanish set holat = 'uzildi', uzildi_at = now(), uzish_manba = p_manba where id = v.id;
  insert into public.t2_telegram_hodisa (foydalanuvchi_id, telegram_user_id, amal, manba, operation_id) values (v.foydalanuvchi_id, v.telegram_user_id, 'uzildi', p_manba, p_operation_id);
  perform public._t2_telegram_audit(v.foydalanuvchi_id, 'telegram_uzildi', format('manba=%s; operation_id=%s', p_manba, p_operation_id));
  return jsonb_build_object('ok',true,'uzildi',true,'chat_id',v.chat_id,'til',v.til);
end $$;

-- ─── 4) Telegram → foydalanuvchi (bot buyruqlari uchun) ──────────────────
create or replace function public.t2_telegram_aniqla_v1(p_telegram_user_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v public.t2_telegram_ulanish%rowtype; v_uid bigint;
begin
  select * into v from public.t2_telegram_ulanish where telegram_user_id = p_telegram_user_id and holat = 'faol';
  if not found then return jsonb_build_object('ok',true,'ulangan',false); end if;
  v_uid := public._t2_hisob_oxirgi(v.foydalanuvchi_id);
  if v_uid is null then return jsonb_build_object('ok',true,'ulangan',false,'code','FOYDALANUVCHI_FAOL_EMAS'); end if;
  return jsonb_build_object('ok',true,'ulangan',true,'foydalanuvchi_id',v_uid,'til',v.til);
end $$;

-- ─── 5) Mini App kirish: imzolangan initData → oddiy sessiya (email kirish bilan bir xil shakl) ──
create or replace function public.t2_telegram_kirish_v1(p_telegram_user_id bigint, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
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
  return jsonb_build_object('ok',true,'foydalanuvchi_id',v_uid,'login',v_u.login,'rol',coalesce(v_rol,'kuzatuvchi'),'azoliklar',v_az);
end $$;

-- ─── 6) O'z holati va bildirishnoma sozlamasi (web) ──────────────────────
create or replace function public.t2_telegram_holat_v1(p_actor_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v public.t2_telegram_ulanish%rowtype;
begin
  if p_actor_id is null or p_actor_id <= 0 then return jsonb_build_object('ok',false,'code','AUTH_REQUIRED'); end if;
  select * into v from public.t2_telegram_ulanish where foydalanuvchi_id = p_actor_id and holat = 'faol';
  if not found then return jsonb_build_object('ok',true,'ulangan',false); end if;
  return jsonb_build_object('ok',true,'ulangan',true,'ulandi_at',v.ulandi_at,'bildirishnoma',v.bildirishnoma);
end $$;

-- Ruxsat etilgan kalitlar: topshiriq (PR 1); f2, signal — keyingi PR lar uchun zaxira. Faqat boolean.
create or replace function public.t2_telegram_sozlama_v1(p_actor_id bigint, p_bildirishnoma jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_toza jsonb := '{}'::jsonb; k text;
begin
  if p_actor_id is null or p_actor_id <= 0 then return jsonb_build_object('ok',false,'code','AUTH_REQUIRED'); end if;
  if p_bildirishnoma is null or jsonb_typeof(p_bildirishnoma) <> 'object' then return jsonb_build_object('ok',false,'code','SOZLAMA_NOTOGRI'); end if;
  foreach k in array array['topshiriq','f2','signal'] loop
    if p_bildirishnoma ? k then
      if jsonb_typeof(p_bildirishnoma -> k) <> 'boolean' then return jsonb_build_object('ok',false,'code','SOZLAMA_NOTOGRI'); end if;
      v_toza := v_toza || jsonb_build_object(k, p_bildirishnoma -> k);
    end if;
  end loop;
  update public.t2_telegram_ulanish set bildirishnoma = bildirishnoma || v_toza where foydalanuvchi_id = p_actor_id and holat = 'faol';
  if not found then return jsonb_build_object('ok',false,'code','ULANMAGAN'); end if;
  return jsonb_build_object('ok',true,'bildirishnoma',(select bildirishnoma from public.t2_telegram_ulanish where foydalanuvchi_id = p_actor_id and holat = 'faol'));
end $$;

-- ─── 7) Bildirishnoma manzili: ulangan VA shu turga rozi bo'lsa chat_id ──
create or replace function public.t2_telegram_manzil_v1(p_foydalanuvchi_id bigint, p_tur text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v public.t2_telegram_ulanish%rowtype;
begin
  select u.* into v from public.t2_telegram_ulanish u join public.t2_foydalanuvchi f on f.id = u.foydalanuvchi_id and f.holat = 'faol'
   where u.foydalanuvchi_id = p_foydalanuvchi_id and u.holat = 'faol';
  if not found then return jsonb_build_object('ok',true,'yuborish',false); end if;
  if coalesce((v.bildirishnoma ->> coalesce(p_tur,'')) = 'true', false) is not true then return jsonb_build_object('ok',true,'yuborish',false); end if;
  return jsonb_build_object('ok',true,'yuborish',true,'chat_id',v.chat_id,'til',v.til);
end $$;

-- ─── 8) Webhook: update_id idempotentligi + limit (20 / daqiqa / foydalanuvchi) ──
create or replace function public.t2_telegram_update_qabul_v1(p_update_id bigint, p_telegram_user_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_n int;
begin
  if p_update_id is null then return jsonb_build_object('ok',false,'code','UPDATE_ID_KERAK'); end if;
  insert into public.t2_telegram_update (update_id, telegram_user_id) values (p_update_id, p_telegram_user_id) on conflict (update_id) do nothing;
  if not found then return jsonb_build_object('ok',true,'yangi',false,'limit',false); end if;
  -- Eski yozuvlar (7 kun) tozalanadi — idempotentlik oynasi Telegram qayta urinishidan (24 soat) uzun.
  if random() < 0.01 then delete from public.t2_telegram_update where olindi < now() - interval '7 days'; end if;
  if p_telegram_user_id is not null then
    select count(*) into v_n from public.t2_telegram_update where telegram_user_id = p_telegram_user_id and olindi > now() - interval '1 minute';
    if v_n > 20 then return jsonb_build_object('ok',true,'yangi',true,'limit',true); end if;
  end if;
  return jsonb_build_object('ok',true,'yangi',true,'limit',false);
end $$;

-- ─── 9) Superadmin: bot statistikasi (faqat soni, shaxsiy ma'lumot yo'q) ──
create or replace function public.t2_telegram_statistika_v1(p_actor_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if p_actor_id is null or not public.t2_platforma_superadmin(p_actor_id) then return jsonb_build_object('ok',false,'code','SUPERADMIN_KERAK'); end if;
  return jsonb_build_object('ok',true,
    'ulangan', (select count(*) from public.t2_telegram_ulanish where holat = 'faol'),
    'update_24s', (select count(*) from public.t2_telegram_update where olindi > now() - interval '24 hours'),
    'miniapp_24s', (select count(*) from public.t2_telegram_hodisa where amal = 'miniapp_kirish' and yaratildi > now() - interval '24 hours'));
end $$;

-- ─── Ruxsatlar: faqat service_role ───────────────────────────────────────
revoke all on function public.t2_telegram_kod_yarat_v1(bigint,text) from public, anon, authenticated;
revoke all on function public.t2_telegram_ulash_v1(text,bigint,bigint,text,uuid) from public, anon, authenticated;
revoke all on function public.t2_telegram_uz_v1(bigint,bigint,text,uuid) from public, anon, authenticated;
revoke all on function public.t2_telegram_aniqla_v1(bigint) from public, anon, authenticated;
revoke all on function public.t2_telegram_kirish_v1(bigint,uuid) from public, anon, authenticated;
revoke all on function public.t2_telegram_holat_v1(bigint) from public, anon, authenticated;
revoke all on function public.t2_telegram_sozlama_v1(bigint,jsonb) from public, anon, authenticated;
revoke all on function public.t2_telegram_manzil_v1(bigint,text) from public, anon, authenticated;
revoke all on function public.t2_telegram_update_qabul_v1(bigint,bigint) from public, anon, authenticated;
revoke all on function public.t2_telegram_statistika_v1(bigint) from public, anon, authenticated;
grant execute on function public.t2_telegram_kod_yarat_v1(bigint,text) to service_role;
grant execute on function public.t2_telegram_ulash_v1(text,bigint,bigint,text,uuid) to service_role;
grant execute on function public.t2_telegram_uz_v1(bigint,bigint,text,uuid) to service_role;
grant execute on function public.t2_telegram_aniqla_v1(bigint) to service_role;
grant execute on function public.t2_telegram_kirish_v1(bigint,uuid) to service_role;
grant execute on function public.t2_telegram_holat_v1(bigint) to service_role;
grant execute on function public.t2_telegram_sozlama_v1(bigint,jsonb) to service_role;
grant execute on function public.t2_telegram_manzil_v1(bigint,text) to service_role;
grant execute on function public.t2_telegram_update_qabul_v1(bigint,bigint) to service_role;
grant execute on function public.t2_telegram_statistika_v1(bigint) to service_role;

commit;
