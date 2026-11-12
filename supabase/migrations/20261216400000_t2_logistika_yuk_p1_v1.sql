-- T2 LOGISTIKA / YUK TASHISH — Phase 1 (docs/architecture/BOZOR_TENDER_LOGISTIKA.md §C, §G).
-- ADDITIVE: 20261201000000 (t2_yb_*) jadvallari va RPC lari O'ZGARMAYDI; faqat nullable/defaultli ustunlar, bitta yangi jadval (t2_yb_joy) va yangi RPC lar.
-- Nima qo'shiladi:
--   * yuk: narx_rejim ('qat_iy' = tizim hisoblagan qat'iy narx, birinchi qabul qilgan yutadi | 'taklif' = «taklif so'rash» auktsioni), mashina_sinf,
--     zayavka_id / buyurtma_id (bir bosishda to'ldirish), qabul_so_rov_vaqt (yetkazgach omborga qabul so'rovi — bir marta).
--   * tashuvchi: onlayn + oxirgi ma'lum joy (bitta qator, upsert).
--   * bron: qadam (bron -> keldi -> yuklandi -> yolda -> yetkazdi), keldi_vaqt, qabul_nom (qabul qiluvchi), imzo_r2_kalit.
--   * t2_yb_joy: har faol reys uchun BITTA qator (oxirgi joy + soddalashtirilgan iz, <=120 nuqta). Row-per-ping YO'Q.
--   * RPC: holat (onlayn/joy), yaqin (masofa bo'yicha yuklar), qabul (qat'iy narx / taklif, rejim tekshiruvi bilan), qadam (tartibli), joy (ping),
--          yuk_qosh (rejim, sinf, zayavka/buyurtma), ega_kuzat (yuk egasi: reys + oxirgi joy).
-- Pul: narx QQS siz; NULL = noma'lum. Escrow YO'Q: faqat to'lov holati (t2_yb_tolov ko'zgusi o'zgarmaydi).
-- Sklad: «qoralama» tushunchasi omborda yo'q — yetkazilgach buyurtma egasiga bitta marta «omborga qabul qiling» so'rovi (outbox) yuboriladi; kirim
--        mavjud t2_buyurtma_qabul_v1 + yakunla bilan, ikki marta kiritilmaydi. Iz R2 ga arxivlash keyingi qadam (hozir shu qatorda, ~2 KB).
-- Prodga: AVVAL shu SQL prodda (BEGIN..ROLLBACK acceptance bilan), KEYIN PR merge. Rollback: .rollback.sql. BEGIN/COMMIT yo'q (qo'llovchi o'raydi).
set local statement_timeout = '300s';

-- 1. Ustunlar (additive)
alter table public.t2_yb_yuk add column if not exists narx_rejim text not null default 'qat_iy';
alter table public.t2_yb_yuk drop constraint if exists t2_yb_yuk_narx_rejim_chk;
alter table public.t2_yb_yuk add constraint t2_yb_yuk_narx_rejim_chk check (narx_rejim in ('qat_iy', 'taklif'));
alter table public.t2_yb_yuk add column if not exists mashina_sinf text;
alter table public.t2_yb_yuk drop constraint if exists t2_yb_yuk_mashina_sinf_chk;
alter table public.t2_yb_yuk add constraint t2_yb_yuk_mashina_sinf_chk check (mashina_sinf is null or mashina_sinf in ('yengil', 'kichik', 'orta', 'katta', 'samosval', 'tent', 'ref'));
alter table public.t2_yb_yuk add column if not exists zayavka_id bigint;
alter table public.t2_yb_yuk add column if not exists buyurtma_id bigint references public.t2_buyurtma(id) on delete set null;
alter table public.t2_yb_yuk add column if not exists qabul_so_rov_vaqt timestamptz;

alter table public.t2_yb_tashuvchi add column if not exists onlayn boolean not null default false;
alter table public.t2_yb_tashuvchi add column if not exists joy_lat numeric(9, 6);
alter table public.t2_yb_tashuvchi add column if not exists joy_lng numeric(9, 6);
alter table public.t2_yb_tashuvchi add column if not exists joy_vaqt timestamptz;

alter table public.t2_yb_bron add column if not exists qadam text not null default 'bron';
alter table public.t2_yb_bron drop constraint if exists t2_yb_bron_qadam_chk;
alter table public.t2_yb_bron add constraint t2_yb_bron_qadam_chk check (qadam in ('bron', 'keldi', 'yuklandi', 'yolda', 'yetkazdi'));
alter table public.t2_yb_bron add column if not exists keldi_vaqt timestamptz;
alter table public.t2_yb_bron add column if not exists qabul_nom text;
alter table public.t2_yb_bron drop constraint if exists t2_yb_bron_qabul_nom_chk;
alter table public.t2_yb_bron add constraint t2_yb_bron_qabul_nom_chk check (qabul_nom is null or length(qabul_nom) <= 200);
alter table public.t2_yb_bron add column if not exists imzo_r2_kalit text;
alter table public.t2_yb_bron drop constraint if exists t2_yb_bron_imzo_chk;
alter table public.t2_yb_bron add constraint t2_yb_bron_imzo_chk check (imzo_r2_kalit is null or length(imzo_r2_kalit) between 3 and 500);

create index if not exists t2_yb_yuk_buyurtma_idx on public.t2_yb_yuk (buyurtma_id) where buyurtma_id is not null;
create index if not exists t2_yb_tashuvchi_onlayn_idx on public.t2_yb_tashuvchi (id) where onlayn;

-- 2. Oxirgi joy: har faol reys uchun bitta qator
create table if not exists public.t2_yb_joy (
  bron_id bigint primary key references public.t2_yb_bron(id) on delete cascade,
  lat numeric(9, 6) not null check (lat between -90 and 90),
  lng numeric(9, 6) not null check (lng between -180 and 180),
  aniqlik_m integer check (aniqlik_m is null or aniqlik_m between 0 and 100000),
  vaqt timestamptz not null default now(),
  iz jsonb not null default '[]'::jsonb check (jsonb_typeof(iz) = 'array'),
  yopildi boolean not null default false
);
alter table public.t2_yb_joy enable row level security;
revoke all on public.t2_yb_joy from public, anon, authenticated;

-- 3. Yordamchi: ikki nuqta orasidagi masofa (km, haversine; yo'l masofasi emas)
create or replace function public._t2_yb_masofa_km(a_lat numeric, a_lng numeric, b_lat numeric, b_lng numeric) returns numeric
language sql immutable set search_path = public, pg_temp as $$
  select case when a_lat is null or a_lng is null or b_lat is null or b_lng is null then null
    else round((6371 * 2 * asin(least(1::float8, sqrt(
      power(sin(radians((b_lat - a_lat)::float8) / 2), 2)
      + cos(radians(a_lat::float8)) * cos(radians(b_lat::float8)) * power(sin(radians((b_lng - a_lng)::float8) / 2), 2)))))::numeric, 2) end
$$;

-- 4. Haydovchi: onlayn/oflayn + joy
create or replace function public.t2_yb_p1_holat_v1(p_actor_id bigint, p_operation_id uuid, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare tsh public.t2_yb_tashuvchi; v_on boolean := coalesce((p_data ->> 'onlayn')::boolean, false);
  v_lat numeric := public._t2_yb_son(p_data, 'lat'); v_lng numeric := public._t2_yb_son(p_data, 'lng');
begin
  tsh := public._t2_yb_tashuvchi_tanla(p_actor_id, p_data);
  if (v_lat is null) <> (v_lng is null) or v_lat not between -90 and 90 or v_lng not between -180 and 180 then
    return jsonb_build_object('ok', false, 'code', 'KOORDINATA_NOTOGRI');
  end if;
  update public.t2_yb_tashuvchi set onlayn = v_on, joy_lat = coalesce(v_lat, joy_lat), joy_lng = coalesce(v_lng, joy_lng),
    joy_vaqt = case when v_lat is not null then now() else joy_vaqt end where id = tsh.id returning * into tsh;
  return jsonb_build_object('ok', true, 'onlayn', tsh.onlayn, 'joy_vaqt', tsh.joy_vaqt);
end $$;

-- 5. Yaqin yuklar (masofa bo'yicha). Egasi kontakti YO'Q; A nuqta ~1 km aniqlikda (2 xona) — bron'gacha aniq manzil yashirin.
create or replace function public.t2_yb_p1_yaqin_v1(p_actor_id bigint, p_filtr jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare tsh public.t2_yb_tashuvchi; v_lat numeric := public._t2_yb_son(p_filtr, 'lat'); v_lng numeric := public._t2_yb_son(p_filtr, 'lng');
  v_rad numeric := least(greatest(coalesce(public._t2_yb_son(p_filtr, 'radius_km'), 150), 1), 1500);
  v_lim integer := least(greatest(coalesce(public._t2_yb_son(p_filtr, 'limit')::integer, 30), 1), 100); v_t numeric;
begin
  if p_actor_id is null or not exists (select 1 from public.t2_foydalanuvchi where id = p_actor_id and holat = 'faol') then raise exception 'PERMISSION_DENIED' using errcode = '42501'; end if;
  select * into tsh from public.t2_yb_tashuvchi where foydalanuvchi_id = p_actor_id and holat = 'faol';
  if not found then return jsonb_build_object('ok', false, 'code', 'YB_TASHUVCHI_YOQ'); end if;
  v_lat := coalesce(v_lat, tsh.joy_lat); v_lng := coalesce(v_lng, tsh.joy_lng);
  if v_lat is null or v_lng is null then return jsonb_build_object('ok', false, 'code', 'JOY_KERAK'); end if;
  select max(yuk_t) into v_t from public.t2_yb_mashina where tashuvchi_id = tsh.id and holat = 'faol';
  return jsonb_build_object('ok', true, 'bolim', 'yaqin', 'yuklar', coalesce((
    select jsonb_agg(to_jsonb(z) order by z.joydan_km, z.id) from (
      select q.id, q.nom, q.yuk_turi, q.a_nom, q.b_nom, round(q.a_lat, 2) as a_lat, round(q.a_lng, 2) as a_lng, q.masofa_km, q.tonna, q.hajm_m3, q.sana_dan, q.sana_gacha,
        q.tolov_shakli, q.narx_rejim, q.mashina_sinf, q.narx_taklif_qqs_siz, q.qqs_foiz, q.holat, q.km as joydan_km
      from (select y.*, public._t2_yb_masofa_km(v_lat, v_lng, y.a_lat, y.a_lng) as km from public.t2_yb_yuk y
            where y.holat in ('elon', 'takliflar') and y.a_lat is not null and (y.sana_gacha is null or y.sana_gacha >= current_date)
              and (v_t is null or y.tonna is null or y.tonna <= v_t)) q
      where q.km <= v_rad order by q.km, q.id limit v_lim) z), '[]'::jsonb));
end $$;

-- 6. Qabul: qat'iy narxda «bron» (birinchi yutadi — taklif_ber yuk qatorini FOR UPDATE qiladi) yoki auktsionda «taklif». Rejim shu yerda tekshiriladi.
create or replace function public.t2_yb_p1_qabul_v1(p_actor_id bigint, p_operation_id uuid, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare y public.t2_yb_yuk; v_h text := coalesce(public._t2_yb_matn(p_data, 'harakat', 20), 'bron');
begin
  select * into y from public.t2_yb_yuk where id = public._t2_yb_son(p_data, 'yuk_id')::bigint;
  if not found then return jsonb_build_object('ok', false, 'code', 'YUK_TOPILMADI'); end if;
  if v_h = 'bron' and y.narx_rejim <> 'qat_iy' then return jsonb_build_object('ok', false, 'code', 'REJIM_TAKLIF'); end if;
  if v_h = 'taklif' and y.narx_rejim <> 'taklif' then return jsonb_build_object('ok', false, 'code', 'REJIM_QATIY'); end if;
  if v_h not in ('bron', 'taklif') then return jsonb_build_object('ok', false, 'code', 'HARAKAT_NOTOGRI'); end if;
  return public.t2_yb_taklif_ber_v1(p_actor_id, p_operation_id, p_data || jsonb_build_object('harakat', v_h));
end $$;

-- 7. Qadamlar: bron -> keldi -> yuklandi -> yolda -> yetkazdi. Faqat tayinlangan tashuvchi (boshqa tashuvchi uchun bron topilmaydi). Tartibdan tashqari = QADAM_TARTIB.
create or replace function public.t2_yb_p1_qadam_v1(p_actor_id bigint, p_operation_id uuid, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_t jsonb; tsh public.t2_yb_tashuvchi; b public.t2_yb_bron; y public.t2_yb_yuk; v_q text := public._t2_yb_matn(p_data, 'qadam', 20);
  v_nom text := public._t2_yb_matn(p_data, 'qabul_nom', 200); v_kod text := public._t2_yb_matn(p_data, 'kod', 10); v_imzo text := public._t2_yb_matn(p_data, 'imzo_r2_kalit', 500);
  v_r jsonb; v_op2 uuid := md5(coalesce(p_operation_id::text, '') || ':qadam')::uuid; v_oldin text;
begin
  tsh := public._t2_yb_tashuvchi_tanla(p_actor_id, p_data);
  v_t := public._t2_yb_takror(p_actor_id, p_operation_id, 'p1_qadam'); if v_t is not null then return v_t; end if;
  if v_q is null or v_q not in ('keldi', 'yuklandi', 'yolda', 'yetkazdi') then return jsonb_build_object('ok', false, 'code', 'QADAM_NOTOGRI'); end if;
  select * into b from public.t2_yb_bron where id = public._t2_yb_son(p_data, 'bron_id')::bigint and tashuvchi_id = tsh.id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'BRON_TOPILMADI'); end if;
  select * into y from public.t2_yb_yuk where id = b.yuk_id for update;
  v_oldin := case v_q when 'keldi' then 'bron' when 'yuklandi' then 'keldi' when 'yolda' then 'yuklandi' else 'yolda' end;
  if b.qadam <> v_oldin then return jsonb_build_object('ok', false, 'code', 'QADAM_TARTIB', 'qadam', b.qadam); end if;
  if v_q in ('keldi', 'yuklandi') then
    if b.holat <> 'bron' then return jsonb_build_object('ok', false, 'code', 'HOLAT', 'holat', b.holat); end if;
    if v_q = 'yuklandi' and not exists (select 1 from public.t2_yb_dalil where bron_id = b.id and tur = 'yuklash') then return jsonb_build_object('ok', false, 'code', 'DALIL_KERAK'); end if;
    update public.t2_yb_bron set qadam = v_q, keldi_vaqt = case when v_q = 'keldi' then now() else keldi_vaqt end where id = b.id;
    perform public._t2_yb_hodisa(y.id, b.id, v_q, p_actor_id);
    return public._t2_yb_saqla_op(p_actor_id, p_operation_id, 'p1_qadam', jsonb_build_object('ok', true, 'bron_id', b.id, 'qadam', v_q));
  end if;
  if v_q = 'yolda' then
    v_r := public.t2_yb_yuritish_v1(p_actor_id, v_op2, jsonb_build_object('bron_id', b.id, 'harakat', 'yukladim', 'tashuvchi_id', tsh.id));
    if not coalesce((v_r ->> 'ok')::boolean, false) then return v_r; end if;
    update public.t2_yb_bron set qadam = 'yolda' where id = b.id;
    return public._t2_yb_saqla_op(p_actor_id, p_operation_id, 'p1_qadam', jsonb_build_object('ok', true, 'bron_id', b.id, 'qadam', 'yolda'));
  end if;
  -- yetkazdi: qabul qiluvchi nomi yoki 4 xonali kod shart
  if v_nom is null and v_kod is null then return jsonb_build_object('ok', false, 'code', 'QABUL_NOM_KERAK'); end if;
  v_r := public.t2_yb_yuritish_v1(p_actor_id, v_op2, jsonb_build_object('bron_id', b.id, 'harakat', 'yetkazdim', 'kod', v_kod, 'tashuvchi_id', tsh.id));
  if not coalesce((v_r ->> 'ok')::boolean, false) then return v_r; end if;
  update public.t2_yb_bron set qadam = 'yetkazdi', qabul_nom = coalesce(v_nom, qabul_nom), imzo_r2_kalit = coalesce(v_imzo, imzo_r2_kalit) where id = b.id;
  update public.t2_yb_joy set yopildi = true where bron_id = b.id;
  -- Omborga qabul so'rovi: buyurtmadan kelgan yuk uchun BIR marta (qabul_so_rov_vaqt is null sharti)
  update public.t2_yb_yuk set qabul_so_rov_vaqt = now() where id = y.id and buyurtma_id is not null and qabul_so_rov_vaqt is null returning * into y;
  if found then
    perform public._t2_yb_outbox(y, 'yuk.qabul_kerak', p_actor_id, p_operation_id, '{}'::bigint[], jsonb_build_object('bron_id', b.id, 'buyurtma_id', y.buyurtma_id));
  end if;
  return public._t2_yb_saqla_op(p_actor_id, p_operation_id, 'p1_qadam', jsonb_build_object('ok', true, 'bron_id', b.id, 'qadam', 'yetkazdi'));
end $$;

-- 8. Joy (ping): faqat faol reysda (bron | yolda); bitta qator upsert; iz <= 120 nuqta (>=150 m siljishda qo'shiladi, to'lsa har ikkinchisi tashlanadi)
create or replace function public.t2_yb_p1_joy_v1(p_actor_id bigint, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare tsh public.t2_yb_tashuvchi; b public.t2_yb_bron; j public.t2_yb_joy; v_lat numeric := public._t2_yb_son(p_data, 'lat'); v_lng numeric := public._t2_yb_son(p_data, 'lng');
  v_an integer := public._t2_yb_son(p_data, 'aniqlik_m')::integer; v_iz jsonb; v_n integer;
begin
  tsh := public._t2_yb_tashuvchi_tanla(p_actor_id, p_data);
  if v_lat is null or v_lng is null or v_lat not between -90 and 90 or v_lng not between -180 and 180 then return jsonb_build_object('ok', false, 'code', 'KOORDINATA_NOTOGRI'); end if;
  select * into b from public.t2_yb_bron where id = public._t2_yb_son(p_data, 'bron_id')::bigint and tashuvchi_id = tsh.id;
  if not found then return jsonb_build_object('ok', false, 'code', 'BRON_TOPILMADI'); end if;
  if b.holat not in ('bron', 'yolda') then return jsonb_build_object('ok', false, 'code', 'REYS_FAOL_EMAS', 'holat', b.holat); end if;
  select * into j from public.t2_yb_joy where bron_id = b.id for update;
  v_iz := coalesce(j.iz, '[]'::jsonb); v_n := jsonb_array_length(v_iz);
  if v_n = 0 or public._t2_yb_masofa_km(((v_iz -> -1) ->> 0)::numeric, ((v_iz -> -1) ->> 1)::numeric, v_lat, v_lng) >= 0.15 then
    v_iz := v_iz || jsonb_build_array(jsonb_build_array(round(v_lat, 5), round(v_lng, 5), extract(epoch from now())::bigint));
  end if;
  if jsonb_array_length(v_iz) > 120 then
    select jsonb_agg(e order by ord) into v_iz from jsonb_array_elements(v_iz) with ordinality as t(e, ord) where ord % 2 = 1 or ord = jsonb_array_length(v_iz);
  end if;
  insert into public.t2_yb_joy (bron_id, lat, lng, aniqlik_m, vaqt, iz) values (b.id, v_lat, v_lng, v_an, now(), v_iz)
  on conflict (bron_id) do update set lat = excluded.lat, lng = excluded.lng, aniqlik_m = excluded.aniqlik_m, vaqt = excluded.vaqt, iz = excluded.iz;
  update public.t2_yb_tashuvchi set joy_lat = v_lat, joy_lng = v_lng, joy_vaqt = now() where id = tsh.id;
  return jsonb_build_object('ok', true, 'bron_id', b.id, 'iz_soni', jsonb_array_length(v_iz));
end $$;

-- 9. Yuk egasi uchun qo'shimcha maydonlar (qoralamada): narx_rejim, mashina_sinf, zayavka_id, buyurtma_id
create or replace function public.t2_yb_p1_yuk_qosh_v1(p_kompaniya_id bigint, p_actor_id bigint, p_operation_id uuid, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_t jsonb; y public.t2_yb_yuk; v_rejim text := public._t2_yb_matn(p_data, 'narx_rejim', 20); v_sinf text := public._t2_yb_matn(p_data, 'mashina_sinf', 20);
  v_bid bigint := public._t2_yb_son(p_data, 'buyurtma_id')::bigint; v_zid bigint := public._t2_yb_son(p_data, 'zayavka_id')::bigint;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'procurement.write');
  v_t := public._t2_yb_takror(p_actor_id, p_operation_id, 'p1_yuk_qosh'); if v_t is not null then return v_t; end if;
  select * into y from public.t2_yb_yuk where id = public._t2_yb_son(p_data, 'yuk_id')::bigint and kompaniya_id = p_kompaniya_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'YUK_TOPILMADI'); end if;
  if y.holat <> 'qoralama' then return jsonb_build_object('ok', false, 'code', 'HOLAT', 'holat', y.holat); end if;
  if v_rejim is not null and v_rejim not in ('qat_iy', 'taklif') then return jsonb_build_object('ok', false, 'code', 'REJIM_NOTOGRI'); end if;
  if v_sinf is not null and v_sinf not in ('yengil', 'kichik', 'orta', 'katta', 'samosval', 'tent', 'ref') then return jsonb_build_object('ok', false, 'code', 'SINF_NOTOGRI'); end if;
  if v_bid is not null and not exists (select 1 from public.t2_buyurtma where id = v_bid and kompaniya_id = p_kompaniya_id) then return jsonb_build_object('ok', false, 'code', 'BUYURTMA_SCOPE_MISMATCH'); end if;
  update public.t2_yb_yuk set narx_rejim = coalesce(v_rejim, narx_rejim), mashina_sinf = coalesce(v_sinf, mashina_sinf), buyurtma_id = coalesce(v_bid, buyurtma_id),
    zayavka_id = coalesce(v_zid, zayavka_id), yangilandi = now() where id = y.id;
  return public._t2_yb_saqla_op(p_actor_id, p_operation_id, 'p1_yuk_qosh', jsonb_build_object('ok', true, 'id', y.id));
end $$;

-- 10. Yuk egasi: reys + oxirgi ma'lum joy (STABLE — /api/sb ham chaqira oladi). Boshqa kompaniya yukiga YUK_TOPILMADI.
create or replace function public.t2_yb_p1_ega_kuzat_v1(p_kompaniya_id bigint, p_actor_id bigint, p_yuk_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare y public.t2_yb_yuk; b public.t2_yb_bron; j public.t2_yb_joy; t public.t2_yb_tashuvchi;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'procurement.read');
  select * into y from public.t2_yb_yuk where id = p_yuk_id and kompaniya_id = p_kompaniya_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'YUK_TOPILMADI'); end if;
  select * into b from public.t2_yb_bron where yuk_id = y.id and holat <> 'bekor';
  if not found then return jsonb_build_object('ok', true, 'yuk_holat', y.holat, 'bron', null, 'joy', null, 'qabul_so_rov', y.qabul_so_rov_vaqt is not null); end if;
  select * into t from public.t2_yb_tashuvchi where id = b.tashuvchi_id;
  select * into j from public.t2_yb_joy where bron_id = b.id;
  return jsonb_build_object('ok', true, 'yuk_holat', y.holat, 'buyurtma_id', y.buyurtma_id, 'qabul_so_rov', y.qabul_so_rov_vaqt is not null,
    'bron', jsonb_build_object('id', b.id, 'holat', b.holat, 'qadam', b.qadam, 'qabul_kod', b.qabul_kod, 'tashuvchi', t.ism, 'telefon', t.telefon, 'reyting', t.reyting_ortacha,
      'reyting_soni', t.reyting_soni, 'qabul_nom', b.qabul_nom, 'yetkazildi_vaqt', b.yetkazildi_vaqt),
    'joy', case when j.bron_id is null then null else jsonb_build_object('lat', j.lat, 'lng', j.lng, 'vaqt', j.vaqt, 'soniya_oldin', extract(epoch from (now() - j.vaqt))::int, 'iz', j.iz) end);
end $$;

-- 11. Haydovchining reyslari (qadam bilan; meniki'da yo'q): faqat o'ziniki. baholangan = tashuvchi egani baholaganmi.
create or replace function public.t2_yb_p1_reys_v1(p_actor_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare tsh public.t2_yb_tashuvchi;
begin
  if p_actor_id is null or not exists (select 1 from public.t2_foydalanuvchi where id = p_actor_id and holat = 'faol') then raise exception 'PERMISSION_DENIED' using errcode = '42501'; end if;
  select * into tsh from public.t2_yb_tashuvchi where foydalanuvchi_id = p_actor_id;
  if not found then return jsonb_build_object('ok', true, 'bronlar', '[]'::jsonb); end if;
  return jsonb_build_object('ok', true, 'bronlar', coalesce((select jsonb_agg(z order by z.id desc) from (
    select b.id, b.yuk_id, b.holat, b.qadam, b.narx_qqs_siz, y.nom as yuk, y.a_nom, y.b_nom, y.a_lat, y.a_lng, y.b_lat, y.b_lng, b.yetkazildi_vaqt,
      exists (select 1 from public.t2_yb_baho h where h.bron_id = b.id and h.kimdan_turi = 'tashuvchi') as baholangan
    from public.t2_yb_bron b join public.t2_yb_yuk y on y.id = b.yuk_id where b.tashuvchi_id = tsh.id and b.holat <> 'bekor' order by b.id desc limit 50) z), '[]'::jsonb));
end $$;

do $grant$ declare f text; begin
  foreach f in array array[
    'public._t2_yb_masofa_km(numeric,numeric,numeric,numeric)',
    'public.t2_yb_p1_holat_v1(bigint,uuid,jsonb)', 'public.t2_yb_p1_yaqin_v1(bigint,jsonb)', 'public.t2_yb_p1_qabul_v1(bigint,uuid,jsonb)',
    'public.t2_yb_p1_qadam_v1(bigint,uuid,jsonb)', 'public.t2_yb_p1_joy_v1(bigint,jsonb)', 'public.t2_yb_p1_yuk_qosh_v1(bigint,bigint,uuid,jsonb)',
    'public.t2_yb_p1_ega_kuzat_v1(bigint,bigint,bigint)', 'public.t2_yb_p1_reys_v1(bigint)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $grant$;
