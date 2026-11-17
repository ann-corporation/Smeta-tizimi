-- 20270109000000_t2_f2_resurs_tushgan_v1
-- Egasi 2026-11-18: F2 qoralamada ish (BL) qatori bor, uning resurslari (RS/MAT, ota_id = BL) yo'q edi —
-- ish narxsiz chiqib, puli jamiga kirmagan va hech kim ogohlantirilmagan.
-- 1) _t2_f2_resurs_tushgan_v1 / _soni_v1 — tekshiruv (zamena qilingan asl qatorlar hisobga olinmaydi).
-- 2) t2_f2_qoralama_yangila_v1 — saqlash javobida resurs_tushgan(_soni) ogohlantirishi.
-- 3) t2_akt_lifecycle_transition_v1 — yuborish/tasdiq F2_RESURS_TUSHGAN bilan bloklanadi.
-- 4) t2_f2_resurs_tushgan_royxat_v1 — kompaniya bo'yicha ochiq F2 lar ro'yxati (UI/MCP/AI uchun).

create or replace function public._t2_f2_resurs_tushgan_v1(p_akt_id bigint, p_limit int default 200)
returns jsonb language sql stable security definer set search_path to 'public', 'pg_temp' as $f$
  select coalesce(jsonb_agg(r order by (r->>'bl_id')::bigint, (r->>'qator_id')::bigint), '[]'::jsonb) from (
    select jsonb_build_object('bl_id', p.id, 'bl_kod', p.kod, 'qator_id', c.id, 'tur', c.tur, 'kod', c.kod,
             'nom', left(c.nom, 120), 'f2_mumkin_hajm', h.f2_mumkin_hajm, 'narx', h.smeta_narx,
             'summa_taxmin', h.f2_mumkin_hajm * h.smeta_narx) r
      from public.t2_akt_qator aq
      join public.t2_qator p on p.id = aq.qator_id and p.tur = 'bl'
      join public.t2_qator c on c.ota_id = p.id
      join public.t2_qator_holat h on h.qator_id = c.id and h.versiya_holat = 'faol'
     where aq.akt_id = p_akt_id and coalesce(aq.hajm, 0) <> 0
       and coalesce(h.f2_mumkin_hajm, 0) <> 0
       and not exists (select 1 from public.t2_akt_qator x where x.akt_id = p_akt_id and x.qator_id = c.id)
       and not exists (select 1 from public.t2_qator z where z.replaces_line_id = c.id)
     order by p.id, c.id
     limit greatest(coalesce(p_limit, 200), 1)
  ) s
$f$;

create or replace function public._t2_f2_resurs_tushgan_soni_v1(p_akt_id bigint)
returns int language sql stable security definer set search_path to 'public', 'pg_temp' as $f$
  select count(*)::int
    from public.t2_akt_qator aq
    join public.t2_qator p on p.id = aq.qator_id and p.tur = 'bl'
    join public.t2_qator c on c.ota_id = p.id
    join public.t2_qator_holat h on h.qator_id = c.id and h.versiya_holat = 'faol'
   where aq.akt_id = p_akt_id and coalesce(aq.hajm, 0) <> 0
     and coalesce(h.f2_mumkin_hajm, 0) <> 0
     and not exists (select 1 from public.t2_akt_qator x where x.akt_id = p_akt_id and x.qator_id = c.id)
     and not exists (select 1 from public.t2_qator z where z.replaces_line_id = c.id)
$f$;

create or replace function public.t2_f2_resurs_tushgan_royxat_v1(p_actor_id bigint, p_kompaniya_id bigint)
returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $f$
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  return (select coalesce(jsonb_agg(jsonb_build_object('akt_id', a.id, 'obyekt_id', a.obyekt_id,
            'soni', public._t2_f2_resurs_tushgan_soni_v1(a.id)) order by a.id), '[]'::jsonb)
            from public.t2_akt a
           where a.kompaniya_id = p_kompaniya_id and a.tur = 'f2' and a.holat = 'qoralama'
             and public._t2_f2_resurs_tushgan_soni_v1(a.id) > 0);
end $f$;

revoke all on function public._t2_f2_resurs_tushgan_v1(bigint, int) from public, anon, authenticated;
revoke all on function public._t2_f2_resurs_tushgan_soni_v1(bigint) from public, anon, authenticated;
revoke all on function public.t2_f2_resurs_tushgan_royxat_v1(bigint, bigint) from public, anon;
grant execute on function public.t2_f2_resurs_tushgan_royxat_v1(bigint, bigint) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.t2_f2_qoralama_yangila_v1(p_actor_id bigint, p_kompaniya_id bigint, p_akt_id bigint, p_kutilgan_versiya integer, p_qatorlar jsonb, p_operation_id uuid, p_manba text DEFAULT 'frontend_v2'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    'narxsiz_avto', public._t2_f2_narxsiz_avto_soni(p_akt_id), 'contract', 'CERTIFIED_F2_V2',
    'resurs_tushgan_soni', public._t2_f2_resurs_tushgan_soni_v1(p_akt_id),
    'resurs_tushgan', public._t2_f2_resurs_tushgan_v1(p_akt_id, 50));
  insert into public.t2_onboarding_command_log(operation_id, actor_id, command, natija)
    values (p_operation_id, p_actor_id, 'f2_qoralama_yangila', v_natija || jsonb_build_object('_request', v_request, 'eski_qatorlar', v_eski));
  return v_natija;
end $function$;

CREATE OR REPLACE FUNCTION public.t2_akt_lifecycle_transition_v1(p_kompaniya_id bigint, p_akt_id bigint, p_to_status text, p_actor_id bigint, p_expected_version integer, p_operation_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_akt public.t2_akt;
  v_history public.t2_akt_holat_tarix;
  v_new_version integer;
  v_reason text := nullif(btrim(p_reason), '');
  v_allowed boolean := false;
  v_yuboruvchi bigint;
  v_tekshiruvchi bigint;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  if p_expected_version is null then return jsonb_build_object('ok', false, 'code', 'EXPECTED_VERSION_REQUIRED'); end if;
  if p_to_status is null or p_to_status not in ('draft','submitted','checked','approved','rejected','cancelled','superseded') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_LIFECYCLE_STATUS');
  end if;
  if p_to_status in ('rejected','cancelled') and v_reason is null then
    return jsonb_build_object('ok', false, 'code', 'REASON_REQUIRED');
  end if;
  if v_reason is not null and length(v_reason) > 2000 then
    return jsonb_build_object('ok', false, 'code', 'REASON_TOO_LONG');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text, 0));
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id); 
  perform public.t2_require_permission_v2(p_kompaniya_id,p_actor_id,CASE WHEN p_to_status='cancelled' THEN 'f2.cancel' WHEN p_to_status='superseded' THEN 'f2.correct' WHEN p_to_status IN ('draft','submitted') THEN 'f2.prepare' ELSE 'f2.approve' END);

  if exists (
    select 1 from public.t2_akt_holat_tarix h
    where h.operation_id = p_operation_id and h.akt_id <> p_akt_id
  ) then
    return jsonb_build_object('ok', false, 'code', 'OPERATION_REPLAY_CONFLICT');
  end if;

  select * into v_akt
  from public.t2_akt
  where id = p_akt_id and kompaniya_id = p_kompaniya_id
  for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'AKT_NOT_FOUND'); end if;

  select * into v_history
  from public.t2_akt_holat_tarix h
  where h.akt_id = p_akt_id and h.operation_id = p_operation_id
  order by h.id desc limit 1;
  if found then
    if v_history.to_status <> p_to_status then
      return jsonb_build_object('ok', false, 'code', 'OPERATION_REPLAY_CONFLICT');
    end if;
    return jsonb_build_object('ok', true, 'retry', true, 'akt_id', p_akt_id,
      'from_status', v_history.from_status, 'status', v_history.to_status,
      'version', v_akt.versiya, 'history_id', v_history.id);
  end if;

  if v_akt.versiya <> p_expected_version then
    return jsonb_build_object('ok', false, 'code', 'STALE_VERSION', 'version', v_akt.versiya);
  end if;

  v_allowed := (v_akt.lifecycle_status, p_to_status) in (
    ('draft','submitted'), ('draft','cancelled'),
    ('submitted','checked'), ('submitted','cancelled'),
    ('checked','approved'), ('checked','rejected'), ('checked','cancelled'),
    ('rejected','submitted'), ('rejected','cancelled'), ('rejected','draft'),
    ('cancelled','cancelled'), ('superseded','superseded'), ('approved','approved'),
    ('approved','cancelled')
  );
  if not v_allowed then
    return jsonb_build_object('ok', false, 'code', 'INVALID_LIFECYCLE_TRANSITION',
      'from_status', v_akt.lifecycle_status, 'to_status', p_to_status);
  end if;

  -- tasdiqlangan_bekor_v1: tasdiqlangan F2 ni bekor qilish — f2.cancel (yuqorida) + f2.approve.
  if v_akt.lifecycle_status = 'approved' and p_to_status = 'cancelled' then
    perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'f2.approve');
    -- f2_tuzatish_20261203001500 (C-M7): faol storno/pereraschet, Forma-3 yoki davr muhri bo'lsa bekor qilinmaydi.
    if public._t2_f2_akt_bogliq_v1(p_akt_id) is not null then
      return jsonb_build_object('ok', false, 'code', 'DEPENDENTS_EXIST',
        'xabar', 'Bu F2 ga bog''liq hujjatlar bor (storno/pereraschet, Forma-3 yoki davr muhri). Avval ularni bekor qiling.',
        'bogliq', public._t2_f2_akt_bogliq_v1(p_akt_id));
    end if;
  end if;
  -- f2_tuzatish_20261203001500 (egasi 2026-11-06): avto qoralamada narxsiz qoldirilgan qator bor ekan — yuborish/tasdiq yo'q.
  if p_to_status in ('submitted', 'approved') and v_akt.lifecycle_status <> p_to_status
     and public._t2_f2_narxsiz_avto_soni(p_akt_id) > 0 then
    return jsonb_build_object('ok', false, 'code', 'NARXSIZ_QATOR_BOR', 'soni', public._t2_f2_narxsiz_avto_soni(p_akt_id),
      'xabar', 'Avto qoralamada narxsiz qoldirilgan qatorlar bor — narxlang yoki ongli «narxsiz» deb belgilang.');
  end if;

  -- 20270109000000 (egasi 2026-11-18): F2 da ish (BL) bor-u, uning resurslari (RS/MAT) tushib qolgan bo'lsa —
  -- yuborish/tasdiq yo'q (pul jamiga kirmaydi). Avval resurslarni F2 ga qo'shing.
  if v_akt.tur = 'f2' and p_to_status in ('submitted', 'approved') and v_akt.lifecycle_status <> p_to_status
     and public._t2_f2_resurs_tushgan_soni_v1(p_akt_id) > 0 then
    return jsonb_build_object('ok', false, 'code', 'F2_RESURS_TUSHGAN', 'soni', public._t2_f2_resurs_tushgan_soni_v1(p_akt_id),
      'qatorlar', public._t2_f2_resurs_tushgan_v1(p_akt_id, 50),
      'xabar', 'F2 da ish qatori bor, lekin uning resurslari F2 ga tushmagan — summa to''liq emas. Resurslarni qo''shing.');
  end if;

  -- SoD (audit 2026-10-21, egasi ADR-2): KORPORATIV rejimda tayyorlovchi ≠ tekshiruvchi ≠ tasdiqlovchi — bazada majburiy
  -- (to'g'ridan API chaqiruvida ham). SHAXSIY rejim (yakka smetachi) — bir kishi yakunlaydi; bu «kompaniya tasdiqladi» emas,
  -- interfeys uni tarixdagi aktyorlar bo'yicha «Yakunlangan (shaxsiy)» deb ko'rsatadi.
  if p_to_status in ('checked','approved') and v_akt.lifecycle_status <> p_to_status
     and coalesce((select k.f2_tasdiq_rejimi from public.t2_kompaniya k where k.id = p_kompaniya_id), 'shaxsiy') = 'korporativ' then
    select h.actor_id into v_yuboruvchi from public.t2_akt_holat_tarix h
     where h.akt_id = p_akt_id and h.to_status = 'submitted' order by h.id desc limit 1;
    if p_to_status = 'checked' and v_yuboruvchi = p_actor_id then
      return jsonb_build_object('ok', false, 'code', 'SOD_TEKSHIRUVCHI_YUBORUVCHI');
    end if;
    if p_to_status = 'approved' then
      select h.actor_id into v_tekshiruvchi from public.t2_akt_holat_tarix h
       where h.akt_id = p_akt_id and h.to_status = 'checked' order by h.id desc limit 1;
      if p_actor_id = v_yuboruvchi or p_actor_id = v_tekshiruvchi then
        return jsonb_build_object('ok', false, 'code', 'SOD_TASDIQLOVCHI_TAKRORLANDI');
      end if;
    end if;
  end if;

  -- Same-state approved retry is an audit-safe idempotent acknowledgement;
  -- no UPDATE is issued, so approved immutability is preserved.
  if v_akt.lifecycle_status = p_to_status then
    insert into public.t2_akt_holat_tarix
      (kompaniya_id, akt_id, from_status, to_status, reason, actor_id, operation_id)
    values
      (p_kompaniya_id, p_akt_id, v_akt.lifecycle_status, p_to_status,
       v_reason, p_actor_id, p_operation_id)
    returning * into v_history;
    perform public.t2_audit_yoz(p_kompaniya_id, 'akt_lifecycle_retry', 'f2', v_akt.obyekt_id,
      format('akt_id=%s; from=%s; to=%s; actor_id=%s; operation_id=%s', p_akt_id, v_akt.lifecycle_status, p_to_status, p_actor_id, p_operation_id),
      'actor:' || p_actor_id, null);
    return jsonb_build_object('ok', true, 'retry', true, 'akt_id', p_akt_id,
      'from_status', v_akt.lifecycle_status, 'status', p_to_status,
      'version', v_akt.versiya, 'history_id', v_history.id);
  end if;

  perform set_config('t2.akt.lifecycle_transition', '1', true);
  perform set_config('t2.akt.actor_id', p_actor_id::text, true);
  perform set_config('t2.akt.operation_id', p_operation_id::text, true);
  perform set_config('t2.akt.reason', coalesce(v_reason, ''), true);

  update public.t2_akt
  set lifecycle_status = p_to_status,
      lifecycle_updated_at = now(),
      lifecycle_updated_by = p_actor_id,
      lifecycle_reason = v_reason,
      lifecycle_submitted_at = case when p_to_status = 'submitted' then coalesce(lifecycle_submitted_at, now()) else lifecycle_submitted_at end,
      lifecycle_checked_at = case when p_to_status = 'checked' then coalesce(lifecycle_checked_at, now()) else lifecycle_checked_at end,
      lifecycle_approved_at = case when p_to_status = 'approved' then coalesce(lifecycle_approved_at, now()) else lifecycle_approved_at end,
      lifecycle_rejected_at = case when p_to_status = 'rejected' then coalesce(lifecycle_rejected_at, now()) else lifecycle_rejected_at end,
      lifecycle_cancelled_at = case when p_to_status = 'cancelled' then coalesce(lifecycle_cancelled_at, now()) else lifecycle_cancelled_at end,
      lifecycle_superseded_at = case when p_to_status = 'superseded' then coalesce(lifecycle_superseded_at, now()) else lifecycle_superseded_at end,
      versiya = versiya + 1,
      yangilandi = now()
  where id = p_akt_id and kompaniya_id = p_kompaniya_id and versiya = p_expected_version
  returning versiya into v_new_version;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'STALE_VERSION');
  end if;

  select * into v_history
  from public.t2_akt_holat_tarix h
  where h.akt_id = p_akt_id and h.operation_id = p_operation_id
  order by h.id desc limit 1;
  perform public.t2_audit_yoz(p_kompaniya_id, 'akt_lifecycle_transition', 'f2', v_akt.obyekt_id,
    format('akt_id=%s; from=%s; to=%s; actor_id=%s; operation_id=%s', p_akt_id, v_akt.lifecycle_status, p_to_status, p_actor_id, p_operation_id),
    'actor:' || p_actor_id, null);
  return jsonb_build_object('ok', true, 'akt_id', p_akt_id,
    'from_status', v_akt.lifecycle_status, 'status', p_to_status,
    'version', v_new_version, 'history_id', v_history.id)
    || case when v_akt.lifecycle_status = 'approved' and p_to_status = 'cancelled' and public._t2_f2_akt_paket_v1(p_akt_id) is not null
            then jsonb_build_object('ogohlantirish', 'PAKET_TOPSHIRILGAN', 'paketlar', public._t2_f2_akt_paket_v1(p_akt_id))
            else '{}'::jsonb end;
end $function$;


comment on function public.t2_f2_qoralama_yangila_v1(bigint, bigint, bigint, integer, jsonb, uuid, text) is
  'F2 qoralama qatorlarini almashtiradi; smeta qatori faqat obyektga tegishliligini tekshirish uchun o''qiladi. versiya: texnik';
