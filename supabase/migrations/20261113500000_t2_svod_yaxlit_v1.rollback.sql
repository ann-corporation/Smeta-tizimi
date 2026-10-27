-- T2-SVOD-YAXLIT-V1 rollback: view va t2_obyekt_nakrutka_v1 20261113420000 (smeta podvali) holatiga qaytadi,
-- yangi funksiyalar va t2_svod_yaxlit jadvali olib tashlanadi. Belgilar (dalil bilan) yo'qoladi — kerak bo'lsa
-- avval nusxa: `create table backup.t2_svod_yaxlit_<sana> as table public.t2_svod_yaxlit;`
-- t2_qator, t2_akt_qator, F2 va podval ma'lumotlari tegilmaydi.

begin;

drop function if exists public.t2_svod_yaxlit_belgila_v1(bigint, bigint, bigint, numeric, numeric, jsonb, text, uuid);
drop function if exists public.t2_svod_yaxlit_ochir_v1(bigint, bigint, bigint, integer, text);

-- View ustunlari kamayadi (yaxlit, yaxlit_barglar) — create or replace yetmaydi; bog'liq view yo'q
-- (t2_nakopitelniy_v2 uni dinamik EXECUTE bilan o'qiydi).
drop view if exists public.t2_obyekt_nakrutka;
create view public.t2_obyekt_nakrutka as
with kat as (
  select q.obyekt_id,
    coalesce(sum(q.summa) filter (where q.kat = 'ЧЕЛ'), 0::numeric) as chel,
    coalesce(sum(q.summa) filter (where q.kat = 'МАШ'), 0::numeric) as mash,
    coalesce(sum(q.summa) filter (where q.kat in ('МАТ','М/К','КАБ','БЕЗСКЛАД')), 0::numeric) as mat,
    coalesce(sum(q.summa) filter (where q.kat = 'ОБ'), 0::numeric) as ob,
    coalesce(sum(q.summa) filter (where q.kat = 'М/К'), 0::numeric) as mk,
    coalesce(sum(q.summa) filter (where q.kat = 'КАБ'), 0::numeric) as kab,
    coalesce(sum(q.summa) filter (where q.kat = 'БЕЗСКЛАД'), 0::numeric) as bez
  from public.t2_qator q
  where q.tur in ('rs','mat','ob')
  group by q.obyekt_id
), bog as (
  select distinct on (b.obyekt_id) b.obyekt_id, b.shartnoma_id
  from public.t2_shartnoma_bog b
  join public.t2_shartnoma s on s.id = b.shartnoma_id
  where b.holat = 'faol' and s.holat <> 'bekor'
  order by b.obyekt_id, b.shartnoma_id
), effective as (
  select k.obyekt_id, b.shartnoma_id, k.chel, k.mash, k.mat, k.ob, k.mk, k.kab, k.bez,
    public.t2_nakrutka_default_v1()
      || coalesce(company.nk, '{}'::jsonb)
      || coalesce(contract.nk, '{}'::jsonb)
      || coalesce(podval.nk, '{}'::jsonb) as nk,
    case when podval.nk is not null and podval.nk <> '{}'::jsonb then 'smeta_podvali'
         when contract.nk is not null then 'shartnoma'
         when company.nk is not null then 'kompaniya'
         else 'sukut' end as nk_manba,
    case when podval.nk is not null and podval.nk <> '{}'::jsonb then podval.id end as nakrutka_podval_id
  from kat k
  join public.t2_obyekt o on o.id = k.obyekt_id
  left join bog b on b.obyekt_id = k.obyekt_id
  left join lateral (
    select jsonb_object_agg(n.koef_kod, to_jsonb(n.qiymat)) as nk
    from public.t2_nakrutka_koef n
    where n.kompaniya_id = o.kompaniya_id and n.shartnoma_id is null
  ) company on true
  left join lateral (
    select jsonb_object_agg(n.koef_kod, to_jsonb(n.qiymat)) as nk
    from public.t2_nakrutka_koef n
    where n.kompaniya_id = o.kompaniya_id and n.shartnoma_id = b.shartnoma_id
  ) contract on true
  left join lateral (
    select p.id, public.t2_nakrutka_podval_smeta_nk_v1(p.qatorlar) as nk
    from public.t2_nakrutka_podval p
    where p.obyekt_id = k.obyekt_id and p.kompaniya_id = o.kompaniya_id and p.faol
    order by p.id desc
    limit 1
  ) podval on true
), calc as (
  select e.*, public.t2_nakrutka_hisobla_v1(
    jsonb_build_object('chel',e.chel,'mash',e.mash,'mat',e.mat,'ob',e.ob,'mk',e.mk,'kab',e.kab,'bez',e.bez), e.nk) as h,
    public.t2_nakrutka_koef_jadval_v1(e.nk) as kf
  from effective e
)
select c.obyekt_id, c.shartnoma_id, c.chel, c.mash, c.mat, c.ob,
  (c.h ->> 'pryamye')::numeric as pryamye,
  (c.h ->> 'tr_mat')::numeric as tr_mat,
  (c.h ->> 'skl_mat')::numeric as skl_mat,
  (c.h ->> 'tr_kab')::numeric as tr_kab,
  (c.h ->> 'itogo1')::numeric as itogo1,
  (c.h ->> 'prochie')::numeric as prochie,
  (c.h ->> 'itogo2')::numeric as itogo2,
  (c.h ->> 'tr_ob')::numeric as tr_ob,
  (c.h ->> 'zag_ob')::numeric as zag_ob,
  (c.h ->> 'itogo3')::numeric as itogo3,
  (c.h ->> 'strax')::numeric as strax,
  (c.h ->> 'risk')::numeric as risk,
  (c.h ->> 'itogo4')::numeric as itogo4,
  (c.h ->> 'nds')::numeric as nds,
  (c.h ->> 'vsego')::numeric as vsego,
  (c.kf ->> 'ЧЕЛ')::numeric as kf_chel,
  (c.kf ->> 'МАШ')::numeric as kf_mash,
  (c.kf ->> 'МАТ')::numeric as kf_mat,
  (c.kf ->> 'ОБ')::numeric as kf_ob,
  (c.kf ->> 'М/К')::numeric as kf_mk,
  (c.kf ->> 'КАБ')::numeric as kf_kab,
  (c.kf ->> 'БЕЗСКЛАД')::numeric as kf_bezsklad,
  c.mk, c.kab,
  c.nk_manba,
  c.nakrutka_podval_id,
  c.nk as koeffitsientlar
from calc c;

comment on view public.t2_obyekt_nakrutka is
  'Obyekt nakrutka kaskadi. Koeffitsientlar: sukut → kompaniya → shartnoma → obyekt smeta podvali (t2_nakrutka_podval, manba=smeta). nk_manba — qaysi qatlam g''olib.';

create or replace function public.t2_obyekt_nakrutka_v1(
  p_obyekt_id bigint, p_actor_id bigint, p_shartnoma_id bigint default null)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare
  v_komp bigint; v_rol text; v_cats jsonb; v_nk_javob jsonb; v_shartnoma_id bigint := p_shartnoma_id;
  v_nk jsonb; v_podval_id bigint; v_podval_nk jsonb; v_manba text;
begin
  select kompaniya_id into v_komp from public.t2_obyekt where id = p_obyekt_id;
  if v_komp is null then return jsonb_build_object('ok',false,'code','OBYEKT_NOT_FOUND'); end if;
  v_rol := public.t2_actor_kompaniya_azo_tekshir(v_komp, p_actor_id);
  if v_shartnoma_id is null then
    select sb.shartnoma_id into v_shartnoma_id
    from public.t2_shartnoma_bog sb
    where sb.obyekt_id = p_obyekt_id and sb.holat = 'faol' limit 1;
  end if;

  select jsonb_build_object(
    'chel', coalesce(sum(summa) filter (where kat='ЧЕЛ'), 0),
    'mash', coalesce(sum(summa) filter (where kat='МАШ'), 0),
    'mat',  coalesce(sum(summa) filter (where kat in ('МАТ','М/К','КАБ','БЕЗСКЛАД')), 0),
    'ob',   coalesce(sum(summa) filter (where kat='ОБ'), 0),
    'mk',   coalesce(sum(summa) filter (where kat='М/К'), 0),
    'kab',  coalesce(sum(summa) filter (where kat='КАБ'), 0),
    'bez',  coalesce(sum(summa) filter (where kat='БЕЗСКЛАД'), 0))
  into v_cats
  from public.t2_qator
  where obyekt_id = p_obyekt_id and tur in ('rs','mat','ob');

  v_nk_javob := public.t2_nakrutka_koef_ol_v1(v_komp, p_actor_id, v_shartnoma_id);
  v_nk := v_nk_javob->'koeffitsientlar';
  v_manba := case when v_shartnoma_id is not null and exists (
                    select 1 from public.t2_nakrutka_koef n where n.kompaniya_id = v_komp and n.shartnoma_id = v_shartnoma_id) then 'shartnoma'
                  when exists (select 1 from public.t2_nakrutka_koef n where n.kompaniya_id = v_komp and n.shartnoma_id is null) then 'kompaniya'
                  else 'sukut' end;
  select p.id, public.t2_nakrutka_podval_smeta_nk_v1(p.qatorlar) into v_podval_id, v_podval_nk
  from public.t2_nakrutka_podval p
  where p.obyekt_id = p_obyekt_id and p.kompaniya_id = v_komp and p.faol
  order by p.id desc limit 1;
  if v_podval_nk is not null and v_podval_nk <> '{}'::jsonb then
    v_nk := v_nk || v_podval_nk;
    v_manba := 'smeta_podvali';
  else
    v_podval_id := null;
  end if;

  return jsonb_build_object('ok', true, 'obyekt_id', p_obyekt_id, 'shartnoma_id', v_shartnoma_id,
    'cats', v_cats, 'koeffitsientlar', v_nk,
    'nakrutka', public.t2_nakrutka_hisobla_v1(v_cats, v_nk),
    'jadval', public.t2_nakrutka_koef_jadval_v1(v_nk),
    'nk_manba', v_manba, 'nakrutka_podval_id', v_podval_id);
end $$;
revoke all on function public.t2_obyekt_nakrutka_v1(bigint,bigint,bigint) from public, anon, authenticated;
grant execute on function public.t2_obyekt_nakrutka_v1(bigint,bigint,bigint) to service_role;


revoke all on public.t2_obyekt_nakrutka from anon, authenticated;
grant all on public.t2_obyekt_nakrutka to service_role;

drop function if exists public.t2_nakrutka_yaxlit_qosh_v1(jsonb, numeric, numeric, jsonb);
drop function if exists public.t2_svod_yaxlit_obyekt_v1(bigint);
drop table if exists public.t2_svod_yaxlit;

commit;