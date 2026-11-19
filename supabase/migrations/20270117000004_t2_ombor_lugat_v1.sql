-- 20270117000004 — OMBOR LUG'ATI: kompaniyaning o'z sinonimlari (material iborasi → kanonik nom; yetkazuvchi aliasi).
-- Egasi (2026-11-19): «skladga 10 m3 beton M200 kirim qilib qo'y, Hamkor Qurilishdan» — tizim material/yetkazuvchini kompaniyaning O'Z lug'atidan topsin,
-- tasdiqlangan moslik keyingi safar darhol ishlasin; lug'at o'sadi, variantlar ko'paymaydi.
-- Nega yangi jadval: t2_material_alias — faqat ostatka guruhlash (alias_nom→kanonik_nom_key, kompaniya/umumiy) va kontragentni bilmaydi; t2_lugat_kompaniya — naryad
-- (smeta↔oddiy til) uchun bitta JSON. Bu jadval — ombor «ibora → mavjud element» xotirasi (tur: material|kontragent), foydalanish soni va holat bilan, tahrirlanadi.
-- Jadval faqat SINONIM saqlaydi; materiallar/kontragentlar asosiy manbasi o'zgarmaydi (t2_sklad_harakat, t2_kontragent) — ikkinchi ro'yxat yo'q.
-- Yozuv FAQAT tasdiqdan keyin (/api/ombor-buyruq: tasdiq) yoki omborchi tahriri orqali; RLS yopiq, faqat service_role + SECURITY DEFINER RPC (ruxsat: warehouse.*).
-- Migratsiyani FAQAT L0 qo'llaydi. Rollback: .rollback.sql. Qabul: .acceptance.sql.

create table if not exists public.t2_ombor_lugat (
  id bigserial primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id) on delete cascade,
  tur text not null check (tur in ('material', 'kontragent')),
  ibora text not null check (length(btrim(ibora)) between 1 and 200),
  ibora_kalit text not null check (length(ibora_kalit) between 1 and 200),
  kanonik text not null check (length(btrim(kanonik)) between 1 and 500),
  birlik text check (birlik is null or length(birlik) <= 40),
  soni integer not null default 1 check (soni >= 1),
  manba text not null default 'tasdiq' check (manba in ('tasdiq', 'qol')),
  holat text not null default 'faol' check (holat in ('faol', 'ochirilgan')),
  yaratuvchi_id bigint references public.t2_foydalanuvchi(id) on delete set null,
  yaratildi timestamptz not null default now(),
  yangilandi timestamptz not null default now()
);
-- Bitta kompaniyada bir ibora kaliti bitta faol sinonim (takror yo'q).
create unique index if not exists t2_ombor_lugat_faol_uq on public.t2_ombor_lugat (kompaniya_id, tur, ibora_kalit) where holat = 'faol';
create index if not exists t2_ombor_lugat_kompaniya_idx on public.t2_ombor_lugat (kompaniya_id, tur, holat);

alter table public.t2_ombor_lugat enable row level security;
revoke all on public.t2_ombor_lugat from public, anon, authenticated;
grant select, insert, update, delete on public.t2_ombor_lugat to service_role;
grant usage, select on sequence public.t2_ombor_lugat_id_seq to service_role;

-- O'qish: kompaniya lug'ati (faol sinonimlar).
create or replace function public.t2_ombor_lugat_royxat_v1(p_actor_id bigint, p_kompaniya_id bigint, p_sklad_id bigint, p_tur text default null, p_limit integer default 500)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_k text;
begin
  v_k := public.t2_ombor_kirish_v1(p_actor_id, p_kompaniya_id, p_sklad_id, false);
  if v_k <> 'OK' then return jsonb_build_object('ok', false, 'code', v_k); end if;
  if p_tur is not null and p_tur not in ('material', 'kontragent') then return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT'); end if;
  return jsonb_build_object('ok', true, 'qatorlar', coalesce((
    select jsonb_agg(jsonb_build_object('id', l.id, 'tur', l.tur, 'ibora', l.ibora, 'ibora_kalit', l.ibora_kalit, 'kanonik', l.kanonik, 'birlik', l.birlik,
      'soni', l.soni, 'manba', l.manba, 'yangilandi', l.yangilandi) order by l.tur, l.kanonik, l.ibora)
      from (select * from public.t2_ombor_lugat x where x.kompaniya_id = p_kompaniya_id and x.holat = 'faol' and (p_tur is null or x.tur = p_tur)
             order by x.tur, x.kanonik, x.ibora limit least(greatest(coalesce(p_limit, 500), 1), 2000)) l), '[]'::jsonb));
end $$;

-- Yozuv. p_amal: oyrat (tasdiqdan keyin avtomatik: ibora→kanonik, soni+1) | qosh (qo'lda) | nomla ({id, kanonik}) | birlashtir ({ids[], kanonik}) | ochir ({id}).
create or replace function public.t2_ombor_lugat_yoz_v1(p_actor_id bigint, p_kompaniya_id bigint, p_sklad_id bigint, p_amal text, p_yuk jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_k text; v_y jsonb := coalesce(p_yuk, '{}'::jsonb); v_tur text; v_ib text; v_kal text; v_kan text; v_id bigint; v_son integer := 0; v_ids bigint[];
begin
  v_k := public.t2_ombor_kirish_v1(p_actor_id, p_kompaniya_id, p_sklad_id, true);
  if v_k <> 'OK' then return jsonb_build_object('ok', false, 'code', v_k); end if;
  if p_amal is null or p_amal not in ('oyrat', 'qosh', 'nomla', 'birlashtir', 'ochir') then return jsonb_build_object('ok', false, 'code', 'AMAL_NOMALUM'); end if;
  if p_amal in ('oyrat', 'qosh') then
    v_tur := v_y ->> 'tur'; v_ib := nullif(btrim(coalesce(v_y ->> 'ibora', '')), ''); v_kal := nullif(btrim(coalesce(v_y ->> 'ibora_kalit', '')), ''); v_kan := nullif(btrim(coalesce(v_y ->> 'kanonik', '')), '');
    if v_tur not in ('material', 'kontragent') or v_ib is null or v_kal is null or v_kan is null or length(v_ib) > 200 or length(v_kal) > 200 or length(v_kan) > 500 then
      return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT');
    end if;
    if (select count(*) from public.t2_ombor_lugat where kompaniya_id = p_kompaniya_id and holat = 'faol') >= 3000 then return jsonb_build_object('ok', false, 'code', 'LUGAT_TOLGAN'); end if;
    insert into public.t2_ombor_lugat (kompaniya_id, tur, ibora, ibora_kalit, kanonik, birlik, manba, yaratuvchi_id)
    values (p_kompaniya_id, v_tur, v_ib, v_kal, v_kan, nullif(left(coalesce(v_y ->> 'birlik', ''), 40), ''), case when p_amal = 'qosh' then 'qol' else 'tasdiq' end, p_actor_id)
    on conflict (kompaniya_id, tur, ibora_kalit) where holat = 'faol'
    do update set kanonik = excluded.kanonik, birlik = coalesce(excluded.birlik, public.t2_ombor_lugat.birlik), soni = public.t2_ombor_lugat.soni + 1, yangilandi = now()
    returning id into v_id;
    v_son := 1;
  elsif p_amal = 'nomla' then
    v_kan := nullif(btrim(coalesce(v_y ->> 'kanonik', '')), '');
    if v_kan is null or length(v_kan) > 500 or (v_y ->> 'id') !~ '^[0-9]+$' then return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT'); end if;
    update public.t2_ombor_lugat set kanonik = v_kan, yangilandi = now() where id = (v_y ->> 'id')::bigint and kompaniya_id = p_kompaniya_id and holat = 'faol';
    get diagnostics v_son = row_count; v_id := (v_y ->> 'id')::bigint;
  elsif p_amal = 'birlashtir' then
    v_kan := nullif(btrim(coalesce(v_y ->> 'kanonik', '')), '');
    if v_kan is null or length(v_kan) > 500 or jsonb_typeof(v_y -> 'ids') is distinct from 'array' or jsonb_array_length(v_y -> 'ids') not between 1 and 200 then return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT'); end if;
    select array_agg(e::bigint) into v_ids from jsonb_array_elements_text(v_y -> 'ids') e where e ~ '^[0-9]+$';
    update public.t2_ombor_lugat set kanonik = v_kan, yangilandi = now() where id = any(coalesce(v_ids, '{}')) and kompaniya_id = p_kompaniya_id and holat = 'faol';
    get diagnostics v_son = row_count;
  else
    if (v_y ->> 'id') !~ '^[0-9]+$' then return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT'); end if;
    update public.t2_ombor_lugat set holat = 'ochirilgan', yangilandi = now() where id = (v_y ->> 'id')::bigint and kompaniya_id = p_kompaniya_id and holat = 'faol';
    get diagnostics v_son = row_count; v_id := (v_y ->> 'id')::bigint;
  end if;
  perform public.t2_audit_yoz(p_kompaniya_id, 'ombor_lugat_' || p_amal, 'sklad', null::bigint, 'sklad_id=' || p_sklad_id::text || '; lugat_id=' || coalesce(v_id::text, '-') || '; son=' || v_son::text, 'actor:' || p_actor_id::text, null);
  return jsonb_build_object('ok', true, 'amal', p_amal, 'id', v_id, 'son', v_son);
end $$;

revoke all on function public.t2_ombor_lugat_royxat_v1(bigint, bigint, bigint, text, integer) from public, anon, authenticated;
revoke all on function public.t2_ombor_lugat_yoz_v1(bigint, bigint, bigint, text, jsonb) from public, anon, authenticated;
grant execute on function public.t2_ombor_lugat_royxat_v1(bigint, bigint, bigint, text, integer) to service_role;
grant execute on function public.t2_ombor_lugat_yoz_v1(bigint, bigint, bigint, text, jsonb) to service_role;