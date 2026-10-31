-- D2: triggersiz muhr. Mavjud biznes yozuvchilari va formulalar o'zgarmaydi.
-- Faqat fayl; production apply Claude tomonidan alohida reviewdan keyin.
begin;
create or replace function public.t2_obyekt_paket_muhr_v1(p_obyekt_id bigint, p_actor_id bigint)
returns text language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_komp bigint; v_nom text; v_q text; v_a text; v_h text; v_meta jsonb;
begin
  if p_obyekt_id is null or p_obyekt_id <= 0 then raise exception 'obyekt_id majburiy' using errcode='22023'; end if;
  select kompaniya_id, nom into v_komp, v_nom from public.t2_obyekt where id=p_obyekt_id;
  if v_komp is null then raise exception 'obyekt topilmadi' using errcode='P0002'; end if;
  perform public.t2_actor_kompaniya_azo_tekshir(v_komp, p_actor_id);

  select jsonb_build_array(count(*), coalesce(sum(versiya),0), max(id), coalesce(sum(id),0))::text into v_q
  -- Texnik muhr barcha versiyalarni qamraydi: live t2_zamena_qoplash eski
  -- replacement qatorlarini ham o'qiydi. Paketning o'zi hamon faqat faol.
  from public.t2_qator where obyekt_id=p_obyekt_id;
  -- FAKT ham shu jadvallarda: faqat F2 bilan filtrlash cache'ni eskirtirib qo'yadi.
  select jsonb_build_array(count(*), coalesce(sum(versiya),0), max(id), coalesce(sum(id),0))::text into v_a
  from public.t2_akt where obyekt_id=p_obyekt_id;
  select jsonb_build_array(count(*), coalesce(sum(aq.versiya),0), max(aq.id), coalesce(sum(aq.id),0))::text into v_h
  from public.t2_akt_qator aq join public.t2_akt a on a.id=aq.akt_id where a.obyekt_id=p_obyekt_id;

  -- Formula qayta hisoblanmaydi: NKning tekshirilgan barcha manba yozuvlari
  -- va hisob ta'riflari muhrlanadi. Paketning o'zi existing RPCdan keladi.
  v_meta := jsonb_build_object(
    'obyekt_nom',v_nom,'kompaniya_id',v_komp,
    -- Snapshot qaytarish versiya triggerlarini chetlab o'tishi mumkin.
    -- Mavjud journal atomik qaytarish commitini muhrga qo'shadi (yangi trigger yo'q).
    'qaytarish',(select jsonb_build_array(count(*),max(j.id)) from snapshot.qaytarish_jurnal j
      where j.kompaniya_id=v_komp and (j.obyekt_id=p_obyekt_id or j.obyekt_id is null)),
    'shartnoma_bog',(select coalesce(jsonb_agg(jsonb_build_array(b.id,b.shartnoma_id) order by b.id),'[]'::jsonb)
      from public.t2_shartnoma_bog b where b.obyekt_id=p_obyekt_id and b.holat='faol'),
    'koef',(select coalesce(jsonb_agg(jsonb_build_array(n.id,n.shartnoma_id,n.koef_kod,n.qiymat,n.versiya) order by n.id),'[]'::jsonb)
      from public.t2_nakrutka_koef n where n.kompaniya_id=v_komp and (n.shartnoma_id is null or exists
        (select 1 from public.t2_shartnoma_bog b where b.obyekt_id=p_obyekt_id and b.holat='faol' and b.shartnoma_id=n.shartnoma_id))),
    'code',(select jsonb_agg(jsonb_build_array(p.oid::regprocedure::text,md5(pg_get_functiondef(p.oid))) order by p.oid)
      from pg_proc p where p.oid in (
        'public.t2_obyekt_paket_v1(bigint,bigint)'::regprocedure,
        'public.t2_obyekt_nakrutka_v1(bigint,bigint,bigint)'::regprocedure,
        'public.t2_nakrutka_default_v1()'::regprocedure,
        'public.t2_nakrutka_koef_ol_v1(bigint,bigint,bigint)'::regprocedure,
        'public.t2_nakrutka_podval_smeta_nk_v1(jsonb)'::regprocedure,
        'public.t2_svod_yaxlit_obyekt_v1(bigint)'::regprocedure,
        'public.t2_almashtirilgan_hajm(bigint)'::regprocedure,
        'public.t2_almashtirilgan_oz_hajm(bigint)'::regprocedure)),
    'views',jsonb_build_array(md5(pg_get_viewdef('public.t2_qator_holat'::regclass)),md5(pg_get_viewdef('public.t2_zamena_qoplash'::regclass))),
    'podval',(select jsonb_build_object('id',p.id,'nom',p.nom,'versiya',p.versiya,'qatorlar',p.qatorlar)
      from public.t2_nakrutka_podval p where p.obyekt_id=p_obyekt_id and p.kompaniya_id=v_komp and p.faol order by p.id desc limit 1),
    'svod_yaxlit',(select coalesce(jsonb_agg(jsonb_build_object('id',y.id,'qator_id',y.qator_id,
      'svod_summa',y.svod_summa,'qqs_stavka',y.qqs_stavka,'turi',y.turi,'versiya',y.versiya,
      'dalil',y.dalil,'kontragent_nom',y.kontragent_nom) order by y.id),'[]'::jsonb)
      from public.t2_svod_yaxlit y where y.obyekt_id=p_obyekt_id and y.faol),
    'versiyalar',(select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'nom',v.nom,'tur',v.tur,'holat',v.holat,
      'manba_sana',v.manba_sana,'yaratildi',v.yaratildi) order by v.id),'[]'::jsonb)
      from public.t2_smeta_versiya v where v.obyekt_id=p_obyekt_id));
  -- Weak ETag: JSON numeric lexical scale emas, business representation tekshiriladi.
  return 'W/"t2-paket-1-' || md5(jsonb_build_array('t2-paket/1;etag/1',v_q,v_a,v_h,v_meta)::text) || '"';
end $$;
comment on function public.t2_obyekt_paket_muhr_v1(bigint,bigint) is
  'versiya: texnik — barcha versiyalar cache invalidation uchun; paket biznes proyeksiyasi faqat faol. Zamena qoplash tarixiy qatorlarga bogliq.';

create or replace function public.t2_obyekt_paket_etag_v1(p_obyekt_id bigint,p_actor_id bigint)
returns json language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_muhr text;
begin
  -- Ikkala STABLE chaqiruv bir request snapshotida: A muhr + B tana race yo'q.
  v_muhr := public.t2_obyekt_paket_muhr_v1(p_obyekt_id,p_actor_id);
  perform set_config('response.headers',jsonb_build_array(jsonb_build_object('ETag',v_muhr))::text,true);
  return public.t2_obyekt_paket_v1(p_obyekt_id,p_actor_id);
end $$;

revoke all on function public.t2_obyekt_paket_muhr_v1(bigint,bigint) from public,anon,authenticated;
revoke all on function public.t2_obyekt_paket_etag_v1(bigint,bigint) from public,anon,authenticated;
grant execute on function public.t2_obyekt_paket_muhr_v1(bigint,bigint) to service_role;
grant execute on function public.t2_obyekt_paket_etag_v1(bigint,bigint) to service_role;
commit;
