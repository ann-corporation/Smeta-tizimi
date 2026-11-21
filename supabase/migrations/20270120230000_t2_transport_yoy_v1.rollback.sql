-- ROLLBACK 20270120230000_t2_transport_yoy_v1: yoyish va tasdiq himoyasi olib tashlanadi, audit avvalgi (to'g'ridan hisoblovchi) holatga.
drop function if exists public.t2_qator_transport_yoy_v1(bigint, bigint, bigint, numeric, jsonb, boolean, boolean);
drop trigger if exists t2_akt_transport_guard_trg on public.t2_akt;
drop function if exists public._t2_akt_transport_guard_v1();
create or replace function public.t2_qator_transport_audit_v1(p_actor_id bigint, p_obyekt_id bigint)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_komp bigint;
  v_xul jsonb; v_mat jsonb; v_xato jsonb;
begin
  select o.kompaniya_id into v_komp from public.t2_obyekt o where o.id = p_obyekt_id;
  if v_komp is null then
    return jsonb_build_object('ok', false, 'code', 'OBYEKT_YOQ', 'error', 'Obyekt topilmadi');
  end if;
  perform public.t2_actor_kompaniya_azo_tekshir(v_komp, p_actor_id);

  with m as (
    select q.id, q.kod, q.nom, q.kat, coalesce(q.transport_usul, 'foiz') as usul
      from public.t2_qator q
     where q.obyekt_id = p_obyekt_id and q.versiya_holat = 'faol'
       and q.tur in ('rs', 'mat', 'ob') and q.kat in ('МАТ', 'М/К', 'КАБ', 'БЕЗСКЛАД', 'ОБ')
       and q.transport_manba_qator_id is null
  ),
  tr as (
    select q.id, q.transport_manba_qator_id as m_id, q.kat, q.nom, q.summa, q.transport_zichlik, q.transport_km
      from public.t2_qator q
     where q.obyekt_id = p_obyekt_id and q.versiya_holat = 'faol' and q.transport_manba_qator_id is not null
  ),
  mt as (
    select m.*, coalesce((select jsonb_agg(t.id order by t.id) from tr t where t.m_id = m.id), '[]'::jsonb) as tr_idlar,
           (select count(*) from tr t where t.m_id = m.id) as tr_soni
      from m
  ),
  f as (
    select 'TKM_TRANSPORT_YOQ'::text as kod, mt.id as qator_id, 'tkm materialning t·km transport qatori yo''q'::text as xabar
      from mt where mt.usul = 'tkm' and mt.tr_soni = 0
    union all
    select 'TRANSPORT_MATERIAL_YOQ', t.id, 't·km qatori faol material qatoriga bog''lanmagan (material topilmadi yoki material emas)'
      from tr t where not exists (select 1 from m where m.id = t.m_id)
    union all
    select 'TKM_VA_FOIZ', t.id, 'material ' || m.id || ' t·km bilan tashilgan, lekin usuli ' || m.usul || ' - ikki marta transport xavfi'
      from tr t join m on m.id = t.m_id where m.usul <> 'tkm'
    union all
    select 'IKKITA_TRANSPORT', mt.id, 'bitta materialga ' || mt.tr_soni || ' ta faol t·km qatori'
      from mt where mt.tr_soni > 1
    union all
    select 'TRANSPORT_KAT', t.id, 't·km qatori kategoriyasi МАШ emas'
      from tr t where t.kat is distinct from 'МАШ'
  )
  select
    jsonb_build_object('material_soni', (select count(*) from m),
                       'foiz', (select count(*) from m where usul = 'foiz'),
                       'tkm', (select count(*) from m where usul = 'tkm'),
                       'narx_ichida', (select count(*) from m where usul = 'narx_ichida'),
                       'tkm_qator_soni', (select count(*) from tr),
                       'xato_soni', (select count(*) from f)),
    coalesce((select jsonb_agg(jsonb_build_object('qator_id', mt.id, 'kod', mt.kod, 'nom', mt.nom, 'kat', mt.kat, 'usul', mt.usul,
                'foiz_bazada', mt.usul = 'foiz', 'tkm_qatorlar', mt.tr_idlar) order by mt.id)
                from mt where mt.usul <> 'foiz' or mt.tr_soni > 0), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object('kod', f.kod, 'qator_id', f.qator_id, 'xabar', f.xabar) order by f.kod, f.qator_id) from f), '[]'::jsonb)
    into v_xul, v_mat, v_xato;

  return jsonb_build_object('ok', true, 'obyekt_id', p_obyekt_id, 'xulosa', v_xul, 'materiallar', v_mat, 'xatolar', v_xato);
end $fn$;
drop function if exists public._t2_qator_transport_xato_v1(bigint);
