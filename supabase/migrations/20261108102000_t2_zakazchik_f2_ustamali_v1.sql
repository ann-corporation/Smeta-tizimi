-- 20261108102000 - Buyurtmachi kabineti: har F2 akt uchun ikkita rasmiy raqam + hujjatdagi podval satrlari; taqdimlarga obyekt_id.
-- Egasi qoidasi (2026-10-24): har summa USTAMALI + ustamasiz, NDS siz. Buyurtmachi qog'ozdagi raqamlarni ko'radi:
--   pryamye  = «ИТОГО ПРЯМЫЕ» (ustamasiz; = t2_akt.hujjat_jami = sum(coalesce(certified_amount, summa)))
--   ustamali = podval itogo4 (NDS siz) + KATSIZ qatorlarning ustamasiz summasi (ustama o'ylab topilmaydi)
--   podval   = rasmiy hujjatdagi satrlar (tr_mat, skl_mat, ..., itogo4, nds, vsego) - FAQAT summalar
-- KO'RSATILMAYDI: ichki kategoriya koeffitsientlari (foizlar), marja, subpudrat narxlari, kategoriya bo'yicha bo'linma.
-- YANGI FORMULA YO'Q: mavjud t2_nakrutka_hisobla_v1 + t2_nakrutka_default_v1 + t2_nakrutka_koef (kompaniya -> shartnoma qatlami),
-- kategoriya qoidasi t2_pul_tahlil_v1 bilan aynan bir xil (ЧЕЛ/МАШ/МАТ/М/К/КАБ/БЕЗСКЛАД/ОБ; boshqasi KATSIZ).
-- Ruxsat o'zgarmaydi: t2_zakazchik_obyektlar_v1 allaqachon grant 'f2' (korish) bo'lsa shu bo'limni beradi.
-- t2_tomon_taqdimlar_v1: javobga 'obyekt_id' qo'shiladi (additiv).

create or replace function public._t2_f2_ustamali(p_kompaniya_id bigint, p_shartnoma_id bigint, p_akt_ids bigint[])
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_nk jsonb; v_cats jsonb; v_katsiz numeric; v_pryamye numeric; v_nom bigint; v_h jsonb; v_i4 numeric;
begin
  select public.t2_nakrutka_default_v1()
         || coalesce((select jsonb_object_agg(koef_kod, to_jsonb(qiymat)) from public.t2_nakrutka_koef where kompaniya_id = p_kompaniya_id and shartnoma_id is null), '{}'::jsonb)
         || coalesce((select jsonb_object_agg(koef_kod, to_jsonb(qiymat)) from public.t2_nakrutka_koef where kompaniya_id = p_kompaniya_id and shartnoma_id = p_shartnoma_id and p_shartnoma_id is not null), '{}'::jsonb)
    into v_nk;
  select jsonb_build_object(
           'chel', coalesce(sum(s) filter (where kat = 'ЧЕЛ'), 0), 'mash', coalesce(sum(s) filter (where kat = 'МАШ'), 0),
           'mat',  coalesce(sum(s) filter (where kat in ('МАТ','М/К','КАБ','БЕЗСКЛАД')), 0), 'ob', coalesce(sum(s) filter (where kat = 'ОБ'), 0),
           'mk',   coalesce(sum(s) filter (where kat = 'М/К'), 0), 'kab', coalesce(sum(s) filter (where kat = 'КАБ'), 0),
           'bez',  coalesce(sum(s) filter (where kat = 'БЕЗСКЛАД'), 0)),
         coalesce(sum(s) filter (where kat is null or kat not in ('ЧЕЛ','МАШ','МАТ','М/К','КАБ','БЕЗСКЛАД','ОБ')), 0),
         coalesce(sum(s), 0),
         count(*) filter (where s is null and ttur not in ('rz','bl') and q <> 0)
    into v_cats, v_katsiz, v_pryamye, v_nom
    from (select qq.kat, qq.tur as ttur, coalesce(aq.certified_amount, aq.summa) as s, coalesce(aq.certified_quantity, aq.hajm, 0) as q
            from public.t2_akt_qator aq
            join public.t2_qator qq on qq.id = aq.qator_id
            join public.t2_akt a on a.id = aq.akt_id
           where aq.akt_id = any(p_akt_ids) and a.kompaniya_id = p_kompaniya_id) z;
  v_h := public.t2_nakrutka_hisobla_v1(v_cats, v_nk);
  v_i4 := (v_h->>'itogo4')::numeric;
  return jsonb_build_object(
    'pryamye', round(v_pryamye, 2), 'katsiz', round(v_katsiz, 2), 'narxsiz_qator', v_nom,
    'ustamali', round(v_i4 + v_katsiz, 2),
    'podval', jsonb_build_object(
      'tr_mat', v_h->'tr_mat', 'skl_mat', v_h->'skl_mat', 'tr_kab', v_h->'tr_kab', 'itogo1', v_h->'itogo1', 'prochie', v_h->'prochie', 'itogo2', v_h->'itogo2',
      'tr_ob', v_h->'tr_ob', 'zag_ob', v_h->'zag_ob', 'itogo3', v_h->'itogo3', 'strax', v_h->'strax', 'risk', v_h->'risk', 'itogo4', v_h->'itogo4',
      'nds', v_h->'nds', 'vsego', v_h->'vsego'));
end $$;
revoke all on function public._t2_f2_ustamali(bigint, bigint, bigint[]) from public, anon, authenticated;
grant execute on function public._t2_f2_ustamali(bigint, bigint, bigint[]) to service_role;

create or replace function public.t2_zakazchik_obyektlar_v1(p_actor_id bigint, p_kompaniya_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v jsonb;
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'korish');
  select coalesce(jsonb_agg(x order by x->>'qarshi_nom', x->>'obyekt_nom'), '[]'::jsonb) into v from (
    select jsonb_build_object(
      'aloqa_id', a.id, 'qarshi_kompaniya_id', c.id, 'qarshi_nom', c.nom, 'qarshi_rol', case when a.taklif_kompaniya_id = p_kompaniya_id then a.qabul_rol else a.taklif_rol end,
      'obyekt_id', o.id, 'obyekt_nom', o.nom,
      'shartnoma', case when public.t2_tomon_ruxsat_bor(p_kompaniya_id, c.id, 'shartnoma_xulosa', 'korish', o.id) then (
          select jsonb_build_object('raqam', s.raqam, 'nom', s.nom, 'summa_bez_nds', s.summa_bez_nds, 'jami_nds_bilan', s.jami_nds_bilan)
            from public.t2_shartnoma s join public.t2_shartnoma_bog b on b.shartnoma_id = s.id and b.holat = 'faol'
           where b.obyekt_id = o.id and s.holat = 'faol' order by s.asosiy desc nulls last, s.id limit 1) end,
      'f2', case when public.t2_tomon_ruxsat_bor(p_kompaniya_id, c.id, 'f2', 'korish', o.id) then (
          select jsonb_build_object('soni', count(*), 'jami', coalesce(sum(t.hujjat_jami), 0), 'oxirgi_oy', max(t.oy),
                 'royxat', coalesce(jsonb_agg(jsonb_build_object('akt_id', t.id, 'raqam', t.raqam, 'oy', t.oy, 'jami', t.hujjat_jami,
                              'ustama', public._t2_f2_ustamali(c.id, coalesce(t.shartnoma_id, (select b2.shartnoma_id from public.t2_shartnoma_bog b2 where b2.obyekt_id = o.id and b2.holat = 'faol' order by b2.shartnoma_id limit 1)), array[t.id]))
                              order by t.oy desc nulls last, t.id desc), '[]'::jsonb),
                 'ustama_jami', case when count(*) > 0 then public._t2_f2_ustamali(c.id, (select b3.shartnoma_id from public.t2_shartnoma_bog b3 where b3.obyekt_id = o.id and b3.holat = 'faol' order by b3.shartnoma_id limit 1), array_agg(t.id)) end)
            from public.t2_akt t where t.obyekt_id = o.id and t.kompaniya_id = c.id and t.tur = 'f2' and t.lifecycle_status = 'approved') end,
      'kutayotgan_taqdim', (select count(*) from public.t2_tomon_taqdim q where q.obyekt_id = o.id and q.qabul_qiluvchi_kompaniya_id = p_kompaniya_id and q.holat in ('yuborilgan','ko_rilmoqda'))
    ) x
      from public.t2_tomon_aloqa a
      join public.t2_kompaniya c on c.id = public._t2_tomon_qarshi(a, p_kompaniya_id)
      join public.t2_obyekt o on o.kompaniya_id = c.id and o.holat = 'faol'
     where a.holat = 'faol' and (a.taklif_kompaniya_id = p_kompaniya_id or a.qabul_kompaniya_id = p_kompaniya_id)
       and public.t2_tomon_ruxsat_bor(p_kompaniya_id, c.id, 'obyekt_holat', 'korish', o.id)
  ) s;
  return v;
end $$;
revoke all on function public.t2_zakazchik_obyektlar_v1(bigint, bigint) from public, anon, authenticated;
grant execute on function public.t2_zakazchik_obyektlar_v1(bigint, bigint) to service_role;

create or replace function public.t2_tomon_taqdimlar_v1(p_actor_id bigint, p_kompaniya_id bigint, p_yonalish text, p_holat text, p_aloqa_id bigint, p_limit integer)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v jsonb; v_lim integer := least(greatest(coalesce(p_limit, 100), 1), 300);
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'korish');
  select coalesce(jsonb_agg(x order by (x->>'id')::bigint desc), '[]'::jsonb) into v from (
    select jsonb_build_object(
      'id', q.id, 'aloqa_id', q.aloqa_id, 'resurs', q.resurs, 'nom', q.nom, 'oy', q.oy, 'summa', q.summa, 'holat', q.holat,
      'kelgan', q.qabul_qiluvchi_kompaniya_id = p_kompaniya_id,
      'qarshi_nom', (select k.nom from public.t2_kompaniya k where k.id = case when q.qabul_qiluvchi_kompaniya_id = p_kompaniya_id then q.taqdim_etuvchi_kompaniya_id else q.qabul_qiluvchi_kompaniya_id end),
      'obyekt_id', q.obyekt_id,
      'obyekt_nom', (select o.nom from public.t2_obyekt o where o.id = q.obyekt_id),
      'manba_jadval', q.manba_jadval, 'manba_id', q.manba_id,
      'taqdim_vaqti', q.taqdim_vaqti, 'qaror_vaqti', q.qaror_vaqti, 'qaror_izoh', q.qaror_izoh, 'oldingi_taqdim_id', q.oldingi_taqdim_id) x
      from public.t2_tomon_taqdim q
     where ((p_yonalish = 'kelgan' and q.qabul_qiluvchi_kompaniya_id = p_kompaniya_id)
         or (p_yonalish = 'yuborilgan' and q.taqdim_etuvchi_kompaniya_id = p_kompaniya_id)
         or (coalesce(p_yonalish, '') not in ('kelgan','yuborilgan') and (q.qabul_qiluvchi_kompaniya_id = p_kompaniya_id or q.taqdim_etuvchi_kompaniya_id = p_kompaniya_id)))
       and (p_holat is null or p_holat = '' or q.holat = p_holat)
       and (p_aloqa_id is null or q.aloqa_id = p_aloqa_id)
     order by q.id desc limit v_lim
  ) s;
  return v;
end $$;
revoke all on function public.t2_tomon_taqdimlar_v1(bigint, bigint, text, text, bigint, integer) from public, anon, authenticated;
grant execute on function public.t2_tomon_taqdimlar_v1(bigint, bigint, text, text, bigint, integer) to service_role;
