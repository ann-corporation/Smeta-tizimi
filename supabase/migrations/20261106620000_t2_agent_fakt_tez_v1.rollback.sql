-- Rollback 20261106620000: t2_agent_fakt_v1 ning oldingi ta'rifi (obyekt_korsatkichlari — barcha qatorlar t2_qator_holat orqali).
CREATE OR REPLACE FUNCTION public.t2_agent_fakt_v1(p_actor_id bigint, p_kompaniya_id bigint, p_kategoriyalar text[], p_obyekt_id bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare g jsonb; k public.t2_agent_kasb%rowtype; v_ruxsat text[]; v_so text[]; v_rad text[]; r jsonb := '{}'::jsonb; x jsonb;
  v_ob bigint[];
begin
  if p_kompaniya_id is null then return jsonb_build_object('ok', false, 'code', 'KOMPANIYA_KERAK'); end if;
  g := public.t2_agent_scope_guard_v1(p_actor_id, p_kompaniya_id);
  if not (g->>'ok')::boolean then return g; end if;
  select * into k from t2_agent_kasb where rol = g->>'rol';
  v_ruxsat := coalesce(k.kategoriyalar, array['obyektlar']);
  v_so := coalesce(p_kategoriyalar, array['obyektlar']);
  select coalesce(array_agg(c order by c), '{}') into v_rad from unnest(v_so) c where not (c = any(v_ruxsat));
  v_so := array(select c from unnest(v_so) c where c = any(v_ruxsat));
  if p_obyekt_id is not null and not exists (select 1 from t2_obyekt where id = p_obyekt_id and kompaniya_id = p_kompaniya_id) then return jsonb_build_object('ok', false, 'code', 'OBYEKT_BEGONA'); end if;
  select coalesce(array_agg(id), '{}') into v_ob from (select id from t2_obyekt where kompaniya_id = p_kompaniya_id and holat = 'faol' and (p_obyekt_id is null or id = p_obyekt_id) order by yangilandi desc nulls last limit 15) z;

  r := jsonb_build_object('bugun', current_date, 'kompaniya', (select nom from t2_kompaniya where id = p_kompaniya_id));

  if 'obyektlar' = any(v_so) then
    select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'nom', o.nom, 'hudud', o.hudud, 'loyiha', (select l.nom from t2_loyiha l where l.id = o.loyiha_id)) order by o.nom), '[]') into x
      from t2_obyekt o where o.id = any(v_ob);
    r := r || jsonb_build_object('obyektlar', x);
  end if;

  if 'smeta_pul' = any(v_so) or 'f2_fakt_pul' = any(v_so) or 'hajm' = any(v_so) then
    select coalesce(jsonb_agg(t.j order by t.nom), '[]') into x from (
      select o.nom,
        jsonb_strip_nulls(jsonb_build_object('obyekt', o.nom)
          || case when 'smeta_pul' = any(v_so) then jsonb_build_object('smeta_jami_som', round(coalesce(sum(h.smeta_summa) filter (where h.tur = 'rz'), 0)),
               'narxsiz_qatorlar', count(*) filter (where h.tur in ('rs','mat','ob') and h.smeta_narx is null)) else '{}'::jsonb end
          || case when 'f2_fakt_pul' = any(v_so) then jsonb_build_object('fakt_som', round(coalesce(sum(h.fakt_summa), 0)), 'f2_som', round(coalesce(sum(h.f2_summa), 0))) else '{}'::jsonb end
          || case when 'hajm' = any(v_so) then jsonb_build_object('bajarilish_foiz_fakt', round(coalesce(sum(h.fakt_summa) filter (where h.tur = 'rs') * 100.0 / nullif(sum(h.smeta_summa) filter (where h.tur = 'rs'), 0), 0), 1),
               'bajarilish_foiz_f2', round(coalesce(sum(h.f2_summa) filter (where h.tur = 'rs') * 100.0 / nullif(sum(h.smeta_summa) filter (where h.tur = 'rs'), 0), 0), 1)) else '{}'::jsonb end) j
      from t2_obyekt o join t2_qator_holat h on h.obyekt_id = o.id where o.id = any(v_ob) group by o.id, o.nom) t;
    r := r || jsonb_build_object('obyekt_korsatkichlari', x);
  end if;

  if 'f2_fakt_pul' = any(v_so) then
    select coalesce(jsonb_object_agg(coalesce(lifecycle_status, 'noma''lum'), n), '{}') into x from (
      select lifecycle_status, count(*) n from t2_akt where kompaniya_id = p_kompaniya_id and (p_obyekt_id is null or obyekt_id = p_obyekt_id) group by 1) a;
    r := r || jsonb_build_object('f2_aktlar_holati', x);
  end if;

  if 'grafik' = any(v_so) then
    select coalesce(jsonb_agg(z.j), '[]') into x from (
      select jsonb_build_object('id', gq.id, 'versiya', gq.versiya, 'obyekt', o.nom, 'ish', gq.nom, 'boshlanish', gq.boshlanish_sana, 'tugash', gq.tugash_sana, 'foiz', gq.foiz,
               'kechikkan', (gq.tugash_sana < current_date and coalesce(gq.foiz, 0) < 100)) j
        from t2_grafik_qator gq join t2_obyekt o on o.id = gq.obyekt_id
       where gq.kompaniya_id = p_kompaniya_id and coalesce(gq.faol, true) and gq.obyekt_id = any(v_ob)
       order by (gq.tugash_sana < current_date and coalesce(gq.foiz, 0) < 100) desc, gq.tugash_sana asc nulls last limit 30) z;
    r := r || jsonb_build_object('grafik', x);
  end if;

  if 'moliya' = any(v_so) then
    r := r || jsonb_build_object('moliya', jsonb_build_object(
      'tolov_jami_som', (select round(coalesce(sum(summa), 0)) from t2_tolov where kompaniya_id = p_kompaniya_id and coalesce(holat, 'faol') <> 'bekor'),
      'tolov_shu_oy_som', (select round(coalesce(sum(summa), 0)) from t2_tolov where kompaniya_id = p_kompaniya_id and coalesce(holat, 'faol') <> 'bekor' and sana >= date_trunc('month', current_date)),
      'xarajat_jami_som', (select round(coalesce(sum(summa), 0)) from t2_xarajat where kompaniya_id = p_kompaniya_id and coalesce(holat, 'faol') <> 'bekor'),
      'xarajat_shu_oy_som', (select round(coalesce(sum(summa), 0)) from t2_xarajat where kompaniya_id = p_kompaniya_id and coalesce(holat, 'faol') <> 'bekor' and sana >= date_trunc('month', current_date)),
      'xarajat_toifalar', (select coalesce(jsonb_agg(jsonb_build_object('toifa', toifa, 'som', s) order by s desc), '[]') from (select coalesce(toifa, 'boshqa') toifa, round(sum(summa)) s from t2_xarajat where kompaniya_id = p_kompaniya_id and coalesce(holat, 'faol') <> 'bekor' group by 1 order by 2 desc limit 8) q),
      'faktura_soni', (select count(*) from t2_faktura where kompaniya_id = p_kompaniya_id),
      'faktura_jami_som', (select round(coalesce(sum(summa), 0)) from t2_faktura where kompaniya_id = p_kompaniya_id),
      'shartnomalar', (select coalesce(jsonb_agg(jsonb_build_object('raqam', raqam, 'taraf', taraf, 'holat', holat, 'jami_nds_bilan_som', round(jami_nds_bilan)) order by yangilandi desc), '[]') from (select * from t2_shartnoma where kompaniya_id = p_kompaniya_id and coalesce(holat, 'faol') <> 'bekor' order by yangilandi desc limit 10) s)));
  end if;

  if 'ombor' = any(v_so) then
    select coalesce(jsonb_agg(jsonb_build_object('nomi', nomi, 'birlik', birligi, 'qoldiq', q) order by q desc), '[]') into x from (
      select nomi, birligi, round(sum(case when operatsiya = 'prixod' then obyomi else -obyomi end), 2) q from t2_sklad_harakat
       where kompaniya_id = p_kompaniya_id and coalesce(holat, 'faol') <> 'bekor' and (p_obyekt_id is null or obyekt_id = p_obyekt_id) group by 1, 2
       having sum(case when operatsiya = 'prixod' then obyomi else -obyomi end) <> 0 order by 3 desc limit 25) m;
    r := r || jsonb_build_object('ombor_qoldiq', x);
    select coalesce(jsonb_agg(jsonb_build_object('sana', sana, 'amal', operatsiya, 'nomi', nomi, 'birlik', birligi, 'miqdor', obyomi) order by sana desc, id desc), '[]') into x from (
      select * from t2_sklad_harakat where kompaniya_id = p_kompaniya_id and coalesce(holat, 'faol') <> 'bekor' and (p_obyekt_id is null or obyekt_id = p_obyekt_id) order by sana desc, id desc limit 12) h;
    r := r || jsonb_build_object('ombor_oxirgi_harakatlar', x);
  end if;

  if 'sifat' = any(v_so) then
    r := r || jsonb_build_object('sifat', jsonb_build_object(
      'aosr_jami', (select count(*) from t2_aosr where kompaniya_id = p_kompaniya_id and (p_obyekt_id is null or obyekt_id = p_obyekt_id)),
      'aosr_holati', (select coalesce(jsonb_object_agg(coalesce(holat, 'noma''lum'), n), '{}') from (select holat, count(*) n from t2_aosr where kompaniya_id = p_kompaniya_id and (p_obyekt_id is null or obyekt_id = p_obyekt_id) group by 1) a),
      'aosr_oxirgi', (select coalesce(jsonb_agg(jsonb_build_object('raqam', raqam, 'ish', ish_nomi, 'sana', sana, 'holat', holat) order by id desc), '[]') from (select * from t2_aosr where kompaniya_id = p_kompaniya_id and (p_obyekt_id is null or obyekt_id = p_obyekt_id) order by id desc limit 8) a),
      'laboratoriya_jami', (select count(*) from t2_lab_protokol where kompaniya_id = p_kompaniya_id and (p_obyekt_id is null or obyekt_id = p_obyekt_id)),
      'laboratoriya_oxirgi', (select coalesce(jsonb_agg(jsonb_build_object('sana', sana, 'sinov', sinov_turi, 'marka', marka, 'natija', natija) order by sana desc nulls last), '[]') from (select * from t2_lab_protokol where kompaniya_id = p_kompaniya_id and (p_obyekt_id is null or obyekt_id = p_obyekt_id) order by sana desc nulls last limit 8) l)));
  end if;

  if 'kadr' = any(v_so) then
    select coalesce(jsonb_agg(jsonb_build_object('ism', ism_sharif, 'lavozim', lavozim, 'oylik', oylik_maosh, 'valyuta', valyuta) order by ism_sharif), '[]') into x from (
      select * from t2_kadr_mustaqil where kompaniya_id = p_kompaniya_id and coalesce(holat, 'faol') <> 'bekor' order by ism_sharif limit 40) kd;
    r := r || jsonb_build_object('xodimlar', x);
  end if;

  if 'texnika' = any(v_so) then
    select coalesce(jsonb_agg(jsonb_build_object('nomi', nomi, 'davlat_raqami', davlat_raqami) order by nomi), '[]') into x from (
      select * from t2_texnika_mustaqil where kompaniya_id = p_kompaniya_id and coalesce(holat, 'faol') <> 'bekor' order by nomi limit 25) tx;
    r := r || jsonb_build_object('texnika', x);
  end if;

  return jsonb_build_object('ok', true, 'rol', g->>'rol', 'ishlatilgan', to_jsonb(v_so), 'taqiqlangan', to_jsonb(v_rad), 'fakt', r);
end $function$;
