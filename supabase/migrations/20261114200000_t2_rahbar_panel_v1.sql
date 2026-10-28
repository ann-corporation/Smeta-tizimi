-- 20261114200000 — RAHBAR PANELI v1 + YAGONA SUMMA PAKETI (issue #195, egasi 2026-10-29).
--
-- Egasi: «tizimda summalar bir tizimda emas — qayerdadir NDS bilan, qayerdadir прямые, qayerdadir NDS siz».
-- Yechim — bitta hisob yo'li (DUBLIKAT FORMULA YO'Q, mavjud kaskad qayta ishlatiladi):
--   1) Qator → kesim: smeta podvali kaskadiga kiradigan kategoriyalar (ЧЕЛ/МАШ/МАТ/ОБ) va USTAMASIZ qismlar
--      (svod «письмо» yaxlit bo'limi, subpudrat / maxsus ishlar, bojxona kabi ustamasiz qatorlar, kat noma'lum).
--   2) Kaskad — `t2_nakrutka_hisobla_v1` (o'zgarmaydi), koeffitsientlar `t2_obyekt_nakrutka` view bilan AYNAN bir xil
--      tartibda: sukut → kompaniya → shartnoma → obyekt SMETA PODVALI (egasi qoidasi «nakrutka har doim smeta podvalidan»).
--   3) Ustamasiz qism ИТОГО-4 ga qo'shiladi, QQS faqat oxirida bir marta (`t2_nakrutka_yaxlit_qosh_v1`, o'zgarmaydi).
--   Natija — «summa paketi»: qqs_bilan (to'lovga) · ustamali (QQS siz, ИТОГО-4) · ustamasiz (прямые) + kesim + soat.
--   INVARIANT: Σ kesim = ustamasiz (прямые).
--
-- Subpudrat / ustamasiz belgisi — mavjud `t2_svod_yaxlit` mexanizmi KENGAYTIRILADI (parallel jadval yo'q): `turi`
--   ('svod' | 'subpudrat' | 'ustamasiz') + kontragent. View `t2_obyekt_nakrutka` va `t2_obyekt_nakrutka_v1` ularni
--   allaqachon ustamasiz hisoblaydi (svod_summa null → bo'lim barglari). Belgilash — `t2_ustamasiz_belgila_v1`
--   (narx.write), olib tashlash — mavjud `t2_svod_yaxlit_ochir_v1`.
--
-- F2: `_t2_f2_ustamali` endi eski shartnoma/kompaniya koef'i EMAS, obyekt smeta podvali kaskadi bilan hisoblaydi
--   (subpudrat/bojxona/«письмо» qatorlari ustamasiz). Javob kalitlari saqlanadi (sverka, zakazchik chaqiruvchilari).
--   F2 summasi — TIZIMGA IMPORT QILINGAN F2 QATORLARIDAN; `t2_f2_reestr_jami` (qo'lda reestr) manba EMAS — faqat
--   «tizim ↔ reestr farqi» signali.
--
-- Rahbar paneli `t2_rahbar_panel_v1` — §1 kartalar, §2 pul oqimi, §3 obyektlar, §4 diqqat (top-10), §5 tasdiq navbati.
--   NULL ≠ 0: to'lov/xarajat/tannarx kiritilmagan bo'lsa qiymat null + `manbalar_yoq` (uydirma yo'q).
--   `t2_boss_dashboard_v1` xatolari takrorlanmaydi: faqat tur='f2'; coalesce(...,0) yo'q; signallar guruhlangan.
--
-- Xavfsizlik: barcha funksiyalar faqat service_role; o'qish — a'zolik + financial.read; yozish — narx.write.
-- Additiv; prodga faqat L0 qo'llaydi (BEGIN..ROLLBACK acceptance bilan).

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. t2_svod_yaxlit: turi + kontragent (mavjud qatorlar 'svod' bo'lib qoladi — natija o'zgarmaydi)
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.t2_svod_yaxlit add column if not exists turi text not null default 'svod';
alter table public.t2_svod_yaxlit add column if not exists kontragent_id bigint references public.t2_kontragent(id) on delete set null;
alter table public.t2_svod_yaxlit add column if not exists kontragent_nom text;
do $do$
begin
  if not exists (select 1 from pg_constraint where conname = 't2_svod_yaxlit_turi_chk') then
    alter table public.t2_svod_yaxlit add constraint t2_svod_yaxlit_turi_chk check (turi in ('svod','subpudrat','ustamasiz'));
  end if;
  -- Svod summasi (QQS bilan, svoddan) faqat «svod» turida; subpudrat/ustamasiz — doim qatorlar summasi.
  if not exists (select 1 from pg_constraint where conname = 't2_svod_yaxlit_svod_faqat_chk') then
    alter table public.t2_svod_yaxlit add constraint t2_svod_yaxlit_svod_faqat_chk check (turi = 'svod' or svod_summa is null);
  end if;
end $do$;
comment on column public.t2_svod_yaxlit.turi is
  'svod — svod/«письмо» yaxlit bo''limi; subpudrat — subpudratchi / maxsus ish (kontragent bilan); ustamasiz — bojxona va h.k. Hammasi ustamasiz (ИТОГО-4 ga), QQS bir marta.';

-- Mavjud xulosa funksiyasi: faqat yangi kalitlar (turi, kontragent_nom) qo'shiladi — qolgan javob AYNAN avvalgidek.
create or replace function public.t2_svod_yaxlit_obyekt_v1(p_obyekt_id bigint)
returns jsonb language sql stable set search_path = public, pg_temp as $$
  with recursive yr as (
    select y.id as bolim_id, y.qator_id as id
    from public.t2_svod_yaxlit y where y.obyekt_id = p_obyekt_id and y.faol
    union all
    select yr.bolim_id, q.id from public.t2_qator q join yr on q.ota_id = yr.id
  ), b as (
    select y.id, y.qator_id, y.svod_summa, y.qqs_stavka, y.dalil, y.turi, y.kontragent_nom,
      coalesce(sum(q.summa) filter (where q.tur in ('rs','mat','ob')), 0) as barglar,
      count(*) filter (where q.tur in ('rs','mat','ob') and q.summa is null) as summasiz,
      coalesce(sum(q.summa) filter (where q.tur = 'bl' and not exists (select 1 from public.t2_qator c where c.ota_id = q.id)), 0) as yaxlit_ish
    from public.t2_svod_yaxlit y
    join yr on yr.bolim_id = y.id
    join public.t2_qator q on q.id = yr.id
    group by y.id, y.qator_id, y.svod_summa, y.qqs_stavka, y.dalil, y.turi, y.kontragent_nom
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
      'asos', case when bq.svod_summa is not null then 'svod' else 'barglar' end, 'dalil', bq.dalil,
      'turi', bq.turi, 'kontragent_nom', bq.kontragent_nom) order by bq.qator_id)) end
  from bq;
$$;
revoke all on function public.t2_svod_yaxlit_obyekt_v1(bigint) from public, anon, authenticated;
grant execute on function public.t2_svod_yaxlit_obyekt_v1(bigint) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Subpudrat / ustamasiz belgilash (operator). Har qanday qator (bo'lim, blok yoki resurs qatori).
--    Ota/avlodda faol belgi bo'lsa — rad (ikki marta hisob yo'q). Olib tashlash — t2_svod_yaxlit_ochir_v1.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.t2_ustamasiz_belgila_v1(
  p_kompaniya_id bigint, p_actor_id bigint, p_qator_id bigint, p_turi text,
  p_kontragent_id bigint, p_kontragent_nom text, p_sabab text, p_dalil jsonb, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_q record; v_id bigint; v_bor record; v_knom text;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select * into v_bor from public.t2_svod_yaxlit where operation_id = p_operation_id;
  if v_bor.id is not null then
    if v_bor.qator_id <> p_qator_id or v_bor.kompaniya_id <> p_kompaniya_id then
      return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REUSED');
    end if;
    return jsonb_build_object('ok', true, 'id', v_bor.id, 'versiya', v_bor.versiya, 'takror', true);
  end if;

  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'narx.write');

  if p_turi is null or p_turi not in ('subpudrat', 'ustamasiz') then return jsonb_build_object('ok', false, 'code', 'TURI_NOTOGRI'); end if;
  if p_sabab is null or length(btrim(p_sabab)) = 0 then return jsonb_build_object('ok', false, 'code', 'SABAB_REQUIRED'); end if;
  if p_dalil is not null and jsonb_typeof(p_dalil) <> 'object' then return jsonb_build_object('ok', false, 'code', 'DALIL_NOTOGRI'); end if;

  if p_kontragent_id is not null then
    select k.nom into v_knom from public.t2_kontragent k where k.id = p_kontragent_id and k.kompaniya_id = p_kompaniya_id;
    if v_knom is null then return jsonb_build_object('ok', false, 'code', 'KONTRAGENT_NOT_FOUND'); end if;
  end if;
  v_knom := nullif(left(btrim(coalesce(p_kontragent_nom, v_knom, '')), 300), '');
  if p_turi = 'subpudrat' and v_knom is null then return jsonb_build_object('ok', false, 'code', 'KONTRAGENT_REQUIRED'); end if;

  select q.id, q.obyekt_id into v_q from public.t2_qator q
  where q.id = p_qator_id and q.kompaniya_id = p_kompaniya_id for share;
  if v_q.id is null then return jsonb_build_object('ok', false, 'code', 'QATOR_NOT_FOUND'); end if;

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

  insert into public.t2_svod_yaxlit (kompaniya_id, obyekt_id, qator_id, svod_summa, qqs_stavka, dalil, sabab, actor_id, operation_id,
                                     turi, kontragent_id, kontragent_nom)
  values (p_kompaniya_id, v_q.obyekt_id, p_qator_id, null, null, coalesce(p_dalil, '{}'::jsonb), btrim(p_sabab), p_actor_id, p_operation_id,
          p_turi, p_kontragent_id, v_knom)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'versiya', 1);
exception when unique_violation then
  return jsonb_build_object('ok', false, 'code', 'ALLAQACHON_BELGILANGAN');
end $$;
revoke all on function public.t2_ustamasiz_belgila_v1(bigint, bigint, bigint, text, bigint, text, text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.t2_ustamasiz_belgila_v1(bigint, bigint, bigint, text, bigint, text, text, jsonb, uuid) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Obyekt koeffitsientlari — `t2_obyekt_nakrutka` view'dagi `effective` bilan AYNAN bir xil tartib.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public._t2_obyekt_nk_v1(p_obyekt_id bigint)
returns jsonb language plpgsql stable set search_path = public, pg_temp as $$
declare v_komp bigint; v_sh bigint; v_company jsonb; v_contract jsonb; v_podval_id bigint; v_podval jsonb;
begin
  select kompaniya_id into v_komp from public.t2_obyekt where id = p_obyekt_id;
  if v_komp is null then return null; end if;
  select b.shartnoma_id into v_sh
    from public.t2_shartnoma_bog b join public.t2_shartnoma s on s.id = b.shartnoma_id
   where b.obyekt_id = p_obyekt_id and b.holat = 'faol' and s.holat <> 'bekor'
   order by b.shartnoma_id limit 1;
  select jsonb_object_agg(n.koef_kod, to_jsonb(n.qiymat)) into v_company
    from public.t2_nakrutka_koef n where n.kompaniya_id = v_komp and n.shartnoma_id is null;
  if v_sh is not null then
    select jsonb_object_agg(n.koef_kod, to_jsonb(n.qiymat)) into v_contract
      from public.t2_nakrutka_koef n where n.kompaniya_id = v_komp and n.shartnoma_id = v_sh;
  end if;
  select p.id, public.t2_nakrutka_podval_smeta_nk_v1(p.qatorlar) into v_podval_id, v_podval
    from public.t2_nakrutka_podval p
   where p.obyekt_id = p_obyekt_id and p.kompaniya_id = v_komp and p.faol
   order by p.id desc limit 1;
  return jsonb_build_object(
    'nk', public.t2_nakrutka_default_v1() || coalesce(v_company, '{}'::jsonb) || coalesce(v_contract, '{}'::jsonb) || coalesce(v_podval, '{}'::jsonb),
    'nk_manba', case when v_podval is not null and v_podval <> '{}'::jsonb then 'smeta_podvali'
                     when v_contract is not null then 'shartnoma'
                     when v_company is not null then 'kompaniya'
                     else 'sukut' end,
    'podval_id', case when v_podval is not null and v_podval <> '{}'::jsonb then v_podval_id end,
    'shartnoma_id', v_sh);
end $$;
revoke all on function public._t2_obyekt_nk_v1(bigint) from public, anon, authenticated;
grant execute on function public._t2_obyekt_nk_v1(bigint) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Summa paketi — SOF hisob (agregat + koeffitsientlar → paket). Kaskad o'zgarmaydi.
--    Ustamasiz qism yo'q bo'lsa natija AYNAN t2_nakrutka_hisobla_v1 (view bilan bir xil).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public._t2_summa_paket_hisob_v1(p_agg jsonb, p_nk jsonb)
returns jsonb language plpgsql stable set search_path = public, pg_temp as $$
declare
  a jsonb := coalesce(p_agg, '{}'::jsonb);
  n numeric[];
  v_chel numeric := coalesce((a->>'chel')::numeric, 0);
  v_mash numeric := coalesce((a->>'mash')::numeric, 0);
  v_mat  numeric := coalesce((a->>'mat')::numeric, 0);
  v_ob   numeric := coalesce((a->>'ob')::numeric, 0);
  v_svod numeric := coalesce((a->>'svod')::numeric, 0);
  v_svod_qqssiz numeric := coalesce((a->>'svod_qqssiz')::numeric, (a->>'svod')::numeric, 0);
  v_sub  numeric := coalesce((a->>'subpudrat')::numeric, 0);
  v_ust  numeric := coalesce((a->>'ustamasiz')::numeric, 0);
  v_nom  numeric := coalesce((a->>'nomalum')::numeric, 0);
  v_qism numeric; h jsonb; k_nds numeric := coalesce((p_nk->>'НДС')::numeric, 0);
begin
  h := public.t2_nakrutka_hisobla_v1(jsonb_build_object('chel', v_chel, 'mash', v_mash, 'mat', v_mat, 'ob', v_ob,
         'mk', coalesce((a->>'mk')::numeric, 0), 'kab', coalesce((a->>'kab')::numeric, 0), 'bez', coalesce((a->>'bez')::numeric, 0)), p_nk);
  v_qism := v_svod_qqssiz + v_sub + v_ust + v_nom;
  if v_qism <> 0 then
    h := public.t2_nakrutka_yaxlit_qosh_v1(h, v_qism, 0, p_nk);
  end if;
  return jsonb_build_object(
    'qqs_bilan', round((h->>'vsego')::numeric, 2),
    'qqs', round((h->>'nds')::numeric, 2),
    'ustamali', round((h->>'itogo4')::numeric, 2),
    'ustamasiz', round(v_chel + v_mash + v_mat + v_ob + v_svod + v_sub + v_ust + v_nom, 2),
    'qqs_foiz', k_nds,
    'ustamasiz_qism', round(v_qism, 2),
    'kesim', jsonb_build_object('chel', round(v_chel, 2), 'mash', round(v_mash, 2), 'mat', round(v_mat, 2), 'ob', round(v_ob, 2),
      'subpudrat', round(v_sub, 2), 'svod', round(v_svod, 2), 'ustamasiz', round(v_ust, 2), 'nomalum', round(v_nom, 2)),
    'soat', jsonb_build_object('chel', round(coalesce((a->>'chel_soat')::numeric, 0), 2),
      'mash', round(coalesce((a->>'mash_soat')::numeric, 0), 2),
      'mashinist', round(coalesce((a->>'mashinist_soat')::numeric, 0), 2)),
    'subpudratchilar', coalesce(a->'subpudratchilar', '[]'::jsonb),
    'narxsiz_soni', coalesce((a->>'narxsiz_soni')::int, 0),
    'qator_soni', coalesce((a->>'qator_soni')::int, 0),
    'ustama', jsonb_build_object('tr_mat', h->'tr_mat', 'skl_mat', h->'skl_mat', 'tr_kab', h->'tr_kab', 'itogo1', h->'itogo1',
      'prochie', h->'prochie', 'itogo2', h->'itogo2', 'tr_ob', h->'tr_ob', 'zag_ob', h->'zag_ob', 'itogo3', h->'itogo3',
      'strax', h->'strax', 'risk', h->'risk', 'itogo4', h->'itogo4', 'nds', h->'nds', 'vsego', h->'vsego'))
    || case when a ? 'smetadan_oshgan' then jsonb_build_object('smetadan_oshgan', round((a->>'smetadan_oshgan')::numeric, 2),
                                                                'smetadan_oshgan_soni', (a->>'smetadan_oshgan_soni')::int)
            else '{}'::jsonb end;
end $$;
revoke all on function public._t2_summa_paket_hisob_v1(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public._t2_summa_paket_hisob_v1(jsonb, jsonb) to service_role;

-- Bir nechta paket yig'indisi (kompaniya / shartnoma kesimi). Bo'sh ro'yxat → null (noma'lum, 0 emas).
create or replace function public._t2_summa_paket_jam_v1(p jsonb)
returns jsonb language sql immutable set search_path = public, pg_temp as $$
  select case when count(*) = 0 then null else jsonb_build_object(
    'qqs_bilan', round(sum((x->>'qqs_bilan')::numeric), 2),
    'qqs', round(sum((x->>'qqs')::numeric), 2),
    'ustamali', round(sum((x->>'ustamali')::numeric), 2),
    'ustamasiz', round(sum((x->>'ustamasiz')::numeric), 2),
    'ustamasiz_qism', round(sum((x->>'ustamasiz_qism')::numeric), 2),
    'qqs_foiz', case when count(distinct x->>'qqs_foiz') = 1 then (min(x->>'qqs_foiz'))::numeric end,
    'kesim', jsonb_build_object(
      'chel', round(sum((x->'kesim'->>'chel')::numeric), 2), 'mash', round(sum((x->'kesim'->>'mash')::numeric), 2),
      'mat', round(sum((x->'kesim'->>'mat')::numeric), 2), 'ob', round(sum((x->'kesim'->>'ob')::numeric), 2),
      'subpudrat', round(sum((x->'kesim'->>'subpudrat')::numeric), 2), 'svod', round(sum((x->'kesim'->>'svod')::numeric), 2),
      'ustamasiz', round(sum((x->'kesim'->>'ustamasiz')::numeric), 2), 'nomalum', round(sum((x->'kesim'->>'nomalum')::numeric), 2)),
    'soat', jsonb_build_object('chel', round(sum((x->'soat'->>'chel')::numeric), 2), 'mash', round(sum((x->'soat'->>'mash')::numeric), 2),
      'mashinist', round(sum((x->'soat'->>'mashinist')::numeric), 2)),
    'subpudratchilar', coalesce((
      select jsonb_agg(jsonb_build_object('kontragent', s.k, 'summa', s.summa) order by s.summa desc)
      from (select e->>'kontragent' k, round(sum((e->>'summa')::numeric), 2) summa
              from jsonb_array_elements(coalesce(p, '[]'::jsonb)) y, jsonb_array_elements(coalesce(y->'subpudratchilar', '[]'::jsonb)) e
             group by 1) s), '[]'::jsonb),
    'narxsiz_soni', sum((x->>'narxsiz_soni')::int),
    'qator_soni', sum((x->>'qator_soni')::int),
    'ustama', (select jsonb_object_agg(k, v) from (
       select u.key k, round(sum(u.value::numeric), 2) v
         from jsonb_array_elements(coalesce(p, '[]'::jsonb)) y, jsonb_each_text(coalesce(y->'ustama', '{}'::jsonb)) u
        group by u.key) z),
    'obyekt_soni', count(*))
  end
  from jsonb_array_elements(coalesce(p, '[]'::jsonb)) x;
$$;
revoke all on function public._t2_summa_paket_jam_v1(jsonb) from public, anon, authenticated;
grant execute on function public._t2_summa_paket_jam_v1(jsonb) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Qator darajasidagi agregat (set-based, bitta o'tish). O'lchov:
--    smeta       — t2_qator.summa / hajm
--    fakt        — t2_qator_holat.fakt_summa / fakt_hajm (+ smetadan oshgan F2 xavfi)
--    f2          — tasdiqlangan F2 qatorlari (certified ustun), [p_dan; p_gacha] oy oralig'ida
--    f2_qoralama — qoralama F2 qatorlari
--    aktlar      — berilgan akt id'lari (holatidan qat'i nazar)
--    Faqat BARG qatorlar (bolasi yo'q) — yig'indi qatorlar ikki marta sanalmaydi.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public._t2_summa_agg_v1(
  p_obyekt_ids bigint[], p_olchov text, p_akt_ids bigint[] default null, p_dan date default null, p_gacha date default null)
returns table(obyekt_id bigint, agg jsonb)
language sql stable set search_path = public, pg_temp as $$
  with recursive
  bolim0 as (
    select y.id, y.obyekt_id, y.qator_id, y.turi, y.kontragent_nom, y.svod_summa, y.qqs_stavka
      from public.t2_svod_yaxlit y where y.faol and y.obyekt_id = any(p_obyekt_ids)
  ),
  yr as (
    select b.id as bolim_id, b.qator_id as id from bolim0 b
    union all
    select yr.bolim_id, q.id from public.t2_qator q join yr on q.ota_id = yr.id
  ),
  yb as (select distinct on (yr.id) yr.id, yr.bolim_id from yr order by yr.id, yr.bolim_id),
  ota as (select distinct q.ota_id as id from public.t2_qator q where q.obyekt_id = any(p_obyekt_ids) and q.ota_id is not null),
  miqdor as (
    select q.id as qator_id, q.summa as s, q.hajm as h, (q.summa is null and coalesce(q.hajm, 0) <> 0) as nom, null::numeric as osh
      from public.t2_qator q
     where p_olchov = 'smeta' and q.obyekt_id = any(p_obyekt_ids)
    union all
    select h.qator_id, h.fakt_summa, h.fakt_hajm, (h.fakt_summa is null and coalesce(h.fakt_hajm, 0) <> 0),
           case when coalesce(h.f2_hajm, 0) > coalesce(h.smeta_hajm, 0) and h.smeta_narx is not null
                then (h.f2_hajm - coalesce(h.smeta_hajm, 0)) * h.smeta_narx end
      from public.t2_qator_holat h
     where p_olchov = 'fakt' and h.obyekt_id = any(p_obyekt_ids)
    union all
    select aq.qator_id, coalesce(aq.certified_amount, aq.summa), coalesce(aq.certified_quantity, aq.hajm, 0),
           (coalesce(aq.certified_amount, aq.summa) is null and coalesce(aq.certified_quantity, aq.hajm, 0) <> 0), null::numeric
      from public.t2_akt a
      join public.t2_akt_qator aq on aq.akt_id = a.id
     where p_olchov in ('f2', 'f2_qoralama', 'aktlar')
       and a.obyekt_id = any(p_obyekt_ids)
       and case p_olchov
             when 'f2' then a.tur = 'f2' and a.holat = 'tasdiqlangan'
             when 'f2_qoralama' then a.tur = 'f2' and a.holat = 'qoralama'
             else a.id = any(coalesce(p_akt_ids, '{}'::bigint[])) end
       and (p_dan is null or a.oy >= p_dan)
       and (p_gacha is null or a.oy <= p_gacha)
  ),
  qm as (
    select m.qator_id, sum(m.s) as s, sum(m.h) as h, bool_or(m.nom) as nom_bor, sum(m.osh) as osh
      from miqdor m group by m.qator_id
  ),
  r as (
    select q.obyekt_id, q.id, q.tur, q.kat, coalesce(q.birlik, '') as birlik, qm.s, qm.h, qm.osh,
           (qm.nom_bor and q.tur not in ('rz', 'bl') and coalesce(q.nom, '') !~* 'ЗАТРАТЫ\s+ТРУДА\s+МАШИНИСТ') as narxsiz,
           b.id as bolim_id, b.turi, b.kontragent_nom
      from qm
      join public.t2_qator q on q.id = qm.qator_id and q.obyekt_id = any(p_obyekt_ids)
      left join ota on ota.id = q.id
      left join yb on yb.id = q.id
      left join bolim0 b on b.id = yb.bolim_id
     where ota.id is null
  ),
  bs as (select r.bolim_id, sum(r.s) as s from r where r.bolim_id is not null group by r.bolim_id),
  svq as (
    select b.obyekt_id,
           sum(case when p_olchov = 'smeta' and b.svod_summa is not null then round(b.svod_summa / (1 + b.qqs_stavka / 100), 2)
                    else coalesce(bs.s, 0) end) as qqssiz
      from bolim0 b left join bs on bs.bolim_id = b.id
     where b.turi = 'svod'
     group by b.obyekt_id
  ),
  sub as (
    select x.obyekt_id, jsonb_agg(jsonb_build_object('kontragent', x.k, 'summa', x.summa) order by x.summa desc) as royxat
      from (select r.obyekt_id, coalesce(r.kontragent_nom, '—') as k, round(sum(r.s), 2) as summa
              from r where r.turi = 'subpudrat' group by 1, 2) x
     group by x.obyekt_id
  ),
  ag as (
    select r.obyekt_id,
      coalesce(sum(r.s) filter (where r.bolim_id is null and r.kat = 'ЧЕЛ'), 0) as chel,
      coalesce(sum(r.s) filter (where r.bolim_id is null and r.kat = 'МАШ'), 0) as mash,
      coalesce(sum(r.s) filter (where r.bolim_id is null and r.kat in ('МАТ','М/К','КАБ','БЕЗСКЛАД')), 0) as mat,
      coalesce(sum(r.s) filter (where r.bolim_id is null and r.kat = 'ОБ'), 0) as ob,
      coalesce(sum(r.s) filter (where r.bolim_id is null and r.kat = 'М/К'), 0) as mk,
      coalesce(sum(r.s) filter (where r.bolim_id is null and r.kat = 'КАБ'), 0) as kab,
      coalesce(sum(r.s) filter (where r.bolim_id is null and r.kat = 'БЕЗСКЛАД'), 0) as bez,
      coalesce(sum(r.s) filter (where r.bolim_id is null and (r.kat is null or r.kat not in ('ЧЕЛ','МАШ','МАТ','М/К','КАБ','БЕЗСКЛАД','ОБ'))), 0) as nomalum,
      coalesce(sum(r.s) filter (where r.turi = 'svod'), 0) as svod,
      coalesce(sum(r.s) filter (where r.turi = 'subpudrat'), 0) as subpudrat,
      coalesce(sum(r.s) filter (where r.turi = 'ustamasiz'), 0) as ustamasiz,
      coalesce(sum(r.h) filter (where r.bolim_id is null and r.kat = 'ЧЕЛ' and r.birlik ~ '^(ЧЕЛ|чел|Чел)'), 0) as chel_soat,
      coalesce(sum(r.h) filter (where r.bolim_id is null and r.kat = 'МАШ' and r.birlik ~ '^(МАШ|маш|Маш)'), 0) as mash_soat,
      coalesce(sum(r.h) filter (where r.bolim_id is null and r.kat = 'МАШ' and r.birlik ~ '^(ЧЕЛ|чел|Чел)'), 0) as mashinist_soat,
      count(*) filter (where r.narxsiz) as narxsiz_soni,
      count(*) filter (where r.s is not null and r.s <> 0) as qator_soni,
      sum(r.osh) filter (where r.osh > 0) as osh,
      count(*) filter (where r.osh > 0) as osh_soni
    from r group by r.obyekt_id
  )
  select o.id,
    jsonb_build_object('chel', coalesce(ag.chel, 0), 'mash', coalesce(ag.mash, 0), 'mat', coalesce(ag.mat, 0), 'ob', coalesce(ag.ob, 0),
      'mk', coalesce(ag.mk, 0), 'kab', coalesce(ag.kab, 0), 'bez', coalesce(ag.bez, 0), 'nomalum', coalesce(ag.nomalum, 0),
      'svod', coalesce(ag.svod, 0), 'svod_qqssiz', coalesce(svq.qqssiz, 0), 'subpudrat', coalesce(ag.subpudrat, 0), 'ustamasiz', coalesce(ag.ustamasiz, 0),
      'chel_soat', coalesce(ag.chel_soat, 0), 'mash_soat', coalesce(ag.mash_soat, 0), 'mashinist_soat', coalesce(ag.mashinist_soat, 0),
      'narxsiz_soni', coalesce(ag.narxsiz_soni, 0), 'qator_soni', coalesce(ag.qator_soni, 0),
      'subpudratchilar', coalesce(sub.royxat, '[]'::jsonb))
    || case when p_olchov = 'fakt' then jsonb_build_object('smetadan_oshgan', coalesce(ag.osh, 0), 'smetadan_oshgan_soni', coalesce(ag.osh_soni, 0))
            else '{}'::jsonb end
  from unnest(p_obyekt_ids) as o(id)
  left join ag on ag.obyekt_id = o.id
  left join svq on svq.obyekt_id = o.id
  left join sub on sub.obyekt_id = o.id;
$$;
revoke all on function public._t2_summa_agg_v1(bigint[], text, bigint[], date, date) from public, anon, authenticated;
grant execute on function public._t2_summa_agg_v1(bigint[], text, bigint[], date, date) to service_role;

-- Obyektlar bo'yicha paketlar (agregat + obyekt koeffitsientlari).
create or replace function public._t2_summa_paket_v1(
  p_obyekt_ids bigint[], p_olchov text, p_akt_ids bigint[] default null, p_dan date default null, p_gacha date default null)
returns table(obyekt_id bigint, paket jsonb)
language sql stable set search_path = public, pg_temp as $$
  select a.obyekt_id,
         public._t2_summa_paket_hisob_v1(a.agg, n.x->'nk')
           || jsonb_build_object('nk_manba', n.x->>'nk_manba', 'podval_id', n.x->'podval_id', 'olchov', p_olchov)
    from public._t2_summa_agg_v1(p_obyekt_ids, p_olchov, p_akt_ids, p_dan, p_gacha) a
    cross join lateral (select public._t2_obyekt_nk_v1(a.obyekt_id) as x) n
   where n.x is not null;
$$;
revoke all on function public._t2_summa_paket_v1(bigint[], text, bigint[], date, date) from public, anon, authenticated;
grant execute on function public._t2_summa_paket_v1(bigint[], text, bigint[], date, date) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. F2 ustamali — SMETA PODVALI kaskadi (eski: shartnoma/kompaniya koef'i). Kalitlar saqlanadi:
--    pryamye, katsiz, narxsiz_qator, ustamali, podval{...}; yangi: paket (to'liq summa paketi).
--    p_shartnoma_id endi ishlatilmaydi (koeffitsient obyekt podvalidan) — imzo chaqiruvchilar uchun saqlanadi.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public._t2_f2_ustamali(p_kompaniya_id bigint, p_shartnoma_id bigint, p_akt_ids bigint[])
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_ob bigint[]; v_p jsonb; v_list jsonb;
begin
  select array_agg(distinct a.obyekt_id) into v_ob
    from public.t2_akt a where a.id = any(coalesce(p_akt_ids, '{}'::bigint[])) and a.kompaniya_id = p_kompaniya_id and a.obyekt_id is not null;
  if v_ob is null then
    v_p := public._t2_summa_paket_hisob_v1('{}'::jsonb, public.t2_nakrutka_default_v1());
  else
    select jsonb_agg(p.paket) into v_list from public._t2_summa_paket_v1(v_ob, 'aktlar', p_akt_ids) p;
    v_p := case when jsonb_array_length(coalesce(v_list, '[]'::jsonb)) = 1 then v_list->0 else public._t2_summa_paket_jam_v1(v_list) end;
  end if;
  return jsonb_build_object(
    'pryamye', v_p->'ustamasiz',
    'katsiz', v_p->'kesim'->'nomalum',
    'narxsiz_qator', v_p->'narxsiz_soni',
    'ustamali', v_p->'ustamali',
    'podval', v_p->'ustama',
    'paket', v_p);
end $$;
revoke all on function public._t2_f2_ustamali(bigint, bigint, bigint[]) from public, anon, authenticated;
grant execute on function public._t2_f2_ustamali(bigint, bigint, bigint[]) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. RAHBAR PANELI v1. p_davr_dan / p_davr_gacha — «Bajarildi», «To'landi», xarajat, rentabellik va pul oqimi davri
--    (null — hammasi). Portfel, debitor, obyektlar matritsasi — jami (davrsiz) holat. p_obyekt_id — bitta obyekt kesimi.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.t2_rahbar_panel_v1(
  p_kompaniya_id bigint, p_actor_id bigint,
  p_davr_dan date default null, p_davr_gacha date default null, p_obyekt_id bigint default null)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $fn$
declare
  v_ob bigint[]; v_dan date; v_gacha date; v_davr_bor boolean;
  v_sm jsonb; v_fk jsonb; v_f2 jsonb; v_f2d jsonb; v_f2q jsonb;            -- obyekt_id(text) → paket
  j_sm jsonb; j_fk jsonb; j_f2 jsonb; j_f2d jsonb; j_f2q jsonb;            -- jami paketlar
  v_aktlar jsonb; v_tolov_soni int; v_tolov numeric; v_tolov_d numeric; v_xar_soni int; v_xar_d numeric;
  v_shartnoma jsonb; v_sh_jami numeric; v_sh_soni int;
  v_deb jsonb; v_kred jsonb; v_rent jsonb; v_oylar jsonb; v_prog jsonb;
  v_obyektlar jsonb; v_signal jsonb; v_diqqat jsonb; v_tasdiq jsonb; v_reestr numeric; v_reestr_soni int;
  v_trend_dan date; v_trend_gacha date;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'financial.read');

  if p_davr_dan is not null and p_davr_gacha is not null and p_davr_dan > p_davr_gacha then
    return jsonb_build_object('ok', false, 'code', 'DAVR_NOTOGRI');
  end if;
  v_dan := date_trunc('month', p_davr_dan)::date;
  v_gacha := p_davr_gacha;
  v_davr_bor := p_davr_dan is not null or p_davr_gacha is not null;

  if p_obyekt_id is not null then
    if not exists (select 1 from public.t2_obyekt where id = p_obyekt_id and kompaniya_id = p_kompaniya_id) then
      return jsonb_build_object('ok', false, 'code', 'OBYEKT_SCOPE_MISMATCH');
    end if;
    v_ob := array[p_obyekt_id];
  else
    select coalesce(array_agg(id order by id), '{}') into v_ob from public.t2_obyekt where kompaniya_id = p_kompaniya_id;
  end if;

  -- Summa paketlari (obyekt bo'yicha) — yagona hisob yo'li.
  select jsonb_object_agg(p.obyekt_id::text, p.paket) into v_sm  from public._t2_summa_paket_v1(v_ob, 'smeta') p;
  select jsonb_object_agg(p.obyekt_id::text, p.paket) into v_fk  from public._t2_summa_paket_v1(v_ob, 'fakt') p;
  select jsonb_object_agg(p.obyekt_id::text, p.paket) into v_f2  from public._t2_summa_paket_v1(v_ob, 'f2') p;
  select jsonb_object_agg(p.obyekt_id::text, p.paket) into v_f2q from public._t2_summa_paket_v1(v_ob, 'f2_qoralama') p;
  if v_davr_bor then
    select jsonb_object_agg(p.obyekt_id::text, p.paket) into v_f2d from public._t2_summa_paket_v1(v_ob, 'f2', null, v_dan, v_gacha) p;
  else
    v_f2d := v_f2;
  end if;
  select public._t2_summa_paket_jam_v1(coalesce(jsonb_agg(value), '[]'::jsonb)) into j_sm  from jsonb_each(coalesce(v_sm, '{}'::jsonb));
  select public._t2_summa_paket_jam_v1(coalesce(jsonb_agg(value), '[]'::jsonb)) into j_fk  from jsonb_each(coalesce(v_fk, '{}'::jsonb));
  select public._t2_summa_paket_jam_v1(coalesce(jsonb_agg(value), '[]'::jsonb)) into j_f2  from jsonb_each(coalesce(v_f2, '{}'::jsonb));
  select public._t2_summa_paket_jam_v1(coalesce(jsonb_agg(value), '[]'::jsonb)) into j_f2d from jsonb_each(coalesce(v_f2d, '{}'::jsonb));
  select public._t2_summa_paket_jam_v1(coalesce(jsonb_agg(value), '[]'::jsonb)) into j_f2q from jsonb_each(coalesce(v_f2q, '{}'::jsonb));

  -- F2 aktlari: obyekt paketining ulushi (akt прямые / obyekt прямые) — yig'indisi obyekt paketiga AYNAN teng.
  with ak as (
    select a.id, a.obyekt_id, a.oy, a.sana, a.holat, a.forma3_id, a.raqam, a.kim, a.lifecycle_status,
           coalesce(a.lifecycle_submitted_at, a.yaratildi) as qachondan,
           coalesce(sum(coalesce(aq.certified_amount, aq.summa)), 0) as pr
      from public.t2_akt a
      left join public.t2_akt_qator aq on aq.akt_id = a.id
     where a.kompaniya_id = p_kompaniya_id and a.tur = 'f2' and a.holat in ('tasdiqlangan', 'qoralama') and a.obyekt_id = any(v_ob)
     group by a.id
  ), ul as (
    select ak.*, sum(ak.pr) over (partition by ak.obyekt_id, ak.holat) as jami_pr,
           count(*) over (partition by ak.obyekt_id, ak.holat) as soni
      from ak
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', ul.id, 'obyekt_id', ul.obyekt_id, 'oy', ul.oy, 'sana', ul.sana, 'holat', ul.holat, 'forma3_id', ul.forma3_id,
           'raqam', ul.raqam, 'kim', ul.kim, 'bosqich', ul.lifecycle_status, 'qachondan', ul.qachondan,
           'qqs_bilan', round(case when ul.jami_pr <> 0 then ul.pr / ul.jami_pr else 1.0 / ul.soni end
                              * ((case when ul.holat = 'tasdiqlangan' then v_f2 else v_f2q end)->(ul.obyekt_id::text)->>'qqs_bilan')::numeric, 2),
           'ustamali', round(case when ul.jami_pr <> 0 then ul.pr / ul.jami_pr else 1.0 / ul.soni end
                              * ((case when ul.holat = 'tasdiqlangan' then v_f2 else v_f2q end)->(ul.obyekt_id::text)->>'ustamali')::numeric, 2))
         order by ul.oy, ul.id), '[]'::jsonb)
    into v_aktlar
    from ul;

  -- To'lovlar (t2_tolov, 1C sverka ham shu yerga yozadi). Yozuv yo'q → null (kiritilmagan).
  select count(*), sum(case when t.tur = 'qaytarim' then -abs(t.summa) else t.summa end)
    into v_tolov_soni, v_tolov
    from public.t2_tolov t
   where t.kompaniya_id = p_kompaniya_id and t.holat <> 'bekor'
     and (p_obyekt_id is null or t.obyekt_id = p_obyekt_id);
  if v_tolov_soni = 0 then v_tolov := null; end if;
  select sum(case when t.tur = 'qaytarim' then -abs(t.summa) else t.summa end) into v_tolov_d
    from public.t2_tolov t
   where t.kompaniya_id = p_kompaniya_id and t.holat <> 'bekor'
     and (p_obyekt_id is null or t.obyekt_id = p_obyekt_id)
     and (v_dan is null or t.sana >= v_dan) and (v_gacha is null or t.sana <= v_gacha);
  if v_tolov_soni = 0 then v_tolov_d := null; elsif v_tolov_d is null then v_tolov_d := 0; end if;

  -- Xarajat (tannarx manbai). Yozuv yo'q → null.
  select count(*) into v_xar_soni from public.t2_xarajat x
   where x.kompaniya_id = p_kompaniya_id and coalesce(x.holat, 'faol') <> 'bekor' and (p_obyekt_id is null or x.obyekt_id = p_obyekt_id);
  select sum(x.summa) into v_xar_d from public.t2_xarajat x
   where x.kompaniya_id = p_kompaniya_id and coalesce(x.holat, 'faol') <> 'bekor' and (p_obyekt_id is null or x.obyekt_id = p_obyekt_id)
     and (v_dan is null or x.sana >= v_dan) and (v_gacha is null or x.sana <= v_gacha);
  if v_xar_soni = 0 then v_xar_d := null; elsif v_xar_d is null then v_xar_d := 0; end if;

  -- Shartnomalar (asosiy, bekor emas): oxirgi faol DS summasi, aks holda shartnoma summasi (QQS bilan).
  with sh as (
    select s.id, s.raqam, s.nom,
           coalesce((select d.jami_nds_bilan from public.t2_shartnoma_ds d where d.shartnoma_id = s.id and d.holat = 'faol'
                      order by d.sana desc, d.id desc limit 1), s.jami_nds_bilan) as qqs_bilan,
           array(select b.obyekt_id from public.t2_shartnoma_bog b where b.shartnoma_id = s.id and b.holat = 'faol' order by b.obyekt_id) as obyektlar
      from public.t2_shartnoma s
     where s.kompaniya_id = p_kompaniya_id and s.holat <> 'bekor' and coalesce(s.asosiy, true)
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', sh.id, 'raqam', sh.raqam, 'nom', sh.nom, 'qqs_bilan', sh.qqs_bilan,
           'obyektlar', to_jsonb(sh.obyektlar),
           'f2_qqs_bilan', (select round(sum((v_f2->(o::text)->>'qqs_bilan')::numeric), 2) from unnest(sh.obyektlar) o),
           'tolangan', case when v_tolov_soni > 0 then (select coalesce(sum(case when t.tur = 'qaytarim' then -abs(t.summa) else t.summa end), 0)
                                                        from public.t2_tolov t where t.shartnoma_id = sh.id and t.holat <> 'bekor') end)
           order by sh.id), '[]'::jsonb),
         sum(sh.qqs_bilan), count(sh.qqs_bilan)
    into v_shartnoma, v_sh_jami, v_sh_soni
    from sh
   where p_obyekt_id is null or p_obyekt_id = any(sh.obyektlar);

  -- Debitor: tasdiqlangan F2 (QQS bilan) − to'lov; yosh — FIFO (to'lov eng eski F2 ni yopadi).
  if v_tolov_soni > 0 then
    with f as (
      select (e->>'id')::bigint as id, coalesce((e->>'sana')::date, ((e->>'oy')::date + interval '1 month' - interval '1 day')::date) as sana,
             (e->>'qqs_bilan')::numeric as s
        from jsonb_array_elements(v_aktlar) e where e->>'holat' = 'tasdiqlangan'
    ), c as (
      select f.*, sum(f.s) over (order by f.sana, f.id) as kum from f
    ), q as (
      select c.sana, greatest(0, least(c.s, c.kum - greatest(v_tolov, 0))) as qoldiq from c
    )
    select jsonb_build_object(
             'qiymat', round(coalesce((j_f2->>'qqs_bilan')::numeric, 0) - v_tolov, 2),
             'hujjatlangan', j_f2->'qqs_bilan', 'tolangan', round(v_tolov, 2),
             'yosh', jsonb_build_object(
               'k0_30',  round(coalesce(sum(q.qoldiq) filter (where current_date - q.sana <= 30), 0), 2),
               'k30_60', round(coalesce(sum(q.qoldiq) filter (where current_date - q.sana > 30 and current_date - q.sana <= 60), 0), 2),
               'k60',    round(coalesce(sum(q.qoldiq) filter (where current_date - q.sana > 60), 0), 2)),
             'asos', 'f2_tasdiqlangan', 'manbalar_yoq', '[]'::jsonb)
      into v_deb from q;
  else
    v_deb := jsonb_build_object('qiymat', null, 'hujjatlangan', j_f2->'qqs_bilan', 'tolangan', null, 'yosh', null,
                                'asos', 'f2_tasdiqlangan', 'manbalar_yoq', jsonb_build_array('tolov'));
  end if;

  -- Kreditor: yetkazuvchi / subpudrat hujjatlari tizimda hali yo'q → null (uydirma yo'q).
  v_kred := jsonb_build_object('qiymat', null, 'manbalar_yoq', jsonb_build_array('yetkazuvchi_hujjatlari', 'sklad_kirim', '1c_prixod', 'subpudrat_aktlari'));

  -- Rentabellik: daromad = tasdiqlangan F2 (QQS siz, ustamali) davrda; tannarx = haqiqiy xarajat.
  v_rent := jsonb_build_object(
    'daromad', j_f2d->'ustamali',
    'tannarx', round(v_xar_d, 2),
    'marja', round((j_f2d->>'ustamali')::numeric - v_xar_d, 2),
    'foiz', case when v_xar_d is not null and coalesce((j_f2d->>'ustamali')::numeric, 0) <> 0
                 then round(((j_f2d->>'ustamali')::numeric - v_xar_d) / (j_f2d->>'ustamali')::numeric * 100, 1) end,
    'manbalar_yoq', case when v_xar_soni = 0 then jsonb_build_array('xarajat', 'sklad_kirim_narxi', '1c_prixod', 'ish_haqi') else '[]'::jsonb end);

  -- Pul oqimi / trend: oylar (davr bo'lmasa — oxirgi 12 oy). Ma'lumot manbai yo'q → null (kulrang «kiritilmagan»).
  v_trend_gacha := date_trunc('month', coalesce(v_gacha, current_date))::date;
  v_trend_dan := coalesce(v_dan, (v_trend_gacha - interval '11 months')::date);
  select coalesce(jsonb_agg(jsonb_build_object(
           'oy', to_char(m.oy, 'YYYY-MM'),
           'bajarildi', (select round(coalesce(sum((e->>'qqs_bilan')::numeric), 0), 2) from jsonb_array_elements(v_aktlar) e
                          where e->>'holat' = 'tasdiqlangan' and date_trunc('month', (e->>'oy')::date) = m.oy),
           'tolov', case when v_tolov_soni > 0 then (select round(coalesce(sum(case when t.tur = 'qaytarim' then -abs(t.summa) else t.summa end), 0), 2)
                          from public.t2_tolov t where t.kompaniya_id = p_kompaniya_id and t.holat <> 'bekor'
                           and (p_obyekt_id is null or t.obyekt_id = p_obyekt_id) and date_trunc('month', t.sana) = m.oy) end,
           'xarajat', case when v_xar_soni > 0 then (select round(coalesce(sum(x.summa), 0), 2)
                          from public.t2_xarajat x where x.kompaniya_id = p_kompaniya_id and coalesce(x.holat, 'faol') <> 'bekor'
                           and (p_obyekt_id is null or x.obyekt_id = p_obyekt_id) and date_trunc('month', x.sana) = m.oy) end)
         order by m.oy), '[]'::jsonb)
    into v_oylar
    from generate_series(v_trend_dan::timestamp, v_trend_gacha::timestamp, interval '1 month') as g(oy0)
    cross join lateral (select date_trunc('month', g.oy0)::date as oy) m;

  -- Keyingi 90 kun prognozi: qoralama F2 → kutilayotgan to'lov; tasdiqlangan, lekin to'lanmagan (debitor).
  v_prog := jsonb_build_object(
    'kun', 90,
    'qoralama_f2', j_f2q->'qqs_bilan',
    'tolanmagan_f2', v_deb->'qiymat',
    'kutilayotgan', case when v_deb->>'qiymat' is not null
                         then round(coalesce((j_f2q->>'qqs_bilan')::numeric, 0) + greatest((v_deb->>'qiymat')::numeric, 0), 2) end,
    'majburiyatlar', null,
    'manbalar_yoq', case when v_tolov_soni = 0 then jsonb_build_array('tolov', 'tolov_majburiyatlari') else jsonb_build_array('tolov_majburiyatlari') end);

  -- Signallar — guruhlangan (xom 9 ming qator emas).
  select coalesce(jsonb_agg(jsonb_build_object('signal_type', g.signal_type, 'soni', g.soni, 'kritik', g.kritik,
           'obyektlar', g.obyektlar) order by g.kritik desc, g.soni desc), '[]'::jsonb)
    into v_signal
    from (
      select s.signal_type, count(*) as soni, count(*) filter (where s.severity in ('error', 'high', 'critical')) as kritik,
             (select coalesce(jsonb_agg(jsonb_build_object('obyekt_id', t.oid, 'soni', t.n) order by t.n desc), '[]'::jsonb)
                from (select s2.entity_id::bigint as oid, count(*) as n from public.t2_signal s2
                       where s2.kompaniya_id = p_kompaniya_id and s2.state = 'open' and s2.signal_type = s.signal_type
                         and s2.entity_type = 'obyekt' and s2.entity_id ~ '^\d+$'
                         and (p_obyekt_id is null or s2.entity_id = p_obyekt_id::text)
                       group by 1 order by 2 desc limit 5) t) as obyektlar
        from public.t2_signal s
       where s.kompaniya_id = p_kompaniya_id and s.state = 'open'
         and (p_obyekt_id is null or (s.entity_type = 'obyekt' and s.entity_id = p_obyekt_id::text))
       group by s.signal_type
    ) g;

  -- Obyektlar matritsasi.
  with o as (
    select o.id, o.nom, o.holat, o.loyiha_id, l.nom as loyiha_nom
      from public.t2_obyekt o left join public.t2_loyiha l on l.id = o.loyiha_id
     where o.id = any(v_ob)
  ), sh as (
    select distinct on (b.obyekt_id) b.obyekt_id, s.id, s.raqam,
           coalesce((select d.jami_nds_bilan from public.t2_shartnoma_ds d where d.shartnoma_id = s.id and d.holat = 'faol'
                      order by d.sana desc, d.id desc limit 1), s.jami_nds_bilan) as qqs_bilan,
           (select count(*) from public.t2_shartnoma_bog b2 where b2.shartnoma_id = s.id and b2.holat = 'faol') as obyekt_soni
      from public.t2_shartnoma_bog b join public.t2_shartnoma s on s.id = b.shartnoma_id
     where b.obyekt_id = any(v_ob) and b.holat = 'faol' and s.holat <> 'bekor'
     order by b.obyekt_id, s.asosiy desc nulls last, s.id
  ), tl as (
    select t.obyekt_id, sum(case when t.tur = 'qaytarim' then -abs(t.summa) else t.summa end) as summa
      from public.t2_tolov t where t.kompaniya_id = p_kompaniya_id and t.holat <> 'bekor' and t.obyekt_id = any(v_ob)
     group by t.obyekt_id
  ), sg as (
    select s.entity_id::bigint as obyekt_id, count(*) as soni, count(*) filter (where s.severity in ('error', 'high', 'critical')) as kritik,
           (array_agg(s.signal_type order by s.severity desc, s.detected_at desc))[1] as eng
      from public.t2_signal s
     where s.kompaniya_id = p_kompaniya_id and s.state = 'open' and s.entity_type = 'obyekt' and s.entity_id ~ '^\d+$'
     group by 1
  ), f3 as (
    select f.obyekt_id, sum(f.sotuv_summa) as sotuv, count(*) as soni
      from public.t2_forma3 f where f.kompaniya_id = p_kompaniya_id and f.holat <> 'bekor' and f.obyekt_id = any(v_ob)
     group by f.obyekt_id
  ), x as (
    select o.*, sh.id as sh_id, sh.raqam as sh_raqam, sh.qqs_bilan as sh_qqs, sh.obyekt_soni as sh_obyekt_soni,
           v_sm->(o.id::text) as sm, v_fk->(o.id::text) as fk, v_f2->(o.id::text) as f2, v_f2q->(o.id::text) as f2q,
           case when v_tolov_soni > 0 then coalesce(tl.summa, 0) end as tolangan,
           sg.soni as sig_soni, sg.kritik as sig_kritik, sg.eng as sig_eng, f3.sotuv as f3_sotuv, f3.soni as f3_soni
      from o left join sh on sh.obyekt_id = o.id left join tl on tl.obyekt_id = o.id
      left join sg on sg.obyekt_id = o.id left join f3 on f3.obyekt_id = o.id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'obyekt_id', x.id, 'nom', x.nom, 'holat', x.holat, 'loyiha_id', x.loyiha_id, 'loyiha_nom', x.loyiha_nom,
           'shartnoma', case when x.sh_id is not null then jsonb_build_object('id', x.sh_id, 'raqam', x.sh_raqam, 'qqs_bilan', x.sh_qqs,
                              'umumiy', x.sh_obyekt_soni > 1) end,
           'smeta', x.sm, 'fakt', x.fk, 'f2', x.f2,
           'f2_qoralama', jsonb_build_object('qqs_bilan', x.f2q->'qqs_bilan', 'ustamali', x.f2q->'ustamali',
                              'soni', (select count(*) from jsonb_array_elements(v_aktlar) e where (e->>'obyekt_id')::bigint = x.id and e->>'holat' = 'qoralama')),
           'f3', case when x.f3_soni is not null then jsonb_build_object('sotuv', x.f3_sotuv, 'soni', x.f3_soni) end,
           'tolangan', round(x.tolangan, 2),
           'tolangan_foiz', case when x.tolangan is not null and coalesce((x.f2->>'qqs_bilan')::numeric, 0) <> 0
                                 then round(x.tolangan / (x.f2->>'qqs_bilan')::numeric * 100, 1) end,
           'qarz', case when x.tolangan is not null then round(coalesce((x.f2->>'qqs_bilan')::numeric, 0) - x.tolangan, 2) end,
           'marja_foiz', null,
           'bajarilish', jsonb_build_object(
             'fakt', case when coalesce((x.sm->>'ustamasiz')::numeric, 0) <> 0 then round((x.fk->>'ustamasiz')::numeric / (x.sm->>'ustamasiz')::numeric * 100, 1) end,
             'f2', case when coalesce((x.sm->>'ustamasiz')::numeric, 0) <> 0 then round((x.f2->>'ustamasiz')::numeric / (x.sm->>'ustamasiz')::numeric * 100, 1) end,
             'f3', case when x.f3_soni is not null and coalesce((x.sm->>'qqs_bilan')::numeric, 0) <> 0 then round(x.f3_sotuv / (x.sm->>'qqs_bilan')::numeric * 100, 1) end),
           'signal', jsonb_build_object('soni', coalesce(x.sig_soni, 0), 'kritik', coalesce(x.sig_kritik, 0), 'eng_kop', x.sig_eng))
         order by x.loyiha_nom nulls last, x.nom), '[]'::jsonb)
    into v_obyektlar
    from x;

  -- Tizim ↔ reestr farqi (reestr MANBA EMAS — faqat signal), kompaniya kesimida.
  if p_obyekt_id is null then
    select count(*), sum(r.qqs_bilan) into v_reestr_soni, v_reestr
      from public.t2_f2_reestr_jami r where r.kompaniya_id = p_kompaniya_id and coalesce(r.holat, 'faol') <> 'bekor';
  end if;

  -- §4 Diqqat talab qiladi — pul ta'siri bo'yicha top-10.
  with ob as (
    select (e->>'obyekt_id')::bigint as id, e->>'nom' as nom, e from jsonb_array_elements(v_obyektlar) e
  ), d as (
    -- Fakt > F2: bajarilgan, lekin topshirilmagan ish (olinmagan pul).
    select 'fakt_topshirilmagan'::text as kod, ob.id as obyekt_id, ob.nom,
           round((ob.e->'fakt'->>'qqs_bilan')::numeric - coalesce((ob.e->'f2'->>'qqs_bilan')::numeric, 0), 2) as summa, null::bigint as soni
      from ob where (ob.e->'fakt'->>'qqs_bilan')::numeric - coalesce((ob.e->'f2'->>'qqs_bilan')::numeric, 0) > 1
    union all
    -- F2 > fakt: faktsiz topshirilgan (xavf).
    select 'f2_faktdan_oshgan', ob.id, ob.nom,
           round((ob.e->'f2'->>'qqs_bilan')::numeric - coalesce((ob.e->'fakt'->>'qqs_bilan')::numeric, 0), 2), null
      from ob where (ob.e->'f2'->>'ustamasiz')::numeric - coalesce((ob.e->'fakt'->>'ustamasiz')::numeric, 0) > 1
    union all
    -- Smetadan oshgan hajm (F2 hajmi > smeta hajmi), прямые bahoda.
    select 'smetadan_oshgan', ob.id, ob.nom, round((ob.e->'fakt'->>'smetadan_oshgan')::numeric, 2), (ob.e->'fakt'->>'smetadan_oshgan_soni')::bigint
      from ob where coalesce((ob.e->'fakt'->>'smetadan_oshgan')::numeric, 0) > 0
    union all
    -- Tasdiqlangan F2, lekin F3 chiqarilmagan.
    select 'f3_chiqarilmagan', f.oid, (select ob.nom from ob where ob.id = f.oid), round(sum(f.s), 2), count(*)
      from (select (e->>'obyekt_id')::bigint as oid, (e->>'qqs_bilan')::numeric as s
              from jsonb_array_elements(v_aktlar) e where e->>'holat' = 'tasdiqlangan' and e->>'forma3_id' is null) f
     group by f.oid
    union all
    -- Shartnoma limitiga yaqin (≥ 90%) yoki oshgan — DS kerak bo'lishi mumkin.
    select 'shartnoma_limit', null, s->>'raqam', round((s->>'qqs_bilan')::numeric - (s->>'f2_qqs_bilan')::numeric, 2), null
      from jsonb_array_elements(v_shartnoma) s
     where coalesce((s->>'qqs_bilan')::numeric, 0) > 0 and (s->>'f2_qqs_bilan')::numeric >= 0.9 * (s->>'qqs_bilan')::numeric
    union all
    -- Muddati o'tgan to'lov (60 kundan ortiq to'lanmagan F2).
    select 'tolov_kechikkan', null, null, round((v_deb->'yosh'->>'k60')::numeric, 2), null
     where coalesce((v_deb->'yosh'->>'k60')::numeric, 0) > 0
    union all
    -- Tizim ↔ reestr farqi.
    select 'reestr_farq', null, null, round(abs(v_reestr - coalesce((j_f2->>'qqs_bilan')::numeric, 0)), 2), v_reestr_soni::bigint
     where v_reestr_soni > 0 and abs(v_reestr - coalesce((j_f2->>'qqs_bilan')::numeric, 0)) > 1
    union all
    -- Narxsiz qatorlar (summasi noma'lum — oxirida).
    select 'narxsiz', null, null, null, coalesce((j_sm->>'narxsiz_soni')::bigint, 0) + coalesce((j_f2->>'narxsiz_soni')::bigint, 0)
     where coalesce((j_sm->>'narxsiz_soni')::bigint, 0) + coalesce((j_f2->>'narxsiz_soni')::bigint, 0) > 0
    union all
    -- Sklad manfiy qoldig'i.
    select 'sklad_manfiy', k.obyekt_id, (select ob.nom from ob where ob.id = k.obyekt_id), null, count(*)
      from public.t2_sklad_qoldiq k where k.kompaniya_id = p_kompaniya_id and k.qoldiq < 0 and (p_obyekt_id is null or k.obyekt_id = p_obyekt_id)
     group by k.obyekt_id
  )
  select coalesce(jsonb_agg(jsonb_build_object('kod', t.kod, 'obyekt_id', t.obyekt_id, 'nom', t.nom, 'summa_tasir', t.summa, 'soni', t.soni)
           order by t.summa desc nulls last, t.soni desc nulls last), '[]'::jsonb)
    into v_diqqat
    from (select * from d order by d.summa desc nulls last, d.soni desc nulls last limit 10) t;

  -- §5 Tasdiq kutmoqda: qoralama F2 + yuborilgan zayavkalar (eng eski birinchi).
  select coalesce(jsonb_agg(z.j order by z.qachondan), '[]'::jsonb) into v_tasdiq
    from (
      select (e->>'qachondan')::timestamptz as qachondan,
             jsonb_build_object('tur', 'f2', 'id', (e->>'id')::bigint, 'obyekt_id', (e->>'obyekt_id')::bigint, 'nom', e->>'raqam',
               'bosqich', e->>'bosqich', 'summa', (e->>'qqs_bilan')::numeric, 'qachondan', e->>'qachondan', 'kim', e->>'kim') as j
        from jsonb_array_elements(v_aktlar) e where e->>'holat' = 'qoralama'
      union all
      select r.created_at, jsonb_build_object('tur', 'zayavka', 'id', r.id, 'obyekt_id', r.obyekt_id, 'nom', r.item_text,
               'bosqich', r.status, 'summa', null, 'qachondan', r.created_at, 'kim', r.requested_by)
        from public.t2_erp_taminot r
       where r.kompaniya_id = p_kompaniya_id and r.status = 'submitted' and r.obyekt_id = any(v_ob)
      order by 1 limit 50
    ) z;

  return jsonb_build_object(
    'ok', true, 'generated_at', now(), 'versiya', 1,
    'davr', jsonb_build_object('dan', v_dan, 'gacha', v_gacha),
    'qamrov', jsonb_build_object('kompaniya_id', p_kompaniya_id, 'obyekt_id', p_obyekt_id, 'obyekt_soni', coalesce(array_length(v_ob, 1), 0)),
    'kartalar', jsonb_build_object(
      'portfel', jsonb_build_object('shartnoma_qqs_bilan', round(v_sh_jami, 2), 'shartnoma_soni', v_sh_soni, 'smeta', j_sm),
      'bajarildi', jsonb_build_object('davr', j_f2d, 'jami', j_f2,
        'akt_soni', (select count(*) from jsonb_array_elements(v_aktlar) e where e->>'holat' = 'tasdiqlangan'
                       and (v_dan is null or (e->>'oy')::date >= v_dan) and (v_gacha is null or (e->>'oy')::date <= v_gacha)),
        'foiz_smeta', case when coalesce((j_sm->>'qqs_bilan')::numeric, 0) <> 0 then round((j_f2->>'qqs_bilan')::numeric / (j_sm->>'qqs_bilan')::numeric * 100, 1) end,
        'foiz_shartnoma', case when coalesce(v_sh_jami, 0) <> 0 then round((j_f2->>'qqs_bilan')::numeric / v_sh_jami * 100, 1) end,
        'reestr', case when v_reestr_soni > 0 then jsonb_build_object('qqs_bilan', round(v_reestr, 2), 'soni', v_reestr_soni,
                         'farq', round(v_reestr - coalesce((j_f2->>'qqs_bilan')::numeric, 0), 2)) end),
      'tolandi', jsonb_build_object('davr', round(v_tolov_d, 2), 'jami', round(v_tolov, 2), 'yozuv_soni', v_tolov_soni,
        'manbalar_yoq', case when v_tolov_soni = 0 then jsonb_build_array('tolov') else '[]'::jsonb end),
      'debitor', v_deb,
      'kreditor', v_kred,
      'rentabellik', v_rent),
    'fakt', j_fk,
    'f2_qoralama', j_f2q,
    'pul_oqimi', jsonb_build_object('oylar', v_oylar, 'prognoz', v_prog),
    'obyektlar', v_obyektlar,
    'diqqat', v_diqqat,
    'tasdiq_kutmoqda', v_tasdiq,
    'signal_guruh', v_signal,
    'shartnomalar', v_shartnoma);
end $fn$;
revoke all on function public.t2_rahbar_panel_v1(bigint, bigint, date, date, bigint) from public, anon, authenticated;
grant execute on function public.t2_rahbar_panel_v1(bigint, bigint, date, date, bigint) to service_role;

commit;
