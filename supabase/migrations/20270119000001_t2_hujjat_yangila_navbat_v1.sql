-- 20270119000001_t2_hujjat_yangila_navbat_v1
-- «Hujjat doim tayyor» (egasi 2026-11-19): F-2 o'zgarsa, rasmiy Excel fonda qayta yasalib Diskka YANGI VERSIYA bo'lib yoziladi (kalit f2:<akt_id>).
-- Bu migratsiya faqat NAVBAT: o'zgarish belgisi (trigger) -> navbat qatori -> server (Pages Function) qayta yasaydi.
--   * Umumiy navbat: tur ('f2' hozir; 'f3', 'nakopitelniy' ... keyin shu jadvalga qo'shiladi) + manba_id (F-2 uchun akt_id).
--   * Debounce: birinchi o'zgarishdan 2 daqiqa keyin ishlanadi; shu oynadagi keyingi o'zgarishlar bitta yasashga qo'shiladi.
--     Yasash vaqtida yangi o'zgarish kelsa - qayta=true, tugagach yana 2 daqiqadan keyin.
--   * Retry: xatoda eksponensial kechikish (2,4,8,16,32,60 daqiqa), 6 urinishdan keyin holat='xato' (ko'rinib turadi).
--   * Trigger HECH QACHON biznes yozuvni yiqitmaydi (exception -> jim; navbat faqat qo'shimcha).
--   * Token: navbat/yasash TOKEN YECHMAYDI (token yuklab olishda, mazmun kaliti bo'yicha bir marta).
-- Applied: YO'Q (L0 qo'llaydi: avval ROLLBACK sinov; fayl ichida begin/commit yo'q).

create table if not exists public.t2_hujjat_yangila_navbat (
  id bigserial primary key,
  kompaniya_id bigint not null,
  tur text not null,
  manba_id bigint not null,
  obyekt_id bigint,
  holat text not null default 'kutmoqda' check (holat in ('kutmoqda', 'ishlanmoqda', 'tayyor', 'xato', 'otkazildi')),
  qayta boolean not null default false,
  urinish integer not null default 0,
  keyingi_vaqt timestamptz not null default (now() + interval '2 minutes'),
  boshlandi timestamptz,
  belgilandi timestamptz not null default now(),
  tayyor_vaqt timestamptz,
  fayl_versiya integer,
  oxirgi_xato text,
  unique (tur, manba_id)
);
create index if not exists t2_hujjat_yangila_navbat_navbat_idx on public.t2_hujjat_yangila_navbat (keyingi_vaqt) where holat = 'kutmoqda';
create index if not exists t2_hujjat_yangila_navbat_kompaniya_idx on public.t2_hujjat_yangila_navbat (kompaniya_id, tur, holat);
alter table public.t2_hujjat_yangila_navbat enable row level security;
revoke all on table public.t2_hujjat_yangila_navbat from public, anon, authenticated;
grant select, insert, update, delete on table public.t2_hujjat_yangila_navbat to service_role;
grant usage, select on sequence public.t2_hujjat_yangila_navbat_id_seq to service_role;

-- Bitta belgi (F-2 yoki boshqa tur). Debounce: kutayotgan qatorning vaqti SURILMAYDI.
create or replace function public._t2_hujjat_yangila_belgila_v1(p_kompaniya bigint, p_tur text, p_manba_id bigint, p_obyekt bigint)
returns void language plpgsql security definer set search_path = public, pg_temp as $fn$
begin
  insert into public.t2_hujjat_yangila_navbat as n (kompaniya_id, tur, manba_id, obyekt_id)
  values (p_kompaniya, p_tur, p_manba_id, p_obyekt)
  on conflict (tur, manba_id) do update set
    holat = case when n.holat = 'ishlanmoqda' then 'ishlanmoqda' else 'kutmoqda' end,
    qayta = (n.holat = 'ishlanmoqda'),
    urinish = case when n.holat in ('ishlanmoqda', 'kutmoqda') then n.urinish else 0 end,
    keyingi_vaqt = case when n.holat = 'kutmoqda' then n.keyingi_vaqt when n.holat = 'ishlanmoqda' then n.keyingi_vaqt else now() + interval '2 minutes' end,
    obyekt_id = coalesce(excluded.obyekt_id, n.obyekt_id),
    belgilandi = now();
exception when others then null;  -- navbat biznes yozuvni hech qachon to'xtatmaydi
end $fn$;

-- Ko'p akt (statement trigger / qo'lda belgilash).
create or replace function public._t2_hujjat_yangila_f2_toplam_v1(p_idlar bigint[])
returns void language plpgsql security definer set search_path = public, pg_temp as $fn$
begin
  insert into public.t2_hujjat_yangila_navbat as n (kompaniya_id, tur, manba_id, obyekt_id)
  select a.kompaniya_id, 'f2', a.id, a.obyekt_id from public.t2_akt a where a.id = any(p_idlar) and a.tur = 'f2'
  on conflict (tur, manba_id) do update set
    holat = case when n.holat = 'ishlanmoqda' then 'ishlanmoqda' else 'kutmoqda' end,
    qayta = (n.holat = 'ishlanmoqda'),
    urinish = case when n.holat in ('ishlanmoqda', 'kutmoqda') then n.urinish else 0 end,
    keyingi_vaqt = case when n.holat = 'kutmoqda' then n.keyingi_vaqt when n.holat = 'ishlanmoqda' then n.keyingi_vaqt else now() + interval '2 minutes' end,
    belgilandi = now();
exception when others then null;
end $fn$;

-- t2_akt: yaratish / holat / lifecycle / raqam / oy / jami / versiya / izoh o'zgarishi.
create or replace function public.t2_akt_hujjat_yangila_trg() returns trigger language plpgsql security definer set search_path = public, pg_temp as $fn$
begin
  if new.tur = 'f2' then perform public._t2_hujjat_yangila_belgila_v1(new.kompaniya_id, 'f2', new.id, new.obyekt_id); end if;
  return null;
exception when others then return null;
end $fn$;
drop trigger if exists t2_akt_hujjat_yangila_trg on public.t2_akt;
create trigger t2_akt_hujjat_yangila_trg after insert or update of holat, lifecycle_status, raqam, oy, hujjat_jami, versiya, izoh, shartnoma_id, revision_id
  on public.t2_akt for each row execute function public.t2_akt_hujjat_yangila_trg();

-- t2_akt_qator: narx/hajm tahriri (MCP, Jarvis, bot, sayt - hammasi shu jadvalga yozadi). Statement-level: yuzlab qator = bitta belgi.
create or replace function public.t2_akt_qator_hujjat_yangila_ins_trg() returns trigger language plpgsql security definer set search_path = public, pg_temp as $fn$
begin
  perform public._t2_hujjat_yangila_f2_toplam_v1(array(select distinct akt_id from nt));
  return null;
exception when others then return null;
end $fn$;
create or replace function public.t2_akt_qator_hujjat_yangila_upd_trg() returns trigger language plpgsql security definer set search_path = public, pg_temp as $fn$
begin
  perform public._t2_hujjat_yangila_f2_toplam_v1(array(select distinct akt_id from nt));
  return null;
exception when others then return null;
end $fn$;
create or replace function public.t2_akt_qator_hujjat_yangila_del_trg() returns trigger language plpgsql security definer set search_path = public, pg_temp as $fn$
begin
  perform public._t2_hujjat_yangila_f2_toplam_v1(array(select distinct akt_id from ot));
  return null;
exception when others then return null;
end $fn$;
drop trigger if exists t2_akt_qator_hujjat_yangila_ins_trg on public.t2_akt_qator;
drop trigger if exists t2_akt_qator_hujjat_yangila_upd_trg on public.t2_akt_qator;
drop trigger if exists t2_akt_qator_hujjat_yangila_del_trg on public.t2_akt_qator;
create trigger t2_akt_qator_hujjat_yangila_ins_trg after insert on public.t2_akt_qator referencing new table as nt for each statement execute function public.t2_akt_qator_hujjat_yangila_ins_trg();
create trigger t2_akt_qator_hujjat_yangila_upd_trg after update on public.t2_akt_qator referencing new table as nt for each statement execute function public.t2_akt_qator_hujjat_yangila_upd_trg();
create trigger t2_akt_qator_hujjat_yangila_del_trg after delete on public.t2_akt_qator referencing old table as ot for each statement execute function public.t2_akt_qator_hujjat_yangila_del_trg();

-- Podval: akt podvali (t2_akt_podval) va obyekt/shartnoma nakrutka podvali (t2_nakrutka_podval) o'zgarsa - tegishli (so'nggi 3 oy, bekor emas) F-2 lar.
create or replace function public.t2_akt_podval_hujjat_yangila_trg() returns trigger language plpgsql security definer set search_path = public, pg_temp as $fn$
begin
  perform public._t2_hujjat_yangila_f2_toplam_v1(array[new.akt_id]);
  return null;
exception when others then return null;
end $fn$;
drop trigger if exists t2_akt_podval_hujjat_yangila_trg on public.t2_akt_podval;
create trigger t2_akt_podval_hujjat_yangila_trg after insert or update on public.t2_akt_podval for each row execute function public.t2_akt_podval_hujjat_yangila_trg();

create or replace function public.t2_nakrutka_podval_hujjat_yangila_trg() returns trigger language plpgsql security definer set search_path = public, pg_temp as $fn$
begin
  perform public._t2_hujjat_yangila_f2_toplam_v1(array(
    select a.id from public.t2_akt a
     where a.kompaniya_id = new.kompaniya_id and a.tur = 'f2' and a.holat <> 'bekor' and a.oy >= (date_trunc('month', now()) - interval '3 months')::date
       and ((new.obyekt_id is not null and a.obyekt_id = new.obyekt_id)
         or (new.shartnoma_id is not null and a.obyekt_id in (select o.id from public.t2_obyekt o where public._t2_disk_shartnoma_v1(new.kompaniya_id, o.id) = new.shartnoma_id)))));
  return null;
exception when others then return null;
end $fn$;
drop trigger if exists t2_nakrutka_podval_hujjat_yangila_trg on public.t2_nakrutka_podval;
create trigger t2_nakrutka_podval_hujjat_yangila_trg after insert or update on public.t2_nakrutka_podval for each row execute function public.t2_nakrutka_podval_hujjat_yangila_trg();

-- Fon yasash aktori: kompaniyaning faol a'zosi (pto > admin > boss > rahbar). Ruxsat har RPC da qayta tekshiriladi; fon yasash faqat O'QIydi va Diskka yozadi.
create or replace function public._t2_hujjat_yangila_aktor_v1(p_kompaniya bigint) returns bigint language sql stable security definer set search_path = public, pg_temp as $fn$
  select a.foydalanuvchi_id from public.t2_azolik a join public.t2_foydalanuvchi u on u.id = a.foydalanuvchi_id and u.holat = 'faol'
   where a.kompaniya_id = p_kompaniya and a.holat = 'faol' and a.rol in ('pto', 'admin', 'boss', 'rahbar')
   order by case a.rol when 'pto' then 0 when 'admin' then 1 when 'boss' then 2 else 3 end, a.foydalanuvchi_id limit 1
$fn$;

-- Processor: muddati kelganlarni oladi (SKIP LOCKED; 15 daqiqadan ortiq 'ishlanmoqda' qolganlar qayta olinadi).
create or replace function public.t2_hujjat_yangila_ol_v1(p_limit integer default 5, p_kompaniya bigint default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $fn$
declare v_res jsonb;
begin
  update public.t2_hujjat_yangila_navbat set holat = 'kutmoqda', keyingi_vaqt = now()
   where holat = 'ishlanmoqda' and boshlandi < now() - interval '15 minutes' and (p_kompaniya is null or kompaniya_id = p_kompaniya);
  with t as (
    select id from public.t2_hujjat_yangila_navbat
     where holat = 'kutmoqda' and keyingi_vaqt <= now() and tur <> '_backfill' and (p_kompaniya is null or kompaniya_id = p_kompaniya)
     order by keyingi_vaqt limit least(greatest(coalesce(p_limit, 5), 1), 50) for update skip locked
  ), u as (
    update public.t2_hujjat_yangila_navbat n set holat = 'ishlanmoqda', boshlandi = now(), urinish = n.urinish + 1, qayta = false
      from t where n.id = t.id returning n.*
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'tur', u.tur, 'manba_id', u.manba_id, 'kompaniya_id', u.kompaniya_id, 'obyekt_id', u.obyekt_id,
           'urinish', u.urinish, 'aktor_id', public._t2_hujjat_yangila_aktor_v1(u.kompaniya_id)) order by u.id), '[]'::jsonb) into v_res from u;
  return jsonb_build_object('ok', true, 'qatorlar', v_res);
end $fn$;

-- Natija: 'ok' | 'otkazildi' | 'xato'. Xatoda eksponensial kechikish; 6 urinishdan keyin 'xato'.
create or replace function public.t2_hujjat_yangila_tugat_v1(p_id bigint, p_natija text, p_xato text default null, p_versiya integer default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $fn$
declare n public.t2_hujjat_yangila_navbat%rowtype;
begin
  select * into n from public.t2_hujjat_yangila_navbat where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'YOQ'); end if;
  if p_natija in ('ok', 'otkazildi') then
    if n.qayta then
      update public.t2_hujjat_yangila_navbat set holat = 'kutmoqda', qayta = false, urinish = 0, keyingi_vaqt = now() + interval '2 minutes',
             fayl_versiya = coalesce(p_versiya, fayl_versiya), oxirgi_xato = null where id = p_id;
    else
      update public.t2_hujjat_yangila_navbat set holat = case when p_natija = 'ok' then 'tayyor' else 'otkazildi' end, urinish = 0,
             tayyor_vaqt = case when p_natija = 'ok' then now() else tayyor_vaqt end, fayl_versiya = coalesce(p_versiya, fayl_versiya), oxirgi_xato = null where id = p_id;
    end if;
  elsif p_natija = 'xato' then
    if n.urinish >= 6 then
      update public.t2_hujjat_yangila_navbat set holat = 'xato', oxirgi_xato = left(coalesce(p_xato, ''), 300) where id = p_id;
    else
      update public.t2_hujjat_yangila_navbat set holat = 'kutmoqda', qayta = false, oxirgi_xato = left(coalesce(p_xato, ''), 300),
             keyingi_vaqt = now() + make_interval(mins => least(power(2, n.urinish)::int, 60)) where id = p_id;
    end if;
  else
    return jsonb_build_object('ok', false, 'code', 'NATIJA_NOTOGRI');
  end if;
  return jsonb_build_object('ok', true);
end $fn$;

-- Qo'lda belgilash (trigger ushlamaydigan yo'llar: masalan ichki sozlama o'zgarishi). F-2 uchun.
create or replace function public.t2_hujjat_yangila_belgila_v1(p_kompaniya bigint, p_tur text, p_idlar bigint[])
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $fn$
begin
  if p_tur <> 'f2' then return jsonb_build_object('ok', false, 'code', 'TUR_QOLLANMAYDI'); end if;
  perform public._t2_hujjat_yangila_f2_toplam_v1(array(select a.id from public.t2_akt a where a.id = any(p_idlar) and a.kompaniya_id = p_kompaniya));
  return jsonb_build_object('ok', true);
end $fn$;

-- Backfill: bir marta (sentinel qator). So'nggi p_oy oy, bekor emas, TAXMINIY emas F-2 lar; 5 soniya oraliq bilan yoyiladi (server yuki).
create or replace function public.t2_hujjat_yangila_backfill_v1(p_oy integer default 3)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $fn$
declare v_n integer;
begin
  if exists (select 1 from public.t2_hujjat_yangila_navbat where tur = '_backfill' and manba_id = 0) then return jsonb_build_object('ok', true, 'allaqachon', true, 'qoshildi', 0); end if;
  insert into public.t2_hujjat_yangila_navbat (kompaniya_id, tur, manba_id, holat) values (0, '_backfill', 0, 'tayyor');
  with k as (
    select a.id, a.kompaniya_id, a.obyekt_id, row_number() over (order by a.oy desc, a.id) rn from public.t2_akt a
     where a.tur = 'f2' and a.holat <> 'bekor' and coalesce(a.lifecycle_status, '') not in ('cancelled', 'superseded')
       and a.oy >= (date_trunc('month', now()) - make_interval(months => greatest(coalesce(p_oy, 3), 1)))::date
       and not public._t2_f2_taxminiy_v1(a.raqam, a.izoh)
  ), i as (
    insert into public.t2_hujjat_yangila_navbat (kompaniya_id, tur, manba_id, obyekt_id, keyingi_vaqt)
    select k.kompaniya_id, 'f2', k.id, k.obyekt_id, now() + make_interval(secs => (k.rn * 5)::int) from k
    on conflict (tur, manba_id) do nothing returning 1
  ) select count(*) into v_n from i;
  return jsonb_build_object('ok', true, 'qoshildi', v_n);
end $fn$;

-- Holat (UI: «yangilanmoqda» belgisi, F-2 sahifasi): har akt uchun navbat holati.
create or replace function public.t2_hujjat_yangila_holat_v1(p_kompaniya bigint, p_tur text, p_idlar bigint[])
returns jsonb language sql stable security definer set search_path = public, pg_temp as $fn$
  select jsonb_build_object('ok', true, 'qatorlar', coalesce(jsonb_agg(jsonb_build_object('manba_id', n.manba_id, 'holat', n.holat, 'keyingi_vaqt', n.keyingi_vaqt,
         'urinish', n.urinish, 'oxirgi_xato', n.oxirgi_xato, 'tayyor_vaqt', n.tayyor_vaqt)), '[]'::jsonb))
    from public.t2_hujjat_yangila_navbat n where n.kompaniya_id = p_kompaniya and n.tur = p_tur and n.manba_id = any(p_idlar)
$fn$;

do $g$ declare f text; begin
  foreach f in array array[
    'public.t2_hujjat_yangila_ol_v1(integer, bigint)', 'public.t2_hujjat_yangila_tugat_v1(bigint, text, text, integer)',
    'public.t2_hujjat_yangila_belgila_v1(bigint, text, bigint[])', 'public.t2_hujjat_yangila_backfill_v1(integer)', 'public.t2_hujjat_yangila_holat_v1(bigint, text, bigint[])',
    'public._t2_hujjat_yangila_belgila_v1(bigint, text, bigint, bigint)', 'public._t2_hujjat_yangila_f2_toplam_v1(bigint[])', 'public._t2_hujjat_yangila_aktor_v1(bigint)']
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $g$;
