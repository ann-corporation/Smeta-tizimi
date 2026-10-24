-- 20261107020000 — Pul tahlili: har summa USTAMALI (asosiy) + ustamasiz (kichik) — egasi qoidasi 2026-10-24.
-- Smeta VA F2 yopilgan kategoriya summalariga MAVJUD t2_nakrutka_hisobla_v1 kaskadi (obyektning t2_obyekt_nakrutka_v1 koeffitsientlari bilan) qo'llanadi.
-- YANGI FORMULA YO'Q. Kaskad chiziqli: har kesim alohida hisoblanadi (yuvish: yig'indi ± tiyin yaxlitlashi), jami = umumiy kategoriya yig'indisidan bitta kaskad.
-- KATSIZ (kategoriyasiz) qatorga ustama QO'LLANMAYDI (null). Faqat o'qiydi. Natija P0 maydonlariga additive.
begin;

create or replace function public.t2_pul_cats_v1(p_kk text, p_v numeric)
returns jsonb language sql immutable parallel safe set search_path to 'public', 'pg_temp' as $$
  select case p_kk
    when 'ЧЕЛ' then jsonb_build_object('chel', p_v)
    when 'МАШ' then jsonb_build_object('mash', p_v)
    when 'МАТ_ODDIY' then jsonb_build_object('mat', p_v)
    when 'М/К' then jsonb_build_object('mat', p_v, 'mk', p_v)
    when 'КАБ' then jsonb_build_object('mat', p_v, 'kab', p_v)
    when 'БЕЗСКЛАД' then jsonb_build_object('mat', p_v, 'bez', p_v)
    when 'ОБ' then jsonb_build_object('ob', p_v)
    else null end $$;

create or replace function public.t2_pul_jadd_v1(p_j jsonb, p_kk text, p_fld text, p_v numeric)
returns jsonb language sql immutable parallel safe set search_path to 'public', 'pg_temp' as $$
  select jsonb_set(case when p_j ? p_kk then p_j else p_j || jsonb_build_object(p_kk, '{}'::jsonb) end,
                   array[p_kk, p_fld], to_jsonb(coalesce((p_j #>> array[p_kk, p_fld])::numeric, 0) + coalesce(p_v, 0)), true) $$;

create or replace function public.t2_pul_tahlil_v1(
  p_kompaniya_id bigint, p_actor_id bigint,
  p_obyekt_id bigint default null, p_shartnoma_id bigint default null,
  p_davr_gacha date default null, p_davr_dan date default null,
  p_dalil_kat text default null)
returns jsonb
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_obyektlar bigint[]; v_gacha date; v_dan date;
  v_kesim jsonb := '[]'::jsonb; v_jami jsonb;
  v_zanjirlar jsonb := '[]'::jsonb; v_zanjir_jami jsonb := '{}'::jsonb;
  v_f2_zanjirlar jsonb := '[]'::jsonb; v_f2_zanjir_jami jsonb := '{}'::jsonb;
  v_dalil jsonb := null; v_z jsonb; v_k text; v_n bigint; v_koef jsonb := null; v_koefmap jsonb := '{}'::jsonb;
  v_tot jsonb := '{}'::jsonb; r record; ns jsonb; nf jsonb; v_cs jsonb; v_cf jsonb; c jsonb;
  v_rows jsonb := '[]'::jsonb; v_kk text; t jsonb; v_ota text; v_tartib numeric;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'f2.read');
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'financial.read');

  if p_obyekt_id is not null then
    if not exists (select 1 from public.t2_obyekt where id = p_obyekt_id and kompaniya_id = p_kompaniya_id) then
      return jsonb_build_object('ok', false, 'code', 'OBYEKT_SCOPE_MISMATCH');
    end if;
    v_obyektlar := array[p_obyekt_id];
  elsif p_shartnoma_id is not null then
    if not exists (select 1 from public.t2_shartnoma where id = p_shartnoma_id and kompaniya_id = p_kompaniya_id) then
      return jsonb_build_object('ok', false, 'code', 'SHARTNOMA_SCOPE_MISMATCH');
    end if;
    select coalesce(array_agg(distinct b.obyekt_id), '{}') into v_obyektlar
      from public.t2_shartnoma_bog b join public.t2_obyekt o on o.id = b.obyekt_id
     where b.shartnoma_id = p_shartnoma_id and b.holat = 'faol' and o.kompaniya_id = p_kompaniya_id;
  else
    select coalesce(array_agg(id), '{}') into v_obyektlar from public.t2_obyekt where kompaniya_id = p_kompaniya_id;
  end if;

  v_gacha := case when p_davr_gacha is null then null else date_trunc('month', p_davr_gacha)::date end;
  v_dan   := case when p_davr_dan   is null then null else date_trunc('month', p_davr_dan)::date end;

  -- Smeta zanjiri (mavjud t2_obyekt_nakrutka_v1) va obyekt koeffitsientlari
  foreach v_n in array coalesce(v_obyektlar, '{}') loop
    v_z := public.t2_obyekt_nakrutka_v1(v_n, p_actor_id, p_shartnoma_id);
    if v_z->>'ok' = 'true' then
      v_zanjirlar := v_zanjirlar || jsonb_build_array(jsonb_build_object(
        'obyekt_id', v_n, 'shartnoma_id', v_z->'shartnoma_id', 'cats', v_z->'cats', 'nakrutka', v_z->'nakrutka'));
      v_koefmap := v_koefmap || jsonb_build_object(v_n::text, v_z->'koeffitsientlar');
      if v_koef is null then v_koef := v_z->'koeffitsientlar'; end if;
      for v_k in select jsonb_object_keys(v_z->'nakrutka') loop
        v_zanjir_jami := jsonb_set(v_zanjir_jami, array[v_k],
          to_jsonb(coalesce((v_zanjir_jami->>v_k)::numeric, 0) + coalesce((v_z->'nakrutka'->>v_k)::numeric, 0)));
      end loop;
    end if;
  end loop;

  -- Obyekt × kategoriya yig'indilari (smeta, F2) — P0 qoidalari o'zgarmagan
  for r in
    with q as (
      select qq.id, qq.obyekt_id, qq.tur, qq.nom, qq.summa,
             case when qq.kat in ('ЧЕЛ','МАШ','М/К','КАБ','БЕЗСКЛАД','ОБ') then qq.kat
                  when qq.kat = 'МАТ' then 'МАТ_ODDIY' else 'KATSIZ' end as kk
        from public.t2_qator qq where qq.obyekt_id = any(v_obyektlar)
    )
    select q.obyekt_id as o_id, q.kk as kkk,
      coalesce(sum(q.summa) filter (where q.tur in ('rs','mat','ob')), 0) as smeta,
      count(*) filter (where q.tur in ('rs','mat','ob') and q.summa is null) as smeta_nom,
      coalesce(sum(x.f2), 0) as f2, coalesce(sum(x.f2_nom), 0) as f2_nom
    from q left join lateral (
      select sum(coalesce(aq.certified_amount, aq.summa)) as f2,
             count(*) filter (where q.tur not in ('rz','bl') and coalesce(q.nom,'') !~* 'ЗАТРАТЫ\s+ТРУДА\s+МАШИНИСТ'
                               and coalesce(aq.certified_amount, aq.summa) is null
                               and coalesce(aq.certified_quantity, aq.hajm, 0) <> 0) as f2_nom
        from public.t2_akt_qator aq
        join public.t2_akt a on a.id = aq.akt_id and a.holat <> 'bekor'
       where aq.qator_id = q.id and a.tur = 'f2' and a.holat = 'tasdiqlangan'
         and (v_gacha is null or a.oy <= v_gacha) and (v_dan is null or a.oy >= v_dan)
    ) x on true
    group by q.obyekt_id, q.kk
  loop
    c := v_koefmap -> (r.o_id::text);
    v_tot := public.t2_pul_jadd_v1(v_tot, r.kkk, 'smeta', r.smeta);
    v_tot := public.t2_pul_jadd_v1(v_tot, r.kkk, 'smeta_nom', r.smeta_nom);
    v_tot := public.t2_pul_jadd_v1(v_tot, r.kkk, 'f2', r.f2);
    v_tot := public.t2_pul_jadd_v1(v_tot, r.kkk, 'f2_nom', r.f2_nom);
    v_cs := public.t2_pul_cats_v1(r.kkk, r.smeta);
    if v_cs is not null and c is not null then
      ns := public.t2_nakrutka_hisobla_v1(v_cs, c); nf := public.t2_nakrutka_hisobla_v1(public.t2_pul_cats_v1(r.kkk, r.f2), c);
      v_tot := public.t2_pul_jadd_v1(v_tot, r.kkk, 's_i4', (ns->>'itogo4')::numeric);
      v_tot := public.t2_pul_jadd_v1(v_tot, r.kkk, 's_nds', (ns->>'nds')::numeric);
      v_tot := public.t2_pul_jadd_v1(v_tot, r.kkk, 's_v', (ns->>'vsego')::numeric);
      v_tot := public.t2_pul_jadd_v1(v_tot, r.kkk, 'f_i4', (nf->>'itogo4')::numeric);
      v_tot := public.t2_pul_jadd_v1(v_tot, r.kkk, 'f_nds', (nf->>'nds')::numeric);
      v_tot := public.t2_pul_jadd_v1(v_tot, r.kkk, 'f_v', (nf->>'vsego')::numeric);
    end if;
  end loop;

  -- F2 zanjiri: har obyektning F2 kategoriya yig'indisi → bitta kaskad (obyekt koeffitsientlari)
  foreach v_n in array coalesce(v_obyektlar, '{}') loop
    c := v_koefmap -> (v_n::text);
    continue when c is null;
    select jsonb_build_object(
      'chel', coalesce(sum(f2) filter (where kk = 'ЧЕЛ'), 0), 'mash', coalesce(sum(f2) filter (where kk = 'МАШ'), 0),
      'mat', coalesce(sum(f2) filter (where kk in ('МАТ_ODDIY','М/К','КАБ','БЕЗСКЛАД')), 0),
      'ob', coalesce(sum(f2) filter (where kk = 'ОБ'), 0), 'mk', coalesce(sum(f2) filter (where kk = 'М/К'), 0),
      'kab', coalesce(sum(f2) filter (where kk = 'КАБ'), 0), 'bez', coalesce(sum(f2) filter (where kk = 'БЕЗСКЛАД'), 0))
      into v_cf
      from (
        select case when qq.kat in ('ЧЕЛ','МАШ','М/К','КАБ','БЕЗСКЛАД','ОБ') then qq.kat when qq.kat = 'МАТ' then 'МАТ_ODDIY' else 'KATSIZ' end as kk,
               sum(coalesce(aq.certified_amount, aq.summa)) as f2
          from public.t2_qator qq
          join public.t2_akt_qator aq on aq.qator_id = qq.id
          join public.t2_akt a on a.id = aq.akt_id and a.holat <> 'bekor' and a.tur = 'f2' and a.holat = 'tasdiqlangan'
         where qq.obyekt_id = v_n and (v_gacha is null or a.oy <= v_gacha) and (v_dan is null or a.oy >= v_dan)
         group by 1) z;
    nf := public.t2_nakrutka_hisobla_v1(v_cf, c);
    v_f2_zanjirlar := v_f2_zanjirlar || jsonb_build_array(jsonb_build_object('obyekt_id', v_n, 'cats', v_cf, 'nakrutka', nf));
    for v_k in select jsonb_object_keys(nf) loop
      v_f2_zanjir_jami := jsonb_set(v_f2_zanjir_jami, array[v_k],
        to_jsonb(coalesce((v_f2_zanjir_jami->>v_k)::numeric, 0) + coalesce((nf->>v_k)::numeric, 0)));
    end loop;
  end loop;

  -- Kesimlar (tartib: ЧЕЛ, МАШ, МАТ (+ichki), ОБ, KATSIZ)
  for v_kk, v_ota, v_tartib in select * from (values ('ЧЕЛ',null,1),('МАШ',null,2),('МАТ_ODDIY','МАТ',3.1),('М/К','МАТ',3.2),('КАБ','МАТ',3.3),('БЕЗСКЛАД','МАТ',3.4),('ОБ',null,4),('KATSIZ',null,5)) k(a,b,o) order by 3 loop
    t := coalesce(v_tot -> v_kk, '{}'::jsonb);
    v_rows := v_rows || jsonb_build_array(jsonb_build_object('kat', v_kk, 'ota', v_ota, 'tartib', v_tartib,
      'smeta', coalesce((t->>'smeta')::numeric, 0), 'smeta_nom', coalesce((t->>'smeta_nom')::numeric, 0),
      'f2', coalesce((t->>'f2')::numeric, 0), 'f2_nom', coalesce((t->>'f2_nom')::numeric, 0),
      's_i4', t->'s_i4', 's_nds', t->'s_nds', 's_v', t->'s_v', 'f_i4', t->'f_i4', 'f_nds', t->'f_nds', 'f_v', t->'f_v'));
  end loop;

  -- JSON qatorlar
  for t in select * from jsonb_array_elements(v_rows) loop
    v_kesim := v_kesim || jsonb_build_array(jsonb_build_object(
      'kat', t->>'kat', 'ota', t->'ota',
      'smeta_ustamasiz', (t->>'smeta')::numeric, 'smeta_nomalum', (t->>'smeta_nom')::numeric,
      'f2_yopilgan', (t->>'f2')::numeric, 'f2_nomalum', (t->>'f2_nom')::numeric,
      'smeta_ustamali', case when t->'s_v' = 'null'::jsonb or t->'s_v' is null then null
        else jsonb_build_object('itogo4', t->'s_i4', 'nds', t->'s_nds', 'vsego', t->'s_v') end,
      'f2_ustamali', case when t->'f_v' = 'null'::jsonb or t->'f_v' is null then null
        else jsonb_build_object('itogo4', t->'f_i4', 'nds', t->'f_nds', 'vsego', t->'f_v') end,
      'xarajat', null, 'farq', null, 'farq_foiz', null, 'xarajat_holat', 'kiritilmagan'));
  end loop;
  -- МАТ guruh qatori: ichki qatorlar yig'indisi (МАТ_ODDIY + М/К + КАБ + БЕЗСКЛАД); МАТ_ODDIY oddiy materialni bildiradi
  declare m jsonb; i4s numeric; nds_s numeric; v_s numeric; i4f numeric; nds_f numeric; v_f_ numeric;
  begin
    select jsonb_build_object(
        'smeta_ustamasiz', sum((x->>'smeta_ustamasiz')::numeric), 'smeta_nomalum', sum((x->>'smeta_nomalum')::numeric),
        'f2_yopilgan', sum((x->>'f2_yopilgan')::numeric), 'f2_nomalum', sum((x->>'f2_nomalum')::numeric)),
      sum((x->'smeta_ustamali'->>'itogo4')::numeric), sum((x->'smeta_ustamali'->>'nds')::numeric), sum((x->'smeta_ustamali'->>'vsego')::numeric),
      sum((x->'f2_ustamali'->>'itogo4')::numeric), sum((x->'f2_ustamali'->>'nds')::numeric), sum((x->'f2_ustamali'->>'vsego')::numeric)
      into m, i4s, nds_s, v_s, i4f, nds_f, v_f_
      from jsonb_array_elements(v_kesim) x where x->>'ota' = 'МАТ';
    m := m || jsonb_build_object('kat', 'МАТ', 'ota', null,
      'smeta_ustamali', case when v_s is null then null else jsonb_build_object('itogo4', i4s, 'nds', nds_s, 'vsego', v_s) end,
      'f2_ustamali', case when v_f_ is null then null else jsonb_build_object('itogo4', i4f, 'nds', nds_f, 'vsego', v_f_) end,
      'xarajat', null, 'farq', null, 'farq_foiz', null, 'xarajat_holat', 'kiritilmagan');
    -- МАТ guruh qatori ЧЕЛ, МАШ dan keyin, ichki qatorlardan oldin
    select coalesce(jsonb_agg(e order by ord), '[]'::jsonb) into v_kesim from (
      select x as e, case x->>'kat' when 'ЧЕЛ' then 1 when 'МАШ' then 2 when 'МАТ_ODDIY' then 3.1 when 'М/К' then 3.2 when 'КАБ' then 3.3
                                    when 'БЕЗСКЛАД' then 3.4 when 'ОБ' then 4 else 5 end as ord from jsonb_array_elements(v_kesim) x
      union all select m, 3.0) s(e, ord);
  end;

  select jsonb_build_object(
      'smeta_ustamasiz', coalesce(sum((x->>'smeta_ustamasiz')::numeric), 0), 'smeta_nomalum', coalesce(sum((x->>'smeta_nomalum')::numeric), 0),
      'f2_yopilgan', coalesce(sum((x->>'f2_yopilgan')::numeric), 0), 'f2_nomalum', coalesce(sum((x->>'f2_nomalum')::numeric), 0),
      'smeta_ustamali', case when v_zanjir_jami ? 'vsego' then jsonb_build_object('itogo4', v_zanjir_jami->'itogo4', 'nds', v_zanjir_jami->'nds', 'vsego', v_zanjir_jami->'vsego') end,
      'f2_ustamali', case when v_f2_zanjir_jami ? 'vsego' then jsonb_build_object('itogo4', v_f2_zanjir_jami->'itogo4', 'nds', v_f2_zanjir_jami->'nds', 'vsego', v_f2_zanjir_jami->'vsego') end,
      'xarajat', null, 'farq', null, 'farq_foiz', null)
    into v_jami from jsonb_array_elements(v_kesim) x where x->>'ota' is null;

  v_kesim := v_kesim || jsonb_build_array(
    jsonb_build_object('kat','SUB','ota',null,'smeta_ustamasiz',null,'f2_yopilgan',null,'smeta_ustamali',null,'f2_ustamali',null,'xarajat',null,'farq',null,'farq_foiz',null,'xarajat_holat','hisoblanmagan'),
    jsonb_build_object('kat','OTK','ota',null,'smeta_ustamasiz',null,'f2_yopilgan',null,'smeta_ustamali',null,'f2_ustamali',null,'xarajat',null,'farq',null,'farq_foiz',null,'xarajat_holat','hisoblanmagan'));

  -- Dalil: bosilgan kesimdagi manba qatorlar (eng katta 300). 'МАТ' = МАТ + М/К + КАБ + БЕЗСКЛАД.
  if p_dalil_kat is not null then
    select coalesce(jsonb_agg(d.j order by d.ord desc), '[]'::jsonb) into v_dalil from (
      select coalesce(abs(x.f2), 0) + coalesce(abs(qq.summa), 0) as ord, jsonb_build_object(
        'qator_id', qq.id, 'obyekt_id', qq.obyekt_id, 'kod', qq.kod, 'nom', qq.nom, 'tur', qq.tur, 'kat', qq.kat,
        'smeta_summa', qq.summa, 'f2_summa', x.f2, 'aktlar', x.aktlar) as j
      from public.t2_qator qq
      left join lateral (
        select sum(coalesce(aq.certified_amount, aq.summa)) as f2,
               jsonb_agg(distinct jsonb_build_object('akt_id', a.id, 'raqam', a.raqam, 'oy', to_char(a.oy,'YYYY-MM'))) as aktlar
          from public.t2_akt_qator aq join public.t2_akt a on a.id = aq.akt_id and a.holat <> 'bekor'
         where aq.qator_id = qq.id and a.tur = 'f2' and a.holat = 'tasdiqlangan'
           and (v_gacha is null or a.oy <= v_gacha) and (v_dan is null or a.oy >= v_dan)
      ) x on true
      where qq.obyekt_id = any(v_obyektlar)
        and (case when p_dalil_kat = 'МАТ' then qq.kat in ('МАТ','М/К','КАБ','БЕЗСКЛАД')
                  else (case when qq.kat in ('ЧЕЛ','МАШ','МАТ','М/К','КАБ','БЕЗСКЛАД','ОБ') then qq.kat else 'KATSIZ' end)
                       = (case when p_dalil_kat = 'МАТ_ODDIY' then 'МАТ' else p_dalil_kat end) end)
        and (qq.summa is not null or x.f2 is not null)
      order by 1 desc limit 300
    ) d;
  end if;

  return jsonb_build_object(
    'ok', true, 'generated_at', now(),
    'qamrov', jsonb_build_object('obyekt_id', p_obyekt_id, 'shartnoma_id', p_shartnoma_id, 'obyektlar', to_jsonb(v_obyektlar),
                                 'davr_dan', v_dan, 'davr_gacha', v_gacha),
    'kesimlar', v_kesim, 'jami', v_jami,
    'zanjir', jsonb_build_object('obyektlar', v_zanjirlar, 'jami', v_zanjir_jami, 'koeffitsientlar', v_koef,
                                 'f2_obyektlar', v_f2_zanjirlar, 'f2_jami', v_f2_zanjir_jami, 'manba', 't2_obyekt_nakrutka_v1 + t2_nakrutka_hisobla_v1'),
    'dalil_kat', p_dalil_kat, 'dalil', v_dalil);
end $fn$;

revoke all on function public.t2_pul_cats_v1(text, numeric) from public, anon, authenticated;
revoke all on function public.t2_pul_jadd_v1(jsonb, text, text, numeric) from public, anon, authenticated;
revoke all on function public.t2_pul_tahlil_v1(bigint, bigint, bigint, bigint, date, date, text) from public, anon, authenticated;
grant execute on function public.t2_pul_tahlil_v1(bigint, bigint, bigint, bigint, date, date, text) to service_role;

commit;
