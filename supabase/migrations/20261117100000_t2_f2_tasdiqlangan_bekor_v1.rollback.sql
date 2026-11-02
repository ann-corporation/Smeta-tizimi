-- 20261117100000 rollback — tasdiqlangan F2 yana to'liq muzlatiladi. Allaqachon bekor qilingan aktlar bekor qoladi
-- (tarix t2_akt_holat_tarix da); ularni qayta tasdiqlash — yangi import/correction orqali.
begin;

create or replace function public.t2_akt_lifecycle_projection_guard_v1()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $function$
declare
  v_internal text := current_setting('t2.akt.lifecycle_transition', true);
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

  if old.lifecycle_status = 'approved'
     and (to_jsonb(new) - 'yangilandi') is distinct from (to_jsonb(old) - 'yangilandi') then
    raise exception 'approved akt immutable; correction uchun yangi revision yarating'
      using errcode = '55000';
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

do $p$
declare d text; b1 text; b2 text;
begin
  select pg_get_functiondef('public.t2_akt_lifecycle_transition_v1(bigint,bigint,text,bigint,integer,uuid,text)'::regprocedure) into d;
  b1 := $x$,
    ('approved','cancelled')$x$;
  b2 := $x$  -- tasdiqlangan_bekor_v1: tasdiqlangan F2 ni bekor qilish — f2.cancel (yuqorida) + f2.approve.
  if v_akt.lifecycle_status = 'approved' and p_to_status = 'cancelled' then
    perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'f2.approve');
  end if;

$x$;
  if position(b1 in d) = 0 or position(b2 in d) = 0 then raise exception 'NOT_PATCHED: t2_akt_lifecycle_transition_v1'; end if;
  execute replace(replace(d, b1, ''), b2, '');
end $p$;

commit;
