-- T2 LOGISTIKA — Phase 2 (20261216400000 ustiga, ADDITIVE; P1 fayli O'ZGARMAYDI).
-- Nima qo'shiladi:
--   * Park: firma haydovchilari (t2_yb_haydovchi: firma a'zosi), qabul qilingan yukni firma O'Z haydovchisiga tayinlaydi (bron.haydovchi_id);
--     tayinlangach FAQAT shu haydovchi qadamlarni bajaradi va joy yuboradi; firma hamma reysni ko'radi. Mashina reestri = mavjud t2_yb_mashina (erkin matn raqam).
--   * Narx formulasi ma'lumot sifatida (t2_yb_sozlama): baza + km*sinf stavkasi + yuklash + kutish. TAXMINIY default (kalibrovka — T), faqat baho.
--   * O'z yukini qabul qilish taqiqi (OZ_YUKI), auktsion mavjud t2_yb_taklif_ber_v1 / t2_yb_yuk_javob_v1 bilan (bitta bron).
--   * Bildirishnoma: yangi yuk e'loni -> yaqin onlayn haydovchilar (trigger, outbox); har qadamda yuk egasiga (outbox).
--   * Iz arxivi: yetkazilgach iz R2 ga ko'chiriladi, Postgresda faqat masofa+davomiylik (t2_yb_p2_iz_*).
--   * Bekor qilish ma'lumot sifatida: t2_yb_bekor (kim, sabab kodi, sabab) + mavjud tashuvchi.bekor_soni; pul harakati YO'Q.
-- Hamma yangi RPC faqat service_role. Rollback: .rollback.sql. BEGIN/COMMIT yo'q (qo'llovchi o'raydi).
set local statement_timeout = '300s';

-- 1. Ustunlar
alter table public.t2_yb_bron add column if not exists haydovchi_id bigint references public.t2_foydalanuvchi(id) on delete set null;
alter table public.t2_yb_bron add column if not exists tayinlandi_vaqt timestamptz;
alter table public.t2_yb_joy add column if not exists arxivlandi boolean not null default false;
alter table public.t2_yb_joy add column if not exists iz_r2_kalit text;
alter table public.t2_yb_joy add column if not exists iz_nuqta_soni integer;
alter table public.t2_yb_joy add column if not exists iz_km numeric(10, 2);
alter table public.t2_yb_joy add column if not exists iz_daqiqa integer;
alter table public.t2_yb_joy drop constraint if exists t2_yb_joy_iz_kalit_chk;
alter table public.t2_yb_joy add constraint t2_yb_joy_iz_kalit_chk check (iz_r2_kalit is null or (length(iz_r2_kalit) between 8 and 500 and iz_r2_kalit like 'yb/iz/%'));
create index if not exists t2_yb_bron_haydovchi_idx on public.t2_yb_bron (haydovchi_id) where haydovchi_id is not null;

-- 2. Jadvallar
create table if not exists public.t2_yb_haydovchi (
  id bigserial primary key,
  tashuvchi_id bigint not null references public.t2_yb_tashuvchi(id) on delete cascade,
  foydalanuvchi_id bigint not null references public.t2_foydalanuvchi(id) on delete cascade,
  holat text not null default 'faol' check (holat in ('faol', 'nofaol')),
  yaratildi timestamptz not null default now(),
  unique (tashuvchi_id, foydalanuvchi_id)
);
create table if not exists public.t2_yb_bekor (
  id bigserial primary key,
  bron_id bigint not null references public.t2_yb_bron(id) on delete cascade,
  yuk_id bigint not null references public.t2_yb_yuk(id) on delete cascade,
  kim text not null check (kim in ('ega', 'tashuvchi', 'haydovchi', 'tizim')),
  sabab_kod text not null check (sabab_kod ~ '^[a-z_]{2,40}$'),
  sabab text check (sabab is null or length(sabab) <= 1000),
  yaratildi timestamptz not null default now(),
  unique (bron_id)
);
alter table public.t2_yb_haydovchi enable row level security;
alter table public.t2_yb_bekor enable row level security;
revoke all on public.t2_yb_haydovchi from public, anon, authenticated;
revoke all on public.t2_yb_bekor from public, anon, authenticated;

-- 3. Narx formulasi — TAXMINIY default (faqat baho; platforma admini o'zgartiradi: t2_yb_p2_sozlama_saqla_v1)
insert into public.t2_yb_sozlama (kalit, qiymat, izoh) values
  ('narx_baza', '50000'::jsonb, 'Baza narx, so''m QQS siz (TAXMINIY default; kalibrovka kerak).'),
  ('narx_km_sinf', '{"yengil":2500,"kichik":4000,"orta":6500,"katta":9500,"samosval":8500,"tent":9000,"ref":12500}'::jsonb, 'Mashina sinfi bo''yicha so''m/km QQS siz (TAXMINIY).'),
  ('yuklash_narx', '80000'::jsonb, 'Yuklash/tushirish xizmati, so''m QQS siz (ixtiyoriy qator; TAXMINIY).'),
  ('kutish_soat_narx', '40000'::jsonb, 'Kutish, so''m/soat QQS siz (bepul 30 daqiqadan keyin; TAXMINIY).'),
  ('yaqin_radius_km', '150'::jsonb, 'Yangi yuk bildirishnomasi radiusi, km.')
on conflict (kalit) do nothing;

-- 4. Yordamchilar
create or replace function public._t2_yb_p2_bron_ruxsat(p_b public.t2_yb_bron, p_actor bigint) returns boolean
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare t public.t2_yb_tashuvchi;
begin
  if p_b.haydovchi_id is not null then return p_b.haydovchi_id = p_actor; end if;
  select * into t from public.t2_yb_tashuvchi where id = p_b.tashuvchi_id;
  return found and public._t2_yb_tashuvchi_ruxsat(t, p_actor);
end $$;

-- 5. Qabul: o'z yukini qabul qilish taqiqi, keyin P1 qabul (qat'iy narx — poyga, taklif — auktsion)
create or replace function public.t2_yb_p2_qabul_v1(p_actor_id bigint, p_operation_id uuid, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare y public.t2_yb_yuk;
begin
  select * into y from public.t2_yb_yuk where id = public._t2_yb_son(p_data, 'yuk_id')::bigint;
  if found then
    if y.yaratuvchi_id = p_actor_id
       or exists (select 1 from public.t2_azolik a where a.kompaniya_id = y.kompaniya_id and a.foydalanuvchi_id = p_actor_id and a.holat = 'faol')
       or exists (select 1 from public.t2_yb_tashuvchi t where t.foydalanuvchi_id = p_actor_id and t.kompaniya_id = y.kompaniya_id) then
      return jsonb_build_object('ok', false, 'code', 'OZ_YUKI');
    end if;
  end if;
  return public.t2_yb_p1_qabul_v1(p_actor_id, p_operation_id, p_data);
end $$;

-- 6. Firma haydovchisi qo'shish (firma a'zosi bo'lishi shart; login bo'yicha)
create or replace function public.t2_yb_p2_haydovchi_qosh_v1(p_actor_id bigint, p_operation_id uuid, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_t jsonb; tsh public.t2_yb_tashuvchi; v_login text := lower(public._t2_yb_matn(p_data, 'login', 80)); u bigint;
begin
  tsh := public._t2_yb_tashuvchi_tanla(p_actor_id, p_data);
  v_t := public._t2_yb_takror(p_actor_id, p_operation_id, 'p2_haydovchi_qosh'); if v_t is not null then return v_t; end if;
  if tsh.tur <> 'firma' or tsh.kompaniya_id is null then return jsonb_build_object('ok', false, 'code', 'FAQAT_FIRMA'); end if;
  if v_login is null then return jsonb_build_object('ok', false, 'code', 'LOGIN_KERAK'); end if;
  select id into u from public.t2_foydalanuvchi where lower(login) = v_login and holat = 'faol';
  if u is null then return jsonb_build_object('ok', false, 'code', 'FOYDALANUVCHI_TOPILMADI'); end if;
  if not exists (select 1 from public.t2_azolik a where a.kompaniya_id = tsh.kompaniya_id and a.foydalanuvchi_id = u and a.holat = 'faol') then
    return jsonb_build_object('ok', false, 'code', 'FIRMA_AZOSI_EMAS');
  end if;
  insert into public.t2_yb_haydovchi (tashuvchi_id, foydalanuvchi_id) values (tsh.id, u)
  on conflict (tashuvchi_id, foydalanuvchi_id) do update set holat = 'faol';
  return public._t2_yb_saqla_op(p_actor_id, p_operation_id, 'p2_haydovchi_qosh', jsonb_build_object('ok', true, 'haydovchi_id', u));
end $$;

-- 7. Qabul qilingan reysni firma haydovchisi/mashinasiga tayinlash (yuklashdan oldin)
create or replace function public.t2_yb_p2_tayinla_v1(p_actor_id bigint, p_operation_id uuid, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_t jsonb; tsh public.t2_yb_tashuvchi; b public.t2_yb_bron; y public.t2_yb_yuk; v_h bigint := public._t2_yb_son(p_data, 'haydovchi_id')::bigint; v_m bigint := public._t2_yb_son(p_data, 'mashina_id')::bigint;
begin
  tsh := public._t2_yb_tashuvchi_tanla(p_actor_id, p_data);
  v_t := public._t2_yb_takror(p_actor_id, p_operation_id, 'p2_tayinla'); if v_t is not null then return v_t; end if;
  select * into b from public.t2_yb_bron where id = public._t2_yb_son(p_data, 'bron_id')::bigint and tashuvchi_id = tsh.id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'BRON_TOPILMADI'); end if;
  if b.holat <> 'bron' or b.qadam not in ('bron', 'keldi') then return jsonb_build_object('ok', false, 'code', 'HOLAT', 'holat', b.holat, 'qadam', b.qadam); end if;
  if v_h is null or not exists (select 1 from public.t2_yb_haydovchi where tashuvchi_id = tsh.id and foydalanuvchi_id = v_h and holat = 'faol') then
    return jsonb_build_object('ok', false, 'code', 'HAYDOVCHI_FIRMANIKI_EMAS');
  end if;
  if v_m is not null and not exists (select 1 from public.t2_yb_mashina where id = v_m and tashuvchi_id = tsh.id and holat = 'faol') then
    return jsonb_build_object('ok', false, 'code', 'MASHINA_FIRMANIKI_EMAS');
  end if;
  update public.t2_yb_bron set haydovchi_id = v_h, mashina_id = coalesce(v_m, mashina_id), tayinlandi_vaqt = now() where id = b.id;
  select * into y from public.t2_yb_yuk where id = b.yuk_id;
  perform public._t2_yb_hodisa(y.id, b.id, 'tayinlandi', p_actor_id, jsonb_build_object('haydovchi_id', v_h));
  perform public._t2_yb_outbox(y, 'yuk.tayinlandi', p_actor_id, p_operation_id, array[v_h]::bigint[], jsonb_build_object('bron_id', b.id));
  return public._t2_yb_saqla_op(p_actor_id, p_operation_id, 'p2_tayinla', jsonb_build_object('ok', true, 'bron_id', b.id, 'haydovchi_id', v_h));
end $$;

-- 8. Qadamlar (P2): tayinlangan bo'lsa FAQAT shu haydovchi; aks holda tashuvchi (yoki firma dispetcheri). Har qadamda yuk egasiga outbox.
create or replace function public.t2_yb_p2_qadam_v1(p_actor_id bigint, p_operation_id uuid, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_t jsonb; b public.t2_yb_bron; y public.t2_yb_yuk; v_q text := public._t2_yb_matn(p_data, 'qadam', 20);
  v_nom text := public._t2_yb_matn(p_data, 'qabul_nom', 200); v_kod text := public._t2_yb_matn(p_data, 'kod', 10); v_imzo text := public._t2_yb_matn(p_data, 'imzo_r2_kalit', 500); v_oldin text;
begin
  if p_actor_id is null or not exists (select 1 from public.t2_foydalanuvchi where id = p_actor_id and holat = 'faol') then raise exception 'PERMISSION_DENIED' using errcode = '42501'; end if;
  v_t := public._t2_yb_takror(p_actor_id, p_operation_id, 'p2_qadam'); if v_t is not null then return v_t; end if;
  if v_q is null or v_q not in ('keldi', 'yuklandi', 'yolda', 'yetkazdi') then return jsonb_build_object('ok', false, 'code', 'QADAM_NOTOGRI'); end if;
  select * into b from public.t2_yb_bron where id = public._t2_yb_son(p_data, 'bron_id')::bigint for update;
  if not found or not public._t2_yb_p2_bron_ruxsat(b, p_actor_id) then return jsonb_build_object('ok', false, 'code', 'BRON_TOPILMADI'); end if;
  select * into y from public.t2_yb_yuk where id = b.yuk_id for update;
  v_oldin := case v_q when 'keldi' then 'bron' when 'yuklandi' then 'keldi' when 'yolda' then 'yuklandi' else 'yolda' end;
  if b.qadam <> v_oldin then return jsonb_build_object('ok', false, 'code', 'QADAM_TARTIB', 'qadam', b.qadam); end if;
  if v_q <> 'yetkazdi' and b.holat <> 'bron' then return jsonb_build_object('ok', false, 'code', 'HOLAT', 'holat', b.holat); end if;
  if v_q in ('yuklandi', 'yolda') and not exists (select 1 from public.t2_yb_dalil where bron_id = b.id and tur = 'yuklash') then return jsonb_build_object('ok', false, 'code', 'DALIL_KERAK'); end if;
  if v_q = 'yetkazdi' then
    if v_nom is null and v_kod is null then return jsonb_build_object('ok', false, 'code', 'QABUL_NOM_KERAK'); end if;
    if v_kod is not null and v_kod <> b.qabul_kod then
      perform public._t2_yb_hodisa(y.id, b.id, 'kod_xato', p_actor_id);
      return jsonb_build_object('ok', false, 'code', 'KOD_NOTOGRI');
    end if;
    if v_kod is null and not exists (select 1 from public.t2_yb_dalil where bron_id = b.id and tur = 'yetkazish') then return jsonb_build_object('ok', false, 'code', 'DALIL_KERAK'); end if;
  end if;
  if v_q = 'yolda' then
    update public.t2_yb_bron set qadam = 'yolda', holat = 'yolda', yuklandi_vaqt = coalesce(yuklandi_vaqt, now()) where id = b.id;
    update public.t2_yb_yuk set holat = 'yolda', versiya = versiya + 1, yangilandi = now() where id = y.id returning * into y;
  elsif v_q = 'yetkazdi' then
    update public.t2_yb_bron set qadam = 'yetkazdi', holat = 'yetkazildi', yetkazildi_vaqt = now(), qabul_nom = coalesce(v_nom, qabul_nom), imzo_r2_kalit = coalesce(v_imzo, imzo_r2_kalit) where id = b.id;
    update public.t2_yb_yuk set holat = 'yetkazildi', versiya = versiya + 1, yangilandi = now() where id = y.id returning * into y;
    update public.t2_yb_joy set yopildi = true where bron_id = b.id;
  else
    update public.t2_yb_bron set qadam = v_q, keldi_vaqt = case when v_q = 'keldi' then now() else keldi_vaqt end where id = b.id;
    select * into y from public.t2_yb_yuk where id = y.id;
  end if;
  perform public._t2_yb_hodisa(y.id, b.id, case v_q when 'yolda' then 'yolda' when 'yetkazdi' then 'yetkazildi' else v_q end, p_actor_id);
  perform public._t2_yb_outbox(y, 'yuk.qadam', p_actor_id, p_operation_id, '{}'::bigint[], jsonb_build_object('bron_id', b.id, 'qadam', v_q));
  if v_q = 'yetkazdi' then
    update public.t2_yb_yuk set qabul_so_rov_vaqt = now() where id = y.id and buyurtma_id is not null and qabul_so_rov_vaqt is null returning * into y;
    if found then
      perform public._t2_yb_outbox(y, 'yuk.qabul_kerak', p_actor_id, p_operation_id, '{}'::bigint[], jsonb_build_object('bron_id', b.id, 'buyurtma_id', y.buyurtma_id));
    end if;
  end if;
  return public._t2_yb_saqla_op(p_actor_id, p_operation_id, 'p2_qadam', jsonb_build_object('ok', true, 'bron_id', b.id, 'qadam', v_q));
end $$;

-- 9. Joy (P2): faqat faol reysda va faqat vakolatli (tayinlangan haydovchi yoki tashuvchi); bitta qator upsert
create or replace function public.t2_yb_p2_joy_v1(p_actor_id bigint, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare b public.t2_yb_bron; j public.t2_yb_joy; v_lat numeric := public._t2_yb_son(p_data, 'lat'); v_lng numeric := public._t2_yb_son(p_data, 'lng');
  v_an integer := public._t2_yb_son(p_data, 'aniqlik_m')::integer; v_iz jsonb;
begin
  if p_actor_id is null or not exists (select 1 from public.t2_foydalanuvchi where id = p_actor_id and holat = 'faol') then raise exception 'PERMISSION_DENIED' using errcode = '42501'; end if;
  if v_lat is null or v_lng is null or v_lat not between -90 and 90 or v_lng not between -180 and 180 then return jsonb_build_object('ok', false, 'code', 'KOORDINATA_NOTOGRI'); end if;
  select * into b from public.t2_yb_bron where id = public._t2_yb_son(p_data, 'bron_id')::bigint;
  if not found or not public._t2_yb_p2_bron_ruxsat(b, p_actor_id) then return jsonb_build_object('ok', false, 'code', 'BRON_TOPILMADI'); end if;
  if b.holat not in ('bron', 'yolda') then return jsonb_build_object('ok', false, 'code', 'REYS_FAOL_EMAS', 'holat', b.holat); end if;
  select * into j from public.t2_yb_joy where bron_id = b.id for update;
  v_iz := coalesce(j.iz, '[]'::jsonb);
  if jsonb_array_length(v_iz) = 0 or public._t2_yb_masofa_km(((v_iz -> -1) ->> 0)::numeric, ((v_iz -> -1) ->> 1)::numeric, v_lat, v_lng) >= 0.15 then
    v_iz := v_iz || jsonb_build_array(jsonb_build_array(round(v_lat, 5), round(v_lng, 5), extract(epoch from now())::bigint));
  end if;
  if jsonb_array_length(v_iz) > 120 then
    select jsonb_agg(e order by ord) into v_iz from jsonb_array_elements(v_iz) with ordinality as t(e, ord) where ord % 2 = 1 or ord = jsonb_array_length(v_iz);
  end if;
  insert into public.t2_yb_joy (bron_id, lat, lng, aniqlik_m, vaqt, iz) values (b.id, v_lat, v_lng, v_an, now(), v_iz)
  on conflict (bron_id) do update set lat = excluded.lat, lng = excluded.lng, aniqlik_m = excluded.aniqlik_m, vaqt = excluded.vaqt, iz = excluded.iz;
  update public.t2_yb_tashuvchi set joy_lat = v_lat, joy_lng = v_lng, joy_vaqt = now() where id = b.tashuvchi_id and foydalanuvchi_id = p_actor_id;
  return jsonb_build_object('ok', true, 'bron_id', b.id, 'iz_soni', jsonb_array_length(v_iz));
end $$;

-- 9b. Isbot fayli (P2): tayinlangan haydovchi yoki tashuvchi (R2 kaliti + sha256)
create or replace function public.t2_yb_p2_dalil_v1(p_actor_id bigint, p_operation_id uuid, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_t jsonb; b public.t2_yb_bron; v_tur text := public._t2_yb_matn(p_data, 'tur', 20); v_key text := public._t2_yb_matn(p_data, 'r2_kalit', 500);
  v_sha text := lower(public._t2_yb_matn(p_data, 'sha256', 64)); v_id bigint;
begin
  if p_actor_id is null or not exists (select 1 from public.t2_foydalanuvchi where id = p_actor_id and holat = 'faol') then raise exception 'PERMISSION_DENIED' using errcode = '42501'; end if;
  v_t := public._t2_yb_takror(p_actor_id, p_operation_id, 'p2_dalil'); if v_t is not null then return v_t; end if;
  if v_tur is null or v_tur not in ('yuklash', 'yetkazish', 'nizo') then return jsonb_build_object('ok', false, 'code', 'TUR_NOTOGRI'); end if;
  if v_key is null then return jsonb_build_object('ok', false, 'code', 'FAYL_KERAK'); end if;
  if v_sha is not null and v_sha !~ '^[0-9a-f]{64}$' then return jsonb_build_object('ok', false, 'code', 'SHA_NOTOGRI'); end if;
  select * into b from public.t2_yb_bron where id = public._t2_yb_son(p_data, 'bron_id')::bigint;
  if not found or not public._t2_yb_p2_bron_ruxsat(b, p_actor_id) then return jsonb_build_object('ok', false, 'code', 'BRON_TOPILMADI'); end if;
  if b.holat not in ('bron', 'yolda', 'yetkazildi', 'nizo') then return jsonb_build_object('ok', false, 'code', 'HOLAT', 'holat', b.holat); end if;
  if (select count(*) from public.t2_yb_dalil where bron_id = b.id) >= 20 then return jsonb_build_object('ok', false, 'code', 'FAYL_CHEGARA'); end if;
  insert into public.t2_yb_dalil (bron_id, tur, r2_kalit, sha256, yaratuvchi_id) values (b.id, v_tur, v_key, v_sha, p_actor_id) returning id into v_id;
  perform public._t2_yb_hodisa(b.yuk_id, b.id, 'dalil', p_actor_id, jsonb_build_object('tur', v_tur, 'dalil_id', v_id));
  return public._t2_yb_saqla_op(p_actor_id, p_operation_id, 'p2_dalil', jsonb_build_object('ok', true, 'dalil_id', v_id));
end $$;
-- 10. Reyslar: o'zi (tayinlangan) + firma hammasi (dispetcher). mening = qadam bajara oladimi.
create or replace function public.t2_yb_p2_reys_v1(p_actor_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if p_actor_id is null or not exists (select 1 from public.t2_foydalanuvchi where id = p_actor_id and holat = 'faol') then raise exception 'PERMISSION_DENIED' using errcode = '42501'; end if;
  return jsonb_build_object('ok', true, 'bronlar', coalesce((select jsonb_agg(z order by z.id desc) from (
    select b.id, b.yuk_id, b.holat, b.qadam, b.narx_qqs_siz, y.nom as yuk, y.a_nom, y.b_nom, y.a_lat, y.a_lng, y.b_lat, y.b_lng, b.yetkazildi_vaqt, b.haydovchi_id,
      (select f.ism from public.t2_foydalanuvchi f where f.id = b.haydovchi_id) as haydovchi, y.buyurtma_id,
      public._t2_yb_p2_bron_ruxsat(b, p_actor_id) as mening,
      exists (select 1 from public.t2_yb_baho h where h.bron_id = b.id and h.kimdan_turi = 'tashuvchi') as baholangan
    from public.t2_yb_bron b join public.t2_yb_yuk y on y.id = b.yuk_id join public.t2_yb_tashuvchi t on t.id = b.tashuvchi_id
    where b.holat <> 'bekor' and (b.haydovchi_id = p_actor_id or t.foydalanuvchi_id = p_actor_id
      or (t.kompaniya_id is not null and public.t2_permission_allowed_v2(t.kompaniya_id, p_actor_id, 'logistics.dispatch')))
    order by b.id desc limit 50) z), '[]'::jsonb));
end $$;

-- 11. Firma: haydovchilar + mashinalar (dispetcher)
create or replace function public.t2_yb_p2_park_ol_v1(p_actor_id bigint, p_data jsonb)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare tsh public.t2_yb_tashuvchi;
begin
  tsh := public._t2_yb_tashuvchi_tanla(p_actor_id, p_data);
  return jsonb_build_object('ok', true, 'tashuvchi_id', tsh.id, 'tur', tsh.tur,
    'haydovchilar', coalesce((select jsonb_agg(jsonb_build_object('foydalanuvchi_id', h.foydalanuvchi_id, 'ism', f.ism, 'holat', h.holat) order by h.id)
      from public.t2_yb_haydovchi h join public.t2_foydalanuvchi f on f.id = h.foydalanuvchi_id where h.tashuvchi_id = tsh.id), '[]'::jsonb),
    'mashinalar', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'davlat_raqami', m.davlat_raqami, 'turi', m.turi, 'yuk_t', m.yuk_t, 'holat', m.holat) order by m.id)
      from public.t2_yb_mashina m where m.tashuvchi_id = tsh.id), '[]'::jsonb));
end $$;

-- 11b. Buyurtmalarga bog'langan yuklar (zayavka sahifasi: «yetkazildi — qabul qiling»). Faqat shu kompaniya yuklari.
create or replace function public.t2_yb_p2_buyurtma_yuklar_v1(p_kompaniya_id bigint, p_actor_id bigint, p_ids bigint[])
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'procurement.read');
  return jsonb_build_object('ok', true, 'yuklar', coalesce((select jsonb_agg(jsonb_build_object('buyurtma_id', y.buyurtma_id, 'yuk_id', y.id, 'holat', y.holat, 'qabul_so_rov', y.qabul_so_rov_vaqt is not null) order by y.id)
    from public.t2_yb_yuk y where y.kompaniya_id = p_kompaniya_id and y.buyurtma_id = any (p_ids) and y.holat <> 'bekor'), '[]'::jsonb));
end $$;
-- 12. Yuk egasi kuzatuvi (P2): P1 + haydovchi, arxiv, masofa/davomiylik
create or replace function public.t2_yb_p2_ega_kuzat_v1(p_kompaniya_id bigint, p_actor_id bigint, p_yuk_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare y public.t2_yb_yuk; b public.t2_yb_bron; j public.t2_yb_joy; t public.t2_yb_tashuvchi;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'procurement.read');
  select * into y from public.t2_yb_yuk where id = p_yuk_id and kompaniya_id = p_kompaniya_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'YUK_TOPILMADI'); end if;
  select * into b from public.t2_yb_bron where yuk_id = y.id and holat <> 'bekor';
  if not found then return jsonb_build_object('ok', true, 'yuk_holat', y.holat, 'bron', null, 'joy', null, 'qabul_so_rov', y.qabul_so_rov_vaqt is not null, 'buyurtma_id', y.buyurtma_id); end if;
  select * into t from public.t2_yb_tashuvchi where id = b.tashuvchi_id;
  select * into j from public.t2_yb_joy where bron_id = b.id;
  return jsonb_build_object('ok', true, 'yuk_holat', y.holat, 'buyurtma_id', y.buyurtma_id, 'qabul_so_rov', y.qabul_so_rov_vaqt is not null,
    'bron', jsonb_build_object('id', b.id, 'holat', b.holat, 'qadam', b.qadam, 'qabul_kod', b.qabul_kod, 'tashuvchi', t.ism, 'telefon', t.telefon, 'reyting', t.reyting_ortacha,
      'reyting_soni', t.reyting_soni, 'qabul_nom', b.qabul_nom, 'yetkazildi_vaqt', b.yetkazildi_vaqt,
      'haydovchi', (select f.ism from public.t2_foydalanuvchi f where f.id = b.haydovchi_id)),
    'joy', case when j.bron_id is null then null else jsonb_build_object('lat', j.lat, 'lng', j.lng, 'vaqt', j.vaqt, 'soniya_oldin', extract(epoch from (now() - j.vaqt))::int,
      'iz', j.iz, 'arxivlandi', j.arxivlandi, 'iz_km', j.iz_km, 'iz_daqiqa', j.iz_daqiqa) end);
end $$;

-- 13. Iz arxivi: ol (kimga ruxsat bo'lsa, faqat yetkazilgan va arxivlanmagan) -> R2 ga yozilgach arxivla (iz bo'shatiladi, km/daqiqa qoladi)
create or replace function public.t2_yb_p2_iz_ol_v1(p_actor_id bigint, p_bron_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare b public.t2_yb_bron; j public.t2_yb_joy;
begin
  select * into b from public.t2_yb_bron where id = p_bron_id;
  if not found or not public._t2_yb_p2_bron_ruxsat(b, p_actor_id) then return jsonb_build_object('ok', false, 'code', 'BRON_TOPILMADI'); end if;
  if b.holat not in ('yetkazildi', 'yopildi') then return jsonb_build_object('ok', false, 'code', 'HOLAT', 'holat', b.holat); end if;
  select * into j from public.t2_yb_joy where bron_id = b.id;
  if not found then return jsonb_build_object('ok', true, 'iz', null); end if;
  if j.arxivlandi then return jsonb_build_object('ok', true, 'iz', null, 'arxivlandi', true); end if;
  return jsonb_build_object('ok', true, 'iz', j.iz, 'arxivlandi', false);
end $$;

create or replace function public.t2_yb_p2_iz_arxivla_v1(p_actor_id bigint, p_bron_id bigint, p_r2_kalit text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare b public.t2_yb_bron; j public.t2_yb_joy; v_km numeric := 0; i integer; v_n integer;
begin
  select * into b from public.t2_yb_bron where id = p_bron_id for update;
  if not found or not public._t2_yb_p2_bron_ruxsat(b, p_actor_id) then return jsonb_build_object('ok', false, 'code', 'BRON_TOPILMADI'); end if;
  if b.holat not in ('yetkazildi', 'yopildi') then return jsonb_build_object('ok', false, 'code', 'HOLAT', 'holat', b.holat); end if;
  if p_r2_kalit is null or p_r2_kalit not like 'yb/iz/%' or length(p_r2_kalit) > 500 then return jsonb_build_object('ok', false, 'code', 'R2_KALIT_NOTOGRI'); end if;
  select * into j from public.t2_yb_joy where bron_id = b.id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'IZ_YOQ'); end if;
  if j.arxivlandi then return jsonb_build_object('ok', true, 'takror', true, 'iz_km', j.iz_km); end if;
  v_n := jsonb_array_length(j.iz);
  for i in 1..greatest(v_n - 1, 0) loop
    v_km := v_km + coalesce(public._t2_yb_masofa_km(((j.iz -> (i - 1)) ->> 0)::numeric, ((j.iz -> (i - 1)) ->> 1)::numeric, ((j.iz -> i) ->> 0)::numeric, ((j.iz -> i) ->> 1)::numeric), 0);
  end loop;
  update public.t2_yb_joy set arxivlandi = true, iz_r2_kalit = p_r2_kalit, iz_nuqta_soni = v_n, iz_km = round(v_km, 2),
    iz_daqiqa = case when b.yuklandi_vaqt is not null and b.yetkazildi_vaqt is not null then (extract(epoch from (b.yetkazildi_vaqt - b.yuklandi_vaqt)) / 60)::int end,
    iz = '[]'::jsonb where bron_id = b.id;
  return jsonb_build_object('ok', true, 'iz_nuqta_soni', v_n, 'iz_km', round(v_km, 2));
end $$;

-- 14. Platforma sozlamasi (faqat boshqaruv/superadmin): narx formulasi qiymatlari
create or replace function public.t2_yb_p2_sozlama_saqla_v1(p_actor_id bigint, p_operation_id uuid, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_t jsonb; v_k text := public._t2_yb_matn(p_data, 'kalit', 60);
begin
  perform public._t2_boshqaruv_tekshir(p_actor_id);
  v_t := public._t2_yb_takror(p_actor_id, p_operation_id, 'p2_sozlama'); if v_t is not null then return v_t; end if;
  if v_k is null or v_k not in ('stavka_tkm', 'min_tarif', 'narx_baza', 'narx_km_sinf', 'yuklash_narx', 'kutish_soat_narx', 'yaqin_radius_km', 'diapazon_foiz') then return jsonb_build_object('ok', false, 'code', 'KALIT_NOTOGRI'); end if;
  if not jsonb_exists(p_data, 'qiymat') then return jsonb_build_object('ok', false, 'code', 'QIYMAT_KERAK'); end if;
  update public.t2_yb_sozlama set qiymat = p_data -> 'qiymat', yangilandi = now() where kalit = v_k;
  return public._t2_yb_saqla_op(p_actor_id, p_operation_id, 'p2_sozlama', jsonb_build_object('ok', true, 'kalit', v_k));
end $$;

-- 15. Bekor qilish yozuvi (ma'lumot): bron 'bekor' ga o'tganda sabab kodi bilan. Pul harakati yo'q.
create or replace function public._t2_yb_p2_bekor_trg() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_kod text;
begin
  v_kod := case coalesce(new.bekor_sabab, '')
    when 'Mashina buzildi' then 'mashina_buzildi' when 'Yuk egasi bilan kelisha olmadik' then 'kelisha_olmadik'
    when 'Manzil noto‘g‘ri' then 'manzil_notogri' when 'Shaxsiy sabab' then 'shaxsiy' else 'boshqa' end;
  insert into public.t2_yb_bekor (bron_id, yuk_id, kim, sabab_kod, sabab) values (new.id, new.yuk_id, coalesce(new.bekor_kim, 'tizim'), v_kod, left(new.bekor_sabab, 1000))
  on conflict (bron_id) do nothing;
  return new;
end $$;
drop trigger if exists t2_yb_p2_bekor on public.t2_yb_bron;
create trigger t2_yb_p2_bekor after update of holat on public.t2_yb_bron for each row when (new.holat = 'bekor' and old.holat is distinct from 'bekor') execute function public._t2_yb_p2_bekor_trg();

-- 16. Yangi yuk e'loni -> yaqin onlayn haydovchilar (outbox; xato bo'lsa e'lon BUZILMAYDI)
create or replace function public._t2_yb_p2_yaqin_trg() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_rad numeric := coalesce((public._t2_yb_param('yaqin_radius_km') #>> '{}')::numeric, 150); v_ids bigint[];
begin
  if new.a_lat is null or new.a_lng is null then return new; end if;
  select coalesce(array_agg(q.foydalanuvchi_id), '{}'::bigint[]) into v_ids from (
    select t.foydalanuvchi_id from public.t2_yb_tashuvchi t
    where t.onlayn and t.holat = 'faol' and t.joy_lat is not null and t.foydalanuvchi_id <> new.yaratuvchi_id
      and public._t2_yb_masofa_km(t.joy_lat, t.joy_lng, new.a_lat, new.a_lng) <= v_rad
    order by public._t2_yb_masofa_km(t.joy_lat, t.joy_lng, new.a_lat, new.a_lng) limit 30) q;
  if coalesce(array_length(v_ids, 1), 0) > 0 then
    perform public._t2_yb_outbox(new, 'yuk.yaqin_yangi', new.yaratuvchi_id, md5('yaqin:' || new.id::text)::uuid, v_ids, jsonb_build_object('nom', new.nom));
  end if;
  return new;
exception when others then
  raise warning 't2_yb yaqin bildirishnoma xatosi: %', sqlerrm;
  return new;
end $$;
drop trigger if exists t2_yb_p2_yaqin on public.t2_yb_yuk;
create trigger t2_yb_p2_yaqin after update of holat on public.t2_yb_yuk for each row when (new.holat = 'elon' and old.holat is distinct from 'elon') execute function public._t2_yb_p2_yaqin_trg();

do $grant$ declare f text; begin
  foreach f in array array[
    'public._t2_yb_p2_bron_ruxsat(public.t2_yb_bron,bigint)', 'public._t2_yb_p2_bekor_trg()', 'public._t2_yb_p2_yaqin_trg()',
    'public.t2_yb_p2_qabul_v1(bigint,uuid,jsonb)', 'public.t2_yb_p2_haydovchi_qosh_v1(bigint,uuid,jsonb)', 'public.t2_yb_p2_tayinla_v1(bigint,uuid,jsonb)',
    'public.t2_yb_p2_qadam_v1(bigint,uuid,jsonb)', 'public.t2_yb_p2_dalil_v1(bigint,uuid,jsonb)', 'public.t2_yb_p2_joy_v1(bigint,jsonb)', 'public.t2_yb_p2_reys_v1(bigint)', 'public.t2_yb_p2_park_ol_v1(bigint,jsonb)', 'public.t2_yb_p2_buyurtma_yuklar_v1(bigint,bigint,bigint[])',
    'public.t2_yb_p2_ega_kuzat_v1(bigint,bigint,bigint)', 'public.t2_yb_p2_iz_ol_v1(bigint,bigint)', 'public.t2_yb_p2_iz_arxivla_v1(bigint,bigint,text)',
    'public.t2_yb_p2_sozlama_saqla_v1(bigint,uuid,jsonb)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $grant$;
