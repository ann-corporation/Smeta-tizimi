-- F2 tasdiqlash: maker ≠ checker ≠ approver (audit 2026-10-21 ARC-02/CODE-04; egasi qarori ADR-2 — ikki rejim).
-- t2_kompaniya.f2_tasdiq_rejimi: 'shaxsiy' (sukut — Tools beta, yakka smetachi) yoki 'korporativ' (SoD bazada majburiy).
-- Rejim faqat 'checked'/'approved' o'tishlarida tekshiriladi; idempotent qayta urinish (o'sha holat) o'zgarmaydi.
-- Qolgan funksiya aynan o'sha (rollback faylidagi asl ta'rif md5 3c29a72b… bilan tasdiqlangan).
alter table public.t2_kompaniya add column if not exists f2_tasdiq_rejimi text not null default 'shaxsiy'
  check (f2_tasdiq_rejimi in ('shaxsiy', 'korporativ'));
comment on column public.t2_kompaniya.f2_tasdiq_rejimi is 'F2 tasdiqlash: shaxsiy — bir kishi yakunlaydi; korporativ — tayyorlovchi≠tekshiruvchi≠tasdiqlovchi (t2_akt_lifecycle_transition_v1).';
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
    ('rejected','submitted'), ('rejected','cancelled'),
    ('cancelled','cancelled'), ('superseded','superseded'), ('approved','approved')
  );
  if not v_allowed then
    return jsonb_build_object('ok', false, 'code', 'INVALID_LIFECYCLE_TRANSITION',
      'from_status', v_akt.lifecycle_status, 'to_status', p_to_status);
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
    'version', v_new_version, 'history_id', v_history.id);
end $function$;

