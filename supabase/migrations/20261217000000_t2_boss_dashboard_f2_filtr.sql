-- 20261217000000 - t2_boss_dashboard_v1: F2 blokida «jami/soni» faqat jonli F2 hujjatlar.
-- Oltin zanjir auditi: eski funksiya kompaniyaning BARCHA t2_akt qatorlarini (tur='fakt' va holat='bekor' ham) yig'ib,
-- «F2 jami» sifatida ko'rsatardi -> bekor qilingan F2 va fakt hujjatlari direktor panelida sertifikatlangan summaga qo'shilardi.
-- Tuzatish: bitta filtr `a.tur='f2' and a.holat <> 'bekor'`. Boshqa hech narsa o'zgarmaydi (imzo, kalitlar bir xil). Applied: YO'Q (egasi ruxsatidan keyin).
create or replace function public.t2_boss_dashboard_v1(p_kompaniya_id bigint, p_actor_id bigint)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_rol text;
  v_kompaniya jsonb;
  v_loyihalar jsonb;
  v_moliya jsonb;
  v_f2 jsonb;
  v_shartnoma jsonb;
  v_signal jsonb;
  v_storage jsonb;
begin
  v_rol := public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);

  select jsonb_build_object(
           'kompaniya_id', k.id, 'nom', k.nom,
           'rol', v_rol,
           'obyekt_soni', (select count(*) from public.t2_obyekt o where o.kompaniya_id=k.id and o.holat='faol'),
           'loyiha_soni', (select count(*) from public.t2_loyiha l where l.kompaniya_id=k.id and l.holat='faol'))
    into v_kompaniya
  from public.t2_kompaniya k where k.id=p_kompaniya_id;
  if v_kompaniya is null then return jsonb_build_object('ok',false,'code','COMPANY_NOT_FOUND'); end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'loyiha_id', lr.id, 'nom', lr.nom, 'holat', lr.holat, 'hudud', lr.hudud,
           'byudjet', lr.byudjet, 'obyekt_soni', lr.obyekt_soni,
           'smeta_jami', coalesce(oj.smeta_jami,0)) order by lr.yaratildi desc), '[]'::jsonb)
    into v_loyihalar
  from public.t2_loyiha_royxat lr
  left join lateral (
     select sum(oj.jami) as smeta_jami
     from public.t2_obyekt_jami oj
     where oj.kompaniya_id=p_kompaniya_id and oj.loyiha_id=lr.id
  ) oj on true
  where lr.kompaniya_id=p_kompaniya_id
  limit 200;

  select jsonb_build_object(
           'jami_tolangan', coalesce(bu.jami_tolangan,0),
           'jami_debitor',  coalesce(bu.jami_debitor,0),
           'jami_xarajat',  coalesce(bu.jami_xarajat,0),
           'sof_natija',    coalesce(bu.sof_natija,0),
           'ulangan', bu.kompaniya_id is not null)
    into v_moliya
  from (select p_kompaniya_id as k) x
  left join public.t2_bux_umumiy bu on bu.kompaniya_id=x.k;

  select jsonb_build_object(
           'jami', coalesce(sum(a.hujjat_jami),0),
           'soni', count(*),
           'tasdiqlangan', count(*) filter (where a.holat in ('tasdiqlangan','yakunlangan')),
           'qoralama', count(*) filter (where a.holat='qoralama'),
           'oxirgi_oy', max(a.oy))
    into v_f2
  from public.t2_akt a
  where a.kompaniya_id=p_kompaniya_id and a.tur='f2' and a.holat<>'bekor';

  select jsonb_build_object(
           'soni', count(*),
           'jami_summa', coalesce(sum(s.jami_nds_bilan),0),
           'faol', count(*) filter (where s.holat='faol'))
    into v_shartnoma
  from public.t2_shartnoma s where s.kompaniya_id=p_kompaniya_id;

  select jsonb_build_object(
           'ochiq_soni', (select count(*) from public.t2_signal g where g.kompaniya_id=p_kompaniya_id and g.state='open'),
           'kritik_soni', (select count(*) from public.t2_signal g where g.kompaniya_id=p_kompaniya_id and g.state='open' and g.severity in ('high','critical')),
           'royxat', coalesce((select jsonb_agg(jsonb_build_object(
                'id', g.id, 'severity', g.severity, 'signal_type', g.signal_type,
                'title', g.title, 'entity_type', g.entity_type, 'entity_id', g.entity_id,
                'detected_at', g.detected_at, 'due_at', g.due_at))
             from (select * from public.t2_signal where kompaniya_id=p_kompaniya_id and state='open'
                   order by severity desc, detected_at desc limit 25) g), '[]'::jsonb))
    into v_signal;

  if to_regclass('public.t2_document_registry') is not null then
    select jsonb_build_object(
             'ulangan', true,
             'hujjat_soni', (select count(*) from public.t2_document_registry d where d.kompaniya_id=p_kompaniya_id),
             'canonical_stored', (select count(*) from public.t2_document_registry d where d.kompaniya_id=p_kompaniya_id
                                  and coalesce(d.canonical_storage_status,'stored')='stored'),
             'drive_replica_failed', coalesce((select count(*) from public.t2_document_registry d
                                  where d.kompaniya_id=p_kompaniya_id and d.drive_sync_status='failed'),0))
      into v_storage;
  else
    v_storage := jsonb_build_object('ulangan', false, 'izoh', 'Hujjat reyestri modeli hali ulanmagan');
  end if;

  return jsonb_build_object(
    'ok', true,
    'generated_at', now(),
    'kompaniya', v_kompaniya,
    'loyihalar', v_loyihalar,
    'moliya', v_moliya,
    'f2', v_f2,
    'shartnoma', v_shartnoma,
    'signal', v_signal,
    'storage', v_storage,
    'ulanmagan_modullar', jsonb_build_array(
      'procurement_lineage','warehouse_shortage','schedule_delay','retention','margin_forecast')
  );
end $function$;