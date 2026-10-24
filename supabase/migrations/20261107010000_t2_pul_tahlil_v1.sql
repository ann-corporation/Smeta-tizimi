-- 20261107010000 — Rahbarlar uchun pul tahlili (P0): kategoriya × {smeta ustamasiz, F2 yopilgan} + koeffitsient zanjiri. READ-ONLY.
-- Yangi formula YO'Q: smeta zanjiri = mavjud t2_obyekt_nakrutka_v1 (t2_nakrutka_hisobla_v1) natijasi; ko'p obyektda bosqichlar faqat QO'SHILADI.
-- F2 yopilgan = t2_nakopitelniy_v2 bilan AYNAN bir xil qoida: t2_akt.tur='f2', holat='tasdiqlangan', summa = coalesce(certified_amount, summa).
-- Orakul: kesimlar F2 yig'indisi == t2_nakopitelniy_v2.jami.jami_tasdiqlangan_summa (davr_gacha = nakopitelniy davri).
-- NULL ≠ 0: xarajat (P1 gacha) kiritilmagan → null; farq/foiz null. Subpudrat/O'tkazma — «hisoblanmagan» (ТРАНЗ egasi qarorigacha).
-- Ruxsat: a'zolik + f2.read + financial.read. Jadvalga yozmaydi.
begin;

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
  v_kesim jsonb; v_jami jsonb; v_zanjirlar jsonb := '[]'::jsonb; v_zanjir_jami jsonb := '{}'::jsonb;
  v_dalil jsonb := null; v_z jsonb; v_k text; v_n bigint; v_koef jsonb := null;
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

  with q as (
    select qq.id, qq.obyekt_id, qq.tur, qq.nom, qq.summa,
           case when qq.kat in ('ЧЕЛ','МАШ','МАТ','М/К','КАБ','БЕЗСКЛАД','ОБ') then qq.kat else 'KATSIZ' end as kk
      from public.t2_qator qq where qq.obyekt_id = any(v_obyektlar)
  ), f as (
    select q.kk,
      sum(q.summa) filter (where q.tur in ('rs','mat','ob')) as smeta,
      count(*) filter (where q.tur in ('rs','mat','ob') and q.summa is null) as smeta_nom,
      sum(x.f2) as f2, coalesce(sum(x.f2_nom), 0) as f2_nom
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
    group by q.kk
  ), r as (
    select k.kk, k.ota, k.tartib,
           coalesce(f.smeta, 0) as smeta, coalesce(f.smeta_nom, 0) as smeta_nom,
           coalesce(f.f2, 0) as f2, coalesce(f.f2_nom, 0) as f2_nom
      from (values ('ЧЕЛ',null,1),('МАШ',null,2),('МАТ_ODDIY','МАТ',3),('М/К','МАТ',4),('КАБ','МАТ',5),('БЕЗСКЛАД','МАТ',6),('ОБ',null,8),('KATSIZ',null,9)) k(kk, ota, tartib)
      left join f on f.kk = (case when k.kk = 'МАТ_ODDIY' then 'МАТ' else k.kk end)
  )
  select
    (select jsonb_agg(jsonb_build_object(
        'kat', kat, 'ota', ota, 'smeta_ustamasiz', smeta, 'smeta_nomalum', smeta_nom,
        'f2_yopilgan', f2, 'f2_nomalum', f2_nom,
        'xarajat', null, 'farq', null, 'farq_foiz', null, 'xarajat_holat', 'kiritilmagan') order by tartib)
       from (
         select kk as kat, ota, tartib, smeta, smeta_nom, f2, f2_nom from r where kk not in ('МАТ_ODDIY','М/К','КАБ','БЕЗСКЛАД')
         union all
         select 'МАТ', null, 3, sum(smeta), sum(smeta_nom), sum(f2), sum(f2_nom) from r where ota = 'МАТ'
         union all
         select kk, ota, tartib + 0.5, smeta, smeta_nom, f2, f2_nom from r where ota = 'МАТ'
       ) s(kat, ota, tartib, smeta, smeta_nom, f2, f2_nom)),
    jsonb_build_object(
      'smeta_ustamasiz', (select sum(smeta) from r), 'smeta_nomalum', (select sum(smeta_nom) from r),
      'f2_yopilgan', (select sum(f2) from r), 'f2_nomalum', (select sum(f2_nom) from r),
      'xarajat', null, 'farq', null, 'farq_foiz', null)
  into v_kesim, v_jami;

  -- Subpudrat / O'tkazma: hisoblanmagan (ТРАНЗ egasi qarorigacha; xarajat jadvali P1 da)
  v_kesim := v_kesim || jsonb_build_array(
    jsonb_build_object('kat','SUB','ota',null,'smeta_ustamasiz',null,'f2_yopilgan',null,'xarajat',null,'farq',null,'farq_foiz',null,'xarajat_holat','hisoblanmagan'),
    jsonb_build_object('kat','OTK','ota',null,'smeta_ustamasiz',null,'f2_yopilgan',null,'xarajat',null,'farq',null,'farq_foiz',null,'xarajat_holat','hisoblanmagan'));

  -- Koeffitsient zanjiri: faqat mavjud t2_obyekt_nakrutka_v1 natijasi (obyekt bo'yicha) + bosqichlar yig'indisi
  foreach v_n in array coalesce(v_obyektlar, '{}') loop
    v_z := public.t2_obyekt_nakrutka_v1(v_n, p_actor_id, p_shartnoma_id);
    if v_z->>'ok' = 'true' then
      v_zanjirlar := v_zanjirlar || jsonb_build_array(jsonb_build_object(
        'obyekt_id', v_n, 'shartnoma_id', v_z->'shartnoma_id', 'cats', v_z->'cats', 'nakrutka', v_z->'nakrutka'));
      if v_koef is null then v_koef := v_z->'koeffitsientlar'; end if;
      for v_k in select jsonb_object_keys(v_z->'nakrutka') loop
        v_zanjir_jami := jsonb_set(v_zanjir_jami, array[v_k],
          to_jsonb(coalesce((v_zanjir_jami->>v_k)::numeric, 0) + coalesce((v_z->'nakrutka'->>v_k)::numeric, 0)));
      end loop;
    end if;
  end loop;

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
                                 'manba', 't2_obyekt_nakrutka_v1'),
    'dalil_kat', p_dalil_kat, 'dalil', v_dalil);
end $fn$;

revoke all on function public.t2_pul_tahlil_v1(bigint, bigint, bigint, bigint, date, date, text) from public, anon, authenticated;
grant execute on function public.t2_pul_tahlil_v1(bigint, bigint, bigint, bigint, date, date, text) to service_role;

commit;
