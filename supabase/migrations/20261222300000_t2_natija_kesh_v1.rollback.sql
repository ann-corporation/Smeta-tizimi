-- Rollback: 20261222300000_t2_natija_kesh_v1. Ochiq funksiyalar, _t2_kesh_hisobla_v1 va t2_obyekt_kesh_yangila_v1 ni oldingi prod ta'rifiga qaytaradi,
-- triggerlar va kesh jadvalini o'chiradi.
begin;

CREATE OR REPLACE FUNCTION public.t2_smeta_ozgarish_qatlam_v1(p_obyekt_id bigint, p_actor_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_k bigint; v_asl jsonb; v_joriy jsonb; v_res jsonb; v_lim constant int := 500;
begin
  select o.kompaniya_id into v_k from public.t2_obyekt o where o.id = p_obyekt_id;
  if v_k is null then return jsonb_build_object('ok', false, 'code', 'OBYEKT_NOT_FOUND'); end if;
  perform public.t2_actor_kompaniya_azo_tekshir(v_k, p_actor_id);
  perform public.t2_require_permission_v2(v_k, p_actor_id, 'smeta.read');

  select p.paket into v_asl from public._t2_summa_paket_v1(array[p_obyekt_id], 'smeta') p;
  select p.paket into v_joriy from public._t2_summa_paket_v1(array[p_obyekt_id], 'smeta_joriy') p;

  with recursive tq(root_id, id) as (
    select y.qator_id, y.qator_id from public.t2_svod_yaxlit y where y.faol and y.smetadan_tashqari and y.obyekt_id = p_obyekt_id
    union all
    select tq.root_id, c.id from public.t2_qator c join tq on c.ota_id = tq.id where c.obyekt_id = p_obyekt_id
  ),
  l0 as materialized (select * from public._t2_smeta_qatlam_qator_v1(array[p_obyekt_id])),
  l as materialized (select x.* from l0 x where not exists (select 1 from tq where tq.id = x.qator_id)),
  q as materialized (
    select q.id, q.ota_id, q.tur, q.kod, q.nom, q.birlik, q.hajm, q.summa, q.change_type, q.change_id, q.replaces_line_id,
           q.almashtirish_hajm, q.yaratildi
      from public.t2_qator q where q.obyekt_id = p_obyekt_id and q.versiya_holat = 'faol'
  ),
  -- Asos: o'zgarish yozuvi (sabab, holat, dalil hujjat, kim, qachon) + birinchi F2/fakt akti (qator yoki uning barglari).
  asos as (
    select q.id,
           jsonb_strip_nulls(jsonb_build_object(
             'change_id', so.id, 'tur', so.tur, 'sabab', so.sabab, 'holat', so.holat, 'izoh', so.evidence_izoh,
             'hujjat_id', so.evidence_hujjat_id, 'hujjat_nom', oh.nom,
             'kim', coalesce(f.ism, f.login, so.kim), 'qachon', coalesce(so.yaratildi, q.yaratildi), 'tasdiqlandi', so.tasdiqlandi)) as j,
           (nullif(btrim(coalesce(so.sabab, '')), '') is not null or so.evidence_hujjat_id is not null) as asosli
      from q
      left join public.t2_smeta_ozgarish so on so.id = q.change_id
      left join public.t2_obyekt_hujjat oh on oh.id = so.evidence_hujjat_id
      left join public.t2_foydalanuvchi f on f.id = so.actor_id
     where q.change_type is not null or q.change_id is not null
  ),
  akt1 as (
    select x.gid, (array_agg(jsonb_build_object('akt_id', a.id, 'tur', a.tur, 'raqam', a.raqam, 'oy', a.oy) order by a.oy, a.id))[1] as akt
      from (select coalesce(l.zamena_id, l.ildiz_id) as gid, l.qator_id from l where l.sinf <> 'asl'
            union select coalesce(l.zamena_id, l.ildiz_id), coalesce(l.zamena_id, l.ildiz_id) from l where l.sinf <> 'asl') x
      join public.t2_akt_qator aq on aq.qator_id = x.qator_id
      join public.t2_akt a on a.id = aq.akt_id and a.holat not in ('bekor', 'rad')
     group by x.gid
  ),
  qg as (
    select l.ildiz_id as id, count(*) as barg_soni, count(*) filter (where l.summa is null) as narxsiz_soni,
           sum(l.summa) as summa, jsonb_agg(jsonb_build_object('kat', l.kat, 'summa', l.summa)) filter (where l.summa is not null) as kesim
      from l where l.sinf = 'qoshimcha' group by l.ildiz_id
  ),
  qoshimcha as (
    select g.*, q.tur, q.kod, q.nom, q.birlik, q.hajm, q.ota_id, ot.nom as ota_nom, a.j as asos, coalesce(a.asosli, false) or ak.akt is not null as asosli, ak.akt
      from qg g join q on q.id = g.id
      left join q ot on ot.id = q.ota_id
      left join asos a on a.id = g.id
      left join akt1 ak on ak.gid = g.id
  ),
  zg as (
    select l.zamena_id as id, count(*) as barg_soni, count(*) filter (where l.summa is null) as narxsiz_soni, count(l.summa) as narxli, count(*) filter (where l.summa is not null and lq.summa is null) as f2_narx_soni,
           sum(l.summa) as summa, jsonb_agg(jsonb_build_object('kat', l.kat, 'summa', l.summa)) filter (where l.summa is not null) as kesim
      from l left join q lq on lq.id = l.qator_id where l.sinf = 'zamena' group by l.zamena_id
  ),
  -- Asl qator bo'yicha almashtirilgan summa (barglar) — zamenalar orasida almashtirilgan hajm ulushida taqsimlanadi.
  alm as (
    select l.almashtirilgan_asl_id as asl_id, sum(l.almashtirilgan_summa) as summa,
           jsonb_agg(jsonb_build_object('kat', l.kat, 'summa', -l.almashtirilgan_summa)) filter (where l.almashtirilgan_summa is not null and l.almashtirilgan_summa <> 0) as kesim
      from l where l.almashtirilgan_asl_id is not null group by l.almashtirilgan_asl_id
  ),
  zamena as (
    select g.*, z.tur, z.kod, z.nom, z.birlik, z.hajm, z.almashtirish_hajm, z.replaces_line_id as asl_id,
           o.kod as asl_kod, o.nom as asl_nom, o.birlik as asl_birlik, o.hajm as asl_hajm, o.summa as asl_summa,
           case when g.narxli > 0 and al.summa is not null then al.summa * coalesce(sh.ulush, 1) end as almashtirilgan_summa,
           case when g.narxli > 0 then g.summa - coalesce(al.summa * coalesce(sh.ulush, 1), 0) end as farq,
           (g.narxli > 0 and o.id is not null and al.asl_id is null) as almashtirish_noaniq,
           a.j as asos, coalesce(a.asosli, false) or ak.akt is not null as asosli, ak.akt
      from zg g join q z on z.id = g.id
      left join q o on o.id = z.replaces_line_id
      left join alm al on al.asl_id = z.replaces_line_id
      -- Bir aslni bir necha narxli zamena almashtirsa: almashtirilgan summa ular orasida zamena summasi ulushida.
      left join lateral (
        select case when sum(g2.summa) > 0 then g.summa / sum(g2.summa) end as ulush
          from zg g2 join q z2 on z2.id = g2.id
         where z2.replaces_line_id = z.replaces_line_id and g2.narxli > 0) sh on g.narxli > 0
      left join asos a on a.id = g.id
      left join akt1 ak on ak.gid = g.id
  ),
  bajx as (select b.* from public.t2_qator_bajarilmadi b join q on q.id = b.qator_id where b.obyekt_id = p_obyekt_id and b.holat = 'faol'),
  -- Bajarilmadi qatori → o'zi va avlodlari (bargdagi bajarilmadi summasi shu yozuvga tegishli).
  bd(bid, id, d) as (
    select b.id, b.qator_id, 0 from bajx b
    union all
    select bd.bid, c.id, bd.d + 1 from bd join q c on c.ota_id = bd.id where bd.d < 60
  ),
  bs as (select bd.bid, sum(l.bajarilmadi_summa) as summa from bd join l on l.qator_id = bd.id where l.bajarilmadi_summa is not null group by bd.bid),
  baj as (
    select b.id, b.qator_id, b.sabab_kod, b.sabab_izoh, b.hujjat_id, b.sana, b.hajm as bajarilmagan_hajm, b.zamena_qator_id, b.yaratildi,
           coalesce(f.ism, f.login) as kim, q.tur, q.kod, q.nom, q.birlik, q.hajm as smeta_hajm, bs.summa
      from bajx b
      join q on q.id = b.qator_id
      left join bs on bs.bid = b.id
      left join public.t2_foydalanuvchi f on f.id = b.actor_id
  ),
  jam as (
    select coalesce(sum(l.summa) filter (where l.sinf = 'asl'), 0) as asl,
           count(*) filter (where l.sinf = 'asl' and l.summa is null) as asl_narxsiz,
           coalesce(sum(l.summa) filter (where l.sinf = 'qoshimcha'), 0) as qoshimcha,
           coalesce(sum(l.summa) filter (where l.sinf = 'zamena'), 0) as zamena,
           coalesce(sum(l.almashtirilgan_summa), 0) as almashtirilgan,
           coalesce(sum(l.bajarilmadi_summa), 0) as bajarilmadi,
           coalesce(sum(l.joriy_summa), 0) as joriy,
           jsonb_agg(jsonb_build_object('kat', l.kat, 'summa', -l.bajarilmadi_summa)) filter (where coalesce(l.bajarilmadi_summa, 0) <> 0) as baj_kesim
      from l
  )
  select jsonb_build_object(
    'ok', true, 'obyekt_id', p_obyekt_id,
    'smetadan_tashqari', coalesce(v_joriy->'smetadan_tashqari', '{}'::jsonb) || jsonb_build_object('qatorlar', coalesce((
      select jsonb_agg(jsonb_build_object('qator_id', z.root_id, 'nom', zq.nom, 'summa', z.s) order by z.s desc nulls last, z.root_id)
        from (select tq.root_id, sum(x.summa) as s from tq join l0 x on x.qator_id = tq.id group by tq.root_id) z
        join public.t2_qator zq on zq.id = z.root_id), '[]'::jsonb)),
    'asl', jsonb_build_object('paket', v_asl, 'ustamasiz', round(j.asl, 2), 'narxsiz_soni', j.asl_narxsiz),
    'joriy', jsonb_build_object('paket', v_joriy, 'ustamasiz', round(j.joriy, 2)),
    'ozgarish', jsonb_build_object(
      'ustamasiz', round(j.joriy - j.asl, 2),
      'ustamali', case when v_asl is not null and v_joriy is not null then round((v_joriy->>'ustamali')::numeric - (v_asl->>'ustamali')::numeric, 2) end,
      'qqs_bilan', case when v_asl is not null and v_joriy is not null then round((v_joriy->>'qqs_bilan')::numeric - (v_asl->>'qqs_bilan')::numeric, 2) end,
      'qoshimcha', round(j.qoshimcha, 2),
      'zamena_summa', round(j.zamena, 2),
      'almashtirilgan_summa', round(j.almashtirilgan, 2),
      'zamena_farq', round(j.zamena - j.almashtirilgan, 2),
      'bajarilmadi', round(-j.bajarilmadi, 2),
      'narx_farqi', null,
      'narx_farqi_izoh', 'Asl qator narxi o''zgarishi alohida yozilmaydi (asl smeta CONST); narx farqi faqat zamena orqali',
      -- Avvalgi (xato) ko'rinish: asl + qo'shimcha + zamena (almashtirilgan qism ikki marta).
      'avvalgi_jami', round(j.asl + j.qoshimcha + j.zamena, 2),
      'ikki_marta_sanalgan', round(j.almashtirilgan, 2),
      'invariant_ok', abs((j.asl + j.qoshimcha + j.zamena - j.almashtirilgan - j.bajarilmadi) - j.joriy) < 0.01,
      'kesim', jsonb_build_object(
        'qoshimcha', coalesce((select jsonb_agg(e) from qoshimcha x, jsonb_array_elements(coalesce(x.kesim, '[]'::jsonb)) e), '[]'::jsonb),
        'zamena', coalesce((select jsonb_agg(e) from zamena x, jsonb_array_elements(coalesce(x.kesim, '[]'::jsonb)) e), '[]'::jsonb)
                  || coalesce((select jsonb_agg(e) from alm x, jsonb_array_elements(coalesce(x.kesim, '[]'::jsonb)) e), '[]'::jsonb),
        'bajarilmadi', coalesce(j.baj_kesim, '[]'::jsonb))),
    'qoshimcha', jsonb_build_object(
      'soni', (select count(*) from qoshimcha), 'summa', round(j.qoshimcha, 2),
      'narxsiz_soni', (select coalesce(sum(narxsiz_soni), 0) from qoshimcha),
      'asossiz_soni', (select count(*) from qoshimcha where not asosli),
      'qisqartirildi', (select count(*) from qoshimcha) > v_lim,
      'qatorlar', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
          'qator_id', x.id, 'tur', x.tur, 'kod', x.kod, 'nom', x.nom, 'birlik', x.birlik, 'hajm', x.hajm,
          'ota_id', x.ota_id, 'ota_nom', x.ota_nom, 'summa', round(x.summa, 2), 'barg_soni', x.barg_soni, 'narxsiz_soni', x.narxsiz_soni,
          'asos', x.asos, 'asosli', x.asosli, 'akt', x.akt)) order by x.summa desc nulls last, x.id)
        from (select * from qoshimcha order by summa desc nulls last, id limit v_lim) x), '[]'::jsonb)),
    'zamena', jsonb_build_object(
      'soni', (select count(*) from zamena), 'zamena_summa', round(j.zamena, 2), 'almashtirilgan_summa', round(j.almashtirilgan, 2),
      'farq', round(j.zamena - j.almashtirilgan, 2),
      'narxsiz_soni', (select count(*) from zamena where narxli = 0), 'f2_narx_soni', (select coalesce(sum(f2_narx_soni), 0) from zamena), 'narxsiz_barg_soni', (select coalesce(sum(narxsiz_soni), 0) from zamena),
      'noaniq_soni', (select count(*) from zamena where almashtirish_noaniq),
      'asossiz_soni', (select count(*) from zamena where not asosli),
      'qisqartirildi', (select count(*) from zamena) > v_lim,
      'qatorlar', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
          'qator_id', x.id, 'tur', x.tur, 'kod', x.kod, 'nom', x.nom, 'birlik', x.birlik, 'hajm', x.hajm, 'almashtirish_hajm', x.almashtirish_hajm,
          'summa', round(x.summa, 2), 'narxsiz', x.narxli = 0, 'barg_soni', x.barg_soni, 'narx_manba', case when x.f2_narx_soni > 0 then 'f2_narx' end, 'f2_narx_soni', x.f2_narx_soni, 'narxsiz_barg_soni', x.narxsiz_soni,
          'asl_id', x.asl_id, 'asl_kod', x.asl_kod, 'asl_nom', x.asl_nom, 'asl_birlik', x.asl_birlik, 'asl_hajm', x.asl_hajm, 'asl_summa', round(x.asl_summa, 2),
          'almashtirilgan_summa', round(x.almashtirilgan_summa, 2), 'farq', round(x.farq, 2), 'almashtirish_noaniq', x.almashtirish_noaniq,
          'asos', x.asos, 'asosli', x.asosli, 'akt', x.akt)) order by abs(coalesce(x.farq, 0)) desc, x.id)
        from (select * from zamena order by abs(coalesce(farq, 0)) desc, id limit v_lim) x), '[]'::jsonb)),
    'bajarilmadi', jsonb_build_object(
      'soni', (select count(*) from baj), 'summa', round(-j.bajarilmadi, 2),
      'narxsiz_soni', (select count(*) from baj where summa is null),
      'qatorlar', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
          'id', x.id, 'qator_id', x.qator_id, 'tur', x.tur, 'kod', x.kod, 'nom', x.nom, 'birlik', x.birlik, 'smeta_hajm', x.smeta_hajm,
          'bajarilmagan_hajm', x.bajarilmagan_hajm, 'summa', round(-x.summa, 2),
          'asos', jsonb_strip_nulls(jsonb_build_object('sabab', x.sabab_kod, 'izoh', x.sabab_izoh, 'hujjat_id', x.hujjat_id,
                   'zamena_qator_id', x.zamena_qator_id, 'kim', x.kim, 'qachon', x.yaratildi, 'sana', x.sana)))) order by x.summa desc nulls last, x.id)
        from (select * from baj order by summa desc nulls last, id limit v_lim) x), '[]'::jsonb)))
  into v_res
  from jam j;
  return v_res;
end $function$;

CREATE OR REPLACE FUNCTION public.t2_price_control_v1(p_obyekt_id bigint, p_actor_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_komp bigint; v_rows jsonb;
begin
  select kompaniya_id into v_komp from public.t2_obyekt where id = p_obyekt_id;
  if v_komp is null then return jsonb_build_object('ok', false, 'code', 'OBYEKT_NOT_FOUND'); end if;
  perform public.t2_actor_kompaniya_azo_tekshir(v_komp, p_actor_id);

  with lines as (
    select aq.qator_id, a.holat as akt_holat,
           aq.certified_unit_price, aq.certified_quantity,
           aq.baseline_narx as reference_price,
           aq.basis_approved_price_snapshot as basis_price
    from public.t2_akt_qator aq
    join public.t2_akt a on a.id = aq.akt_id
    where a.obyekt_id = p_obyekt_id and a.tur = 'f2'
      and aq.provenance_status = 'source_certified'
      and aq.certified_unit_price is not null
  ),
  per_line as (
    select l.qator_id,
           max(l.reference_price) filter (where l.akt_holat = 'tasdiqlangan') as reference_price_approved,
           max(l.certified_unit_price) filter (where l.akt_holat = 'tasdiqlangan') as certified_price_approved,
           max(l.basis_price) filter (where l.akt_holat = 'tasdiqlangan') as basis_price_approved,
           sum(greatest(coalesce(l.reference_price, l.certified_unit_price) - l.certified_unit_price, 0) * l.certified_quantity)
             filter (where l.akt_holat = 'tasdiqlangan' and l.certified_unit_price < coalesce(l.reference_price, l.certified_unit_price))
             as frozen_amount,
           sum(greatest(coalesce(l.reference_price, l.certified_unit_price) - l.certified_unit_price, 0) * l.certified_quantity)
             filter (where l.akt_holat <> 'tasdiqlangan' and l.certified_unit_price < coalesce(l.reference_price, l.certified_unit_price))
             as at_risk_amount
    from lines l
    group by l.qator_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'qator_id', h.id, 'kod', h.kod, 'nom', h.nom, 'birlik', h.birlik,
      'reference_unit_price', pl.reference_price_approved,
      'certified_unit_price', pl.certified_price_approved,
      'price_delta', case when pl.certified_price_approved is not null and pl.reference_price_approved is not null
                           then pl.certified_price_approved - pl.reference_price_approved end,
      'frozen_amount', coalesce(pl.frozen_amount, 0),
      'at_risk_amount', coalesce(pl.at_risk_amount, 0),
      'basis_approved_price', pl.basis_price_approved,
      'price_state',
        case
          when pl.certified_price_approved is null or pl.reference_price_approved is null then 'ABOVE_REFERENCE_MISSING_BASIS'
          when pl.certified_price_approved < pl.reference_price_approved then 'BELOW_REFERENCE'
          when pl.certified_price_approved = pl.reference_price_approved then 'NORMAL'
          when pl.basis_price_approved is null then 'ABOVE_REFERENCE_MISSING_BASIS'
          when pl.certified_price_approved <= pl.basis_price_approved then 'ABOVE_REFERENCE_JUSTIFIED'
          else 'ABOVE_APPROVED_BASIS'
        end
    ) order by h.kod)
  , '[]'::jsonb)
  into v_rows
  from public.t2_qator_holat h
  join per_line pl on pl.qator_id = h.id
  where h.obyekt_id = p_obyekt_id;

  return jsonb_build_object('ok', true, 'qatorlar', v_rows);
end
$function$;

CREATE OR REPLACE FUNCTION public._t2_kesh_hisobla_v1(p_obyekt_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_komp bigint; v_t0 timestamptz := clock_timestamp(); v_oy jsonb := '{}'::jsonb; m date;
  v_bugun date := (now() at time zone 'Asia/Tashkent')::date;
begin
  select o.kompaniya_id into v_komp from public.t2_obyekt o where o.id = p_obyekt_id;
  if v_komp is null then
    delete from public.t2_obyekt_kesh where obyekt_id = p_obyekt_id;
    delete from public.t2_obyekt_jami_kesh where obyekt_id = p_obyekt_id;
    return;
  end if;
  foreach m in array array[date_trunc('month', v_bugun)::date, (date_trunc('month', v_bugun) - interval '1 month')::date] loop
    v_oy := v_oy || jsonb_build_object(to_char(m, 'YYYY-MM'), public._t2_kesh_oy_paket_v1(p_obyekt_id, m));
  end loop;
  insert into public.t2_obyekt_kesh as k (obyekt_id, kompaniya_id, smeta, smeta_joriy, fakt, f2, f2_qoralama, f2_oy, hisoblandi, hisob_ms)
  values (p_obyekt_id, v_komp,
          (select p.paket from public._t2_summa_paket_v1(array[p_obyekt_id], 'smeta') p),
          public._t2_kesh_joriy_v1(p_obyekt_id),
          (select p.paket from public._t2_summa_paket_v1(array[p_obyekt_id], 'fakt') p),
          (select p.paket from public._t2_summa_paket_v1(array[p_obyekt_id], 'f2') p),
          (select p.paket from public._t2_summa_paket_v1(array[p_obyekt_id], 'f2_qoralama') p),
          v_oy, now(), (extract(epoch from clock_timestamp() - v_t0) * 1000)::int)
  on conflict (obyekt_id) do update
    set kompaniya_id = excluded.kompaniya_id, smeta = excluded.smeta, smeta_joriy = excluded.smeta_joriy, fakt = excluded.fakt, f2 = excluded.f2,
        f2_qoralama = excluded.f2_qoralama, f2_oy = excluded.f2_oy, hisoblandi = excluded.hisoblandi, hisob_ms = excluded.hisob_ms;
  perform public._t2_obyekt_jami_kesh_hisobla_v1(p_obyekt_id);
end $function$;

CREATE OR REPLACE FUNCTION public.t2_obyekt_kesh_yangila_v1(p_byudjet_s integer DEFAULT 40, p_rejim text DEFAULT 'iflos'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  r record; v_t0 timestamptz := clock_timestamp(); v_soni int := 0; v_qoldi int := 0;
  v_kalit text := to_char((now() at time zone 'Asia/Tashkent')::date, 'YYYY-MM');
begin
  if not pg_try_advisory_xact_lock(hashtext('t2_obyekt_kesh_yangila_v1')) then
    return jsonb_build_object('ok', true, 'o_tkazildi', 'band');
  end if;
  for r in
    select o.id as obyekt_id, i.versiya
      from public.t2_obyekt o
      left join public.t2_obyekt_kesh_iflos i on i.obyekt_id = o.id
      left join public.t2_obyekt_kesh k on k.obyekt_id = o.id
     where p_rejim = 'hammasi' or i.obyekt_id is not null or k.obyekt_id is null or (k.smeta is not null and k.smeta_joriy is null) or jsonb_typeof(k.f2_oy->v_kalit) is distinct from 'object'
     order by i.vaqt nulls last, o.id
  loop
    if extract(epoch from clock_timestamp() - v_t0) >= p_byudjet_s then v_qoldi := v_qoldi + 1; continue; end if;
    perform public._t2_kesh_hisobla_v1(r.obyekt_id);
    if r.versiya is not null then
      delete from public.t2_obyekt_kesh_iflos where obyekt_id = r.obyekt_id and versiya = r.versiya;
    end if;
    v_soni := v_soni + 1;
  end loop;
  return jsonb_build_object('ok', true, 'hisoblandi', v_soni, 'qoldi', v_qoldi);
end $function$;

drop trigger if exists t2_kesh_t2_qator_bajarilmadi_ins on public.t2_qator_bajarilmadi;
drop trigger if exists t2_kesh_t2_qator_bajarilmadi_del on public.t2_qator_bajarilmadi;
drop trigger if exists t2_kesh_t2_qator_bajarilmadi_upd on public.t2_qator_bajarilmadi;
drop trigger if exists t2_kesh_t2_smeta_ozgarish_ins on public.t2_smeta_ozgarish;
drop trigger if exists t2_kesh_t2_smeta_ozgarish_del on public.t2_smeta_ozgarish;
drop trigger if exists t2_kesh_t2_smeta_ozgarish_upd on public.t2_smeta_ozgarish;
drop trigger if exists t2_kesh_t2_obyekt_hujjat_nom on public.t2_obyekt_hujjat;
drop trigger if exists t2_kesh_t2_foydalanuvchi_ism on public.t2_foydalanuvchi;
drop function if exists public._t2_kesh_t2_qator_bajarilmadi_ins();
drop function if exists public._t2_kesh_t2_qator_bajarilmadi_del();
drop function if exists public._t2_kesh_t2_qator_bajarilmadi_upd();
drop function if exists public._t2_kesh_t2_smeta_ozgarish_ins();
drop function if exists public._t2_kesh_t2_smeta_ozgarish_del();
drop function if exists public._t2_kesh_t2_smeta_ozgarish_upd();
drop function if exists public._t2_kesh_t2_obyekt_hujjat_nom();
drop function if exists public._t2_kesh_t2_foydalanuvchi_ism();
drop function if exists public._t2_obyekt_natija_kesh_hisobla_v1(bigint);
drop function if exists public._t2_smeta_ozgarish_qatlam_hisob_v1(bigint, jsonb, jsonb);
drop function if exists public._t2_price_control_hisob_v1(bigint);
drop table if exists public.t2_obyekt_natija_kesh;

commit;
