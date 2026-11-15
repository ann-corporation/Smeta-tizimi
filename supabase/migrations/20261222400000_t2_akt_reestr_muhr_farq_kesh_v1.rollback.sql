-- Rollback: 20261222400000_t2_akt_reestr_muhr_farq_kesh_v1. Yangi triggerlar/funksiyalarni o'chiradi, kesh kalitlarini tozalaydi,
-- _t2_obyekt_natija_kesh_hisobla_v1 va t2_obyekt_kesh_yangila_v1 ni oldingi (20261222300000) ta'rifiga qaytaradi. View'lar o'zgarmagan edi.
begin;

drop trigger if exists t2_kesh_t2_qator_muhr_ins on public.t2_qator_muhr;
drop trigger if exists t2_kesh_t2_qator_muhr_del on public.t2_qator_muhr;
drop trigger if exists t2_kesh_t2_qator_muhr_upd on public.t2_qator_muhr;
drop trigger if exists t2_kesh_t2_ozgarish_ins on public.t2_ozgarish;
drop trigger if exists t2_kesh_t2_ozgarish_del on public.t2_ozgarish;
drop trigger if exists t2_kesh_t2_ozgarish_upd on public.t2_ozgarish;
drop trigger if exists t2_kesh_t2_obyekt_nom on public.t2_obyekt;
drop function if exists public._t2_kesh_t2_qator_muhr_ins(), public._t2_kesh_t2_qator_muhr_del(), public._t2_kesh_t2_qator_muhr_upd(),
  public._t2_kesh_t2_ozgarish_ins(), public._t2_kesh_t2_ozgarish_del(), public._t2_kesh_t2_ozgarish_upd(), public._t2_kesh_t2_obyekt_nom();

drop function if exists public.t2_akt_reestr_obyekt_v1(bigint, bigint, text);
drop function if exists public.t2_akt_reestr_kompaniya_v1(bigint, bigint, text);
drop function if exists public.t2_qator_muhr_farq_obyekt_v1(bigint, bigint);

create or replace function public._t2_obyekt_natija_kesh_hisobla_v1(p_obyekt_id bigint)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_sm jsonb; v_sj jsonb; v_r jsonb;
begin
  if not exists (select 1 from public.t2_obyekt o where o.id = p_obyekt_id) then
    delete from public.t2_obyekt_natija_kesh where obyekt_id = p_obyekt_id;
    return;
  end if;
  select k.smeta, k.smeta_joriy into v_sm, v_sj from public.t2_obyekt_kesh k where k.obyekt_id = p_obyekt_id;
  begin
    v_r := public._t2_smeta_ozgarish_qatlam_hisob_v1(p_obyekt_id, v_sm, v_sj);
  exception when others then v_r := jsonb_build_object('_xato', true);
  end;
  insert into public.t2_obyekt_natija_kesh as n (obyekt_id, kalit, natija, hisoblandi) values (p_obyekt_id, 'smeta_ozgarish_qatlam', coalesce(v_r, jsonb_build_object('_xato', true)), now())
  on conflict (obyekt_id, kalit) do update set natija = excluded.natija, hisoblandi = excluded.hisoblandi;
  begin
    v_r := public._t2_price_control_hisob_v1(p_obyekt_id);
  exception when others then v_r := jsonb_build_object('_xato', true);
  end;
  insert into public.t2_obyekt_natija_kesh as n (obyekt_id, kalit, natija, hisoblandi) values (p_obyekt_id, 'price_control', coalesce(v_r, jsonb_build_object('_xato', true)), now())
  on conflict (obyekt_id, kalit) do update set natija = excluded.natija, hisoblandi = excluded.hisoblandi;
end $function$;

CREATE OR REPLACE FUNCTION public.t2_obyekt_kesh_yangila_v1(p_byudjet_s integer DEFAULT 40, p_rejim text DEFAULT 'iflos'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  r record; v_t0 timestamptz := clock_timestamp(); v_soni int := 0; v_qoldi int := 0;
  v_kalit text := to_char((now() at time zone 'Asia/Tashkent')::date, 'YYYY-MM');
begin
  if not pg_try_advisory_xact_lock(hashtext('t2_obyekt_kesh_yangila_v1')) then
    return jsonb_build_object('ok', true, 'o_tkazildi', 'band');
  end if;
  for r in
    select o.id as obyekt_id, i.versiya
      from public.t2_obyekt o
      left join public.t2_obyekt_kesh_iflos i on i.obyekt_id = o.id
      left join public.t2_obyekt_kesh k on k.obyekt_id = o.id
     where p_rejim = 'hammasi' or i.obyekt_id is not null or k.obyekt_id is null or (k.smeta is not null and k.smeta_joriy is null) or not exists (select 1 from public.t2_obyekt_natija_kesh nk where nk.obyekt_id = o.id and nk.kalit = 'smeta_ozgarish_qatlam') or jsonb_typeof(k.f2_oy->v_kalit) is distinct from 'object'
     order by i.vaqt nulls last, o.id
  loop
    if extract(epoch from clock_timestamp() - v_t0) >= p_byudjet_s then v_qoldi := v_qoldi + 1; continue; end if;
    perform public._t2_kesh_hisobla_v1(r.obyekt_id);
    if r.versiya is not null then
      delete from public.t2_obyekt_kesh_iflos where obyekt_id = r.obyekt_id and versiya = r.versiya;
    end if;
    v_soni := v_soni + 1;
  end loop;
  return jsonb_build_object('ok', true, 'hisoblandi', v_soni, 'qoldi', v_qoldi);
end $function$;

delete from public.t2_obyekt_natija_kesh where kalit in ('akt_reestr', 'muhr_farq');
drop function if exists public._t2_kesh_natija_oqi_v1(bigint, text);
drop function if exists public._t2_akt_reestr_hisob_v1(bigint);
drop function if exists public._t2_qator_muhr_farq_hisob_v1(bigint);

commit;
