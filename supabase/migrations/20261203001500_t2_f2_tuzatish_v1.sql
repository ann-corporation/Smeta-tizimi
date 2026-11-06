-- T2 F2 TUZATISH v1 (2026-11-06) — uch audit (A tayyorlash, B pereraschet/storno, C tasdiq/eksport) server tomoni, bitta paket.
-- ⚠ HOLAT: PRODGA QO'LLANMAGAN. Egasi ruxsatidan keyin koordinator qo'llaydi (BEGIN..ROLLBACK acceptance dan keyin).
--
--  1  (A6/C-M3)  t2_f2_qoralama_yangila_v1 — har saqlashda t2_akt.versiya + 1 → p_kutilgan_versiya CAS haqiqiy STALE_VERSION beradi.
--                 t2_price_basis_resolve_v1 qatorga BIR marta (B-m6); certified_* / raw_snapshot INSERT ning o'zida (juftlash
--                 UPDATE i kerak emas — natija aynan avvalgidek).
--  2  (C-M4)     lifecycle: 'rejected → draft' (f2.prepare). qoralama_yangila rad etilgan F2 ni qabul qiladi: avval shu o'tishni
--                 t2_akt_lifecycle_transition_v1 orqali bajaradi (tarix + audit), so'ng qatorlarni almashtiradi.
--  3  (C-M7)     approved → cancelled: bog'liq faol storno/pereraschet (raw_snapshot.stornoOf / manba_akt_qator_id), faol
--                 Forma-3 (forma3_id yoki t2_forma3_akt) yoki davr_muhr bo'lsa — DEPENDENTS_EXIST (ro'yxat bilan).
--                 Topshirilgan shartnoma oylik paketi — BLOKLAMAYDI (20261119000000 egasi qoidasi «QATTIQ QULF YO'Q»; paketni bekor
--                 qilib bo'lmaydi → blok abadiy bo'lardi), javobda 'ogohlantirish' = 'PAKET_TOPSHIRILGAN' + paketlar.
--  4  (C-M9/A29) versiya guard: almashtirilgan qatorga STORNO qatori (manbasi tasdiqlangan F2, tekshirilgan) yozila oladi;
--                 oddiy (plyus) qator — avvalgidek rad (endi RPC dan QATOR_ALMASHTIRILGAN kodi, trigger — oxirgi himoya).
--  5  (B-B2/B3)  takror qoidasi: oddiy qator — qator_id ga 1 ta; storno qatorlari — (qator_id, manba_akt_qator_id) ga 1 ta
--                 (manba qatorisiz storno — (qator_id, stornoOf) ga 1 ta va o'sha juftda boshqa storno yo'q).
--                 manba_akt_qator_id raw_snapshot ichida (yoki yuqori darajada) qabul qilinadi; t2_akt_qator.manba_akt_qator_id
--                 USTUNIGA YOZILMAYDI (u «Fakt = F2» nusxa izi — t2_fakt_yoz_v2 band tekshiruvi buzilmasin).
--  6  (B dizayn b) storno qatori: ishora manba qatoriga teskari, |hajm| ≤ |manba hajmi|, narx = manba narxi (±0,01) →
--                 aks holda STORNO_LINE_INVALID (qoralama_yangila va t2_akt_yarat_v2).
--  7  (C-M10)    t2_qator_holat: yangi oxirgi ustun fakt_summa_nomalum (fakt summasi noma'lum manbalar soni; NULL ≠ 0).
--                 Mavjud 35 ustun va ma'nosi O'ZGARMAYDI (direct_fakt_summa hamon COALESCE — iste'molchilar buzilmaydi).
--  8  (A26)      trigger tartibi: t2_akt_raqam_takror → t2_akt_zz_raqam_takror (shartnoma_scope dan KEYIN ishlaydi).
--  9  (C-m7)     O'TKAZIB YUBORILDI: snapshot.qaytar (20261109300000) tasdiqlangan akt qatorlarini o'chirib qayta yozadi —
--                 to'liq muzlatish uni buzadi. Mavjud certified muzlatish (BEFORE UPDATE) qoladi.
-- 10  (C-m11)    O'ZGARISH YO'Q: t2_akt_correction_create_v1 da 20261017100629 dan beri f2.correct tekshiruvi bor, BFF ishlatadi
--                 (frontend/src/api/t2-akt-lifecycle.ts). Acceptance tekshiradi.
-- 11  (egasi 2026-11-06) raw_snapshot.narxsizSabab = 'avto_qoralama' (price_intentionally_absent) qatori qoralamada saqlanadi,
--                 lekin 'submitted'/'approved' ga o'tish NARXSIZ_QATOR_BOR (soni bilan) — transition kodi + projection guard
--                 (eski t2_akt_tasdiqlash yo'li ham). Sababsiz ongli narxsiz qatorlar o'tadi.
--
-- Usul: o'zgaradigan har funksiyaning JORIY (prod) ta'rifi *_pre_20261203001500 nusxasiga AYNAN saqlanadi (rollback manbai).
-- qoralama_yangila, projection guard, versiya guard, _t2_* yordamchilar va t2_qator_holat — to'liq tana (eng so'nggi ta'rif
-- asosida: 20261106530000+20261203000100, 20261117100000, 20261114700000, 20261117400000). transition_v1 va t2_akt_yarat_v2 —
-- langar (aynan 1 marta, aks holda EXCEPTION), chunki ularning prod tanasi bir necha migratsiya yamog'idan iborat.
begin;

-- ───────────── 0. Old shartlar ─────────────
do $pre$
begin
  if to_regprocedure('public._t2_f2_takror_xato(jsonb)') is null
     or position('_t2_f2_takror_xato' in pg_get_functiondef('public.t2_f2_qoralama_yangila_v1(bigint,bigint,bigint,integer,jsonb,uuid,text)'::regprocedure)) = 0 then
    raise exception 'F2_TUZATISH: 20261203000100 (storno takror) avval qo''llanishi shart';
  end if;
  if position('tasdiqlangan_bekor_v1' in pg_get_functiondef('public.t2_akt_lifecycle_transition_v1(bigint,bigint,text,bigint,integer,uuid,text)'::regprocedure)) = 0 then
    raise exception 'F2_TUZATISH: 20261117100000 (tasdiqlangan bekor) avval qo''llanishi shart';
  end if;
  if position('v_ruxsat_ustun' in pg_get_functiondef('public.t2_akt_lifecycle_projection_guard_v1()'::regprocedure)) = 0 then
    raise exception 'F2_TUZATISH: projection guard 20261117100000 tanasida emas';
  end if;
  if position('_t2_f2_narxda_v1' in pg_get_viewdef('public.t2_qator_holat'::regclass)) = 0
     or position('f2_summa_yoq' in pg_get_viewdef('public.t2_qator_holat'::regclass)) = 0 then
    raise exception 'F2_TUZATISH: t2_qator_holat 20261117400000 ta''rifida emas';
  end if;
  -- (fakt_summa_nomalum ustuni rollback dan keyin view da qoladi — qayta qo'llash shuning uchun faqat zaxira bo'yicha tekshiriladi.)
  if to_regprocedure('public.t2_f2_qoralama_yangila_v1_pre_20261203001500(bigint,bigint,bigint,integer,jsonb,uuid,text)') is not null then
    raise exception 'F2_TUZATISH: migratsiya allaqachon qo''llangan';
  end if;
end $pre$;

-- ───────────── 1. Rollback zaxirasi (joriy prod ta'riflari AYNAN) ─────────────
do $zx$
declare s text; f text; a text;
begin
  foreach s in array array[
    't2_akt_yarat_v2(bigint,date,jsonb,bigint,text,uuid,text)',
    't2_f2_qoralama_yangila_v1(bigint,bigint,bigint,integer,jsonb,uuid,text)',
    't2_akt_lifecycle_transition_v1(bigint,bigint,text,bigint,integer,uuid,text)',
    't2_akt_lifecycle_projection_guard_v1()',
    't2_akt_qator_versiya_guard()',
    '_t2_f2_takror_xato(jsonb)',
    '_t2_f2_storno_manba_xato(jsonb,bigint,bigint)'] loop
    f := split_part(s, '(', 1); a := split_part(s, '(', 2);
    execute replace(pg_get_functiondef(format('public.%s', s)::regprocedure),
                    format('FUNCTION public.%s(', f), format('FUNCTION public.%s_pre_20261203001500(', f));
    execute format('revoke all on function public.%s_pre_20261203001500(%s from public, anon, authenticated', f, a);
    execute format('comment on function public.%s_pre_20261203001500(%s is %L', f, a,
      'versiya: texnik — 20261203001500 rollback zaxirasi (prod ta''rifi aynan); chaqirilmaydi.');
  end loop;
end $zx$;

-- ───────────── 2. Yordamchilar ─────────────
-- Storno qatorining manba F2 akt qatori (raw_snapshot.manba_akt_qator_id yoki yuqori darajadagi kalit).
create or replace function public._t2_f2_storno_manba_qator(x jsonb) returns bigint
language sql immutable set search_path = public, pg_temp as $fn$
  select case when coalesce(nullif(x->>'manba_akt_qator_id', ''), x->'raw_snapshot'->>'manba_akt_qator_id', '') ~ '^[1-9][0-9]{0,17}$'
              then coalesce(nullif(x->>'manba_akt_qator_id', ''), x->'raw_snapshot'->>'manba_akt_qator_id')::bigint end
$fn$;

-- 5) Takror: oddiy — qator_id ga 1; storno — (qator_id, manba qatori) ga 1; manba qatorisiz storno — (qator_id, stornoOf) da yolg'iz.
create or replace function public._t2_f2_takror_xato(p_qatorlar jsonb) returns boolean
language sql immutable set search_path = public, pg_temp as $fn$
  select exists (
           select 1 from jsonb_array_elements(p_qatorlar) x
            where not public._t2_f2_storno_qatormi(x)
            group by x->>'qator_id' having count(*) > 1)
      or exists (
           select 1 from jsonb_array_elements(p_qatorlar) x
            where public._t2_f2_storno_qatormi(x)
            group by x->>'qator_id', coalesce(x->'raw_snapshot'->>'stornoOf', '')
           having count(*) filter (where public._t2_f2_storno_manba_qator(x) is null) > 1
               or (count(*) filter (where public._t2_f2_storno_manba_qator(x) is null) = 1 and count(*) > 1)
               or count(distinct public._t2_f2_storno_manba_qator(x)) < count(public._t2_f2_storno_manba_qator(x)))
$fn$;

-- Storno manbai (20261203000100 bilan bir xil) — manba qatori raw_snapshot ichida ham taniladi.
create or replace function public._t2_f2_storno_manba_xato(p_qatorlar jsonb, p_obyekt_id bigint, p_kompaniya_id bigint) returns jsonb
language sql stable set search_path = public, pg_temp as $fn$
  select jsonb_agg(s.qid order by s.n)
    from (
      select x->>'qator_id' as qid, e.n,
             coalesce(
               case when coalesce(x->'raw_snapshot'->>'stornoOf', '') ~ '^[1-9][0-9]{0,17}$' then (x->'raw_snapshot'->>'stornoOf')::bigint end,
               (select aq.akt_id from public.t2_akt_qator aq where aq.id = public._t2_f2_storno_manba_qator(x))) as manba
        from jsonb_array_elements(p_qatorlar) with ordinality e(x, n)
       where public._t2_f2_storno_qatormi(x)) s
   where not exists (
     select 1 from public.t2_akt a
      where a.id = s.manba and a.obyekt_id = p_obyekt_id and coalesce(a.kompaniya_id, p_kompaniya_id) = p_kompaniya_id
        and a.tur = 'f2' and a.holat = 'tasdiqlangan' and coalesce(a.lifecycle_status, 'approved') = 'approved')
$fn$;

-- 6) Storno qatori manba qatoriga mos emas: ishora teskari emas / |hajm| manbadan katta / narx manba narxi emas — o'sha elementlar.
create or replace function public._t2_f2_storno_qator_xato(p_qatorlar jsonb, p_obyekt_id bigint) returns jsonb
language sql stable set search_path = public, pg_temp as $fn$
  select jsonb_agg(jsonb_build_object('qator_id', s.qid, 'tartib', s.n, 'manba_akt_qator_id', s.m) order by s.n)
    from (
      select (x->>'qator_id')::bigint as qid, e.n, public._t2_f2_storno_manba_qator(x) as m,
             case when coalesce(x->'raw_snapshot'->>'stornoOf', '') ~ '^[1-9][0-9]{0,17}$' then (x->'raw_snapshot'->>'stornoOf')::bigint end as sof,
             case when coalesce(x->>'certified_quantity', '') ~ '^\s*-?[0-9]+(\.[0-9]+)?([eE][-+]?[0-9]+)?\s*$' then (x->>'certified_quantity')::numeric end as h,
             case when coalesce((x->>'price_intentionally_absent')::boolean, false) then null
                  when coalesce(x->>'certified_unit_price', '') ~ '^\s*-?[0-9]+(\.[0-9]+)?([eE][-+]?[0-9]+)?\s*$' then (x->>'certified_unit_price')::numeric end as p
        from jsonb_array_elements(p_qatorlar) with ordinality e(x, n)
       where public._t2_f2_storno_qatormi(x)) s
   where not exists (
     select 1 from public.t2_akt_qator aq join public.t2_akt a on a.id = aq.akt_id
      where aq.qator_id = s.qid
        and (s.m is not null or s.sof is not null)
        and (s.m is null or aq.id = s.m)
        and (s.sof is null or aq.akt_id = s.sof)
        and a.obyekt_id = p_obyekt_id and a.tur = 'f2' and a.holat = 'tasdiqlangan' and coalesce(a.lifecycle_status, 'approved') = 'approved'
        and s.h is not null and s.h <> 0
        and sign(s.h) = -sign(coalesce(aq.certified_quantity, aq.hajm))
        and abs(s.h) <= abs(coalesce(aq.certified_quantity, aq.hajm)) + 0.000001
        and ((s.p is null and coalesce(aq.certified_unit_price, aq.narx) is null)
             or abs(s.p - coalesce(aq.certified_unit_price, aq.narx)) <= 0.01))
$fn$;

-- 4) Almashtirilgan (eski versiya) qatorga ODDIY (storno bo'lmagan) element — o'sha qator_id lar.
create or replace function public._t2_f2_almashtirilgan_oddiy(p_qatorlar jsonb) returns jsonb
language sql stable set search_path = public, pg_temp as $fn$
  select jsonb_agg(distinct q.id)
    from jsonb_array_elements(p_qatorlar) x
    join public.t2_qator q on q.id = (x->>'qator_id')::bigint and q.versiya_holat = 'almashtirilgan'
   where not public._t2_f2_storno_qatormi(x)
$fn$;

-- 4) Faqat storno elementlari bor qator_id lar — versiya guard uchun tranzaksiya ichidagi ruxsat (',id,id,').
create or replace function public._t2_f2_storno_ruxsat(p_qatorlar jsonb) returns text
language sql immutable set search_path = public, pg_temp as $fn$
  select coalesce(',' || string_agg(t.qid, ',') || ',', '')
    from (select x->>'qator_id' as qid from jsonb_array_elements(p_qatorlar) x
           group by x->>'qator_id' having bool_and(public._t2_f2_storno_qatormi(x))) t
$fn$;

-- 3) Tasdiqlangan F2 ga bog'liq hujjatlar (bekor qilishni bloklaydi). Bo'lmasa NULL.
create or replace function public._t2_f2_akt_bogliq_v1(p_akt_id bigint) returns jsonb
language sql stable set search_path = public, pg_temp as $fn$
  with a as (select * from public.t2_akt where id = p_akt_id),
  st as (
    select distinct a2.id
      from a join public.t2_akt a2 on a2.obyekt_id = a.obyekt_id and a2.tur = 'f2' and a2.id <> a.id
                 and a2.holat <> 'bekor' and coalesce(a2.lifecycle_status, 'draft') not in ('cancelled', 'superseded')
             join public.t2_akt_qator q2 on q2.akt_id = a2.id
     where q2.raw_snapshot->>'stornoOf' = a.id::text
        or q2.raw_snapshot->>'manba_akt_qator_id' in (select s.id::text from public.t2_akt_qator s where s.akt_id = a.id)),
  f3 as (
    select f.id from public.t2_forma3 f, a
     where f.holat <> 'bekor'
       and (f.id = a.forma3_id or exists (select 1 from public.t2_forma3_akt fa where fa.forma3_id = f.id and fa.akt_id = a.id)))
  select case when exists (select 1 from st) or exists (select 1 from f3) or coalesce((select davr_muhr from a), false) then
    jsonb_build_object(
      'storno_aktlar', (select coalesce(jsonb_agg(id order by id), '[]'::jsonb) from st),
      'forma3', (select coalesce(jsonb_agg(id order by id), '[]'::jsonb) from f3),
      'davr_muhr', coalesce((select davr_muhr from a), false)) end
$fn$;

-- 3) F2 kirgan topshirilgan shartnoma oylik paketlari (faqat ogohlantirish). Jadval bo'lmasa NULL.
create or replace function public._t2_f2_akt_paket_v1(p_akt_id bigint) returns jsonb
language plpgsql stable set search_path = public, pg_temp as $fn$
declare v jsonb;
begin
  if to_regclass('public.t2_shartnoma_oylik_paket') is null then return null; end if;
  execute $q$
    select jsonb_agg(jsonb_build_object('paket_id', p.id, 'shartnoma_id', p.shartnoma_id, 'oy', p.oy, 'versiya', p.versiya) order by p.id)
      from public.t2_shartnoma_oylik_paket p join public.t2_akt a on a.id = $1
     where p.kompaniya_id = a.kompaniya_id and p.oy = date_trunc('month', a.oy)::date
       and p.manifest->'iz' @> jsonb_build_array(jsonb_build_object('f2', jsonb_build_array(jsonb_build_object('akt_id', a.id))))$q$
    into v using p_akt_id;
  return v;
end $fn$;

-- 11) Avto qoralamada narxsiz qoldirilgan (narxsizSabab='avto_qoralama') qatorlar soni.
create or replace function public._t2_f2_narxsiz_avto_soni(p_akt_id bigint) returns integer
language sql stable set search_path = public, pg_temp as $fn$
  select count(*)::int from public.t2_akt_qator aq
   where aq.akt_id = p_akt_id and aq.raw_snapshot->>'narxsizSabab' = 'avto_qoralama'
     and (aq.provenance_status = 'price_intentionally_absent' or aq.certified_unit_price is null)
$fn$;

-- ───────────── 3. t2_f2_qoralama_yangila_v1 (to'liq tana; asos: 20261106530000 + 20261203000100) ─────────────
create or replace function public.t2_f2_qoralama_yangila_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_akt_id bigint, p_kutilgan_versiya integer,
  p_qatorlar jsonb, p_operation_id uuid, p_manba text default 'frontend_v2')
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_akt public.t2_akt%rowtype; v_prev jsonb; v_request text; v_rev bigint; v_eski jsonb; v_natija jsonb;
  v_soni int; v_narxsiz int; v_buzilish jsonb; v_ogoh int; v_xato jsonb; v_otish jsonb; v_raddan boolean := false;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'f2.prepare');
  perform pg_advisory_xact_lock(hashtextextended('t2_f2_qoralama:op:' || p_operation_id, 0));
  v_request := md5(jsonb_build_array(p_actor_id, p_kompaniya_id, p_akt_id, p_kutilgan_versiya, p_qatorlar, 'f2_qoralama_yangila')::text);
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then
    if v_prev->>'_request' is distinct from v_request then return jsonb_build_object('ok', false, 'code', 'OPERATION_SCOPE_MISMATCH'); end if;
    return (v_prev - '_request' - 'eski_qatorlar') || jsonb_build_object('takror', true);
  end if;

  select * into v_akt from public.t2_akt where id = p_akt_id for update;
  if not found or v_akt.kompaniya_id is distinct from p_kompaniya_id then return jsonb_build_object('ok', false, 'code', 'AKT_NOT_FOUND'); end if;
  if v_akt.tur <> 'f2' then return jsonb_build_object('ok', false, 'code', 'AKT_TUR_NOTOGRI'); end if;
  -- 20261203001500 (C-M4): rad etilgan (rejected) F2 ham tuzatiladi — pastda avval 'rejected → draft' o'tishi.
  if v_akt.holat is distinct from 'qoralama' or coalesce(v_akt.lifecycle_status, 'draft') not in ('draft', 'rejected') then
    return jsonb_build_object('ok', false, 'code', 'AKT_QORALAMA_EMAS',
      'xabar', 'Faqat qoralama yoki rad etilgan F2 yangilanadi. Tasdiqlangan yoki yuborilgan akt tuzatish tartibida o''zgaradi.');
  end if;
  if p_kutilgan_versiya is null then return jsonb_build_object('ok', false, 'code', 'VERSION_REQUIRED'); end if;
  if v_akt.versiya is distinct from p_kutilgan_versiya then
    return jsonb_build_object('ok', false, 'code', 'STALE_VERSION', 'version', v_akt.versiya);
  end if;

  -- t2_akt_yarat_v2 bilan bir xil qator tekshiruvlari.
  if p_qatorlar is null or jsonb_typeof(p_qatorlar) <> 'array' or jsonb_array_length(p_qatorlar) = 0 then
    return jsonb_build_object('ok', false, 'code', 'F2_LINES_REQUIRED');
  end if;
  if exists (select 1 from jsonb_array_elements(p_qatorlar) x where nullif(x->>'qator_id', '') is null) then
    return jsonb_build_object('ok', false, 'code', 'QATOR_ID_REQUIRED');
  end if;
  -- 20261203000100 + 20261203001500: oddiy qator — qator_id ga bitta; storno — manba qatoriga bitta.
  if public._t2_f2_takror_xato(p_qatorlar) then
    return jsonb_build_object('ok', false, 'code', 'DUPLICATE_F2_SOURCE_LINE');
  end if;
  -- 20261203000100: storno manbai faqat shu obyektning tasdiqlangan F2 si.
  if public._t2_f2_storno_manba_xato(p_qatorlar, v_akt.obyekt_id, p_kompaniya_id) is not null then
    return jsonb_build_object('ok', false, 'code', 'STORNO_SOURCE_NOT_APPROVED',
      'xabar', 'Storno faqat shu obyektning tasdiqlangan F2 sidan qilinadi.', 'qatorlar', public._t2_f2_storno_manba_xato(p_qatorlar, v_akt.obyekt_id, p_kompaniya_id));
  end if;
  if exists (select 1 from jsonb_array_elements(p_qatorlar) x where nullif(x->>'certified_quantity', '') is null) then
    return jsonb_build_object('ok', false, 'code', 'CERTIFIED_QTY_INVALID');
  end if;
  if exists (select 1 from jsonb_array_elements(p_qatorlar) x
             where coalesce((x->>'price_intentionally_absent')::boolean, false) is not true
               and (nullif(x->>'certified_unit_price', '') is null or nullif(x->>'certified_amount', '') is null)) then
    return jsonb_build_object('ok', false, 'code', 'MISSING_CERTIFIED_PRICE');
  end if;
  if exists (select 1 from jsonb_array_elements(p_qatorlar) x left join public.t2_qator q
               on q.id = (x->>'qator_id')::bigint and q.obyekt_id = v_akt.obyekt_id where q.id is null) then
    return jsonb_build_object('ok', false, 'code', 'QATOR_SCOPE_INVALID', 'xabar', 'Ba''zi qatorlar bu obyektga tegishli emas.');
  end if;
  -- 20261203001500 (B dizayn b): storno qatori — ishora teskari, |hajm| ≤ manba, narx = manba narxi.
  v_xato := public._t2_f2_storno_qator_xato(p_qatorlar, v_akt.obyekt_id);
  if v_xato is not null then
    return jsonb_build_object('ok', false, 'code', 'STORNO_LINE_INVALID',
      'xabar', 'Storno qatori manba F2 qatoriga mos emas (ishora teskari, hajm manbadan oshmasin, narx manba narxi).', 'qatorlar', v_xato);
  end if;
  -- 20261203001500 (C-M9): eski versiya qatoriga faqat storno; oddiy qator — kod bilan rad (trigger — oxirgi himoya).
  v_xato := public._t2_f2_almashtirilgan_oddiy(p_qatorlar);
  if v_xato is not null then
    return jsonb_build_object('ok', false, 'code', 'QATOR_ALMASHTIRILGAN',
      'xabar', 'Qator yangi smeta versiyasi bilan almashtirilgan — unga faqat storno yoziladi.', 'qatorlar', v_xato);
  end if;

  -- 20261203001500 (C-M4): rad etilgan F2 — avval rejected → draft (tarix, audit, versiya + 1), so'ng qatorlar almashtiriladi.
  if v_akt.lifecycle_status = 'rejected' then
    v_otish := public.t2_akt_lifecycle_transition_v1(p_kompaniya_id, p_akt_id, 'draft', p_actor_id, v_akt.versiya,
                 md5(p_operation_id::text || ':rejected_to_draft')::uuid, null);
    if coalesce((v_otish->>'ok')::boolean, false) is not true then return v_otish; end if;
    v_raddan := true;
    select * into v_akt from public.t2_akt where id = p_akt_id for update;
  end if;

  select coalesce(jsonb_agg(to_jsonb(aq) order by aq.id), '[]'::jsonb) into v_eski from public.t2_akt_qator aq where aq.akt_id = p_akt_id;
  delete from public.t2_akt_qator where akt_id = p_akt_id;

  select id into v_rev from public.t2_smeta_revision where obyekt_id = v_akt.obyekt_id order by seq desc limit 1;
  -- Bitta INSERT: certified_* / raw_snapshot / basis to'g'ridan (avval INSERT + UPDATE; natija aynan bir xil),
  -- t2_price_basis_resolve_v1 qatorga bir marta (B-m6). Versiya guard uchun storno ruxsati shu tranzaksiyada.
  perform set_config('t2.f2.storno_qatorlar', public._t2_f2_storno_ruxsat(p_qatorlar), true);
  insert into public.t2_akt_qator (akt_id, qator_id, obyekt_id, kompaniya_id, hajm, narx, izoh, baseline_narx, baseline_summa,
                                   narx_manba, revision_id, certified_quantity, certified_unit_price, certified_amount,
                                   certified_source_hash, raw_snapshot, provenance_status, reference_basis_line_id, basis_approved_price_snapshot)
  select p_akt_id, q.id, v_akt.obyekt_id, v_akt.kompaniya_id, (e.x->>'certified_quantity')::numeric,
         case when f.nx then null else (e.x->>'certified_unit_price')::numeric end,
         nullif(btrim(coalesce(e.x->>'izoh', '')), ''), q.narx,
         case when q.narx is not null then (e.x->>'certified_quantity')::numeric * q.narx end,
         case when f.nx then 'smeta'
              when q.narx is not null and (e.x->>'certified_unit_price')::numeric <> q.narx then 'qol_nomalum' else 'smeta' end,
         v_rev,
         (e.x->>'certified_quantity')::numeric,
         case when f.nx then null else (e.x->>'certified_unit_price')::numeric end,
         case when f.nx then null else (e.x->>'certified_amount')::numeric end,
         nullif(e.x->>'certified_source_hash', ''),
         coalesce(e.x->'raw_snapshot', e.x),
         case when f.nx then 'price_intentionally_absent' else 'source_certified' end,
         (b.r->>'basis_line_id')::bigint,
         (b.r->>'approved_price')::numeric
    from jsonb_array_elements(p_qatorlar) with ordinality e(x, n)
    cross join lateral (select coalesce((e.x->>'price_intentionally_absent')::boolean, false) as nx) f
    join public.t2_qator q on q.id = (e.x->>'qator_id')::bigint
    cross join lateral (select public.t2_price_basis_resolve_v1(q.id, current_date) as r) b
   order by e.n;
  perform set_config('t2.f2.storno_qatorlar', '', true);

  select count(*), count(*) filter (where summa is null) into v_soni, v_narxsiz from public.t2_akt_qator where akt_id = p_akt_id;
  select jsonb_agg(jsonb_build_object('qator_id', h.id, 'nom', h.nom, 'f2', h.f2_hajm, 'fakt', h.fakt_hajm)), count(*)
    into v_buzilish, v_ogoh
    from public.t2_akt_qator aq join public.t2_qator_holat h on h.id = aq.qator_id and h.obyekt_id = v_akt.obyekt_id
   where aq.akt_id = p_akt_id and h.fakt_hajm is not null
     and (abs(h.f2_hajm) > abs(h.fakt_hajm) + 0.000001 or h.f2_hajm * h.fakt_hajm < 0);
  -- 20261203001500 (A6/C-M3): versiya + 1 — keyingi saqlash yangi versiyani kutadi (CAS).
  update public.t2_akt set hujjat_jami = (select sum(q.summa) from public.t2_akt_qator q where q.akt_id = p_akt_id),
         revision_id = coalesce(v_rev, revision_id), manba = coalesce(nullif(btrim(p_manba), ''), manba),
         izoh = left(trim(both ' | ' from coalesce(izoh, '') || ' | F2 import qayta saqlandi: ' || v_soni || ' qator'), 2000),
         versiya = versiya + 1, yangilandi = now()
   where id = p_akt_id;

  perform public.t2_audit_yoz(p_kompaniya_id, 'f2_qoralama_yangila', 'f2', v_akt.obyekt_id,
    format('akt=%s eski=%s yangi=%s', p_akt_id, jsonb_array_length(v_eski), v_soni), 'actor:' || p_actor_id, null);
  v_natija := jsonb_build_object('ok', true, 'akt_id', p_akt_id, 'holat', 'qoralama', 'qator_soni', v_soni, 'narxsiz', v_narxsiz,
    'eski_qator_soni', jsonb_array_length(v_eski), 'ogohlantirish', v_buzilish, 'ogohlantirish_soni', coalesce(v_ogoh, 0),
    'versiya', (select versiya from public.t2_akt where id = p_akt_id), 'rad_etilgandan_qaytdi', v_raddan,
    'narxsiz_avto', public._t2_f2_narxsiz_avto_soni(p_akt_id), 'contract', 'CERTIFIED_F2_V2');
  insert into public.t2_onboarding_command_log(operation_id, actor_id, command, natija)
    values (p_operation_id, p_actor_id, 'f2_qoralama_yangila', v_natija || jsonb_build_object('_request', v_request, 'eski_qatorlar', v_eski));
  return v_natija;
end $$;
comment on function public.t2_f2_qoralama_yangila_v1(bigint, bigint, bigint, integer, jsonb, uuid, text) is
  'F2 qoralama (yoki rad etilgan) qatorlarini almashtiradi; har saqlash versiya + 1 (20261203001500). versiya: tarix — F2 qoralama qatorlari id doirasida (storno eski versiya qatorlariga ham).';

-- ───────────── 4. t2_akt_yarat_v2 (langar): storno qatori tekshiruvi + almashtirilgan qator + versiya guard ruxsati ─────────────
do $y$
declare d text; a1 text; a2 text;
begin
  d := replace(pg_get_functiondef('public.t2_akt_yarat_v2(bigint,date,jsonb,bigint,text,uuid,text)'::regprocedure), E'\r\n', E'\n');
  if position('f2_tuzatish_20261203001500' in d) > 0 then raise exception 'F2_TUZATISH: t2_akt_yarat_v2 allaqachon yangilangan'; end if;
  a1 := E'''qatorlar'', public._t2_f2_storno_manba_xato(p_qatorlar, p_obyekt_id, v_komp));\n  end if;';
  a2 := E'\n  where aq.id = ar.id;';
  if (length(d) - length(replace(d, a1, ''))) <> length(a1) then raise exception 'F2_TUZATISH: t2_akt_yarat_v2 storno langari aynan 1 marta topilmadi'; end if;
  if (length(d) - length(replace(d, a2, ''))) <> length(a2) then raise exception 'F2_TUZATISH: t2_akt_yarat_v2 UPDATE langari aynan 1 marta topilmadi'; end if;
  d := replace(d, a1, a1 || E'\n'
    || E'  -- f2_tuzatish_20261203001500: storno qatori manba qatoriga mos (ishora teskari, |hajm| <= manba, narx = manba narxi).\n'
    || E'  if public._t2_f2_storno_qator_xato(p_qatorlar, p_obyekt_id) is not null then\n'
    || E'    return jsonb_build_object(''ok'', false, ''code'', ''STORNO_LINE_INVALID'',\n'
    || E'      ''xabar'', ''Storno qatori manba F2 qatoriga mos emas (ishora teskari, hajm manbadan oshmasin, narx manba narxi).'',\n'
    || E'      ''qatorlar'', public._t2_f2_storno_qator_xato(p_qatorlar, p_obyekt_id));\n  end if;\n'
    || E'  if public._t2_f2_almashtirilgan_oddiy(p_qatorlar) is not null then\n'
    || E'    return jsonb_build_object(''ok'', false, ''code'', ''QATOR_ALMASHTIRILGAN'',\n'
    || E'      ''xabar'', ''Qator yangi smeta versiyasi bilan almashtirilgan — unga faqat storno yoziladi.'', ''qatorlar'', public._t2_f2_almashtirilgan_oddiy(p_qatorlar));\n  end if;\n'
    || E'  perform set_config(''t2.f2.storno_qatorlar'', public._t2_f2_storno_ruxsat(p_qatorlar), true);');
  d := replace(d, a2, a2 || E'\n  perform set_config(''t2.f2.storno_qatorlar'', '''', true);');
  execute d;
end $y$;

-- ───────────── 5. t2_akt_lifecycle_transition_v1 (langar) ─────────────
do $t$
declare d text; a1 text; a2 text; a3 text;
begin
  d := replace(pg_get_functiondef('public.t2_akt_lifecycle_transition_v1(bigint,bigint,text,bigint,integer,uuid,text)'::regprocedure), E'\r\n', E'\n');
  if position('f2_tuzatish_20261203001500' in d) > 0 then raise exception 'F2_TUZATISH: transition allaqachon yangilangan'; end if;
  a1 := $x$('rejected','submitted'), ('rejected','cancelled'),$x$;
  a2 := E'  if v_akt.lifecycle_status = ''approved'' and p_to_status = ''cancelled'' then\n'
     || E'    perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, ''f2.approve'');\n  end if;\n';
  a3 := $x$'version', v_new_version, 'history_id', v_history.id);$x$;
  if (length(d) - length(replace(d, a1, ''))) <> length(a1) then raise exception 'F2_TUZATISH: transition allowed langari aynan 1 marta topilmadi'; end if;
  if (length(d) - length(replace(d, a2, ''))) <> length(a2) then raise exception 'F2_TUZATISH: transition bekor langari aynan 1 marta topilmadi'; end if;
  if (length(d) - length(replace(d, a3, ''))) <> length(a3) then raise exception 'F2_TUZATISH: transition return langari aynan 1 marta topilmadi'; end if;
  -- 2) rejected → draft (ruxsat: f2.prepare — mavjud CASE p_to_status IN ('draft','submitted')).
  d := replace(d, a1, a1 || $x$ ('rejected','draft'),$x$);
  -- 3) bog'liq hujjatlar; 11) avto qoralama narxsiz qatorlari.
  d := replace(d, a2, E'  if v_akt.lifecycle_status = ''approved'' and p_to_status = ''cancelled'' then\n'
     || E'    perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, ''f2.approve'');\n'
     || E'    -- f2_tuzatish_20261203001500 (C-M7): faol storno/pereraschet, Forma-3 yoki davr muhri bo''lsa bekor qilinmaydi.\n'
     || E'    if public._t2_f2_akt_bogliq_v1(p_akt_id) is not null then\n'
     || E'      return jsonb_build_object(''ok'', false, ''code'', ''DEPENDENTS_EXIST'',\n'
     || E'        ''xabar'', ''Bu F2 ga bog''''liq hujjatlar bor (storno/pereraschet, Forma-3 yoki davr muhri). Avval ularni bekor qiling.'',\n'
     || E'        ''bogliq'', public._t2_f2_akt_bogliq_v1(p_akt_id));\n'
     || E'    end if;\n  end if;\n'
     || E'  -- f2_tuzatish_20261203001500 (egasi 2026-11-06): avto qoralamada narxsiz qoldirilgan qator bor ekan — yuborish/tasdiq yo''q.\n'
     || E'  if p_to_status in (''submitted'', ''approved'') and v_akt.lifecycle_status <> p_to_status\n'
     || E'     and public._t2_f2_narxsiz_avto_soni(p_akt_id) > 0 then\n'
     || E'    return jsonb_build_object(''ok'', false, ''code'', ''NARXSIZ_QATOR_BOR'', ''soni'', public._t2_f2_narxsiz_avto_soni(p_akt_id),\n'
     || E'      ''xabar'', ''Avto qoralamada narxsiz qoldirilgan qatorlar bor — narxlang yoki ongli «narxsiz» deb belgilang.'');\n'
     || E'  end if;\n');
  -- 3) topshirilgan paket — faqat ogohlantirish (bloklamaydi).
  d := replace(d, a3, $x$'version', v_new_version, 'history_id', v_history.id)
    || case when v_akt.lifecycle_status = 'approved' and p_to_status = 'cancelled' and public._t2_f2_akt_paket_v1(p_akt_id) is not null
            then jsonb_build_object('ogohlantirish', 'PAKET_TOPSHIRILGAN', 'paketlar', public._t2_f2_akt_paket_v1(p_akt_id))
            else '{}'::jsonb end;$x$);
  execute d;
end $t$;

-- ───────────── 6. Projection guard (to'liq tana; asos: 20261117100000) + 11) narxsiz darvoza ─────────────
create or replace function public.t2_akt_lifecycle_projection_guard_v1()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $function$
declare
  v_internal text := current_setting('t2.akt.lifecycle_transition', true);
  v_ruxsat_ustun constant text[] := array['holat','versiya','yangilandi','lifecycle_status','lifecycle_updated_at',
    'lifecycle_updated_by','lifecycle_reason','lifecycle_cancelled_at'];
  v_narxsiz int;
begin
  if tg_op = 'INSERT' then
    if new.lifecycle_status is null or (new.lifecycle_status = 'draft' and new.holat in ('tasdiqlangan','bekor')) then
      new.lifecycle_status := case new.holat
        when 'tasdiqlangan' then 'approved'
        when 'bekor' then 'cancelled'
        else 'draft'
      end;
    end if;
    if new.lifecycle_status = 'approved' then new.holat := 'tasdiqlangan';
    elsif new.lifecycle_status in ('cancelled','superseded') then new.holat := 'bekor';
    else new.holat := 'qoralama';
    end if;
    new.lifecycle_updated_at := coalesce(new.lifecycle_updated_at, now());
    return new;
  end if;

  -- Tasdiqlangan sarlavha joyida o'zgarmaydi. Yagona istisno (20261117100000): transition ichidan bekor qilish —
  -- faqat holat/lifecycle/versiya maydonlari; biznes maydonlari bayt-bayt bir xil qoladi.
  if old.lifecycle_status = 'approved'
     and (to_jsonb(new) - 'yangilandi') is distinct from (to_jsonb(old) - 'yangilandi') then
    if not (coalesce(v_internal, '') = '1' and new.lifecycle_status = 'cancelled'
            and (to_jsonb(new) - v_ruxsat_ustun) is not distinct from (to_jsonb(old) - v_ruxsat_ustun)) then
      raise exception 'approved akt immutable; correction uchun yangi revision yarating'
        using errcode = '55000';
    end if;
  end if;

  if new.lifecycle_status is distinct from old.lifecycle_status then
    if coalesce(v_internal, '') <> '1' then
      raise exception 'lifecycle_status faqat t2_akt_lifecycle_transition_v1 orqali o''zgaradi'
        using errcode = '42501';
    end if;
    if new.lifecycle_status = 'approved' then new.holat := 'tasdiqlangan';
    elsif new.lifecycle_status in ('cancelled','superseded') then new.holat := 'bekor';
    else new.holat := 'qoralama';
    end if;
  elsif new.holat is distinct from old.holat then
    if new.holat = 'tasdiqlangan' then new.lifecycle_status := 'approved';
    elsif new.holat = 'bekor' then new.lifecycle_status := 'cancelled';
    elsif new.holat = 'qoralama' then new.lifecycle_status := 'draft';
    else
      raise exception 'noma''lum legacy akt holati' using errcode = '22023';
    end if;
    new.lifecycle_updated_at := now();
  end if;

  -- 20261203001500 (egasi 2026-11-06): avto qoralama narxsiz qatori bor F2 yuborilmaydi/tasdiqlanmaydi — har yo'lda
  -- (transition, eski t2_akt_tasdiqlash holat yangilashi). Transition o'zi avval NARXSIZ_QATOR_BOR kodini qaytaradi.
  if new.tur = 'f2' and new.lifecycle_status in ('submitted','approved')
     and new.lifecycle_status is distinct from old.lifecycle_status then
    v_narxsiz := public._t2_f2_narxsiz_avto_soni(new.id);
    if v_narxsiz > 0 then
      raise exception 'NARXSIZ_QATOR_BOR: F2 #% da % ta avto qoralama narxsiz qator bor', new.id, v_narxsiz
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end $function$;

-- ───────────── 7. Versiya guard (to'liq tana; asos: 20261114700000) — storno istisnosi ─────────────
create or replace function public.t2_akt_qator_versiya_guard()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if exists (select 1 from public.t2_qator q where q.id = new.qator_id and q.versiya_holat = 'almashtirilgan') then
    -- 20261203001500 (C-M9): pereraschet storno qatori — RPC tekshirgan (manba tasdiqlangan F2, ishora/hajm/narx) va shu
    -- tranzaksiyada ruxsat bergan qator_id, F2 akti, qatorda tasdiqlangan F2 tarixi bor. Boshqa hamma holat — rad.
    if position(',' || new.qator_id::text || ',' in coalesce(current_setting('t2.f2.storno_qatorlar', true), '')) > 0
       and exists (select 1 from public.t2_akt a where a.id = new.akt_id and a.tur = 'f2')
       and exists (select 1 from public.t2_akt_qator s join public.t2_akt sa on sa.id = s.akt_id
                    where s.qator_id = new.qator_id and sa.tur = 'f2' and sa.holat = 'tasdiqlangan'
                      and coalesce(sa.lifecycle_status, 'approved') = 'approved') then
      return new;
    end if;
    raise exception 'QATOR_ALMASHTIRILGAN: qator % yangi smeta versiyasi bilan almashtirilgan — fakt/F2 faqat faol qatorlarga', new.qator_id
      using errcode = 'P0001';
  end if;
  return new;
end $$;

-- ───────────── 8. Trigger tartibi: raqam takrori shartnoma_scope dan keyin (A26) ─────────────
do $tr$
begin
  if exists (select 1 from pg_trigger where tgrelid = 'public.t2_akt'::regclass and tgname = 't2_akt_raqam_takror' and not tgisinternal) then
    alter trigger t2_akt_raqam_takror on public.t2_akt rename to t2_akt_zz_raqam_takror;
  elsif not exists (select 1 from pg_trigger where tgrelid = 'public.t2_akt'::regclass and tgname = 't2_akt_zz_raqam_takror') then
    raise exception 'F2_TUZATISH: t2_akt_raqam_takror trigger topilmadi';
  end if;
end $tr$;

-- ───────────── 9. t2_qator_holat (to'liq; asos: 20261117400000) + fakt_summa_nomalum (OXIRGI ustun) ─────────────
create or replace view public.t2_qator_holat as
 SELECT q.id,
    q.id AS qator_id,
    q.obyekt_id,
    q.tur,
    q.raqam,
    q.kod,
    q.nom,
    q.birlik,
    q.kat,
        CASE
            WHEN q.versiya_holat = 'almashtirilgan'::text THEN 0::numeric
            ELSE q.hajm
        END AS smeta_hajm,
    q.narx AS smeta_narx,
        CASE
            WHEN q.versiya_holat = 'almashtirilgan'::text THEN 0::numeric
            ELSE q.summa
        END AS smeta_summa,
    e.fakt_hajm,
    CASE
            WHEN d.f2_hajm <> 0::numeric AND d.f2_summa_yoq = 0 AND e.fakt_hajm IS NOT NULL AND e.fakt_summa IS NOT NULL THEN public._t2_f2_narxda_v1(e.fakt_hajm, d.f2_hajm, d.f2_summa_malum)
            ELSE e.fakt_summa
        END AS fakt_summa,
    d.f2_hajm,
    d.f2_summa_malum AS f2_summa,
        CASE
            WHEN q.versiya_holat = 'almashtirilgan'::text THEN 0::numeric
            ELSE q.hajm - d.f2_hajm - al.v
        END AS qoldiq_hajm,
        CASE
            WHEN q.versiya_holat = 'almashtirilgan'::text THEN 0::numeric
            ELSE q.summa - d.f2_summa_malum - COALESCE(als.s, 0::numeric)
        END AS qoldiq_summa,
    GREATEST(e.fakt_hajm - d.f2_hajm, 0::numeric) AS f2_mumkin_hajm,
    GREATEST(e.fakt_summa - d.f2_summa_malum, 0::numeric) AS f2_mumkin_summa,
        CASE
            WHEN d.f2_hajm <> 0::numeric THEN round(d.f2_summa_malum / d.f2_hajm, 2)
            ELSE NULL::numeric
        END AS f2_narx,
        CASE
            WHEN e.fakt_hajm <> 0::numeric THEN round(e.fakt_summa / e.fakt_hajm, 2)
            ELSE NULL::numeric
        END AS fakt_narx,
        CASE
            WHEN d.f2_hajm <> 0::numeric AND q.narx IS NOT NULL AND q.narx <> 0::numeric THEN round((d.f2_summa_malum / d.f2_hajm - q.narx) / q.narx * 100::numeric, 1)
            ELSE NULL::numeric
        END AS f2_narx_farq_foiz,
    q.ota_id,
    q.norma,
    d.direct_fakt_hajm,
    d.direct_fakt_summa,
    e.fakt_manbasi,
    d.f2_summa_nomalum,
    al.v AS almashtirilgan_hajm,
    als.s AS almashtirilgan_summa,
    q.versiya_holat,
    q.hajm AS asl_smeta_hajm,
    q.summa AS asl_smeta_summa,
    d.f2_summa_yoq,
        CASE
            WHEN e.fakt_manbasi = 'BL_NORMA'::text THEN
            CASE
                WHEN e.fakt_summa IS NULL AND COALESCE(e.fakt_hajm, 0::numeric) <> 0::numeric THEN 1::bigint
                ELSE 0::bigint
            END
            ELSE d.fakt_summa_nomalum
        END AS fakt_summa_nomalum
   FROM t2_qator q
     CROSS JOIN LATERAL ( SELECT
                CASE
                    WHEN (EXISTS ( SELECT 1
                       FROM t2_qator zz
                      WHERE zz.replaces_line_id = q.id AND zz.replaces_line_id IS NOT NULL)) OR (EXISTS ( SELECT 1
                       FROM t2_qator zz
                      WHERE zz.replaces_line_id = q.ota_id AND zz.replaces_line_id IS NOT NULL)) THEN t2_almashtirilgan_hajm(q.id)
                    ELSE 0::numeric
                END AS v) al
     CROSS JOIN LATERAL ( SELECT
                CASE
                    WHEN COALESCE(al.v, 0::numeric) = 0::numeric THEN 0::numeric
                    WHEN q.narx IS NOT NULL THEN al.v * q.narx
                    WHEN q.hajm IS NOT NULL AND q.hajm <> 0::numeric AND q.summa IS NOT NULL THEN al.v * q.summa / q.hajm
                    ELSE NULL::numeric
                END AS s) als
     LEFT JOIN LATERAL ( SELECT COALESCE(sum(aq.hajm) FILTER (WHERE a.tur = 'fakt'::text AND a.holat <> 'bekor'::text), 0::numeric) AS direct_fakt_hajm,
            COALESCE(sum(aq.summa) FILTER (WHERE a.tur = 'fakt'::text AND a.holat <> 'bekor'::text), 0::numeric) AS direct_fakt_summa,
            COALESCE(sum(COALESCE(aq.certified_quantity, aq.hajm)) FILTER (WHERE a.tur = 'f2'::text AND a.holat = 'tasdiqlangan'::text), 0::numeric) AS f2_hajm,
            COALESCE(sum(COALESCE(aq.certified_amount, aq.summa)) FILTER (WHERE a.tur = 'f2'::text AND a.holat = 'tasdiqlangan'::text), 0::numeric) AS f2_summa_malum,
            count(*) FILTER (WHERE a.tur = 'f2'::text AND a.holat = 'tasdiqlangan'::text AND (q.tur <> ALL (ARRAY['rz'::text, 'bl'::text])) AND COALESCE(q.nom, ''::text) !~* 'ЗАТРАТЫ\s+ТРУДА\s+МАШИНИСТ'::text AND COALESCE(aq.certified_amount, aq.summa) IS NULL AND COALESCE(aq.certified_quantity, aq.hajm, 0::numeric) <> 0::numeric) AS f2_summa_nomalum,
            count(*) FILTER (WHERE a.tur = 'f2'::text AND a.holat = 'tasdiqlangan'::text AND COALESCE(aq.certified_amount, aq.summa) IS NULL AND COALESCE(aq.certified_quantity, aq.hajm, 0::numeric) <> 0::numeric) AS f2_summa_yoq,
            count(*) FILTER (WHERE a.tur = 'fakt'::text AND a.holat <> 'bekor'::text AND aq.summa IS NULL AND COALESCE(aq.hajm, 0::numeric) <> 0::numeric) AS fakt_summa_nomalum
           FROM t2_akt_qator aq
             LEFT JOIN t2_akt a ON a.id = aq.akt_id
          WHERE aq.qator_id = q.id) d ON true
     LEFT JOIN LATERAL ( SELECT count(p.id) AS bl_soni,
            COALESCE(sum(paq.hajm) FILTER (WHERE pa.tur = 'fakt'::text AND pa.holat <> 'bekor'::text), 0::numeric) AS fakt_hajm,
            COALESCE(sum(paq.hajm) FILTER (WHERE pa.tur = 'fakt'::text AND pa.holat <> 'bekor'::text AND paq.narx_manba = 'f2_sertifikat'::text), 0::numeric) AS f2s_hajm
           FROM t2_qator p
             LEFT JOIN t2_akt_qator paq ON paq.qator_id = p.id
             LEFT JOIN t2_akt pa ON pa.id = paq.akt_id
          WHERE q.tur = 'rs'::text AND q.norma IS NOT NULL AND p.id = q.ota_id AND p.obyekt_id = q.obyekt_id AND p.tur = 'bl'::text) bl ON true
     CROSS JOIN LATERAL ( SELECT
                CASE
                    WHEN bl.bl_soni > 0 AND d.direct_fakt_hajm = 0::numeric THEN (bl.fakt_hajm - bl.f2s_hajm) * q.norma
                    ELSE d.direct_fakt_hajm
                END AS fakt_hajm,
                CASE
                    WHEN bl.bl_soni > 0 AND d.direct_fakt_hajm = 0::numeric THEN
                    CASE
                        WHEN q.narx IS NULL THEN NULL::numeric
                        ELSE (bl.fakt_hajm - bl.f2s_hajm) * q.norma * q.narx
                    END
                    ELSE d.direct_fakt_summa
                END AS fakt_summa,
                CASE
                    WHEN bl.bl_soni > 0 AND d.direct_fakt_hajm = 0::numeric THEN 'BL_NORMA'::text
                    ELSE 'DIRECT'::text
                END AS fakt_manbasi) e;

-- ───────────── 10. Ruxsatlar ─────────────
do $g$
declare s text;
begin
  foreach s in array array[
    '_t2_f2_storno_manba_qator(jsonb)', '_t2_f2_takror_xato(jsonb)', '_t2_f2_storno_manba_xato(jsonb,bigint,bigint)',
    '_t2_f2_storno_qator_xato(jsonb,bigint)', '_t2_f2_almashtirilgan_oddiy(jsonb)', '_t2_f2_storno_ruxsat(jsonb)',
    '_t2_f2_akt_bogliq_v1(bigint)', '_t2_f2_akt_paket_v1(bigint)', '_t2_f2_narxsiz_avto_soni(bigint)',
    't2_f2_qoralama_yangila_v1(bigint,bigint,bigint,integer,jsonb,uuid,text)',
    't2_akt_yarat_v2(bigint,date,jsonb,bigint,text,uuid,text)',
    't2_akt_lifecycle_transition_v1(bigint,bigint,text,bigint,integer,uuid,text)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', s);
    execute format('grant execute on function public.%s to service_role', s);
  end loop;
  revoke all on function public.t2_akt_lifecycle_projection_guard_v1() from public, anon, authenticated;
  revoke all on function public.t2_akt_qator_versiya_guard() from public, anon, authenticated;
end $g$;

commit;
