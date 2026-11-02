-- T2-SVOD-YAXLIT-V1 (egasi 2026-10-27): svoddagi «письмо заказчика» / ekspertiza svodi YAXLIT summalariga
-- ustama HISOBLANMAYDI — summa svodning o'zidan ma'lum.
--
-- Muammo (Codex C1, 26.10): obyekt 153 (Magic Fun 950874, Bio Art 950877) va 152 (Stella 950967/950968/950969)
-- bo'limlari ekspertiza svodida QQS bilan yakuniy summa, tizimda esa resurs daraxti — umumiy kaskad ularga yana
-- transport/sklad/прочие/sug'urta + QQS qo'shadi (Magic Fun +3,62 mlrd, Bio Art +4,59 mlrd svoddan ortiq).
--
-- Yechim (mavjud modelni kengaytiradi, parallel kaskad YO'Q):
--   * `t2_svod_yaxlit` — bo'lim darajasidagi belgi (rz/bl qator) + dalil: svod summasi (QQS bilan, so'm),
--     QQS stavkasi, fayl/varaq/katak. qoshimcha/change_type TEGILMAYDI (C1 ogohlantirishlari — alohida qaror).
--   * Belgilangan bo'lim avlodlari kategoriya summalaridan (`t2_nakrutka_hisobla_v1` kirishi) CHIQARILADI;
--     bo'lim summasi ustamasiz «yaxlit (svoddan, QQS siz)» qatori sifatida ИТОГО-4 ga qo'shiladi, QQS faqat
--     oxirida bir marta: itogo4 = kaskad_itogo4 + yaxlit; nds = itogo4 × НДС%; vsego = itogo4 + nds.
--     yaxlit = svod_summa / (1 + qqs_stavka/100) (dalil bo'lsa), aks holda bo'lim barglari + bolasiz bl summasi.
--   * `pryamye` (to'g'ri xarajat, ustamasiz) — avvalgidek obyektning BARCHA barglari (object.jami bilan teng).
--   * Ta'sir: `t2_obyekt_nakrutka` view (Nakopitelniy `smeta_nakrutka`) va `t2_obyekt_nakrutka_v1` (Nakrutka
--     sahifasi, ustamali summa, pul tahlili). `cats` kaliti o'zgarmaydi; belgi bo'lsa qo'shimcha `cats_kaskad`
--     va `svod_yaxlit` kalitlari qo'shiladi.
--   * F2: `_t2_f2_ustamali`, t2_akt_qator, nakopitelniy F2 summalari TEGILMAYDI — tasdiqlangan F2 o'zgarmaydi.
--
-- INVARIANT: faol belgisi yo'q obyektlarda view qatorlari va RPC javobi AYNAN avvalgidek (acceptance).
-- Additiv; belgilash faqat `t2_svod_yaxlit_belgila_v1` orqali (actor + ruxsat + operation_id + dalil).
-- PRODGA bu PR'dan qo'llanmaydi — PR tavsifidagi tartib bilan, egasi tasdig'idan keyin.

begin;

create table if not exists public.t2_svod_yaxlit (
  id bigserial primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id) on delete cascade,
  obyekt_id bigint not null references public.t2_obyekt(id) on delete cascade,
  qator_id bigint not null references public.t2_qator(id) on delete cascade,
  svod_summa numeric(20,2),
  qqs_stavka numeric(6,3),
  dalil jsonb not null default '{}'::jsonb,
  sabab text not null,
  faol boolean not null default true,
  versiya integer not null default 1,
  actor_id bigint,
  operation_id uuid unique,
  yaratildi timestamptz not null default now(),
  yangilandi timestamptz not null default now(),
  ochirdi_actor_id bigint,
  ochirish_sabab text,
  constraint t2_svod_yaxlit_svod_juft check ((svod_summa is null) = (qqs_stavka is null)),
  constraint t2_svod_yaxlit_svod_musbat check (svod_summa is null or svod_summa >= 0),
  constraint t2_svod_yaxlit_qqs_oraliq check (qqs_stavka is null or (qqs_stavka >= 0 and qqs_stavka < 100)),
  constraint t2_svod_yaxlit_dalil_obj check (jsonb_typeof(dalil) = 'object'),
  constraint t2_svod_yaxlit_sabab_bor check (length(btrim(sabab)) > 0)
);
create unique index if not exists t2_svod_yaxlit_faol_uq on public.t2_svod_yaxlit (qator_id) where faol;
create index if not exists t2_svod_yaxlit_obyekt_idx on public.t2_svod_yaxlit (obyekt_id) where faol;
alter table public.t2_svod_yaxlit enable row level security;
revoke all on public.t2_svod_yaxlit from anon, authenticated;
revoke all on sequence public.t2_svod_yaxlit_id_seq from anon, authenticated;
comment on table public.t2_svod_yaxlit is
  'Svod yaxlit bo''limi (egasi 2026-10-27): belgilangan qator avlodlari ustama kaskadidan chiqariladi, summasi ustamasiz (QQS siz) ИТОГО-4 ga qo''shiladi. qoshimcha/change_type ga tegmaydi.';

-- Obyektdagi faol yaxlit bo'limlar xulosasi: null — belgi yo'q (invariant: natija o'zgarmaydi).
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

-- Kaskad natijasiga yaxlit qatorini qo'shish (IMMUTABLE, yangi formula emas — faqat ИТОГО-4 dan keyingi qadam).
-- p_qqssiz null bo'lsa natija AYNAN p_h (invariant).
create or replace function public.t2_nakrutka_yaxlit_qosh_v1(p_h jsonb, p_qqssiz numeric, p_barglar numeric, p_nk jsonb)
returns jsonb language plpgsql immutable parallel safe set search_path = public, pg_temp as $$
declare v_i4 numeric; v_nds numeric; k_nds numeric := coalesce((p_nk->>'НДС')::numeric, 0);
begin
  if p_h is null or p_qqssiz is null then return p_h; end if;
  v_i4 := round((p_h->>'itogo4')::numeric + p_qqssiz, 2);
  v_nds := round(v_i4 * k_nds / 100, 2);
  return p_h || jsonb_build_object(
    'kaskad_pryamye', p_h->'pryamye',
    'kaskad_itogo4', p_h->'itogo4',
    'pryamye', round((p_h->>'pryamye')::numeric + coalesce(p_barglar, 0), 2),
    'yaxlit', round(p_qqssiz, 2),
    'yaxlit_barglar', round(coalesce(p_barglar, 0), 2),
    'itogo4', v_i4, 'nds', v_nds, 'vsego', round(v_i4 + v_nds, 2));
end $$;
revoke all on function public.t2_nakrutka_yaxlit_qosh_v1(jsonb, numeric, numeric, jsonb) from public, anon, authenticated;
grant execute on function public.t2_nakrutka_yaxlit_qosh_v1(jsonb, numeric, numeric, jsonb) to service_role;

-- View: kategoriyalar yaxlit avlodlarisiz; yaxlit — ИТОГО-4 ga. Ustunlar oxiriga: yaxlit, yaxlit_barglar.
create or replace view public.t2_obyekt_nakrutka as
with recursive yr as (
  select y.id as bolim_id, y.obyekt_id, y.qator_id as id
  from public.t2_svod_yaxlit y where y.faol
  union all
  select yr.bolim_id, yr.obyekt_id, q.id from public.t2_qator q join yr on q.ota_id = yr.id
), yq as (
  select distinct yr.id from yr
), kat as (
  select q.obyekt_id,
    coalesce(sum(q.summa) filter (where q.kat = 'ЧЕЛ' and yq.id is null), 0::numeric) as chel,
    coalesce(sum(q.summa) filter (where q.kat = 'МАШ' and yq.id is null), 0::numeric) as mash,
    coalesce(sum(q.summa) filter (where q.kat in ('МАТ','М/К','КАБ','БЕЗСКЛАД') and yq.id is null), 0::numeric) as mat,
    coalesce(sum(q.summa) filter (where q.kat = 'ОБ' and yq.id is null), 0::numeric) as ob,
    coalesce(sum(q.summa) filter (where q.kat = 'М/К' and yq.id is null), 0::numeric) as mk,
    coalesce(sum(q.summa) filter (where q.kat = 'КАБ' and yq.id is null), 0::numeric) as kab,
    coalesce(sum(q.summa) filter (where q.kat = 'БЕЗСКЛАД' and yq.id is null), 0::numeric) as bez
  from public.t2_qator q
  left join yq on yq.id = q.id
  where q.tur in ('rs','mat','ob')
  group by q.obyekt_id
), yax as (
  select o.obyekt_id, (o.x->>'qqssiz')::numeric as qqssiz, (o.x->>'barglar')::numeric as barglar
  from (select distinct y.obyekt_id, public.t2_svod_yaxlit_obyekt_v1(y.obyekt_id) as x
        from public.t2_svod_yaxlit y where y.faol) o
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
  select e.*, y.qqssiz as yaxlit, y.barglar as yaxlit_barglar,
    public.t2_nakrutka_yaxlit_qosh_v1(public.t2_nakrutka_hisobla_v1(
      jsonb_build_object('chel',e.chel,'mash',e.mash,'mat',e.mat,'ob',e.ob,'mk',e.mk,'kab',e.kab,'bez',e.bez), e.nk),
      y.qqssiz, y.barglar, e.nk) as h,
    public.t2_nakrutka_koef_jadval_v1(e.nk) as kf
  from effective e
  left join yax y on y.obyekt_id = e.obyekt_id
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
  c.nk as koeffitsientlar,
  c.yaxlit,
  c.yaxlit_barglar
from calc c;

comment on view public.t2_obyekt_nakrutka is
  'Obyekt nakrutka kaskadi. Koeffitsientlar: sukut → kompaniya → shartnoma → obyekt smeta podvali. Svod yaxlit bo''limlari (t2_svod_yaxlit) kategoriyalardan chiqariladi va ustamasiz ИТОГО-4 ga qo''shiladi (yaxlit); QQS bir marta.';

create or replace function public.t2_obyekt_nakrutka_v1(
  p_obyekt_id bigint, p_actor_id bigint, p_shartnoma_id bigint default null)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare
  v_komp bigint; v_rol text; v_cats jsonb; v_nk_javob jsonb; v_shartnoma_id bigint := p_shartnoma_id;
  v_nk jsonb; v_podval_id bigint; v_podval_nk jsonb; v_manba text;
  v_yax jsonb; v_cats_kaskad jsonb; v_javob jsonb;
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

  v_yax := public.t2_svod_yaxlit_obyekt_v1(p_obyekt_id);
  if v_yax is null then
    -- Belgi yo'q: javob AYNAN avvalgidek (invariant).
    return jsonb_build_object('ok', true, 'obyekt_id', p_obyekt_id, 'shartnoma_id', v_shartnoma_id,
      'cats', v_cats, 'koeffitsientlar', v_nk,
      'nakrutka', public.t2_nakrutka_hisobla_v1(v_cats, v_nk),
      'jadval', public.t2_nakrutka_koef_jadval_v1(v_nk),
      'nk_manba', v_manba, 'nakrutka_podval_id', v_podval_id);
  end if;

  with recursive yr as (
    select y.qator_id as id from public.t2_svod_yaxlit y where y.obyekt_id = p_obyekt_id and y.faol
    union
    select q.id from public.t2_qator q join yr on q.ota_id = yr.id
  )
  select jsonb_build_object(
    'chel', coalesce(sum(summa) filter (where kat='ЧЕЛ'), 0),
    'mash', coalesce(sum(summa) filter (where kat='МАШ'), 0),
    'mat',  coalesce(sum(summa) filter (where kat in ('МАТ','М/К','КАБ','БЕЗСКЛАД')), 0),
    'ob',   coalesce(sum(summa) filter (where kat='ОБ'), 0),
    'mk',   coalesce(sum(summa) filter (where kat='М/К'), 0),
    'kab',  coalesce(sum(summa) filter (where kat='КАБ'), 0),
    'bez',  coalesce(sum(summa) filter (where kat='БЕЗСКЛАД'), 0))
  into v_cats_kaskad
  from public.t2_qator q
  where q.obyekt_id = p_obyekt_id and q.tur in ('rs','mat','ob')
    and not exists (select 1 from yr where yr.id = q.id);

  v_javob := jsonb_build_object('ok', true, 'obyekt_id', p_obyekt_id, 'shartnoma_id', v_shartnoma_id,
    'cats', v_cats, 'cats_kaskad', v_cats_kaskad, 'koeffitsientlar', v_nk,
    'nakrutka', public.t2_nakrutka_yaxlit_qosh_v1(public.t2_nakrutka_hisobla_v1(v_cats_kaskad, v_nk),
                  (v_yax->>'qqssiz')::numeric, (v_yax->>'barglar')::numeric, v_nk),
    'jadval', public.t2_nakrutka_koef_jadval_v1(v_nk),
    'nk_manba', v_manba, 'nakrutka_podval_id', v_podval_id,
    'svod_yaxlit', v_yax);
  return v_javob;
end $$;
revoke all on function public.t2_obyekt_nakrutka_v1(bigint,bigint,bigint) from public, anon, authenticated;
grant execute on function public.t2_obyekt_nakrutka_v1(bigint,bigint,bigint) to service_role;

-- Belgilash: faqat narx.write ruxsati bilan; dalil majburiy; ota/avlodda faol belgi bo'lsa — rad (ikki marta hisob yo'q).
create or replace function public.t2_svod_yaxlit_belgila_v1(
  p_kompaniya_id bigint, p_actor_id bigint, p_qator_id bigint,
  p_svod_summa numeric, p_qqs_stavka numeric, p_dalil jsonb, p_sabab text, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_rol text; v_q record; v_id bigint; v_bor record;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select * into v_bor from public.t2_svod_yaxlit where operation_id = p_operation_id;
  if v_bor.id is not null then
    if v_bor.qator_id <> p_qator_id or v_bor.kompaniya_id <> p_kompaniya_id then
      return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REUSED');
    end if;
    return jsonb_build_object('ok', true, 'id', v_bor.id, 'versiya', v_bor.versiya, 'takror', true);
  end if;

  v_rol := public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'narx.write');

  select q.id, q.obyekt_id, q.tur, q.kompaniya_id into v_q from public.t2_qator q
  where q.id = p_qator_id and q.kompaniya_id = p_kompaniya_id for share;
  if v_q.id is null then return jsonb_build_object('ok', false, 'code', 'QATOR_NOT_FOUND'); end if;
  if v_q.tur not in ('rz', 'bl') then return jsonb_build_object('ok', false, 'code', 'QATOR_BOLIM_EMAS'); end if;
  if p_sabab is null or length(btrim(p_sabab)) = 0 then return jsonb_build_object('ok', false, 'code', 'SABAB_REQUIRED'); end if;
  if p_dalil is null or jsonb_typeof(p_dalil) <> 'object' or p_dalil = '{}'::jsonb then
    return jsonb_build_object('ok', false, 'code', 'DALIL_REQUIRED');
  end if;
  if (p_svod_summa is null) <> (p_qqs_stavka is null) then return jsonb_build_object('ok', false, 'code', 'SVOD_SUMMA_QQS_JUFT'); end if;
  if p_svod_summa is not null and (p_svod_summa < 0 or p_qqs_stavka < 0 or p_qqs_stavka >= 100) then
    return jsonb_build_object('ok', false, 'code', 'SVOD_SUMMA_NOTOGRI');
  end if;
  -- Ota-bobolarda yoki avlodlarda faol belgi bo'lmasin (yaxlit summa ikki marta qo'shilmaydi).
  if exists (
    with recursive ota as (
      select q.ota_id as id from public.t2_qator q where q.id = p_qator_id
      union all select q.ota_id from public.t2_qator q join ota on q.id = ota.id where q.ota_id is not null
    ) select 1 from ota join public.t2_svod_yaxlit y on y.qator_id = ota.id and y.faol
  ) or exists (
    with recursive av as (
      select q.id from public.t2_qator q where q.ota_id = p_qator_id
      union all select q.id from public.t2_qator q join av on q.ota_id = av.id
    ) select 1 from av join public.t2_svod_yaxlit y on y.qator_id = av.id and y.faol
  ) then
    return jsonb_build_object('ok', false, 'code', 'ICHMA_ICH_BELGI');
  end if;

  insert into public.t2_svod_yaxlit (kompaniya_id, obyekt_id, qator_id, svod_summa, qqs_stavka, dalil, sabab, actor_id, operation_id)
  values (p_kompaniya_id, v_q.obyekt_id, p_qator_id, p_svod_summa, p_qqs_stavka, p_dalil, btrim(p_sabab), p_actor_id, p_operation_id)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'versiya', 1);
exception when unique_violation then
  return jsonb_build_object('ok', false, 'code', 'ALLAQACHON_BELGILANGAN');
end $$;
revoke all on function public.t2_svod_yaxlit_belgila_v1(bigint, bigint, bigint, numeric, numeric, jsonb, text, uuid) from public, anon, authenticated;
grant execute on function public.t2_svod_yaxlit_belgila_v1(bigint, bigint, bigint, numeric, numeric, jsonb, text, uuid) to service_role;

-- Belgini olib tashlash (faolsizlantirish, tarix qatorda qoladi) — kaskad avvalgi holatiga qaytadi.
create or replace function public.t2_svod_yaxlit_ochir_v1(
  p_kompaniya_id bigint, p_actor_id bigint, p_id bigint, p_kutilgan_versiya integer, p_sabab text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_rol text; v_eski record;
begin
  v_rol := public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'narx.write');
  if p_sabab is null or length(btrim(p_sabab)) = 0 then return jsonb_build_object('ok', false, 'code', 'SABAB_REQUIRED'); end if;
  select * into v_eski from public.t2_svod_yaxlit where id = p_id and kompaniya_id = p_kompaniya_id and faol for update;
  if v_eski.id is null then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if p_kutilgan_versiya is null or p_kutilgan_versiya <> v_eski.versiya then
    return jsonb_build_object('ok', false, 'code', 'VERSIYA', 'bordagi_versiya', v_eski.versiya);
  end if;
  update public.t2_svod_yaxlit set faol = false, versiya = versiya + 1, yangilandi = now(),
    ochirdi_actor_id = p_actor_id, ochirish_sabab = btrim(p_sabab)
  where id = p_id;
  return jsonb_build_object('ok', true, 'id', p_id, 'versiya', v_eski.versiya + 1);
end $$;
revoke all on function public.t2_svod_yaxlit_ochir_v1(bigint, bigint, bigint, integer, text) from public, anon, authenticated;
grant execute on function public.t2_svod_yaxlit_ochir_v1(bigint, bigint, bigint, integer, text) to service_role;

commit;
