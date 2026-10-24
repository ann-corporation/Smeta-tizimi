-- 20261106880000 — «Bajarilmadi» belgisi: asl smeta qatoriga TEGMAYDIGAN qoplama jadval (egasi 2026-10-24, Fakt universal).
-- Smeta qatorlari (t2_qator) o'zgarmas: «bajarilmagan» holati alohida jadvalda — sabab (ro'yxatdan), sana, kim, dalil hujjat
-- (t2_document_registry → R2), ixtiyoriy zamena qatori. «Bajarilmagan hajmlar ro'yxati» eksporti shu jadvaldan.
-- Yozish: security definer RPC (fakt.write, a'zolik, operation_id idempotent); o'qish: stable RPC (fakt.read). Jadvalga to'g'ridan-to'g'ri kirish yo'q (RLS, siyosatsiz).
begin;

create table if not exists public.t2_qator_bajarilmadi (
  id            bigint generated always as identity primary key,
  kompaniya_id  bigint not null,
  obyekt_id     bigint not null,
  qator_id      bigint not null,
  hajm          numeric,                       -- bajarilmagan hajm; NULL = qatorning butun qoldig'i
  sabab_kod     text not null check (sabab_kod in ('buyurtmachi_chiqardi','loyiha_ozgardi','boshqa_pudratchi','texnik_sabab','zamena','material_yoq','boshqa')),
  sabab_izoh    text,
  hujjat_id     bigint,                        -- dalil: t2_document_registry (R2)
  sana          date not null default current_date,
  zamena_qator_id bigint,
  holat         text not null default 'faol' check (holat in ('faol','bekor')),
  actor_id      bigint not null,
  operation_id  uuid not null,
  yaratildi     timestamptz not null default now(),
  bekor_actor_id bigint,
  bekor_vaqt    timestamptz,
  bekor_sabab   text,
  constraint t2_qator_bajarilmadi_hajm_musbat check (hajm is null or hajm >= 0),
  constraint t2_qator_bajarilmadi_boshqa_izoh check (sabab_kod <> 'boshqa' or coalesce(btrim(sabab_izoh), '') <> '')
);
create unique index if not exists t2_qator_bajarilmadi_faol_uq on public.t2_qator_bajarilmadi (qator_id) where holat = 'faol';
create unique index if not exists t2_qator_bajarilmadi_op_uq on public.t2_qator_bajarilmadi (operation_id, qator_id);
create index if not exists t2_qator_bajarilmadi_obyekt_ix on public.t2_qator_bajarilmadi (obyekt_id, holat);

alter table public.t2_qator_bajarilmadi enable row level security;
revoke all on public.t2_qator_bajarilmadi from public, anon, authenticated;

create or replace function public.t2_bajarilmadi_belgila_v1(
  p_kompaniya_id bigint, p_actor_id bigint, p_obyekt_id bigint, p_qatorlar jsonb,
  p_sabab_kod text, p_sabab_izoh text, p_hujjat_id bigint, p_sana date, p_zamena_qator_id bigint, p_operation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_prev jsonb; v_rol text; v_n int; v_ok int; v_yangi int; v_res jsonb; v_izoh text;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;

  v_rol := public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'fakt.write');
  if not exists (select 1 from public.t2_obyekt o where o.id = p_obyekt_id and o.kompaniya_id = p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'code', 'OBYEKT_SCOPE_MISMATCH');
  end if;
  if p_sabab_kod is null or p_sabab_kod not in ('buyurtmachi_chiqardi','loyiha_ozgardi','boshqa_pudratchi','texnik_sabab','zamena','material_yoq','boshqa') then
    return jsonb_build_object('ok', false, 'code', 'SABAB_KOD_INVALID');
  end if;
  if p_sabab_kod = 'boshqa' and coalesce(btrim(p_sabab_izoh), '') = '' then
    return jsonb_build_object('ok', false, 'code', 'SABAB_IZOH_MAJBURIY');
  end if;
  if p_qatorlar is null or jsonb_typeof(p_qatorlar) <> 'array' or jsonb_array_length(p_qatorlar) = 0 or jsonb_array_length(p_qatorlar) > 2000 then
    return jsonb_build_object('ok', false, 'code', 'QATORLAR_INVALID');
  end if;
  if p_hujjat_id is not null and not exists (select 1 from public.t2_document_registry d where d.id = p_hujjat_id and d.kompaniya_id = p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'code', 'HUJJAT_SCOPE_MISMATCH');
  end if;
  if p_zamena_qator_id is not null and not exists (select 1 from public.t2_qator q where q.id = p_zamena_qator_id and q.obyekt_id = p_obyekt_id and q.kompaniya_id = p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'code', 'ZAMENA_SCOPE_MISMATCH');
  end if;

  drop table if exists _baj_kiruvchi;
  create temp table _baj_kiruvchi on commit drop as
    select (e->>'qator_id')::bigint as qator_id, nullif(e->>'hajm', '')::numeric as hajm
      from jsonb_array_elements(p_qatorlar) e;
  select count(*) into v_n from _baj_kiruvchi;
  if exists (select 1 from _baj_kiruvchi where qator_id is null or coalesce(hajm, 0) < 0) then
    return jsonb_build_object('ok', false, 'code', 'QATORLAR_INVALID');
  end if;
  select count(*) into v_ok from _baj_kiruvchi k join public.t2_qator q on q.id = k.qator_id
   where q.obyekt_id = p_obyekt_id and q.kompaniya_id = p_kompaniya_id and q.tur in ('bl', 'rs', 'mat', 'ob');
  if v_ok <> v_n then return jsonb_build_object('ok', false, 'code', 'QATOR_SCOPE_MISMATCH'); end if;

  v_izoh := nullif(btrim(coalesce(p_sabab_izoh, '')), '');
  if p_sabab_kod = 'zamena' and p_zamena_qator_id is not null and v_izoh is null then
    select 'bajarilmadi: zamena -> ' || coalesce(nullif(q.kod, ''), '') || ' ' || coalesce(q.nom, '') into v_izoh from public.t2_qator q where q.id = p_zamena_qator_id;
  end if;

  with ins as (
    insert into public.t2_qator_bajarilmadi (kompaniya_id, obyekt_id, qator_id, hajm, sabab_kod, sabab_izoh, hujjat_id, sana, zamena_qator_id, actor_id, operation_id)
    select p_kompaniya_id, p_obyekt_id, k.qator_id, k.hajm, p_sabab_kod, v_izoh, p_hujjat_id, coalesce(p_sana, current_date), p_zamena_qator_id, p_actor_id, p_operation_id
      from _baj_kiruvchi k
    on conflict (qator_id) where holat = 'faol' do nothing
    returning id)
  select count(*) into v_yangi from ins;

  v_res := jsonb_build_object('ok', true, 'yaratildi', v_yangi, 'otkazildi', v_n - v_yangi);
  insert into public.t2_onboarding_command_log (operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'bajarilmadi_belgila', v_res);
  return v_res;
end $function$;

create or replace function public.t2_bajarilmadi_bekor_v1(p_kompaniya_id bigint, p_actor_id bigint, p_id bigint, p_sabab text, p_operation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_prev jsonb; v_res jsonb; v_n int;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'fakt.write');
  update public.t2_qator_bajarilmadi set holat = 'bekor', bekor_actor_id = p_actor_id, bekor_vaqt = now(), bekor_sabab = nullif(btrim(coalesce(p_sabab, '')), '')
   where id = p_id and kompaniya_id = p_kompaniya_id and holat = 'faol';
  get diagnostics v_n = row_count;
  if v_n = 0 then return jsonb_build_object('ok', false, 'code', 'TOPILMADI_YOKI_BEKOR'); end if;
  v_res := jsonb_build_object('ok', true, 'id', p_id);
  insert into public.t2_onboarding_command_log (operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'bajarilmadi_bekor', v_res);
  return v_res;
end $function$;

create or replace function public.t2_bajarilmadi_royxat_v1(p_kompaniya_id bigint, p_actor_id bigint, p_obyekt_id bigint default null)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v jsonb;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'fakt.read');
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', b.id, 'obyekt_id', b.obyekt_id, 'qator_id', b.qator_id, 'kod', q.kod, 'nom', q.nom, 'birlik', q.birlik, 'tur', q.tur,
      'smeta_hajm', h.smeta_hajm, 'fakt_hajm', h.fakt_hajm, 'hajm', b.hajm,
      'bajarilmagan_hajm', coalesce(b.hajm, greatest(coalesce(h.smeta_hajm, 0) - coalesce(h.fakt_hajm, 0), 0)),
      'sabab_kod', b.sabab_kod, 'sabab_izoh', b.sabab_izoh, 'hujjat_id', b.hujjat_id, 'hujjat_nom', d.original_filename,
      'sana', b.sana, 'zamena_qator_id', b.zamena_qator_id, 'holat', b.holat,
      'kim', coalesce(nullif(u.ism, ''), u.login), 'yaratildi', b.yaratildi) order by b.yaratildi desc), '[]'::jsonb) into v
    from public.t2_qator_bajarilmadi b
    join public.t2_qator q on q.id = b.qator_id
    left join public.t2_qator_holat h on h.qator_id = b.qator_id
    left join public.t2_document_registry d on d.id = b.hujjat_id
    left join public.t2_foydalanuvchi u on u.id = b.actor_id
   where b.kompaniya_id = p_kompaniya_id and (p_obyekt_id is null or b.obyekt_id = p_obyekt_id);
  return jsonb_build_object('ok', true, 'qatorlar', v);
end $function$;

revoke all on function public.t2_bajarilmadi_belgila_v1(bigint, bigint, bigint, jsonb, text, text, bigint, date, bigint, uuid) from public, anon, authenticated;
revoke all on function public.t2_bajarilmadi_bekor_v1(bigint, bigint, bigint, text, uuid) from public, anon, authenticated;
revoke all on function public.t2_bajarilmadi_royxat_v1(bigint, bigint, bigint) from public, anon, authenticated;
grant execute on function public.t2_bajarilmadi_belgila_v1(bigint, bigint, bigint, jsonb, text, text, bigint, date, bigint, uuid) to service_role;
grant execute on function public.t2_bajarilmadi_bekor_v1(bigint, bigint, bigint, text, uuid) to service_role;
grant execute on function public.t2_bajarilmadi_royxat_v1(bigint, bigint, bigint) to service_role;

commit;
