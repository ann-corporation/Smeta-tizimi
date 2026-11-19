-- 20270119000002_t2_hujjat_paket_royxat_filtr_v1
-- «Hujjat doim tayyor» (egasi 2026-11-19), 2-qism: paket ro'yxati (server filtri + sahifalash), saqlangan filtrlar, Diskdagi tayyor versiya holati.
--  * t2_hujjat_paket_royxat_v1  - t2_hujjat_paket_nomzod_v1 ustiga: navbat holati («yangilanmoqda»), to'langanmi (F-2 kaliti obyekt+oy+raqam), sahifa (offset/sahifa_limit<=500)
--                                 va butun natija kalitlari (hammasini tanlash uchun). Pul summalari qaytmaydi.
--  * t2_hujjat_tayyor_ol_v1     - bitta F-2 ning Diskdagi joriy versiyasi + eskirganmi (navbatda kutmoqda/ishlanmoqda).
--  * t2_hujjat_filtr_*_v1       - foydalanuvchi filtrlari («Texnadzor to'plami»): ro'yxat / saqlash (nom bo'yicha almashtiradi) / o'chirish.
-- Applied: YO'Q (L0 qo'llaydi: avval ROLLBACK sinov; faqat service_role; 20270118000001 va 20270119000001 dan keyin).

create table if not exists public.t2_hujjat_filtr (
  id bigserial primary key,
  kompaniya_id bigint not null,
  foydalanuvchi_id bigint not null,
  nom text not null check (char_length(nom) between 1 and 60),
  filtr jsonb not null check (octet_length(filtr::text) <= 4000),
  yaratildi timestamptz not null default now(),
  yangilandi timestamptz not null default now()
);
create unique index if not exists t2_hujjat_filtr_nom_uniq on public.t2_hujjat_filtr (kompaniya_id, foydalanuvchi_id, lower(nom));
alter table public.t2_hujjat_filtr enable row level security;
revoke all on table public.t2_hujjat_filtr from public, anon, authenticated;
grant select, insert, update, delete on table public.t2_hujjat_filtr to service_role;
grant usage, select on sequence public.t2_hujjat_filtr_id_seq to service_role;

create or replace function public.t2_hujjat_paket_royxat_v1(p_actor bigint, p_kompaniya bigint, p_filtr jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $fn$
declare
  v_f jsonb := coalesce(p_filtr, '{}'::jsonb);
  v_off integer := greatest(coalesce((v_f->>'offset')::integer, 0), 0);
  v_lim integer := least(greatest(coalesce((v_f->>'sahifa_limit')::integer, 50), 1), 500);
  v jsonb; v2 jsonb; v_var jsonb := null; v_sahifa jsonb; v_kalitlar jsonb; v_jami integer;
begin
  v := public.t2_hujjat_paket_nomzod_v1(p_actor, p_kompaniya, (v_f - 'offset' - 'sahifa_limit' - 'variantlar') || jsonb_build_object('limit', 3000));
  if coalesce((v->>'ok')::boolean, false) is not true then return v; end if;
  if coalesce((v_f->>'variantlar')::boolean, false) then  -- filtr variantlari (shartnoma/obyekt ro'yxati): filtrsiz, bir marta
    v2 := public.t2_hujjat_paket_nomzod_v1(p_actor, p_kompaniya, jsonb_build_object('limit', 3000));
    v_var := jsonb_build_object(
      'shartnomalar', coalesce((select jsonb_agg(distinct jsonb_build_object('id', (x->>'shartnoma_id')::bigint, 'raqam', x->>'shartnoma_raqam')) from jsonb_array_elements(v2->'nomzodlar') x where x->>'shartnoma_id' is not null), '[]'::jsonb),
      'obyektlar', coalesce((select jsonb_agg(distinct jsonb_build_object('id', (x->>'obyekt_id')::bigint, 'nom', x->>'obyekt_nom', 'shartnoma_id', nullif(x->>'shartnoma_id', '')::bigint)) from jsonb_array_elements(v2->'nomzodlar') x where x->>'obyekt_id' is not null), '[]'::jsonb));
  end if;
  with e as (
    select x, ord from jsonb_array_elements(v->'nomzodlar') with ordinality t(x, ord)
  ), j as (
    select e.ord,
           e.x || jsonb_build_object(
             'yangilanmoqda', coalesce(n.holat in ('kutmoqda', 'ishlanmoqda'), false),
             'navbat_holat', n.holat, 'navbat_xato', case when n.holat = 'xato' then n.oxirgi_xato end,
             'raqam', a.raqam,
             'tolangan', case when a.id is not null and nullif(btrim(a.raqam), '') is not null then exists (
                select 1 from public.t2_token_harakat h
                 where h.kompaniya_id = p_kompaniya and h.tur = 'sarf' and h.amal in ('f2_hujjat', 'hujjat')
                   and h.meta->>'xesh' = left('f2:' || a.obyekt_id || ':' || to_char(a.oy, 'YYYY-MM') || ':' || btrim(a.raqam), 200)
                   and not exists (select 1 from public.t2_token_harakat q where q.kompaniya_id = h.kompaniya_id and q.tur = 'qaytarish' and q.bogliq_operation_id = h.operation_id))
                else false end) as x
      from e
      left join public.t2_akt a on a.id = nullif(e.x->>'akt_id', '')::bigint and a.kompaniya_id = p_kompaniya
      left join public.t2_hujjat_yangila_navbat n on n.tur = 'f2' and n.manba_id = a.id and n.kompaniya_id = p_kompaniya
  )
  select (select count(*) from j)::integer,
         coalesce((select jsonb_agg(j.x order by j.ord) from j where j.ord > v_off and j.ord <= v_off + v_lim), '[]'::jsonb),
         coalesce((select jsonb_agg(j.x->>'kalit' order by j.ord) from j where coalesce((j.x->>'takror')::boolean, false) is not true), '[]'::jsonb)
    into v_jami, v_sahifa, v_kalitlar;
  return jsonb_build_object('ok', true, 'kompaniya_id', p_kompaniya, 'jami', v_jami, 'kesilgan', coalesce((v->>'kesilgan')::boolean, false),
                            'offset', v_off, 'sahifa_limit', v_lim, 'nomzodlar', v_sahifa, 'barcha_kalitlar', v_kalitlar)
         || case when v_var is not null then jsonb_build_object('variantlar', v_var) else '{}'::jsonb end;
end $fn$;

create or replace function public.t2_hujjat_tayyor_ol_v1(p_actor bigint, p_kompaniya bigint, p_akt_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $fn$
declare v_f record; v_n record;
begin
  if p_kompaniya is null or public._t2_hm_daraja_v1(p_actor, p_kompaniya, null, null, null) < 1 then return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ'); end if;
  select f.id as fayl_id, vv.raqam as versiya, vv.bayt, coalesce(vv.yaratildi, f.yangilandi) as yangilandi into v_f
    from public.t2_hm_fayl f left join public.t2_hm_versiya vv on vv.id = f.joriy_versiya_id
   where f.kompaniya_id = p_kompaniya and f.hujjat_kalit = 'f2:' || p_akt_id and f.savatda is null limit 1;
  select holat, keyingi_vaqt, oxirgi_xato into v_n from public.t2_hujjat_yangila_navbat where tur = 'f2' and manba_id = p_akt_id and kompaniya_id = p_kompaniya;
  return jsonb_build_object('ok', true, 'fayl_id', v_f.fayl_id, 'versiya', v_f.versiya, 'bayt', v_f.bayt, 'yangilandi', v_f.yangilandi,
    'navbat_holat', v_n.holat, 'keyingi_vaqt', v_n.keyingi_vaqt, 'navbat_xato', v_n.oxirgi_xato,
    'eskirgan', v_f.fayl_id is null or coalesce(v_n.holat in ('kutmoqda', 'ishlanmoqda'), false));
end $fn$;

create or replace function public.t2_hujjat_filtr_royxat_v1(p_actor bigint, p_kompaniya bigint) returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $fn$
begin
  if p_kompaniya is null or public._t2_hm_daraja_v1(p_actor, p_kompaniya, null, null, null) < 1 then return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ'); end if;
  return jsonb_build_object('ok', true, 'filtrlar', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'nom', f.nom, 'filtr', f.filtr) order by lower(f.nom))
    from public.t2_hujjat_filtr f where f.kompaniya_id = p_kompaniya and f.foydalanuvchi_id = p_actor), '[]'::jsonb));
end $fn$;

create or replace function public.t2_hujjat_filtr_saqla_v1(p_actor bigint, p_kompaniya bigint, p_nom text, p_filtr jsonb) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $fn$
declare v_nom text := btrim(coalesce(p_nom, '')); v_id bigint;
begin
  if p_kompaniya is null or public._t2_hm_daraja_v1(p_actor, p_kompaniya, null, null, null) < 1 then return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ'); end if;
  if char_length(v_nom) < 1 or char_length(v_nom) > 60 then return jsonb_build_object('ok', false, 'code', 'NOM_NOTOGRI'); end if;
  if p_filtr is null or jsonb_typeof(p_filtr) <> 'object' or octet_length(p_filtr::text) > 4000 then return jsonb_build_object('ok', false, 'code', 'FILTR_NOTOGRI'); end if;
  if (select count(*) from public.t2_hujjat_filtr where kompaniya_id = p_kompaniya and foydalanuvchi_id = p_actor and lower(nom) <> lower(v_nom)) >= 50 then return jsonb_build_object('ok', false, 'code', 'LIMIT_50'); end if;
  insert into public.t2_hujjat_filtr (kompaniya_id, foydalanuvchi_id, nom, filtr) values (p_kompaniya, p_actor, v_nom, p_filtr)
  on conflict (kompaniya_id, foydalanuvchi_id, lower(nom)) do update set filtr = excluded.filtr, nom = excluded.nom, yangilandi = now() returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $fn$;

create or replace function public.t2_hujjat_filtr_ochir_v1(p_actor bigint, p_kompaniya bigint, p_id bigint) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $fn$
begin
  if p_kompaniya is null or public._t2_hm_daraja_v1(p_actor, p_kompaniya, null, null, null) < 1 then return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ'); end if;
  delete from public.t2_hujjat_filtr where id = p_id and kompaniya_id = p_kompaniya and foydalanuvchi_id = p_actor;
  return jsonb_build_object('ok', true, 'ochirildi', found);
end $fn$;

do $g$ declare f text; begin
  foreach f in array array[
    'public.t2_hujjat_paket_royxat_v1(bigint, bigint, jsonb)', 'public.t2_hujjat_tayyor_ol_v1(bigint, bigint, bigint)',
    'public.t2_hujjat_filtr_royxat_v1(bigint, bigint)', 'public.t2_hujjat_filtr_saqla_v1(bigint, bigint, text, jsonb)', 'public.t2_hujjat_filtr_ochir_v1(bigint, bigint, bigint)']
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $g$;
