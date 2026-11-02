-- Rollback: t2_tizim_xaritasi_v1 asl tanasiga (20261114000000) qaytadi.
begin;
create or replace function public.t2_tizim_xaritasi_v1(p_actor_id bigint, p_kompaniya_id bigint default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_super boolean := false;
  v_komp bigint[];
  v_jami integer := 0;
  v_24 timestamptz := now() - interval '24 hours';
  v_7k timestamptz := now() - interval '7 days';
  v_eski timestamptz := now() - interval '1 hour';
  v_root text;
  v_tugunlar jsonb := '[]'::jsonb;
  v_bogichlar jsonb := '[]'::jsonb;
  v_hodisalar jsonb := '[]'::jsonb;
  v_platforma jsonb := '[]'::jsonb;
  v_yoq text[] := array[]::text[];
  v_x jsonb;
  c_max_komp constant integer := 50;
begin
  if p_actor_id is null or p_actor_id <= 0 or (p_kompaniya_id is not null and p_kompaniya_id <= 0) then
    return jsonb_build_object('ok', false, 'code', 'REQUEST_INVALID');
  end if;

  -- 1) Ruxsat: superadmin YOKI superadmin bergan grant. Kompaniya roli (boss ham) yetarli EMAS.
  v_super := coalesce(public.t2_platforma_superadmin(p_actor_id), false);
  if not public._t2_tizim_xaritasi_ruxsatmi(p_actor_id) then
    return jsonb_build_object('ok', false, 'code', 'AUTHORIZATION_DENIED');
  end if;

  -- 2) Doira.
  if p_kompaniya_id is not null then
    perform 1 from public.t2_kompaniya k where k.id = p_kompaniya_id;
    if not found then return jsonb_build_object('ok', false, 'code', 'KOMPANIYA_NOT_FOUND'); end if;
    v_komp := array[p_kompaniya_id];
    v_jami := 1;
    v_root := 'kompaniya:' || p_kompaniya_id;
  else
    select count(*) into v_jami from public.t2_kompaniya k where k.faol is not false;
    select coalesce(array_agg(s.id order by s.ord), array[]::bigint[]) into v_komp
      from (
        select k.id, row_number() over (order by la.m desc nulls last, k.id) as ord
          from public.t2_kompaniya k
          left join lateral (
            select max(a.yaratilgan_vaqt) as m from public.t2_audit_log a where a.kompaniya_id = k.id
          ) la on true
         where k.faol is not false
         order by la.m desc nulls last, k.id
         limit c_max_komp
      ) s;
    v_root := 'tizim:0';
  end if;

  -- 3) Kompaniya + modul tugunlari (bitta so'rov; CTE lar bir marta hisoblanadi).
  with
  modullar(mk, tartib, nom) as (
    values ('smeta', 1, 'Smeta'), ('fakt', 2, 'Fakt'), ('f2', 3, 'F2'), ('nakopitelniy', 4, 'Nakopitelniy'),
           ('sverka', 5, 'Sverka'), ('ombor', 6, 'Ombor / sklad'), ('agentlar', 7, 'Agentlar')
  ),
  aud as materialized (
    select a.id, a.kompaniya_id as kid, a.obyekt_id, a.kim, a.amal_turi, a.tafsilot, a.yaratilgan_vaqt as vaqt,
           case
             when lower(coalesce(a.modul, '')) like 'nakop%' or a.amal_turi ilike '%nakop%' then 'nakopitelniy'
             when lower(coalesce(a.modul, '')) like 'sverka%' or a.amal_turi ilike '%sverka%' then 'sverka'
             when lower(coalesce(a.modul, '')) in ('f2', 'akt') or a.amal_turi ilike 'f2%' or a.amal_turi ilike 'akt%' then 'f2'
             when lower(coalesce(a.modul, '')) in ('sklad', 'ombor', 'm29', 'logistika', 'taminot')
                  or a.amal_turi ilike '%sklad%' or a.amal_turi ilike 'm29%' then 'ombor'
             when lower(coalesce(a.modul, '')) in ('mcp', 'agent', 'ai') or a.amal_turi ilike 'agent%' or a.amal_turi ilike 'mcp%' then 'agentlar'
             when lower(coalesce(a.modul, '')) = 'fakt' or a.amal_turi ilike '%fakt%' then 'fakt'
             when lower(coalesce(a.modul, '')) in ('smeta', 'narx', 'nakrutka') then 'smeta'
             else null
           end as mk
      from public.t2_audit_log a
     where a.yaratilgan_vaqt >= v_7k and a.kompaniya_id = any(v_komp)
  ),
  sig as materialized (
    select s.id, s.kompaniya_id as kid, s.severity, s.state, s.detected_at, s.title, s.entity_type, s.entity_id,
           case
             when s.signal_type in ('missing_price', 'data_quality') or s.signal_type ilike '%smeta%' or s.signal_type ilike '%price%' then 'smeta'
             when s.signal_type ilike '%nakop%' then 'nakopitelniy'
             when s.signal_type ilike '%sverka%' then 'sverka'
             when s.signal_type ilike '%f2%' or s.signal_type ilike '%overbill%' or s.signal_type ilike '%akt%' then 'f2'
             when s.signal_type ilike '%fakt%' then 'fakt'
             when s.signal_type ilike '%sklad%' or s.signal_type ilike '%ombor%' or s.signal_type ilike '%m29%' then 'ombor'
             when s.signal_type ilike '%agent%' then 'agentlar'
             else null
           end as mk
      from public.t2_signal s
     where s.kompaniya_id = any(v_komp) and (s.state = 'open' or s.detected_at >= v_24)
  ),
  f2j as (
    select j.kompaniya_id as kid,
           count(*) filter (where j.status in ('queued', 'running', 'paused')) as navbat,
           count(*) filter (where j.status in ('queued', 'running') and coalesce(j.updated_at, j.started_at) < v_eski) as qotgan,
           min(coalesce(j.updated_at, j.started_at)) filter (where j.status in ('queued', 'running', 'paused')) as eng_eski
      from public.t2_f2_import_job j
     where j.kompaniya_id = any(v_komp) and j.status in ('queued', 'running', 'paused')
     group by j.kompaniya_id
  ),
  agr as (
    select r.kompaniya_id as kid,
           count(*) as navbat,
           count(*) filter (where coalesce(r.updated_at, r.created_at) < v_eski) as qotgan,
           min(coalesce(r.updated_at, r.created_at)) as eng_eski
      from public.t2_agent_run r
     where r.kompaniya_id = any(v_komp)
       and r.holat in ('queued', 'running', 'waiting_review', 'approval_required', 'applying', 'exporting')
     group by r.kompaniya_id
  ),
  sarf as (
    select s.kompaniya_id as kid, count(*) filter (where s.vaqt >= v_24) as soni_24s, count(*) as soni_7k
      from public.t2_agent_sarf s
     where s.kompaniya_id = any(v_komp) and s.vaqt >= v_7k
     group by s.kompaniya_id
  ),
  sarf_last as (
    select distinct on (s.kompaniya_id) s.kompaniya_id as kid, s.vaqt, s.actor_id, s.amal
      from public.t2_agent_sarf s
     where s.kompaniya_id = any(v_komp) and s.vaqt >= v_7k
     order by s.kompaniya_id, s.vaqt desc, s.id desc
  ),
  repl as (
    select r.kompaniya_id as kid,
           count(*) filter (where r.holat = 'pending') as navbat,
           count(*) filter (where r.holat = 'failed' and r.updated_at >= v_24) as xato_24s
      from public.t2_replica_sync_job r
     where r.kompaniya_id = any(v_komp) and r.holat in ('pending', 'failed')
     group by r.kompaniya_id
  ),
  -- Xatolar (24 soat): yagona ro'yxat — sonlar ham, oxirgi 3 matn ham shundan.
  xato as materialized (
    select sig.kid, sig.mk, sig.detected_at as vaqt, sig.title as matn, 'signal'::text as manba, sig.severity as daraja
      from sig where sig.detected_at >= v_24 and sig.severity in ('error', 'critical')
    union all
    select j.kompaniya_id, 'f2', coalesce(j.updated_at, j.completed_at, j.started_at),
           'F2 import: ' || coalesce(left(j.last_error, 200), 'failed'), 'f2_import', 'error'
      from public.t2_f2_import_job j
     where j.kompaniya_id = any(v_komp) and j.status = 'failed' and coalesce(j.updated_at, j.completed_at, j.started_at) >= v_24
    union all
    select r.kompaniya_id, 'agentlar', coalesce(r.finished_at, r.updated_at),
           'Agent ' || coalesce(r.agent_kod, '') || ': ' || coalesce(r.error_code, 'failed') || coalesce(' — ' || left(r.error_detail, 160), ''),
           'agent_run', 'error'
      from public.t2_agent_run r
     where r.kompaniya_id = any(v_komp) and r.holat = 'failed' and coalesce(r.finished_at, r.updated_at) >= v_24
    union all
    select s.kompaniya_id, 'agentlar', s.vaqt, 'Agent: ' || coalesce(s.amal, '') || ' — muvaffaqiyatsiz', 'agent_sarf', 'error'
      from public.t2_agent_sarf s
     where s.kompaniya_id = any(v_komp) and s.vaqt >= v_24 and s.muvaffaqiyat is false
    union all
    select r.kompaniya_id, null, r.updated_at, 'Hujjat sinxroni: ' || coalesce(left(r.last_error, 160), 'failed'), 'sinxron', 'error'
      from public.t2_replica_sync_job r
     where r.kompaniya_id = any(v_komp) and r.holat = 'failed' and r.updated_at >= v_24
  ),
  a_st as (
    select aud.kid, aud.mk, count(*) filter (where aud.vaqt >= v_24) as soni_24s, count(*) as soni_7k
      from aud where aud.mk is not null group by aud.kid, aud.mk
  ),
  a_last as (
    select distinct on (aud.kid, aud.mk) aud.kid, aud.mk, aud.vaqt, aud.kim, aud.amal_turi, aud.tafsilot, aud.obyekt_id
      from aud where aud.mk is not null
     order by aud.kid, aud.mk, aud.vaqt desc, aud.id desc
  ),
  s_st as (
    select sig.kid, sig.mk,
           count(*) filter (where sig.state = 'open') as ochiq,
           count(*) filter (where sig.state = 'open' and sig.severity in ('error', 'critical')) as kritik
      from sig group by sig.kid, sig.mk
  ),
  x_st as (select xato.kid, xato.mk, count(*) as soni from xato group by xato.kid, xato.mk),
  x_top as (
    select q.kid, q.mk, jsonb_agg(jsonb_build_object('vaqt', q.vaqt, 'matn', q.matn, 'manba', q.manba, 'daraja', q.daraja) order by q.vaqt desc) as js
      from (select xato.*, row_number() over (partition by xato.kid, xato.mk order by xato.vaqt desc) as rn from xato) q
     where q.rn <= 3
     group by q.kid, q.mk
  ),
  modul as (
    select k.kid, m.mk, m.tartib, m.nom,
           coalesce(a_st.soni_24s, 0) + case when m.mk = 'agentlar' then coalesce(sarf.soni_24s, 0) else 0 end as soni_24s,
           coalesce(a_st.soni_7k, 0) + case when m.mk = 'agentlar' then coalesce(sarf.soni_7k, 0) else 0 end as soni_7k,
           coalesce(x_st.soni, 0) as xato_24s,
           coalesce(s_st.ochiq, 0) as ochiq,
           coalesce(s_st.kritik, 0) as kritik,
           case m.mk when 'f2' then coalesce(f2j.navbat, 0) when 'agentlar' then coalesce(agr.navbat, 0) end as navbat,
           case m.mk when 'f2' then coalesce(f2j.qotgan, 0) when 'agentlar' then coalesce(agr.qotgan, 0) else 0 end as qotgan,
           case m.mk when 'f2' then f2j.eng_eski when 'agentlar' then agr.eng_eski end as navbat_eng_eski,
           case
             when a_last.vaqt is not null and (m.mk <> 'agentlar' or sarf_last.vaqt is null or a_last.vaqt >= sarf_last.vaqt) then
               jsonb_build_object('vaqt', a_last.vaqt, 'kim', a_last.kim, 'amal', a_last.amal_turi,
                                  'matn', left(a_last.tafsilot, 160), 'obyekt_id', a_last.obyekt_id)
             when m.mk = 'agentlar' and sarf_last.vaqt is not null then
               jsonb_build_object('vaqt', sarf_last.vaqt, 'kim', 'actor:' || sarf_last.actor_id, 'amal', sarf_last.amal, 'matn', null, 'obyekt_id', null)
           end as oxirgi,
           coalesce(x_top.js, '[]'::jsonb) as xatolar
      from unnest(v_komp) as k(kid)
      cross join modullar m
      left join a_st on a_st.kid = k.kid and a_st.mk = m.mk
      left join a_last on a_last.kid = k.kid and a_last.mk = m.mk
      left join s_st on s_st.kid = k.kid and s_st.mk = m.mk
      left join x_st on x_st.kid = k.kid and x_st.mk = m.mk
      left join x_top on x_top.kid = k.kid and x_top.mk = m.mk
      left join f2j on f2j.kid = k.kid
      left join agr on agr.kid = k.kid
      left join sarf on sarf.kid = k.kid
      left join sarf_last on sarf_last.kid = k.kid
  ),
  modul_js as (
    select md.*,
           case when md.xato_24s > 0 then 'xato' when md.kritik > 0 or md.qotgan > 0 then 'diqqat' else 'ok' end as holat
      from modul md
  ),
  obyekt_soni as (
    select o.kompaniya_id as kid, count(*) as soni
      from public.t2_obyekt o
     where o.kompaniya_id = any(v_komp) and o.holat is distinct from 'bekor'
     group by o.kompaniya_id
  ),
  komp_sig as (
    select sig.kid,
           count(*) filter (where sig.state = 'open') as ochiq,
           count(*) filter (where sig.state = 'open' and sig.severity in ('error', 'critical')) as kritik
      from sig group by sig.kid
  ),
  komp_xato as (select xato.kid, count(*) as soni from xato group by xato.kid),
  faol_ob as (
    select q.kid, jsonb_agg(jsonb_build_object('id', q.obyekt_id, 'nom', q.nom, 'soni_7k', q.soni, 'oxirgi', q.oxirgi, 'ochiq_signal', q.ochiq)
                            order by q.soni desc, q.oxirgi desc) as js
      from (
        select a.kid, a.obyekt_id, o.nom, count(*) as soni, max(a.vaqt) as oxirgi,
               (select count(*) from sig where sig.kid = a.kid and sig.state = 'open' and sig.entity_type = 'obyekt'
                   and sig.entity_id = a.obyekt_id::text) as ochiq,
               row_number() over (partition by a.kid order by count(*) desc, max(a.vaqt) desc) as rn
          from aud a
          join public.t2_obyekt o on o.id = a.obyekt_id
         where a.obyekt_id is not null
         group by a.kid, a.obyekt_id, o.nom
      ) q
     where q.rn <= 5
     group by q.kid
  ),
  komp as (
    select k.id as kid, k.nom,
           coalesce(os.soni, 0) as obyekt_soni,
           coalesce(ks.ochiq, 0) as ochiq, coalesce(ks.kritik, 0) as kritik,
           coalesce(kx.soni, 0) as xato_24s,
           coalesce((select max(x.vaqt) from aud x where x.kid = k.id),
                    (select max(a.yaratilgan_vaqt) from public.t2_audit_log a where a.kompaniya_id = k.id)) as oxirgi_faollik,
           coalesce(f2j.navbat, 0) + coalesce(agr.navbat, 0) + coalesce(rp.navbat, 0) as navbat,
           coalesce(rp.navbat, 0) as sinxron_navbat,
           coalesce(fo.js, '[]'::jsonb) as faol_obyektlar,
           (select case when bool_or(mj.holat = 'xato') then 'xato' when bool_or(mj.holat = 'diqqat') then 'diqqat' else 'ok' end
              from modul_js mj where mj.kid = k.id) as modul_holat,
           array_position(v_komp, k.id) as ord
      from public.t2_kompaniya k
      left join obyekt_soni os on os.kid = k.id
      left join komp_sig ks on ks.kid = k.id
      left join komp_xato kx on kx.kid = k.id
      left join f2j on f2j.kid = k.id
      left join agr on agr.kid = k.id
      left join repl rp on rp.kid = k.id
      left join faol_ob fo on fo.kid = k.id
     where k.id = any(v_komp)
  )
  select
    coalesce((
      select jsonb_agg(n order by o1, o2)
        from (
          select 1 as o1, c.ord as o2, jsonb_build_object(
                   'id', 'kompaniya:' || c.kid, 'tur', 'kompaniya', 'nom', c.nom,
                   'meta', jsonb_build_object(
                     'kompaniya_id', c.kid, 'obyekt_soni', c.obyekt_soni,
                     'ochiq_signal', c.ochiq, 'kritik_signal', c.kritik, 'xato_24s', c.xato_24s,
                     'oxirgi_faollik', c.oxirgi_faollik, 'navbat', c.navbat, 'sinxron_navbat', c.sinxron_navbat,
                     'faol_obyektlar', c.faol_obyektlar,
                     'holat', case when c.xato_24s > 0 or c.modul_holat = 'xato' then 'xato'
                                   when c.kritik > 0 or c.modul_holat = 'diqqat' then 'diqqat' else 'ok' end)) as n
            from komp c
          union all
          select 2, array_position(v_komp, mj.kid) * 10 + mj.tartib, jsonb_build_object(
                   'id', 'modul:' || mj.kid || ':' || mj.mk, 'tur', 'modul', 'nom', mj.nom,
                   'meta', jsonb_build_object(
                     'kompaniya_id', mj.kid, 'modul', mj.mk, 'holat', mj.holat,
                     'soni_24s', mj.soni_24s, 'soni_7k', mj.soni_7k, 'xato_24s', mj.xato_24s,
                     'ochiq_signal', mj.ochiq, 'kritik_signal', mj.kritik,
                     'navbat', mj.navbat, 'navbat_qotgan', mj.qotgan, 'navbat_eng_eski', mj.navbat_eng_eski,
                     'oxirgi_amal', mj.oxirgi, 'xatolar', mj.xatolar)) as n
            from modul_js mj
        ) t(o1, o2, n)
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(e order by (e->>'vaqt')::timestamptz desc)
        from (
          select jsonb_build_object('vaqt', h.vaqt, 'kompaniya_id', h.kid, 'modul', h.mk, 'matn', h.matn,
                                    'daraja', h.daraja, 'manba', h.manba, 'obyekt_id', h.obyekt_id, 'kim', h.kim) as e
            from (
              (select aud.vaqt, aud.kid, aud.mk,
                      aud.amal_turi || coalesce(' — ' || left(aud.tafsilot, 140), '') as matn,
                      'info'::text as daraja, 'audit'::text as manba, aud.obyekt_id, aud.kim
                 from aud order by aud.vaqt desc, aud.id desc limit 20)
              union all
              (select sig.detected_at, sig.kid, sig.mk, sig.title, sig.severity, 'signal',
                      case when sig.entity_type = 'obyekt' and sig.entity_id ~ '^[0-9]{1,18}$' then sig.entity_id::bigint end, null
                 from sig where sig.detected_at >= v_7k order by sig.detected_at desc, sig.id desc limit 20)
              union all
              (select xato.vaqt, xato.kid, xato.mk, xato.matn, xato.daraja, xato.manba, null::bigint, null
                 from xato where xato.manba <> 'signal' order by xato.vaqt desc limit 20)
            ) h
           order by h.vaqt desc
           limit 20
        ) z
    ), '[]'::jsonb)
  into v_tugunlar, v_hodisalar;

  -- Kim → ism (faqat ko'rsatiladigan qatorlar uchun: modul oxirgi amali va hodisalar).
  select coalesce(jsonb_agg(
           case when n->>'tur' = 'modul' and jsonb_typeof(n #> '{meta,oxirgi_amal}') = 'object' then
             jsonb_set(n, '{meta,oxirgi_amal,kim_nom}', to_jsonb(public._t2_tizim_kim_nom(n #>> '{meta,oxirgi_amal,kim}')))
           else n end order by ord), '[]'::jsonb)
    into v_tugunlar
    from jsonb_array_elements(v_tugunlar) with ordinality as x(n, ord);
  select coalesce(jsonb_agg(e || jsonb_build_object('kim_nom', public._t2_tizim_kim_nom(e->>'kim'))
                            || jsonb_build_object('kompaniya_nom', (select k.nom from public.t2_kompaniya k where k.id = (e->>'kompaniya_id')::bigint))
                            order by ord), '[]'::jsonb)
    into v_hodisalar
    from jsonb_array_elements(v_hodisalar) with ordinality as x(e, ord);

  -- 4) Ildiz va bog'lanishlar.
  if v_root = 'tizim:0' then
    v_tugunlar := jsonb_build_array(jsonb_build_object(
      'id', v_root, 'tur', 'tizim', 'nom', 'Tizim',
      'meta', jsonb_build_object(
        'kompaniya_jami', v_jami, 'kompaniya_soni', cardinality(v_komp),
        'obyekt_soni', (select coalesce(sum((n #>> '{meta,obyekt_soni}')::bigint), 0) from jsonb_array_elements(v_tugunlar) n where n->>'tur' = 'kompaniya'),
        'ochiq_signal', (select coalesce(sum((n #>> '{meta,ochiq_signal}')::bigint), 0) from jsonb_array_elements(v_tugunlar) n where n->>'tur' = 'kompaniya'),
        'kritik_signal', (select coalesce(sum((n #>> '{meta,kritik_signal}')::bigint), 0) from jsonb_array_elements(v_tugunlar) n where n->>'tur' = 'kompaniya'),
        'xato_24s', (select coalesce(sum((n #>> '{meta,xato_24s}')::bigint), 0) from jsonb_array_elements(v_tugunlar) n where n->>'tur' = 'kompaniya'),
        'navbat', (select coalesce(sum((n #>> '{meta,navbat}')::bigint), 0) from jsonb_array_elements(v_tugunlar) n where n->>'tur' = 'kompaniya'),
        'holat', (select case when bool_or(n #>> '{meta,holat}' = 'xato') then 'xato'
                              when bool_or(n #>> '{meta,holat}' = 'diqqat') then 'diqqat' else 'ok' end
                    from jsonb_array_elements(v_tugunlar) n where n->>'tur' = 'kompaniya')
      ))) || v_tugunlar;
    select coalesce(jsonb_agg(jsonb_build_object('manba', v_root, 'maqsad', n->>'id', 'tur', 'tizim_kompaniya') order by ord), '[]'::jsonb)
      into v_bogichlar
      from jsonb_array_elements(v_tugunlar) with ordinality as x(n, ord) where n->>'tur' = 'kompaniya';
  end if;
  select v_bogichlar || coalesce(jsonb_agg(jsonb_build_object('manba', 'kompaniya:' || (n #>> '{meta,kompaniya_id}'), 'maqsad', n->>'id', 'tur', 'kompaniya_modul') order by ord), '[]'::jsonb)
    into v_bogichlar
    from jsonb_array_elements(v_tugunlar) with ordinality as x(n, ord) where n->>'tur' = 'modul';

  -- 5) Platforma holati — butun tizim ko'rinishida; qator bo'lmasa — `malumot_yoq` (to'qilmaydi).
  if v_root = 'tizim:0' then
    select jsonb_agg(jsonb_build_object('kod', i.kod, 'nom', i.nom, 'holat', i.holat, 'configured', i.configured,
                                        'last_check_at', i.last_check_at, 'xato', left(i.xato, 200), 'versiya', i.versiya) order by i.kod)
      into v_x from public.t2_integration_health i;
    if v_x is null then v_yoq := v_yoq || 'integratsiya'::text;
    else v_platforma := v_platforma || jsonb_build_array(jsonb_build_object('id', 'platforma:integratsiya', 'tur', 'integratsiya', 'nom', 'Integratsiyalar',
           'meta', jsonb_build_object('qatorlar', v_x,
             'holat', case when exists (select 1 from jsonb_array_elements(v_x) q where q->>'holat' = 'failed') then 'xato'
                           when exists (select 1 from jsonb_array_elements(v_x) q where q->>'holat' = 'warning') then 'diqqat' else 'ok' end)));
    end if;
    v_x := null;
    select jsonb_build_object('main_sha', d.main_sha, 'frontend_deploy_id', d.frontend_deploy_id, 'gas_deploy_version', d.gas_deploy_version,
                              'db_migration_head', d.db_migration_head, 'updated_at', d.updated_at)
      into v_x from public.t2_deploy_state d order by d.id limit 1;
    if v_x is null then v_yoq := v_yoq || 'deploy'::text;
    else v_platforma := v_platforma || jsonb_build_array(jsonb_build_object('id', 'platforma:deploy', 'tur', 'deploy', 'nom', 'Deploy',
           'meta', v_x || jsonb_build_object('holat', 'ok')));
    end if;
    v_x := null;
    select jsonb_agg(jsonb_build_object('kod', j.kod, 'nom', j.nom, 'holat', j.holat, 'progress', j.progress,
                                        'last_success_at', j.last_success_at, 'last_error', left(j.last_error, 200), 'updated_at', j.updated_at) order by j.kod)
      into v_x from public.t2_job j;
    if v_x is null then v_yoq := v_yoq || 'ishlar'::text;
    else v_platforma := v_platforma || jsonb_build_array(jsonb_build_object('id', 'platforma:ishlar', 'tur', 'ishlar', 'nom', 'Fon ishlari',
           'meta', jsonb_build_object('qatorlar', v_x,
             'holat', case when exists (select 1 from jsonb_array_elements(v_x) q where q->>'holat' = 'failed') then 'xato'
                           when exists (select 1 from jsonb_array_elements(v_x) q where q->>'holat' = 'paused') then 'diqqat' else 'ok' end)));
    end if;
    v_tugunlar := v_tugunlar || v_platforma;
    select v_bogichlar || coalesce(jsonb_agg(jsonb_build_object('manba', v_root, 'maqsad', n->>'id', 'tur', 'tizim_platforma')), '[]'::jsonb)
      into v_bogichlar from jsonb_array_elements(v_platforma) n;
  end if;

  return jsonb_build_object(
    'ok', true,
    'versiya', 1,
    'vaqt', now(),
    'tugunlar', v_tugunlar,
    'bogichlar', v_bogichlar,
    'oxirgi_hodisalar', v_hodisalar,
    'malumot_yoq', to_jsonb(v_yoq),
    'korinish', jsonb_build_object(
      'doira', case when v_root = 'tizim:0' then 'tizim' else 'kompaniya' end,
      'superadmin', v_super,
      'kompaniya_id', p_kompaniya_id,
      'kompaniya_jami', v_jami,
      'kompaniya_soni', cardinality(v_komp),
      'oyna_soat', 24,
      'oyna_kun', 7)
  );
end
$function$;

revoke all on function public.t2_tizim_xaritasi_v1(bigint, bigint) from public, anon, authenticated;
grant execute on function public.t2_tizim_xaritasi_v1(bigint, bigint) to service_role;
commit;
