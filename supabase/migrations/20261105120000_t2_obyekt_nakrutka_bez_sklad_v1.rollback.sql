-- Rollback: БЕЗ СКЛАД ni obyekt nakrutka hisobidan olib tashlash (bez = 0, mat bucket = МАТ+М/К+КАБ).
create or replace function public.t2_obyekt_nakrutka_v1(p_obyekt_id bigint, p_actor_id bigint, p_shartnoma_id bigint default null::bigint)
 returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $function$
declare v_komp bigint; v_rol text; v_cats jsonb; v_nk_javob jsonb; v_shartnoma_id bigint := p_shartnoma_id;
begin
  select kompaniya_id into v_komp from public.t2_obyekt where id = p_obyekt_id;
  if v_komp is null then return jsonb_build_object('ok',false,'code','OBYEKT_NOT_FOUND'); end if;
  v_rol := public.t2_actor_kompaniya_azo_tekshir(v_komp, p_actor_id);
  if v_shartnoma_id is null then
    select sb.shartnoma_id into v_shartnoma_id from public.t2_shartnoma_bog sb where sb.obyekt_id = p_obyekt_id and sb.holat = 'faol' limit 1;
  end if;
  select jsonb_build_object('chel', coalesce(sum(summa) filter (where kat='ЧЕЛ'), 0), 'mash', coalesce(sum(summa) filter (where kat='МАШ'), 0),
    'mat', coalesce(sum(summa) filter (where kat in ('МАТ','М/К','КАБ')), 0), 'ob', coalesce(sum(summa) filter (where kat='ОБ'), 0),
    'mk', coalesce(sum(summa) filter (where kat='М/К'), 0), 'kab', coalesce(sum(summa) filter (where kat='КАБ'), 0), 'bez', 0)
    into v_cats from public.t2_qator where obyekt_id = p_obyekt_id and tur in ('rs','mat','ob');
  v_nk_javob := public.t2_nakrutka_koef_ol_v1(v_komp, p_actor_id, v_shartnoma_id);
  return jsonb_build_object('ok', true, 'obyekt_id', p_obyekt_id, 'shartnoma_id', v_shartnoma_id, 'cats', v_cats,
    'koeffitsientlar', v_nk_javob->'koeffitsientlar', 'nakrutka', public.t2_nakrutka_hisobla_v1(v_cats, v_nk_javob->'koeffitsientlar'), 'jadval', v_nk_javob->'jadval');
end $function$;
