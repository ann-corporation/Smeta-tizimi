-- ROLLBACK 20261114600000_t2_rahbar_panel_v1: yangi funksiyalar olib tashlanadi, `_t2_f2_ustamali` va
-- `t2_svod_yaxlit_obyekt_v1` avvalgi tanasiga qaytadi. Subpudrat/ustamasiz belgilari FAOLSIZLANTIRILADI (tarix qatorda
-- qoladi), keyin yangi ustunlar olib tashlanadi — svod belgilari (turi='svod') o'zgarmaydi.
begin;

drop function if exists public.t2_rahbar_panel_v1(bigint, bigint, date, date, bigint);
drop function if exists public._t2_summa_paket_v1(bigint[], text, bigint[], date, date);
drop function if exists public._t2_summa_agg_v1(bigint[], text, bigint[], date, date);
drop function if exists public._t2_summa_paket_jam_v1(jsonb);
drop function if exists public._t2_summa_paket_hisob_v1(jsonb, jsonb);
drop function if exists public._t2_obyekt_nk_v1(bigint);
drop function if exists public.t2_ustamasiz_belgila_v1(bigint, bigint, bigint, text, bigint, text, text, jsonb, uuid);

-- Avvalgi F2 ustamali (shartnoma/kompaniya koef'i) — 20261113500000 holatidagi tana.
CREATE OR REPLACE FUNCTION public._t2_f2_ustamali(p_kompaniya_id bigint, p_shartnoma_id bigint, p_akt_ids bigint[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
end $function$;
revoke all on function public._t2_f2_ustamali(bigint, bigint, bigint[]) from public, anon, authenticated;
grant execute on function public._t2_f2_ustamali(bigint, bigint, bigint[]) to service_role;

create or replace function public.t2_svod_yaxlit_obyekt_v1(p_obyekt_id bigint)
returns jsonb language sql stable set search_path = public, pg_temp as $$
  with recursive yr as (
    select y.id as bolim_id, y.qator_id as id
    from public.t2_svod_yaxlit y where y.obyekt_id = p_obyekt_id and y.faol
    union all
    select yr.bolim_id, q.id from public.t2_qator q join yr on q.ota_id = yr.id
  ), b as (
    select y.id, y.qator_id, y.svod_summa, y.qqs_stavka, y.dalil,
      coalesce(sum(q.summa) filter (where q.tur in ('rs','mat','ob')), 0) as barglar,
      count(*) filter (where q.tur in ('rs','mat','ob') and q.summa is null) as summasiz,
      coalesce(sum(q.summa) filter (where q.tur = 'bl' and not exists (select 1 from public.t2_qator c where c.ota_id = q.id)), 0) as yaxlit_ish
    from public.t2_svod_yaxlit y
    join yr on yr.bolim_id = y.id
    join public.t2_qator q on q.id = yr.id
    group by y.id, y.qator_id, y.svod_summa, y.qqs_stavka, y.dalil
  ), bq as (
    select b.*, case when b.svod_summa is not null then round(b.svod_summa / (1 + b.qqs_stavka / 100), 2)
                     else round(b.barglar + b.yaxlit_ish, 2) end as qqssiz
    from b
  )
  select case when count(*) = 0 then null else jsonb_build_object(
    'qqssiz', round(sum(qqssiz), 2),
    'barglar', round(sum(barglar), 2),
    'summasiz', sum(summasiz),
    'bolimlar', jsonb_agg(jsonb_build_object(
      'id', bq.id, 'qator_id', bq.qator_id, 'nom', (select q.nom from public.t2_qator q where q.id = bq.qator_id),
      'svod_summa', bq.svod_summa, 'qqs_stavka', bq.qqs_stavka, 'qqssiz', bq.qqssiz, 'barglar', round(bq.barglar, 2),
      'asos', case when bq.svod_summa is not null then 'svod' else 'barglar' end, 'dalil', bq.dalil) order by bq.qator_id)) end
  from bq;
$$;
revoke all on function public.t2_svod_yaxlit_obyekt_v1(bigint) from public, anon, authenticated;
grant execute on function public.t2_svod_yaxlit_obyekt_v1(bigint) to service_role;

update public.t2_svod_yaxlit
   set faol = false, versiya = versiya + 1, yangilandi = now(), ochirish_sabab = coalesce(ochirish_sabab, 'rollback 20261114600000')
 where faol and turi <> 'svod';
alter table public.t2_svod_yaxlit drop constraint if exists t2_svod_yaxlit_svod_faqat_chk;
alter table public.t2_svod_yaxlit drop constraint if exists t2_svod_yaxlit_turi_chk;
alter table public.t2_svod_yaxlit drop column if exists kontragent_nom;
alter table public.t2_svod_yaxlit drop column if exists kontragent_id;
alter table public.t2_svod_yaxlit drop column if exists turi;

commit;
