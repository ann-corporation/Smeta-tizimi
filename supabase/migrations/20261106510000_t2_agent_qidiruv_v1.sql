-- Jarvis aniq qidiruvi (egasi 2026-10-15: "«Amfiteatrda M200 beton smetada qanchadan berilgan?» → «menda bunaqa ma'lumot yo'q»
-- — kompaniya ma'lumotidan to'g'ridan-to'g'ri qidirib javob bersin"). Faqat qo'shimcha: bitta o'qish funksiyasi.
-- Xavfsizlik: faqat o'z kompaniyasi (scope guard); smeta qatorlari faqat lavozimida 'hajm' yoki 'smeta_pul' bo'lsa,
-- narx va summa FAQAT 'smeta_pul' bo'lsa. Narx 0 — haqiqiy 0 (egasi qoidasi), narxsiz (null) qatorlar alohida sanaladi. So'zlar faqat harf/raqam (LIKE belgilari kira olmaydi), ≤ 8 + 6 ta.
create or replace function public.t2_agent_qidiruv_v1(p_actor_id bigint, p_kompaniya_id bigint, p_obyekt_sozlar text[], p_resurs_sozlar text[], p_obyekt_id bigint default null)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare g jsonb; k public.t2_agent_kasb%rowtype; v_pul boolean; v_hajm boolean; v_osz text[]; v_rsz text[]; v_ob bigint[]; v_obj jsonb; v_rows jsonb;
begin
  if p_kompaniya_id is null then return jsonb_build_object('ok', false, 'code', 'KOMPANIYA_KERAK'); end if;
  g := public.t2_agent_scope_guard_v1(p_actor_id, p_kompaniya_id);
  if not (g->>'ok')::boolean then return g; end if;
  select * into k from t2_agent_kasb where rol = g->>'rol';
  v_pul := 'smeta_pul' = any(coalesce(k.kategoriyalar, '{}'));
  v_hajm := v_pul or 'hajm' = any(coalesce(k.kategoriyalar, '{}'));
  v_osz := array(select distinct lower(x) from unnest(coalesce(p_obyekt_sozlar, '{}')) x where length(x) between 3 and 20 and x ~ '^[[:alnum:]]+$' limit 8);
  v_rsz := array(select distinct upper(x) from unnest(coalesce(p_resurs_sozlar, '{}')) x where length(x) between 2 and 20 and x ~ '^[[:alnum:]]+$' limit 6);
  if p_obyekt_id is not null then
    if not exists (select 1 from t2_obyekt where id = p_obyekt_id and kompaniya_id = p_kompaniya_id) then return jsonb_build_object('ok', false, 'code', 'OBYEKT_BEGONA'); end if;
    v_ob := array[p_obyekt_id];
  else
    v_ob := array(select id from t2_obyekt o where o.kompaniya_id = p_kompaniya_id and cardinality(v_osz) > 0
                    and exists (select 1 from unnest(v_osz) w where lower(o.nom) like '%' || w || '%') order by o.yangilandi desc nulls last limit 5);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'nom', nom)), '[]') into v_obj from t2_obyekt where id = any(v_ob);
  if not v_hajm or cardinality(v_rsz) = 0 then
    return jsonb_build_object('ok', true, 'obyektlar', v_obj, 'qatorlar', '[]'::jsonb, 'ruxsat', v_hajm, 'narx_ruxsat', v_pul);
  end if;
  with q as (
    select q.obyekt_id, q.nom, q.birlik, q.tur, q.hajm, q.narx, q.summa,
           (select count(*) from unnest(v_rsz) w where upper(q.nom) like '%' || w || '%') m
      from t2_qator q
     where q.kompaniya_id = p_kompaniya_id and q.tur in ('rs', 'mat', 'ob', 'bl')
       and (cardinality(v_ob) = 0 or q.obyekt_id = any(v_ob))
       and upper(q.nom) like any (array(select '%' || w || '%' from unnest(v_rsz) w))
  ), eng as (select max(m) mm from q)
  select coalesce(jsonb_agg(z.j), '[]') into v_rows from (
    select jsonb_strip_nulls(jsonb_build_object('obyekt', (select o.nom from t2_obyekt o where o.id = q.obyekt_id), 'nom', left(q.nom, 200), 'birlik', q.birlik,
             'tur', q.tur, 'qator_soni', count(*), 'hajm', round(sum(q.hajm), 4),
             'narx_min', case when v_pul then min(q.narx) filter (where q.narx is not null) end, 'narx_max', case when v_pul then max(q.narx) filter (where q.narx is not null) end,
             'narxsiz_qator', count(*) filter (where q.narx is null), 'summa', case when v_pul then round(sum(q.summa)) end)) j
      from q, eng where q.m = eng.mm
     group by q.obyekt_id, q.nom, q.birlik, q.tur order by count(*) desc, q.nom limit 15) z;
  return jsonb_build_object('ok', true, 'obyektlar', v_obj, 'qatorlar', v_rows, 'ruxsat', true, 'narx_ruxsat', v_pul, 'sozlar', to_jsonb(v_rsz));
end $$;
revoke all on function public.t2_agent_qidiruv_v1(bigint, bigint, text[], text[], bigint) from public, anon, authenticated;
grant execute on function public.t2_agent_qidiruv_v1(bigint, bigint, text[], text[], bigint) to service_role;
