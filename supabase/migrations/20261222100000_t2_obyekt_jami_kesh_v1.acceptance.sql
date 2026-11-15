-- Qabul (BEGIN..ROLLBACK): 20261222100000_t2_obyekt_jami_kesh_v1 qo'llangandan KEYIN. Hech narsa saqlanmaydi.
-- 1) Toza keshdan o'qilgan view == hamma obyekt "iflos" (jonli hisob) bo'lgandagi view (barcha ustunlar, ikki yo'nalishda).
-- 2) Qator o'zgarsa (trigger iflos qiladi) view darhol yangi summani ko'rsatadi, keshni qayta hisoblagach ham o'sha son.
begin;
do $test$
declare n_a bigint; n_b bigint; v_obj bigint; v_before numeric; v_after numeric; v_cache numeric; v_qid bigint;
begin
  create temp table _toza on commit drop as select * from public.t2_obyekt_jami;
  insert into public.t2_obyekt_kesh_iflos(obyekt_id, kompaniya_id, sabab)
    select id, kompaniya_id, 'qabul' from public.t2_obyekt on conflict (obyekt_id) do nothing;
  create temp table _jonli on commit drop as select * from public.t2_obyekt_jami;
  select count(*) into n_a from (select * from _toza except select * from _jonli) x;
  select count(*) into n_b from (select * from _jonli except select * from _toza) x;
  if n_a <> 0 or n_b <> 0 then raise exception 'A1: kesh va jonli view farq qiladi (% / %)', n_a, n_b; end if;
  delete from public.t2_obyekt_kesh_iflos where sabab = 'qabul';

  select q.obyekt_id, q.id into v_obj, v_qid
    from public.t2_qator q join public.t2_obyekt_jami_kesh k on k.obyekt_id = q.obyekt_id
   where q.tur = 'rs' and q.summa is not null and q.versiya_holat = 'faol' and public.t2_qator_asl_v1(q.change_type, q.qoshimcha, q.zamena)
   limit 1;
  if v_obj is null then raise notice 'A2 o''tkazildi: sinov qatori yo''q'; return; end if;
  select jami into v_before from public.t2_obyekt_jami where id = v_obj;
  update public.t2_qator set summa = summa + 1000 where id = v_qid;
  select jami into v_after from public.t2_obyekt_jami where id = v_obj;
  if v_after is distinct from v_before + 1000 then raise exception 'A2: iflos obyekt jonli ko''rsatmadi (% -> %)', v_before, v_after; end if;
  perform public._t2_obyekt_jami_kesh_hisobla_v1(v_obj);
  delete from public.t2_obyekt_kesh_iflos where obyekt_id = v_obj;
  select jami into v_cache from public.t2_obyekt_jami where id = v_obj;
  if v_cache is distinct from v_after then raise exception 'A3: qayta hisoblangan kesh farq qiladi (% vs %)', v_cache, v_after; end if;
end
$test$;
rollback;
