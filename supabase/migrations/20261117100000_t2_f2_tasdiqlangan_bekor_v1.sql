-- 20261117100000 — TASDIQLANGAN F2 NI BEKOR QILISH (egasi 2026-10-31: 2-lot F2 bekor qilinib, yangi smetaga qayta import).
--
-- MUAMMO (prod tekshiruvi): t2_akt_lifecycle_transition_v1 da ('approved','cancelled') o'tishi yo'q va
-- t2_akt_lifecycle_projection_guard_v1 tasdiqlangan akt sarlavhasining HAR qanday o'zgarishini bloklaydi
-- («approved akt immutable»). Eski t2_akt_bekor ham shu guardga uriladi.
--
-- YECHIM (minimal):
--   * transition: ('approved','cancelled') ruxsat; sabab majburiy (mavjud REASON_REQUIRED); ruxsat — f2.cancel (mavjud)
--     VA f2.approve (faqat F2 tasdiqlay oladiganlar; admin/boss rollarida ikkalasi bor).
--   * guard: tasdiqlangan akt faqat transition ichidan (t2.akt.lifecycle_transition = '1') va faqat 'cancelled' ga,
--     faqat holat/lifecycle_*/versiya/yangilandi maydonlari o'zgarganda o'tadi. Qolgan hamma narsa — avvalgidek muzlatilgan.
--   * HECH NARSA O'CHIRILMAYDI: t2_akt_qator / certified qiymatlar o'zgarmaydi; tarix t2_akt_holat_tarix (capture trigger,
--     sabab + actor + operation_id) va t2_audit_yoz ('akt_lifecycle_transition', from=approved; to=cancelled) da.
--   * Bekor qilingan akt hamma jamilardan chiqadi (o'qish modellari holat='tasdiqlangan' bo'yicha).
begin;

-- 1. Guard: tasdiqlangan → bekor faqat transition ichidan
create or replace function public.t2_akt_lifecycle_projection_guard_v1()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $function$
declare
  v_internal text := current_setting('t2.akt.lifecycle_transition', true);
  v_ruxsat_ustun constant text[] := array['holat','versiya','yangilandi','lifecycle_status','lifecycle_updated_at',
    'lifecycle_updated_by','lifecycle_reason','lifecycle_cancelled_at'];
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
  return new;
end $function$;

-- 2. Transition: ('approved','cancelled') + f2.approve (anchor — aynan bir marta)
do $p$
declare d text; a1 text; a2 text;
begin
  select pg_get_functiondef('public.t2_akt_lifecycle_transition_v1(bigint,bigint,text,bigint,integer,uuid,text)'::regprocedure) into d;
  if position('tasdiqlangan_bekor_v1' in d) > 0 then raise exception 'ALREADY_PATCHED: t2_akt_lifecycle_transition_v1'; end if;
  a1 := $x$('cancelled','cancelled'), ('superseded','superseded'), ('approved','approved')$x$;
  a2 := $x$  -- SoD (audit 2026-10-21, egasi ADR-2)$x$;
  if (length(d) - length(replace(d, a1, ''))) <> length(a1) then raise exception 'ANCHOR_NOT_FOUND_ONCE: allowed'; end if;
  if (length(d) - length(replace(d, a2, ''))) <> length(a2) then raise exception 'ANCHOR_NOT_FOUND_ONCE: SoD'; end if;
  d := replace(d, a1, a1 || $x$,
    ('approved','cancelled')$x$);
  d := replace(d, a2, $x$  -- tasdiqlangan_bekor_v1: tasdiqlangan F2 ni bekor qilish — f2.cancel (yuqorida) + f2.approve.
  if v_akt.lifecycle_status = 'approved' and p_to_status = 'cancelled' then
    perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'f2.approve');
  end if;

$x$ || a2);
  execute d;
end $p$;

commit;
